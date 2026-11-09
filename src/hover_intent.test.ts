/**
 * Hover intent (operator 2026-11-09): a memory's card and highlight, and a lit line's words, wait
 * 150 ms of the pointer RESTING on it; a sweep across the graph shows nothing; leaving before then
 * cancels; a click never waits. The rest timer is pure (hover_intent.ts); the canvas wiring is
 * pinned on its source.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HOVER_INTENT_MS, hoverIntent } from "./hover_intent";

describe("hoverIntent", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const timers = { set: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number, clear: (id: number) => clearTimeout(id) };

  it("shows only after 150 ms resting on the same thing", () => {
    const shown: string[] = [];
    const intent = hoverIntent((t) => shown.push(t), HOVER_INTENT_MS, timers);
    expect(HOVER_INTENT_MS).toBe(150);
    intent.over("n:a");
    vi.advanceTimersByTime(149);
    expect(shown).toEqual([]);
    // Moving inside the same memory is still resting on it: the timer keeps running.
    intent.over("n:a");
    vi.advanceTimersByTime(1);
    expect(shown).toEqual(["n:a"]);
    expect(intent.pending()).toBeNull();
  });

  it("a sweep across memories shows nothing; only the one it stops on shows", () => {
    const shown: string[] = [];
    const intent = hoverIntent((t) => shown.push(t), HOVER_INTENT_MS, timers);
    for (const id of ["n:a", "n:b", "n:c", "n:d"]) {
      intent.over(id);
      vi.advanceTimersByTime(100);
    }
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(50);
    expect(shown).toEqual(["n:d"]);
  });

  it("leaving before 150 ms cancels: over nothing, cancel(), or another target", () => {
    const shown: string[] = [];
    const intent = hoverIntent((t) => shown.push(t), HOVER_INTENT_MS, timers);
    intent.over("n:a");
    vi.advanceTimersByTime(120);
    intent.over(null);
    vi.advanceTimersByTime(500);
    intent.over("l:a|b");
    vi.advanceTimersByTime(120);
    intent.cancel();
    vi.advanceTimersByTime(500);
    expect(shown).toEqual([]);
    expect(intent.pending()).toBeNull();
    // Back on the same one after leaving starts a fresh rest.
    intent.over("n:a");
    vi.advanceTimersByTime(149);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual(["n:a"]);
  });
});

describe("the canvas waits for the rest (wiring)", () => {
  const canvas = readFileSync(resolve(__dirname, "graph_canvas.tsx"), "utf8");
  const hover = canvas.slice(canvas.indexOf("const onCanvasHover = "), canvas.indexOf("const onCanvasLeave = "));

  it("a memory's card and highlight are set only when its rest completes, never on the move", () => {
    expect(canvas).toContain("const intent = hoverIntent((target) => {");
    const rest = canvas.slice(canvas.indexOf("const intent = hoverIntent((target) => {"), canvas.indexOf("/** The lit line under the pointer"));
    expect(rest).toContain("hoverRef.current = id;");
    expect(rest).toContain('cardCtl.set({ kind: "node", id, x: pointAt.x, y: pointAt.y, pinned: false });');
    expect(rest).toContain("if (dragRef.current || cardRef.current?.pinned) return;");
    // The move never sets the hovered memory, nor a memory's card.
    expect(hover).toContain("intent.over(`n:${hit}`);");
    expect(hover).not.toMatch(/hoverRef\.current = hit/);
    expect(hover).not.toContain('kind: "node"');
  });

  it("leaving the canvas or pressing cancels a pending rest; a click is never delayed", () => {
    const leave = canvas.slice(canvas.indexOf("const onCanvasLeave = "), canvas.indexOf("const onKey = "));
    expect(leave).toContain("intent.cancel();");
    const down = canvas.slice(canvas.indexOf("const onDown = "), canvas.indexOf("// Drag pans ride the WINDOW"));
    expect(down).toContain("intent.cancel();");
    const up = canvas.slice(canvas.indexOf("const onUp = "), canvas.indexOf('canvas.addEventListener("wheel"'));
    expect(up).not.toContain("intent");
    expect(up).toContain("onSelectRef.current(hitTest(ev.clientX, ev.clientY));");
    expect(up).toContain('cardCtl.set({ kind: "node", id: hit, x: ev.clientX, y: ev.clientY, pinned: true });');
  });
});
