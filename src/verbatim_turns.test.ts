/**
 * Exchange-verbatim parsing (dm#54 pts 5-6): speakers become metadata,
 * turns render labeled; non-exchange text stays plain.
 */
import { describe, expect, it } from "vitest";

import { parseVerbatimTurns, splitUnspokenThinking } from "./inspector";

describe("parseVerbatimTurns", () => {
  it("splits a two-speaker exchange into labeled turns", () => {
    const raw = "person:admin:\n1) the web searches returned nothing.\n\nEphemeral:\nThat's essentially what my diary entries do.";
    const turns = parseVerbatimTurns(raw, "Ephemeral");
    expect(turns).not.toBeNull();
    expect(turns!.map((t) => t.speaker)).toEqual(["person:admin", "Ephemeral"]);
    expect(turns![0].text).toContain("web searches");
    expect(turns![1].text).toContain("diary entries");
  });

  it("keeps lookup phases as their own labeled turns", () => {
    const raw = "person:admin:\nq?\n\nEphemeral (while looking things up):\n[used tool: web_search]\n\nEphemeral:\nanswer.";
    const turns = parseVerbatimTurns(raw, "Ephemeral");
    expect(turns!.map((t) => t.speaker)).toEqual(["person:admin", "Ephemeral (while looking things up)", "Ephemeral"]);
  });

  it("never splits on prose headers like Note:", () => {
    const raw = "person:admin:\nNote:\nthis stays inside the admin turn.\n\nEphemeral:\nok.";
    const turns = parseVerbatimTurns(raw, "Ephemeral");
    expect(turns!.length).toBe(2);
    expect(turns![0].text).toContain("Note:");
  });

  it("returns null for non-exchange text (diary entries, born digests)", () => {
    expect(parseVerbatimTurns("Just words, no speakers at all.", "Ephemeral")).toBeNull();
    expect(parseVerbatimTurns("", "Ephemeral")).toBeNull();
  });

  it("matches the entity name case-insensitively", () => {
    const raw = "person:laurent:\nhi.\n\nephemeral:\nhello.";
    const turns = parseVerbatimTurns(raw, "Ephemeral");
    expect(turns!.map((t) => t.speaker)).toEqual(["person:laurent", "ephemeral"]);
  });

  it("handles the door announcer", () => {
    const raw = "(the door):\na visitor has arrived.\n\nEphemeral:\nwelcome.";
    const turns = parseVerbatimTurns(raw, "Ephemeral");
    expect(turns!.map((t) => t.speaker)).toEqual(["(the door)", "Ephemeral"]);
  });
});

describe("splitUnspokenThinking", () => {
  it("passes through whole when no marker (pre-ship verbatim)", () => {
    const raw = "Ephemeral:\nHello there.";
    expect(splitUnspokenThinking(raw)).toEqual({ spoken: raw, thinking: null });
  });
  it("splits the spoken half from the unspoken reasoning at the marker line", () => {
    const raw = "Ephemeral:\nI'll help with that.\n\n(thinking, unspoken)\nI'm not sure this is right, but I'll try.";
    const { spoken, thinking } = splitUnspokenThinking(raw);
    expect(spoken).toBe("Ephemeral:\nI'll help with that.");
    expect(thinking).toBe("I'm not sure this is right, but I'll try.");
  });
  it("never false-splits on the literal string mid-prose (must be a line boundary)", () => {
    const raw = "Ephemeral:\nHe said it was (thinking, unspoken) that mattered most.";
    expect(splitUnspokenThinking(raw).thinking).toBeNull();
  });
  it("empty thinking section yields null, keeps spoken", () => {
    const raw = "Ephemeral:\nDone.\n\n(thinking, unspoken)\n";
    const { spoken, thinking } = splitUnspokenThinking(raw);
    expect(spoken).toBe("Ephemeral:\nDone.");
    expect(thinking).toBeNull();
  });
  it("the spoken half still parses as turns after the split", () => {
    const raw = "person:admin:\nHi.\n\nEphemeral:\nHi back.\n\n(thinking, unspoken)\nA warm greeting.";
    const { spoken, thinking } = splitUnspokenThinking(raw);
    expect(thinking).toBe("A warm greeting.");
    expect(parseVerbatimTurns(spoken, "Ephemeral")!.map((t) => t.speaker)).toEqual(["person:admin", "Ephemeral"]);
  });
});
