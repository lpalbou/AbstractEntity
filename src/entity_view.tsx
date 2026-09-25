/**
 * The entity memory view: one summoned entity's evolving memory graph.
 *
 * Offline replay and live tail are ONE pipeline (a2a 0005): the state at
 * any scrub position is the pure fold of the envelope prefix, so playback,
 * scrubbing, and live-follow share the same code path. Sources:
 *
 * - the bundled demo life (a real exported keystone-style life),
 * - a dropped .ndjson file (an exported life),
 * - a gateway (`/api/gateway/entities/{name}/replay` + SSE live tail).
 *
 * Everything here is a pure read. There is no write path in this module.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EntityMark } from "./brand_mark";
import { ChatDrawer } from "./chat_drawer";
import { TopicMap } from "./topic_map";
import { SettingsPanel } from "./workspace_panel";
import { SideTabs, type SideTab } from "./drawer";
import { EntitiesIndex } from "./entities_index";
import { FleetView } from "./fleet_view";
import { MeetConsole } from "./meet_console";
import { MeetReader } from "./meet_reader";
import { GraphCanvas, KIND_COLORS, relationGlyph, type RelationGlyph } from "./graph_canvas";
import { IdentityCardContent } from "./identity_card";
import {
  AfPhaseRadio,
  type AfPhaseSlot,
  AfTopBarActions,
  AfAppearanceDialog,
  AfDrawer,
  useAppearanceSettings,
  Icon,
} from "@abstractframework/ui-kit";
import { AssistantPanel } from "@abstractframework/panel-chat";
import { askEntityAssistant } from "./entity_assistant";

import { BookReader } from "./book_reader";
import { CognitionWavePanel } from "./cognition_wave_panel";
import { LessonsPanel, WorldPanel } from "./lessons_world_panels";
import { BlueprintPanel } from "./blueprint_panel";
import { BlueprintTunables } from "./blueprint_tunables";
import { PhaseGraphEditor } from "./phase_editor";
import { HealthPanel } from "./health_panel";
import { Inspector } from "./inspector";
import { LedgerPanel } from "./ledger_panel";
import { Timeline } from "./timeline";
import { foldUpToIndex, type FoldCache } from "./stream_fold";
import { LENSES, lensIds, type GraphLens } from "./graph_lenses";
import { computeTemporalActivation } from "./temporal_activation";
import { activeRuledPhase, dayCauseLine, deriveLifeState, type ClientVisitSignal } from "./entity_state";
import { loadSubstrateChoice, type SubstrateChoice } from "./substrate_picker";
import { getEntitySubstrate } from "./stream_source";
import { checkSpecSync, type SpecSyncResult } from "./spec_sync";
import { pageFromSearch, searchAfterNavigate } from "./index_page";
import {
  classifyOperatorAuth,
  fetchEntityState,
  gatewayReadHeaders,
  getEntityCognition,
  fetchEntityFootprint,
  getLoopStatus,
  getServerLifeState,
  listEntities,
  openLiveTail,
  parseLoopRefusal,
  parseNdjson,
  postEntityState,
  setGatewayToken,
  startLoop,
  stopLoop,
  type EntityStateInfo,
  type LiveTailHandle,
  type LoopStatus,
  type EntityCognition,
  type EntityFootprint,
  type ServerLifeState,
} from "./stream_source";
import { openLifeStream } from "./replay_cache";
import type { ReplayEnvelope } from "./stream_types";
import {
  ConnectGatewayModal,
  loadStoredAuth,
  storeAuth,
  type GatewayAuthState,
} from "./connect_gateway_modal";
import { authRefusedMsg, proxyConnectionLogout, proxyConnectionStatus, sameGatewayTarget } from "./gateway_session";
import { useEntityAbout } from "./app_about";
import { wantsCreateFlow } from "./roster_empty";

const DEMO_URL = "/demo/castor.ndjson";
/** Playback baseline: envelopes per second at 1x. */
const BASE_EPS = 2.5;

type SourceKind = "demo" | "file" | "gateway";

/** Copy text to the clipboard with the plain-HTTP LAN fallback (F25: a
 * loopback/LAN origin over http has no navigator.clipboard — the entity
 * app is served exactly there, so the execCommand path is load-bearing,
 * not a nicety). Returns whether it copied. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the execCommand path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
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
  const playRef = useRef<{ acc: number; last: number } | null>(null);
  // Staleness truth for the live badge (adversarial UX review 1.2-1.4):
  // EventSource ignores keep-alive comments by design, so "connected" says
  // nothing — the honest signal is wall time since the last envelope.
  const lastEnvelopeAtRef = useRef<number | null>(null);
  const [liveAgeS, setLiveAgeS] = useState<number | null>(null);
  const [entityState, setEntityState] = useState<EntityStateInfo | null>(null);
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
    fetch("/app/host")
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
  /** One state write at a time through the door (double-click guard). */
  const stateBusyRef = useRef(false);
  const [loopStatus, setLoopStatus] = useState<LoopStatus | null>(null);
  const [serverLife, setServerLife] = useState<ServerLifeState | null>(null);
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
  const [loopBusy, setLoopBusy] = useState(false);
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
  /** Pre-filled seats when the meet is convened from a visit by @handle
   * mention (operator 2026-07-15). */
  const [meetPreset, setMeetPreset] = useState<{ a: string; b: string } | null>(null);
  /** The roster (for @handle resolution in the chat drawer) — fetched once
   * per verified gateway; null on demo/exported sources. */
  const [rosterList, setRosterList] = useState<Array<{ slug: string; name: string }>>([]);
  useEffect(() => {
    if (sourceKind !== "gateway" || !authVerified) {
      setRosterList([]);
      return;
    }
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    let cancelled = false;
    listEntities(base)
      .then((list) => !cancelled && setRosterList(list.map((e) => ({ slug: e.slug, name: e.name }))))
      .catch(() => !cancelled && setRosterList([]));
    return () => {
      cancelled = true;
    };
  }, [sourceKind, authVerified, gatewayUrl]);
  /** Every host address that means "this gateway" — for local @handle
   * resolution (a remote address is honestly not-yet). */
  const localAddresses = useMemo(() => {
    const addrs = ["127.0.0.1", "localhost", "0.0.0.0"];
    if (lanIp) addrs.push(lanIp);
    try {
      const u = new URL(gatewayUrl.trim() || window.location.origin);
      if (u.hostname) addrs.push(u.hostname);
    } catch {
      // ignore
    }
    return addrs;
  }, [lanIp, gatewayUrl]);
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
          // Seq-keyed merge (adversarial realtime review, 2026-07-08): the
          // old "drop anything ≤ last" dedup silently ate LEGITIMATE
          // retrograde arrivals — host markers anchor to a journal base
          // the tail may already have passed. Append fast-path; true
          // duplicates drop; retrogrades insert in seq order.
          const last = prev.length > 0 ? prev[prev.length - 1].seq : -Infinity;
          if (env.seq > last) {
            const next = [...prev, env];
            setScrubIndex(next.length - 1);
            return next;
          }
          // Binary search for the insert position among the (sorted) prefix.
          let lo = 0;
          let hi = prev.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (prev[mid].seq < env.seq) lo = mid + 1;
            else hi = mid;
          }
          if (prev[lo]?.seq === env.seq) return prev; // reconnect duplicate
          const next = [...prev.slice(0, lo), env, ...prev.slice(lo)];
          setScrubIndex(next.length - 1);
          return next;
        });
      },
      (status) => setLiveStatus(status),
    );
  }, []);

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
    // ONE substrate per entity, GATEWAY-OWNED (maintainer ruling 2026-07-09
    // 06:32: visits and own time share the same mind — and the UI must SHOW
    // the stored choice, not present an empty picker). The gateway's
    // substrate endpoint is the source of truth; per-entity localStorage is
    // only a seed for older gateways without the endpoint (#FALLBACK).
    if (!entityName) {
      setSubstrate(null);
      return;
    }
    let cancelled = false;
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    getEntitySubstrate(base, entityName)
      .then((stored) => {
        if (cancelled) return;
        if (stored && stored.provider && stored.model) {
          setSubstrate({ provider: stored.provider, model: stored.model, thinking: stored.thinking ?? null });
        } else {
          setSubstrate(loadSubstrateChoice(entityName)); // legacy seed; saving writes back to the gateway
        }
      })
      .catch(() => {
        if (!cancelled) setSubstrate(loadSubstrateChoice(entityName));
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

  // entityState is polled in the ONE state-poll effect below (state-wave
  // fix: the old separate 30s poll made the wake/sleep axis up to 2x
  // staler than the loop axis — the source-skew class behind the false
  // "woke him" note).

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
    fetchEntityState(base, entityName)
      .then((s) => fresh() && setEntityState(s))
      .catch(() => fresh() && setEntityState(null));
    getLoopStatus(base, entityName)
      .then((s) => fresh() && setLoopStatus(s))
      .catch(() => fresh() && setLoopStatus(null));
    // The composite phase, computed gateway-side (commons seq 96): ONE
    // mutually-exclusive answer. Null (endpoint absent on an older
    // gateway) drops us to the client-derived trio — the #FALLBACK path.
    getServerLifeState(base, entityName)
      .then((s) => fresh() && setServerLife(s))
      .catch(() => fresh() && setServerLife(null));
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
  }, [sourceKind, entityName, gatewayUrl]);
  useEffect(() => {
    // CONTENT GATE extends to the POLLS (code adversary F14): an
    // unverified browser must not even FETCH state/loop/cognition — the
    // 2026-07-10 20:56 ruling covers reads, and dev-read-posture gateways
    // would answer them.
    if (sourceKind !== "gateway" || !entityName || !authVerified) {
      setEntityState(null);
      setLoopStatus(null);
      setServerLife(null);
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

  /** ONE derived life-state (maintainer, 2026-07-09 02:02): the entity is
   * in exactly one of visiting/working/sleeping/own-time/…, and visiting
   * suppresses own-time and sleeping. The gateway's `/life_state` is the
   * authority when present; `entityState.mode` + loop status carry the
   * client-side fallback for older gateways. */
  // A gateway source whose browser is not yet VERIFIED shows no content
  // (the critical content gate). File/demo sources are never locked.
  const gatewayLocked = sourceKind === "gateway" && !authVerified;
  // The visit axis is NEVER amputated (dm#94 render adversary P0-2: this
  // call site passed a literal null, making the machine blind to the
  // conversation this very app conducts — the wiring pin forbids it now).
  const life = useMemo(() => deriveLifeState(entityState, loopStatus, clientVisit, serverLife), [entityState, loopStatus, clientVisit, serverLife]);

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

  /** THE GRANT AXIS (phases.personal, gateway c1454): armed is the
   * server-computed truth (mode != disabled && within expiry). null =
   * axis unknown (older gateway or pre-phases.yaml runtime, the block's
   * #FALLBACK note). RADIO SEMANTICS (13:28 ruling, superseding the
   * short-lived pushed=armed): pushed = CURRENT PHASE; ARMED renders as
   * its own underline dot (armed ≠ in-phase); click intent stays on the
   * fresh-read process axis (alive→stop, dead→start); loop-alive-WITHOUT-
   * grant renders as the alarm it is (the 10:20 incident state). */
  const grantArmed: boolean | null =
    cognition?.personal && cognition.personal.note === undefined && typeof cognition.personal.armed === "boolean"
      ? cognition.personal.armed
      : null;
  const grantAlarm = grantArmed === false && life.ownTimeOn; // alive, NO grant — the 10:20 shape
  /** The RADIO position (13:28 ruling): exactly one active phase pushed;
   * settling/paused/yielded/unknown = none pushed, the chip says so. */
  const activePhase = activeRuledPhase(life);

  const toggleLoop = useCallback(async () => {
    if (sourceKind !== "gateway" || !entityName || loopBusy) return;
    const base = gatewayUrl.trim().replace(/\/+$/, "");
    const token = controlToken.trim() || null;
    setLoopBusy(true);
    setControlNote(null);
    // Post-action convergence: bump the epoch (dropping every in-flight
    // stale poll) and re-read ALL axes together, twice.
    const reconcile = () => {
      [900, 4000].forEach((ms) => window.setTimeout(refreshEntityTruth, ms));
    };
    try {
      // STATE WAVE (laurent 12:32): the handler acts on FRESH reads, never
      // the render closure — the false "woke him" note came from branching
      // on a poll up to 15-30s old (forensics c1426: this very handler's
      // wake was the 10:20 incident). One fetch pair at click time decides.
      const [freshLoop, freshState, freshLife] = await Promise.all([
        getLoopStatus(base, entityName).catch(() => null),
        fetchEntityState(base, entityName).catch(() => null),
        getServerLifeState(base, entityName).catch(() => null),
      ]);
      stateEpochRef.current += 1; // in-flight polls are now stale
      setLoopStatus(freshLoop);
      if (freshState) setEntityState(freshState);

      // PHASE SEMANTICS, not process semantics (laurent 2026-07-15 22:38:
      // "phases are mutually exclusive push buttons" — clicking personal
      // must move TOWARD personal unless personal is already the phase).
      // The old rule keyed on the PROCESS axis (loop alive → STOP), so
      // clicking personal while the loop idled alive under a sleep state
      // STOPPED it — the button read as doing nothing and staying grey.
      const freshSleeping = freshState?.state === "asleep" || freshState?.state === "paused";
      const inPersonal = Boolean(freshLoop?.running) && !freshSleeping && String(freshState?.mode || "") !== "visiting";

      // VISIT PREEMPTS THE BUTTON (dm#94 write adversary: the client
      // personal toggle was one of five unguarded awake writers — posting
      // awake over a yielded visit destroyed the visiting posture and
      // re-opened personal under a live conversation). A live visit —
      // the fresh state's own mode, the fresh composite's phase/chat_open
      // (impl adversary P1-2: a hosted-lane visit from ANOTHER client on
      // an awake loop-less entity flips neither mode nor this drawer),
      // OR this app's drawer — refuses the enter half; the visit's close
      // restores the phase, not this button.
      const visitLive =
        String(freshState?.mode || "") === "visiting" ||
        Boolean(clientVisit?.open) ||
        Boolean(freshLife?.chat_open) ||
        ["visit", "visiting"].includes(String(freshLife?.phase || "").toLowerCase());
      if (!inPersonal && visitLive) {
        setControlNote("A visit is in the room — personal time cannot start until it closes (the visit's close restores his phase; spec v10: LIVE-SESSION-IMPLIES-VISIT).");
        reconcile();
        return;
      }

      if (inPersonal) {
        // Personal IS the current phase — the push-button un-push: stop at
        // the next tick boundary (the machine settles to sleep, idle=sleep).
        const r = await stopLoop(base, entityName, token);
        // Never fabricate a LoopStatus (adversary find: an invented
        // {phase:"day"} painted a running day over a corpse) — mark
        // stop_requested on the FRESH read only.
        setLoopStatus(r.status ? { ...r.status, stop_requested: true } : freshLoop ? { ...freshLoop, stop_requested: true } : null);
        setControlNote("Stop requested — his personal time ends at the next tick boundary.");
        reconcile();
      } else {
        // ENTER personal. Acts compose from FRESH reads and the note names
        // exactly what was done — never an act that did not happen.
        const acts: string[] = [];
        if (freshState?.state === "paused" || freshState?.state === "asleep") {
          // Entering personal from sleep IS the wake intent (one click =
          // the transition); the wake is an ACT and is reported as one.
          const s = await postEntityState(base, entityName, "awake", "operator started his personal time (web toggle)", token);
          setEntityState(s);
          acts.push("woke him");
        }
        if (freshLoop?.running) {
          // Loop process already alive (it was suppressed by the sleep
          // state) — the wake alone re-enters personal; starting a second
          // loop would be refused anyway.
          setControlNote((acts.length ? acts.join(" and ") + " — " : "") + "his personal time resumes.");
          reconcile();
        } else {
          // ONE substrate per entity (2026-07-09 06:32): the gateway
          // resolves the entity's persisted choice — the loop never asks
          // separately. No choice anywhere -> the refusal names the fix.
          const r = await startLoop(base, entityName, token, {});
          if (r.started) {
            acts.push("started his personal time");
            if (r.status?.running) setLoopStatus(r.status);
            setControlNote(acts.join(" and ") + ".");
          } else {
            setLoopStatus(r.status ?? null);
            setControlNote(
              (acts.length ? acts.join(" and ") + ", but " : "") +
                "his personal time did not start — the status chip carries the live state.",
            );
          }
          reconcile();
        }
      }
    } catch (e) {
      const err = e as Error & { status?: number };
      // B2: /loop/* refusals carry {reason_code, message, loop} — adopt the
      // LIVE loop status into the button and speak the reason verbatim,
      // never JSON armor.
      const refusal = parseLoopRefusal(err);
      if (refusal) {
        if (refusal.loop) setLoopStatus(refusal.loop);
        setControlNote(`Own time: ${refusal.message}`);
      } else {
        setControlNote(
          err.status === 401 || err.status === 403
            ? authRefusedMsg(err.status, err.message)
            : `Own-time request refused: ${err.message}`,
        );
      }
      reconcile();
    } finally {
      setLoopBusy(false);
    }
  }, [sourceKind, entityName, gatewayUrl, loopBusy, controlToken, refreshEntityTruth, clientVisit]);

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
      // ALL state axes clear together (adversary P0: cognition/serverLife
      // survived the index return, painting Castor's working pulse +
      // billed spend over the roster — a same-screen cross-entity lie).
      setEntityState(null);
      setLoopStatus(null);
      setServerLife(null);
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

  useEffect(() => {
    if (!playing || live) return;
    let raf = 0;
    playRef.current = { acc: 0, last: performance.now() };
    const step = (now: number) => {
      const play = playRef.current;
      if (!play) return;
      play.acc += ((now - play.last) / 1000) * BASE_EPS * speed;
      play.last = now;
      const advance = Math.floor(play.acc);
      if (advance > 0) {
        play.acc -= advance;
        setScrubIndex((i) => {
          const next = Math.min(envelopes.length - 1, i + advance);
          if (next >= envelopes.length - 1) setPlaying(false);
          return next;
        });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, live, speed, envelopes.length]);

  // ------------------------------------------------------------- the fold

  const effectiveIndex = live ? envelopes.length - 1 : scrubIndex;
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

  // The TEMPORAL count at the scrub position (two-count model): green
  // warmth in the canvas keys on this decaying activation, never on the
  // global counts. Pure over the fold's bounded attention windows —
  // recomputes once per fold change, not per frame.
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
  // TOPIC filter (2026-07-17): clicking a community bubble on the Topics
  // map lights its members on the raw graph — same emphasis mechanism,
  // one more intersecting source.
  const [topicFilter, setTopicFilter] = useState<{ ids: Set<string>; label: string } | null>(null);
  // Main-area view: the raw graph or the topic map (operator: "keep both
  // the current one, and the one you are gonna design").
  const [mainView, setMainView] = useState<"graph" | "topics">("graph");
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

  const sendState = useCallback(
    (target: "awake" | "asleep" | "paused") => {
      if (sourceKind !== "gateway" || !entityName) return;
      // In-flight guard (func review P1): a double-click on the sleep slot
      // or ⛔ stop must not race two state writes through the door.
      if (stateBusyRef.current) return;
      stateBusyRef.current = true;
      // No ceremony (maintainer ruling 2026-07-08): the act stays visible
      // — the transition lands as a host marker with this reason attached.
      const reason = "by the operator (web controls)";
      const base = gatewayUrl.trim().replace(/\/+$/, "");
      const verb = target === "awake" ? "wake" : target === "asleep" ? "sleep" : "pause";
      postEntityState(base, entityName, target, reason, controlToken.trim() || null)
        .then((s) => {
          setEntityState(s);
          setControlNote(`${verb} accepted by the door`);
          window.setTimeout(() => setControlNote(null), 6000);
        })
        .catch((e: Error & { status?: number }) => {
          // authRefusedMsg splits 401 (sign in) from 403 (door refused the
          // act); the old wording here named a "token in the control panel"
          // mechanism the 2026-07-09 auth ruling removed.
          setControlNote(
            e.status === 401 || e.status === 403
              ? authRefusedMsg(e.status, e.message)
              : `The door refused: ${e.message}`,
          );
          window.setTimeout(() => setControlNote(null), 10000);
        })
        .finally(() => {
          stateBusyRef.current = false;
        });
    },
    [sourceKind, entityName, gatewayUrl, controlToken],
  );

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
          {/* ONE state chip (maintainer 2026-07-09): never two contradictory
            * badges. deriveLifeState collapses chat/state/loop into a single
            * mutually-exclusive phase (visiting suppresses own-time+sleep).
            * Gate includes serverLife (state-wave fix: the chip vanished
            * when only the composite endpoint answered) and renders the
            * honest "state unknown" when nothing has. */}
          {sourceKind === "gateway" && entityName ? (
            <span className={`eh_state eh_life_${life.accent}`} title={entityState?.reason ? `${life.detail} — ${entityState.reason}` : life.detail}>
              {life.label}
            </span>
          ) : null}
          {/* Suppressed while a visit renders (dm#94 P2-10): a live visit is
            * settled truth — a second endpoint's transition word must not
            * stand beside the visit chip. */}
          {cognition?.settling && !life.visiting ? (
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
            <button className="eh_home" onClick={() => goToIndex()} title="All entities — back to the manager roster">
              <Icon name="board" size={15} />
              <span>Entities</span>
            </button>
          ) : null}
          <AfTopBarActions
            assistant={{ open: assistantOpen, onToggle: () => setAssistantOpen((v) => !v), label: "Ask the docs assistant" }}
            appearance={{ onOpen: () => setAppearanceOpen(true) }}
            about={about}
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
            }}
          />
        </div>
      </header>

      {sourceKind === "gateway" && entityName && !gatewayLocked ? (
        <div className="entity_controls">
          {/* Maintainer ruling (2026-07-08 00:59): no pre-gating. The
            * buttons are always live; if the gateway refuses, its actual
            * answer renders here. (IA review P2: the "🎛 controls" text
            * label was dead weight — the radio is self-describing.) */}
          {/* THE PHASE RADIO (laurent 13:28, c1455 ask 4): the FOUR ruled
            * phases as one radio group — exactly one pushed (the ACTIVE
            * phase from the one derived machine); settling/unknown = no
            * position pushed, the chip says so. visit/work render but have
            * no entry surface yet (visits start by talking; work doors are
            * gateway's 3d build) — disabled with honest words, never fake
            * affordances. personal + sleep are the operator-pushable pair
            * (existing act semantics kept: fresh-read stop/start, wake).
            * When uic's shared AfPhaseRadio ships, this local group adopts
            * it. */}
          {/* THE PHASE RADIO — uic's shared AfPhaseRadio (adopted c2113, my
            * old c1398 note discharged). The kit owns the markup + the
            * gold-gradient variants; my derived machine stays the ONE truth
            * (phase = activePhase; per-slot facts below). visit/work render
            * disabled with honest words (no entry surface here); personal +
            * sleep are the operator-pushable pair with the SAME act
            * semantics kept (fresh-read stop/start, wake). The three
            * personal sub-states ride the kit's `variant` (active/resting/
            * suppressed) so the operator's "state is broken" nuance
            * survives the swap. */}
          <AfPhaseRadio
            className="ec_phase_radio"
            phase={activePhase}
            slots={{
              visit: {
                label: <>💬 visit</>,
                // Disabled only when NOT current (adversary 7.1: the kit
                // dims disabled buttons — a live visit's pushed-gold
                // position rendered half-off).
                disabled: activePhase !== "visit",
                title:
                  activePhase === "visit"
                    ? "CURRENT — a visitor is in the room (turn-based: he waits between messages)"
                    : "Visits start by talking — open the Chat tab and knock; there is no button-entry into a visit",
              },
              work: {
                label: <>🛠 work</>,
                disabled: activePhase !== "work",
                title:
                  activePhase === "work"
                    ? "CURRENT — working a task autonomously until completion"
                    : "Work-phase entry doors are being built (gateway lane) — no task surface exists here yet",
              },
              personal: ((): AfPhaseSlot => {
                // ARMED ≠ in-phase (semantics' rule) → the underline dot.
                // grantAlarm (loop alive, NOT armed) is the loudest pixel.
                // The three sub-states map to the kit's variant: active =
                // ticking now, resting = personal-phase between days,
                // suppressed = loop alive but not the current phase.
                const variant: AfPhaseSlot["variant"] =
                  activePhase === "personal" ? (life.ownTimeActive ? "active" : "resting") : life.ownTimeOn ? "suppressed" : undefined;
                // THE LABEL IS THE PHASE NAME, PERIOD (laurent 2026-07-15
                // 22:38: "you can't change the name of a phase like that" —
                // "personal · standing by" read as a renamed phase). Every
                // sub-state nuance lives in the tooltip + the kit variant
                // styling; the only label change is the busy ellipsis.
                // ONE design at all times (dm#127): the word never swaps
                // for "…" — busy renders as disabled styling only.
                const label = "⏻ personal";
                const title = grantAlarm
                  ? "ALARM: the loop process is ALIVE but personal time is NOT armed (this is the state that burned tokens unnoticed). Click to STOP the loop; arming is the console's act"
                  : life.stopping
                    ? "Stop requested — his running thought completes, then his personal time ends"
                    : activePhase === "personal" && life.ownTimeActive
                      ? "CURRENT — living a day by himself right now. Click to stop at the next tick boundary"
                      : activePhase === "personal"
                        ? life.phase === "paused"
                          ? "Personal phase, GATED (paused) — click to resume"
                          : "Personal phase, resting between days — the next day starts by itself. Click to stop"
                        : life.ownTimeOn
                          ? "His personal phase ended for the current one; the loop process stands by for re-entry (no ticks). Click to stop it entirely"
                          : grantArmed === true
                            ? "ARMED but not started — click to start his personal time"
                            : grantArmed === false
                              ? "NOT armed (mode: disabled) — a start will be refused; arming is the operator's console act"
                              : life.sleeping
                                ? "He is asleep — click to wake him AND start his personal time"
                                : "Click to start his personal time (the self-prompted tick loop)";
                return {
                  label: <>{label}</>,
                  title,
                  onSelect: () => void toggleLoop(),
                  busy: loopBusy,
                  armed: grantArmed === true,
                  alarm: grantAlarm,
                  variant,
                };
              })(),
              sleep: {
                label: <>🌙 sleep</>,
                // Paused disables it too (impl adversary P2-7): with the
                // kill switch on, a sleep click would post asleep OVER the
                // stop — restore is the only act the radio may offer.
                disabled: life.visiting || life.phase === "paused",
                onSelect: () => sendState(life.sleeping ? "awake" : "asleep"),
                title:
                  activePhase === "sleep"
                    ? life.phase === "dreaming"
                      ? "CURRENT — dreaming (consolidation in this window). Click to wake him"
                      : entityState?.written_by === "self" && !serverLife
                        ? "CURRENT — sleeping by his own choice. Click to wake him"
                        : "CURRENT — asleep. Click to wake him"
                    : life.visiting
                      ? "He is in a visit — he cannot sleep while a visitor is in the room"
                      : "Click to put him to sleep (rest / consolidation)",
              },
            }}
          />
          {/* The old ec_idle_hint ("settling" beside the radio) is REMOVED
            * (adversary-A find 10): the header chip already says
            * "sleep (settling)" with the full tooltip — a second token for
            * the same fact was the said-it-twice class (IA review P2), and
            * a THIRD unrelated "settling" chip (cognition transition
            * window) can co-render in the same strip. One word, one owner:
            * the chip. */}
          {/* THE NOW LINE (adversary A#6.1 — laurent 2026-07-15 22:38: "the
            * UI is completely uninformative in terms of what happened").
            * The current cause IN THE WORDS THE MACHINE WROTE, in plain
            * sight, not a tooltip: a self-elected sleep shows HIS reason,
            * an auto-yield says it is visit bookkeeping, an operator act
            * names the operator. Fed from data already polled. */}
          {(() => {
            const reason = String(serverLife?.state_reason ?? entityState?.reason ?? "").trim();
            if (!reason) return null;
            const changedAt = entityState?.changed_at ? new Date(entityState.changed_at) : null;
            const ageMin = changedAt && !Number.isNaN(changedAt.getTime()) ? Math.max(0, Math.round((Date.now() - changedAt.getTime()) / 60000)) : null;
            const isSelf = /^self-elected/i.test(reason);
            const text = isSelf ? reason.replace(/^self-elected sleep:\s*/i, "his choice — ") : reason;
            return (
              <span className="ec_nowline" title={`Why the current state: the reason recorded at the last transition${changedAt ? ` (${changedAt.toLocaleString()})` : ""}. Self-elected reasons are his own words, verbatim.`}>
                {text}
                {ageMin !== null ? ` · ${ageMin < 60 ? `${ageMin}m` : `${Math.floor(ageMin / 60)}h${ageMin % 60 ? ` ${ageMin % 60}m` : ""}`} ago` : ""}
              </span>
            );
          })()}
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
            if (life.visiting) return null;
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
          {/* THE KILL SWITCH (liveness axis): distinct from the radio by
            * position, color and words — two named acts (stop/restore)
            * behind a blast-radius confirm. stop = the promoted paused
            * hard-freeze (16:12 ruling). */}
          {life.phase !== "paused" ? (
            <button
              className="ec_btn ec_stop_btn"
              onClick={() => {
                if (window.confirm(`STOP ${entityName}? (the kill switch)\n\nEvery process blocks: no ticks, no visits, no work, no sleep processes — he becomes unreachable until an operator restores him. His memory is untouched.\n\nThis is protection (rogue behavior, hijack, degradation), not punishment.`)) {
                  sendState("paused");
                }
              }}
              title="The primary kill switch (stop = paused hard-freeze): blocks everything, operator-only, recorded as a marker"
            >
              ⛔ stop
            </button>
          ) : null}
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

      {/* THE STOPPED BANNER (liveness axis, laurent 16:06/16:12): the kill
        * switch outranks every chip — full-width, unmistakable, carrying
        * the restore act. Renders whenever the promoted paused hard-freeze
        * is on, regardless of tab or view. */}
      {sourceKind === "gateway" && entityName && life.phase === "paused" ? (
        <div className="entity_stopped_banner" role="alert">
          <span className="esb_glyph">⛔</span>
          <span className="esb_text">
            <strong>STOPPED</strong> — the kill switch is on: no ticks, no visits, no work, no sleep processes. He is not
            reachable until restored.
            {entityState?.reason ? ` Reason: ${entityState.reason}` : ""}
          </span>
          <button
            className="esb_restore"
            onClick={() => {
              if (window.confirm(`Restore ${entityName} to ALIVE?\n\nThis lifts the kill switch: doors reopen (visits, work), sleep processes may run, and any armed personal grant can tick again.`)) {
                sendState("awake");
              }
            }}
            title="Lift the kill switch — he becomes reachable again (operator act, recorded as a marker)"
          >
            restore
          </button>
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
          onConnected={(state) => {
            if (state.token) setGatewayToken(state.token);
            setAuthState(state);
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
      <AfDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} label="Assistant" title="AbstractEntity assistant" topOffset={49}>
        <AssistantPanel
          ask={(q, ctx) => askEntityAssistant(indexBase ?? (sourceKind === "gateway" ? gatewayUrl.trim().replace(/\/+$/, "") : null), controlToken.trim() || null, q, ctx)}
          assistantName="Docs assistant"
          blockedNotice={
            gatewayLocked
              ? "Sign in first (the gateway refused this browser) — the assistant rides the same session."
              : sourceKind === "gateway"
                ? undefined
                : "Connect to a gateway to ground answers in the docs."
          }
        />
      </AfDrawer>
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
                  className={`lens_search_toggle ${mainView === "topics" ? "active" : ""}`}
                  aria-pressed={mainView === "topics"}
                  title="Topic map — his memories regrouped by community (louvain over the memory graph, computed at the runtime level). The raw graph stays one click away."
                  onClick={() => {
                    // Close the search bar with the map open — its pushed-down
                    // lens row overprinted the map header (adversary F9).
                    setSearchOpen(false);
                    setMainView((v) => (v === "topics" ? "graph" : "topics"));
                  }}
                >
                  🗺<span className="lens_search_label">topics</span>
                </button>
              ) : null}
              {topicFilter !== null ? (
                <button
                  className="lens_chip active tm_filter_chip"
                  title={`The graph is lit to the "${topicFilter.label}" topic (${topicFilter.ids.size} memories) — click to clear`}
                  onClick={() => setTopicFilter(null)}
                >
                  🗺 {topicFilter.label.length > 26 ? `${topicFilter.label.slice(0, 25)}…` : topicFilter.label} ✕
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
          {mainView === "topics" && verbatimSource ? (
            <TopicMap
              baseUrl={verbatimSource.baseUrl}
              entity={verbatimSource.entity}
              fold={fold}
              onPickTopic={(rowIds, label) => {
                if (rowIds && rowIds.size > 0 && label) {
                  setTopicFilter({ ids: rowIds, label });
                  setMainView("graph"); // see the community ON the graph
                } else {
                  setTopicFilter(null);
                }
              }}
            />
          ) : (
            <GraphCanvas
              fold={fold}
              temporal={temporal}
              scrubSeq={scrubSeq}
              selectedId={selectedId}
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
            />
          )}
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
            <span
              className="lg_edge"
              title="usage trail — turns green when the two memories served a RECENT moment together (temporal count: decays with activity, so old habits fade back to grey); line width grows with lifetime co-use; flashes in the accent colour when just traveled"
            >
              {/* SVG strokes ride the SAME tokens the canvas resolves — the
                * legend must never diverge from what it explains (adversarial
                * round 2: hardcoded swatches went invisible on light). */}
              <svg width="26" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="26" y2="3" stroke="var(--adm-both)" strokeWidth="1.8" />
              </svg>
              warm together
            </span>
            <span className="lg_edge" title="green glow — this memory was RECENTLY selected (temporal count: decays with activity); node SIZE carries the lifetime count, which never decays">
              <svg width="14" height="14" aria-hidden="true">
                <circle cx="7" cy="7" r="6" fill="var(--adm-both)" opacity="0.35" />
                <circle cx="7" cy="7" r="3" fill="var(--memory)" />
              </svg>
              warm now
            </span>
            {warmthAge ? (
              <span
                className="lg_edge lg_stale"
                title="Warmth decays with ACTIVITY, not wall time — while nothing runs, the last recall stays green. This is how long ago that last selection actually happened."
              >
                🥶 last selection {warmthAge} ago
              </span>
            ) : null}
            {temporal.head_burst && temporal.head_burst.total >= temporal.config.window_limit * 0.25 ? (
              // HONEST DECAY MUST SAY WHY (fable5 verdict on laurent c5439:
              // a young shelf selects every episode every turn, so one
              // commit deposits n + C(n,2) window slots — 253 at turn 22 —
              // pushing every prior selection hundreds of ranks deep; the
              // operator read the resulting gray as data loss). The counts
              // are real and kept (node size = the never-decaying global
              // count); only the GREEN washed, and this names the wash.
              <span
                className="lg_edge lg_stale"
                title={`The newest recall commit deposited ${temporal.head_burst.total} attention events at once (${temporal.head_burst.selected} memories selected + their co-use pairs) into a ${temporal.config.window_limit}-event recency window — one turn's deposit pushed earlier selections far down the recency ranks, so the green cooled everywhere at once. Nothing is lost: lifetime counts are the node sizes; green means RECENT, and 'recent' just got very crowded.`}
              >
                🌊 warmth washed by a {temporal.head_burst.total}-event selection burst (shelf {temporal.head_burst.selected})
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
          activeTab={requestedTab ? `${requestedTab.tab}#${requestedTab.nonce}` : undefined}
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
                    hint: life.visiting,
                    content: (
                      <ChatDrawer
                        key={entityName} // F9: a direct A→B switch must remount — A's thread/runId must never render in B's room
                        baseUrl={gatewayUrl.trim().replace(/\/+$/, "")}
                        entity={entityName}
                        entityName={entityName.charAt(0).toUpperCase() + entityName.slice(1)}
                        token={controlToken.trim() || null}
                        authUserId={authState?.userId ?? null}
                        envelopes={envelopes}
                        onAuthRefused={() => void handleAuthRefused()}
                        roster={rosterList}
                        localAddresses={localAddresses}
                        onConveneWith={(otherSlug) => {
                          setMeetPreset({ a: entityName, b: otherSlug });
                          setShowMeetConsole(true);
                        }}
                        onVisitStateChange={handleVisitStateChange}
                      />
                    ),
                  },
                  {
                    id: "card",
                    icon: "🪪",
                    title: "Card",
                    content: <IdentityCardContent baseUrl={gatewayUrl.trim().replace(/\/+$/, "")} entity={entityName} fold={fold} />,
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
              content: <BookReader fold={fold} verbatimSource={verbatimSource} />,
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
                  <LedgerPanel
                    envelopes={envelopes}
                    scrubIndex={effectiveIndex}
                    onJump={(i) => {
                      setPlaying(false);
                      if (!live) setScrubIndex(i);
                    }}
                    onSelectSubject={setSelectedId}
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
          onTogglePlay={() => setPlaying((v) => !v)}
          onSpeed={setSpeed}
          onToggleLive={toggleLive}
        />
      )}
    </div>
  );
}
