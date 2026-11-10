/**
 * The step's tools in the ledger (operator 2026-11-10 22:02, Entity backlog 0035: "how many [tools] did
 * it use at a step, how many files did it read or write … with button icons … those icons only appear if
 * there was > 0 tool, file read or file written"). The gateway (root backlog 1204) emits one host marker
 * per finished step that called tools, {kind: "step_tools", run_id, turn_id, tools, tool_count,
 * files_read, files_written}, after the step's rows; the ledger puts its counts on the one row that
 * stands for the step (its tick, or its first shown row). The fixture is a step of his own time as the
 * stream carries it (run-stamped envelopes of an `owntime-` run, turn t-0003), then its marker.
 */
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { foldLedgerLines, ledgerLine, stepToolsWords, type LedgerLine } from "./ledger_lines";
import { LedgerLineRow, StepToolsGroup } from "./ledger_panel";
import { foldEnvelopes, stepKey } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";

const RUN = "owntime-castor-2026-11-10";
const at = "2026-11-10T03:00:00+00:00";
const env = (seq: number, family: ReplayEnvelope["family"], payload: Record<string, unknown>, display: Record<string, unknown> = {}, turn: string | null = "t-0003", run: string | null = RUN): ReplayEnvelope =>
  ({ stream: "abstractmemory.replay", stream_version: 1, seq, family, observed_at: at, scope: "self", owner_id: "entity:castor", trace_id: null, turn_id: turn, run_id: run, payload, display }) as unknown as ReplayEnvelope;
const lived = (seq: number, turn = "t-0003") =>
  env(seq, "binding", { record_id: `ex:episode-${seq}`, scope: "self", owner_id: "entity:castor", search_state: "indexed", prompt_state: "inactive", lifecycle: "formed", source: "remember", reason: null, binding_id: `b${seq}`, seq }, { record_id: `ex:episode-${seq}`, kind: "episode", title: "Reading his notes again", graph_id: `ex:episode-${seq}` }, turn);
const marker = (seq: number, counts: Record<string, unknown>, turn = "t-0003", run = RUN) =>
  env(seq, "host", { kind: "step_tools", session_id: null, run_id: run, turn_id: turn, tools: ["read_file", "write_file"], ...counts }, {}, null, null);
const lines = (envs: ReplayEnvelope[]): LedgerLine[] => foldLedgerLines(null, envs).lines.map((l) => l.line);
const html = (line: LedgerLine) => renderToStaticMarkup(LedgerLineRow({ line, index: 0, own: true, reached: true, current: false, fresh: false, onJump: () => undefined, onSelectSubject: () => undefined }) as React.ReactElement);

describe("a step's tools on the row that stands for it", () => {
  const step = [lived(10), lived(11), marker(12, { tool_count: 12, files_read: 3, files_written: 1 })];

  it("the counts land on the step's tick, once; the marker is no row of its own", () => {
    const ls = lines(step);
    const tick = ls.find((l) => l.title === "— tick 3 —")!;
    expect(tick.tools).toEqual({ tools: 12, filesRead: 3, filesWritten: 1 });
    expect(ls.filter((l) => l.tools)).toHaveLength(1);
    expect(ls.some((l) => /step_tools|Tools used in a step|Host:/.test(l.title))).toBe(false);
    // Read alone (a caller without the fold), the marker is an audit line, never "Host: step_tools".
    expect(ledgerLine(marker(12, { tool_count: 12, files_read: 3, files_written: 1 }))).toMatchObject({ title: "Tools used in a step", tone: "quiet" });
  });

  it("the row reads ⚙ 12 · 📄 3 · ✎ 1 in the meta colour, the words on hover and for a screen reader", () => {
    const out = html(lines(step).find((l) => l.tools)!);
    expect(out).toContain('class="el_detail el_tools" role="img" aria-label="12 tools used · 3 files read · 1 file written" title="12 tools used · 3 files read · 1 file written"');
    expect(out.match(/<svg/g)?.length).toBe(3);
    expect(out).toMatch(/>12<\/span>[\s\S]*>3<\/span>[\s\S]*>1<\/span>/);
  });

  it("each part only above 0; all at 0, nothing at all (never a '0')", () => {
    expect(stepToolsWords({ tools: 2, filesRead: 0, filesWritten: 0 })).toBe("2 tools used");
    expect(stepToolsWords({ tools: 1, filesRead: 1, filesWritten: 0 })).toBe("1 tool used · 1 file read");
    const one = renderToStaticMarkup(<StepToolsGroup tools={{ tools: 2, filesRead: 0, filesWritten: 0 }} />);
    expect(one.match(/<svg/g)?.length).toBe(1);
    expect(one).not.toMatch(/>0</);
    expect(renderToStaticMarkup(<StepToolsGroup tools={{ tools: 0, filesRead: 0, filesWritten: 0 }} />)).toBe("");
    const zero = lines([lived(10), marker(11, { tool_count: 0, files_read: 0, files_written: 0 })]).find((l) => l.tools)!;
    expect(html(zero)).not.toContain("el_tools");
    // A step whose marker never came: nothing.
    expect(html(lines([lived(10)]).find((l) => l.title === "— tick 3 —")!)).not.toContain("el_tools");
  });

  it("joins by run and turn: the same turn in another run is another step", () => {
    const ls = lines([lived(10), lived(20, "t-0004"), marker(21, { tool_count: 5, files_read: 0, files_written: 2 }, "t-0004")]);
    expect(ls.find((l) => l.title === "— tick 4 —")!.tools).toEqual({ tools: 5, filesRead: 0, filesWritten: 2 });
    expect(ls.find((l) => l.title === "— tick 3 —")!.tools).toBeUndefined();
  });

  it("a marker for a step the ledger has no row for, or without its counts, says so loudly once", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    lines([lived(10), marker(11, { tool_count: 3, files_read: 0, files_written: 0 }, "t-0099")]);
    lines([lived(10), marker(11, { tool_count: 3, files_read: 0, files_written: 0 }, "t-0098")]);
    expect(err.mock.calls.filter((c) => String(c[0]).startsWith("#SEAM a step_tools marker at seq 11 names a step"))).toHaveLength(1);
    lines([lived(10), marker(11, { files_read: 1 })]);
    expect(err.mock.calls.filter((c) => String(c[0]).includes("lacks its step"))).toHaveLength(1);
    err.mockRestore();
  });

  it("the graph's fold keeps each step's tools by run and turn", () => {
    const fold = foldEnvelopes(step);
    expect(fold.step_tools.get(stepKey(RUN, "t-0003"))).toEqual({ runId: RUN, turnId: "t-0003", tools: 12, filesRead: 3, filesWritten: 1 });
  });
});
