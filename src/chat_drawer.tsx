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
 *   render verbatim. The drawer never writes his state: the door brings
 *   him to the visit and returns him to his previous state at close.
 * - Closing runs his reflection; what the run reports is shown.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { READ_ALOUD_INITIAL, readAloudStep } from "@abstractframework/panel-chat";
import { entityReadAloudInput } from "./read_aloud";

import { ChatComposer, useAvatarConversationPreferences, playConversationCue, conversationReply, type ChatMention, type ChatMentionSent, type ChatMessage, type ChatMessageMention, type ChatNotice } from "./vendor/abstractchat/conversation";
import { VISIT_CLOSE_KIND, noticesField, openNotice as openNoticeIn } from "./turn_notices";
import { mentionEntityCard } from "./mention_entity_card";
import { MENTIONS_UNAVAILABLE, alreadyAnsweredLine, chipsToRestore, entityMentions, flowMentionKey, heldAfterRun, meetOffers, mentionBody, mentionCandidatesFor, mentionMessageKey, mentionResendPlan, mirrorLine, orderedMentions, pendingAfterReply, pendingMentionsFor, runMentions, sentMessageMentions, visitMentionProps, withSessionAgent, type HeldMentions, type MentionableEntity, type PendingMention } from "./visit_mentions";
import { avatarSendsDuringWork, avatarVisitHistory, completedVisitReply, flowConversationState, publicVisitMessages, visitIdentityRef, visitQuestion } from "./avatar_visit";
import { AvatarVisitView } from "./avatar_visit_view";
import { useAvatarVisit } from "./use_avatar_visit";
import { useIdentityLook } from "./use_identity_look";
import { flowMentionSlugs, screenDiaryFences } from "./flow_lane";
import { sttRouteText } from "@abstractframework/ui-kit";
import { clipboardWrite, COPY_FAILED } from "./lib/secure-context";

import { toolCallsOf, type ReplyFeed } from "./cognition_wave_inline";
import { NO_ACTIVITY as NO_TURN_ACTIVITY } from "./live_activity";
import { TurnActivityPanel } from "./turn_pulse_bars";
import { useLiveActivity } from "./use_live_activity";
import {
  answerVisit,
  decideVisit,
  guideVisit,
  flowConversationCommand,
  closeVisit,
  getEntitySubstrate,
  getVisitStatus,
  getVisitTranscript,
  openVisit,
  sendVisitTurn,
  visitBodyProblem,
  writeEntityWorkspaceFile,
  type ChatTurnResult,
  type VisitStatus,
  type VisitTurnResult,
  type VisitPublicWait,
} from "./stream_source";
import { toolClaimVerdict } from "./tool_claim_guard";
import { ownVisitSignal, type ClientVisitSignal } from "./entity_state";
import { foldVisitStatus } from "./visit_status_poll";
import { ChatMessageList, splitVisitDecoration, type DrawerMessage } from "./chat_message_list";
import { toolGaugeTrustworthy, type TurnPanelTab } from "./reply_notices_summary";
export { splitVisitDecoration } from "./chat_message_list";
import { getEntitySeat, listEntities, postMention, refusalText, stoppedSentence, type EntitySeat, type IdentityRef } from "./stream_source";
import { useFlowConversation } from "./use_flow_conversation";
import { ledgerLine, type LedgerLine } from "./ledger_lines";
import { COMMUNITY_RECORD_KIND } from "./stream_fold";
import { RefusalLine, type SubstrateChoice } from "./mind_voice_settings";
import { attachmentChips, attachmentRecords, turnRefusal, visitTurnPayload, type PendingFile } from "./visit_attachments";
import type { ReplayEnvelope } from "./stream_types";
import { TurnDetailModal } from "./turn_detail_modal";
import { WordsLine } from "./words_line";
import { VisitVoiceButtons, useEntityVoice, useVoiceDefaults, useVoicePreferences } from "./entity_voice";

/** The reflection's visible acts in the live stream: every envelope past
 * the close-start seq, rendered as ledger lines, filtered to the tones
 * that MEAN something during a close (feelings moved, records formed,
 * session markers, revisions) — recall/usage bookkeeping stays out. The
 * topic versions seen in that stretch go with each line (the stream_fold
 * rule: a community record's graph id), so a topic version's link to the
 * one before, closed with it, reads as the quiet audit line and stays out. */
export function reflectionActivity(envelopes: ReplayEnvelope[], sinceSeq: number | null): LedgerLine[] {
  if (sinceSeq === null) return [];
  const MEANINGFUL = new Set(["formation", "feeling", "session", "revision", "boundary"]);
  let start = envelopes.length;
  while (start > 0 && envelopes[start - 1].seq > sinceSeq) start--; // envelopes are seq-ordered
  const topicIds = new Set<string>();
  const out: LedgerLine[] = [];
  for (let i = start; i < envelopes.length; i++) {
    const env = envelopes[i];
    const gid = env.display?.kind === COMMUNITY_RECORD_KIND && typeof env.display.graph_id === "string" ? env.display.graph_id.trim() : "";
    if (gid) topicIds.add(gid);
    const line = ledgerLine(env, undefined, topicIds);
    if (MEANINGFUL.has(line.tone)) out.push(line);
  }
  return out;
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
  /** Convene a meet with the current entity + one picked as an `@` chip
   * (operator 2026-07-15; offered from the chip since 2026-11-09, never
   * read out of the typed words). Opens the meet console pre-filled. */
  onConveneWith?(otherSlug: string): void;
  /** FIRST-HAND VISIT TRUTH flows UP (dm#94 exclusivity incident: the
   * header rendered "personal · resting" while this drawer conducted a
   * live conversation — the parent fed deriveLifeState a null visit axis
   * because this component kept its open session to itself). Fired
   * whenever the folded signal changes: null = no visit this drawer
   * knows of. */
  onVisitStateChange?(signal: ClientVisitSignal | null): void;
  onAvatarModeChange?(active: boolean): void;
  /** A new number = knock now (the phase bar's visit pill): opens a visit as the start screen's
   * "visit <name>" button does. */
  knockRequest?: number;
  /** "Resume and visit" (the phase bar's own act, entity_view resumeAndVisit): resume him, then
   * knock once he runs again. Offered when an open met a Stop (409 stopped_use_resume). */
  onResumeAndVisit(): void;
  /** The panel remains mounted on tab changes; background speech/cues stay silent. */
  visible?: boolean;
  /** Open a record in the Detail panel by its GRAPH id: a reply's notice badge (what the turn
   * formed: a diary entry, a lesson, …) opens the record it names. `false` = it opened nothing (the
   * record has not reached the view yet): the badge opens its own panel. */
  onOpenRecord(graphId: string): boolean;
  /** The Cognitive Monitor's feed (in the timeline, always on; backlogs 0018, 0040): the drawer
   * publishes the reply in view of the open conversation; the monitor reads it. */
  replyFeed: ReplyFeed;
}

/** The open visit's served turn count: the larger of the polled status's `turn_n` (for this run) and the
 * `turn_n` this run's replies carried (the poll can lag a turn just answered); null when neither is
 * served (never a guessed zero). */
export function visitTurnCount(status: { run_id?: string; turn_n?: number } | null, messages: readonly DrawerMessage[], runId: string | null): number | null {
  if (!runId) return null;
  const counts: number[] = [];
  if (status?.run_id === runId && typeof status.turn_n === "number") counts.push(status.turn_n);
  for (const m of messages) {
    const d = m.detail as (ChatTurnResult & { run_id?: string; turn_n?: number }) | undefined;
    if (d?.run_id === runId && typeof d.turn_n === "number") counts.push(d.turn_n);
  }
  return counts.length ? Math.max(...counts) : null;
}

/** The thread a visit opens on (operator 2026-11-11 10:21: "i clicked visit and... it reopened the
 * last visit"): a visit other than the one the thread holds starts a fresh thread (the previous
 * visit's words, its close and its notices stay in his ledger and book, not in this drawer); the
 * same visit keeps its own. */
export function threadForOpenedVisit<M>(thread: readonly M[], threadRun: string | null, openedRun: string): readonly M[] {
  return threadRun === openedRun ? thread : [];
}

/** His reply to a visit turn as the thread holds it: his words, the turn's facts as `detail` (the
 * probe the footer under his words opens; the visit lane's fields as served, `diary_entries` a list
 * of entries) and what the turn formed as `notices` (the badges in his bubble). */
export function visitReplyMessage(r: VisitTurnResult, entityName: string, thinkMs: number): Omit<DrawerMessage, "id"> {
  return { role: "assistant", content: r.reply ?? "", title: entityName, detail: { ...(r as ChatTurnResult), think_ms: thinkMs } as ChatTurnResult, ...noticesField(r.reply_notices) };
}

export function ChatDrawer(props: ChatDrawerProps): React.ReactElement {
  const { baseUrl, entity, entityName, token, authUserId, envelopes, onAuthRefused, onConveneWith, onVisitStateChange } = props;
  /** Identity derives from the session principal — never typed, never
   * spoofable client-side (the door verifies regardless; this is the
   * honest display of what will be stamped). */
  const participant = authUserId ? `person:${authUserId}` : "";
  const avatarPrefs = useAvatarConversationPreferences(`${baseUrl}:${authUserId || "guest"}:${entity}`);
  const avatarMode = avatarPrefs.mode === "avatar";
  useEffect(() => {
    props.onAvatarModeChange?.(avatarMode);
    return () => props.onAvatarModeChange?.(false);
  }, [avatarMode, props.onAvatarModeChange]);
  const [replyContext, setReplyContext] = useState<ChatMessage | null>(null);
  const [avatarAttended, setAvatarAttended] = useState(false);
  const [replyPending, setReplyPending] = useState(false);
  const replyInFlight = useRef(false);
  const [hydrating, setHydrating] = useState(false);
  const [status, setStatus] = useState<VisitStatus | null>(null);
  /** The open DURABLE visit's run id (the steer key, the reattach key, the
   * R2 proof surface — §5 consumer contract). */
  const [runId, setRunId] = useState<string | null>(null);
  /** The identity the visit opened with (`identity_ref` of the open answer), by run. */
  const [openedRef, setOpenedRef] = useState<{ runId: string; ref: IdentityRef } | null>(null);
  /** The open visit's session (`session_id` of the open answer or of the visit status), by run:
   * the conversation an `@` mention invites another entity into. */
  const [visitSession, setVisitSession] = useState<{ runId: string; sessionId: string } | null>(null);
  // @ENTITY MENTIONS (operator 2026-11-08, visit_mentions.ts): chips picked from the kit's `@`
  // list, the sentences about the last send, and the older-gateway sentence once known.
  const [mentionChips, setMentionChips] = useState<ChatMention[]>([]);
  const mentionChipsRef = useRef<ChatMention[]>([]);
  mentionChipsRef.current = mentionChips;
  const [mentionStatus, setMentionStatus] = useState<string | null>(null);
  const [mentionsUnavailable, setMentionsUnavailable] = useState<string | null>(null);
  const mentionRowsRef = useRef<Promise<MentionableEntity[]> | null>(null);
  /** The rows once read (to name the entities a reply was also said to). */
  const mentionRowsReadRef = useRef<MentionableEntity[]>([]);
  const mentionRefusedRef = useRef<Set<string>>(new Set());
  /** A message whose mentions stopped partway (a 503, a failed call): sending the same words again
   * asks only its mentions not answered (visit_mentions.ts, mentionResendPlan). */
  const heldMentionsRef = useRef<HeldMentions | null>(null);
  /** The flow lane's mention key, kept for its whole conversation (flowMentionKey). */
  const flowMentionKeyRef = useRef<string | null>(null);
  const flowMentionKeySeq = useRef(0);
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
  /** The open met a Stop (409 stopped_use_resume, a Stop landed during the open): the note shows
   * the gateway's sentence and the start screen offers "Resume and visit". */
  const [stoppedOffer, setStoppedOffer] = useState(false);
  /** The seat read (gateway slice 1, c5390): WHO holds the conversation —
   * the occupancy line's source. Null = endpoint absent (pre-slice door)
   * or unread; render-when-served, facts only (preemption is slice 2 —
   * no promises rendered until it ships). */
  const [seat, setSeat] = useState<EntitySeat | null>(null);
  /** Visit-status miss state (fable5 findings 5+6): the fold law lives in
   * visit_status_poll.ts; the counter is keyed to a RUN ID so a streak can
   * never leak across run identities and kill a fresh visit. */
  const missStateRef = useRef<{ misses: number; missesForRun: string | null }>({ misses: 0, missesForRun: null });
  const [detailTurn, setDetailTurn] = useState<{ turn: ChatTurnResult; tab: TurnPanelTab } | null>(null);
  // The mentioned entities' answers on their way, one bubble each in the thread (operator round 6).
  const [pendingMentions, setPendingMentions] = useState<PendingMention[]>([]);
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
  // picked, uploaded to his workspace/shared, attached to the next turn by
  // the path the workspace write returned (visit_attachments.ts).
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  /** The door's sentence when it refused a turn before it ran (an attachment
   * it cannot take); the words and files are back in the composer. */
  const [refusal, setRefusal] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const idRef = useRef(0);
  /** Seq high-water when the current turn started — live envelopes above
   * it render as realtime activity lines under the thinking shimmer. */
  const turnStartSeqRef = useRef<number>(Infinity);
  /** The visit run whose messages the thread holds (a rejoin's or an open's): a different visit
   * opening starts a fresh thread (`threadForOpenedVisit`). */
  const threadRunRef = useRef<string | null>(null);
  /** Chat ids we already rehydrated — the transcript fetch runs once per
   * adopted session, not once per status poll. */
  const rehydratedRef = useRef<Set<string>>(new Set());

  /** Voice (round 7 R7.1): speak and dictate through the kit hook and the
   * gateway's voice routes (entity_voice.tsx). Speaking rides the
   * entity-owned TTS lane — the door resolves HIS voice server-side (his
   * own choice, else the gateway's output.voice default; X-Voice-Source
   * names which) and streams it sentence by sentence; Stop aborts the
   * request. Dictation uploads the recording into his voice scope and
   * transcribes it with the gateway default STT route (or the listener's
   * choice in Settings → voice). Both postures speak: proxy rides cookies +
   * the CSRF twin; direct-bearer rides Authorization. */
  const [voicePrefs] = useVoicePreferences();
  const voiceDefaults = useVoiceDefaults(baseUrl);
  const voice = useEntityVoice({
    baseUrl,
    entity,
    token,
    active: Boolean(runId || (avatarMode && brain === "flow")),
    prefs: voicePrefs,
    onTranscript: (text) => setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text)),
    // The hook clears errors with ""; only real messages reach the note line.
    onError: (m) => {
      if (m) setNote(m);
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
  const cancelRecordingRef = useRef(voice.cancel_voice_ptt_recording);
  cancelRecordingRef.current = voice.cancel_voice_ptt_recording;
  useEffect(() => {
    if (!runId) {
      stopTtsRef.current();
      cancelRecordingRef.current?.(); // a dictation for a closed room is dropped
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);
  useEffect(() => {
    if (avatarMode && props.visible === false) {
      stopTtsRef.current(); cancelRecordingRef.current?.();
    }
  }, [avatarMode, props.visible]);


  /** Read aloud (Settings → voice): a reply lived in this visit is spoken in
   * his voice. Replies already on screen when the visit (re)opens are not. */
  const latestSpoken = useMemo(() => [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim()), [messages]);
  const latestReplyId = latestSpoken ? String(latestSpoken.id) : "";
  // Only a reply lived in this visit is spoken by itself: its turn was seen in
  // progress here (operator 2026-10-29: re-opening a visit spoke its existing
  // messages). The kit's rule (panel-chat `readAloudStep`).
  const readAloudState = useRef(READ_ALOUD_INITIAL);
  const turnLive = busy === "turn";


  const push = useCallback((msg: Omit<DrawerMessage, "id">): string => {
    idRef.current += 1;
    const id = `m${idRef.current}`;
    // Never hand React (or any card) a non-string content — the object-as-
    // child class killed the whole app once (React #31, maintainer's
    // critical 2026-07-08 23:49). Coerce at the single entry point.
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
    setMessages((prev) => [...prev, { ...msg, content, id, ts: new Date().toISOString() }]);
    return id;
  }, []);

  // THE FLOW-BRAIN LANE lives in its own hook (fable5 consolidation plan
  // B): conversation lifecycle, turn drive, goodbye close, queue lane.
  // The drawer keeps pixels + the composer.
  const {
    flowActive,
    flowRunId,
    flowView,
    flowSessionId,
    flowPublicHistory,
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
  } = useFlowConversation({ baseUrl, entity, entityName, token, push, setBusy, setDraft, envelopesRef, turnStartSeqRef, conversation: avatarMode });
  const publicVisit = useAvatarVisit(baseUrl, entity, runId, avatarMode && brain === "driver", busy === "turn");
  /** The live activity panel (operator 2026-11-10, backlog 0010): his visit's ledger or the flow
   * brain's view, live while a turn runs, folded into the turn's summary after (turn_pulse_bars.tsx). */
  const activity = useLiveActivity({ baseUrl, entity, brain, visitRunId: runId, live: busy === "turn", visible: props.visible !== false && !avatarMode, flowView, flowActive, envelopes, turnStartSeq: turnStartSeqRef.current });
  const flowPublic = useMemo(() => flowConversationState(flowView), [flowView]);
  const publicState = brain === "flow" ? flowPublic : publicVisit.state;
  const publicMessages = useMemo(() => brain === "flow" ? flowPublicHistory : publicState ? publicVisitMessages(publicState) : [], [brain, flowPublicHistory, publicState]);
  const avatarMessages = useMemo(() => {
    const working = busy !== "idle" || publicState?.status === "running" || publicState?.ready_for_input === false;
    const rows = avatarVisitHistory(messages, publicMessages, runId || flowRunId, working);
    return brain === "driver" ? completedVisitReply(publicState, rows) : rows;
  }, [messages, publicMessages, runId, flowRunId, busy, publicState, brain]);
  const pendingQuestion = visitQuestion(publicState);
  const reportAvatarError = useCallback((message: string) => setNote(message), []);
  const visitRef = brain === "driver" ? visitIdentityRef(publicState, openedRef && openedRef.runId === runId ? openedRef.ref : null) : null;
  const visitLook = useIdentityLook(baseUrl, entity, avatarMode ? visitRef : null, reportAvatarError);
  const interruptAvatarSpeech = useCallback(() => stopTtsRef.current(), []);
  useEffect(() => {
    if (brain === "flow" && !flowActive) { stopTtsRef.current(); cancelRecordingRef.current?.(); }
  }, [brain, flowActive]);
  useEffect(() => {
    const { state, speak } = readAloudStep(readAloudState.current, entityReadAloudInput(readAloudState.current.scope, runId || flowRunId, turnLive, latestSpoken ? { id: latestReplyId, text: latestSpoken.content } : null));
    readAloudState.current = state;
    if (speak && (!avatarMode || (props.visible !== false && !avatarAttended && !draft.trim() && !voice.voice_ptt_recording && !hydrating && !publicVisit.loading)) && voicePrefs.read_aloud === true && voice.tts_supported) {
      const text = avatarMode ? screenDiaryFences(speak.text).display : speak.text;
      if (text.trim()) void voice.toggle_tts(speak.id, text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, flowRunId, latestReplyId, turnLive, voicePrefs.read_aloud, voice.tts_supported, avatarMode, avatarAttended, draft, voice.voice_ptt_recording, hydrating, publicVisit.loading, props.visible]);

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
      setHydrating(true);
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
              // The files the door recorded on this turn, as chips.
              const attached = attachmentChips(attachmentRecords(msg.attachments));
              rebuilt.push({ id: `r${++mid}`, role: "user", content: text, ...(context ? { context } : {}), ...(attached.length ? { attachments: attached } : {}) });
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
          threadRunRef.current = ownRunId;
          setMessages(rebuilt);
        })
        .finally(() => setHydrating(false))
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
          if (s.open && s.run_id && typeof s.session_id === "string" && s.session_id) {
            const own = { runId: s.run_id, sessionId: s.session_id };
            setVisitSession((prev) => (prev && prev.runId === own.runId && prev.sessionId === own.sessionId ? prev : own));
          }
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
    // ONE substrate per entity (2026-07-09 06:32): the gateway resolves the
    // entity's persisted choice — the visit never asks separately. If no
    // choice exists anywhere, the gateway's refusal names the fix.
    setBusy("opening");
    setStoppedOffer(false);
    setNote("Opening — if he is busy with his own time, he finishes what he is doing, then the visit opens…");
    const onOpened = (r: Awaited<ReturnType<typeof openVisit>>) => {
      setSeatBusy(false);
      // A new visit starts a fresh thread: the last visit's words, close and notices are not this one's.
      if (threadRunRef.current !== r.run_id) {
        setMessages((prev) => threadForOpenedVisit(prev, threadRunRef.current, r.run_id) as DrawerMessage[]);
        setPendingMentions([]);
        setDetailTurn(null);
      }
      threadRunRef.current = r.run_id;
      setRunId(r.run_id);
      setOpenedRef(r.identity_ref ? { runId: r.run_id, ref: r.identity_ref } : null);
      setVisitSession(typeof r.session_id === "string" && r.session_id ? { runId: r.run_id, sessionId: r.session_id } : null);
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
    const onRefused = (e: Error & { status?: number }): void => {
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
      // A Stop landed during the open (409 stopped_use_resume): the gateway's sentence ("Stopped.
      // Resume to visit.") and the phase bar's "Resume and visit", never the busy-seat retry.
      const stopped = stoppedSentence(e);
      // No client wake (operator: no fallbacks): the door opens the visit
      // from any state and returns him to that state at close; writing his
      // state to awake here would END his sleep instead of interrupting it.
      // 409 occupancy = the busy signal (operator order via c5330): keep
      // the words gentle and hand back a one-click retry on the start
      // screen. Anything else stays the door's verbatim refusal.
      if (stopped) {
        setSeatBusy(false);
        setStoppedOffer(true);
        setNote(stopped);
      } else if (e.status === 409) {
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
    // a payload cannot engrave a false co-presence).
    if (flowActive) {
      setNote("End the flow-brain conversation first — one lane at a time.");
      setBusy("idle");
      return;
    }
    openVisit(baseUrl, entity, token, undefined, avatarMode)
      .then((r) => {
        onOpened(r);
        setBusy("idle");
      })
      .catch((e: Error & { status?: number }) => onRefused(e));
    // substrate deliberately NOT a dep (the gateway resolves the persisted
    // choice; a picker change must not re-open a live visit); onAuthRefused
    // IS one (func review: a stale closure served the 401 recovery path).
  }, [baseUrl, entity, entityName, token, push, onAuthRefused, flowActive, avatarMode]);
  /** The phase bar's visit pill knocks (entity_view sends a new number per click): the same open as
   * the "visit <name>" button, when no visit is open here and nothing is opening. */
  const knockSeenRef = useRef(props.knockRequest ?? 0);
  useEffect(() => {
    const n = props.knockRequest ?? 0;
    if (n === knockSeenRef.current) return;
    knockSeenRef.current = n;
    if (runId || busy !== "idle") return;
    if (!participant) {
      setNote("Sign in to visit.");
      return;
    }
    open();
  }, [props.knockRequest, runId, busy, participant, open]);

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
      const landed: PendingFile[] = [];
      setRefusal(null);
      try {
        for (const file of files) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const dest = `shared/${safeName(file.name)}`;
          // The turn names the file by the path the write RETURNED (the
          // contract), never by the one we asked for.
          const written = await writeEntityWorkspaceFile(baseUrl, entity, dest, bytes, token);
          if (typeof written?.path !== "string" || !written.path) throw new Error("the workspace write answered without the file's path");
          landed.push({ name: file.name, path: written.path, bytes: typeof written.size === "number" ? written.size : bytes.length, ...(file.type ? { content_type: file.type } : {}) });
        }
        setPendingFiles((prev) => [...prev, ...landed]);
        push({
          role: "system",
          content: `Placed in his workspace: ${landed.map((f) => f.path).join(", ")}. Attached to your next message.`,
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





  const answerPublic = useCallback(async (wait: VisitPublicWait, answer: string) => {
    const result = brain === "driver"
      ? await answerVisit(baseUrl, entity, runId!, wait, answer, token)
      : await flowConversationCommand(baseUrl, wait.run_id, "resume", { wait_key: wait.wait_key, response: answer }, token);
    if (result.accepted !== true) throw new Error("The gateway did not accept this answer.");
    const originalQuestion = wait.details?.question as Record<string, unknown> | undefined;
    const receipt = { role: "user", kind: "answer", source: "local_question_answer", runId: wait.run_id, content: answer, questionContext: { wait_key: wait.wait_key, ...(typeof originalQuestion?.id === "string" ? { question_id: originalQuestion.id } : {}) } };
    push(receipt);
    publicVisit.refresh();
  }, [brain, baseUrl, entity, runId, token, publicVisit.refresh, push]);
  const decidePublic = useCallback(async (wait: VisitPublicWait, approved: boolean) => {
    const result = brain === "driver"
      ? await decideVisit(baseUrl, entity, runId!, wait, approved, token)
      : await flowConversationCommand(baseUrl, wait.run_id, "resume", { wait_key: wait.wait_key, approved }, token);
    if (result.accepted !== true) throw new Error("The gateway did not accept this decision.");
    publicVisit.refresh();
  }, [brain, baseUrl, entity, runId, token, publicVisit.refresh]);

  /** The `@` list: `GET /entities` (read once per drawer) minus the entity being visited and the
   * ones the gateway refused to mention, with each one's look. The flow lane also offers its
   * session agent, him (kind "agent", sent as "agent"): with entity chips and without his, the
   * gateway does not run his turn (operator 2026-11-10). The visit lane has no session agent. */
  const mentionCandidates = useCallback(
    async (query: string) => {
      if (!mentionRowsRef.current) {
        const rows = listEntities(baseUrl).then((list) => list.map((e): MentionableEntity => ({ name: e.name, slug: e.slug, ...(e.entity_id ? { entity_id: e.entity_id } : {}), avatar: e.avatar ?? null })));
        mentionRowsRef.current = rows;
        rows.then((read) => { mentionRowsReadRef.current = read; }, () => {
          if (mentionRowsRef.current === rows) mentionRowsRef.current = null;
        });
      }
      const entities = mentionCandidatesFor(await mentionRowsRef.current, entity, query, mentionRefusedRef.current);
      return brain === "flow" ? withSessionAgent(entities, entityName, query) : entities;
    },
    [baseUrl, entity, brain, entityName],
  );
  /** After the person's turn landed: each mention, in pick order, one call after the other; each
   * reply is a turn with its author (and, in a visit, one small line: who else heard it). A 503 or
   * a failure puts the words and the unsent chips back, and holds the message for its resend.
   * `repeatOf`: the person's own turn of the session (the flow lane's summoned run); a visit turn
   * lives in the entity's home, not in the session, so the visit lane sends none. `message`: the
   * message's key (`mentionMessageKey`, held for a resend): each mention's `mention_id`, so a resend
   * gets the first answer back, never a second one. `answeredBefore` (a resend): who answered this
   * message already; `notes`: sentences said before the outcome. */
  const sendMentions = useCallback(
    async (sessionId: string, message: string, text: string, sent: ChatMentionSent[], chips: ChatMention[], repeatOf: string | null, answeredBefore: string[] = [], notes: string[] = []): Promise<void> => {
      const nameOf = (id: string) => mentionRowsReadRef.current.find((r) => r.entity_id === id)?.name ?? null;
      // Each entity's answer on its way is a bubble with its dots in the thread (operator round 6),
      // replaced by its reply; whatever is still pending when the run ends had no answer coming.
      setPendingMentions(pendingMentionsFor(message, sent, chips));
      const result = await runMentions(sent, {
        post: (m) => postMention(baseUrl, sessionId, mentionBody(text, m, repeatOf, message), token),
        onReply: (m, reply, author, mirrors) => {
          push({ role: "assistant", content: reply, title: m.name, ...(author ? { author } : {}) });
          setPendingMentions((cur) => pendingAfterReply(cur, m));
          const line = mirrorLine(mirrors, nameOf);
          if (line) push({ role: "system", content: line });
        },
        // Refused but the next ones are still asked: its bubble goes and its sentence shows now (F3).
        onSkipped: (m, sentence) => {
          setPendingMentions((cur) => pendingAfterReply(cur, m));
          setMentionStatus(sentence);
        },
      }).finally(() => setPendingMentions([]));
      for (const id of result.refused) mentionRefusedRef.current.add(id);
      if (result.unavailable) setMentionsUnavailable(MENTIONS_UNAVAILABLE);
      heldMentionsRef.current = heldAfterRun(sessionId, message, text, repeatOf, result, answeredBefore);
      const sentences = [...notes, ...result.sentences];
      setMentionStatus(sentences.length ? sentences.join(" ") : null);
      if (result.keepDraft) {
        setDraft((cur) => cur || text);
        const back = chipsToRestore(chips, result.unsent);
        if (back.length) setMentionChips((cur) => (cur.length ? cur : back));
      }
    },
    [baseUrl, token, push],
  );
  /** The conversation a mention joins: the open visit's session, or the flow lane's (minted with
   * its first message). None: no `@` list (an older door that names no session). */
  const mentionSession = brain === "driver" ? (runId && visitSession?.runId === runId ? visitSession.sessionId : null) : flowActive ? flowSessionId : null;
  // The flow lane keeps the key it started with when its first message mints the session id: the
  // first-use notice is once per conversation, not once more after the first send.
  flowMentionKeyRef.current = flowMentionKey(flowMentionKeyRef.current, flowActive, flowSessionId, () => `new:${++flowMentionKeySeq.current}`);
  const mentionSessionKey = brain === "driver" ? (mentionSession ? `visit:${mentionSession}` : null) : flowMentionKeyRef.current;
  // A new conversation starts with no chips, no sentence and no held message from the last one.
  useEffect(() => {
    setMentionChips([]);
    setMentionStatus(null);
    heldMentionsRef.current = null;
  }, [mentionSessionKey]);

  const sendDuringWork = useCallback(async () => {
    const words = draft.trim();
    if (!words || replyInFlight.current) return;
    const targetRun = runId || flowRunId;
    if (!targetRun) { setNote("The conversation is still opening. Your words are kept here."); return; }
    if (pendingQuestion?.allow_free_text === false) { setNote("Choose one of the question's options above. Your draft is kept here."); return; }
    if (pendingFiles.length) { setNote("Keep these files attached for the next full turn. Send this reply without files, or wait for the current turn to finish."); return; }
    replyInFlight.current = true; setReplyPending(true); setNote(null); stopTtsRef.current();
    try {
      if (pendingQuestion) {
        await answerPublic(pendingQuestion, words);
        setNote("Your answer was accepted.");
      } else {
        if (replyContext?.publicUpdate && !(publicState ? publicVisitMessages(publicState) : []).some((m) => m.id === replyContext.id && m.runId === replyContext.runId)) throw new Error("The update you chose to reply to is from an earlier exchange. Choose Latest, then send your message again.");
        const currentSourceRuns = brain === "flow"
          ? (flowView?.runs || []).map((run) => run.run_id)
          : (publicState ? publicVisitMessages(publicState) : []).filter((m) => m.kind === "public_update").map((m) => m.runId!).filter(Boolean);
        const wrapped = conversationReply(words, replyContext, targetRun, currentSourceRuns);
        const result = brain === "driver"
          ? await guideVisit(baseUrl, entity, targetRun, wrapped, words, token)
          : await flowConversationCommand(baseUrl, targetRun, "inject_guidance", { guidance: wrapped, display_text: words }, token);
        if (result.accepted !== true) throw new Error("The gateway did not accept your message.");
        // The durable public_messages projection provides human history; acceptance is not adoption.
        setNote("Your message was accepted. The assistant can consider it at its next opportunity; this does not confirm that its plan changed.");
        publicVisit.refresh();
      }
      setDraft((current) => current.trim() === words ? "" : current);
      setReplyContext(null);
    } catch (error) { setNote(`Your message was not sent: ${refusalText(error as Error)}. Your words are kept in the composer.`); }
    finally { replyInFlight.current = false; setReplyPending(false); }
  }, [draft, runId, flowRunId, flowView, brain, baseUrl, entity, token, pendingFiles.length, pendingQuestion, answerPublic, replyContext, publicState, publicVisit.refresh]);

  const send = useCallback((picked: ChatMentionSent[] = []) => {
    // Each entity once: a duplicate pick keeps its first index.
    const mentionsSent = orderedMentions(picked);
    if (avatarMode && avatarSendsDuringWork({ turnInFlight: busy === "turn", pendingQuestion: Boolean(pendingQuestion), fresh: brain === "flow" || publicVisit.fresh, status: publicState?.status, readyForInput: publicState?.ready_for_input })) {
      // A mention runs after a full turn, never inside the work in progress.
      if (mentionsSent.length) { setMentionStatus("A mention goes with a full message: send it once the current turn has finished. Your words and mentions are kept."); return; }
      // Words sent into the work in progress are a new message: a held one is let go.
      heldMentionsRef.current = null; void sendDuringWork(); return;
    }
    const words = draft.trim();
    if ((!words && pendingFiles.length === 0) || busy !== "idle") return;
    if (mentionsSent.length && !words) { setMentionStatus(`Write a message for ${mentionsSent.map((m) => m.name).join(" and ")}: a mention carries your words.`); return; }
    // A RESEND (client review 2026-11-09): the same words, with chips, after a send whose mentions
    // stopped partway, in the same conversation. Only those mentions are asked, with the message's
    // own `repeat_of` and first index: no new visit turn, no new summon, no new person's turn in
    // the thread; an entity that already answered is said, never asked again. Any other send is a
    // new message, and the held one is let go.
    const held = heldMentionsRef.current;
    heldMentionsRef.current = null;
    const resend = mentionResendPlan(held, mentionSession, words, mentionsSent);
    if (held && resend) {
      const answeredLine = alreadyAnsweredLine(resend.alreadyAnswered);
      if (!resend.ask.length) {
        heldMentionsRef.current = held;
        const answeredKeys = new Set(resend.alreadyAnswered.map((m) => `${m.kind}:${m.id}`));
        setMentionChips((cur) => cur.filter((c) => !answeredKeys.has(`${c.kind}:${c.id}`)));
        setMentionStatus(answeredLine);
        return;
      }
      const askedChips = chipsToRestore(mentionChipsRef.current, resend.ask);
      setMentionStatus(null);
      setMentionChips([]);
      setDraft("");
      setBusy("turn");
      void sendMentions(held.sessionId, held.message, held.resend.text, resend.ask, askedChips, held.resend.repeatOf, held.answered, answeredLine ? [answeredLine] : []).finally(() => setBusy("idle"));
      return;
    }
    // The chips as picked (for their looks), cleared from the composer like the words.
    const sentChips = mentionsSent.length ? chipsToRestore(mentionChipsRef.current, mentionsSent) : [];
    // The message shows the same chips in its bubble (panel-chat 0.9.13): every chip the send
    // carried, placed by its `start` in the sent words, with its composer look.
    const shownMentions = sentMessageMentions(draft, picked, mentionChipsRef.current);
    const mentionsField = shownMentions.length ? { mentions: shownMentions } : {};
    const chipsBack = () => { if (sentChips.length) setMentionChips((cur) => (cur.length ? cur : sentChips)); };
    setMentionStatus(null);
    if (sentChips.length) setMentionChips([]);
    if (brain === "flow") {
      if (!flowActive) { chipsBack(); return; }
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
      push({ role: "user", content: flowText, ...mentionsField });
      // The summon carries the chips as `mentions`: he answers only what is addressed to him.
      void sendFlow(flowText, { mentions: flowMentionSlugs(mentionsSent) }).then(({ landed, sessionId, runId: turnRunId }) => {
        if (!mentionsSent.length) return;
        // His turn did not land (failed, queued, stopped): the mentions were not sent.
        if (!landed || !sessionId) { chipsBack(); return; }
        // Only his own chip: his answer was the whole message (no entity to ask).
        if (!entityMentions(mentionsSent).length) return;
        setBusy("turn");
        return sendMentions(sessionId, mentionMessageKey(turnRunId), flowText, mentionsSent, sentChips, turnRunId).finally(() => setBusy("idle"));
      });
      return;
    }
    if (!runId) { chipsBack(); return; }
    // Files ride the turn as attachments (the runtime labels images itself);
    // files that are not images keep one plain line in the words.
    const payload = visitTurnPayload(words, pendingFiles);
    if ("refusal" in payload) {
      setNote(payload.refusal);
      return;
    }
    const { text, attachments } = payload;
    const sentFiles = pendingFiles;
    setDraft("");
    setPendingFiles([]);
    setRefusal(null);
    setNote(null);
    const chips = attachmentChips(sentFiles);
    const sentId = push({ role: "user", content: text, ...(chips.length ? { attachments: chips } : {}), ...mentionsField });
    // A turn that did not run hands its words AND its files back (retry is
    // one click, never a retype or a re-drop) — unless newer typing already
    // claimed the composer.
    const handBack = () => {
      setDraft((cur) => cur || words);
      if (sentFiles.length) setPendingFiles((cur) => [...sentFiles, ...cur]);
      chipsBack();
    };
    // The session the mentions join, read at send time (the visit's own).
    const sessionForMentions = mentionSession;
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
    sendVisitTurn(baseUrl, entity, runId, text, token, speaker, attachments)
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
          handBack();
          return;
        }
        // The turn's facts ride WITH the reply as a discreet badge (the
        // maintainer's ask: the system bubble was louder than the words);
        // one click opens the full probe modal — the durable turn carries
        // the probe payload (gap 1, gateway c1358). reply coerced by push().
        // What the turn formed (a diary entry, a lesson staged for the close, …) rides beside the
        // served reply as data (`reply_notices`): one badge each under his words, never read out of them.
        push(visitReplyMessage(r, entityName, Date.now() - turnT0));
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
        // His answer is in the thread: now each mention, in order (busy until the last answered).
        if (mentionsSent.length && sessionForMentions) return sendMentions(sessionForMentions, mentionMessageKey(null), words, mentionsSent, sentChips, null);
        chipsBack();
      })
      .catch((e: Error & { status?: number }) => {
        // The door refused the turn before it ran (an attachment it cannot
        // take): he never heard it, so the message leaves the thread and
        // goes back to the composer under the door's sentence.
        const refused = turnRefusal(e, refusalText);
        if (refused !== null) {
          setMessages((prev) => prev.filter((m) => m.id !== sentId));
          setRefusal(refused);
          handBack();
          return;
        }
        push({
          role: "system",
          content:
            e.status === 409
              ? `He is mid-moment (the seat answered busy) — your words are back in the composer; send again shortly. (door: ${refusalText(e)})`
              : `The turn failed: ${refusalText(e)}`,
          level: "error",
        });
        handBack();
      })
      .finally(() => setBusy("idle"));
  }, [draft, runId, busy, baseUrl, entity, entityName, token, push, pendingFiles, participant, brain, flowActive, sendFlow, avatarMode, publicState?.status, publicState?.ready_for_input, publicVisit.fresh, pendingQuestion, sendDuringWork, mentionSession, sendMentions]);

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
          if (out["reflection_pending"]) parts.push("the look-back is pending (runs at the next open)");
          // Fold what the STREAM showed during the close into the recap —
          // the reflection's visible acts, not just the door's summary.
          const observed = reflectionActivity(envelopesRef.current, closeSeqRef.current);
          if (observed.length > 0) {
            parts.push(`what moved: ${observed.slice(0, 6).map((l) => l.title).join(" · ")}${observed.length > 6 ? ` (+${observed.length - 6} more — see the Ledger tab)` : ""}`);
          }
          // The close summary: a badge staged for the close (a lesson, an interest, a realization)
          // opens here (turn_notices.noticeTarget).
          push({ role: "system", kind: VISIT_CLOSE_KIND, content: parts.length ? `Visit closed. ${parts.join(" · ")}` : "Visit closed." });
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
      // Plain-HTTP LAN origins have no navigator.clipboard (F25):
      // clipboardWrite falls back to execCommand and reports the outcome.
      if (await clipboardWrite(text)) {
        setNote(`Copied the full visit (${(t.turns ?? []).length} messages) to the clipboard.`);
      } else {
        setNote(`${COPY_FAILED}: the browser refused the clipboard.`);
      }
    } catch (e) {
      setNote(`Could not copy the visit: ${refusalText(e as Error & { status?: number })}`);
    }
  }, [baseUrl, entity, runId, entityName]);

  /** A badge of what a reply formed: its record opens in Detail (by graph id); one staged for the
   * visit's close opens the close summary once it is in the thread; before that (or in the avatar
   * view, which shows no system lines) the badge shows its own panel. */
  const { onOpenRecord } = props;
  const openNotice = useCallback(
    (notice: ChatNotice, message: ChatMessage): void | boolean =>
      openNoticeIn(notice, message.id, avatarMode ? [] : messages, {
        openRecord: onOpenRecord,
        showMessage: (mid) => document.querySelector<HTMLElement>(`.cd_thread [data-mid="${CSS.escape(mid)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }),
      }),
    [messages, avatarMode, onOpenRecord],
  );

  /** A mention chip's card in the thread: the mentioned entity's card from the rows the `@` list
   * read (none for the agent's chip or a name they do not hold). */
  const renderMentionCard = useCallback((mention: ChatMessageMention) => mentionEntityCard(mention, mentionRowsReadRef.current, baseUrl), [baseUrl]);

  const foreignVisit = status?.open && !runId;

  // The newest assistant reply feeds the Cognitive Monitor (scored once
  // per distinct text, by the monitor). Derived, not stored — cheap.
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

  /** The latest turn's tool calls for the conduct gauge (name, and ok from
   * each tool_details `success` when served — toolCallsOf). Same newest-
   * assistant-only rule as latestEffort: never an older turn's calls
   * presented as this turn's. */
  const latestTools = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== "assistant") continue;
      const d = messages[i].detail;
      if (!d) return null;
      return toolCallsOf(d);
    }
    return null;
  }, [messages]);

  // SCROLL-FOLLOW (operator 2026-07-15 pm): the thread reports the newest
  // assistant message visible at the scroll position; the monitor retunes
  // to the mood AT that message. null = at the bottom (the latest).
  const [focusMid, setFocusMid] = useState<string | null>(null);

  // The reflection's visible acts while the close runs (live stream tail
  // past the close-click seq, meaningful tones only). THE CLOSE IS
  // OBSERVABLE (operator 2026-07-15 pm: "we've zero observability over
  // it"): every act lands in the closing notice as it happens (feelings
  // moved, summary formed, interests kept, session sealed); the notice is
  // the thread's last row (ChatMessageList `closing`, operator 2026-11-10).
  const closingActivity = useMemo(
    () => (busy === "closing" ? reflectionActivity(envelopes, closeSeqRef.current) : []),
    [busy, envelopes],
  );

  // THE MEET OFFER (operator 2026-07-15): an entity picked as an `@` chip
  // can also be convened into a meet with this one. From the chip only
  // (2026-11-09): nothing is read out of the typed words (no-heuristics
  // ruling), so `castor@host` in a message is just text.
  const meetable = onConveneWith ? meetOffers(mentionChips) : [];
  const focusMsg = useMemo(() => {
    if (!focusMid) return null;
    const m = messages.find((x) => x.id === focusMid);
    return m && m.role === "assistant" && typeof m.content === "string" ? m : null;
  }, [focusMid, messages]);

  // THE MONITOR'S FEED (backlog 0018: the monitor lives with the timeline, nothing of it at the top
  // of the chat): the reply in view of the open conversation — the newest, or the one scrolled to —
  // with the latest turn's conduct facts. A set equal to the last one notifies nobody. A reply
  // reaches the drawer whole (the turn answers once), so the monitor reads it per message.
  const { replyFeed } = props;
  useEffect(() => {
    replyFeed.set(
      runId && !avatarMode
        ? {
            latestReply,
            focusReply: focusMsg ? (focusMsg.content as string) : null,
            focusAt: focusMsg?.ts ?? null,
            effort: latestEffort?.facts ?? null,
            effortKey: latestEffort?.key ?? null,
            tools: latestTools,
          }
        : null,
    );
  }, [replyFeed, runId, avatarMode, latestReply, focusMsg, latestEffort, latestTools]);
  useEffect(() => () => replyFeed.set(null), [replyFeed]);

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
      <div className="cd_view_modes" role="group" aria-label="Conversation view">
        <button type="button" aria-pressed={!avatarMode} onClick={() => { stopTtsRef.current(); avatarPrefs.setMode("chat"); }}>Chat</button>
        <button type="button" aria-pressed={avatarMode} onClick={() => { stopTtsRef.current(); avatarPrefs.setMode("avatar"); }}>Avatar</button>
      </div>
      {avatarPrefs.error ? (
        <div role="status" className="cd_note">
          <WordsLine text={avatarPrefs.error} />
        </div>
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
              <div className="cd_note">
                <WordsLine
                  text={`A visit is open${typeof status?.turn_n === "number" && status.turn_n > 0 ? ` (${status.turn_n} turn${status.turn_n === 1 ? "" : "s"})` : ""}. If it's yours — a reload can lose the drawer's memory of it — step back in; the whole conversation returns.`}
                />
              </div>
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
                <div className="cd_note">
                  <WordsLine text="Sign in first (top right) — his memories record WHO he lived each moment with, so the door only admits authenticated visitors." />
                </div>
              )}
              {/* ONE substrate per entity (2026-07-09 06:32): the visit uses
                * the SAME stored mind as his own time — shown here, changed
                * only in Settings → 🧠 mind (operator 2026-07-15 (e): the
                * picker moved off the top strip into the settings modal). */}
              <p className="cd_note" title="Visits and his own time share one mind — change it in Settings → 🧠 mind">
                {substrate?.provider && substrate?.model
                  ? `mind: ${substrate.provider} / ${substrate.model}${substrate.thinking ? ` · reasoning ${substrate.thinking}` : ""}`
                  : "mind: Gateway default (change it in Settings → 🧠 mind)"}
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
          {avatarMode && publicVisit.error ? (
            <div className="cd_note" role="status">
              <WordsLine text={publicVisit.error} inline /> <button type="button" onClick={publicVisit.refresh}>Retry</button>
            </div>
          ) : null}
          {note ? (
            <div className="cd_note" role="status">
              <WordsLine text={note} />
            </div>
          ) : null}
          {stoppedOffer ? (
            <button
              className="cd_open_btn"
              onClick={() => {
                setStoppedOffer(false);
                setNote(null);
                props.onResumeAndVisit();
              }}
              disabled={busy !== "idle" || !participant}
              title="Resume him (he comes back idle), then the visit opens."
            >
              Resume and visit
            </button>
          ) : null}
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
          {avatarMode && runId && publicState && !Array.isArray(publicState.public_updates) ? (
            <div className="cd_note cd_avatar_hint">
              <WordsLine text="Begin a new conversation here to receive progress messages." />
            </div>
          ) : null}
          {avatarMode ? <AvatarVisitView
            entityName={entityName} look={visitLook} messages={avatarMessages} state={publicState} busy={busy} draft={draft}
            onAnswer={answerPublic} onDecision={decidePublic} onError={reportAvatarError}
            options={{ sessionKey: `${baseUrl}:${authUserId}:${entity}:${runId || flowSessionId || "flow"}`,
              onTechnicalView: () => { stopTtsRef.current(); avatarPrefs.setMode("chat"); },
              connection: brain === "driver" && publicVisit.error ? "disconnected" : "connected",
              replaying: props.visible === false || hydrating || (brain === "driver" ? publicVisit.loading : !flowView && busy === "turn"),
              listening: voice.voice_ptt_recording || voice.voice_ptt_busy,
              speaking: voice.tts_speaking, preferences: avatarPrefs.preferences,
              onPreferencesChange: avatarPrefs.setPreferences, onAttendedChange: setAvatarAttended,
              onCue: (cue) => { void playConversationCue(cue).catch((e: Error) => setNote(e.message)); },
              narrate: voicePrefs.read_aloud === true && voice.tts_supported,
              onNarrate: (m) => { void voice.toggle_tts(String(m.id), m.content); },
              onInterruptSpeech: interruptAvatarSpeech, onReplyContext: setReplyContext,
            }}
            messageProps={{
              onNoticeOpen: openNotice,
              renderMentionCard,
              ...(voice.tts_supported ? {
                onSpeakToggle: (m: ChatMessage) => void voice.toggle_tts(String(m.id || ""), m.content),
                getSpeakState: (m: ChatMessage) => (voice.tts_playback.key === String(m.id || "") ? voice.tts_playback.status : "idle"),
              } : {}),
            }}
          /> : <ChatMessageList
            messages={messages}
            onDetail={(turn, tab) => setDetailTurn({ turn, tab })}
            onOpenRecord={onOpenRecord}
            onSpeakToggle={voice.tts_supported ? (m) => void voice.toggle_tts(String(m.id || ""), m.content) : undefined}
            getSpeakState={voice.tts_supported ? (m) => (voice.tts_playback.key === String(m.id || "") ? voice.tts_playback.status : "idle") : undefined}
            onFocusMessage={setFocusMid}
            onNoticeOpen={openNotice}
            renderMentionCard={renderMentionCard}
            closing={busy === "closing" ? closingActivity : null}
            closingTurns={busy === "closing" ? visitTurnCount(status, messages, runId) : null}
            pendingMentions={pendingMentions}
          />}
          {detailTurn ? <TurnDetailModal turn={detailTurn.turn} initialTab={detailTurn.tab} entityName={entityName} source={{ baseUrl, entity }} onClose={() => setDetailTurn(null)} /> : null}
          {queueOffer ? (
            <div className="cd_queue_offer">
              <span className="cd_note">
                <WordsLine text="His seat is taken — wait in line, or leave the message with him?" inline />
              </span>
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
          {busy === "turn" && !avatarMode ? (
            <div className="cd_thinking" aria-live="polite">
              {/* THE LIVE ACTIVITY PANEL (operator 2026-11-10, backlog 0010; replaced the 2026-08-01
                * pulse bars): what he is doing, row by row — what came to mind, each step, each tool
                * with what it asked, the memories he looked for, what he formed. */}
              <TurnActivityPanel activity={activity ?? NO_TURN_ACTIVITY} live onOpenRecord={props.onOpenRecord} />
              {flowActive && !runId ? (
                <button
                  className="eix_refresh pe_btn cd_stopwait"
                  onClick={stopWaiting}
                  title="Stop waiting for this turn — the run keeps ticking server-side and his memory keeps whatever he lives; only the drawer's view abandons."
                >
                  stop waiting
                </button>
              ) : null}
            </div>
          ) : null}
          {busy === "idle" && !avatarMode && activity ? <TurnActivityPanel activity={activity} live={false} onOpenRecord={props.onOpenRecord} /> : null}
          {avatarMode && publicVisit.error ? (
            <div className="cd_note" role="status">
              <WordsLine text={publicVisit.error} inline /> <button type="button" onClick={publicVisit.refresh}>Retry</button>
            </div>
          ) : null}
          {note ? (
            <div className="cd_note" role="status">
              <WordsLine text={note} />
            </div>
          ) : null}
          {refusal ? <RefusalLine text={refusal} tone="error" /> : null}
          {pendingFiles.length > 0 ? (
            <div className="cd_files">
              {pendingFiles.map((f, i) => (
                <span key={i} className="cd_file_chip" title={`in his workspace: ${f.path}`}>
                  📎 {f.name}
                  <button
                    className="cd_file_x"
                    onClick={() => { setRefusal(null); setPendingFiles((prev) => prev.filter((_, j) => j !== i)); }}
                    title="Don't reference this file (it stays in his workspace)"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {dropActive ? <div className="cd_drop_hint">drop to place in {entityName}'s workspace</div> : null}
          {/* THE MEET OFFER (operator 2026-07-15): an entity picked as an `@`
            * chip can be convened into a meet with the current one. A 1:1
            * visit can't host a second entity — the meet is the multi-entity
            * primitive, so the chip BRIDGES to it. */}
          {onConveneWith && meetable.length > 0 ? (
            <div className="cd_mentions">
              {meetable.map((m) => (
                <button
                  key={m.slug}
                  className="cd_mention_btn"
                  onClick={() => onConveneWith(m.slug)}
                  title={`Convene a meet with ${entityName} and ${m.name} — you steer, each answers in its own voice (a 1:1 visit can't host two; the meet is where they talk together).`}
                >
                  🤝 bring {m.name} in
                </button>
              ))}
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
            onChange={(text) => { if (avatarMode) stopTtsRef.current(); setDraft(text); }}
            onSend={(s) => send(s.mentions)}
            {...visitMentionProps({ sessionKey: mentionSessionKey, candidates: mentionCandidates, chips: mentionChips, onChipsChange: setMentionChips, unavailable: mentionsUnavailable, status: mentionStatus })}
            placeholder={`talk with ${entityName}…  (drop or attach files)`}
            busy={avatarMode ? replyPending || busy === "opening" || busy === "closing" : busy === "turn"}
            disabled={avatarMode ? replyPending || busy === "opening" || busy === "closing" : busy !== "idle"}
            rows={2}
            onAttach={() => fileInputRef.current?.click()}
            attachLabel="Give a file (placed in his workspace and attached to your next message; an image is shown to him)"
            attachPending={uploading}
            attachDisabled={busy !== "idle"}
            trailingActions={runId || (avatarMode && flowActive) ? <VisitVoiceButtons voice={voice} route={sttRouteText(voicePrefs, voiceDefaults.value)} disabled={busy === "closing"} /> : undefined}
            actions={
              <>
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
                  title="End the visit: the door closes the room, the REFLECTION runs (looking back over the visit: feelings may move, a summary forms, interests may take root), then the phase that ran before re-enters (personal only if its grant still stands). Left silent, the visit also closes BY ITSELF (~1h idle — laurent's ruled target): same graceful close, reflection included; the gateway's reaper drives it within minutes of the deadline even with no client alive."
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
            * uses the owned /visit guidance/answer paths in the optional
            * avatar view. The existing Chat view keeps its between-turn behavior. */}
        </>
      )}
    </div>
  );
}

/** The drawer's own thread: message cards + the discreet per-turn "system"
 * badge under each reply that carries a probe payload. Replaces the shared
 * ChatThread (which can only render whole cards — the facts bubble read as
 * loud as the words). Keeps its stick-to-bottom behavior. */
