/**
 * The visit's closing notice (operator 2026-07-15 pm: "we've zero observability over it"; test round 2,
 * 2026-11-10: one line less). While the door closes the room, the head line says his reflection runs;
 * the reflection's acts land in the live stream and show under it as they happen ("He wrote in his
 * book", feelings moved, the session sealed: chat_drawer.tsx `reflectionActivity`). Before any act
 * lands there is nothing more to say, so nothing more is shown (the old "watching his stream for the
 * reflection's acts… (the Ledger tab keeps the full record)" line is gone).
 */
import React from "react";

import type { LedgerLine } from "./ledger_lines";
import { WordsLine } from "./words_line";

export const CLOSING_HEAD = "Closing — his reflection runs now (he looks back over the visit; feelings may move, a summary forms)…";

export function ClosingNotice({ activity }: { activity: LedgerLine[] }): React.ReactElement {
  return (
    <div className="cd_closing" aria-live="polite">
      <div className="cd_closing_head">
        <span className="cd_closing_spin" aria-hidden="true" />
        <span>
          <WordsLine text={CLOSING_HEAD} inline />
        </span>
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
