import { describe, expect, it } from "vitest";
import { READ_ALOUD_INITIAL, entityReadAloudInput, readAloudStep } from "./read_aloud";

/** The operator's case (2026-10-29) through the drawer's wiring: re-opening a visit with replies
 * never speaks them; a turn lived in the drawer speaks its reply, even when the visit's run id is
 * cleared as that turn ends. */
function play(steps: Array<{ run: string | null; turn: boolean; reply: string | null }>): string[] {
  let state = READ_ALOUD_INITIAL;
  const spoken: string[] = [];
  for (const s of steps) {
    const out = readAloudStep(state, entityReadAloudInput(state.scope, s.run, s.turn, s.reply ? { id: s.reply, text: `text ${s.reply}` } : null));
    state = out.state;
    if (out.speak) spoken.push(out.speak.id);
  }
  return spoken;
}

describe("read aloud (Entity drawer)", () => {
  it("re-opening a visit never speaks its existing replies", () => {
    expect(play([{ run: null, turn: false, reply: null }, { run: "v1", turn: false, reply: "a3" }])).toEqual([]);
  });
  it("a turn lived here speaks its reply once, even when the run id is cleared with it", () => {
    expect(play([
      { run: "v1", turn: false, reply: "a1" },
      { run: "v1", turn: true, reply: "a1" },
      { run: null, turn: false, reply: "a2" },
      { run: null, turn: false, reply: "a2" },
    ])).toEqual(["a2"]);
  });
  it("another visit opened later is silent", () => {
    expect(play([
      { run: "v1", turn: true, reply: "a1" },
      { run: "v1", turn: false, reply: "a2" },
      { run: "v2", turn: false, reply: "b7" },
    ])).toEqual(["a2"]);
  });
});
