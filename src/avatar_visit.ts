import type { AvatarConversationState, ChatMessage, ConversationAttention, PublicUpdate } from "./vendor/abstractchat/conversation";
import { publicUpdate } from "./vendor/abstractchat/conversation";
import type { DrawerMessage } from "./chat_message_list";
import { screenDiaryFences } from "./flow_lane";
import type { VisitConversationState, VisitPublicWait } from "./stream_source";
import type { ReplayView } from "@abstractframework/panel-chat";

const row = (v: unknown): Record<string, unknown> | null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

/** Every avatar message crosses the existing diary boundary before captions, history or speech. */
export function publicVisitMessages(state: VisitConversationState): ChatMessage[] {
  const result: ChatMessage[] = [];
  const seen = new Set<string>();
  for (const raw of state.public_updates || []) {
    const p = row(raw);
    if (!p || typeof p.run_id !== "string") continue;
    const parsed = publicUpdate(p, p.run_id);
    if (!parsed) continue;
    const screened = screenDiaryFences(parsed.text);
    // A public update is exact authored text: a privacy redaction must not become
    // a fabricated public update attributed to the actor.
    if (screened.leaked || !screened.display.trim()) continue;
    const update: PublicUpdate = { ...parsed, text: screened.display };
    const id = `${update.runId}:public:${update.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ id, role: "assistant", kind: "public_update", runId: update.runId, content: update.text, source: "public_update", publicUpdate: update });
  }
  for (const raw of state.public_messages || []) {
    const p = row(raw);
    if (!p || p.role !== "user" || p.kind !== "guidance" || typeof p.id !== "string" || typeof p.text !== "string" || typeof p.run_id !== "string") continue;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    result.push({ id: p.id, role: "user", kind: "guidance", runId: p.run_id, content: p.text, source: "user_guidance" });
  }
  return result;
}

/** The technical transcript stays untouched; the avatar receives only screened public words. */
export function avatarVisitHistory(messages: DrawerMessage[], updates: ChatMessage[], runId: string | null, working = false): ChatMessage[] {
  const safe: ChatMessage[] = messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ id: m.id, role: m.role, kind: m.role === "user" ? "prompt" : "answer", runId: m.runId || runId || undefined, content: m.role === "assistant" ? screenDiaryFences(m.content).display : m.content, ts: m.ts }));
  // The newest public event leads while work is in progress; the final answer is last once it lands.
  const latestReply = working ? null : [...safe].reverse().find((m) => m.role === "assistant");
  return [...safe.filter((m) => m !== latestReply), ...updates, ...(latestReply ? [latestReply] : [])];
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
  if (!content.trim() || existing.some((m) => m.role === "assistant" && m.kind !== "public_update" && m.content === content)) return existing;
  return [...existing, { id: `${state.run_id}:final:${state.turn_n}`, runId: state.run_id, role: "assistant", kind: "final", content }];
}

/** Summoned Flow uses the same explicit public fields from its served replay view. */
export function flowConversationState(view: ReplayView | null): VisitConversationState | null {
  if (!view) return null;
  const it = view.interaction;
  const pending: VisitPublicWait | null = it ? { run_id: it.run_id, wait_key: it.wait_key, reason: it.kind === "ask_user" ? "user" : it.kind, prompt: it.prompt || undefined, choices: it.choices || undefined, allow_free_text: it.allow_free_text ?? undefined, details: { ...(it.details || {}), ...(it.kind === "tool_approval" ? { kind: "tool_approval", tool_calls: it.tool_calls } : {}) } } : null;
  return { run_id: view.root_run_id, session_id: view.session_id || undefined, status: view.status, public_updates: view.messages.filter((m) => m.kind === "public_update"), public_messages: view.messages.filter((m) => m.role === "user" && m.kind === "guidance"), pending_question: it?.kind === "ask_user" ? pending : null, pending_wait: pending };
}
