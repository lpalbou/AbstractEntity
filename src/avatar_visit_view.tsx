import { useCallback, useMemo } from "react";
import { ActivityAvatar, type AvatarPose } from "@abstractframework/ui-kit";
import { WorkflowInteractionPanel, publicApprovalRequest, AvatarConversation, conversationState, type WorkflowInteraction, type AvatarConversationOptions, type AvatarConversationProps, type ChatMessage, type ConversationAttention } from "./vendor/abstractchat/conversation";
import { screenDiaryFences } from "./flow_lane";
import { IdentityAvatar, type IdentityLook } from "./identity_avatar";
import { publicVisitHistoryOmitted, visitAttention, visitAvatarStatus } from "./avatar_visit";
import type { VisitConversationState, VisitPublicWait } from "./stream_source";

export function AvatarVisitView(props: {
  entityName: string;
  /** Its design and colour from the identity the visit names (framework ADR 0052); null = the visit
   * names none, and the kit's own avatar is drawn as before. */
  look: IdentityLook | null;
  messages: ChatMessage[];
  state: VisitConversationState | null;
  busy: string;
  draft: string;
  options: Omit<AvatarConversationOptions, "avatar" | "status" | "attention">;
  /** Read-aloud on the live line and on the answer: the same speaker the chat list shows. */
  messageProps?: AvatarConversationProps["messageProps"];
  onAnswer(wait: VisitPublicWait, answer: string): Promise<unknown>;
  onDecision(wait: VisitPublicWait, approved: boolean): Promise<unknown>;
  onError(message: string): void;
}) {
  const status = visitAvatarStatus(props.state, props.busy, props.messages.some((m) => m.role === "assistant" && ["answer", "final"].includes(m.kind || "")));
  const attention = useMemo<ConversationAttention | null>(() => {
    const waiting = visitAttention(props.state);
    if (waiting) return waiting;
    const final = [...props.messages].reverse().find((m) => m.role === "assistant" && ["answer", "final"].includes(m.kind || ""));
    return status === "completed" && final ? { id: `${final.runId}:${final.id}:completed`, kind: "completion" } : null;
  }, [props.state, props.messages, status]);
  const state = conversationState({ ...props.options, attention, status });
  const pose: AvatarPose = state === "listening" ? "listening" : state === "speaking" ? "speaking" : ["approval", "question", "paused", "disconnected"].includes(state) ? "waiting" : state === "failed" ? "error" : state === "working" ? "working" : "ready";
  const onAvatarError = useCallback((error: Error) => props.onError(`The avatar could not be drawn: ${error.message}`), [props.onError]);
  const wait = props.state?.pending_question || props.state?.pending_wait;
  const interaction = useMemo<WorkflowInteraction | null>(() => {
    if (!wait || !attention) return null;
    const prompt = screenDiaryFences(wait.prompt || "How would you like to continue?").display;
    if (attention.kind === "approval") {
      const calls = Array.isArray(wait.details?.tool_calls) ? wait.details.tool_calls : [];
      const names = calls.map((call) => call && typeof call === "object" && typeof call.name === "string" ? call.name : "requested action");
      return { id: attention.id, kind: "tool-approval", title: "Permission required", toolName: names.join(", ") || "Requested action", publicRequest: publicApprovalRequest(calls, wait.details?.public_action, wait.run_id), onApprove: () => props.onDecision(wait, true), onDeny: () => props.onDecision(wait, false) };
    }
    if (attention.kind !== "question") return null;
    const choices = (wait.choices || []).map((choice) => {
      const p = choice && typeof choice === "object" ? choice as Record<string, unknown> : null;
      const id = String(p?.value ?? p?.id ?? p?.label ?? choice);
      return { id, label: screenDiaryFences(String(p?.label ?? p?.text ?? id)).display };
    });
    const deadline = attention.deadline && Number.isFinite(Date.parse(attention.deadline)) ? new Date(attention.deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : attention.deadline;
    return { id: attention.id, kind: "ask-user", title: attention.importance === "essential" ? "Your answer is required" : "A question for you", prompt, choices, allowFreeText: wait.allow_free_text !== false, description: attention.importance === "essential" ? "I will keep waiting for your answer." : attention.importance === "clarification" ? `${deadline ? `Answer by ${deadline}. ` : ""}Without an answer: ${attention.fallback || ""}` : undefined, onSubmit: (answer) => props.onAnswer(wait, answer) };
  }, [wait, attention, props.onAnswer, props.onDecision]);
  return <>
    {publicVisitHistoryOmitted(props.state) ? <p className="cd_note cd_avatar_history_notice" role="status">Some earlier exchanges are not shown in this view.</p> : null}
    <AvatarConversation {...props.options} avatar={props.look ? <IdentityAvatar look={props.look} pose={pose} size={320} label={`${props.entityName} — ${state}`} onError={onAvatarError} /> : <ActivityAvatar design="watch-hover" pose={pose} size={320} active animated label={`${props.entityName} — ${state}`} onError={onAvatarError} />} status={status} attention={attention} messages={props.messages} attended={Boolean(props.draft.trim())}
    messageProps={props.messageProps}
    interactionId={interaction?.id || ""}
    interaction={interaction ? <WorkflowInteractionPanel interaction={interaction} variant="conversation" onReviewTechnical={props.options.onTechnicalView} /> : null} />
  </>;
}
