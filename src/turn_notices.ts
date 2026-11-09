/**
 * What a reply formed, as badges under its words (AbstractRuntime turn notices, 2026-11-09).
 *
 * The runtime serves his reply WITHOUT the bracket markers it used to carry (kept in diary …,
 * learned …) and, beside it, a structured list `[{kind, record_id, title, text?,
 * visibility?, staged?}]`. The app reads that list as data and never reads a marker out of the
 * text (operator rule: no regex on content). Where each lane serves it:
 *  - the visit lane's turn response and the hosted chat's: `reply_notices`;
 *  - the flow lane: the summoned run's replay view, each `answer` message's `notices`.
 *
 * A badge opens (`noticeTarget`):
 *  - a record (`record_id`, the graph id): its Detail panel, a private diary entry included (Detail
 *    shows no words of a diary entry until the operator opens them);
 *  - a lesson, interest or realization staged for the visit's close (`record_id` null): the close
 *    summary once the visit has closed (the close output names no formed record yet), else the
 *    badge's own panel (its words and "it is kept when the visit closes").
 */
import { chatNoticesOf, type ChatNotice, type ReplayView } from "@abstractframework/panel-chat";

/** The `kind` of the system line a visit's close leaves in the thread (its summary). */
export const VISIT_CLOSE_KIND = "visit_close";

/** The field a served notice list adds to its reply's thread message: `{notices}`, or nothing when
 * the turn formed nothing (a list of plain strings, the operator's log, is not notices). */
export function noticesField(served: unknown): { notices?: ChatNotice[] } {
  const notices = chatNoticesOf(served);
  return notices.length ? { notices } : {};
}

/** The notices of a summoned turn's replay view: every `answer` message's `notices`, in view order
 * (the turn's whole tree: what this turn formed). */
export function viewReplyNotices(view: ReplayView | null | undefined): ChatNotice[] {
  const out: ChatNotice[] = [];
  for (const m of view?.messages ?? []) if (m.kind === "answer") out.push(...chatNoticesOf(m.notices));
  return out;
}

export type NoticeTarget =
  | { kind: "record"; graphId: string }
  | { kind: "close"; messageId: string }
  | { kind: "panel" };

/** Where a badge of `messageId` opens, given the thread (in order). */
export function noticeTarget(notice: ChatNotice, messageId: string | undefined, thread: ReadonlyArray<{ id?: string; kind?: string }>): NoticeTarget {
  if (notice.record_id) return { kind: "record", graphId: notice.record_id };
  if (notice.staged && messageId) {
    const at = thread.findIndex((m) => m.id === messageId);
    const close = at < 0 ? undefined : thread.slice(at + 1).find((m) => m.kind === VISIT_CLOSE_KIND);
    if (close?.id) return { kind: "close", messageId: close.id };
  }
  return { kind: "panel" };
}
