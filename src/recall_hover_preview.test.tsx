/**
 * Hover preview (operator live test 2026-11-09): resting the mouse on the
 * ledger's "He holds these in mind" line (or its recall line) lights that
 * recall's memories in the graph and dims the rest, exactly as its click
 * does; leaving the line restores what was lit. The state mapping is pure
 * and built on the real fold; the row is rendered with react-dom/server
 * and its handlers called as the element's own (the package ships no DOM
 * for tests); the wiring is pinned on the source.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { LedgerLineRow, type LedgerLineRowProps } from "./ledger_panel";
import { ledgerLine, lineTarget } from "./ledger_lines";
import { canvasRecall, canvasSelection, emphasisDriver, recallHoverHandlers, recallPreviewOf, resolveSelection } from "./recall_emphasis";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";

function env(seq: number, family: ReplayEnvelope["family"], payload: Record<string, unknown>, extra: Partial<ReplayEnvelope> = {}): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family,
    observed_at: "2026-11-09T19:00:00+00:00",
    scope: "life",
    owner_id: "entity:castor",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload,
    ...extra,
  } as ReplayEnvelope;
}

const binding = (seq: number, id: string, kind: string, title = id) =>
  env(seq, "binding", { record_id: id, scope: "life", owner_id: "entity:castor", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq }, { display: { record_id: id, kind, title } as ReplayEnvelope["display"] });

const trace = (seq: number, traceId: string, selected: string[]) =>
  env(
    seq,
    "trace",
    { trace_id: traceId, trace_kind: "reconstruct", need: { cue_text: "who are you?", turn_id: "t-1" }, searched_scopes: [], channels: [], candidates: [], selected, dropped: [], cues: [], stop_reason: "budget", warnings: [], admissions: Object.fromEntries(selected.map((id) => [id, "stimulus"])), seq },
    { trace_id: traceId },
  );

const snapshot = (seq: number, traceId: string, used: string[]) =>
  env(seq, "snapshot", { snapshot_id: `s${seq}`, trace_id: traceId, used_record_ids: used, display: [], prompt_token_estimate: 1200, seq }, { trace_id: traceId });

/** Two recalls; the reader clicked a memory (Detail shows it) and the graph shows the newest recall. */
function life(): ReplayEnvelope[] {
  return [
    binding(1, "ex:memory-a", "memory", "the first entity"),
    binding(2, "ex:memory-b", "memory", "the blue door"),
    binding(3, "ex:memory-c", "memory", "the media server"),
    binding(4, "ex:memory-d", "memory", "never recalled"),
    trace(10, "tr1", ["ex:memory-a", "ex:memory-b"]),
    snapshot(11, "tr1", ["ex:memory-a", "ex:memory-b"]),
    trace(20, "tr2", ["ex:memory-c"]),
    snapshot(21, "tr2", ["ex:memory-c"]),
  ];
}

/** What drives the canvas for a selection (graph_canvas: a node in the layout is a focus). */
function canvasLights(fold: ReturnType<typeof foldEnvelopes>, selection: string | null) {
  const row = resolveSelection(fold, selection);
  const recall = canvasRecall(fold, 99, selection, true);
  const driver = emphasisDriver({ filter: false, hover: false, selected: row !== null && fold.nodes.has(row), recall: recall !== null });
  return { driver, lit: driver === "recall" ? [...recall!.ids].sort() : driver === "focus" ? [row] : [] };
}

describe("the state mapping (DOM-free)", () => {
  const held = ledgerLine(snapshot(11, "tr1", ["ex:memory-a", "ex:memory-b"]));

  it("'He holds these in mind' previews its recall: the click's own target", () => {
    expect(held.title).toBe("He holds these in mind");
    expect(lineTarget(held)).toBe("beat:tr1");
    expect(recallPreviewOf(lineTarget(held))).toBe("beat:tr1");
    // The recall line of the same turn previews the same recall.
    expect(recallPreviewOf(lineTarget(ledgerLine(trace(10, "tr1", ["ex:memory-a"]))))).toBe("beat:tr1");
  });

  it("a line about a memory, a diary entry or nothing previews nothing", () => {
    expect(recallPreviewOf("ex:memory-a")).toBeNull();
    expect(recallPreviewOf("ex:diary-86444591ec14d1d97")).toBeNull();
    expect(recallPreviewOf(null)).toBeNull();
  });

  it("hovering lights exactly that recall's memories (the rest dims), over a clicked memory and over the newest recall", () => {
    const fold = foldEnvelopes(life());
    // Before: a memory is clicked (Detail shows it) — the canvas focuses it.
    expect(canvasLights(fold, canvasSelection("ex:memory-d", null))).toEqual({ driver: "focus", lit: ["ex:memory-d"] });
    // Hover tr1's "He holds these in mind": tr1's shelf drives the canvas, as its click would.
    const hovered = canvasLights(fold, canvasSelection("ex:memory-d", recallPreviewOf(lineTarget(held))));
    expect(hovered).toEqual({ driver: "recall", lit: ["ex:memory-a", "ex:memory-b"] });
    expect(hovered).toEqual(canvasLights(fold, "beat:tr1"));
    // Leaving restores the click's selection.
    expect(canvasLights(fold, canvasSelection("ex:memory-d", null))).toEqual({ driver: "focus", lit: ["ex:memory-d"] });
    // With nothing clicked the graph shows the newest recall (tr2); the hover shows tr1, leaving tr2 again.
    expect(canvasLights(fold, canvasSelection(null, null)).lit).toEqual(["ex:memory-c"]);
    expect(canvasLights(fold, canvasSelection(null, "beat:tr1")).lit).toEqual(["ex:memory-a", "ex:memory-b"]);
    expect(canvasLights(fold, canvasSelection(null, null)).lit).toEqual(["ex:memory-c"]);
  });

  it("mouse only: entering previews, leaving clears; touch keeps tap = select; another line clears an earlier preview", () => {
    const onPreview = vi.fn();
    const h = recallHoverHandlers("beat:tr1", onPreview);
    h.onPointerEnter!({ pointerType: "touch" });
    h.onPointerEnter!({ pointerType: "pen" });
    expect(onPreview).not.toHaveBeenCalled();
    h.onPointerEnter!({ pointerType: "mouse" });
    expect(onPreview).toHaveBeenLastCalledWith("beat:tr1");
    h.onPointerLeave!({ pointerType: "mouse" });
    expect(onPreview).toHaveBeenLastCalledWith(null);
    recallHoverHandlers("ex:memory-a", onPreview).onPointerEnter!({ pointerType: "mouse" });
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(recallHoverHandlers("beat:tr1", undefined)).toEqual({});
  });
});

describe("the ledger row (component)", () => {
  type AnyElement = React.ReactElement<Record<string, unknown>>;
  const props = (over: Partial<LedgerLineRowProps> = {}): LedgerLineRowProps => ({
    line: ledgerLine(snapshot(11, "tr1", ["ex:memory-a", "ex:memory-b"])),
    index: 5,
    own: false,
    reached: true,
    current: false,
    fresh: false,
    onJump: () => undefined,
    onSelectSubject: () => undefined,
    ...over,
  });

  it("the mouse on 'He holds these in mind' previews its recall, leaving clears it; its click still selects it", () => {
    const onPreviewRecall = vi.fn();
    const onSelectSubject = vi.fn();
    const row = LedgerLineRow(props({ onPreviewRecall, onSelectSubject })) as AnyElement;
    const on = row.props as { onPointerEnter(e: unknown): void; onPointerLeave(e: unknown): void; onClick(e: unknown): void };
    on.onPointerEnter({ pointerType: "mouse" });
    expect(onPreviewRecall).toHaveBeenLastCalledWith("beat:tr1");
    on.onPointerLeave({ pointerType: "mouse" });
    expect(onPreviewRecall).toHaveBeenLastCalledWith(null);
    on.onPointerEnter({ pointerType: "touch" });
    expect(onPreviewRecall).toHaveBeenCalledTimes(2);
    on.onClick({ target: null });
    expect(onSelectSubject).toHaveBeenCalledWith("beat:tr1");
    const html = renderToStaticMarkup(row);
    expect(html).toContain("He holds these in mind");
    expect(html).toContain('title="Open what came to mind at this moment"');
  });

  it("a memory line under the mouse clears an earlier preview, and selects its memory on a click", () => {
    const onPreviewRecall = vi.fn();
    const line = ledgerLine(env(30, "event", { kind: "listed", record_id: "ex:memory-a" }));
    expect(lineTarget(line)).toBe("ex:memory-a");
    const row = LedgerLineRow(props({ line, onPreviewRecall })) as AnyElement;
    (row.props as { onPointerEnter(e: unknown): void }).onPointerEnter({ pointerType: "mouse" });
    expect(onPreviewRecall).toHaveBeenLastCalledWith(null);
  });

  it("without a preview sink the row carries no pointer handlers", () => {
    const row = LedgerLineRow(props()) as AnyElement;
    expect(row.props.onPointerEnter).toBeUndefined();
    expect(row.props.onPointerLeave).toBeUndefined();
  });
});

describe("wiring: the canvas lights the preview through the click path; Detail keeps the click", () => {
  const view = fs.readFileSync(path.join(__dirname, "entity_view.tsx"), "utf8");
  const panel = fs.readFileSync(path.join(__dirname, "ledger_panel.tsx"), "utf8");

  it("the page feeds the ledger's preview to the canvas's selection, never to Detail's", () => {
    expect(view).toContain("selectedId={canvasSelection(selectedId, recallPreview)}");
    expect(view).toContain("onPreviewRecall={setRecallPreview}");
    expect(view.match(/setRecallPreview\(/g)?.length).toBe(2); // the two source resets only
    expect(view).not.toMatch(/<Inspector[^>]*recallPreview/);
  });

  it("every ledger row and the list itself clear the preview the mouse leaves", () => {
    expect(panel).toContain("{...recallHoverHandlers(target, props.onPreviewRecall)}");
    expect(panel.match(/\{\.\.\.recallHoverHandlers\(null, props\.onPreviewRecall\)\}/g)).toHaveLength(2);
    expect(panel).toContain("onPointerLeave={() => onPreviewRecall?.(null)}");
  });
});
