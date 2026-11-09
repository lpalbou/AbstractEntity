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
 * Loading (operator 2026-11-07, "reading the cards is extremely slow"):
 * every tile is drawn from the roster at once and fills in on its own —
 * live reads per tile, cards three at a time, kept and read again only
 * after 5 minutes or when the entity's state changed (roster_tiles.ts,
 * card_reads.ts). The light roster card is gateway backlog 1012.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { joinBaseUrl } from "@abstractframework/ui-kit";

import { ENTITY_IDENTITY } from "./app_about";
import { CreateEntityForm } from "./create_entity_form";
import { adoptPhaseBar, phaseActPlan, phaseBarRead, phaseBarView, phaseWriteOutcome, type PhaseBarAct, type PhaseBarRead, type PhaseBarUi } from "./phase_bar";
import { PhaseBarControls } from "./phase_bar_controls";
import { getPhaseBar, postSleepNow, putPhaseToggle, type PhaseWire } from "./phase_bar_source";
import { rosterHeadActions, rosterMode, type RosterMode } from "./roster_empty";
import { createRosterLoader, type RosterCard, type RosterLoader, type RosterTile } from "./roster_tiles";
import { WordsLine } from "./words_line";
import { gatewayReadHeaders, getLoopStatus, listEntities } from "./stream_source";

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
  /** Open the creation form on arrival and again each time the number
   * changes (the `#new` deep link, entity_view.tsx). 0 / absent = closed. */
  createRequest?: number;
  /** The creation form closed (cancelled or an entity was created): the
   * host clears the `#new` fragment so a reload does not reopen it. */
  onCreateFlowClosed?(): void;
}

/** Where a first-time reader learns what an entity is (the README section
 * written for this empty state). Built on the repository URL of the shared
 * AbstractFramework descriptor, the same source the About dialog links use. */
export const ENTITY_DOCS_URL = `${ENTITY_IDENTITY.repo}#what-is-an-entity`;

/** The zero-entity screen (mission JJ): one calm card, one primary action.
 * No jargon here — this is the first thing a new user reads. */
export function EmptyRoster({ onCreate }: { onCreate(): void }): React.ReactElement {
  return (
    <section className="eix_empty" aria-labelledby="eix_empty_title" data-testid="eix-empty">
      <div className="eix_empty_glyph" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="24" cy="24" r="20" opacity="0.35" />
          <circle cx="24" cy="24" r="12" opacity="0.6" />
          <circle cx="24" cy="24" r="3.5" fill="currentColor" stroke="none" />
          <path d="M24 4v6M24 38v6M4 24h6M38 24h6" opacity="0.35" />
        </svg>
      </div>
      <h3 id="eix_empty_title" className="eix_empty_title">
        No entities yet
      </h3>
      <div className="eix_empty_text wl_p">
        <WordsLine text="An entity is an AI companion with a lasting memory of its own. Give it a name, and it remembers what you talk about, keeps a diary and grows over time. You can talk with it and watch what it remembers." />
      </div>
      <div className="eix_empty_actions">
        <button type="button" className="eix_primary_btn" onClick={onCreate} data-testid="eix-create-first">
          Create your first entity
        </button>
        <a className="eix_empty_link" href={ENTITY_DOCS_URL} target="_blank" rel="noreferrer">
          What is an entity?
        </a>
      </div>
    </section>
  );
}

/** How often the roster and the live reads are refreshed (cards follow their own rules). */
export const ROSTER_REFRESH_MS = 20_000;

/** The words a tile shows when its card could not be read (the reason rides the tooltip). */
export const CARD_FAILED_NOTE = "details unavailable right now";

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

/** What stands in for the list while there is no list: the loading line,
 * or the empty state (which steps aside while the creation form is open). */
export function RosterStatus({ mode, showCreate, onCreate }: { mode: RosterMode; showCreate: boolean; onCreate(): void }): React.ReactElement | null {
  if (mode === "loading")
    return (
      <div className="eix_note wl_p">
        <WordsLine text="Loading your entities…" />
      </div>
    );
  if (mode === "empty" && !showCreate) return <EmptyRoster onCreate={onCreate} />;
  return null;
}

/**
 * A tile's phase bar read: the served life_state (phase_bar.ts, the same bar as the entity page,
 * without its Stop / Resume). Until the tile's first live answers it claims no phase and its
 * controls wait: the roster's own state record is half the truth.
 */
export function tilePhaseRead(tile: Pick<RosterTile, "phase" | "livePending">): PhaseBarRead {
  return tile.livePending ? { kind: "loading" } : tile.phase;
}

/** What a read card says on its tile: age and mind, what it is into lately, its sleeps and key moments. */
export function RosterCardBody({ card }: { card: RosterCard | null }): React.ReactElement {
  const interests = interestsOf(card);
  const sleep = card?.sleep_stats;
  const momentsTotal = card?.key_moments?.total ?? card?.moments?.length;
  return (
    <>
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
              <WordsLine text={g} inline />
            </span>
          ))}
        </div>
      ) : (
        <div className="eix_note wl_p">
          <WordsLine text="no interests recorded yet" />
        </div>
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
    </>
  );
}

/** One roster card read (`GET /entities/{name}/card`), at its default size. */
export async function fetchRosterCard(baseUrl: string, slug: string): Promise<RosterCard> {
  const res = await fetch(joinBaseUrl(baseUrl, `api/gateway/entities/${encodeURIComponent(slug)}/card`), {
    headers: gatewayReadHeaders({ Accept: "application/json" }),
  });
  if (!res.ok) throw new Error(`The card could not be read (HTTP ${res.status}).`);
  return (await res.json()) as RosterCard;
}

export function EntitiesIndex({
  baseUrl,
  token,
  onOpen,
  onConnect,
  onWatchAll,
  onConvene,
  onBlueprint,
  createRequest = 0,
  onCreateFlowClosed,
}: EntitiesIndexProps): React.ReactElement {
  const [rows, setRows] = useState<RosterTile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authNeeded, setAuthNeeded] = useState(false);
  // The `#new` deep link opens the form on arrival (initial state, so the
  // very first paint already shows it) and on every later request.
  const [showCreate, setShowCreate] = useState(() => createRequest > 0);
  const lastCreateRequest = useRef(createRequest);
  useEffect(() => {
    if (createRequest > 0 && createRequest !== lastCreateRequest.current) setShowCreate(true);
    lastCreateRequest.current = createRequest;
  }, [createRequest]);
  const openCreate = useCallback(() => setShowCreate(true), []);
  const closeCreate = useCallback(() => {
    setShowCreate(false);
    onCreateFlowClosed?.();
  }, [onCreateFlowClosed]);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const loaderRef = useRef<RosterLoader | null>(null);

  // One loader per gateway: the card cache lives as long as it does (a gateway switch starts over).
  useEffect(() => {
    const loader = createRosterLoader({
      gateway: {
        list: () => listEntities(baseUrl),
        loop: (slug) => getLoopStatus(baseUrl, slug),
        // The phase bar (CONTRACT-phases §1): the same read as the entity page's.
        life: (slug) => getPhaseBar(baseUrl, slug).then(phaseBarRead),
        card: (slug) => fetchRosterCard(baseUrl, slug),
      },
      sink: {
        tiles: setRows,
        error: (e) => {
          if (!e) {
            setError(null);
            setAuthNeeded(false);
          } else if (e.status === 401 || e.status === 403) {
            // 401/403 = the gateway wants a sign-in: prompt, never a blank
            // page (the maintainer's "empty space", 2026-07-09 06:1x).
            setAuthNeeded(true);
            setError(null);
          } else {
            setError(`Could not list entities: ${e.message}`);
          }
        },
      },
      schedule: (fn) => void window.requestAnimationFrame(() => fn()),
    });
    loaderRef.current = loader;
    void loader.refresh();
    const interval = window.setInterval(() => void loader.refresh(), ROSTER_REFRESH_MS);
    return () => {
      window.clearInterval(interval);
      loader.stop();
      if (loaderRef.current === loader) loaderRef.current = null;
    };
  }, [baseUrl]);

  const refresh = useCallback(() => void loaderRef.current?.refresh(), []);

  /** The tiles' phase acts (phase_bar.ts phaseActPlan, the entity page's rules): the visit pill
   * opens his page in its conversation, the toggles PUT and say what happens next, "sleep now"
   * asks first on the tile. One tile acts at a time; its sentence shows on that tile. */
  const [tileUi, setTileUi] = useState<{ slug: string; ui: PhaseBarUi } | null>(null);
  const [tileNote, setTileNote] = useState<{ slug: string; text: string } | null>(null);
  const adoptTileAnswer = useCallback((slug: string, wire: PhaseWire, act: PhaseBarAct) => {
    const out = phaseWriteOutcome(wire, act);
    const bar = out.bar;
    if (bar) setRows((cur) => cur?.map((t) => (t.summary.slug === slug ? { ...t, phase: adoptPhaseBar(t.phase, bar) } : t)) ?? cur);
    setTileNote(out.sentence ? { slug, text: out.sentence } : null);
  }, []);
  const actOnTile = useCallback(
    (tile: RosterTile, act: PhaseBarAct) => {
      const slug = tile.summary.slug;
      if (busySlug) return;
      const plan = phaseActPlan(tilePhaseRead(tile), act);
      setTileNote(null);
      if (plan.kind === "none") return;
      if (plan.kind === "refused") return setTileNote({ slug, text: plan.sentence });
      if (plan.kind === "show_visit" || plan.kind === "open_visit") return onOpen(slug);
      // The tiles ask only "sleep now" (Stop, Resume and "Resume and visit" live on his page).
      if (plan.kind === "confirm") return plan.confirm === "sleep" ? setTileUi({ slug, ui: { busy: null, confirm: "sleep" } }) : undefined;
      if (plan.kind !== "toggle") return; // the tiles carry no Stop / Resume
      setBusySlug(slug);
      setTileUi({ slug, ui: { busy: act, confirm: null } });
      putPhaseToggle(baseUrl, slug, plan.key, plan.on, token)
        .then((wire) => adoptTileAnswer(slug, wire, act))
        .catch((e: Error) => setTileNote({ slug, text: `The gateway did not answer: ${e.message || "no response"}.` }))
        .finally(() => {
          setBusySlug(null);
          setTileUi(null);
          refresh();
        });
    },
    [baseUrl, token, busySlug, onOpen, adoptTileAnswer, refresh],
  );
  /** "Sleep now" on a tile: the pass runs inside the request (contract O7), so the tile does not wait
   * on it; a refresh shows the sleep, and a refusal still reaches the tile when it comes back. */
  const confirmTile = useCallback(() => {
    if (!tileUi || tileUi.ui.confirm !== "sleep") return;
    const slug = tileUi.slug;
    setTileUi(null);
    postSleepNow(baseUrl, slug, token)
      .then((wire) => {
        if (wire.status < 200 || wire.status >= 300) adoptTileAnswer(slug, wire, "sleep");
        refresh();
      })
      .catch((e: Error) => setTileNote({ slug, text: `The gateway did not answer: ${e.message || "no response"}.` }));
    window.setTimeout(() => refresh(), 800);
  }, [tileUi, baseUrl, token, adoptTileAnswer, refresh]);

  const mode = rosterMode({ rowCount: rows === null ? null : rows.length, authNeeded, error });
  const head = rosterHeadActions(mode);

  return (
    <div className="entities_index">
      <div className="eix_head">
        <h2>Summoned entities</h2>
        <div className="eix_head_actions">
          {head.watchAll && onWatchAll ? (
            <button
              className="eix_create_btn"
              onClick={onWatchAll}
              title="Watch every life at once — one live tile per entity (streams never merge; each tile is its own fold)"
            >
              👁 watch all
            </button>
          ) : null}
          {head.blueprint && onBlueprint ? (
            <button
              className="eix_create_btn"
              onClick={onBlueprint}
              title="The memory blueprint — how every entity's cognition flows (stores, acts, the day gate, the night). The MACHINE, same for all; no entity's data."
            >
              🧭 blueprint
            </button>
          ) : null}
          {head.convene && onConvene ? (
            <button
              className="eix_create_btn"
              onClick={onConvene}
              title="Convene two or more entities into one conversation — you steer, each answers in its own voice (the mission's destination)"
            >
              🤝 convene a meet
            </button>
          ) : null}
          {head.refresh ? (
            <button className="eix_refresh" onClick={() => refresh()} title="Refresh the list" aria-label="Refresh the list">
              ↻
            </button>
          ) : null}
          {head.newEntity ? (
            <button className="eix_create_btn" onClick={() => (showCreate ? closeCreate() : openCreate())}>
              {showCreate ? "✕ close" : "+ new entity"}
            </button>
          ) : null}
        </div>
      </div>

      {showCreate ? (
        <CreateEntityForm
          baseUrl={baseUrl}
          token={token}
          autoFocus
          onCancel={closeCreate}
          onCreated={(slug) => {
            closeCreate();
            refresh();
            onOpen(slug);
          }}
        />
      ) : null}

      {authNeeded ? (
        <div className="eix_signin">
          <div className="wl_p">
            <WordsLine text="This gateway requires a sign-in to list its entities." />
          </div>
          <button className="eix_create_btn" onClick={() => onConnect?.()}>
            🔑 connect to the gateway
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="eix_error wl_p">
          <WordsLine text={error} />
        </div>
      ) : null}
      <RosterStatus mode={mode} showCreate={showCreate} onCreate={openCreate} />

      <div className="eix_grid">
        {(rows ?? []).map((tile) => {
          const { summary, card, cardStatus, cardError } = tile;
          // ONE phase per card, served (CONTRACT-phases §1): the same bar as the entity page
          // (no roster-vs-page split, adversary G2), its sentence on the card.
          const ui: PhaseBarUi = tileUi?.slug === summary.slug ? tileUi.ui : { busy: null, confirm: null };
          const view = phaseBarView(tilePhaseRead(tile), ui, { resume: false });
          const loop = tile.loop;
          return (
            <div key={summary.slug} className="eix_card">
              <button className="eix_card_head" onClick={() => onOpen(summary.slug)} title={`Watch ${summary.name}'s mind`}>
                <span className="eix_name">{summary.name}</span>
                {summary.handle ? (
                  <span className="eix_handle" title="handle (declared address) — reachability, not identity">
                    {summary.handle}
                  </span>
                ) : null}
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

              <div className="eix_card_body" data-card={cardStatus}>
                {cardStatus === "pending" ? (
                  // The card arrives after the roster: quiet lines hold the loaded lines' place
                  // (age and mind, what it is into, sleeps and key moments).
                  <>
                    <span className="eix_sk eix_sk_meta" aria-hidden="true" />
                    <span className="eix_sk eix_sk_upto" aria-hidden="true" />
                    <span className="eix_sk eix_sk_meta eix_sk_last" aria-hidden="true" />
                  </>
                ) : cardStatus === "failed" ? (
                  <div className="eix_note eix_card_note wl_p" title={cardError}>
                    <WordsLine text={CARD_FAILED_NOTE} />
                  </div>
                ) : (
                  <RosterCardBody card={card} />
                )}
              </div>

              <div className="eix_card_actions">
                {/* The card speaks the SAME phase bar as the entity page, all four pills (laurent
                  * dm#44 2026-07-16: "we should have the 4 badges always visible for each entity,
                  * so we know their state"); the kill switch stays on his page. */}
                <PhaseBarControls
                  className="eix_phase_bar"
                  view={view}
                  ui={ui}
                  entityName={summary.name}
                  note={tileNote?.slug === summary.slug ? tileNote.text : null}
                  onAct={(act) => actOnTile(tile, act)}
                  onConfirm={confirmTile}
                  onCancel={() => setTileUi(null)}
                  showPower={false}
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
      {mode === "list" ? (
        <details className="eix_howto">
          <summary>How this works</summary>
          <div className="eix_footer wl_p">
            <WordsLine text="Watching never changes an entity: the list, states and cards on this page are read-only. The controls (work, personal time, sleep) go through the gateway and show up as visible events in each entity's life." />
          </div>
        </details>
      ) : null}
    </div>
  );
}
