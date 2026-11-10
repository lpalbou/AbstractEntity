/**
 * The World tab's intro (operator 2026-11-10, backlog 0031: "this is the world model, how the entity
 * represents and sees the world. 2 lines top, better explain"): the tab says what it is in plain
 * words, short enough for two lines at the docked tab's width, and the counts line stays as it was.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WORLD_INTRO, WorldPanel } from "./lessons_world_panels";
import type { FoldState, NodeState } from "./stream_fold";

function node(id: string, title: string, extra: Partial<NodeState> = {}): NodeState {
  return { id, kind: "world_model", title, born_at: "2026-11-07T10:00:00Z", first_seq: 1, selected_count: 0, bookkeeping: false, closed: null, redacted: false, graph_id: id, ...extra } as unknown as NodeState;
}
const foldOf = (nodes: NodeState[]) =>
  ({ nodes: new Map(nodes.map((n) => [n.id, n])), structural_edges: new Map(), graph_to_row: new Map() }) as unknown as FoldState;

/** The framing block's text, as rendered. */
const framing = (html: string) => {
  const m = html.match(/<div class="lw_framing wl_p">([\s\S]*?)<\/div><\/div>/);
  if (!m) throw new Error("no framing block");
  return m[1].replace(/<[^>]+>/g, "");
};

describe("World tab intro (0031)", () => {
  const cards = foldOf([
    node("w1", "Ada keeps the archive", { target: "person:ada" } as Partial<NodeState>),
    node("w2", "The harbour at dawn", { target: "place:harbour" } as Partial<NodeState>),
    node("w3", "Ada kept the archive", { target: "person:ada", closed: { kind: "superseded", reason: "revised" } } as unknown as Partial<NodeState>),
  ]);

  it("says what the tab is: his world model, how he represents and sees the world, one card per thing", () => {
    const text = framing(renderToStaticMarkup(<WorldPanel fold={cards} onSelect={() => undefined} />));
    expect(text).toBe(WORLD_INTRO);
    expect(text).toContain("His world model");
    expect(text).toContain("how he represents and sees the world");
    expect(text).toContain("One card per thing he understands");
  });

  it("fits two lines at the tab's width: no longer than the 89 characters measured to take two", () => {
    expect(WORLD_INTRO.length).toBeLessThanOrEqual(89);
  });

  it("keeps the counts line as it was, with cards and with none", () => {
    expect(renderToStaticMarkup(<WorldPanel fold={cards} onSelect={() => undefined} />)).toContain(
      '<span class="lw_sub">his orientation cards — 2 live · 1 superseded</span>',
    );
    const empty = renderToStaticMarkup(<WorldPanel fold={foldOf([])} onSelect={() => undefined} />);
    expect(empty).toContain('<span class="lw_sub">his orientation cards — none yet</span>');
    expect(framing(empty)).toBe(WORLD_INTRO);
  });
});
