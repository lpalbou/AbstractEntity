/**
 * Read aloud in the visit drawer. The rule (which reply a host speaks by itself) is the kit's:
 * `READ_ALOUD_INITIAL` and `readAloudStep` from `@abstractframework/panel-chat`. This file holds only
 * the Entity adapter that turns the drawer's state into the rule's input.
 */
import type { ReadAloudInput, ReadAloudReply } from "@abstractframework/panel-chat";

/**
 * The visit drawer's input (this app only): the scope is the visit's run and survives the
 * moment the run id is cleared as a turn ends (the reply of that turn is still this visit's);
 * a turn in flight is live; otherwise the visit's turn has completed.
 */
export function entityReadAloudInput(prevScope: string, runId: string | null, turnLive: boolean, reply: ReadAloudReply | null): ReadAloudInput {
  return { scope: runId || prevScope, phase: turnLive ? "live" : "completed", reply };
}
