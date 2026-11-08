import { describe, expect, it } from "vitest";
import { kindCountLabel, momentLine } from "./identity_card";

describe("key moments read as sentences, never JSON (operator 2026-11-08)", () => {
  it("the gateway's 'first' milestone shape", () => {
    const line = momentLine({
      type: "first",
      what: "first_supersession",
      assertion_id: "e8289ae0eab2483682746ae3034505ea",
      reason: "world-model revision 2 for topic:unresolved-tension (evidence changed)",
      observed_at: "2026-11-07T14:37:59.333835+00:00",
      seq: 3234,
    });
    expect(line.icon).toBe("✏️");
    expect(line.text).toBe("His first belief revision — world-model revision 2 for topic:unresolved-tension (evidence changed)");
    expect(line.when).toBe("11-07 14:37");
    expect(line.text).not.toContain("{");
  });

  it("the stream's {kind, at, details} shape", () => {
    const line = momentLine({ kind: "summon", at: "2026-11-08T00:04:10+00:00", details: { reason: "a new session begins" } });
    expect(line.text).toBe("Summoned — a new session begins");
    expect(line.when).toBe("11-08 00:04");
  });

  it("an unknown kind gives its words and reason, not the object", () => {
    const line = momentLine({ type: "first", what: "first_lesson", reason: "a lesson formed", observed_at: "2026-11-08T01:00:00+00:00" });
    expect(line.text).toBe("First lesson — a lesson formed");
    const bare = momentLine({ what: "first_lesson" });
    expect(bare.text).toBe("first lesson");
    expect(momentLine({}).text).toBe("A moment");
  });
});

describe("life-so-far counts are words", () => {
  it("pluralises properly", () => {
    expect(kindCountLabel("diary", 125)).toBe("125 diary entries");
    expect(kindCountLabel("summary", 54)).toBe("54 summaries");
    expect(kindCountLabel("world_model", 25)).toBe("25 world models");
    expect(kindCountLabel("purpose", 1)).toBe("1 purpose");
    expect(kindCountLabel("episode", 199)).toBe("199 exchanges");
    expect(kindCountLabel("open_question", 2)).toBe("2 open questions");
  });
});
