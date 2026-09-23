/**
 * The entities roster — Layer 1 of the entity manager (work order,
 * castors-first-steps 92; maintainer: "an entity manager where we can
 * summon them, give them own time or put them to sleep or stop/resume,
 * and simply ask 'what have you been up to'").
 *
 * A card grid, one card per life: state + own-time as pushed-state
 * toggles (the same one-question-one-toggle pattern as the focus view),
 * and a "what have you been up to?" summary composed from the card
 * compositor (interests, capabilities, sleep rhythm, key-moment count).
 * Clicking a card opens Layer 2 (the graph view). Layer 3
 * (correspondence between entities) gets room in the layout but no build
 * yet — the entity-visit stamp has not landed.
 *
 * Scale honesty (adversarial review, commons 66): per-card /card reads
 * are fine at operator scale (a handful of homes) and WRONG at N=100 —
 * the batched roster endpoint is filed with the gateway lane; this grid
 * fetches cards lazily with bounded concurrency until it exists.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { AfPhaseRadio } from "@abstractframework/ui-kit";

import { CreateEntityForm } from "./create_entity_form";
import { activeRuledPhase, deriveLifeState } from "./entity_state";
import {
  fetchEntityState,
  gatewayReadHeaders,
  getLoopStatus,
  getServerLifeState,
  listEntities,
  parseLoopRefusal,
  postEntityState,
  startLoop,
  stopLoop,
  type EntityStateInfo,
  type EntitySummary,
  type LoopStatus,
  type ServerLifeState,
} from "./stream_source";

export interface EntitiesIndexProps {
  baseUrl: string;
  token: string | null;
  onOpen(slug: string): void;
  /** Open the gateway sign-in modal — the index PROMPTS when the gateway
   * answers 401/403 instead of rendering an empty page (maintainer
   * incident 2026-07-09: "empty space" = silent-unauthenticated). */
  onConnect?(): void;
  /** Fleet view + meet console entries — peer roster-level actions, so
   * they live in the roster's own head row (IA review: the old detached
   * bar floated over a narrower column and aligned with nothing). */
  onWatchAll?(): void;
  onConvene?(): void;
  /** The memory blueprint — the cognition machine as its own page
   * (laurent dm#130: reachable from the roster, same map for all). */
  onBlueprint?(): void;
}

/** The slice of the card compositor the roster reads (kept minimal —
 * the full shape belongs to the identity card drawer). */
interface RosterCard {
  age_days?: number;
  mind_substrate?: { provider?: string; model?: string };
  discoveries?: unknown[] | { interests?: unknown[] };
  capabilities?: { tools?: unknown[]; workspace_files?: number };
  sleep_stats?: { sleeps?: number; self_elected?: number; operator?: number; sleep_share?: number };
  key_moments?: { total?: number };
  moments?: Array<Record<string, unknown>>;
  likes_dislikes?: { likes?: Array<{ target?: string }> };
}

interface EntityRow {
  summary: EntitySummary;
  state: EntityStateInfo | null;
  loop: LoopStatus | null;
  /** Gateway-computed composite phase; null on older gateways (#FALLBACK
   * to client derivation). */
  serverLife: ServerLifeState | null;
  card: RosterCard | null;
}

function gistOf(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    return String(o["gist"] ?? o["title"] ?? o["statement"] ?? o["text"] ?? o["digest"] ?? "");
  }
  return "";
}

function interestsOf(card: RosterCard | null): string[] {
  if (!card) return [];
  const d = card.discoveries;
  const list = Array.isArray(d) ? d : (d?.interests ?? []);
  return list
    .map(gistOf)
    .filter(Boolean)
    .slice(0, 3);
}

export function EntitiesIndex({ baseUrl, token, onOpen, onConnect, onWatchAll, onConvene, onBlueprint }: EntitiesIndexProps): React.ReactElement {
  const [rows, setRows] = useState<EntityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authNeeded, setAuthNeeded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const cardCacheRef = useRef<Map<string, RosterCard>>(new Map());

  const fetchCard = useCallback(
    async (slug: string): Promise<RosterCard | null> => {
      const cached = cardCacheRef.current.get(slug);
      if (cached) return cached;
      try {
        const res = await fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(slug)}/card`, {
          headers: gatewayReadHeaders({ Accept: "application/json" }),
        });
        if (!res.ok) return null;
        const card = (await res.json()) as RosterCard;
        cardCacheRef.current.set(slug, card);
        return card;
      } catch {
        return null;
      }
    },
    [baseUrl],
  );

  const refresh = useCallback(
    (opts: { cards?: boolean } = {}) => {
      listEntities(baseUrl)
        .then(async (entities) => {
          // State + loop are cheap per row; cards are the heavy compositor —
          // fetched SEQUENTIALLY (bounded concurrency 1) and cached, so a
          // grid of N homes never storms the gateway (scale review P0).
          const enriched: EntityRow[] = await Promise.all(
            entities.map(async (summary) => {
              const [state, loop, serverLife] = await Promise.all([
                fetchEntityState(baseUrl, summary.slug).catch(() => null),
                getLoopStatus(baseUrl, summary.slug).catch(() => null),
                // The gateway-computed composite phase (commons seq 96);
                // null on older gateways -> client-derived fallback.
                getServerLifeState(baseUrl, summary.slug).catch(() => null),
              ]);
              return { summary, state, loop, serverLife, card: cardCacheRef.current.get(summary.slug) ?? null };
            }),
          );
          setRows(enriched);
          setError(null);
          setAuthNeeded(false);
          if (opts.cards !== false) {
            for (const row of enriched) {
              if (cardCacheRef.current.has(row.summary.slug)) continue;
              const card = await fetchCard(row.summary.slug);
              if (card) {
                setRows((prev) =>
                  prev ? prev.map((r) => (r.summary.slug === row.summary.slug ? { ...r, card } : r)) : prev,
                );
              }
            }
          }
        })
        .catch((e: Error & { status?: number }) => {
          // 401/403 = the gateway wants a sign-in: prompt, never a blank
          // page (the maintainer's "empty space", 2026-07-09 06:1x).
          if (e.status === 401 || e.status === 403) {
            setAuthNeeded(true);
            setError(null);
          } else {
            setError(`Could not list entities: ${e.message}`);
          }
        });
    },
    [baseUrl, fetchCard],
  );

  useEffect(() => {
    refresh();
    const interval = window.setInterval(() => refresh({ cards: false }), 20000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const rowFor = (slug: string) => rows?.find((r) => r.summary.slug === slug) ?? null;

  const toggleOwnTime = useCallback(
    async (slug: string) => {
      if (busySlug) return;
      setBusySlug(slug);
      setNote(null);
      try {
        // STATE WAVE (laurent 12:32): the click decides on FRESH reads
        // fetched now, never the row's 20s-stale snapshot (the false
        // "woke him" class), and the note names only acts that happened.
        const [freshLoop, freshState, freshLife] = await Promise.all([
          getLoopStatus(baseUrl, slug).catch(() => null),
          fetchEntityState(baseUrl, slug).catch(() => null),
          getServerLifeState(baseUrl, slug).catch(() => null),
        ]);
        // PHASE semantics (laurent 2026-07-15 22:38): clicking personal
        // moves TOWARD personal unless personal already IS the phase.
        // The old process-axis rule stopped an alive-but-suppressed loop
        // instead of entering the phase (the grey-button incident).
        const freshSleeping = freshState?.state === "asleep" || freshState?.state === "paused";
        const inPersonal = Boolean(freshLoop?.running) && !freshSleeping && String(freshState?.mode || "") !== "visiting";
        // VISIT PREEMPTS THE BUTTON (dm#94 write adversary: the roster
        // toggle was an unguarded awake writer — waking over a yielded
        // visit destroyed the visiting posture). Fresh mode + the fresh
        // composite's chat_open/phase (impl adversary P1-2: a hosted-lane
        // visit on an awake loop-less entity flips no mode) both refuse
        // the enter half.
        const rosterVisitLive =
          String(freshState?.mode || "") === "visiting" ||
          Boolean(freshLife?.chat_open) ||
          ["visit", "visiting"].includes(String(freshLife?.phase || "").toLowerCase());
        if (!inPersonal && rosterVisitLive) {
          setNote(`${slug}: a visit is in the room — personal time cannot start until it closes (the visit's close restores his phase).`);
          return;
        }
        if (inPersonal) {
          await stopLoop(baseUrl, slug, token);
          setNote(`${slug}: stop requested — his personal time ends at the next tick boundary.`);
        } else {
          const acts: string[] = [];
          if (freshState?.state === "paused" || freshState?.state === "asleep") {
            await postEntityState(baseUrl, slug, "awake", "operator started his personal time (roster)", token);
            acts.push("woke him");
          }
          if (freshLoop?.running) {
            // Loop process alive but suppressed by the sleep state — the
            // wake alone re-enters personal.
            setNote(`${slug}: ${acts.length ? acts.join(" and ") + " — " : ""}his personal time resumes.`);
          } else {
            // ONE substrate per entity (2026-07-09 06:32): the gateway
            // resolves his persisted choice; if none exists anywhere its
            // refusal names the fix (set it once with 🧠 on his page).
            const r = await startLoop(baseUrl, slug, token, {});
            if (r.started) acts.push("started his personal time");
            setNote(acts.length ? `${slug}: ${acts.join(" and ")}.` : `${slug}: his personal time did not start — see the card state.`);
          }
        }
        window.setTimeout(() => refresh({ cards: false }), 1200);
      } catch (e) {
        // Structured /loop refusals carry the reason — speak it verbatim,
        // never JSON armor (B2: every refusal surfaces with its reason).
        const refusal = parseLoopRefusal(e as Error);
        setNote(`${slug}: ${refusal ? refusal.message : (e as Error).message}`);
      } finally {
        setBusySlug(null);
        refresh({ cards: false });
      }
    },
    [baseUrl, token, busySlug, refresh],
  );

  const toggleSleep = useCallback(
    async (slug: string) => {
      if (busySlug) return;
      const row = rowFor(slug);
      setBusySlug(slug);
      setNote(null);
      const target = row?.state?.state === "asleep" ? "awake" : "asleep";
      try {
        await postEntityState(baseUrl, slug, target, "by the operator (roster)", token);
        window.setTimeout(() => refresh({ cards: false }), 800);
      } catch (e) {
        setNote(`${slug}: ${(e as Error).message}`);
      } finally {
        setBusySlug(null);
        refresh({ cards: false });
      }
    },
    [baseUrl, token, busySlug, rows, refresh],
  );

  return (
    <div className="entities_index">
      <div className="eix_head">
        <h2>Summoned entities</h2>
        <div className="eix_head_actions">
          {onWatchAll ? (
            <button
              className="eix_create_btn"
              onClick={onWatchAll}
              title="Watch every life at once — one live tile per entity (streams never merge; each tile is its own fold)"
            >
              👁 watch all
            </button>
          ) : null}
          {onBlueprint ? (
            <button
              className="eix_create_btn"
              onClick={onBlueprint}
              title="The memory blueprint — how every entity's cognition flows (stores, acts, the day gate, the night). The MACHINE, same for all; no entity's data."
            >
              🧭 blueprint
            </button>
          ) : null}
          {onConvene ? (
            <button
              className="eix_create_btn"
              onClick={onConvene}
              title="Convene two or more entities into one conversation — you steer, each answers in its own voice (the mission's destination)"
            >
              🤝 convene a meet
            </button>
          ) : null}
          <button className="eix_refresh" onClick={() => refresh()} title="Refresh the roster">
            ↻
          </button>
          <button className="eix_create_btn" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "✕ close" : "+ new entity"}
          </button>
        </div>
      </div>

      {showCreate ? (
        <CreateEntityForm
          baseUrl={baseUrl}
          token={token}
          onCreated={(slug) => {
            setShowCreate(false);
            refresh();
            onOpen(slug);
          }}
        />
      ) : null}

      {authNeeded ? (
        <div className="eix_signin">
          <p>This gateway requires a sign-in to list its entities.</p>
          <button className="eix_create_btn" onClick={() => onConnect?.()}>
            🔑 connect to the gateway
          </button>
        </div>
      ) : null}
      {error ? <p className="eix_error">{error}</p> : null}
      {note ? <p className="eix_error">{note}</p> : null}
      {rows === null && !error && !authNeeded ? <p className="eix_note">reading the homes…</p> : null}
      {rows !== null && rows.length === 0 && !authNeeded ? (
        <p className="eix_note">No entity homes on this gateway yet — create the first one above.</p>
      ) : null}

      <div className="eix_grid">
        {(rows ?? []).map(({ summary, state, loop, serverLife, card }) => {
          // ONE derived state per card (maintainer 2026-07-09): the same
          // mutually-exclusive machine as the focus view — no card shows
          // "visiting" beside a lit own-time badge. Server phase wins.
          // The roster CONDUCTS no chat (dm#94 wiring pin): the visit
          // axis is honestly absent here — but the served composite's own
          // chat_open is consumed by the derive, so a card can never say
          // "personal" over a server-asserted open conversation.
          const rosterHoldsNoChat = null;
          const life = deriveLifeState(state, loop, rosterHoldsNoChat, serverLife);
          // The radio position + process axis — same ONE machine as the
          // entity page (no roster-vs-page axis split, adversary G2).
          const activePhase = activeRuledPhase(life);
          const ownTimeOn = life.ownTimeOn;
          const stopping = life.stopping;
          const interests = interestsOf(card);
          const sleep = card?.sleep_stats;
          const momentsTotal = card?.key_moments?.total ?? card?.moments?.length;
          const busy = busySlug === summary.slug;
          return (
            <div key={summary.slug} className="eix_card">
              <button className="eix_card_head" onClick={() => onOpen(summary.slug)} title={`Watch ${summary.name}'s mind`}>
                <span className="eix_name">{summary.name}</span>
                {summary.handle ? (
                  <span className="eix_handle" title="handle (declared address) — reachability, not identity">
                    {summary.handle}
                  </span>
                ) : null}
                {/* The head badge carries the phase ONLY when the footer
                  * radio can't — with all four positions rendered (laurent
                  * dm#44) that leaves the NULL states: paused/yielded/
                  * settling/unknown, where no phase is current and the radio
                  * pushes nothing. A gold pushed "visit" 40px under a badge
                  * saying "visiting" said it twice (IA review P2). */}
                {activePhase === null ? (
                  <span className={`eix_badge eix_life_${life.accent}`} title={life.detail}>
                    {life.label}
                  </span>
                ) : null}
                {stopping ? <span className="eix_badge eix_loop_stopping">stopping…</span> : null}
                {loop?.inbox_warning ? (
                  <span className="eix_badge eix_loop_warning" title={loop.inbox_warning}>
                    ⚠ inbox
                  </span>
                ) : null}
                {!loop?.running && loop?.stopped_by === "failures" ? (
                  <span className="eix_badge eix_loop_warning" title="Three consecutive ticks failed (usually LLM timeouts under load) and his own time stopped itself. Memory intact — restart when the substrate is healthy.">
                    ⚠ stopped: failures
                  </span>
                ) : null}
                <span className="eix_open">watch →</span>
              </button>

              <div className="eix_card_body">
                {card?.age_days !== undefined || card?.mind_substrate?.model ? (
                  <div className="eix_meta">
                    {card?.age_days !== undefined ? <span>{card.age_days}d old</span> : null}
                    {card?.mind_substrate?.model ? <span title="mind substrate">{card.mind_substrate.model}</span> : null}
                  </div>
                ) : null}
                {interests.length > 0 ? (
                  <div className="eix_upto">
                    <span className="eix_upto_label">into lately</span>
                    {interests.map((g, i) => (
                      <span key={i} className="eix_interest">
                        {g}
                      </span>
                    ))}
                  </div>
                ) : card ? (
                  <p className="eix_note">no interests recorded yet</p>
                ) : (
                  <p className="eix_note">reading his card…</p>
                )}
                {sleep && (sleep.sleeps ?? 0) > 0 ? (
                  <div className="eix_meta">
                    <span title="sleeps (self-elected / operator)">
                      🌙 {sleep.sleeps} sleep{(sleep.sleeps ?? 0) === 1 ? "" : "s"}
                      {sleep.self_elected ? ` · ${sleep.self_elected} his own choice` : ""}
                    </span>
                    {momentsTotal ? <span>{momentsTotal} key moments</span> : null}
                  </div>
                ) : momentsTotal ? (
                  <div className="eix_meta">
                    <span>{momentsTotal} key moments</span>
                  </div>
                ) : null}
              </div>

              <div className="eix_card_actions">
                {/* The card speaks the SAME radio as the entity page — the
                  * shared AfPhaseRadio (adopted c2113), ALL FOUR positions
                  * (laurent dm#44 2026-07-16: "we should have the 4 badges
                  * always visible for each entity, so we know their state").
                  * visit/work render disabled-with-honest-words when not
                  * current (same contract as the focus view — no button
                  * entry into a visit; work doors are gateway-lane), pushed
                  * gold when current. */}
                <AfPhaseRadio
                  className="ec_phase_radio"
                  phase={activePhase}
                  slots={{
                    visit: {
                      label: <>💬 visit</>,
                      // Disabled only when NOT current (adversary 7.1: the
                      // kit dims disabled buttons — a live visit's pushed
                      // gold must not render half-off).
                      disabled: activePhase !== "visit",
                      title:
                        activePhase === "visit"
                          ? "CURRENT — a visitor is in the room (turn-based: he waits between messages)"
                          : "Visits start by talking — open his page and knock in the Chat tab; there is no button-entry into a visit",
                    },
                    work: {
                      label: <>🛠 work</>,
                      disabled: activePhase !== "work",
                      title:
                        activePhase === "work"
                          ? "CURRENT — working a task autonomously until completion"
                          : "Work-phase entry doors are being built (gateway lane) — no task surface exists here yet",
                    },
                    personal: {
                      // The label IS the phase name (laurent 2026-07-15:
                      // sub-states never rename a phase — tooltip only).
                      // ONE design at all times (laurent dm#127: Ephemeral's
                      // card looked different mid-action — the busy state
                      // swapped the WORD for "…"). The label never changes;
                      // busy renders as the slot's disabled styling only.
                      label: <>⏻ personal</>,
                      busy,
                      variant: activePhase === "personal" ? (life.ownTimeActive ? "active" : "resting") : ownTimeOn ? "suppressed" : undefined,
                      onSelect: () => void toggleOwnTime(summary.slug),
                      title: stopping
                        ? "Stop requested — ends at the next tick boundary"
                        : activePhase === "personal"
                          ? "CURRENT — his personal time (spoken: own time). Click to stop"
                          : ownTimeOn
                            ? "His personal phase ended for the current one; the loop process stands by (no ticks). Click to stop it entirely"
                            : life.sleeping
                              ? "Click to wake him AND start his personal time"
                              : "Click to start his personal time",
                    },
                    sleep: {
                      label: <>🌙 sleep</>,
                      disabled: busy || life.visiting,
                      onSelect: () => void toggleSleep(summary.slug),
                      title: life.visiting
                        ? "In a visit — cannot sleep with a visitor in the room"
                        : activePhase === "sleep"
                          ? "CURRENT — asleep. Click to wake him"
                          : "Put him to sleep (rest / consolidation)",
                    },
                  }}
                />
                {/* NEVER the internal manifest key (laurent c2513: the
                  * handle is <name>@ip; entity:<slug>@<home_id> is a birth
                  * marker, not an identity to display). The roster header
                  * already carries the door address; the card shows the
                  * name — the internal key stays internal. */}
              </div>
            </div>
          );
        })}
      </div>
      <p className="eix_footer">
        Reads are pure (list, state, own-time, card) — watching never writes. Controls go through the gateway door and land as
        visible moments in each life.
      </p>
    </div>
  );
}
