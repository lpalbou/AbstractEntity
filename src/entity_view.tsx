/**
 * The entity memory view: one summoned entity's evolving memory graph.
 *
 * Offline replay and live tail are ONE pipeline (a2a 0005): the state at
 * any scrub position is the pure fold of the envelope prefix, so playback,
 * scrubbing, and live-follow share the same code path. Sources:
 *
 * - the bundled demo life (a real exported keystone-style life),
 * - a dropped .ndjson file (an exported life),
 * - a gateway (`api/gateway/entities/{name}/replay` + SSE live tail).
 *
 * Everything here is a pure read. There is no write path in this module.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EntityMark } from "./brand_mark";
import { ChatDrawer } from "./chat_drawer";
import { SettingsPanel } from "./workspace_panel";
import { SideTabs, type SideTab } from "./drawer";
import { EntitiesIndex } from "./entities_index";
import { FleetView } from "./fleet_view";
import { MeetConsole } from "./meet_console";
import { MeetReader } from "./meet_reader";
import { GraphCanvas, KIND_COLORS, relationGlyph, type RelationGlyph } from "./graph_canvas";
import { ContextToggle } from "./context_toggle";
import { canvasSelection, contextAvailability, contextToggleView, readContextChoice, sessionStore, writeContextChoice } from "./recall_emphasis";
import { IdentityCardContent } from "./identity_card";
import {
  AfTopBarActions,
  AfAppearanceDialog,
  useAppearanceSettings,
  Icon,
} from "@abstractframework/ui-kit";
import type { GatewayConnectionState } from "@abstractframework/ui-kit";
import { DocsAssistantDrawer } from "./vendor/abstractdocs/docs_assistant.js";
import { bearerAccountStatus } from "./entity_account";
import { ENTITY_DOCS_SOURCE, ENTITY_DOCS_SUGGESTIONS, makeEntityDocsFetch } from "./entity_assistant";

import { BookReader } from "./book_reader";
import { CognitionWavePanel } from "./cognition_wave_panel";
import { LessonsPanel, WorldPanel } from "./lessons_world_panels";
import { BlueprintPanel } from "./blueprint_panel";
import { BlueprintTunables } from "./blueprint_tunables";
import { PhaseGraphEditor } from "./phase_editor";
import { HealthPanel } from "./health_panel";
import { Inspector } from "./inspector";
import { LedgerPanel } from "./ledger_panel";
import { NowLine } from "./now_line";
import { foldedRecordRow } from "./turn_notices";
import { Timeline } from "./timeline";
import { foldUpToIndex, isDiaryGraphId, lastLifeChangeSeq, mergeEnvelopes, type FoldCache } from "./stream_fold";

/** Live watchdog: how often to compare with the gateway, and how long the
 * tail may be silent before newer gateway events mean it stalled. */
const LIVE_CHECK_MS = 20_000;
const LIVE_STALL_MS = 15_000;
import { LENSES, lensIds, type GraphLens } from "./graph_lenses";
import { computeTemporalActivation } from "./temporal_activation";
import { USAGE_HIGH, USAGE_LOW, USAGE_TITLE } from "./graph_usage";
import { dayCauseLine, type ClientVisitSignal } from "./entity_state";
import { adoptPhaseBar, adoptPhaseMarker, adoptPhaseRead, phaseActPlan, phaseBarRead, phaseBarView, phaseWriteOutcome, type PhaseBarAct, type PhaseBarRead, type PhaseBarUi, type PhaseWriteOutcome } from "./phase_bar";
import { PhaseWrites } from "./phase_bar_writes";
import { PhaseBarControls } from "./phase_bar_controls";
import { getPhaseBar, highestPhaseMarker, postLifecycle, postSleepNow, putPhaseToggle, type PhaseMarker, type PhaseWire } from "./phase_bar_source";
import { substrateChoiceOf, type SubstrateChoice } from "./mind_voice_settings";
import { getEntitySubstrate } from "./stream_source";
import { checkSpecSync, type SpecSyncResult } from "./spec_sync";
import { pageFromSearch, searchAfterNavigate } from "./index_page";
import {
  classifyOperatorAuth,
  gatewayReadHeaders,
  getEntityCognition,
  fetchEntityFootprint,
  getLoopStatus,
  listEntities,
  fetchReplay,
  openLiveTail,
  parseNdjson,
  setGatewayToken,
  type LiveTailHandle,
  type LoopStatus,
  type EntityCognition,
  type EntityFootprint,
} from "./stream_source";
import { openLifeStream } from "./replay_cache";
import { createPlayhead, playFrame, startPlay } from "./replay_clock";
import type { ReplayEnvelope } from "./stream_types";
import {
  ConnectGatewayModal,
  loadStoredAuth,
  storeAuth,
  type GatewayAuthState,
} from "./connect_gateway_modal";
import { proxyConnectionLogout, proxyConnectionStatus, sameGatewayTarget } from "./gateway_session";
import { useEntityAbout } from "./app_about";
import { wantsCreateFlow } from "./roster_empty";
import { clipboardWrite } from "./lib/secure-context";

// Relative: under the app base (`/` standalone, `/apps/entity/` behind the gateway).
const DEMO_URL = "demo/castor.ndjson";

type SourceKind = "demo" | "file" | "gateway";

/** Copy text to the clipboard with the plain-HTTP LAN fallback (F25: a
 * loopback/LAN origin over http has no navigator.clipboard — the entity
 * app is served exactly there, so the execCommand path is load-bearing,
 * not a nicety). Returns whether it copied. */
async function copyText(text: string): Promise<boolean> {
  return clipboardWrite(text);
}

/** Legend swatch for a typed edge: short line + the SAME glyph the canvas
 * draws at the target end (one mapping, two renderers — the legend can
 * never diverge from the graph). SVG paths mirror traceRelationGlyph. */
function RelationGlyphSwatch({ glyph }: { glyph: RelationGlyph }): React.ReactElement {
  return (
    <svg width="30" height="12" aria-hidden="true">
      <line x1="0" y1="6" x2="20" y2="6" stroke="var(--text-dim)" strokeWidth="1" opacity="0.55" />
      <g transform="translate(27,6)" stroke="var(--text-dim)" strokeWidth="1.2" fill="none">
        {glyph === "arrow" ? <path d="M-4.5,-3.5 L0,0 L-4.5,3.5" /> : null}
        {glyph === "chevron2" ? <path d="M-7.5,-3.2 L-3.5,0 L-7.5,3.2 M-4,-3.2 L0,0 L-4,3.2" /> : null}
        {glyph === "circle" ? <circle cx="-2" cy="0" r="3" /> : null}
        {glyph === "diamond" ? <path d="M-6.5,0 L-3,-3.2 L0.5,0 L-3,3.2 Z" /> : null}
        {glyph === "square" ? <rect x="-5.6" y="-2.8" width="5.6" height="5.6" /> : null}
        {glyph === "bar" ? <path d="M-1.5,-4 L-1.5,4" /> : null}
      </g>
    </svg>
  );
}

export function EntityView(): React.ReactElement {
  const [envelopes, setEnvelopes] = useState<ReplayEnvelope[]>([]);
  const [sourceKind, setSourceKind] = useState<SourceKind>("demo");
  const [sourceLabel, setSourceLabel] = useState("demo life — Castor");
  const [scrubIndex, setScrubIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [live, setLive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<"open" | "reconnecting" | "closed" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The recall a ledger line under the mouse previews in the graph (`beat:<trace>`), or null:
   * the canvas lights it as if clicked, Detail keeps the click's selection. */
  const [recallPreview, setRecallPreview] = useState<string | null>(null);
  const [showQuiet, setShowQuiet] = useState(false);
  const [gatewayUrl, setGatewayUrl] = useState("");
  /** Live view of the resolved base for deferred work (the auth check may
   * CONVERGE a ?gateway= deep link onto the page-origin proxy after the
   * boot effect captured the param — a stale closure would dial the old
   * base and 401). */
  const gatewayUrlRef = useRef("");
  gatewayUrlRef.current = gatewayUrl;
  /** About dialog (top bar): identity + the gateway's versions, read on
   * open through the same base every other gateway read uses; demo and
   * file sources have no gateway to ask. */
  const about = useEntityAbout(sourceKind === "gateway" ? gatewayUrl : null);
  /** Life-stream ordering guard (code adversary F1 P0): bumped on every
   * openEntity/goToIndex/boot; batches and tails from a superseded stream
   * are DROPPED — a slow load can never paint one mind under another's
   * name or repopulate the roster after leaving. */
  const streamEpochRef = useRef(0);
  const [entityName, setEntityName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const tailRef = useRef<LiveTailHandle | null>(null);
  // Staleness truth for the live badge (adversarial UX review 1.2-1.4):
  // EventSource ignores keep-alive comments by design, so "connected" says
  // nothing — the honest signal is wall time since the last envelope.
  const lastEnvelopeAtRef = useRef<number | null>(null);
  const [liveAgeS, setLiveAgeS] = useState<number | null>(null);
  /** GW-F handle (`castor@<address>`) — display-only reachability. */
  const [handle, setHandle] = useState<string | null>(null);
  /** Transient click-to-copy feedback on the handle badge (operator ask
   * 2026-07-15, dm#8): "ok" flips the badge to "copied ✓" for ~1.6s. */
  const [handleCopied, setHandleCopied] = useState<"ok" | "fail" | null>(null);
  /** The serving box's LAN address (from the app server, same-origin only)
   * — the handle fallback when the gateway declares no address and its URL
   * is loopback (operator 2026-07-15: "ephemeral@192.168.1.146", never
   * "@ this gateway"). null on direct-bearer postures / offline boxes. */
  const [lanIp, setLanIp] = useState<string | null>(null);
  useEffect(() => {
    fetch("app/host")
      .then((r) => (r.ok ? (r.json() as Promise<{ lan_ip?: string | null }>) : null))
      .then((d) => setLanIp(d?.lan_ip ?? null))
      .catch(() => setLanIp(null));
  }, []);
  const [searchText, setSearchText] = useState("");
  // The browser's gateway credential (shared sign-in card, 2026-07-08):
  // seeded from storage; every read helper sends it (strict-auth
  // gateways refuse anonymous reads). controlToken stays as the derived
  // bearer value for the call sites that pass tokens explicitly.
  const [authState, setAuthState] = useState<GatewayAuthState | null>(() => {
    const stored = loadStoredAuth();
    if (stored?.token) setGatewayToken(stored.token);
    return stored;
  });
  const controlToken = authState?.token ?? "";
  // VERIFIED auth (maintainer ruling 2026-07-10 20:56, CRITICAL): a stored
  // credential is a CLAIM, not proof — the gateway must confirm it accepts
  // this browser before ANY entity content renders or streams. Without
  // this, the gateway's dev-read posture (or a stale session cookie the
  // door rejects for writes) leaked the graph/ledger behind the sign-in
  // modal. `authVerified` gates all gateway reads/renders; it flips true
  // ONLY on a confirming probe (boot re-verify) or a fresh successful
  // sign-in (the modal probed/logged-in), and false on disconnect/refusal.
  const [authVerified, setAuthVerified] = useState(false);
  /** The signed-in account the top bar's kit account widget shows (entity_account.ts): the proxy's
   * own answer, or the verified bearer's. Rendered only while the phase is connected. */
  const [accountStatus, setAccountStatus] = useState<GatewayConnectionState | null>(null);
  const authVerifiedRef = useRef(false);
  authVerifiedRef.current = authVerified;
  /** PROXY posture (the abstractflow shape, maintainer 2026-07-10 22:5x):
   * the page origin serves /api/connection/gateway — sign in ONCE through
   * it, first-party cookies carry the session, refresh re-verifies
   * silently. null = still detecting. When false, the DIRECT posture
   * applies (cross-origin bearer, base-bound credential). */
  const [proxyMode, setProxyMode] = useState<boolean | null>(null);
  const proxyModeRef = useRef<boolean | null>(null);
  proxyModeRef.current = proxyMode;
  /** A silent verification is in flight — the sign-in card must NOT open
   * during it (audit V4: the modal flashed on every refresh even when the
   * stored credential was about to verify). */
  const [authChecking, setAuthChecking] = useState(true);
  /** A life-stream kickoff deferred until auth verifies (so an unverified
   * browser never fetches a life). Drained by the auth effect. */
  const pendingStreamRef = useRef<null | (() => void)>(null);
  const [showAuth, setShowAuth] = useState(false);
  // THE ONE SILENT CHECK on boot/base-change (the abstractflow contract;
  // LOGIN-FIRST ruling 2026-07-09 honored by the check's own conclusions):
  // 1. proxy posture — GET /api/connection/gateway answers "still signed
  //    in?" from the HttpOnly cookie; sign-in appears only on a definitive
  //    no. 2. direct posture — re-probe the stored bearer against the
  //    resolved base, distinguishing REFUSED (sign in again) from
  //    UNREACHABLE (a gateway that is down is not a revoked credential —
  //    audit V5/W1: never answer a network error with a sign-in demand).
  // The modal opens HERE, on definitive conclusions — never while the
  // check is in flight (audit V4: the card flashed on every refresh even
  // when the stored credential was about to verify).
  useEffect(() => {
    if (sourceKind !== "gateway" || authVerified) return;
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    let cancelled = false;
    setAuthChecking(true);
    (async () => {
      // ONE status read answers two questions: does this origin have the
      // proxy, and which gateway does it front. The proxy posture covers
      // same-origin bases AND direct deep links whose ?gateway= names the
      // proxy's own gateway (the launcher opens ?gateway=http://…:8080 —
      // converge it onto the proxy instead of dialing cross-origin, or the
      // sign-in-once cookie can never apply to the main entry path).
      const sameOriginBase = !base || new URL(base, window.location.href).origin === window.location.origin;
      const status = await proxyConnectionStatus();
      if (cancelled) return;
      const proxyGateway = (status.gatewayUrl || "").trim().replace(/\/+$/, "");
      const proxyCovers =
        status.available && (sameOriginBase || (proxyGateway !== "" && sameGatewayTarget(proxyGateway, base)));
      if (proxyCovers) {
        setProxyMode(true);
        setGatewayToken(null); // cookies carry the session; no bearer
        if (base) {
          // Converge every data call onto the page origin (the proxy).
          setGatewayUrl("");
          setIndexBase((prev) => (prev !== null ? "" : prev));
        }
        if (status.ok) {
          setAuthState({ mode: "session", userId: status.userId || "operator", token: null, remembered: true });
          setAccountStatus(status.state);
          setAuthVerified(true);
          setShowAuth(false);
          setControlNote(null);
        } else if (status.hasSession) {
          // A session cookie exists but the gateway did not confirm it —
          // EXPIRED session or gateway DOWN, and the proxy's one answer
          // cannot distinguish them (refresh-audit gap G2). Unreachable
          // must never read as revoked: say what is known, keep the
          // cookie, and leave the connect button one click away on the
          // locked card instead of forcing the modal.
          setControlNote("The gateway did not confirm your browser session (it may be restarting, or the session expired) — retry in a moment, or connect again.");
        } else {
          setShowAuth(true); // first connect through this browser
        }
        setAuthChecking(false);
        return;
      }
      setProxyMode(false);
      // DIRECT posture: verify the stored bearer against this base — but
      // never REPLAY a token against a different gateway than it was
      // verified for (refresh-audit gap G1: sending a bearer to the wrong
      // host leaks it). Legacy base-less credentials probe once and are
      // rebound to the base that accepts them.
      if (authState?.token) {
        const storedBase = (authState.base || "").trim().replace(/\/+$/, "");
        if (storedBase && base && !sameGatewayTarget(storedBase, base)) {
          setControlNote(`Your saved sign-in belongs to ${storedBase} — connect to this gateway to continue.`);
          setShowAuth(true);
          setAuthChecking(false);
          return;
        }
        const probe = await classifyOperatorAuth(base, authState.token);
        if (cancelled) return;
        if (probe.kind === "operator") {
          if (!storedBase && authState.remembered) {
            // Rebind the legacy credential to the base that accepted it.
            storeAuth({ ...authState, base });
            setAuthState({ ...authState, base });
          }
          setAccountStatus(bearerAccountStatus({ ...authState, base: storedBase || base }, probe.probe));
          setAuthVerified(true);
          setShowAuth(false);
          setControlNote(null);
        } else if (probe.kind === "refused") {
          setControlNote("Your saved sign-in is no longer accepted by this gateway — please connect again.");
          setShowAuth(true);
        } else {
          // Unreachable is NOT a credential problem: keep the credential,
          // say what happened, let the operator retry (no sign-in demand).
          setControlNote(`The gateway is not answering (${probe.error}) — your sign-in is kept; retry when it is back.`);
        }
      } else {
        setShowAuth(true); // no credential at all: first connect
      }
      setAuthChecking(false);
    })().catch((e) => {
      // An unhandled rejection here froze "Checking your sign-in…" forever
      // (code adversary F21: a malformed ?gateway= made new URL throw).
      if (cancelled) return;
      setAuthChecking(false);
      setControlNote(`The sign-in check failed (${String((e as Error).message || e)}) — check the gateway address and retry.`);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceKind, authState, authVerified, gatewayUrl]);
  // Drain a deferred life stream once auth verifies (the fetch that was
  // withheld from an unverified browser).
  useEffect(() => {
    if (authVerified && pendingStreamRef.current) {
      const run = pendingStreamRef.current;
      pendingStreamRef.current = null;
      run();
    }
  }, [authVerified]);
  const [controlNote, setControlNote] = useState<string | null>(null);
  // Settings modal (operator 2026-07-15 (d)(e)): the old "workspace" button
  // was really settings — it now opens ONE modal that holds workspace/tools
  // AND the mind substrate (provider/model), keeping the top bar clean
  // (progressive disclosure). `showSettings` replaces the old showWorkspace.
  const [showSettings, setShowSettings] = useState(false);
  // Shared top-bar cluster surfaces (operator 2026-07-15 (i)): assistant
  // drawer + appearance dialog, the SAME components flow/continuum carry.
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [appearance, setAppearance] = useAppearanceSettings("abstractentity", { defaults: { theme: "observer-night" } });
  // The floating search-memory overlay (operator 2026-07-15 (h)): search is
  // a first-class bar over the lens pills, opened from a prominent control,
  // not lost among stats.
  const [searchOpen, setSearchOpen] = useState(false);
  const [loopStatus, setLoopStatus] = useState<LoopStatus | null>(null);
  /** THE PHASE BAR (operator ruling 2026-11-08, phase_bar.ts): the served life_state (phase,
   * toggles, kill switch, the sentence for now), the act in flight / the inline confirmation, and
   * the last act's sentence. */
  const [phaseRead, setPhaseRead] = useState<PhaseBarRead>({ kind: "loading" });
  const [phaseUi, setPhaseUi] = useState<PhaseBarUi>({ busy: null, confirm: null });
  const [phaseNote, setPhaseNote] = useState<string | null>(null);
  /** A click on the visit pill asks the Chat tab to knock (a nonce the drawer watches). */
  const [visitKnock, setVisitKnock] = useState(0);
  /** ONE-GRAPH drift check (dm#79 mechanism; my consumer half, c3564):
   * compares the gateway's vendored phase graph against this build's
   * bundled copy by sha — once per load (the graph is global, not
   * per-entity). Only DRIFT renders; match/unavailable stay quiet. */
  const [specDrift, setSpecDrift] = useState<SpecSyncResult | null>(null);
  /** BILLED cognition/spend (B3 wire, gateway c1390) — null on older
   * gateways, where the header keeps the labeled input-side estimate. */
  const [cognition, setCognition] = useState<EntityCognition | null>(null);
  /** FIRST-HAND visit truth from the drawer (dm#94 exclusivity incident:
   * the header said "personal · resting" while the drawer conducted a
   * live conversation — deriveLifeState was fed a null visit axis). The
   * drawer reports its own open session up; the derive ranks it above the
   * served composite (and below the kill switch). */
  const [clientVisit, setClientVisit] = useState<ClientVisitSignal | null>(null);
  const [avatarChat, setAvatarChat] = useState(false);
  /** On-disk footprint (gateway c1788) — bytes at rest + maintenance the
   * stream cannot carry; null when the route is unserved (stale gateway),
   * where the health panel renders the labeled gap. */
  const [footprint, setFootprint] = useState<EntityFootprint | null>(null);
  /** The operator's explicit mind-substrate choice for this entity
   * (2026-07-09 ruling) — sent on chat/open AND loop/start; never a
   * silent default. Persisted per entity. */
  const [substrate, setSubstrate] = useState<SubstrateChoice | null>(null);
  /** Progressive life-load status ("loading his life… 42,000 events") —
   * a 98 MB replay must never look like an empty broken page. */
  const [bootProgress, setBootProgress] = useState<string | null>(null);
  // Identity flows from the ONE authentication (maintainer 2026-07-10
  // 20:17): the old free-text participant field (and its localStorage
  // seed) is GONE — the chat drawer derives person:<userId> from the
  // signed-in principal, and the door verifies regardless.
  /** The multi-entity manager (0010 121500Z): when a gateway answers and
   * no ?entity= is selected, the app is an INDEX of lives, not one life. */
  const [indexBase, setIndexBase] = useState<string | null>(null);
  /** Fleet wall (item 13, O-C): watch every life at once from the index. */
  /** ONE index-page axis (placement adversary P2-3: two booleans guarded
   * only by pairwise clearing = a representable both-true blank screen;
   * the union makes it unrepresentable). "roster" is the home; "fleet" =
   * watch-all; "blueprint" = the memory blueprint as its OWN page
   * (laurent dm#130 — the per-entity tab was REMOVED on the same ruling:
   * a secondary door inside the entity page contradicts "it doesn't make
   * sense inside the entity page itself"). */
  const [indexPage, setIndexPage] = useState<"roster" | "fleet" | "blueprint">("roster");
  /** The `#new` deep link (mission JJ): the creation form opens on arrival
   * and whenever the fragment becomes #new again. A counter, so a second
   * request after the form was closed reopens it. */
  const [createRequest, setCreateRequest] = useState(() => (typeof window !== "undefined" && wantsCreateFlow(window.location.hash) ? 1 : 0));
  useEffect(() => {
    const onHash = () => {
      if (wantsCreateFlow(window.location.hash)) setCreateRequest((n) => n + 1);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  /** The form closed: drop the fragment so a reload lands on the list. */
  const clearCreateHash = useCallback(() => {
    // Consumed: a later remount of the roster (back from an entity page)
    // must not reopen the form.
    setCreateRequest(0);
    if (!wantsCreateFlow(window.location.hash)) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
  }, []);
  /** Navigate the index-page axis AND keep the URL honest (laurent dm#147
   * via framework c4018: the blueprint gets a shareable deep link —
   * ?page=blueprint — so a refresh lands back on the map). Only the
   * blueprint is URL-addressable (his approval names it); roster/fleet
   * clear the param so a stale ?page can never contradict the screen. */
  const navigateIndexPage = useCallback((page: "roster" | "fleet" | "blueprint", opts: { pushUrl?: boolean } = {}) => {
    setIndexPage(page);
    if (opts.pushUrl === false) return;
    const qs = searchAfterNavigate(window.location.search, page);
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    // No junk history entries (deep-link adversary P1-4): a fleet click
    // produced a URL-identical push, making Back a visual no-op and
    // costing an extra press to leave the app.
    const current = `${window.location.pathname}${window.location.search}`;
    if (next === current) return;
    window.history.pushState({ page }, "", next);
  }, []);
  /** Meet reader (item 14 human-access half): the shared moment open for
   * reading — every participating life's perspective, side by side. */
  const [meetVisitId, setMeetVisitId] = useState<string | null>(null);
  /** Meet console (item 14 live half, the mission's destination): convene
   * two entities into one conversation, steer it, watch both legs. */
  const [showMeetConsole, setShowMeetConsole] = useState(false);
  /** Pre-filled seats when the meet is convened from a visit: an entity
   * picked as an `@` chip offers it (operator 2026-07-15). */
  const [meetPreset, setMeetPreset] = useState<{ a: string; b: string } | null>(null);
  /** A requested side tab (roster click = "join his room" -> chat, the
   * maintainer's ask 2026-07-09). The nonce bumps every open so SideTabs
   * re-applies even when re-entering the same entity. */
  const [requestedTab, setRequestedTab] = useState<{ tab: string; nonce: number } | null>(null);

  // ------------------------------------------------------------- sources

  const loadEnvelopes = useCallback((next: ReplayEnvelope[], kind: SourceKind, label: string) => {
    next.sort((a, b) => a.seq - b.seq);
    tailRef.current?.close();
    tailRef.current = null;
    setLive(false);
    setLiveStatus(null);
    foldCacheRef.current = null; // a new source is a new life: never extend across it
    setEnvelopes(next);
    setSourceKind(kind);
    setSourceLabel(label);
    setScrubIndex(-1);
    setSelectedId(null);
    setRecallPreview(null);
    setPlaying(next.length > 0);
    setError(null);
  }, []);

  const startTail = useCallback((base: string, name: string, cursor: number) => {
    tailRef.current?.close();
    setPlaying(false);
    setLive(true);
    lastEnvelopeAtRef.current = Date.now();
    tailRef.current = openLiveTail(
      base,
      name,
      cursor,
      (env) => {
        lastEnvelopeAtRef.current = Date.now();
        setEnvelopes((prev) => {
          const next = mergeEnvelopes(prev, [env]);
          if (next !== prev) setScrubIndex(next.length - 1);
          return next;
        });
      },
      (status) => setLiveStatus(status),
    );
  }, []);

  // Live watchdog (operator 2026-11-07: "the ledger still not updating by
  // itself — once refreshing the page, I had more entries"): every 20 s
  // while live, ask the gateway for anything after the last envelope held.
  // If it has newer events and the tail has been silent for 15 s, the tail
  // stalled (or was refused): take the missing events, reconnect from them,
  // and say so in the console. A healthy tail delivers within a second, so
  // it is never raced.
  const envelopesRef = useRef(envelopes);
  envelopesRef.current = envelopes;
  useEffect(() => {
    if (!live || sourceKind !== "gateway" || !entityName) return;
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    let busy = false;
    let cancelled = false; // this effect's run ended (left live, switched entity)
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const held = envelopesRef.current;
        const last = held.length > 0 ? held[held.length - 1].seq : 0;
        const heardAt = lastEnvelopeAtRef.current ?? 0;
        const silentMs = Date.now() - heardAt;
        if (silentMs < LIVE_STALL_MS) return;
        // From the start of the last held seq's base: a gateway marker
        // written during the stall can carry a fraction of a seq the page
        // already holds; the merge drops what is already held.
        const fetched = await fetchReplay(base, entityName, Math.max(0, Math.floor(last) - 1));
        // Act only if nothing moved meanwhile: still this live run, and the
        // tail did not deliver while we asked (activity resuming is not a
        // stall).
        if (cancelled || (lastEnvelopeAtRef.current ?? 0) !== heardAt) return;
        const next = mergeEnvelopes(envelopesRef.current, fetched);
        if (next === envelopesRef.current) return;
        const added = next.length - envelopesRef.current.length;
        console.warn(`#FALLBACK live tail silent for ${Math.round(silentMs / 1000)} s while the gateway had ${added} event(s) the page lacked: caught up and reconnected`);
        setEnvelopes(next);
        setScrubIndex(next.length - 1);
        startTail(base, entityName, next[next.length - 1].seq);
      } catch {
        // the next check tries again; the header shows the tail's own state
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(check, LIVE_CHECK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [live, sourceKind, entityName, gatewayUrl, startTail]);

  useEffect(() => {
    if (!live) {
      setLiveAgeS(null);
      return;
    }
    const tick = () => {
      const at = lastEnvelopeAtRef.current;
      setLiveAgeS(at !== null ? Math.round((Date.now() - at) / 1000) : null);
    };
    tick();
    const interval = window.setInterval(tick, 5000);
    return () => window.clearInterval(interval);
  }, [live]);

  useEffect(() => {
    // One-shot graph-sync check per gateway (the artifact is global). A
    // drift result also lands in the console with the full detail.
    // GATED like every other gateway read (impl adversary P2-4): no
    // pre-auth fetch, no fetch in file/demo modes — the F14 content-gate
    // rule covers the sync probe too.
    let cancelled = false;
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    if (!base || sourceKind !== "gateway" || !authVerified) {
      setSpecDrift(null);
      return;
    }
    checkSpecSync(base, gatewayReadHeaders({ Accept: "application/json" }))
      .then((r) => {
        if (cancelled) return;
        if (r.status === "drift") {
          console.warn("#FALLBACK one-graph drift:", r.detail, r);
          setSpecDrift(r);
        } else if (r.status === "modulated" || r.overlay) {
          // The operator modulated the dials: legacy one-morning wire =
          // status "modulated" (served bytes mutated); v12 overlay wire
          // (c-t-i #357) = a MATCH carrying overlay.edit_seq beside the
          // untouched structural sha. Both render the quiet 🎛 note,
          // never the drift warning.
          setSpecDrift(r);
        } else {
          setSpecDrift(null);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [gatewayUrl, sourceKind, authVerified]);

  useEffect(() => {
    // ONE mind per entity, GATEWAY-OWNED (maintainer ruling 2026-07-09 06:32):
    // its own choice, or null = the Gateway default (round 3).
    if (!entityName) {
      setSubstrate(null);
      return;
    }
    let cancelled = false;
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    getEntitySubstrate(base, entityName)
      .then((stored) => {
        if (!cancelled) setSubstrate(substrateChoiceOf(stored));
      })
      .catch(() => {
        if (!cancelled) setSubstrate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [entityName, gatewayUrl]);

  useEffect(() => {
    // The entity's HANDLE (`castor@<declared address>`, GW-F item 5):
    // display-only reachability — shown in the header, NEVER a storage or
    // lookup key (O-B: UI keys stay on the slug; the address may change).
    // Gated on verified auth like every other gateway read (F14).
    if (sourceKind !== "gateway" || !entityName || !authVerified) {
      setHandle(null);
      return;
    }
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    let cancelled = false;
    listEntities(base)
      .then((list) => {
        if (cancelled) return;
        const row = list.find((e) => e.slug === entityName);
        setHandle(row?.handle ?? null);
      })
      .catch(() => !cancelled && setHandle(null));
    return () => {
      cancelled = true;
    };
  }, [sourceKind, entityName, gatewayUrl, authVerified]);

  useEffect(() => {
    // Boot sources, by precedence:
    //   ?gateway=<base>&entity=<slug>[&live=0]  open a served home directly
    //   ?src=<url>                              load any exported stream
    //   (default)                               the bundled demo life
    const params = new URLSearchParams(window.location.search);
    const entityParam = (params.get("entity") || "").trim();
    const gatewayParam = (params.get("gateway") || "").trim().replace(/\/+$/, "");
    // LIVE IS THE DEFAULT for a served home (maintainer, 2026-07-09: first
    // launch must land on his present, not replay the archive from seq 0).
    // ?live=0 opts into replay-from-the-start for archive study; the
    // timeline scrub leaves live mode at any moment either way.
    const wantReplay = ["0", "false", "no", "replay"].includes((params.get("live") || "").trim().toLowerCase());
    // Deep link to the blueprint (laurent dm#147 via c4018): a refresh or
    // a shared URL lands back on the map instead of the roster. ONE law
    // (pageFromSearch) decides — the entity param wins when both present.
    if (!entityParam) setIndexPage(pageFromSearch(window.location.search));
    // NO ?token= seeding (maintainer ruling 2026-07-09, screenshot in hand:
    // auth must be EXACTLY AbstractFlow's — gateway sign-in -> session
    // cookies -> the app's own /api proxy). The connect modal is the ONLY
    // auth door; a credential in a URL leaks into history/screenshots and
    // was explicitly rejected. Stale ?token= params are ignored (and
    // scrubbed from pushed URLs below).
    if (entityParam) {
      setGatewayUrl(gatewayParam);
      setEntityName(entityParam);
      setIndexBase(gatewayParam); // back-navigation home exists
      // A long life is a BIG stream (castor: ~98 MB / 67k events) — load it
      // progressively so the graph fills as it arrives instead of looking
      // empty/broken for the whole fetch (maintainer, 2026-07-09 04:32:
      // "this is not castor"). GATED ON VERIFIED AUTH (2026-07-10 20:56):
      // an unverified browser must not even FETCH a life; the stream waits
      // for the confirming probe, drained by the auth effect below.
      loadEnvelopes([], "gateway", `${entityParam} @ ${gatewayParam || "this gateway"}`);
      const bootEpoch = ++streamEpochRef.current;
      const freshBoot = () => bootEpoch === streamEpochRef.current;
      const runBootStream = () => {
        if (!freshBoot()) return; // superseded by a click before drain (F1)
        // The base is read LIVE, not from the boot closure: the silent auth
        // check may have converged a ?gateway= deep link onto the page
        // origin's proxy by the time this deferred stream drains.
        const streamBase = gatewayUrlRef.current.trim().replace(/\/+$/, "");
        setBootProgress("loading his life…");
        // Cache-first (operator 2026-07-15 dm#10, slow journey load): a
        // previously seen life paints INSTANTLY from IndexedDB and only
        // the delta rides the wire (append-only journal ⇒ the cached
        // prefix stays true; lineage-checked against the journal head).
        openLifeStream(streamBase, entityParam, (all, bytes) => {
          if (!freshBoot()) return;
          setEnvelopes([...all]);
          setScrubIndex(all.length - 1);
          setBootProgress(`loading his life… ${all.length.toLocaleString()} events${bytes > 0 ? ` · ${(bytes / 1048576).toFixed(0)} MB` : ""}`);
        })
          .then((history) => {
            if (!freshBoot()) return;
            setBootProgress(null);
            if (!wantReplay) {
              startTail(streamBase, entityParam, history.length > 0 ? history[history.length - 1].seq : 0);
            } else {
              setScrubIndex(-1);
              setPlaying(history.length > 0);
            }
          })
          .catch((e) => {
            if (!freshBoot()) return;
            setBootProgress(null);
            setError(`Could not open ${entityParam}: ${String((e as Error).message || e)}`);
          });
      };
      if (authVerifiedRef.current) runBootStream();
      else pendingStreamRef.current = runBootStream;
      return () => tailRef.current?.close();
    }
    const srcParam = params.get("src");
    if (!srcParam) {
      // No entity, no file: find the gateway (0010 121500Z + maintainer
      // 2026-07-10: "default is 8080"). Candidates in order: ?gateway= /
      // same-origin (the proxy posture) → the cli-injected config → the
      // STANDARD local gateway port. A 401/403 answer still counts as a
      // gateway FOUND (the index prompts sign-in); only unreachable moves
      // on. The demo stays the fallback for standalone use.
      const injected = (
        (window as unknown as { __ABSTRACT_UI_CONFIG__?: { gateway_url?: string } }).__ABSTRACT_UI_CONFIG__?.gateway_url || ""
      )
        .trim()
        .replace(/\/+$/, "");
      // Candidate order: explicit param > same-origin ("" — the PROXY
      // posture; when the page is served by this app's CLI, its
      // /api/gateway/* proxy is the contract path and cookies carry the
      // session) > the base a stored bearer was verified against (audit
      // V3: a credential without its base re-asked on every refresh) >
      // injected config > the standard local gateway port.
      const storedBase = (loadStoredAuth()?.base || "").trim().replace(/\/+$/, "");
      const candidates = [...new Set([gatewayParam, "", storedBase, injected, "http://127.0.0.1:8080"])];
      const adopt = (base: string) => {
        setGatewayUrl(base);
        setSourceKind("gateway");
        setSourceLabel(`entities @ ${base || "this gateway"}`);
        setIndexBase(base);
      };
      const tryNext = (i: number): void => {
        if (i >= candidates.length) {
          loadDemoOrSrc(null);
          return;
        }
        listEntities(candidates[i])
          .then(() => adopt(candidates[i]))
          .catch((e: Error & { status?: number }) => {
            if (e.status === 401 || e.status === 403) adopt(candidates[i]);
            else tryNext(i + 1);
          });
      };
      tryNext(0);
      return () => tailRef.current?.close();
    }
    loadDemoOrSrc(srcParam);
    function loadDemoOrSrc(src: string | null) {
      const url = src && src.trim() ? src.trim() : DEMO_URL;
      const label = src ? url.split("/").pop() || url : "demo life — Castor";
      fetch(url)
        .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((text) => {
          const { envelopes: parsed, errors } = parseNdjson(text);
          if (errors.length) console.warn("#FALLBACK: NDJSON parse errors", errors.slice(0, 3));
          if (parsed.length === 0) {
            setError(`No stream envelopes at ${url}.`);
            return;
          }
          loadEnvelopes(parsed, src ? "file" : "demo", label);
        })
        .catch(() =>
          setError(
            src
              ? `Could not load ${url}. Drop an exported .ndjson life, or connect a gateway.`
              : "Demo data not found. Drop an exported .ndjson life, or connect a gateway.",
          ),
        );
    }
    return () => tailRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = useCallback(
    (ev: React.DragEvent) => {
      ev.preventDefault();
      const file = ev.dataTransfer.files?.[0];
      if (!file) return;
      // INTENT DISCRIMINATION (laurent c3083: a PDF dropped on the page
      // was parsed as an NDJSON life-stream — "No stream envelopes in
      // article_01_nature_submission.pdf (762 bad lines)"). This loader
      // exists for ONE thing: exported .ndjson lives. Anything else gets
      // a teaching refusal pointing at the real attachment lane (the chat
      // panel hands files into the entity's workspace), never a parse
      // error over a file that was never a stream.
      const name = file.name.toLowerCase();
      const streamShaped = /\.(ndjson|jsonl|json)$/.test(name);
      if (!streamShaped) {
        setError(
          `"${file.name}" is not a life-stream export — this page loads exported .ndjson lives. ` +
            `To hand a file to the entity, open the chat and drop it on the conversation panel (it lands in the workspace, readable with read_file).`,
        );
        return;
      }
      file.text().then((text) => {
        const { envelopes: parsed, errors } = parseNdjson(text);
        if (parsed.length === 0) {
          setError(`No stream envelopes in ${file.name}${errors.length ? ` (${errors.length} bad lines)` : ""}.`);
          return;
        }
        loadEnvelopes(parsed, "file", file.name);
      });
    },
    [loadEnvelopes],
  );

  // ------------------------------------------------------- gateway auth
  const disconnectGateway = useCallback(async () => {
    if (proxyModeRef.current) {
      // End the server-side gateway session + clear the first-party cookies
      // (the ONE disconnect the contract allows to re-ask for sign-in).
      await proxyConnectionLogout();
    }
    setGatewayToken(null);
    storeAuth(null);
    try {
      localStorage.removeItem("abstractobserver_entity_token"); // legacy key
    } catch {
      // best-effort
    }
    setAuthState(null);
    setAccountStatus(null);
    setAuthVerified(false); // lock the content gate again
    setControlNote("Disconnected — this browser holds no gateway credential.");
  }, []);

  /** 401/403 on a door write while the UI believed it was authed. The
   * contract fix (audit V6/W2): ONE silent re-check first — a transient
   * refusal, a CSRF hiccup, or a non-auth 403 must not nuke a valid
   * session into a sign-in demand loop. Only a re-check that itself says
   * "refused" reopens the sign-in. */
  const handleAuthRefused = useCallback(async () => {
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    if (proxyModeRef.current) {
      const status = await proxyConnectionStatus();
      if (status.ok) {
        setControlNote("The door refused that action, but your sign-in is valid — the refusal was about the action, not you.");
        return;
      }
    } else if (authState?.token) {
      const probe = await classifyOperatorAuth(base, authState.token);
      if (probe.kind === "operator") {
        setControlNote("The door refused that action, but your sign-in is valid — the refusal was about the action, not you.");
        return;
      }
      if (probe.kind === "unreachable") {
        setControlNote(`The gateway is not answering (${probe.error}) — your sign-in is kept; retry when it is back.`);
        return;
      }
    }
    setAuthVerified(false);
    setControlNote("The gateway no longer accepts this browser's sign-in — please connect again.");
    setShowAuth(true);
  }, [authState, gatewayUrl]);

  // --------------------------------------------- the ONE state poll
  // All four state axes refresh together on one clock (state-wave fix:
  // four unsynchronized cadences — 30s state / 15s loop / 15s life /
  // 15s cognition — meant every window between them could lie). A
  // monotonic epoch guards ordering: responses from a superseded round
  // (an in-flight poll racing an action's reconcile) are DROPPED, never
  // painted over fresher truth (adversary find: the stale-poll-overwrites-
  // action race).
  const stateEpochRef = useRef(0);
  /** The phase bar's read (GET life_state): by the poll (now the fallback, contract §5), after each
   * phase act, and when the stream carries a newer phase marker. The highest rev wins (an older
   * answer never repaints a newer bar); the epoch only drops answers about another entity. */
  const phaseEpochRef = useRef(0);
  /** The bar's writes in flight (phase_bar_writes.ts): a toggle or Resume at a time; Stop, the
   * kill switch, in its own lane that never waits. */
  const phaseWritesRef = useRef(new PhaseWrites());
  const readPhaseBar = useCallback(() => {
    if (sourceKind !== "gateway" || !entityName || !authVerifiedRef.current) return;
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    const epoch = phaseEpochRef.current;
    getPhaseBar(base, entityName)
      .then((wire) => {
        if (epoch !== phaseEpochRef.current) return;
        const next = phaseBarRead(wire);
        setPhaseRead((cur) => adoptPhaseRead(cur, next));
      })
      .catch((e: Error) => epoch === phaseEpochRef.current && setPhaseRead((cur) => adoptPhaseRead(cur, { kind: "failed", sentence: `Could not read his phase: ${e.message || "the gateway did not answer"}.` })));
  }, [sourceKind, entityName, gatewayUrl]);
  const refreshEntityTruth = useCallback(() => {
    // THE CONTENT GATE covers every entry path (impl adversary P1-1, the
    // F14 regression class): the drawer's unmount cleanup fires the
    // visit-signal flip on Disconnect, which used to fire five fetches on
    // a LOCKED browser — and on a dev-read-posture gateway they succeeded
    // and repopulated state behind the lock. The ref (not the closure)
    // reads the CURRENT gate at call time.
    if (sourceKind !== "gateway" || !entityName || !authVerifiedRef.current) return;
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    const epoch = ++stateEpochRef.current;
    const fresh = () => epoch === stateEpochRef.current;
    getLoopStatus(base, entityName)
      .then((s) => fresh() && setLoopStatus(s))
      .catch(() => fresh() && setLoopStatus(null));
    // The phase, its toggles and the kill switch: served whole by life_state (the phase bar).
    readPhaseBar();
    // Billed spend + working truth (B3 wire). Null on older gateways —
    // the header keeps the labeled input-side estimate then.
    getEntityCognition(base, entityName)
      .then((c) => fresh() && setCognition(c))
      .catch(() => fresh() && setCognition(null));
    // Footprint (bytes at rest) — feature-detected: null on a gateway that
    // predates the route, and the health panel shows the labeled gap.
    fetchEntityFootprint(base, entityName)
      .then((f) => fresh() && setFootprint(f))
      .catch(() => fresh() && setFootprint(null));
  }, [sourceKind, entityName, gatewayUrl, readPhaseBar]);
  // One entity's phase never shows under another's name: a switch (or a lock) starts the bar over.
  // Declared before the poll so the poll's first read belongs to the new epoch.
  useEffect(() => {
    phaseEpochRef.current += 1;
    phaseWritesRef.current.reset();
    setPhaseRead({ kind: "loading" });
    setPhaseUi({ busy: null, confirm: null });
    setPhaseNote(null);
  }, [sourceKind, entityName, gatewayUrl, authVerified]);
  useEffect(() => {
    // CONTENT GATE extends to the POLLS (code adversary F14): an
    // unverified browser must not even FETCH state/loop/cognition — the
    // 2026-07-10 20:56 ruling covers reads, and dev-read-posture gateways
    // would answer them.
    if (sourceKind !== "gateway" || !entityName || !authVerified) {
      setLoopStatus(null);
      setCognition(null);
      // The drawer's first-hand visit signal dies with the room (belt —
      // the drawer's unmount cleanup fires it too).
      setClientVisit(null);
      // The index-page axis resets to the URL'S RECORDED INTENT, never a
      // hardcoded roster (deep-link adversary P0-1: this raw reset fired
      // three times across a deep-linked boot — mount, gateway adoption,
      // auth verification — and clobbered ?page=blueprint every time; the
      // headline promise "refresh lands back on the map" failed. Deriving
      // from the URL fixes boot, adoption, auth flips, and re-auth in one
      // place; the placement-P1-1 concern stays satisfied because an
      // entity param in the URL maps to roster in pageFromSearch).
      setIndexPage(pageFromSearch(window.location.search));
      setFootprint(null);
      return;
    }
    refreshEntityTruth();
    const interval = window.setInterval(refreshEntityTruth, 15000);
    return () => {
      window.clearInterval(interval);
    };
  }, [sourceKind, entityName, gatewayUrl, authState, authVerified, refreshEntityTruth]);

  /** The drawer's visit signal, folded into state + an IMMEDIATE truth
   * refresh on the open/close boundary (dm#94 render adversary P0-3:
   * every visit open used to begin with a guaranteed ≤15s co-render
   * window — header on the pre-visit phase, drawer already in the room —
   * because nothing collapsed the poll clock). Mid-turn transitions do
   * NOT re-poll (each turn would double the fetch load for no new truth). */
  const clientVisitOpenRef = useRef(false);
  const handleVisitStateChange = useCallback(
    (sig: ClientVisitSignal | null) => {
      setClientVisit(sig);
      const open = Boolean(sig?.open);
      if (open !== clientVisitOpenRef.current) {
        clientVisitOpenRef.current = open;
        refreshEntityTruth();
      }
    },
    [refreshEntityTruth],
  );

  // A gateway source whose browser is not yet VERIFIED shows no content
  // (the critical content gate). File/demo sources are never locked.
  const gatewayLocked = sourceKind === "gateway" && !authVerified;
  /** A visit is in the room: the served phase says so, or this app's own drawer conducts one (its
   * first-hand knowledge, dm#94: a live conversation never renders under another phase word). */
  const visiting = (phaseRead.kind === "served" && phaseRead.bar.phase === "visit") || Boolean(clientVisit?.open);

  /** The mind history, marker-derived (c1430 ask 3: "which llm was behind
   * during which time" answerable from the stream): every substrate_changed
   * host marker folds into one line. Renders as the 🧠 control's tooltip
   * and each change is also a ledger line in place. */
  // Incremental fold (code adversary F4): a full scan per envelope was
  // O(N) × live-tail cadence. The cache appends from where it left off and
  // rebuilds only when the array identity shrank or the tail seq moved
  // backward (retrograde host-marker inserts land mid-array).
  const substrateTimelineCacheRef = useRef<{ upTo: number; tailSeq: number; lines: string[] }>({ upTo: 0, tailSeq: -Infinity, lines: [] });
  const substrateTimeline = useMemo(() => {
    const fmt = (v: unknown): string => {
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        const prov = typeof o["provider"] === "string" && o["provider"] ? String(o["provider"]) : "";
        const model = typeof o["model"] === "string" && o["model"] ? String(o["model"]) : "";
        if (prov || model) return [prov, model].filter(Boolean).join("/");
      }
      return "unset";
    };
    const cache = substrateTimelineCacheRef.current;
    const lastCovered = cache.upTo > 0 && cache.upTo <= envelopes.length ? envelopes[cache.upTo - 1] : null;
    const appendable = cache.upTo <= envelopes.length && (cache.upTo === 0 || (lastCovered !== null && lastCovered.seq === cache.tailSeq));
    if (!appendable) {
      cache.upTo = 0;
      cache.tailSeq = -Infinity;
      cache.lines = [];
    }
    for (let i = cache.upTo; i < envelopes.length; i++) {
      const env = envelopes[i];
      if (env.family === "host") {
        const p = env.payload as { kind?: string; old?: unknown; new?: unknown; by?: string } | null;
        if (p && p.kind === "substrate_changed") {
          const at = String(env.observed_at || "").slice(0, 16).replace("T", " ");
          cache.lines.push(`${at}: ${fmt(p.old)} → ${fmt(p.new)}${typeof p.by === "string" && p.by ? ` (by ${p.by})` : ""}`);
        }
      }
    }
    cache.upTo = envelopes.length;
    cache.tailSeq = envelopes.length > 0 ? envelopes[envelopes.length - 1].seq : -Infinity;
    return [...cache.lines];
  }, [envelopes]);

  /** When the substrate LAST changed (ISO) — feeds the two-minded cue in
   * the Mind tab (grant-audit finding: the picker said one model while a
   * loop spawned earlier still spoke another, with no restart-to-apply
   * cue anywhere). Derived from the same stream markers as the timeline. */
  const lastSubstrateChangeAt = useMemo(() => {
    for (let i = envelopes.length - 1; i >= 0; i--) {
      const env = envelopes[i];
      if (env.family === "host" && (env.payload as { kind?: string } | null)?.kind === "substrate_changed") {
        return String(env.observed_at || "") || null;
      }
    }
    return null;
  }, [envelopes]);

  /** Session cognition meter (B3, laurent 04:58: "i am unclear when it's
   * working and consuming credits"). Derived from the home stream — every
   * snapshot is one prompt build (one LLM call) and carries its context
   * token estimate. Scanned backward from the tail to the last summon/wake
   * marker (bounded: one session's envelopes). This is the INPUT-side
   * estimate the stream carries; true billed usage lives in run ledgers
   * (gateway/runtime's B3 half) and replaces this the day the door serves
   * it. */
  const cognitionMeter = useMemo(() => {
    let calls = 0;
    let tokens = 0;
    // BOUNDED backward scan (code adversary F5): home-direct lives write
    // no summon/wake markers, so an unbounded walk visited ~90k envelopes
    // per arrival at operator scale. 4000 envelopes comfortably covers a
    // session; past it the meter is a labeled estimate anyway.
    const floor = Math.max(0, envelopes.length - 4000);
    for (let i = envelopes.length - 1; i >= floor; i--) {
      const env = envelopes[i];
      if (env.family === "host") {
        const kind = String((env.payload as { kind?: unknown })?.kind || "");
        if (kind === "summon" || kind === "wake") break;
      }
      if (env.family === "snapshot") {
        calls += 1;
        const est = Number((env.payload as { prompt_token_estimate?: unknown })?.prompt_token_estimate);
        if (Number.isFinite(est)) tokens += est;
      }
    }
    return { calls, tokens };
  }, [envelopes]);
  /** WORKING: the gateway's store-read truth when the B3 wire answers
   * (loop mid-day OR live visit executing — gateway c1390); otherwise the
   * stream heuristic (envelopes landed moments ago). */
  const workingNow = cognition ? cognition.working : live && liveAgeS !== null && liveAgeS < 30;

  /** THE PHASE BAR'S ACTS (operator ruling 2026-11-08; phase_bar.ts phaseActPlan). A toggle PUTs
   * the toggle and the gateway says what it means now (during a visit, say); Stop and "sleep now"
   * ask first, in the bar; Resume acts at once; the visit pill opens the conversation as the Chat
   * tab's button does. Every answer's sentence shows, and every act ends with a fresh read. Stop is
   * the kill switch: it goes out at once even with a toggle in flight, and that toggle's late answer
   * never repaints over the stopped view (the highest rev wins, phase_bar_writes.ts). */
  const settlePhaseWrite = useCallback(
    (wire: PhaseWire) => {
      // Only "sleep now" settles here (its answer can be long; sleepNow).
      const out = phaseWriteOutcome(wire, "sleep");
      if (out.bar) {
        const bar = out.bar;
        setPhaseRead((cur) => adoptPhaseBar(cur, bar));
      }
      setPhaseNote(out.sentence);
      if (wire.status === 401) void handleAuthRefused();
      refreshEntityTruth();
    },
    [refreshEntityTruth, handleAuthRefused],
  );
  const runPhaseWrite = useCallback(
    (act: PhaseBarAct, send: (base: string, token: string | null) => Promise<PhaseWire>, after?: (out: PhaseWriteOutcome) => void) => {
      if (sourceKind !== "gateway" || !entityName) return;
      const epoch = phaseEpochRef.current;
      const base = gatewayUrl.trim().replace(/\/+$/, "");
      const token = controlToken.trim() || null;
      phaseWritesRef.current.run(act, () => send(base, token), {
        current: () => epoch === phaseEpochRef.current,
        adopt: (bar) => setPhaseRead((cur) => adoptPhaseBar(cur, bar)),
        note: setPhaseNote,
        ui: setPhaseUi,
        refresh: refreshEntityTruth,
        authRefused: () => void handleAuthRefused(),
        after,
      });
    },
    [sourceKind, entityName, gatewayUrl, controlToken, refreshEntityTruth, handleAuthRefused],
  );
  /** "Sleep now" (contract O7): the maintenance pass runs inside this request and can be long, so
   * the bar does not wait on it: a re-read shows the sleep, the stream then shows the wake; the
   * answer still reports a refusal ("already resting") when one comes back. */
  const sleepNow = useCallback(() => {
    if (sourceKind !== "gateway" || !entityName || phaseWritesRef.current.held()) return;
    const epoch = phaseEpochRef.current;
    setPhaseUi((u) => ({ ...u, confirm: null }));
    setPhaseNote(null);
    postSleepNow(gatewayUrl.trim().replace(/\/+$/, ""), entityName, controlToken.trim() || null)
      .then((wire) => {
        if (epoch !== phaseEpochRef.current) return;
        if (wire.status < 200 || wire.status >= 300) settlePhaseWrite(wire);
        else refreshEntityTruth();
      })
      .catch((e: Error) => epoch === phaseEpochRef.current && setPhaseNote(`The gateway did not answer: ${e.message || "no response"}.`));
    window.setTimeout(() => epoch === phaseEpochRef.current && readPhaseBar(), 800);
  }, [sourceKind, entityName, gatewayUrl, controlToken, settlePhaseWrite, refreshEntityTruth, readPhaseBar]);
  const actOnPhase = useCallback(
    (act: PhaseBarAct) => {
      // Stop is never held by a write in flight (the kill switch); every other act waits its turn.
      if (act !== "stop" && phaseWritesRef.current.held()) return;
      const plan = phaseActPlan(phaseRead, act);
      setPhaseNote(null);
      switch (plan.kind) {
        case "none":
          return;
        case "refused":
          setPhaseNote(plan.sentence);
          return;
        case "show_visit":
          setRequestedTab({ tab: "chat", nonce: Date.now() });
          return;
        case "open_visit":
          setRequestedTab({ tab: "chat", nonce: Date.now() });
          setVisitKnock((n) => n + 1);
          return;
        case "confirm":
          setPhaseUi((u) => ({ ...u, confirm: plan.confirm }));
          return;
        case "toggle":
          runPhaseWrite(plan.key, (base, token) => putPhaseToggle(base, entityName, plan.key, plan.on, token));
          return;
        case "resume":
          runPhaseWrite("resume", (base, token) => postLifecycle(base, entityName, "resume", token));
          return;
        case "retry":
          runPhaseWrite("retry", (base, token) => postLifecycle(base, entityName, "retry", token));
          return;
        case "stop":
          // Stop again while stopped: retries what the last stop left, at once.
          runPhaseWrite("stop", (base, token) => postLifecycle(base, entityName, "stop", token));
          return;
      }
    },
    [phaseRead, entityName, runPhaseWrite],
  );
  const confirmPhaseAct = useCallback(() => {
    const kind = phaseUi.confirm;
    if (kind === "stop") runPhaseWrite("stop", (base, token) => postLifecycle(base, entityName, "stop", token));
    else if (kind === "sleep") sleepNow();
    else if (kind === "resume_visit")
      // "Resume and visit" (contract §6.1): two visible acts — resume, then (once he runs again)
      // the visit opens as the visit pill opens it. Never a silent bypass of the stop.
      runPhaseWrite(
        "resume",
        (base, token) => postLifecycle(base, entityName, "resume", token),
        (out) => {
          if (!out.ok || !out.bar || out.bar.stopped) return;
          setRequestedTab({ tab: "chat", nonce: Date.now() });
          setVisitKnock((n) => n + 1);
        },
      );
  }, [phaseUi.confirm, entityName, runPhaseWrite, sleepNow]);
  const cancelPhaseConfirm = useCallback(() => setPhaseUi((u) => ({ ...u, confirm: null })), []);
  const phaseView = phaseBarView(phaseRead, phaseUi);

  const openEntity = useCallback(
    async (name: string, opts: { pushUrl?: boolean; joinRoom?: boolean } = {}) => {
      setError(null);
      const base = gatewayUrl.trim().replace(/\/+$/, "");
      // ONE stream epoch (code adversary F1 P0): a slow 92MB load racing a
      // second roster click could finish LAST and paint one mind under
      // another's name — every batch/tail below checks it, and goToIndex
      // bumps it so zombie loads die on the roster too.
      const epoch = ++streamEpochRef.current;
      const freshStream = () => epoch === streamEpochRef.current;
      setEntityName(name);
      loadEnvelopes([], "gateway", `${name} @ ${base || "this gateway"}`);
      // "When I click on the entity, I should join its room" (maintainer,
      // 2026-07-09): land in the chat drawer, ready to talk.
      if (opts.joinRoom !== false) setRequestedTab({ tab: "chat", nonce: Date.now() });
      // Deep links stay shareable (0010 121500Z item 3); the token never
      // rides a pushed URL. The BASE does (direct posture only): a pushed
      // ?entity= without its ?gateway= made refresh re-resolve the base
      // from scratch and lose the credential's target (audit V3 — the
      // refresh re-ask). Proxy posture pushes no gateway param: the page
      // origin IS the base, and the cookie survives refresh by itself.
      if (opts.pushUrl !== false) {
        const url = new URLSearchParams(window.location.search);
        url.set("entity", name);
        url.delete("token");
        url.delete("page"); // an entity view is not the blueprint (dm#147 param stays honest)
        if (base) url.set("gateway", base);
        else url.delete("gateway");
        window.history.pushState({ entity: name }, "", `${window.location.pathname}?${url.toString()}`);
      }
      // The life STREAM is gated on verified auth (2026-07-10 20:56): if the
      // browser is not yet verified, defer the fetch — the render gate shows
      // the sign-in, and the auth effect drains this the moment a confirming
      // probe/sign-in lands. No life is fetched for an unverified browser.
      const runStream = async () => {
        if (!freshStream()) return;
        // Proxy convergence may rewrite the base between click and drain
        // (F15): read the live ref at run time, never the click capture.
        const liveBase = gatewayUrlRef.current.trim().replace(/\/+$/, "") || base;
        setBootProgress("loading his life…");
        try {
          // Cache-first, same as the deep-link boot path (dm#10).
          const history = await openLifeStream(liveBase, name, (all, bytes) => {
            if (!freshStream()) return;
            setEnvelopes([...all]);
            setScrubIndex(all.length - 1);
            setBootProgress(`loading his life… ${all.length.toLocaleString()} events${bytes > 0 ? ` · ${(bytes / 1048576).toFixed(0)} MB` : ""}`);
          });
          if (!freshStream()) return;
          setBootProgress(null);
          if (history.length > 0) setScrubIndex(history.length - 1);
          startTail(liveBase, name, history.length > 0 ? history[history.length - 1].seq : 0);
        } catch (e) {
          if (!freshStream()) return;
          setBootProgress(null);
          setError(`Replay read failed: ${String((e as Error).message || e)}`);
        }
      };
      if (authVerifiedRef.current) void runStream();
      else pendingStreamRef.current = () => void runStream();
    },
    [gatewayUrl, loadEnvelopes, startTail],
  );

  /** Back to the entities index (the manager home). */
  const goToIndex = useCallback(
    (opts: { pushUrl?: boolean } = {}) => {
      streamEpochRef.current += 1; // kill any in-flight life load (F1)
      pendingStreamRef.current = null;
      tailRef.current?.close();
      tailRef.current = null;
      setLive(false);
      setLiveStatus(null);
      setPlaying(false);
      setEntityName("");
      setEnvelopes([]);
      setScrubIndex(-1);
      setSelectedId(null);
      setRecallPreview(null);
      // ALL state axes clear together (adversary P0: cognition/serverLife
      // survived the index return, painting Castor's working pulse +
      // billed spend over the roster — a same-screen cross-entity lie).
      setLoopStatus(null);
      setPhaseRead({ kind: "loading" });
      setCognition(null);
      setFootprint(null);
      // Modal/search state never survives navigation (func review P1: a
      // Settings modal open at Back-time silently re-opened on the next
      // entity; a stale query invisibly dimmed the next graph).
      setShowSettings(false);
      setSearchOpen(false);
      setSearchText("");
      setSourceKind("gateway");
      setSourceLabel(`entities @ ${gatewayUrl.trim() || "this gateway"}`);
      setIndexBase(gatewayUrl.trim().replace(/\/+$/, ""));
      if (opts.pushUrl !== false) {
        const url = new URLSearchParams(window.location.search);
        url.delete("entity");
        url.delete("live");
        url.delete("token");
        url.delete("page");
        const qs = url.toString();
        window.history.pushState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      }
    },
    [gatewayUrl],
  );

  useEffect(() => {
    // Back/forward honor the URL: ?entity= selects, absence is the index.
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const entityParam = (params.get("entity") || "").trim();
      if (entityParam) {
        void openEntity(entityParam, { pushUrl: false });
      } else if (indexBase !== null) {
        goToIndex({ pushUrl: false });
        // Back/forward honor the deep link BOTH directions (deep-link
        // adversary P1-2: the old one-directional restore left the screen
        // on the map after popping to a roster URL). One law decides.
        navigateIndexPage(pageFromSearch(window.location.search), { pushUrl: false });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openEntity, goToIndex, indexBase, navigateIndexPage]);

  // ------------------------------------------------------------- live tail

  const toggleLive = useCallback(() => {
    if (live) {
      tailRef.current?.close();
      tailRef.current = null;
      setLive(false);
      setLiveStatus(null);
      return;
    }
    if (sourceKind !== "gateway" || !entityName) return;
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    setScrubIndex(envelopes.length - 1);
    const cursor = envelopes.length > 0 ? envelopes[envelopes.length - 1].seq : 0;
    startTail(base, entityName, cursor);
  }, [live, sourceKind, entityName, gatewayUrl, envelopes, startTail]);

  // ------------------------------------------------------------- playback

  // Two clocks (replay_clock.ts): the head advances every animation frame by
  // elapsed time × speed and the time panel follows it frame by frame; the
  // page (fold, graph, ledger, Detail, side panels) follows at a paced rate
  // — never sooner than twice the main-thread time its commits take, and
  // from 200x at most 10 times a second. A commit sets the fold index with
  // the position (playback only moves forward, where the fold effect below
  // would set it one render later): one page render per commit, not two.
  // Speed is read live, so changing it never restarts the loop.
  const playhead = useMemo(createPlayhead, []);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const scrubIndexRef = useRef(scrubIndex);
  scrubIndexRef.current = scrubIndex;
  useEffect(() => {
    if (!playing || live) return;
    const maxIndex = envelopes.length - 1;
    let state = startPlay(scrubIndexRef.current, performance.now());
    let raf = 0;
    const step = (now: number) => {
      const frame = playFrame(state, now, speedRef.current, maxIndex);
      state = frame.state;
      playhead.set(frame.head);
      if (frame.commit !== null) {
        setScrubIndex(frame.commit);
        setFoldIndex(frame.commit);
      }
      if (frame.done) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      playhead.set(null);
    };
  }, [playing, live, envelopes.length, playhead]);

  // ------------------------------------------------------------- the fold

  const effectiveIndex = live ? envelopes.length - 1 : scrubIndex;

  // The newest change to the entity, settled for 2 s so a burst (one tick
  // forms several memories) refreshes once. Surfaces that read the gateway
  // rather than the stream key on it.
  const lifeChange = useMemo(() => lastLifeChangeSeq(envelopes), [envelopes]);
  /** Counts the entity's changes seen LIVE: the first settled value after a
   * load is the baseline (loading a life is not a change), and nothing
   * counts while the history is still streaming in (not live yet). */
  const [lifeTicks, setLifeTicks] = useState(0);
  const lifeBaselineRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    lifeBaselineRef.current = undefined;
  }, [entityName, sourceKind]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!live || lifeBaselineRef.current === undefined) {
        lifeBaselineRef.current = lifeChange;
        return;
      }
      if (lifeChange !== lifeBaselineRef.current) {
        lifeBaselineRef.current = lifeChange;
        setLifeTicks((n) => n + 1);
      }
    }, 2000);
    return () => window.clearTimeout(t);
  }, [lifeChange, live]);
  /** The Book entry a diary line or mark asked for (shown, never read). */
  const [bookFocus, setBookFocus] = useState<{ id: string; nonce: number } | null>(null);
  /** The side tab on screen (null: none) — the card reads only while shown. */
  const [openTab, setOpenTab] = useState<string | null>(null);
  // The header's state, loop and cognition follow the live stream at once
  // instead of at the next 15 s poll — on a live change only (an entity
  // switch refreshes through the poll effect, not here).
  const refreshTruthRef = useRef(refreshEntityTruth);
  refreshTruthRef.current = refreshEntityTruth;
  useEffect(() => {
    if (lifeTicks > 0) refreshTruthRef.current();
  }, [lifeTicks]);
  // THE PHASE MARKER (contract §5): a `phase_changed` host envelope with a higher rev repaints the
  // bar at once (phase, toggles, stop, sentence), then a re-read brings what comes next, what
  // blocks and the visit/work/sleep facts. A marker no newer than the bar changes nothing.
  // Incremental (the substrate-timeline pattern): appends from where it left off, rebuilds only
  // when the array shrank or its covered tail moved (a retrograde host insert).
  const phaseMarkerCacheRef = useRef<{ upTo: number; tailSeq: number; marker: PhaseMarker | null }>({ upTo: 0, tailSeq: -Infinity, marker: null });
  const phaseMarker = useMemo(() => {
    const cache = phaseMarkerCacheRef.current;
    const lastCovered = cache.upTo > 0 && cache.upTo <= envelopes.length ? envelopes[cache.upTo - 1] : null;
    const appendable = cache.upTo <= envelopes.length && (cache.upTo === 0 || (lastCovered !== null && lastCovered.seq === cache.tailSeq));
    const from = appendable ? cache.upTo : 0;
    cache.marker = highestPhaseMarker(envelopes, from, appendable ? cache.marker : null);
    cache.upTo = envelopes.length;
    cache.tailSeq = envelopes.length > 0 ? envelopes[envelopes.length - 1].seq : -Infinity;
    return sourceKind === "gateway" ? cache.marker : null;
  }, [envelopes, sourceKind]);
  const phaseMarkerRef = useRef(phaseMarker);
  phaseMarkerRef.current = phaseMarker;
  const phaseReadRef = useRef(phaseRead);
  phaseReadRef.current = phaseRead;
  const readPhaseBarRef = useRef(readPhaseBar);
  readPhaseBarRef.current = readPhaseBar;
  const phaseMarkerRev = phaseMarker?.rev ?? 0;
  useEffect(() => {
    const marker = phaseMarkerRef.current;
    if (!marker) return;
    const cur = phaseReadRef.current;
    const painted = adoptPhaseMarker(cur, marker);
    if (painted) setPhaseRead((c) => adoptPhaseMarker(c, marker) ?? c);
    if (painted || cur.kind !== "served") readPhaseBarRef.current();
  }, [phaseMarkerRev]);
  const scrubSeq = effectiveIndex >= 0 && envelopes[effectiveIndex] ? envelopes[effectiveIndex].seq : 0;

  // BACKWARD scrub is a full refold (state-at-T semantics) — debounce it
  // (code adversary F6: dragging the slider left on a 90k life fired one
  // multi-hundred-ms rebuild per pixel). Forward moves are incremental
  // and apply immediately; a backward move waits for 160ms of slider
  // quiet before the ONE rebuild. The slider position + seq display track
  // scrubIndex live, so the drag never feels dead.
  const foldCacheRef = useRef<FoldCache | null>(null);
  const [foldIndex, setFoldIndex] = useState(-1);
  const foldDebounceRef = useRef<number | null>(null);
  useEffect(() => {
    const coveredIndex = foldCacheRef.current?.index ?? -1;
    const backward = effectiveIndex < coveredIndex;
    if (foldDebounceRef.current !== null) {
      window.clearTimeout(foldDebounceRef.current);
      foldDebounceRef.current = null;
    }
    if (backward && !live) {
      foldDebounceRef.current = window.setTimeout(() => {
        foldDebounceRef.current = null;
        setFoldIndex(effectiveIndex);
      }, 160);
      return () => {
        if (foldDebounceRef.current !== null) window.clearTimeout(foldDebounceRef.current);
      };
    }
    setFoldIndex(effectiveIndex);
    return undefined;
  }, [effectiveIndex, live]);

  const fold = useMemo(() => {
    // State at T = fold of the prefix at T (truthful by construction).
    // Incremental: forward head moves apply only the delta; the shallow
    // wrapper changes identity so downstream memos recompute.
    foldCacheRef.current = foldUpToIndex(envelopes, foldIndex, foldCacheRef.current);
    return { ...foldCacheRef.current.state };
  }, [envelopes, foldIndex]);

  // The TEMPORAL count at the scrub position (two-count model): the Warm
  // lens and the hover card read this decaying activation, and the graph's
  // usage scale orders equal counts by it (graph_usage.ts). Pure over the
  // fold's bounded attention windows — recomputes once per fold change, not
  // per frame.
  const temporal = useMemo(() => computeTemporalActivation(fold.attention), [fold]);

  // Wall-clock honesty for the warmth (data-adversary finding, measured on
  // Castor: journal frozen since Jul 9 while the head still rendered warm):
  // activation decays by ACTIVITY, so a stopped life keeps its last recall
  // green forever. Say how old the warmth actually is once it stops being
  // "now" — in the scrubbed past this is the age AT the scrub position.
  const warmthAge = useMemo(() => {
    if (!fold.last_attention_at) return null;
    const head = new Date(fold.last_attention_at).getTime();
    if (Number.isNaN(head)) return null;
    // Live/latest: age against wall clock. Scrubbed: age against the scrub
    // position's own moment (the envelope at the head of the prefix).
    const refIso = effectiveIndex >= 0 && envelopes[effectiveIndex] ? envelopes[effectiveIndex].observed_at : "";
    const ref = refIso ? new Date(refIso).getTime() : Date.now();
    const anchor = live || !refIso ? Date.now() : ref;
    const ageMs = anchor - head;
    if (!Number.isFinite(ageMs) || ageMs < 10 * 60 * 1000) return null; // fresh enough to say nothing
    const h = Math.floor(ageMs / 3600000);
    if (h < 1) return `${Math.floor(ageMs / 60000)}m`;
    if (h < 48) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }, [fold, live, effectiveIndex, envelopes]);

  /** Open a record in Detail by its graph id (the Now line's open, a reply's notice badge). A record
   * this view has not folded yet (a reply's notice arrives before the record's envelope lands on
   * the stream, review S1 2026-11-09) opens nothing and answers false: the badge then opens its own
   * panel with the record's title, never Detail on the current recall. One stable callback (review
   * N6): it reads the newest fold through a ref, so the chat's props stay the same per render. */
  const foldRef = useRef(fold);
  foldRef.current = fold;
  const openInDetail = useCallback((id: string): boolean => {
    const row = foldedRecordRow(foldRef.current, id);
    if (row === null) return false;
    setSelectedId(row);
    setRequestedTab({ tab: "detail", nonce: Date.now() });
    return true;
  }, []);

  const stats = useMemo(() => {
    const summons = fold.sessions.filter((s) => s.kind === "summon").length;
    return {
      nodes: fold.nodes.size,
      edges: fold.edges.size,
      // Home-direct lives write no host markers; run_id changes are the
      // honest session boundaries there ("0 summons" was misleading).
      sessions: Math.max(summons, fold.inferred_sessions.length),
    };
  }, [fold]);

  // Relation types present in the fold, most common first, for the legend
  // (dash pattern = type; color stays reserved for activation/usage).
  const relationTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const se of fold.structural_edges.values()) {
      counts.set(se.relation, (counts.get(se.relation) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([relation]) => relation);
  }, [fold]);

  // Extended memory kinds present in this life (lesson / world_model /
  // dream / …): the legend names what the graph actually shows (operator
  // 2026-07-15: lessons + world models were invisible in the legend).
  const extraKinds = useMemo(() => {
    const interesting = ["summary", "dream", "interest", "lesson", "question", "world_model", "answer", "decision", "plan"];
    const present = new Set<string>();
    for (const n of fold.nodes.values()) {
      if (!n.bookkeeping && interesting.includes(n.kind)) present.add(n.kind);
    }
    return interesting.filter((k) => present.has(k));
  }, [fold]);

  // Search ("a poor and quick version of active reconstruction"): match
  // title, kind, and ids over nodes AND standing targets; matches
  // emphasize on the canvas, everything else dims.
  const searchIds = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return null;
    const terms = q.split(/\s+/).filter(Boolean);
    const matches = new Set<string>();
    const hit = (hay: string) => terms.every((t) => hay.includes(t));
    for (const node of fold.nodes.values()) {
      const hay = `${node.title} ${node.kind} ${node.id} ${node.graph_id ?? ""}`.toLowerCase();
      if (hit(hay)) matches.add(node.id);
    }
    for (const s of fold.standings.values()) {
      if (hit(s.target_id.toLowerCase())) matches.add(`standing:${s.target_id}`);
    }
    return matches;
  }, [fold, searchText]);

  // LENSES (graph-access wave, 2026-07-12): one-click semantic filters —
  // identity / recent / warm / feelings / diary / dreams / questions.
  // Search text INTERSECTS the active lens ("questions about tolstoy");
  // either alone emphasizes on its own.
  const [lens, setLens] = useState<GraphLens>("all");
  // TOPIC filter (2026-07-17): clicking a topic's label on the graph
  // lights its members — same emphasis mechanism, one more intersecting
  // source.
  const [topicFilter, setTopicFilter] = useState<{ ids: Set<string>; label: string } | null>(null);
  // Topics are the graph's NATURAL layout (operator 2026-11-07: "all the
  // memory nodes should have been naturally grouped by topics"): the
  // "topics" toggle only shows their halos + labels over the same graph.
  const [showTopics, setShowTopics] = useState(false);
  // The "Context" toggle (operator 2026-11-08): the memories he brought to
  // mind for his last answer stay lit until his next recall; on by
  // default, the reader's choice remembered for the browser session.
  const [contextOn, setContextOn] = useState(() => readContextChoice(sessionStore()));
  const contextView = useMemo(() => contextToggleView(contextAvailability(fold, scrubSeq), contextOn), [fold, scrubSeq, contextOn]);
  const emphasisIds = useMemo(() => {
    const sources: Array<Set<string>> = [];
    const fromLens = lensIds(fold, temporal, lens);
    if (fromLens !== null) sources.push(fromLens);
    if (searchIds !== null) sources.push(searchIds);
    if (topicFilter !== null) sources.push(topicFilter.ids);
    if (sources.length === 0) return null;
    let acc = sources[0];
    for (const s of sources.slice(1)) {
      const both = new Set<string>();
      for (const id of acc) if (s.has(id)) both.add(id);
      acc = both;
    }
    return acc;
  }, [fold, temporal, lens, searchIds, topicFilter]);

  // Camera-fit trigger: OPERATOR intent only (lens clicks + debounced search
  // commits) — never fold-driven membership drift, which would hijack the
  // camera on every live envelope (adversary P0).
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 450);
    return () => window.clearTimeout(t);
  }, [searchText]);
  const focusToken = lens === "all" && !debouncedSearch ? "" : `${lens}|${debouncedSearch}`;

  // A lens is a per-life question — switching entities resets it (a sticky
  // "Dreams" lens on a fresh life opened pre-dimmed with no explanation).
  // The search query is the same class of per-life state: a stale query
  // would invisibly dim the next entity's graph (func review P1).
  useEffect(() => {
    setLens("all");
    setSearchText("");
    setSearchOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityName, sourceLabel]);


  // THE HANDLE (operator 2026-07-15): an entity's unique reachability
  // string, displayed as name@address — the gateway's DECLARED handle when
  // it carries an address, else name@<gateway host>, else name@<LAN ip>
  // (loopback gateways: the browser can't see the machine's address, the
  // app server can). Identity never rides the address (renaming rule).
  // ONE identity for the verbatim door config (blink forensics 2026-07-16:
  // the inline object literal minted a NEW identity per render, and
  // InlineVerbatim's effect keyed on it — every re-render refetched and
  // flashed "reading his words…"; under the live tail that was a visible
  // per-envelope blink in the Detail tab).
  const verbatimSource = useMemo(
    () => (sourceKind === "gateway" && entityName ? { baseUrl: gatewayUrl.trim().replace(/\/+$/, ""), entity: entityName } : null),
    [sourceKind, entityName, gatewayUrl],
  );

  const displayHandle = useMemo(() => {
    if (sourceKind !== "gateway" || !entityName) return null;
    if (handle && handle.includes("@") && !/@(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|$)/.test(handle)) return handle;
    let host: string | null = null;
    try {
      const u = new URL(gatewayUrl.trim() || window.location.origin);
      host = u.hostname;
    } catch {
      host = null;
    }
    if (host && host !== "127.0.0.1" && host !== "localhost" && host !== "0.0.0.0") return `${entityName}@${host}`;
    if (lanIp) return `${entityName}@${lanIp}`;
    return handle ?? `${entityName}@${host ?? "this gateway"}`;
  }, [sourceKind, entityName, handle, gatewayUrl, lanIp]);

  // Docs assistant transport (kit DocsAssistantDrawer): the gateway base and
  // credential are read at CALL time, so a reconnect between questions is honoured.
  const docsTargetRef = useRef<{ base: string | null; token: string | null }>({ base: null, token: null });
  docsTargetRef.current = {
    base: indexBase ?? (sourceKind === "gateway" ? gatewayUrl.trim().replace(/\/+$/, "") : null),
    token: controlToken.trim() || null,
  };
  const docsFetch = useMemo(() => makeEntityDocsFetch(() => docsTargetRef.current.base, () => docsTargetRef.current.token), []);

  return (
    <div className="entity_app" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="entity_header">
        <div className="eh_brand">
          <EntityMark />
          <h1>AbstractEntity</h1>
          {/* One identity string: the handle (name@address). The full
            * gateway URL stays one hover away; the roster keeps its own
            * "entities @ …" source label (it is not one entity).
            * Click copies the handle (operator ask 2026-07-15, dm#8). */}
          {displayHandle ? (
            <button
              type="button"
              className={`eh_handle${handleCopied ? " eh_handle_copied" : ""}`}
              title={handleCopied ? "Copied to clipboard" : `${sourceLabel} — the handle is how this door is reached (declared address); reachability, not identity; changing it touches no record. Click to copy.`}
              onClick={() => {
                void copyText(displayHandle).then((ok) => {
                  setHandleCopied(ok ? "ok" : "fail");
                  window.setTimeout(() => setHandleCopied(null), 1600);
                });
              }}
            >
              {handleCopied === "ok" ? "copied ✓" : handleCopied === "fail" ? "copy failed" : displayHandle}
            </button>
          ) : (
            <span className="eh_source" title={sourceLabel}>
              {sourceLabel}
            </span>
          )}
          {/* No phase chip here: the phase bar below is the one place the phase is shown (a second
            * phase word beside it, from another read, was the contradictory-badge class). */}
          {/* Suppressed while a visit renders (dm#94 P2-10): a live visit is
            * settled truth — a second endpoint's transition word must not
            * stand beside the visit chip. */}
          {cognition?.settling && !visiting ? (
            <span
              className="eh_settling"
              title="A phase transition is landing — intent (his state) and actuality (loop/visit) briefly disagree while it settles. This is the settling window, not a contradiction."
            >
              ⏳ settling…
            </span>
          ) : null}
          {liveStatus === "reconnecting" ? <span className="eh_reconnect">reconnecting…</span> : null}
          {liveStatus === "closed" ? (
            <span className="eh_reconnect" title="The live stream was refused (usually an expired credential after a gateway restart) — the browser will not retry this connection. Toggle Live off and on to reconnect with a fresh session.">
              live tail closed — toggle Live to reconnect
            </span>
          ) : null}
          {/* Header shows COUNTS only during boot — the ledger's amber note
            * already says "loading his life" in words (IA review P2: two
            * indicators saying the same sentence). */}
          {bootProgress ? <span className="eh_bootprogress">⏳ {bootProgress.replace(/^loading his life…\s*/, "") || "loading…"}</span> : null}
          {/* ONE compact liveness signal (operator 2026-07-15 (h): billed
            * stats moved to the Health tab). Working pulse when the
            * substrate is consuming tokens, else wall-time since the last
            * envelope (quiet ≠ dead). Never both, never a billed count. */}
          {/* ACTIVITY word, never a phase word (dm#94 render adversary
            * P1-5: "● working" wore the ruled WORK phase's name from a
            * different endpoint and co-rendered beside "PERSONAL·RESTING"
            * and a live visit — the strip had a second phase vocabulary).
            * "thinking" = the substrate is consuming tokens right now, on
            * whatever phase the ONE chip already names. */}
          {workingNow ? (
            <span
              className="eh_working"
              title={
                cognition
                  ? "The substrate is consuming tokens right now — a loop tick or a visit turn is executing (store-read truth). The phase chip says which."
                  : "Envelopes are landing on his stream right now (stream-inferred estimate)."
              }
            >
              ● thinking{cognition ? "" : " (est.)"}
            </span>
          ) : live && liveAgeS !== null ? (
            <span
              className={`eh_liveage ${liveAgeS > 300 ? "eh_liveage_quiet" : ""}`}
              title="Wall time since the last envelope arrived. A resting entity is quiet — quiet is not dead, but past 5 minutes it is worth a look."
            >
              {liveAgeS < 60 ? `${liveAgeS}s` : `${Math.floor(liveAgeS / 60)}m`} since last event
            </span>
          ) : null}
        </div>
        {/* THE ACTIONS CLUSTER (operator 2026-07-15 (h)(i)): stats + the
          * Observer link are GONE from the top bar — stats live in the
          * Health tab, and the top-right carries ONLY the shared cluster
          * every AbstractFramework app has (assistant · appearance ·
          * connect/disconnect pill), plus the ONE prominent app action:
          * back to the entities roster. */}
        <div className="eh_actions">
          {indexBase !== null && entityName ? (
            <button className="eh_home" onClick={() => goToIndex()} title="All entities — back to the manager roster" aria-label="Entities">
              <Icon name="board" size={15} />
              <span>Entities</span>
            </button>
          ) : null}
          <AfTopBarActions
            docs={{ open: assistantOpen, onToggle: () => setAssistantOpen((v) => !v), label: "Docs assistant" }}
            appearance={{ onOpen: () => setAppearanceOpen(true) }}
            about={about}
            // The kit's ONE account widget (top-bar set, operator 2026-10-29): signed in, the
            // person, the name and the connection light in one button; its menu says who and
            // which gateway, with Copy user id and Disconnect (= disconnectGateway).
            identity="menu"
            connection={{
              // Phase keys on VERIFIED auth, not the stored claim (a rejected
              // credential must not read "Disconnect" beside the sign-in lock);
              // non-gateway sources (demo/exported) have nothing to be
              // connected to, so the pill honestly offers "Connect".
              phase:
                sourceKind !== "gateway"
                  ? "disconnected"
                  : authChecking
                    ? "loading"
                    : authState && authVerified
                      ? "connected"
                      : "disconnected",
              onConnect: () => setShowAuth(true),
              onDisconnect: () => void disconnectGateway(),
              status: accountStatus,
            }}
          />
        </div>
      </header>

      {sourceKind === "gateway" && entityName && !gatewayLocked ? (
        <div className="entity_controls">
          {/* THE PHASE BAR (operator ruling 2026-11-08 + the 2026-11-09 five-state life cycle,
            * phase_bar.ts): visit, work and sleep are indicators, personal is the one toggle
            * (pressed = allowed) that lights when current, one Stop / Resume button apart from
            * them; the line beside them is the gateway's sentence for now. A gateway without it
            * gets one sentence and no controls. */}
          <PhaseBarControls
            view={phaseView}
            ui={phaseUi}
            entityName={entityName.charAt(0).toUpperCase() + entityName.slice(1)}
            note={phaseNote}
            onAct={actOnPhase}
            onConfirm={confirmPhaseAct}
            onCancel={cancelPhaseConfirm}
            showSentence={!phaseView.stopped}
          />
          {/* THE DAY CAUSE (drives build, runtime seq 269): WHY the day-gate
            * chose work/personal/sleep — the operator-audit line the v7
            * adversary demanded (B F8: "nothing tells the operator WHICH
            * pull opened a personal day"). Machine words, plain rendering;
            * the degrade kind renders as the warning it is. */}
          {(() => {
            // Suppressed under a visit (dm#94 P2-8): the last day-open's
            // "personal day…" claim standing beside a visit chip is the
            // exact co-render the ruling forbids; the gate's history
            // returns the moment the visit closes.
            if (visiting) return null;
            const line = dayCauseLine(loopStatus?.day_cause);
            if (!line) return null;
            return (
              <span
                className={`ec_note ${line.warn ? "ec_warn" : "ec_daycause"}`}
                title={`Why the day-gate chose this day (DRIVES-ARE-DRIVERS): written by the loop at day-open and refreshed each heartbeat. kind=${String(loopStatus?.day_cause?.kind || "")}`}
              >
                {line.text}
              </span>
            );
          })()}
          {/* SETTINGS (operator 2026-07-15 (d)(e)): the old "workspace"
            * button was really settings — one gear opens the modal holding
            * the mind substrate (provider/model), workspace/files, mounts,
            * per-phase tools, and prompt. Progressive disclosure: none of
            * that clutters the strip. */}
          <button
            className="ec_btn ec_settings_btn"
            onClick={() => setShowSettings(true)}
            title="Settings — mind (provider/model), workspace files, mounts, per-phase tools, prompt"
          >
            <Icon name="settings" size={14} />
            <span>Settings</span>
          </button>
          {loopStatus?.inbox_warning ? (
            <span className="ec_note ec_warn" title="The loop's command inbox could not be read — stop requests may not land until this clears.">
              {loopStatus.inbox_warning}
            </span>
          ) : null}
          {specDrift && (specDrift.status === "modulated" || specDrift.overlay) ? (
            <span
              className="ec_note ec_daycause"
              title={`The operator edited the dials through the write door: ${specDrift.overlay ? `overlay edit ${specDrift.overlay.edit_seq}${specDrift.overlay.edited_at ? ` at ${specDrift.overlay.edited_at}` : ""} — the structural law is untouched (sha matches)` : specDrift.detail}. The machinery reads the edited dials at its next boundary.`}
            >
              🎛 blueprint modulated ({specDrift.overlay ? `edit ${specDrift.overlay.edit_seq}` : `rev ${specDrift.wire?.operator_rev ?? "?"}`})
            </span>
          ) : specDrift ? (
            <span className="ec_note ec_warn" title={`ONE-GRAPH drift (laurent dm#79: one state graph, shared): ${specDrift.detail}. Until this clears, phase words rendered here and served by the gateway may disagree.`}>
              ⚠ phase-graph drift: {specDrift.detail}
            </span>
          ) : null}
          {!loopStatus?.running && loopStatus?.stopped_by === "failures" ? (
            <span className="ec_note ec_warn" title="Three consecutive ticks failed (usually LLM timeouts under load) and the loop stopped itself. His memory is intact — restart his own time when the substrate is healthy.">
              his own time stopped after repeated tick failures — restart when ready
            </span>
          ) : null}
          {controlNote ? <span className="ec_note">{controlNote}</span> : null}
        </div>
      ) : null}

      {/* THE STOPPED BANNER (liveness axis, laurent 16:06/16:12): the kill switch outranks every
        * other line, full width, whatever the tab. Its words are the gateway's sentence; the one
        * Resume button is in the phase bar. */}
      {sourceKind === "gateway" && entityName && phaseView.stopped ? (
        <div className="entity_stopped_banner" role="alert">
          <span className="esb_glyph" aria-hidden="true">⛔</span>
          <span className="esb_text">
            <strong title={phaseView.sentenceTitle || undefined}>{phaseView.sentence}</strong>
            {phaseView.since ? <span className="esb_since"> · {phaseView.since}</span> : null}
          </span>
        </div>
      ) : null}

      {error ? <div className="entity_error">{error}</div> : null}

      {/* CONTENT GATE (maintainer ruling 2026-07-10 20:56, CRITICAL): a
        * gateway source shows NOTHING — no roster, no fleet, no life — to a
        * browser the gateway has not confirmed. This is defense-in-depth
        * over the gateway's own auth (its dev-read posture leaked reads);
        * the observer never renders a life it has not been verified to see. */}
      {gatewayLocked ? (
        <div className="entity_locked">
          <div className="entity_locked_card">
            {authChecking ? (
              <>
                <h2>Checking your sign-in…</h2>
                <p>Verifying this browser's session with the gateway — one silent check, no typing needed if you signed in before.</p>
              </>
            ) : (
              <>
                <h2>🔒 Sign in to view {entityName ? `${entityName}'s life` : "this gateway"}</h2>
                <p>This app shows a summoned entity's memories only to a browser the gateway has authenticated — an entity's inner life is not public.</p>
                <button className="eix_create_btn" onClick={() => setShowAuth(true)}>
                  🔑 connect
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {!gatewayLocked && indexBase !== null && !entityName && indexPage === "fleet" ? (
        <FleetView
          key={authState ? `fleet:${authState.userId}` : "fleet:anon"}
          baseUrl={indexBase}
          onOpen={(slug) => {
            navigateIndexPage("roster");
            void openEntity(slug);
          }}
          onBack={() => navigateIndexPage("roster")}
        />
      ) : null}

      {!gatewayLocked && indexBase !== null && !entityName && indexPage === "blueprint" ? (
        <div className="bp_page">
          <div className="bp_page_head">
            <h2>Entity blueprint</h2>
            <button className="eix_refresh" onClick={() => navigateIndexPage("roster")} title="Back to the roster">
              ⌂ roster
            </button>
          </div>
          {/* THE COGNITION MAP leads (operator correction c5070: the graph
            * he means is the MEMORY COGNITION machine — passive/active
            * construction and what it creates. The phase machine is the
            * simple rhythm, demoted to a section below). */}
          <BlueprintPanel />
          <details className="bp_section" open>
            <summary>
              Operator dials <span className="bp_section_sub">the rhythm — windows, cadences, floors</span>
            </summary>
            <BlueprintTunables baseUrl={indexBase} token={controlToken.trim() || null} />
          </details>
          <details className="bp_section">
            <summary>
              Phase transitions <span className="bp_section_sub">the life rhythm — visit/work/personal/sleep, editable (create/remove/redirect)</span>
            </summary>
            <PhaseGraphEditor baseUrl={indexBase} token={controlToken.trim() || null} />
          </details>
        </div>
      ) : null}

      {!gatewayLocked && indexBase !== null && !entityName && indexPage === "roster" ? (
        <EntitiesIndex
          key={authState ? `authed:${authState.userId}` : "anon"}
          baseUrl={indexBase}
          token={controlToken.trim() || null}
          onOpen={(slug) => void openEntity(slug)}
          onConnect={() => setShowAuth(true)}
          onWatchAll={() => navigateIndexPage("fleet")}
          onBlueprint={() => navigateIndexPage("blueprint")}
          onConvene={() => setShowMeetConsole(true)}
          createRequest={createRequest}
          onCreateFlowClosed={clearCreateHash}
        />
      ) : null}

      {showAuth ? (
        <ConnectGatewayModal
          proxyMode={proxyMode === true}
          baseUrl={gatewayUrl}
          onBaseUrlChange={setGatewayUrl}
          onConnected={(state, status) => {
            if (state.token) setGatewayToken(state.token);
            setAuthState(state);
            setAccountStatus(state.mode === "bearer" ? bearerAccountStatus(state) : status ?? null);
            // Direct posture: converge EVERY base on the one the credential
            // was verified against (refresh-audit F7: a URL edited in the
            // modal updated gatewayUrl but left the roster's indexBase on
            // the old target — a quieter split brain).
            if (state.mode === "bearer" && state.base) {
              setGatewayUrl(state.base);
              setIndexBase((prev) => (prev !== null ? state.base ?? prev : prev));
            }
            // The modal already PROVED the credential (session login or a
            // confirming operator probe) — unlock content immediately; no
            // second round-trip, and the deferred life stream drains.
            setAuthVerified(true);
            setShowAuth(false);
            setControlNote(`Connected as ${state.userId}.`);
          }}
          onClose={() => setShowAuth(false)}
        />
      ) : null}

      {showSettings && sourceKind === "gateway" && entityName ? (
        <SettingsPanel
          baseUrl={gatewayUrl.trim().replace(/\/+$/, "")}
          entity={entityName}
          entityName={entityName}
          token={controlToken.trim() || null}
          substrate={substrate}
          onSubstrateChange={setSubstrate}
          substrateTimeline={substrateTimeline}
          lastSubstrateChangeAt={lastSubstrateChangeAt}
          loopFacts={
            cognition?.loop && typeof cognition.loop === "object"
              ? {
                  running: Boolean(cognition.loop.running),
                  pid_started_at: String(cognition.loop.pid_started_at || "") || null,
                  substrate: cognition.loop.substrate ?? null,
                  substrate_at: String(cognition.loop.substrate_at || "") || null,
                }
              : null
          }
          onClose={() => setShowSettings(false)}
        />
      ) : null}

      {meetVisitId && sourceKind === "gateway" ? (
        <MeetReader
          baseUrl={gatewayUrl.trim().replace(/\/+$/, "")}
          visitId={meetVisitId}
          onClose={() => setMeetVisitId(null)}
          onOpenEntity={(slug) => {
            setMeetVisitId(null);
            void openEntity(slug);
          }}
        />
      ) : null}

      {showMeetConsole && indexBase !== null ? (
        <MeetConsole
          baseUrl={indexBase}
          token={controlToken.trim() || null}
          onClose={() => {
            setShowMeetConsole(false);
            setMeetPreset(null);
          }}
          onReadMeet={(visitId) => {
            setShowMeetConsole(false);
            setMeetPreset(null);
            setMeetVisitId(visitId);
          }}
          presetA={meetPreset?.a}
          presetB={meetPreset?.b}
        />
      ) : null}

      {/* SHARED CLUSTER SURFACES (operator 2026-07-15 (i)): the assistant
        * drawer + appearance dialog every AbstractFramework app carries. */}
      <DocsAssistantDrawer
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        source={ENTITY_DOCS_SOURCE}
        fetchGateway={docsFetch}
        connected={sourceKind === "gateway" && !gatewayLocked}
        placeholder="Ask about AbstractEntity…"
        suggestions={ENTITY_DOCS_SUGGESTIONS}
      />
      <AfAppearanceDialog open={appearanceOpen} onClose={() => setAppearanceOpen(false)} value={appearance} onChange={setAppearance} />

      <div className="entity_main" style={gatewayLocked || (indexBase !== null && !entityName) ? { display: "none" } : undefined}>
        <div className="entity_canvas_wrap">
          {/* SEARCH + LENSES (operator 2026-07-15 (h)): search is a
            * first-class flying bar pinned to the graph's width, directly
            * ABOVE the lens pills (one absolute column, top-left of the
            * graph). Search opens from a prominent 🔍 control on the lens
            * row; Escape clears then closes. No longer lost in a stats
            * navbar. */}
          <div className="entity_graph_overlay">
            {searchOpen ? (
              <div className="entity_search_overlay">
                <input
                  type="search"
                  className="entity_search_input"
                  placeholder="search memories — title, kind, id…"
                  value={searchText}
                  autoFocus
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={(e) => {
                    // One Escape = one layer (consumed-event convention).
                    if (e.key === "Escape" && !e.defaultPrevented) {
                      e.preventDefault();
                      if (searchText) setSearchText("");
                      else setSearchOpen(false);
                    }
                  }}
                  title="Match on title, kind, and ids — matches light up on the graph, the rest dims. Escape clears, then closes."
                />
                {searchIds !== null ? (
                  <span className="entity_search_count">
                    {searchIds.size} match{searchIds.size === 1 ? "" : "es"}
                  </span>
                ) : null}
                <button className="entity_search_close" onClick={() => setSearchOpen(false)} title="Close search">
                  ✕
                </button>
              </div>
            ) : null}
            <div className="entity_lens_bar">
              <button
                className={`lens_search_toggle ${searchOpen || searchText ? "active" : ""}`}
                aria-pressed={searchOpen || Boolean(searchText)}
                title="Search memories — matches light up on the graph, the rest dims"
                onClick={() => setSearchOpen((v) => !v)}
              >
                🔍<span className="lens_search_label">search</span>
                {searchIds !== null ? <span className="lens_search_badge">{searchIds.size}</span> : null}
              </button>
              {verbatimSource ? (
                // Gateway sources only (adversary F10: the toggle rendered
                // for file/demo sources but the view needs the door).
                <button
                  className={`lens_search_toggle ${showTopics ? "active" : ""}`}
                  aria-pressed={showTopics}
                  title={
                    showTopics
                      ? "Hide the topic halos and labels. Memories group by topic even with this off; “used together” trails across topics are drawn but do not pull."
                      : "Show the topics — a halo and a label around each group of memories (groups computed from his memory graph: engraved relations + shared digest keywords; click a label to light that topic). Memories group by topic even with this off; “used together” trails across topics are drawn but do not pull."
                  }
                  onClick={() => setShowTopics((v) => !v)}
                >
                  🗺<span className="lens_search_label">topics</span>
                </button>
              ) : null}
              <ContextToggle
                view={contextView}
                onToggle={() => {
                  const next = !contextOn;
                  setContextOn(next);
                  writeContextChoice(sessionStore(), next);
                }}
              />
              {topicFilter !== null ? (
                <button
                  className="lens_chip active tm_filter_chip gc_topic_chip_full"
                  title={`The graph is lit to the "${topicFilter.label}" topic (${topicFilter.ids.size} memories) — click to clear`}
                  onClick={() => setTopicFilter(null)}
                >
                  {/* The whole label (it wraps; graph_canvas.css), never cut. */}
                  🗺 {topicFilter.label} ✕
                </button>
              ) : null}
              <div className="entity_lenses" role="group" aria-label="Graph lenses">
                {LENSES.map((l) => (
                  <button
                    key={l.id}
                    className={`lens_chip ${lens === l.id ? "active" : ""}`}
                    title={l.hint}
                    aria-pressed={lens === l.id}
                    onClick={() => setLens((prev) => (prev === l.id ? "all" : l.id))}
                  >
                    {l.label}
                  </button>
                ))}
                {emphasisIds !== null ? (
                  <span className="lens_count">
                    {emphasisIds.size === 0
                      ? `nothing matches${lens !== "all" ? ` "${lens}"` : ""} here`
                      : `${emphasisIds.size} emphasized`}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <GraphCanvas
            fold={fold}
            temporal={temporal}
            scrubSeq={scrubSeq}
            selectedId={canvasSelection(selectedId, recallPreview)}
            searchIds={emphasisIds}
            focusToken={focusToken}
            layoutKey={sourceKind === "gateway" && entityName ? entityName : sourceLabel || null}
            onSelect={(id) => {
              setSelectedId(id);
              // "click to open" must OPEN (laurent 12:23, c1405 ask 2c):
              // selecting a memory opens the Detail inspector on it. No
              // camera move rides a click — the canvas never recenters on
              // selection by design (recenter is the 🎯 button's act).
              if (id) setRequestedTab({ tab: "detail", nonce: Date.now() });
            }}
            gatewaySource={verbatimSource}
            onShowInBook={(graphId) => {
              // A diary entry's card opens the Book at it (no read: its
              // words are the Book's own click, like the ledger's rule).
              const nonce = Date.now();
              setBookFocus({ id: graphId, nonce });
              setRequestedTab({ tab: "book", nonce });
            }}
            showTopics={showTopics}
            showContext={contextOn}
            onPickTopic={(rowIds, label) => setTopicFilter(rowIds.size > 0 ? { ids: rowIds, label } : null)}
          />
          <div className="entity_legend">
            <span className="lg lg_identity">identity</span>
            <span className="lg lg_memory">memory</span>
            <span className="lg lg_diary">diary</span>
            <span className="lg lg_standing">feeling</span>
            <span className="lg lg_scar">scar</span>
            <span className="lg lg_bond">bond</span>
            {/* Kinds present in THIS life beyond the core six — lessons,
              * world cards, dreams… named so the colors are readable
              * (operator 2026-07-15: lesson/world_model were unnamed). */}
            {extraKinds.map((k) => (
              <span key={k} className="lg_kind" title={`kind: ${k}`}>
                <i className="lg_kdot" style={{ background: KIND_COLORS[k] ?? KIND_COLORS.unknown }} aria-hidden="true" />
                {k === "world_model" ? "world" : k}
              </span>
            ))}
            <span className="lg_sep" />
            {/* THE USAGE SCALE (operator 2026-11-09): one grey-to-green key
              * for memories and lines, ranked within this life
              * (graph_usage.ts); the swatch rides the same tokens the canvas
              * resolves (graph_canvas.css .gc_rl_scale). */}
            <span className="lg_edge" title={USAGE_TITLE}>
              <i className="gc_rl_scale" aria-hidden="true" />
              {USAGE_LOW} → {USAGE_HIGH}
            </span>
            {warmthAge ? (
              <span
                className="lg_edge lg_stale"
                title="How long ago he last used a memory. The colours rank his use within his life; they do not fade while nothing runs."
              >
                🥶 last selection {warmthAge} ago
              </span>
            ) : null}
            {relationTypes.map((relation) => (
              <span
                key={relation}
                className="lg_edge"
                title={`“${relation}” link — recorded at formation (born linked). The glyph sits at the TARGET end of the edge: it names the relation type and points the direction.`}
              >
                <RelationGlyphSwatch glyph={relationGlyph(relation)} />
                {relation}
              </span>
            ))}
          </div>
        </div>
        <SideTabs
          defaultTab="ledger"
          emphasizedTab={avatarChat ? "chat" : undefined}
          activeTab={requestedTab ? `${requestedTab.tab}#${requestedTab.nonce}` : undefined}
          onActiveTab={setOpenTab}
          tabs={[
            // Gateway tabs mount only for a VERIFIED browser (F14: the
            // ChatDrawer's visit poll + substrate fetch fired from behind
            // display:none on unverified browsers — the content gate must
            // gate the fetches, not just the pixels).
            ...(sourceKind === "gateway" && entityName && !gatewayLocked
              ? ([
                  {
                    id: "chat",
                    icon: "💬",
                    title: "Chat",
                    // The hint dot rides the ONE machine (dm#94 render
                    // adversary P2-9: the raw trio field could dot the tab
                    // while the chip said personal — a third independently
                    // sourced visit word in the same viewport).
                    hint: visiting,
                    content: (visible: boolean) => (
                      <ChatDrawer
                        key={entityName} // F9: a direct A→B switch must remount — A's thread/runId must never render in B's room
                        baseUrl={gatewayUrl.trim().replace(/\/+$/, "")}
                        entity={entityName}
                        entityName={entityName.charAt(0).toUpperCase() + entityName.slice(1)}
                        token={controlToken.trim() || null}
                        authUserId={authState?.userId ?? null}
                        envelopes={envelopes}
                        onAuthRefused={() => void handleAuthRefused()}
                        onConveneWith={(otherSlug) => {
                          setMeetPreset({ a: entityName, b: otherSlug });
                          setShowMeetConsole(true);
                        }}
                        onVisitStateChange={handleVisitStateChange}
                        knockRequest={visitKnock}
                        onAvatarModeChange={setAvatarChat}
                        visible={visible}
                        onOpenRecord={openInDetail}
                      />
                    ),
                  },
                  {
                    id: "card",
                    icon: "🪪",
                    title: "Card",
                    content: <IdentityCardContent key={entityName} baseUrl={gatewayUrl.trim().replace(/\/+$/, "")} entity={entityName} fold={fold} revision={lifeTicks} shown={openTab === "card"} />,
                  },
                ] as SideTab[])
              : []),
            {
              id: "detail",
              icon: "🔍",
              title: "Detail",
              content: (
                <Inspector
                  fold={fold}
                  temporal={temporal}
                  scrubSeq={scrubSeq}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  verbatimSource={verbatimSource}
                  onOpenMeet={sourceKind === "gateway" ? (visitId) => setMeetVisitId(visitId) : undefined}
                />
              ),
            },
            {
              id: "book",
              icon: "📔",
              title: "Book",
              content: <BookReader fold={fold} verbatimSource={verbatimSource} focus={bookFocus} />,
            },
            {
              id: "health",
              icon: "🩺",
              title: "Health",
              content: (
                <HealthPanel
                  fold={fold}
                  onSelect={setSelectedId}
                  footprint={footprint}
                  counts={{ memories: stats.nodes, linked: fold.structural_edges.size, coUsed: stats.edges, sessions: stats.sessions }}
                  cognition={cognition}
                  cognitionMeter={cognitionMeter}
                  cardSource={verbatimSource}
                  authVerified={authVerified}
                />
              ),
            },
            {
              id: "lessons",
              icon: "🎓",
              title: "Lessons",
              content: (
                <LessonsPanel
                  fold={fold}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setRequestedTab({ tab: "detail", nonce: Date.now() });
                  }}
                />
              ),
            },
            {
              id: "world",
              icon: "🌍",
              title: "World",
              content: (
                <WorldPanel
                  fold={fold}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setRequestedTab({ tab: "detail", nonce: Date.now() });
                  }}
                />
              ),
            },
            {
              id: "wave",
              icon: "🌸",
              title: "Wave",
              content: (
                <CognitionWavePanel
                  fold={fold}
                  source={
                    sourceKind === "gateway" && entityName
                      ? { baseUrl: gatewayUrl.trim().replace(/\/+$/, ""), entity: entityName }
                      : null
                  }
                  scrubSeq={scrubSeq}
                />
              ),
            },
            {
              id: "ledger",
              icon: "📜",
              title: "Ledger",
              content: (
                <div className="st_ledger_wrap">
                  <label className="el_quiet_toggle st_ledger_toggle">
                    <input type="checkbox" checked={showQuiet} onChange={() => setShowQuiet((v) => !v)} />
                    audit lines
                  </label>
                  <NowLine
                    envelopes={envelopes}
                    live={live}
                    source={verbatimSource}
                    onOpen={openInDetail}
                  />
                  <LedgerPanel
                    envelopes={envelopes}
                    scrubIndex={effectiveIndex}
                    onJump={(i) => {
                      setPlaying(false);
                      if (!live) setScrubIndex(i);
                    }}
                    onSelectSubject={(id) => {
                      // A ledger line opens what it is about (operator
                      // 2026-11-07: "the items in the ledger … should be
                      // informative, interactive and actionable"). A diary
                      // entry opens the Book, never Detail: selecting a diary
                      // record makes Detail (mounted even when hidden) read
                      // it, and that read is recorded in his biography — in
                      // the Book, reading the words is its own click.
                      if (id && isDiaryGraphId(id)) {
                        const nonce = Date.now();
                        setBookFocus({ id, nonce });
                        setRequestedTab({ tab: "book", nonce });
                        return;
                      }
                      setSelectedId(id);
                      if (id) setRequestedTab({ tab: "detail", nonce: Date.now() });
                    }}
                    onPreviewRecall={setRecallPreview}
                    showQuiet={showQuiet}
                    onToggleQuiet={() => setShowQuiet((v) => !v)}
                    loadingNote={bootProgress}
                    live={live}
                  />
                </div>
              ),
            },
          ]}
        />
      </div>

      {indexBase !== null && !entityName ? null : (
        <Timeline
          envelopes={envelopes}
          scrubIndex={effectiveIndex}
          playing={playing}
          speed={speed}
          live={live}
          liveAvailable={sourceKind === "gateway" && Boolean(entityName)}
          inferredSessionSeqs={fold.inferred_sessions.map((s) => s.first_seq)}
          onScrub={(i) => {
            setPlaying(false);
            // Scrubbing while LIVE means "let me look at the past" — leave
            // the tail and land on the position (round-3 review P1: the
            // transport rendered disabled exactly in the default live
            // posture; one gesture now does intend-and-go).
            if (live) {
              tailRef.current?.close();
              tailRef.current = null;
              setLive(false);
              setLiveStatus(null);
            }
            setScrubIndex(i);
          }}
          onOpenEvent={(i, recordId) => {
            // A mark on the time panel: go there and open what formed.
            setPlaying(false);
            if (live) {
              tailRef.current?.close();
              tailRef.current = null;
              setLive(false);
              setLiveStatus(null);
            }
            setScrubIndex(i);
            // A diary mark opens the Book (no read); anything else opens in
            // Detail (see the ledger's rule above).
            if (isDiaryGraphId(recordId)) {
              const nonce = Date.now();
              setBookFocus({ id: recordId, nonce });
              setRequestedTab({ tab: "book", nonce });
              return;
            }
            setSelectedId(recordId);
            setRequestedTab({ tab: "detail", nonce: Date.now() });
          }}
          onTogglePlay={() => {
            // Pause where the panel shows the head (the page may trail it
            // by one paced step).
            const head = playhead.get();
            if (playing && head !== null) setScrubIndex(head);
            setPlaying((v) => !v);
          }}
          onSpeed={setSpeed}
          onToggleLive={toggleLive}
          playhead={playhead}
        />
      )}
    </div>
  );
}
