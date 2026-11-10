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
 * live reads per tile, tiles three at a time, kept and read again only
 * after 5 minutes or when the entity's state or phase changed
 * (roster_tiles.ts, card_reads.ts).
 *
 * One card for every app (operator 2026-11-10, second test round): each
 * entity is the kit's `EntityCard` over its tile (`GET /entities/{name}/tile`),
 * with the card's own acts fed by the served life state and loop: a clear
 * "Watch" button (how a person starts the discussion with him), "Retry"
 * beside the served reason when his own time stopped unexpectedly, and
 * "Resume" when he is stopped (POST /entities/{name}/lifecycle). The phase
 * bar stays at the bottom of the card.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import { EntityCard, joinBaseUrl, type EntityCardLife, type EntityCardStatus } from "@abstractframework/ui-kit";

import { ENTITY_IDENTITY } from "./app_about";
import { CreateEntityForm } from "./create_entity_form";
import { adoptPhaseBar, phaseActPlan, phaseBarRead, phaseBarView, phaseWriteOutcome, type PhaseBarAct, type PhaseBarRead, type PhaseBarUi } from "./phase_bar";
import { PhaseBarControls } from "./phase_bar_controls";
import { getPhaseBar, postLifecycle, postSleepNow, putPhaseToggle, type PhaseWire } from "./phase_bar_source";
import { rosterHeadActions, rosterMode, type RosterMode } from "./roster_empty";
import { createRosterLoader, type RosterCard, type RosterLoader, type RosterTile } from "./roster_tiles";
import { WordsLine } from "./words_line";
import { gatewayReadHeaders, getLoopStatus, listEntities } from "./stream_source";
import "./roster_cards.css";

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

/** The card's acts follow the served phase bar (the same read as the bar): the life state's
 * fields as served, or null while it is not served (the card then offers Watch only). */
export function tileLife(read: PhaseBarRead): EntityCardLife | null {
  if (read.kind !== "served") return null;
  const { phase, stopped, sentence, blocked } = read.bar;
  return { phase, stopped, sentence, blocked };
}

/** The card's status from its tile read: a tile kept through a later failure is "stale", none read
 * yet "loading", none read and the read failed "unavailable" (the reason rides the tooltip). */
export function tileCardStatus(tile: Pick<RosterTile, "card" | "cardStatus" | "cardError">): EntityCardStatus {
  if (tile.card) return tile.cardError ? "stale" : "ready";
  return tile.cardStatus === "failed" ? "unavailable" : "loading";
}

/** The card's act in flight on this tile ("retry" or "resume"), or null. */
export function tilePending(tileUi: { slug: string; ui: PhaseBarUi } | null, slug: string): "retry" | "resume" | null {
  const busy = tileUi?.slug === slug ? tileUi.ui.busy : null;
  return busy === "retry" || busy === "resume" ? busy : null;
}

/** One roster entity: the kit's EntityCard over its tile, the card's acts (Watch, Retry, Resume)
 * from the served life state and loop, and the shared phase bar at the bottom. No hooks: the host
 * owns the state and the acts (`onAct`), the tests read the element it returns. */
export function RosterEntityCard({
  tile,
  tileUi,
  note,
  onOpen,
  onAct,
  onConfirm,
  onCancel,
}: {
  tile: RosterTile;
  tileUi: { slug: string; ui: PhaseBarUi } | null;
  /** The last answer on this tile: on the card (`onCard`: Retry, Resume) or in the bar. */
  note: { text: string; onCard?: boolean; refused?: boolean } | null;
  onOpen(): void;
  onAct(act: PhaseBarAct): void;
  onConfirm(): void;
  onCancel(): void;
}): React.ReactElement {
  const { summary, card, cardError } = tile;
  const slug = summary.slug;
  const ui: PhaseBarUi = tileUi?.slug === slug ? tileUi.ui : { busy: null, confirm: null };
  const view = phaseBarView(tilePhaseRead(tile), ui, { resume: false });
  const life = tileLife(tilePhaseRead(tile));
  return (
    <EntityCard
      className="eix_entity_card"
      tile={card}
      status={tileCardStatus(tile)}
      name={summary.name}
      look={summary.avatar ?? null}
      reason={cardError || undefined}
      nowMs={Date.now()}
      onOpen={onOpen}
      // The card's acts: Watch opens his page (the head does too), Retry and Resume through the
      // lifecycle route (the host's act); their answer under the card's box.
      life={life}
      loop={tile.loop}
      onWatch={onOpen}
      onRetry={() => onAct("retry")}
      onResume={() => onAct("resume")}
      pending={tilePending(tileUi, slug)}
      notice={note?.onCard ? { text: note.text, refused: note.refused } : null}
      actions={
        // The card speaks the SAME phase bar as the entity page, all four pills (laurent dm#44
        // 2026-07-16: "we should have the 4 badges always visible for each entity, so we know
        // their state"); the kill switch stays on his page. The card's box says what blocks (with
        // its Retry) and the stopped sentence (with its Resume), so the bar does not say them twice:
        // neither the blocked warning nor its sentence ("Awake and reachable; his own time stopped
        // unexpectedly." under the box's "His own time stopped unexpectedly…", review 2b).
        <PhaseBarControls
          className="eix_phase_bar"
          view={view.blocked ? { ...view, blocked: "" } : view}
          ui={ui}
          entityName={summary.name}
          note={note && !note.onCard ? note.text : null}
          onAct={onAct}
          onConfirm={onConfirm}
          onCancel={onCancel}
          showPower={false}
          showSentence={!view.stopped && !view.blocked}
        />
      }
    />
  );
}

/** One entity tile (`GET /entities/{name}/tile`, gateway backlog 1012): what the card shows. */
export async function fetchRosterTile(baseUrl: string, slug: string): Promise<RosterCard> {
  const res = await fetch(joinBaseUrl(baseUrl, `api/gateway/entities/${encodeURIComponent(slug)}/tile`), {
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
        card: (slug) => fetchRosterTile(baseUrl, slug),
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
  /** The last answer on a tile: in the phase bar (its acts), or on the card under its box
   * (`onCard`: Retry, Resume), a refusal said as served. */
  const [tileNote, setTileNote] = useState<{ slug: string; text: string; onCard?: boolean; refused?: boolean } | null>(null);
  const adoptTileAnswer = useCallback((slug: string, wire: PhaseWire, act: PhaseBarAct, onCard = false) => {
    const out = phaseWriteOutcome(wire, act);
    const bar = out.bar;
    if (bar) setRows((cur) => cur?.map((t) => (t.summary.slug === slug ? { ...t, phase: adoptPhaseBar(t.phase, bar) } : t)) ?? cur);
    setTileNote(out.sentence ? { slug, text: out.sentence, onCard, refused: !out.ok } : null);
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
      // The tiles ask only "sleep now" (Stop and "Resume and visit" live on his page).
      if (plan.kind === "confirm") return plan.confirm === "sleep" ? setTileUi({ slug, ui: { busy: null, confirm: "sleep" } }) : undefined;
      // The card's own Retry and Resume (operator 2026-11-10: never leave him hanging): the
      // lifecycle route, its answer (or refusal, as served) under the card's box.
      if (plan.kind === "retry" || plan.kind === "resume") {
        const action = plan.kind;
        setBusySlug(slug);
        setTileUi({ slug, ui: { busy: act, confirm: null } });
        postLifecycle(baseUrl, slug, action, token)
          .then((wire) => adoptTileAnswer(slug, wire, act, true))
          .catch((e: Error) => setTileNote({ slug, text: `The gateway did not answer: ${e.message || "no response"}.`, onCard: true, refused: true }))
          .finally(() => {
            setBusySlug(null);
            setTileUi(null);
            refresh();
          });
        return;
      }
      if (plan.kind !== "toggle") return; // the tiles carry no Stop
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

      <div className="eix_grid eix_cards">
        {(rows ?? []).map((tile) => {
          const slug = tile.summary.slug;
          // ONE phase per card, served (CONTRACT-phases §1): the same bar as the entity page
          // (no roster-vs-page split, adversary G2), its sentence on the card.
          return (
            <RosterEntityCard
              key={slug}
              tile={tile}
              tileUi={tileUi}
              note={tileNote?.slug === slug ? tileNote : null}
              onOpen={() => onOpen(slug)}
              onAct={(act) => actOnTile(tile, act)}
              onConfirm={confirmTile}
              onCancel={() => setTileUi(null)}
            />
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
