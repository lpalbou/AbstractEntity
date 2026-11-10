/**
 * The visit's closing notice (operator 2026-07-15 pm: "we've zero observability over it"; test round 2,
 * 2026-11-10: one line less; 2026-11-10 evening: no pronoun, the narration on its own line in italic,
 * and the notice IN the chat, the thread's last row: ChatMessageList `closing`). While the door
 * closes the room, the head line says the reflection runs and the narrator's line says what it does;
 * the reflection's acts land in the live stream and show under it as they happen ("He wrote in his
 * book", feelings moved, the session sealed: chat_drawer.tsx `reflectionActivity`). Before any act
 * lands there is nothing more to say, so nothing more is shown (the old "watching his stream for the
 * reflection's acts… (the Ledger tab keeps the full record)" line is gone).
 */
import React from "react";

import type { LedgerLine } from "./ledger_lines";
import { WordsLine } from "./words_line";
import "./chat_notices.css";

/** The head line (no pronoun: none is served for an entity, so none is written). */
export const CLOSING_HEAD = "Closing — reflection runs now";
/** The narrator's line under it, in italic, no parentheses (operator 2026-11-10: "like a narrator
 * explaining the action"). */
export const CLOSING_NARRATION = "looking back over the visit; feelings may move, a summary forms…";

export function ClosingNotice({ activity }: { activity: LedgerLine[] }): React.ReactElement {
  return (
    <div className="cd_closing" aria-live="polite">
      <div className="cd_closing_head">
        <span className="cd_closing_spin" aria-hidden="true" />
        <span>
          <WordsLine text={CLOSING_HEAD} inline />
        </span>
      </div>
      <div className="cd_closing_narration">
        <WordsLine text={CLOSING_NARRATION} inline />
      </div>
      {activity.length > 0 ? (
        <ul className="cd_closing_lines">
          {activity.map((l) => (
            <li key={l.seq}>
              <strong>
                <WordsLine text={l.title} inline />
              </strong>
              {l.detail ? (
                <span className="cd_closing_detail">
                  {" — "}
                  <WordsLine text={l.detail} inline />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
