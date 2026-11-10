/**
 * A world-model card revised in the ledger (operator 2026-11-10 23:07, aletheia's ledger at 10:02: ten
 * rows "Belief revised — ex:world_model-… refines/derived_from — world-model revision 49 for
 * topic:diary-entry (evidence changed)", one per link of one revision: "this is not really readable; can
 * we have the name of the world model instead? and clicking on it would open it?"). The envelopes are the
 * served shapes (castor's replay, seqs 104212-104221, 2026-11-10 02:32): the new version's binding (the
 * card fields: card_revision, source_count, target), the closed version's closure (its title, its card
 * fields), then one closure per link of the closed version (kind "memory", title "<graph id> <relation>",
 * the closed version's graph id), all with the same replacement ids.
 */
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { foldLedgerLines, ledgerLine, type LedgerLine } from "./ledger_lines";
import { LedgerLineRow } from "./ledger_panel";
import type { ReplayEnvelope } from "./stream_types";

const OLD = "ex:world_model-7131229f821ab374e83d97b707";
const NEW = "ex:world_model-795321358d7f2b31ec12fbe2cd";
const REASON = "world-model revision 49 for topic:diary-entry (evidence changed)";
const base = (seq: number) => ({ stream: "abstractmemory.replay", stream_version: 1, seq, observed_at: "2026-11-10T02:32:06+00:00", scope: "self", owner_id: "entity:aletheia", trace_id: null, turn_id: null, run_id: null });
const card = { kind: "world_model", digest_method: "authored-card-v1", target: "topic:diary-entry", target_type: "topic" };

const formed = (seq: number, sources: number) =>
  ({
    ...base(seq),
    family: "binding",
    payload: { record_id: NEW, scope: "self", owner_id: "entity:aletheia", search_state: "indexed", prompt_state: "inactive", lifecycle: "inactive_candidate", source: "remember", reason: null, binding_id: `b${seq}`, seq },
    display: { ...card, record_id: NEW, title: "Aletheia's diary entries, read together", graph_id: NEW, card_revision: 49, source_count: sources, edges: [{ relation: "refines", target_graph_id: OLD }] },
  }) as unknown as ReplayEnvelope;
const closed = (seq: number, title: string | null) =>
  ({
    ...base(seq),
    family: "closure",
    payload: { assertion_id: "40ff92ae197202b83ab83c56f59f3282", kind: "supersede", reason: REASON, replacement_ids: [NEW], closure_id: `c${seq}`, seq },
    display: { ...card, record_id: "40ff92ae197202b83ab83c56f59f3282", title, graph_id: OLD, card_revision: 48, source_count: 34, replaced_by: [NEW] },
  }) as unknown as ReplayEnvelope;
const link = (seq: number, relation: string) =>
  ({
    ...base(seq),
    family: "closure",
    payload: { assertion_id: `row-${seq}`, kind: "supersede", reason: REASON, replacement_ids: [NEW], closure_id: `c${seq}`, seq },
    display: { record_id: `row-${seq}`, kind: "memory", title: `${OLD} ${relation}`, token_estimate: 22, graph_id: OLD },
  }) as unknown as ReplayEnvelope;
/** One revision: the new version, the old one closed, its ten links closed with it. */
const revision = (title: string | null = "Aletheia's diary entries, read together", sources = 40) => [
  formed(10, sources),
  closed(11, title),
  ...Array.from({ length: 10 }, (_, i) => link(12 + i, i === 0 ? "refines" : "derived_from")),
];
const rows = (envs: ReplayEnvelope[]): LedgerLine[] => foldLedgerLines(null, envs).lines.map((l) => l.line);
const LEAK = /ex:[a-z_]+-[0-9a-f]|derived_from|refines|topic:|person:|world-model revision/;

describe("a world-model revision is one ledger row, by its title, and it opens the world model", () => {
  it("ten links closed with it: one 'Belief revised' row, never one per link", () => {
    const lines = rows(revision());
    const revised = lines.filter((l) => l.title.startsWith("Belief"));
    expect(revised).toHaveLength(1);
    expect(revised[0].title).toBe("Belief revised — Aletheia's diary entries, read together");
    // The new version's revision, how many memories it is drawn from, and that its evidence changed.
    expect(revised[0].detail).toBe("revision 49 · from 40 memories · evidence changed (34 before)");
    expect(revised[0].seq).toBe(11);
  });

  it("no key, id, relation name or subject key in any row's words", () => {
    for (const l of rows(revision())) expect(`${l.title} ${l.detail}`).not.toMatch(LEAK);
  });

  it("a click opens the new version in Detail", () => {
    const line = rows(revision()).find((l) => l.title.startsWith("Belief"))!;
    expect(line.subject_id).toBe(NEW);
    const onSelectSubject = vi.fn();
    const row = LedgerLineRow({ line, index: 1, own: false, reached: true, current: false, fresh: false, onJump: () => undefined, onSelectSubject }) as React.ReactElement<{ onClick(e: unknown): void }>;
    row.props.onClick({ target: null });
    expect(onSelectSubject).toHaveBeenCalledWith(NEW);
    const html = renderToStaticMarkup(row);
    expect(html).toContain("el_row_open");
    expect(html).toContain('title="Open this memory in Detail"');
  });

  it("the same evidence: no 'evidence changed'; its new version not on the loaded stream: 'a newer version replaced it'", () => {
    expect(rows(revision(undefined, 34)).find((l) => l.title.startsWith("Belief"))!.detail).toBe("revision 49 · from 34 memories");
    const alone = rows(revision().slice(1));
    expect(alone.filter((l) => l.title.startsWith("Belief"))).toHaveLength(1);
    expect(alone[0].detail).toBe("a newer version replaced it");
    expect(alone[0].subject_id).toBe(NEW);
  });

  it("untitled: 'a world model', said loudly once", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const line = ledgerLine(closed(11, null));
    expect(line.title).toBe("Belief revised — a world model");
    ledgerLine(closed(12, null));
    expect(err.mock.calls.filter((c) => String(c[0]).startsWith("#SEAM a world model closed"))).toHaveLength(1);
    err.mockRestore();
  });

  it("the grouping is structural: another record's closure right after keeps its own row; a later closure of the same record in another revision too", () => {
    const other = { ...link(30, "derived_from"), display: { record_id: "row-30", kind: "episode", title: "The north bed", graph_id: "ex:episode-0a1" } } as unknown as ReplayEnvelope;
    const lines = rows([...revision(), other]);
    expect(lines.filter((l) => l.seq === 30)).toHaveLength(1);
    const again = { ...closed(40, "Aletheia's diary entries, read together"), payload: { ...closed(40, "x").payload, replacement_ids: ["ex:world_model-0b2"] } } as unknown as ReplayEnvelope;
    expect(rows([...revision(), again]).filter((l) => l.title.startsWith("Belief"))).toHaveLength(2);
  });
});
