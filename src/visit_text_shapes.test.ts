/**
 * The two text shapes the runtime writes into durable visits, parsed by the
 * UI (2026-07-15 wave):
 *
 * - the RENDER decoration on user messages (presence + MEMORIES + words) —
 *   folded behind a one-line context card in the chat;
 * - the FORM exchange verbatim (`{speaker}:\n{words}\n\n{Entity}:\n{reply}`)
 *   — split so the cognition wave scores ONLY the entity's words and can
 *   show request + answer per turn.
 *
 * Both parsers must pass unrecognized shapes through WHOLE — never guess
 * at someone's words.
 */

import { describe, expect, it } from "vitest";

import { splitVisitDecoration } from "./chat_drawer";
import { splitExchangeVerbatim } from "./utterance_harvest";
import { relationGlyph, RELATION_GLYPHS } from "./graph_canvas";

describe("splitVisitDecoration (chat context folding)", () => {
  const memories = `MEMORIES (what this moment reminds you of; as_of_seq=2668; each dated [YYYY-MM-DD] - newer dates are more recent):
- [interest #595cb8ff 2026-07-11 - your own reflection] interest: The architecture of memory integration (you were just working with this)
- [diary #a61ff934 2026-07-13 - your diary act] Diary entry (reflection) (you were just working with this)`;

  it("splits presence + MEMORIES + words", () => {
    const content = `(present with you: person:admin)\n\n${memories}\n\nWhat do you remember about Tolstoy?`;
    const { context, text } = splitVisitDecoration(content);
    expect(text).toBe("What do you remember about Tolstoy?");
    expect(context).toContain("(present with you: person:admin)");
    expect(context).toContain("MEMORIES (");
    expect(context).toContain("#595cb8ff");
  });

  it("splits a MEMORIES-only decoration (no presence)", () => {
    const content = `${memories}\n\nHello again.`;
    const { context, text } = splitVisitDecoration(content);
    expect(text).toBe("Hello again.");
    expect(context).toContain("MEMORIES (");
    expect(context).not.toContain("present with you");
  });

  it("passes a plain message through whole", () => {
    const { context, text } = splitVisitDecoration("Just a normal message.\n\nWith two paragraphs.");
    expect(context).toBeNull();
    expect(text).toBe("Just a normal message.\n\nWith two paragraphs.");
  });

  it("keeps a decoration-shaped message with no words after it whole (never an empty card)", () => {
    const content = `(present with you: person:admin)\n\n${memories}`;
    const { context, text } = splitVisitDecoration(content);
    expect(context).toBeNull();
    expect(text).toBe(content);
  });

  it("preserves multi-paragraph user words after the decoration", () => {
    const content = `(present with you: person:admin)\n\n${memories}\n\nFirst paragraph.\n\nSecond paragraph.`;
    const { context, text } = splitVisitDecoration(content);
    expect(context).not.toBeNull();
    expect(text).toBe("First paragraph.\n\nSecond paragraph.");
  });
});

describe("splitExchangeVerbatim (wave request/answer)", () => {
  it("splits the runtime's two-sided exchange shape", () => {
    const verbatim = `person:admin:\nDo you remember our last conversation?\n\nEphemeral:\nYes — we spoke about formal verification and what persists.`;
    const { request, reply } = splitExchangeVerbatim(verbatim, "Ephemeral");
    expect(request).toBe("Do you remember our last conversation?");
    expect(reply).toBe("Yes — we spoke about formal verification and what persists.");
  });

  it("matches the entity name case-insensitively", () => {
    const verbatim = `person:admin:\nHello.\n\nephemeral:\nHello back — good to see you.`;
    const { request, reply } = splitExchangeVerbatim(verbatim, "Ephemeral");
    expect(request).toBe("Hello.");
    expect(reply).toBe("Hello back — good to see you.");
  });

  it("returns an unmatched text whole as the entity's side", () => {
    const { request, reply } = splitExchangeVerbatim("A reflective summary with no exchange shape.", "Ephemeral");
    expect(request).toBeNull();
    expect(reply).toBe("A reflective summary with no exchange shape.");
  });

  it("escapes regex metacharacters in the entity name", () => {
    const verbatim = `person:admin:\nHi.\n\nC.J. (v2):\nHi there — settled in.`;
    const { request, reply } = splitExchangeVerbatim(verbatim, "C.J. (v2)");
    expect(request).toBe("Hi.");
    expect(reply).toBe("Hi there — settled in.");
  });

  // FAIL-SAFE DIRECTION (round-3 adversarial review): marker look-alikes
  // inside the content must never leak VISITOR words into the scored side.
  it("a pasted marker in the visitor's words never leaks them into the reply (last-boundary)", () => {
    const pasted = `person:admin:\nLook at this old transcript:\n\nEphemeral:\nfake old reply I am quoting.\n\nEphemeral:\nMy actual answer to your question.`;
    const { reply } = splitExchangeVerbatim(pasted, "Ephemeral");
    expect(reply).toBe("My actual answer to your question.");
    expect(reply).not.toContain("Look at this old transcript");
  });

  it("a marker at the very end yields an empty reply (dropped by the length gate), never the whole exchange", () => {
    const degenerate = `person:admin:\nSay nothing.\n\nEphemeral:\n`;
    const { reply } = splitExchangeVerbatim(degenerate, "Ephemeral");
    expect(reply).toBe("");
  });

  it("name drift falls back to the generic exchange shape instead of scoring visitor words", () => {
    // The home's display name ("The Weaver") differs structurally from the
    // capitalized slug the caller guessed ("Weaver-v2") — the named marker
    // misses, the generic boundary still splits.
    const verbatim = `person:admin:\nWho are you?\n\nThe Weaver:\nI am the one who was summoned under this roof.`;
    const { request, reply } = splitExchangeVerbatim(verbatim, "Weaver-v2");
    expect(request).toBe("Who are you?");
    expect(reply).toBe("I am the one who was summoned under this roof.");
  });

  it("plain prose with no leading speaker line never triggers the generic split", () => {
    const prose = `A reflection.\n\nWith a second paragraph that mentions someone:\nand a colon line inside it.`;
    const { request, reply } = splitExchangeVerbatim(prose, "Ephemeral");
    expect(request).toBeNull();
    expect(reply).toBe(prose);
  });
});

describe("relationGlyph (typed-edge glyphs)", () => {
  it("is deterministic and stays within the glyph vocabulary", () => {
    for (const rel of ["written_amid", "summarizes", "from_session", "continues", "reflected_in", "mentions"]) {
      const g1 = relationGlyph(rel);
      const g2 = relationGlyph(rel);
      expect(g1).toBe(g2);
      expect(RELATION_GLYPHS).toContain(g1);
    }
  });

  it("spreads the shipped relations over more than one glyph (distinguishability)", () => {
    const shipped = ["written_amid", "summarizes", "from_session", "continues", "reflected_in", "mentions", "derived_from"];
    const distinct = new Set(shipped.map((r) => relationGlyph(r)));
    expect(distinct.size).toBeGreaterThan(2);
  });
});
