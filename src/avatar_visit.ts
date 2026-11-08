import type { AvatarConversationState, ChatMessage, ConversationAttention, PublicUpdate } from "./vendor/abstractchat/conversation";
import { publicUpdate } from "./vendor/abstractchat/conversation";
import type { DrawerMessage } from "./chat_message_list";
import { screenDiaryFences } from "./flow_lane";
import type { IdentityRef, VisitConversationState, VisitPublicWait } from "./stream_source";
import { chatAuthorOf, compareReplayOrder, type ReplayView } from "@abstractframework/panel-chat";

const row = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
export type EntityPublicMessage = ChatMessage & {
  conversationOrder?: unknown[];
  questionContext?: {
    wait_key?: string;
    question_id?: string;
    question?: Record<string, unknown>;
    reply_status?: string;
    reason?: string;
    step_ids?: string[];
    seqs?: number[];
  };
};
const privateQuestion = (p: Record<string, unknown>) => /```\s*diary\b|<\s*(?:diary|think)\b/i.test(JSON.stringify(p));
function sourceOrder(p: Record<string, unknown>): Pick<EntityPublicMessage, "conversationOrder" | "ts"> {
  return { ...(Array.isArray(p.order) ? { conversationOrder: [...p.order] } : {}), ...(Array.isArray(p.order) && typeof p.order[0] === "string" && p.order[0] ? { ts: p.order[0] } : typeof p.published_at === "string" ? { ts: p.published_at } : {}) };
}
export function orderPublicMessages(messages: EntityPublicMessage[]): EntityPublicMessage[] {
  // Older projections without order retain their served order. No browser-clock guesses.
  return [...messages].sort((a, b) => a.conversationOrder?.length && b.conversationOrder?.length ? compareReplayOrder({ id: a.id, order: a.conversationOrder }, { id: b.id, order: b.conversationOrder }) : 0);
}
export function publicVisitHistoryOmitted(state: VisitConversationState | null): boolean {
  return [state?.public_updates_omitted, state?.public_messages_omitted, state?.public_questions_omitted, state?.conversation_runs_omitted].some((n) => typeof n === "number" && Number.isFinite(n) && n > 0);
}

function questionHistoryMessage(p: Record<string, unknown>): EntityPublicMessage | null {
  if (typeof p.id !== "string" || !p.id || typeof p.text !== "string" || !p.text.trim() || typeof p.run_id !== "string" || !p.run_id || privateQuestion(p)) return null;
  const question = row(p.question);
  const allowed = (p.role === "assistant" && p.kind === "question" && p.source === "wait" && typeof p.wait_key === "string")
    || (p.role === "user" && p.kind === "answer" && p.source === "resume" && typeof p.wait_key === "string")
    || (p.role === "system" && p.kind === "question_outcome" && p.source === "emit_event" && question?.outcome === "expired" && typeof question.id === "string" && Boolean(question.id.trim()))
    || (p.role === "user" && p.kind === "retained_reply" && p.source === "emit_event" && p.reply_status === "retained" && typeof p.question_id === "string" && Boolean(p.question_id.trim()));
  if (!allowed) return null;
  const meta: NonNullable<EntityPublicMessage["questionContext"]> = {};
  for (const key of ["wait_key", "question_id", "reply_status", "reason"] as const) if (typeof p[key] === "string") meta[key] = p[key];
  if (question) {
    meta.question = Object.fromEntries(["id", "purpose", "importance", "published_at", "deadline", "fallback", "outcome"].filter((key) => typeof question[key] === "string").map((key) => [key, question[key]]));
  }
  if (Array.isArray(p.step_ids)) meta.step_ids = p.step_ids.filter((id): id is string => typeof id === "string");
  if (Array.isArray(p.seqs)) meta.seqs = p.seqs.filter((seq): seq is number => typeof seq === "number" && Number.isFinite(seq));
  return { id: p.id, runId: p.run_id, role: p.role as string, kind: p.kind as string, source: p.source as string, content: p.text, questionContext: meta, ...sourceOrder(p) };
}

/** Every avatar message crosses the existing diary boundary before captions, history or speech. */
export function publicVisitMessages(state: VisitConversationState): EntityPublicMessage[] {
  const result: EntityPublicMessage[] = [];
  const seen = new Set<string>();
  for (const raw of state.public_updates || []) {
    const p = row(raw);
    if (!p || typeof p.run_id !== "string") continue;
    // The gateway serves the actor's own type as `update_kind` ("finding" | "progress").
    const parsed = publicUpdate({ ...p, kind: p.update_kind }, p.run_id);
    if (!parsed) continue;
    const screened = screenDiaryFences(parsed.text);
    // A public update is exact authored text: a privacy redaction must not become
    // a fabricated public update attributed to the actor.
    if (screened.leaked || !screened.display.trim()) continue;
    const update: PublicUpdate = { ...parsed, text: screened.display };
    const id = `${update.runId}:public:${update.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    // Who said it, as the live view serves it (the turn's author on the view's messages, gateway
    // 2026-11-08): labelled while the turn is live, not only once the answer is saved.
    const author = chatAuthorOf(p.author);
    result.push({ id, role: "assistant", kind: "public_update", runId: update.runId, content: update.text, source: "public_update", publicUpdate: update, ...sourceOrder(p), ...(author ? { author } : {}) });
  }
  for (const raw of state.public_messages || []) {
    const p = row(raw);
    if (!p || p.role !== "user" || p.kind !== "guidance" || typeof p.id !== "string" || typeof p.text !== "string" || typeof p.run_id !== "string") continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    result.push({ id: p.id, role: "user", kind: "guidance", runId: p.run_id, content: p.text, source: "user_guidance", ...sourceOrder(p) });
  }
  for (const raw of state.public_questions || []) {
    const p = row(raw);
    const message = p ? questionHistoryMessage(p) : null;
    if (!message || seen.has(message.id!)) continue;
    seen.add(message.id!); result.push(message);
  }
  return orderPublicMessages(result);
}

/** The technical transcript stays untouched; the avatar receives only screened public words. An
 * answer keeps its author (a mentioned entity's reply names who answered on the answer card). */
export function avatarVisitHistory(messages: DrawerMessage[], updates: ChatMessage[], runId: string | null, working = false): ChatMessage[] {
  const ordered = orderPublicMessages(updates as EntityPublicMessage[]);
  const safe: ChatMessage[] = messages.filter((m) => {
    const local = m as EntityPublicMessage;
    // A command receipt is not proof that a question was answered: the canonical
    // projection will show either its applied answer or its retained late reply.
    if (local.source === "local_question_answer") return false;
    return m.role === "user" || m.role === "assistant";
  }).map((m) => ({ id: m.id, role: m.role, kind: m.kind || (m.role === "user" ? "prompt" : "answer"), runId: m.runId || runId || undefined, content: m.role === "assistant" ? screenDiaryFences(m.content).display : m.content, ts: m.ts, ...(m.role === "user" && m.attachments?.length ? { attachments: m.attachments } : {}), ...(m.role === "assistant" && m.author ? { author: m.author } : {}) }));
  // The newest public event leads while work is in progress; the final answer is last once it lands.
  const latestReply = working ? null : [...safe].reverse().find((m) => m.role === "assistant");
  return [...safe.filter((m) => m !== latestReply), ...ordered, ...(latestReply ? [latestReply] : [])];
}

export function visitAttention(state: VisitConversationState | null): ConversationAttention | null {
  const wait = state?.pending_question || state?.pending_wait;
  if (!wait) return null;
  const details = row(wait.details);
  const question = row(details?.question);
  const approval = details?.kind === "tool_approval" || details?.mode === "approval_required" || wait.reason === "tool_approval";
  if (!approval && !["user", "ask_user"].includes(String(wait.reason || ""))) return null;
  return { id: `${wait.run_id}:${String(question?.id || wait.wait_key)}`, kind: approval ? "approval" : "question", ...(question?.importance === "essential" || question?.importance === "clarification" ? { importance: question.importance } : {}), ...(typeof question?.deadline === "string" ? { deadline: question.deadline } : {}), ...(typeof question?.fallback === "string" ? { fallback: screenDiaryFences(question.fallback).display } : {}) };
}

export function visitQuestion(state: VisitConversationState | null): VisitPublicWait | null {
  const wait = state?.pending_question;
  return wait && ["user", "ask_user"].includes(String(wait.reason || "")) ? wait : null;
}
export function visitAvatarStatus(state: VisitConversationState | null, busy: string, hasReply: boolean): AvatarConversationState {
  if (state?.status === "paused") return "paused";
  if (["failed", "cancelled"].includes(state?.status || "")) return "failed";
  if (busy !== "idle" || state?.status === "running" || state?.ready_for_input === false) return "working";
  return hasReply ? "completed" : "idle";
}

/** Reattached visits can complete after the browser's original turn request disappeared. */
export function completedVisitReply(state: VisitConversationState | null, existing: ChatMessage[]): ChatMessage[] {
  if (!state?.turn_complete || typeof state.turn_n !== "number" || typeof state.reply !== "string") return existing;
  const content = screenDiaryFences(state.reply).display;
  if (!content.trim() || existing.some((m) => m.role === "assistant" && ["answer", "final"].includes(m.kind || "") && m.content === content)) return existing;
  return [...existing, { id: `${state.run_id}:final:${state.turn_n}`, runId: state.run_id, role: "assistant", kind: "final", content }];
}

/** Summoned Flow uses the same explicit public fields from its served replay view. */
export function flowConversationState(view: ReplayView | null): VisitConversationState | null {
  if (!view) return null;
  const it = view.interaction;
  const pending: VisitPublicWait | null = it ? { run_id: it.run_id, wait_key: it.wait_key, reason: it.kind === "ask_user" ? "user" : it.kind, prompt: it.prompt || undefined, choices: it.choices || undefined, allow_free_text: it.allow_free_text ?? undefined, details: { ...(it.details || {}), ...(it.kind === "tool_approval" ? { kind: "tool_approval", tool_calls: it.tool_calls } : {}) } } : null;
  const omissions = Object.fromEntries(["public_updates_omitted", "public_messages_omitted", "public_questions_omitted", "conversation_runs_omitted"].map((key) => [key, (view as unknown as Record<string, unknown>)[key]]).filter(([, value]) => typeof value === "number"));
  return { run_id: view.root_run_id, session_id: view.session_id || undefined, status: view.status, public_updates: view.messages.filter((m) => m.kind === "public_update"), public_messages: view.messages.filter((m) => m.role === "user" && m.kind === "guidance"), public_questions: view.messages.filter((m) => ["question", "answer", "question_outcome", "retained_reply"].includes(m.kind)), ...omissions, pending_question: it?.kind === "ask_user" ? pending : null, pending_wait: pending };
}

/**
 * Whether an Avatar send goes to the work in progress (guidance or the pending answer) rather than
 * starting a turn. A pending question always takes the answer. The polled run status counts only
 * when that poll is fresh: right after a turn ends, a status read during the turn would otherwise
 * turn the next message into guidance for a run that is no longer working.
 */
export function avatarSendsDuringWork(input: { turnInFlight: boolean; pendingQuestion: boolean; fresh: boolean; status?: string; readyForInput?: boolean }): boolean {
  if (input.turnInFlight || input.pendingQuestion) return true;
  if (!input.fresh) return false;
  return input.status === "running" || input.readyForInput === false;
}

/** The identity the visit speaks with (framework ADR 0052 §3): the `identity_ref` the gateway stamps
 * on the visit's public updates (the newest one), else the one the visit opened with. null when
 * neither carries one: a reference is never made up. */
export function visitIdentityRef(state: VisitConversationState | null, opened: IdentityRef | null): IdentityRef | null {
  const updates = Array.isArray(state?.public_updates) ? state.public_updates : [];
  for (let i = updates.length - 1; i >= 0; i--) {
    const ref = row(row(updates[i])?.identity_ref);
    if (ref && typeof ref.of === "string" && ref.of && Number.isInteger(ref.rev)) return { of: ref.of, rev: ref.rev as number };
  }
  return opened;
}
