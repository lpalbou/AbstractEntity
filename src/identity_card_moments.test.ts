import { describe, expect, it } from "vitest";
import { feelingWho, kindCountLabel, lessonLine, momentLine } from "./identity_card";

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

describe("feeling moments read as sentences about who (operator 2026-11-08)", () => {
  // memory's key-moment shape for a feeling event (entity_card.py _valence_moment)
  const feeling = (kind: string, sign: number, target: string, reason = "") => ({
    type: "valence",
    kind,
    target,
    sign,
    magnitude: 9,
    reason,
    observed_at: "2026-11-07T21:05:00+00:00",
    seq: 512,
  });

  it("each of the six kinds has its own sentence, never the bare kind word", () => {
    expect(momentLine(feeling("appraisal", 1, "person:admin", "he stayed with me")).text).toBe("A strong, warm feeling about admin — he stayed with me");
    expect(momentLine(feeling("appraisal", -1, "tool:rm_rf", "wiped a workspace")).text).toBe("A strong, painful feeling about rm rf — wiped a workspace");
    expect(momentLine(feeling("bond", 1, "person:admin", "trusted me with my own time")).text).toBe("A bond with admin formed — trusted me with my own time");
    expect(momentLine(feeling("scar", -1, "tool:rm_rf", "wiped a workspace")).text).toBe("A scar from rm rf — wiped a workspace");
    expect(momentLine(feeling("healing", 1, "tool:rm_rf", "the backups held")).text).toBe("A scar from rm rf healed — the backups held");
    expect(momentLine(feeling("break", -1, "person:grace", "she lied about the run")).text).toBe("The bond with grace broke — she lied about the run");
    expect(momentLine(feeling("revalued", 1, "person:grace", "that was years ago")).text).toBe("He let his past with grace weigh less — that was years ago");
    for (const kind of ["appraisal", "bond", "scar", "healing", "break", "revalued"]) {
      const line = momentLine(feeling(kind, kind === "scar" || kind === "break" ? -1 : 1, "person:admin", "why"));
      expect(line.text.toLowerCase().startsWith(kind)).toBe(false);
      expect(line.icon).not.toBe("・");
      expect(line.when).toBe("11-07 21:05");
    }
  });

  it("direction sets the appraisal's tone and icon", () => {
    expect(momentLine(feeling("appraisal", 1, "person:admin")).icon).toBe("💗");
    expect(momentLine(feeling("appraisal", -1, "person:admin")).icon).toBe("🌧️");
  });

  it("a remembered record is named by what it is, never by its id", () => {
    expect(feelingWho("ex:episode-15e2535b887a74b2ff1e738cc0")).toBe("an exchange");
    expect(feelingWho("ex:diary-e519d856e11d02c491820c619a")).toBe("a diary entry");
    expect(feelingWho("ex:summary-95aa78de0c3b48bc22abbdbbc0")).toBe("a summary");
    expect(feelingWho("concept:twelve_bridges")).toBe("twelve bridges");
    const line = momentLine(feeling("appraisal", 1, "ex:episode-15e2535b887a74b2ff1e738cc0", "the question about being the same"));
    expect(line.text).toBe("A strong, warm feeling about an exchange — the question about being the same");
    expect(line.text).not.toContain("ex:");
  });

  it("no target and no reason still give a sentence", () => {
    expect(momentLine({ type: "valence", kind: "bond", sign: 1 }).text).toBe("A bond formed");
    expect(momentLine({ type: "valence", kind: "appraisal", sign: -1 }).text).toBe("A strong, painful feeling");
  });
});

describe("card lessons", () => {
  it("a lesson he wrote in his book carries its words, when, and the book mark", () => {
    const line = lessonLine({
      record_id: "ex:diary-b14fe239856321030b775c2c15",
      kind: "diary",
      title: "Diary entry (lesson) — 2026-11-07: Search snippets are leads…",
      statement: "Search snippets are leads, not confirmations.",
      observed_at: "2026-11-07T18:12:40+00:00",
      entry_id: "diary_d6baf040cd94120dd8390959",
      source: "diary",
    });
    expect(line).toEqual({ text: "Search snippets are leads, not confirmations.", when: "11-07 18:12", fromBook: true });
  });

  it("an elected lesson record has no book mark", () => {
    const line = lessonLine({ record_id: "ex:lesson-f7", kind: "lesson", title: "lesson: act", statement: "Act, do not describe.", observed_at: "2026-07-20T11:23:23+00:00" });
    expect(line).toEqual({ text: "Act, do not describe.", when: "07-20 11:23", fromBook: false });
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
