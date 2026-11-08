/**
 * A memory's stored understanding, read from the record read and said in
 * end-user words (understanding.ts): who wrote it (from authored_by and
 * digest_method, never the text), as of when, why; null = "not computed
 * yet"; a missing key = a gateway that does not serve it.
 */
import { describe, expect, it } from "vitest";

import {
  asOfWords,
  authorWords,
  causeWords,
  earlierVersions,
  MECHANICAL_WORDS,
  provenanceLine,
  provenanceWords,
  readUnderstanding,
  servedDigest,
  versionHead,
} from "./understanding";
import READS from "./fixtures/understanding_record_reads.json";

const { SERVED, SERVED_CARD, NULLS, OLD_GATEWAY } = READS as unknown as Record<"SERVED" | "SERVED_CARD" | "NULLS" | "OLD_GATEWAY", Record<string, unknown> & { versions: Array<Record<string, unknown>> }>;

const UTC = "UTC";

/** The contract, spelled out (abstractgateway entity_understanding.py
 * UNDERSTANDING_KEYS at 1b3832b7, plus the record read's `versions`) —
 * never imported from the module under test, so dropping a key there goes
 * red here. */
const CONTRACT = [
  "digest", "digest_method", "digest_version", "version_count", "authored_by", "reader", "understood_at", "cause",
  "target", "target_type", "card_revision", "source_count", "narrated", "narration_version", "replaced_by", "versions",
];

describe("who wrote it, in his words", () => {
  it("names each author kind the gateway serves", () => {
    expect(authorWords({ kind: "entity-mind", id: "nerin" }, "authored-v1", { provider: "openai", model: "gpt-5.6-terra" })).toBe("his own words");
    expect(authorWords({ kind: "capability-model", id: "summaries" }, "authored-v1", { provider: "theforge-nvidia", model: "qwen/qwen3.8-27b" })).toBe(
      "a passive memory process, part of him (qwen/qwen3.8-27b)",
    );
    expect(authorWords({ kind: "operator", id: "laurent" }, "operator-v1", null)).toBe("set by the operator");
    expect(authorWords({ kind: "mechanical", id: "mechanical-v2" }, "mechanical-v2", null)).toBe(MECHANICAL_WORDS);
    expect(MECHANICAL_WORDS).toBe("mechanical — a placeholder until he understands it");
  });

  it("reads a mechanical-* method as mechanical even when the author was not recorded", () => {
    expect(authorWords({ kind: "unrecorded", id: "mechanical-flow-v1" }, "mechanical-flow-v1", null)).toBe(MECHANICAL_WORDS);
    expect(authorWords({ kind: "unrecorded", id: "" }, "entity-authored", null)).toBe("who wrote it was not recorded");
  });

  it("says what is not computed yet instead of guessing", () => {
    expect(authorWords(null, null, null)).toBe("who wrote it: not computed yet");
    expect(authorWords({ kind: "capability-model", id: null }, "authored-v1", null)).toBe("a passive memory process, part of him (model not computed yet)");
  });
});

describe("as of when, and why", () => {
  it("dates the reading and names its cause in plain words", () => {
    expect(asOfWords("2026-11-08T12:00:00+00:00", UTC)).toBe("understood as of 8 Nov 2026");
    expect(asOfWords(null)).toBe("understood as of: not computed yet");
    expect(asOfWords("")).toBe("understood as of: not computed yet");
    expect(causeWords("formation")).toBe("first formed");
    expect(causeWords("evidence")).toBe("rewritten after new evidence");
    expect(causeWords("ripple")).toBe("revisited after a surprise");
    expect(causeWords("backfill")).toBe("backfilled — an older memory, understood again");
    expect(causeWords("operator")).toBe("changed by the operator");
    expect(causeWords("revert")).toBe("restored from an earlier understanding");
    expect(causeWords(null)).toBe("why: not computed yet");
  });

  it("composes the provenance line from {authored_by, digest_method, cause, understood_at}", () => {
    const u = readUnderstanding(SERVED, "summary");
    if (!u.served) throw new Error("fixture must be served");
    expect(provenanceLine(provenanceWords(u.understanding, UTC))).toBe(
      "A passive memory process, part of him (qwen/qwen3.8-27b) · understood as of 8 Nov 2026 · rewritten after new evidence",
    );
    expect(provenanceLine(provenanceWords({ authored_by: null, digest_method: null, cause: null, understood_at: null, reader: null }))).toBe(
      "Who wrote it: not computed yet · understood as of: not computed yet · why: not computed yet",
    );
    expect(provenanceLine(provenanceWords({ authored_by: { kind: "entity-mind", id: "nerin" }, digest_method: "authored-v1", cause: "formation", understood_at: "2026-11-07T12:00:00Z", reader: null }, UTC))).toBe(
      "His own words · understood as of 7 Nov 2026 · first formed",
    );
  });
});

describe("reading the record read", () => {
  it("serves every field, with the versions as the journal keeps them", () => {
    const u = readUnderstanding(SERVED, "summary");
    expect(u.served).toBe(true);
    if (!u.served) return;
    expect(servedDigest(u.understanding)).toBe("He closed the day on the **survey** and kept the open question for tomorrow.");
    expect(u.understanding.authored_by).toEqual({ kind: "capability-model", id: "summaries" });
    expect(u.understanding.versions).toHaveLength(3);
    expect(u.understanding.versions![0].cause).toBe("formation");
    expect(u.understanding.versions![0].reader).toBeNull();
  });

  it("reads null as not computed yet, never as missing", () => {
    const u = readUnderstanding(NULLS, "summary");
    expect(u.served).toBe(true);
    if (!u.served) return;
    expect(u.understanding.digest).toBeNull();
    expect(u.understanding.versions).toBeNull();
    expect(earlierVersions(u.understanding)).toBeNull();
  });

  it("names every key an older gateway lacks", () => {
    expect(readUnderstanding(OLD_GATEWAY, "summary")).toEqual({ served: false, missing: CONTRACT });
    for (const key of CONTRACT) {
      const body: Record<string, unknown> = { ...SERVED };
      delete body[key];
      expect(readUnderstanding(body, "summary"), key).toEqual({ served: false, missing: [key] });
    }
  });

  it("a card's read carries its type", () => {
    const u = readUnderstanding(SERVED_CARD, "world_model");
    expect(u.served && u.understanding.target_type).toBe("person");
  });

  it("refuses a value of the wrong shape out loud (named, never shown as a guess)", () => {
    expect(readUnderstanding({ ...SERVED, authored_by: "summaries" }, "summary")).toEqual({ served: false, missing: ["authored_by"] });
    expect(readUnderstanding({ ...SERVED, digest_version: "2" }, "summary")).toEqual({ served: false, missing: ["digest_version"] });
    const versions = [{ ...SERVED.versions[0] } as Record<string, unknown>];
    delete versions[0].author;
    expect(readUnderstanding({ ...SERVED, versions }, "summary")).toEqual({ served: false, missing: ["versions[0].author"] });
    const unmarked = [{ ...SERVED.versions[0] } as Record<string, unknown>];
    delete unmarked[0].current;
    expect(readUnderstanding({ ...SERVED, versions: unmarked }, "summary")).toEqual({ served: false, missing: ["versions[0].current"] });
  });
});

describe("earlier understandings", () => {
  it("lists every reading but the current one (memory's `current`), newest first", () => {
    const u = readUnderstanding(SERVED, "summary");
    if (!u.served) throw new Error("fixture must be served");
    const rows = earlierVersions(u.understanding)!;
    expect(rows.map((v) => v.version)).toEqual([1, 0]);
    expect(versionHead(rows[0], UTC)).toBe("7 Nov 2026 · a passive memory process, part of him (qwen/qwen3.8-27b) · backfilled — an older memory, understood again");
    expect(versionHead(rows[1], UTC)).toBe("6 Nov 2026 · mechanical — a placeholder until he understands it · first formed");
  });

  it("is empty for a record never rewritten", () => {
    expect(earlierVersions({ versions: [] })).toEqual([]);
  });
});
