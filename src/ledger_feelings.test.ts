/**
 * What a feeling is about, in the ledger (operator 2026-11-10, round 5: "Felt +2 about ex:summary-…",
 * "Felt +1 about concept:lineage" are not readable). A record by its title (its binding's when the
 * valence's own block has none), "a <kind> (title being written…)" while its title is pending, else "a
 * memory" with one #SEAM log; a key by its last part in words. The shapes are castor's (valence seq 148:
 * a feeling about a summary whose title is pending; seq 48880: about tool:web_search; person:admin).
 */
import { describe, expect, it, vi } from "vitest";

import { foldLedgerLines, ledgerLine, type LedgerLine } from "./ledger_lines";
import type { ReplayEnvelope } from "./stream_types";

const base = (seq: number) => ({ stream: "abstractmemory.replay", stream_version: 1, seq, observed_at: "2026-07-07T06:39:48+00:00", scope: "life", owner_id: "entity:castor", trace_id: null, turn_id: "t-reflect", run_id: "chat-firststeps-4" });
const felt = (seq: number, target: string, display?: Record<string, unknown>): ReplayEnvelope =>
  ({
    ...base(seq),
    family: "valence",
    payload: { target_id: target, sign: 1, magnitude: 2.0, kind: "appraisal", value_refs: [], scope: "life", owner_id: "entity:castor", reason: "The session felt honest and vulnerable.", actor: "entity-reflection", trace_id: null, provenance: { run_id: "chat-firststeps-4", turn_id: "t-reflect" }, event_id: `e${seq}`, seq },
    ...(display ? { display } : {}),
  }) as unknown as ReplayEnvelope;
const formed = (seq: number, id: string, kind: string, title: string | null, pending = false): ReplayEnvelope =>
  ({
    ...base(seq),
    family: "binding",
    payload: { record_id: id, scope: "life", owner_id: "entity:castor", search_state: "indexed", prompt_state: "inactive", lifecycle: "formed", source: "remember", reason: null, binding_id: `b${seq}`, seq },
    display: { record_id: id, kind, title, graph_id: id, ...(pending ? { pending: { title: true, summary: true } } : {}) },
  }) as unknown as ReplayEnvelope;
const SUMMARY = "ex:summary-37a58bb62ffdfd5f0ec0609ca1";
const LEAK = /ex:[a-z_]+-[0-9a-f]|concept:|tool:|person:/;
const titles = (envs: ReplayEnvelope[]): string[] => foldLedgerLines(null, envs).lines.map((l) => l.line.title);
const feeling = (envs: ReplayEnvelope[]): LedgerLine => foldLedgerLines(null, envs).lines.map((l) => l.line).find((l) => l.title.startsWith("Felt"))!;

describe("a feeling names what it is about in words, never an id", () => {
  it("a record by its title (its binding's, when the feeling's own block names none); a click opens it", () => {
    const line = feeling([formed(146, SUMMARY, "summary", "The session that felt honest"), felt(148, SUMMARY, { record_id: SUMMARY, kind: "summary", graph_id: SUMMARY })]);
    expect(line.title).toBe("Felt +2 about The session that felt honest");
    expect(line.subject_id).toBe(SUMMARY);
  });

  it("its title still being written (castor's seq 148): 'a summary (title being written…)'", () => {
    const line = feeling([formed(146, SUMMARY, "summary", null, true), felt(148, SUMMARY, { record_id: SUMMARY, kind: "summary", title: null, graph_id: SUMMARY, pending: { title: true, summary: true } })]);
    expect(line.title).toBe("Felt +2 about a summary (title being written…)");
  });

  it("a key by its last part in words: concept:lineage, concept:self_inquiry, tool:web_search, person:admin", () => {
    expect(ledgerLine(felt(1, "concept:lineage")).title).toBe("Felt +2 about lineage");
    expect(ledgerLine(felt(2, "concept:self_inquiry")).title).toBe("Felt +2 about self inquiry");
    expect(ledgerLine(felt(3, "tool:web_search")).title).toBe("Felt +2 about web search");
    expect(ledgerLine(felt(4, "person:admin")).title).toBe("Felt +2 about admin");
  });

  it("a record the ledger has no title for: 'a memory', said loudly once", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(ledgerLine(felt(5, "ex:episode-0a1")).title).toBe("Felt +2 about a memory");
    ledgerLine(felt(6, "ex:episode-0a2"));
    expect(err.mock.calls.filter((c) => String(c[0]).startsWith("#SEAM a feeling at seq"))).toHaveLength(1);
    err.mockRestore();
  });

  it("no id or key in any of these rows", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const all = titles([
      formed(146, SUMMARY, "summary", "The session that felt honest"),
      felt(148, SUMMARY, { record_id: SUMMARY, kind: "summary", graph_id: SUMMARY }),
      felt(149, "concept:lineage"),
      felt(150, "tool:web_search"),
      felt(151, "ex:episode-0a3"),
    ]);
    for (const t of all) expect(t).not.toMatch(LEAK);
    err.mockRestore();
  });
});
