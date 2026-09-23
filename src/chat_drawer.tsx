/**
 * The chat drawer — talk to the entity while watching its mind move
 * (maintainer's ask, 0007 160200Z item 3).
 *
 * CUTOVER (design v4/v5, RULED 2026-07-13): the backend is the DURABLE
 * visit door — /entities/{name}/visit/* — one run per visit on the
 * entity's own runtime (runtime_<slug>.sqlite3 in the home). A gateway
 * restart no longer kills the conversation; the run resumes. The hosted
 * /chat door this drawer used before is demoted legacy and never opened
 * for NEW visits from here.
 *
 * Honesty rules in pixels:
 * - `tools_ran` under each reply is DRIVER-AUTHORED truth (the
 *   marker-imitation lesson as API shape); reply prose is never parsed.
 * - Body-status rule: the door answers HTTP 200 with status:"failed" in
 *   the body — visitBodyProblem is the ONE predicate (walkthrough lesson).
 * - Opening may wait for his own-time loop to yield at a tick boundary —
 *   the wait is shown, not hidden. Refusals (paused, another visit open)
 *   render verbatim; asleep auto-wakes at the door (gateway c1320).
 * - Closing runs his reflection; what the run reports is shown.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatComposer } from "@abstractframework/panel-chat";
import { streamTtsJsonl, useGatewayVoice } from "@abstractframework/ui-kit";

import { CognitionWaveInline } from "./cognition_wave_inline";
import { turnPulse, type TurnPulse } from "./turn_pulse";
import { TurnPulseBars } from "./turn_pulse_bars";
import {
  closeVisit,
  getEntitySubstrate,
  getVisitStatus,
  getVisitTranscript,
  isAsleepWakeRefusal,
  openVisit,
  postEntityState,
  proxyCsrfToken,
  sendVisitTurn,
  visitBodyProblem,
  writeEntityWorkspaceFile,
  type ChatTurnResult,
  type VisitStatus,
  type VisitTurnResult,
} from "./stream_source";
import { toolClaimVerdict } from "./tool_claim_guard";
import { ownVisitSignal, type ClientVisitSignal } from "./entity_state";
import { resolveMentions } from "./entity_handle";
import { foldVisitStatus } from "./visit_status_poll";
import { ChatMessageList, splitVisitDecoration, toolGaugeTrustworthy, type DrawerMessage } from "./chat_message_list";
export { splitVisitDecoration } from "./chat_message_list";
import { getEntitySeat, refusalText, type EntitySeat } from "./stream_source";
import { useFlowConversation } from "./use_flow_conversation";
import { ledgerLine, type LedgerLine } from "./ledger_lines";
import type { SubstrateChoice } from "./substrate_picker";
import type { ReplayEnvelope } from "./stream_types";
import { TurnDetailModal } from "./turn_detail_modal";

/** The reflection's visible acts in the live stream: every envelope past
 * the close-start seq, rendered as ledger lines, filtered to the tones
 * that MEAN something during a close (feelings moved, records formed,
 * session markers, revisions) — recall/usage bookkeeping stays out. */
function reflectionActivity(envelopes: ReplayEnvelope[], sinceSeq: number | null): LedgerLine[] {
  if (sinceSeq === null) return [];
  const MEANINGFUL = new Set(["formation", "feeling", "session", "revision", "boundary"]);
  const out: LedgerLine[] = [];
  for (let i = envelopes.length - 1; i >= 0; i--) {
    const env = envelopes[i];
    if (env.seq <= sinceSeq) break; // envelopes are seq-ordered
    const line = ledgerLine(env);
    if (MEANINGFUL.has(line.tone)) out.push(line);
  }
  return out.reverse();
}


/** The drawer's own open visit, per entity — survives remounts and page
 * reloads so the drawer never mistakes its own session for a foreign one
 * (the maintainer's live P0: tab switch showed "a visit is already open
 * through another door" for the visit HE had opened). Post-cutover the
 * stored value is the durable visit RUN id; pre-flip `chat-…` values
 * simply never match a /visit status and age out on close. */
function chatSessionStorageKey(entity: string): string {
  return `abstractentity_chat_session:${entity}`;
}

/** Session continuity across the repo split (2026-07-12): a visit opened by
 * the pre-split observer-branded build stored its chat id under the old
 * spelling on the SAME origin — read it as a fallback so the operator can
 * rejoin their own room instead of finding a stranger's closed door.
 * Storage guards live INSIDE (fable5 finding 15: both callers wrapped,
 * the next one wouldn't know it must). */
function readStoredChatSession(entity: string): string | null {
  try {
    const fresh = localStorage.getItem(chatSessionStorageKey(entity));
    if (fresh !== null) return fresh;
    return localStorage.getItem(`abstractobserver_entity_chat_session:${entity}`);
  } catch {
    return null;
  }
}

export interface ChatDrawerProps {
  baseUrl: string;
  entity: string;
  entityName: string;
  token: string | null;
  /** The AUTHENTICATED principal's user id (maintainer ruling 2026-07-10
   * 20:17: "i am logged in through the gateway, so i am fully
   * authenticated — the 'who are you?' field should not even be there
   * and is a security risk"). Identity flows from the ONE authentication;
   * the drawer DERIVES person:<userId> and never offers a text field a
   * visitor could fake. Null = not signed in (the door will refuse). */
  authUserId: string | null;
  /** The live stream (for realtime turn activity: while OUR turn runs,
   * new envelopes on this home ARE this turn's activity — one life, one
   * summon). tools_ran in the turn response remains the tool authority. */
  envelopes: ReplayEnvelope[];
  /** Called when the DOOR refuses a write with 401/403 despite the UI
   * believing it is authed (a stale/unusable credential — e.g. a session
   * cookie that cannot ride to a cross-origin gateway). The host clears
   * verified-auth and reopens sign-in — the dead-end becomes a recovery
   * path (maintainer 2026-07-10 20:56: "still not working despite being
   * authenticated"). */
  onAuthRefused(): void;
  /** The roster (for @handle mention resolution) + this gateway's local
   * addresses (lan ip, gateway host, loopback) — operator 2026-07-15:
   * mentioning `castor@<local>` in a visit offers to convene a meet. */
  roster?: Array<{ slug: string; name: string }>;
  localAddresses?: string[];
  /** Convene a meet with the current entity + the mentioned one (opens the
   * meet console pre-filled). Cross-gateway is not wired yet. */
  onConveneWith?(otherSlug: string): void;
  /** FIRST-HAND VISIT TRUTH flows UP (dm#94 exclusivity incident: the
   * header rendered "personal · resting" while this drawer conducted a
   * live conversation — the parent fed deriveLifeState a null visit axis
   * because this component kept its open session to itself). Fired
   * whenever the folded signal changes: null = no visit this drawer
   * knows of. */
  onVisitStateChange?(signal: ClientVisitSignal | null): void;
}

export function ChatDrawer(props: ChatDrawerProps): React.ReactElement {
  const { baseUrl, entity, entityName, token, authUserId, envelopes, onAuthRefused, roster, localAddresses, onConveneWith, onVisitStateChange } = props;
  /** Identity derives from the session principal — never typed, never
   * spoofable client-side (the door verifies regardless; this is the
   * honest display of what will be stamped). */
  const participant = authUserId ? `person:${authUserId}` : "";
  const [status, setStatus] = useState<VisitStatus | null>(null);
  /** The open DURABLE visit's run id (the steer key, the reattach key, the
   * R2 proof surface — §5 consumer contract). */
  const [runId, setRunId] = useState<string | null>(null);
  // THE FLOW-BRAIN LANE (operator tasking c5190; door acceptance GREEN
  // c5246): an alternative brain for the conversation — each prompt is ONE
  // summon of the entity-chat VisualFlow (recall → lived turn → elections →
  // commit → episode through the production door). Session continuity
  // rides the entity's own GRAPH (proven: veya recalled across fresh
  // summons); one session id groups this drawer's turns.
  const [brain, setBrain] = useState<"driver" | "flow">("driver");
  const [messages, setMessages] = useState<DrawerMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"idle" | "opening" | "turn" | "closing">("idle");
  /** Stream head at close-click — everything past it is the reflection. */
  const closeSeqRef = useRef<number | null>(null);
  /** Live mirror of the envelopes prop for callbacks (close recap reads
   * the stream at completion time, not at callback-creation time). */
  const envelopesRef = useRef<ReplayEnvelope[]>([]);
  envelopesRef.current = envelopes;
  const [note, setNote] = useState<string | null>(null);
  /** THE BUSY SIGNAL (P0 seat-steal incident, laurent 04:47 via flow
   * c5330): the door answered 409 — someone holds his seat. Renders the
   * retry affordance on the start screen; the queue-instead-of-409 half
   * is the gateway's build (its button lands when the door serves it). */
  const [seatBusy, setSeatBusy] = useState(false);
  /** The seat read (gateway slice 1, c5390): WHO holds the conversation —
   * the occupancy line's source. Null = endpoint absent (pre-slice door)
   * or unread; render-when-served, facts only (preemption is slice 2 —
   * no promises rendered until it ships). */
  const [seat, setSeat] = useState<EntitySeat | null>(null);
  /** Visit-status miss state (fable5 findings 5+6): the fold law lives in
   * visit_status_poll.ts; the counter is keyed to a RUN ID so a streak can
   * never leak across run identities and kill a fresh visit. */
  const missStateRef = useRef<{ misses: number; missesForRun: string | null }>({ misses: 0, missesForRun: null });
  const [detailTurn, setDetailTurn] = useState<ChatTurnResult | null>(null);
  // ONE substrate per entity (maintainer ruling 2026-07-09 06:32): the
  // drawer only DISPLAYS the gateway-stored mind; it is changed in the
  // controls strip (🧠) and resolved by the gateway on open — the visit
  // never asks separately.
  const [substrate, setSubstrate] = useState<SubstrateChoice | null>(null);
  useEffect(() => {
    let cancelled = false;
    getEntitySubstrate(baseUrl, entity)
      .then((s) => {
        if (!cancelled) setSubstrate(s && s.provider && s.model ? { provider: s.provider, model: s.model, thinking: s.thinking ?? null } : null);
      })
      .catch(() => undefined); // display-only; the open's refusal is the authority
    return () => {
      cancelled = true;
    };
  }, [baseUrl, entity]);
  // Files handed to the entity (maintainer ask, 2026-07-09): dropped or
  // picked, uploaded to his workspace/shared, referenced in the next turn.
  const [pendingFiles, setPendingFiles] = useState<Array<{ name: string; path: string }>>([]);
  const [dropActive, setDropActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const idRef = useRef(0);
  /** Seq high-water when the current turn started — live envelopes above
   * it render as realtime activity lines under the thinking shimmer. */
  const turnStartSeqRef = useRef<number>(Infinity);
  /** Chat ids we already rehydrated — the transcript fetch runs once per
   * adopted session, not once per status poll. */
  const rehydratedRef = useRef<Set<string>>(new Set());

  /** Speaker control (operator item 3, c1216/c1239): streaming TTS through
   * the gateway JSONL endpoint via uic's useGatewayVoice + streamTtsJsonl —
   * plays on the first synthesized segment, pause/resume, stop aborts.
   *
   * Run scope: entity visits are hosted ChatSessions, NOT durable runs, so
   * the visit's chat id is unknown to the gateway run store. The route
   * auto-creates owner runs ONLY for `session_memory_*` ids (gateway c1220)
   * — derive one from the chat id so synthesized-audio artifacts group per
   * visit. Both postures speak: proxy rides cookies + the CSRF twin;
   * direct-bearer rides Authorization through the kit's headers passthrough
   * (uic folded it on this seat's c1242 flag).
   */
  const ttsStream = useMemo(() => {
    if (!runId) return undefined;
    // The entity-owned TTS lane (gateway dm#10 ship, c2981 ask 2): the
    // door resolves HIS voice server-side (home voice.yaml triple,
    // late-bound; X-Voice-Source names the source) — the old
    // session_memory_visit_ run-scope workaround retires with it.
    return (text: string) =>
      streamTtsJsonl({
        path: `${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/voice/tts/stream`,
        body: { text, format: "wav" },
        csrfToken: proxyCsrfToken() ?? undefined,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
  }, [token, runId, baseUrl, entity]);
  const voice = useGatewayVoice({
    tts_stream: ttsStream,
    // The hook clears errors with ""; only real messages reach the note line.
    on_error: (m) => {
      if (m) setNote(`Speech failed: ${m}`);
    },
  });
  const { stop_tts } = voice;
  // THE RENDER STORM FIX (blink forensics 2026-07-16, measured ~10k React
  // commits/sec): the kit recreates stop_tts EVERY render and stop_tts()
  // unconditionally set_tts_playback({..new object..}) — so an effect
  // depending on [stop_tts] fired per render and each call scheduled the
  // next render: a synchronous commit loop saturating the main thread
  // (the page-wide "blinking" was paint starvation). The effect below
  // reads the CURRENT stop through a ref and fires on runId changes only.
  const stopTtsRef = useRef(stop_tts);
  stopTtsRef.current = stop_tts;
  // A closed room must fall silent: runId flips to null on close/switch and
  // any buffered playback for the previous visit stops. Deps: runId ONLY —
  // stop_tts identity churns per render (see storm note above).
  useEffect(() => {
    if (!runId) stopTtsRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const liveActivity = useMemo(() => {
    if (busy !== "turn") return [];
    const lines: string[] = [];
    for (let i = envelopes.length - 1; i >= 0 && lines.length < 5; i--) {
      const env = envelopes[i];
      if (env.seq <= turnStartSeqRef.current) break;
      const line = ledgerLine(env);
      if (line.tone === "quiet") continue;
      lines.push(line.title + (line.detail ? ` — ${line.detail}` : ""));
    }
    return lines.reverse();
  }, [busy, envelopes]);

  /** The pulse behind the thinking bars (operator 2026-08-01): live recall/
   * context signals folded from the same envelopes-past-turn-start window
   * the activity lines read — one seq boundary, one truth. */
  const EMPTY_PULSE: TurnPulse = useMemo(() => ({ shelf: null, recallTokens: null, formed: 0 }), []);
  const livePulse = useMemo(
    () => (busy === "turn" ? turnPulse(envelopes, turnStartSeqRef.current) : EMPTY_PULSE),
    [busy, envelopes, EMPTY_PULSE],
  );
  /** Turns lived in THIS thread (the one being lived counts — its user
   * message is already pushed when the wait begins). */
  const turnCount = useMemo(() => messages.filter((m) => m.role === "user").length, [messages]);

  const push = useCallback((msg: Omit<DrawerMessage, "id">) => {
    idRef.current += 1;
    // Never hand React (or any card) a non-string content — the object-as-
    // child class killed the whole app once (React #31, maintainer's
    // critical 2026-07-08 23:49). Coerce at the single entry point.
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
    setMessages((prev) => [...prev, { ...msg, content, id: `m${idRef.current}`, ts: new Date().toISOString() }]);
  }, []);

  // THE FLOW-BRAIN LANE lives in its own hook (fable5 consolidation plan
  // B): conversation lifecycle, turn drive, goodbye close, queue lane.
  // The drawer keeps pixels + the composer.
  const {
    flowActive,
    startConversation,
    sendFlow,
    endFlowConversation,
    stopWaiting,
    warnOnce,
    queueOffer,
    acceptQueueOffer,
    dismissQueueOffer,
    queueState,
    stepAway,
  } = useFlowConversation({ baseUrl, entity, entityName, token, push, setBusy, setDraft, envelopesRef, turnStartSeqRef });

  /** Resume a visit after a remount/reload: the durable transcript (pure
   * read from the run's own vars, works on live AND terminal runs) rebuilds
   * the thread. Called automatically when the stored run id matches the
   * open visit, and manually via the REJOIN button when it does not
   * (maintainer, 2026-07-09: a reload lost the stored id and the drawer
   * dead-ended on "another door" for HIS OWN discussion).
   *
   * Honest absence: the durable history holds role/content messages — the
   * per-turn tool lists live in the LIVE turn responses (probe payload),
   * not at rest, so rehydrated turns carry no tools line rather than a
   * fabricated zero. */
  const rehydrate = useCallback(
    (ownRunId: string) => {
      try {
        localStorage.setItem(chatSessionStorageKey(entity), ownRunId);
      } catch {
        // presentation state only
      }
      if (rehydratedRef.current.has(ownRunId)) {
        setRunId(ownRunId);
        return;
      }
      setRunId(ownRunId);
      getVisitTranscript(baseUrl, entity, ownRunId)
        .then((t) => {
          // Mark rehydrated ON SUCCESS only (code adversary F17): marking
          // before the fetch made a gateway blip permanent — REJOIN would
          // never refetch and the thread stayed empty.
          rehydratedRef.current.add(ownRunId);
          const rebuilt: DrawerMessage[] = [];
          let mid = 0;
          rebuilt.push({ id: `r${++mid}`, role: "system", content: `Rejoined the open visit with ${entityName}.` });
          for (const msg of t.turns ?? []) {
            if (!msg.content) continue;
            if (msg.role === "user") {
              // The durable transcript holds the DECORATED user message
              // (presence + MEMORIES + words). Fold the decoration behind
              // a one-line context card; the card shows the words.
              const { context, text } = splitVisitDecoration(msg.content);
              rebuilt.push({ id: `r${++mid}`, role: "user", content: text, ...(context ? { context } : {}) });
            } else if (msg.role === "assistant") {
              // Past turns keep their tool evidence (memory forensics c74:
              // rehydrated turns had NO modal, so the screenshot could only
              // come from a live-cached response). The transcript's
              // ledger-folded tool_details rebuild a minimal detail so the
              // system chip + tools tab work after a reload; absent field =
              // pre-fix gateway or beyond the answer trail — no chip, never
              // a fabricated zero.
              const detail =
                msg.tool_details && msg.tool_details.length > 0
                  ? {
                      reply: msg.content,
                      tools_ran: msg.tool_details.map((t) => t.name),
                      tool_details: msg.tool_details,
                    }
                  : undefined;
              rebuilt.push({ id: `r${++mid}`, role: "assistant", content: msg.content, title: entityName, ...(detail ? { detail } : {}) });
            }
          }
          idRef.current = mid;
          setMessages(rebuilt);
        })
        .catch((e: Error) => {
          push({ role: "system", content: `Rejoined the open visit; earlier turns could not be fetched (${e.message}) — reopen the tab to retry.`, level: "warn" });
        });
    },
    [baseUrl, entity, entityName, push],
  );

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getVisitStatus(baseUrl, entity)
        .then((s) => {
          if (cancelled) return;
          setStatus(s);
          if (s.open && !runId && !flowActive) {
            // An open visit that WE started (stored run id matches) resumes
            // automatically. Any other open visit renders with a REJOIN
            // button instead of a dead end — never auto-hijacked, but the
            // operator can always step back in (their reload may have lost
            // the stored id; the room is still theirs to enter).
            let stored: string | null = null;
            try {
              stored = readStoredChatSession(entity);
            } catch {
              // presentation state only
            }
            if (stored && s.run_id === stored) rehydrate(stored);
          }
          // THE FOLD LAW lives in visit_status_poll.ts (fable5 findings
          // 5+6): one racy open:false read never resets a held room, a
          // foreign holder is a positive fact, and miss streaks belong to
          // ONE run id. seatBusy is cleared FUNCTIONALLY and is not a dep
          // — its transitions must not re-arm the interval (a re-arm's
          // immediate poll could land two "agreeing" reads milliseconds
          // apart inside one transient server window, defeating the
          // debounce's 15s spacing argument).
          if (!s.open) {
            setSeatBusy((v) => (v ? false : v));
            setNote((n) => (n && n.startsWith("His seat is taken") ? null : n));
          }
          const action = foldVisitStatus({ runId, misses: missStateRef.current.misses, missesForRun: missStateRef.current.missesForRun }, s);
          if (action.kind === "keep") {
            missStateRef.current = { misses: action.misses, missesForRun: action.missesForRun };
          } else if (action.kind === "count_miss") {
            missStateRef.current = { misses: action.misses, missesForRun: action.missesForRun };
          } else {
            missStateRef.current = { misses: 0, missesForRun: null };
            setRunId(null);
            try {
              localStorage.removeItem(chatSessionStorageKey(entity));
            } catch {
              // best-effort
            }
            push({
              role: "system",
              content:
                action.kind === "foreign_takeover"
                  ? "Another conversation took his seat — this session's room closed. Your thread above stays; the start screen shows the door's holder."
                  : "The visit ended server-side (two status reads agree). Your thread above stays — open a new visit to continue.",
              level: "warn",
            });
          }
        })
        .catch(() => !cancelled && setStatus(null));
      getEntitySeat(baseUrl, entity)
        .then((sr) => !cancelled && setSeat(sr))
        .catch(() => !cancelled && setSeat(null));
    };
    poll();
    const interval = window.setInterval(poll, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [baseUrl, entity, runId, rehydrate, flowActive, push]);

  // FIRST-HAND VISIT TRUTH UP (dm#94): fold the three drawer facts (the
  // GET /visit poll, the held run id, mid-turn) into ONE signal and hand
  // it to the parent whenever it materially changes — so deriveLifeState
  // is never blind to the conversation this very app is conducting. The
  // ref keeps the callback identity out of the effect deps (a parent
  // re-render must not re-fire an unchanged signal); the signature guard
  // keeps the 15s poll's fresh object identity from churning parent state.
  const onVisitStateChangeRef = useRef(onVisitStateChange);
  onVisitStateChangeRef.current = onVisitStateChange;
  const lastVisitSigRef = useRef<string>("");
  useEffect(() => {
    const sig = ownVisitSignal(status, runId, busy);
    const key = sig ? `${sig.runId ?? ""}|${sig.midTurn ? 1 : 0}|${sig.owned ? 1 : 0}` : "closed";
    if (key === lastVisitSigRef.current) return;
    lastVisitSigRef.current = key;
    onVisitStateChangeRef.current?.(sig);
  }, [status, runId, busy]);
  // Unmount (entity switch remounts the drawer keyed by name): the old
  // room's signal must not linger on the new room's header.
  useEffect(
    () => () => {
      onVisitStateChangeRef.current?.(null);
    },
    [],
  );

  // A stale refusal ("auth required") must not outlive a successful sign-in
  // (maintainer screenshots 2026-07-10: connected badge beside the old
  // refusal text). Auth change wipes the note.
  useEffect(() => {
    setNote(null);
  }, [token, authUserId]);

  const open = useCallback(() => {
    // Identity from authentication ONLY (maintainer 2026-07-10 20:17): the
    // participant is the signed-in principal; an unauthenticated open is
    // the door's to refuse, never ours to fake as person:operator.
    const who = participant || "person:operator";
    // ONE substrate per entity (2026-07-09 06:32): the gateway resolves the
    // entity's persisted choice — the visit never asks separately. If no
    // choice exists anywhere, the gateway's refusal names the fix.
    setBusy("opening");
    setNote("Opening — if his own time is running, this waits for the tick boundary (up to a minute)…");
    const onOpened = (r: Awaited<ReturnType<typeof openVisit>>) => {
      setSeatBusy(false);
      setRunId(r.run_id);
      rehydratedRef.current.add(r.run_id); // freshly opened: nothing to fetch
      try {
        localStorage.setItem(chatSessionStorageKey(entity), r.run_id);
      } catch {
        // best-effort
      }
      setNote(null);
      // Direction of the visit reads human-first (maintainer, 2026-07-10
      // 23:50): the OPERATOR visits the entity's home — never the
      // reverse ("Mnemosyne is visiting with you" read backwards). The
      // DURABLE framing is stated once: this conversation survives
      // restarts (R2 — the whole point of the cutover).
      const warned = (r.prelude_warnings ?? []).length;
      push({
        role: "system",
        content: `The door opened: you are visiting ${entityName}${r.yielded_loop ? " (the visit ended his personal phase — it re-enters at close)" : ""}. This visit is a durable run (${r.run_id}) — a gateway restart cannot end it.${warned ? ` ${warned} prelude warning${warned === 1 ? "" : "s"} — see his stream.` : ""}`,
      });
      // Granted-but-unoffered honesty (grant audit 2026-07-18): when the
      // door serves the session's allowlist prune, say it up front — the
      // dashboard shows the GRANT; this line shows the session's REAL
      // toolkit so the two can never silently disagree again.
      const dropped = r.allowlist_pruned?.dropped ?? [];
      if (dropped.length > 0) {
        push({
          role: "system",
          content: `This session could not offer ${dropped.length} granted tool${dropped.length === 1 ? "" : "s"}: ${dropped.join(", ")}${r.allowlist_pruned?.reason ? ` (${r.allowlist_pruned.reason})` : ""}.`,
        });
      }
    };
    const onRefused = (e: Error & { status?: number }, retried: boolean): void => {
      // 409 = someone (or his own time) holds the room; the next status
      // poll will show the foreign-visit note — refresh it NOW so the
      // operator is not left with a stale start screen (the 23:49 race:
      // status said closed, the click met a conflict).
      if (e.status === 401 || e.status === 403) {
        // The UI believed it was authed but the door refused: the
        // credential is stale/unusable (e.g. a session cookie that
        // cannot ride cross-origin). Recover, don't dead-end — hand
        // back to the host to re-verify + reopen sign-in.
        setNote("The gateway did not accept this session for the visit — reconnecting…");
        onAuthRefused();
        setBusy("idle");
        return;
      }
      const refusal = refusalText(e);
      // B1 (laurent 04:58: "if i click visit, it should awake the entity,
      // period"). The durable door auto-wakes (gateway c1320) — this client
      // retry is the dormant belt for older doors (fires only when the
      // asleep refusal actually arrives). Matcher shared with the visit
      // lane (stream_source.isAsleepWakeRefusal, test-pinned).
      if (!retried && isAsleepWakeRefusal(refusal)) {
        setNote(`He is asleep — waking him for your visit…`);
        postEntityState(baseUrl, entity, "awake", `visit requested by ${who} (auto-wake)`, token)
          .then(() => openVisit(baseUrl, entity, token))
          .then(onOpened)
          .catch((e2: Error & { status?: number }) => onRefused(e2, true))
          .finally(() => setBusy("idle"));
        return;
      }
      // 409 occupancy = the busy signal (operator order via c5330): keep
      // the words gentle and hand back a one-click retry on the start
      // screen. Anything else stays the door's verbatim refusal.
      if (e.status === 409) {
        setSeatBusy(true);
        setNote(`His seat is taken right now — ${refusal}. Try again when his current conversation ends.`);
      } else {
        setNote(`The door refused: ${refusal}`);
      }
      getVisitStatus(baseUrl, entity)
        .then(setStatus)
        .catch(() => undefined);
      setBusy("idle");
    };
    // WHO is door-derived (the durable open takes no participants field —
    // a payload cannot engrave a false co-presence); `who` remains the
    // honest display + the wake reason's attribution.
    if (flowActive) {
      setNote("End the flow-brain conversation first — one lane at a time.");
      setBusy("idle");
      return;
    }
    openVisit(baseUrl, entity, token)
      .then((r) => {
        onOpened(r);
        setBusy("idle");
      })
      .catch((e: Error & { status?: number }) => onRefused(e, false));
    // substrate deliberately NOT a dep (the gateway resolves the persisted
    // choice; a picker change must not re-open a live visit); onAuthRefused
    // IS one (func review: a stale closure served the 401 recovery path).
  }, [baseUrl, entity, entityName, participant, token, push, onAuthRefused, flowActive]);

  /** Sanitize a dropped filename into a safe workspace leaf. */
  const safeName = (name: string): string =>
    (name.split(/[\\/]/).pop() || "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || uploading) return;
      // NO CLIENT-SIDE SIZE GATE (laurent dm#93: "it's not up to you to
      // decide what size is accepted or not" — the earlier 512 KiB
      // pre-check mirrored runtime's cap and refused before the door
      // could speak). The DOOR owns the limit: we upload, and a refusal
      // (413 etc.) surfaces in the door's own words via the catch below.
      // PDFs upload too — with a WARNING, not a refusal (the extraction
      // lane is still being designed, so raw PDF bytes read as noise to
      // him today; his files, his call).
      const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
      setUploading(true);
      setNote(
        pdfs.length > 0
          ? `Note: ${pdfs.map((f) => f.name).join(", ")} will land as raw PDF bytes — unreadable to him until the extraction lane ships. A .txt/.md copy reads today.`
          : null,
      );
      const landed: Array<{ name: string; path: string }> = [];
      try {
        for (const file of files) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const dest = `shared/${safeName(file.name)}`;
          await writeEntityWorkspaceFile(baseUrl, entity, dest, bytes, token);
          landed.push({ name: file.name, path: dest });
        }
        setPendingFiles((prev) => [...prev, ...landed]);
        push({
          role: "system",
          content: `Placed in his workspace: ${landed.map((f) => f.path).join(", ")} — he can read ${landed.length === 1 ? "it" : "them"} with read_file. Referenced in your next message.`,
          level: "info",
        });
      } catch (e) {
        setNote(`Could not hand over the file: ${refusalText(e as Error & { status?: number })}`);
      } finally {
        setUploading(false);
      }
    },
    [baseUrl, entity, token, uploading, push],
  );





  const send = useCallback(() => {
    let text = draft.trim();
    // Reference any handed-over files so the entity knows to read them.
    if (pendingFiles.length > 0) {
      const refs = pendingFiles.map((f) => `- ${f.path}`).join("\n");
      const preface = `I've placed ${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"} in your workspace (read with read_file):\n${refs}`;
      text = text ? `${preface}\n\n${text}` : preface;
    }
    if (!text || busy !== "idle") return;
    if (brain === "flow") {
      if (!flowActive) return;
      if (pendingFiles.length > 0 && warnOnce("files-lane")) {
        // The flow turn has no file-handover path yet — telling him
        // "read with read_file" would be a lie he cannot act on (lane
        // adversary P1-8). Files stay pending; the driver lane reads them.
        push({ role: "system", content: "Files need the driver lane — they stay attached; switch lanes to hand them over.", level: "warn" });
      }
      const flowText = draft.trim();
      if (!flowText) {
        // Files-without-words on the flow lane used to silently no-op —
        // the user pressed send and nothing visibly happened (fable5
        // finding 11). Say why.
        setNote("The flow lane needs words with the send — attached files ride the driver lane; switch lanes to hand them over.");
        return;
      }
      setDraft("");
      push({ role: "user", content: flowText });
      sendFlow(flowText);
      return;
    }
    if (!runId) return;
    setDraft("");
    setPendingFiles([]);
    push({ role: "user", content: text });
    // Through the REF (pulse adversary N7): `envelopes` is not a dep of
    // this callback, so the prop is stale-bounded — the ref is the live
    // tail (same pattern as closeSeqRef below).
    turnStartSeqRef.current = envelopesRef.current.length > 0 ? envelopesRef.current[envelopesRef.current.length - 1].seq : 0;
    setBusy("turn");
    // Client-measured wall clock for the effort monitor (send → reply;
    // includes network — labeled as such, the honest available clock).
    const turnT0 = Date.now();
    // The speaker rides on every turn: in a rejoined room the session opener
    // may differ from who is typing NOW — attribution follows the voice.
    const speaker = participant.trim() || undefined;
    sendVisitTurn(baseUrl, entity, runId, text, token, speaker)
      .then((r: VisitTurnResult) => {
        // BODY-STATUS RULE (walkthrough lesson, §5 contract item 4): the
        // door answers HTTP 200 with status:"failed"+error — transport
        // success is never operation success.
        const problem = visitBodyProblem(r);
        if (problem) {
          push({ role: "system", content: `The turn failed: ${problem}`, level: "error" });
          // A failed turn hands the words BACK (c5330: retry must be one
          // click, never a retype) — unless newer typing already claimed
          // the composer.
          setDraft((cur) => cur || text);
          return;
        }
        // The turn's facts ride WITH the reply as a discreet badge (the
        // maintainer's ask: the system bubble was louder than the words);
        // one click opens the full probe modal — the durable turn carries
        // the probe payload (gap 1, gateway c1358). reply coerced by push().
        push({ role: "assistant", content: r.reply ?? "", title: entityName, detail: { ...(r as ChatTurnResult), think_ms: Date.now() - turnT0 } as ChatTurnResult });
        // Fabricated-lookup flag (seq 43 FAILURE 1): prose CLAIM vs driver
        // FACT mismatch is called out in the thread, loudly, at the moment
        // it happens — not discovered later in forensics. GAUGE GUARD
        // (incident 2026-07-16, agent F3): the visit lane's tools_ran was
        // structurally zero, so this warning could FALSELY accuse a reply
        // whose tools genuinely ran — only a trustworthy gauge may accuse.
        const verdict = toolClaimVerdict(r.reply ?? "", r.tools_ran);
        if (verdict.fabricated && toolGaugeTrustworthy(r as ChatTurnResult)) {
          push({
            role: "system",
            content: `⚠ This reply claims a lookup, but no tools ran this turn — the claimed evidence was not fetched. (${verdict.claims[0]?.snippet ?? ""})`,
            level: "warn",
          });
        }
        if (r.status === "completed") {
          // A timed-out close raced this turn to terminal: the room is
          // closed — say so and reset, never leave a dead composer.
          push({ role: "system", content: "The visit closed while this turn ran (idle deadline) — open a new one to continue." });
          setRunId(null);
        }
      })
      .catch((e: Error & { status?: number }) => {
        push({
          role: "system",
          content:
            e.status === 409
              ? `He is mid-moment (the seat answered busy) — your words are back in the composer; send again shortly. (door: ${refusalText(e)})`
              : `The turn failed: ${refusalText(e)}`,
          level: "error",
        });
        setDraft((cur) => cur || text);
      })
      .finally(() => setBusy("idle"));
  }, [draft, runId, busy, baseUrl, entity, entityName, token, push, pendingFiles, participant, brain, flowActive, sendFlow]);

  const close = useCallback(() => {
    if (!runId || busy !== "idle") return;
    setBusy("closing");
    // OBSERVABILITY (operator 2026-07-15 pm): the reflection is not a black
    // box — everything it does lands in his live stream. Mark the head seq
    // now; every envelope past it IS the reflection happening.
    closeSeqRef.current = envelopesRef.current.length > 0 ? envelopesRef.current[envelopesRef.current.length - 1].seq : 0;
    closeVisit(baseUrl, entity, runId, token, "operator", "closed from the entity app")
      .then((r) => {
        setNote(null);
        const problem = visitBodyProblem(r);
        if (problem) {
          // The close FAILED in the body — the run is terminal-failed, not
          // open; reset honestly and say why (never a silent dead room).
          push({ role: "system", content: `The close failed: ${problem}`, level: "error" });
        } else {
          const out = (r.output ?? {}) as Record<string, unknown>;
          const parts: string[] = [];
          if (typeof out["turns"] === "number") parts.push(`${out["turns"]} turn${out["turns"] === 1 ? "" : "s"}`);
          const notices = Array.isArray(out["reflection_notices"]) ? (out["reflection_notices"] as unknown[]) : [];
          if (notices.length > 0) parts.push(`reflection: ${notices.map(String).join(" · ")}`);
          if (out["reflection_pending"]) parts.push("his look-back is pending (runs at the next open)");
          // Fold what the STREAM showed during the close into the recap —
          // the reflection's visible acts, not just the door's summary.
          const observed = reflectionActivity(envelopesRef.current, closeSeqRef.current);
          if (observed.length > 0) {
            parts.push(`what moved: ${observed.slice(0, 6).map((l) => l.title).join(" · ")}${observed.length > 6 ? ` (+${observed.length - 6} more — see the Ledger tab)` : ""}`);
          }
          push({ role: "system", content: parts.length ? `Visit closed. ${parts.join(" · ")}` : "Visit closed." });
        }
        setRunId(null);
        try {
          localStorage.removeItem(chatSessionStorageKey(entity));
        } catch {
          // best-effort
        }
      })
      .catch((e: Error) => {
        setNote(`Close failed: ${e.message}`);
      })
      .finally(() => {
        setBusy("idle");
        closeSeqRef.current = null;
      });
  }, [runId, busy, baseUrl, entity, token, push]);

  /** Copy the FULL visit transcript to the clipboard (maintainer ask,
   * 2026-07-09: "a way to copy the verbatim of a full visit, for us, to
   * debug"). Durable source: the run's own history (user turns carry the
   * rendered message, assistant turns the marked reply). */
  const copyVisit = useCallback(async () => {
    if (!runId) return;
    try {
      const t = await getVisitTranscript(baseUrl, entity, runId);
      const lines: string[] = [
        `# Visit transcript — ${entityName}`,
        `run_id: ${runId}${t.visit_id ? ` · visit_id: ${t.visit_id}` : ""}`,
        `participants: ${(t.participants ?? []).join(", ")}`,
        "",
      ];
      for (const msg of t.turns ?? []) {
        lines.push(`## ${msg.role === "assistant" ? entityName : msg.role}`);
        lines.push(msg.content || "");
        lines.push("", "---", "");
      }
      const text = lines.join("\n");
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Plain-HTTP LAN origins have no navigator.clipboard (F25) — the
        // execCommand path still works there and beats a TypeError.
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setNote(`Copied the full visit (${(t.turns ?? []).length} messages) to the clipboard.`);
    } catch (e) {
      setNote(`Could not copy the visit: ${refusalText(e as Error & { status?: number })}`);
    }
  }, [baseUrl, entity, runId, entityName]);

  const foreignVisit = status?.open && !runId;

  // The newest assistant reply feeds the Cognitive Monitor (scored once
  // per distinct text). Derived, not stored — cheap.
  const latestReply = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && typeof messages[i].content === "string") return messages[i].content as string;
    }
    return null;
  }, [messages]);

  // The latest turn's mechanical conduct facts feed the monitor's EFFORT
  // column (the two-diagram view — words + effort, uic c2242). Absent
  // fields render no row; think_ms is client-measured wall time (labeled).
  // memories_recalled/formed come from the driver-authored probe payload;
  // tokens live in the run-tree spend wire (not on the per-turn detail
  // yet), so those stay absent here until threaded — honest, not zero.
  const latestEffort = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      // NEWEST ASSISTANT REPLY ONLY (adversary 2026-08-01): scanning back
      // to "any message with a detail" presented an OLDER turn's facts as
      // the current turn after a rejoin (rehydration attaches detail only
      // to turns that ran tools). A latest reply without facts reads as
      // absent — honest — never as its predecessor's numbers.
      if (messages[i].role !== "assistant") continue;
      const d = messages[i].detail;
      if (!d) return null;
      const e: Record<string, number> = {};
      if (typeof d.memories_in_context === "number") e.memories_recalled = d.memories_in_context;
      const formed = Array.isArray(d.records_formed) ? d.records_formed.length : d.records_formed ? 1 : 0;
      if (formed) e.memories_formed = formed;
      // Non-empty details win; the visit lane serves tool_details:[] with
      // real names in tools_ran (dm#56 pt3 — `??` never fell through).
      // Present-but-zero is an HONEST ZERO (adversary P2: dropping 0 made
      // ACT read "no tool facts" instead of "no tools this turn").
      if (d.tools_ran !== undefined || d.tool_details !== undefined) {
        e.tool_rounds = (d.tool_details?.length ? d.tool_details : d.tools_ran ?? []).length;
      }
      if (typeof (d as { think_ms?: number }).think_ms === "number") e.think_ms = (d as { think_ms?: number }).think_ms!;
      // key: ONE baseline deposit per TURN (adversary P2: the facts
      // object re-minted per render, so identity-dedup pushed the same
      // turn into the running medians 2-3x).
      return Object.keys(e).length ? { facts: e, key: d.turn_id || messages[i].id } : null;
    }
    return null;
  }, [messages]);

  /** The latest turn's tool calls for the conduct gauge (name only — the
   * probe carries no per-call ok flag; the gauge treats unknown honestly).
   * Same newest-assistant-only rule as latestEffort: never an older turn's
   * calls presented as this turn's. */
  const latestTools = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== "assistant") continue;
      const d = messages[i].detail;
      if (!d) return null;
      const names = (d.tool_details ?? []).map((t) => ({ name: t.name })).concat((d.tools_ran ?? []).filter((n) => !(d.tool_details ?? []).some((t) => t.name === n)).map((name) => ({ name })));
      return names.length ? names : null;
    }
    return null;
  }, [messages]);

  // SCROLL-FOLLOW (operator 2026-07-15 pm): the thread reports the newest
  // assistant message visible at the scroll position; the monitor retunes
  // to the mood AT that message. null = at the bottom (the latest).
  const [focusMid, setFocusMid] = useState<string | null>(null);

  // The reflection's visible acts while the close runs (live stream tail
  // past the close-click seq, meaningful tones only).
  const closingActivity = useMemo(
    () => (busy === "closing" ? reflectionActivity(envelopes, closeSeqRef.current) : []),
    [busy, envelopes],
  );

  // @HANDLE MENTIONS (operator 2026-07-15): mentioning another entity by
  // its handle in the draft offers to bring it into a meet. Resolved
  // against the roster + this gateway's local addresses; a remote address
  // is honestly "not yet" (cross-gateway meets are a future).
  const mentions = useMemo(
    () => (roster && localAddresses ? resolveMentions(draft, roster, localAddresses, entity) : []),
    [draft, roster, localAddresses, entity],
  );
  const summonable = mentions.filter((m) => m.kind === "local");
  const remoteMention = mentions.find((m) => m.kind === "remote");
  const focusMsg = useMemo(() => {
    if (!focusMid) return null;
    const m = messages.find((x) => x.id === focusMid);
    return m && m.role === "assistant" && typeof m.content === "string" ? m : null;
  }, [focusMid, messages]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // The drawer OWNS drops on itself (laurent c3083: without this, a
    // successfully-attached PDF still bubbled to the page's life-stream
    // loader, which parsed it as NDJSON and flashed "No stream envelopes
    // in … (762 bad lines)" over a working hand-over).
    e.stopPropagation();
    setDropActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    if (!runId) {
      // Honest refusal, never a silent swallow (the silent return let the
      // page loader consume the file and mis-teach what went wrong).
      setNote("Open the visit first — a dropped file lands in his workspace as part of the conversation.");
      return;
    }
    void uploadFiles(files);
  };

  return (
    <div
      className={`chat_drawer ${dropActive ? "cd_drop_active" : ""}`}
      onDragOver={(e) => {
        if (runId && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDropActive(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropActive(false);
      }}
      onDrop={onDrop}
    >
      {/* The Cognitive Monitor (operator 2026-07-15 pm): a proper foldable
        * panel — title + (i) modal, 3-letter axis codes on the bloom and
        * listed on the right, a human-readable interpretation line, and
        * scroll-follow (the monitor retunes to the mood at the message the
        * operator scrolled to). Cheap by construction: one embed per
        * DISTINCT reply text, cached — never a harvest (flood lesson
        * c2155). The full Wave tab stays for the corpus read. */}
      {runId ? (
        <CognitionWaveInline
          baseUrl={baseUrl}
          entity={entity}
          latestReply={latestReply}
          focusReply={focusMsg ? (focusMsg.content as string) : null}
          focusAt={focusMsg?.ts ?? null}
          effort={latestEffort?.facts ?? null}
          effortKey={latestEffort?.key ?? null}
          tools={latestTools}
        />
      ) : null}
      {!runId && !flowActive ? (
        <div className="cd_start">
          {seat?.held && seat.run_id !== runId ? (
            <p
              className="cd_note cd_seatline"
              title="The seat read (GET /seat) — who holds this entity's one conversation right now. Facts only: preemption (the human winning the seat at a turn boundary) ships as the door's slice 2."
            >
              🪑 seat held{seat.holder_kind && seat.holder_kind !== "unknown" ? ` by ${seat.holder_kind}` : ""}
              {seat.holder ? ` (${seat.holder})` : ""}
              {seat.held_since ? ` since ${String(seat.held_since).slice(11, 19) || seat.held_since}` : ""}
              {seat.run_id ? ` · run ${String(seat.run_id).slice(0, 8)}` : ""}
              {seat.status ? ` · ${seat.status}` : ""}
              {typeof seat.queue_depth === "number" && seat.queue_depth > 0 ? ` · ${seat.queue_depth} waiting` : ""}
              {seat.current_idle_deadline ? ` · frees by ${new Date(seat.current_idle_deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} if quiet` : ""}
            </p>
          ) : null}
          {foreignVisit ? (
            <>
              <p className="cd_note">
                A visit is open
                {typeof status?.turn_n === "number" && status.turn_n > 0 ? ` (${status.turn_n} turn${status.turn_n === 1 ? "" : "s"})` : ""}. If it's yours
                — a reload can lose the drawer's memory of it — step back in; the whole conversation returns.
              </p>
              <button className="cd_open_btn" onClick={() => status?.run_id && rehydrate(status.run_id)} disabled={!status?.run_id}>
                rejoin this visit
              </button>
            </>
          ) : (
            <>
              {/* Identity flows from the ONE authentication (maintainer
                * 2026-07-10 20:17) — shown, never typed. A free-text field
                * here was a spoofing surface for the entity's memories. */}
              {participant ? (
                <p className="cd_identity" title="Your authenticated identity — stamped into his memories as WHO he lived this with. The door verifies it; nothing here is typed or fakeable.">
                  visiting as <strong>{participant}</strong>
                </p>
              ) : (
                <p className="cd_note">Sign in first (top right) — his memories record WHO he lived each moment with, so the door only admits authenticated visitors.</p>
              )}
              {/* ONE substrate per entity (2026-07-09 06:32): the visit uses
                * the SAME stored mind as his own time — shown here, changed
                * only in Settings → 🧠 mind (operator 2026-07-15 (e): the
                * picker moved off the top strip into the settings modal). */}
              <p className="cd_note" title="Visits and his own time share one mind — change it in Settings → 🧠 mind">
                {substrate?.provider && substrate?.model
                  ? `mind: ${substrate.provider} / ${substrate.model}${substrate.thinking ? ` · reasoning ${substrate.thinking}` : ""}`
                  : "mind: the gateway's stored choice for him (set it in Settings → 🧠 mind)"}
              </p>
              {/* THE BRAIN SELECTOR (c5190): his own driver (the durable
                * visit) or the flow brain (entity-chat VisualFlow through
                * the door — each prompt one summoned visit moment). */}
              <div className="cd_brain_row" title="Which machinery lives the conversation: his own driver (the durable visit lane) or the flow master workflow (entity-life bundle — the same memory, a different brain).">
                <label className={brain === "driver" ? "cd_brain_sel" : ""}>
                  <input type="radio" name="cd_brain" checked={brain === "driver"} onChange={() => setBrain("driver")} /> his driver
                </label>
                <label className={brain === "flow" ? "cd_brain_sel" : ""}>
                  <input type="radio" name="cd_brain" checked={brain === "flow"} onChange={() => setBrain("flow")} /> flow brain
                </label>
              </div>
              {brain === "flow" ? (
                <button
                  className="cd_open_btn"
                  onClick={startConversation}
                  disabled={!participant || flowActive}
                >
                  {flowActive ? "conversing…" : `talk to ${entityName} (flow brain)`}
                </button>
              ) : (
              <button className="cd_open_btn" onClick={open} disabled={busy === "opening" || !participant}>
                {busy === "opening" ? "opening…" : `visit ${entityName}`}
              </button>
              )}
            </>
          )}
          {note ? <p className="cd_note">{note}</p> : null}
          {seatBusy ? (
            <button
              className="cd_open_btn"
              onClick={open}
              disabled={busy === "opening" || !participant}
              title="The seat was taken when you knocked — knock again. (Send-and-he-answers-when-free arrives when the door serves its queue.)"
            >
              {busy === "opening" ? "trying…" : "try again"}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <ChatMessageList
            messages={messages}
            onDetail={setDetailTurn}
            onSpeakToggle={voice.tts_supported ? (m) => void voice.toggle_tts(String(m.id || ""), m.content) : undefined}
            getSpeakState={voice.tts_supported ? (m) => (voice.tts_playback.key === String(m.id || "") ? voice.tts_playback.status : "idle") : undefined}
            onFocusMessage={setFocusMid}
          />
          {detailTurn ? <TurnDetailModal turn={detailTurn} entityName={entityName} onClose={() => setDetailTurn(null)} /> : null}
          {queueOffer ? (
            <div className="cd_queue_offer">
              <span className="cd_note">His seat is taken — wait in line, or leave the message with him?</span>
              <button
                className="cd_open_btn"
                onClick={() => acceptQueueOffer(false)}
                title="Join the line and wait — you are admitted automatically when the seat frees (his own time may claim it first; the card says so honestly)."
              >
                ⏳ wait here
              </button>
              <button
                className="cd_open_btn"
                onClick={() => acceptQueueOffer(true)}
                title="Leave the message at his door — he answers when free; the reply lands in this thread (come back later)."
              >
                📮 leave it with him
              </button>
              <button className="eix_refresh" onClick={dismissQueueOffer} title="Neither — keep the words in the composer.">
                ✕
              </button>
            </div>
          ) : null}
          {queueState ? (
            <div className="cd_queue_card" title="Your place at his door (decision:summon-queue-v1) — position is fact, the deadline is a ceiling, and his own time may lawfully claim a freed seat before you (the door retries).">
              <span className="cd_queue_line">⏳ {queueState.line}</span>
              <button
                className="eix_refresh"
                onClick={stepAway}
                title="Step away from the line — your place is released politely."
              >
                step away
              </button>
            </div>
          ) : null}
          {busy === "turn" ? (
            <div className="cd_thinking" aria-live="polite">
              {/* THE PULSE BARS (operator 2026-08-01: "make them represent
                * something more meaningful … turns, tool calls and tokens
                * … each bar with a different color"): three live reads in
                * the conduct gauge's own palette — turns (teal pips, this
                * thread), memories shelved by the recall (blue, live from
                * the trace envelope, +N formed), recalled-memory ~tokens
                * (amber, the commit snapshot's own estimate vs the recall
                * budget — it measures the recall payload, NOT the full
                * prompt; pulse adversary F1). Tool calls are deliberately
                * NOT a bar: the stream carries none during a turn, and a
                * bar stuck at zero would be a zero-fake (absent-not-zero).
                * Before a signal lands its row shimmers indeterminate,
                * exactly like the old skeleton. */}
              <TurnPulseBars turns={turnCount} pulse={livePulse} />
              {flowActive && !runId ? (
                <button
                  className="eix_refresh pe_btn cd_stopwait"
                  onClick={stopWaiting}
                  title="Stop waiting for this turn — the run keeps ticking server-side and his memory keeps whatever he lives; only the drawer's view abandons."
                >
                  stop waiting
                </button>
              ) : null}
              {liveActivity.map((line, i) => (
                <span key={i} className="cd_activity">
                  {line}
                </span>
              ))}
            </div>
          ) : null}
          {/* THE CLOSE IS OBSERVABLE (operator 2026-07-15 pm: "we've zero
            * observability over it"): while the door closes the room, his
            * reflection's acts land in the live stream — every envelope
            * past the close-click seq renders here as it happens (feelings
            * moved, summary formed, interests kept, session sealed). */}
          {busy === "closing" ? (
            <div className="cd_closing" aria-live="polite">
              <div className="cd_closing_head">
                <span className="cd_closing_spin" aria-hidden="true" />
                <span>Closing — his reflection runs now (he looks back over the visit; feelings may move, a summary forms)…</span>
              </div>
              {closingActivity.length > 0 ? (
                <ul className="cd_closing_lines">
                  {closingActivity.map((l) => (
                    <li key={l.seq}>
                      <strong>{l.title}</strong>
                      {l.detail ? <span className="cd_closing_detail"> — {l.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="cd_closing_hint">watching his stream for the reflection's acts… (the Ledger tab keeps the full record)</span>
              )}
            </div>
          ) : null}
          {note ? <p className="cd_note">{note}</p> : null}
          {pendingFiles.length > 0 ? (
            <div className="cd_files">
              {pendingFiles.map((f, i) => (
                <span key={i} className="cd_file_chip" title={`in his workspace: ${f.path}`}>
                  📎 {f.name}
                  <button
                    className="cd_file_x"
                    onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                    title="Don't reference this file (it stays in his workspace)"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {dropActive ? <div className="cd_drop_hint">drop to place in {entityName}'s workspace</div> : null}
          {/* @HANDLE SUMMON (operator 2026-07-15): a mentioned local entity
            * offers to be convened into a meet with the current one; a
            * remote handle is honestly "not yet" (cross-gateway is a
            * future). A 1:1 visit can't host a second entity — the meet is
            * the multi-entity primitive, so the mention BRIDGES to it. */}
          {onConveneWith && summonable.length > 0 ? (
            <div className="cd_mentions">
              {summonable.map((m) => (
                <button
                  key={m.slug}
                  className="cd_mention_btn"
                  onClick={() => onConveneWith(m.slug!)}
                  title={`Convene a meet with ${entityName} and ${m.display} — you steer, each answers in its own voice (a 1:1 visit can't host two; the meet is where they talk together).`}
                >
                  🤝 bring {m.display} in
                </button>
              ))}
            </div>
          ) : null}
          {onConveneWith && summonable.length === 0 && remoteMention ? (
            <div className="cd_mentions cd_mentions_note">
              {remoteMention.raw} is on another gateway — cross-gateway meets aren't wired yet (local handles only for now).
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) void uploadFiles(files);
              e.target.value = "";
            }}
          />
          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSubmit={send}
            placeholder={`talk with ${entityName}…  (drop or attach files)`}
            busy={busy === "turn"}
            disabled={busy !== "idle"}
            rows={2}
            actions={
              <>
                <button
                  className="cd_attach_btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || busy !== "idle"}
                  title="Give him a file — placed in his workspace, he reads it with read_file"
                >
                  {uploading ? "…" : "📎"}
                </button>
                <button className="cd_attach_btn" onClick={() => void copyVisit()} title="Copy the full visit verbatim to the clipboard (every voice + tools, for debugging)">
                  ⧉
                </button>
                {flowActive && !runId ? (
                  <button
                    className="cd_close_btn"
                    onClick={endFlowConversation}
                    disabled={busy !== "idle"}
                    title="End the flow-brain conversation — runs his real close (entity-goodbye): the session's look-back, a diary note, a summary with its edges. His words for the goodbye render here."
                  >
                    🚪 end conversation
                  </button>
                ) : (
                <button
                  className="cd_close_btn"
                  onClick={close}
                  disabled={busy !== "idle"}
                  title="End the visit: the door closes the room, HIS REFLECTION runs (he looks back over the visit — feelings may move, a summary forms, interests may take root), then the phase he was in before re-enters (personal only if its grant still stands). Left silent, the visit also closes BY ITSELF (~1h idle — laurent's ruled target): same graceful close, reflection included; the gateway's reaper drives it within minutes of the deadline even with no client alive."
                >
                  🚪 end visit
                </button>
                )}
              </>
            }
          />
          {/* ONE composer, ONE button: SEND (maintainer, 2026-07-14). The
            * raw inject_guidance/commands path is REFUSED for entity visit
            * runs by design (gateway: "raw steers are refused — entity
            * steering requires the steer rite (hooks plan H5); speak
            * through the visit channel instead"), so a Steer button here
            * both duplicated Send and hit a door that 403s it. Removed.
            * HONEST LIMIT (func review): the visit turn channel is
            * BETWEEN-TURNS only — send() refuses while a turn runs (one
            * turn at a time through the door). Mid-turn interjection would
            * need the steer rite (H5), which does not exist yet; until it
            * does, the operator waits for the turn to land. */}
        </>
      )}
    </div>
  );
}

/** The drawer's own thread: message cards + the discreet per-turn "system"
 * badge under each reply that carries a probe payload. Replaces the shared
 * ChatThread (which can only render whole cards — the facts bubble read as
 * loud as the words). Keeps its stick-to-bottom behavior. */
