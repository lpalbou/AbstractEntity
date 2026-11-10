/**
 * The graph's topics wiring, pinned on the source (the canvas draws in a
 * RAF loop; the package ships no DOM for tests). The pure parts are tested
 * in communities / topic_layout / topic_map / topics_panel; these pins hold
 * the canvas to them:
 * - served, the BASE placement is the served one: every memory on its seat,
 *   no force layout (tickForces never runs), nothing persisted over it;
 * - a new version re-seats with a short transition, the viewer's drag moves
 *   circles through dragCircle (repel only), the title is the served one;
 * - the live marker reaches the graph; no keyword label, no v1 field, is
 *   read anywhere the topics are drawn (design I9).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), "utf8");
const CANVAS = read("graph_canvas.tsx");
const VIEW = read("entity_view.tsx");

describe("served: the base placement is the served layout", () => {
  it("every memory sits on its served seat (or the waiting ring), before any lane or anchor", () => {
    expect(CANVAS).toContain("const target = seated.targetOf.get(node.id) ?? { x: 0, y: 0 };");
    expect(CANVAS).toMatch(/seatAt\(ln, target\);\n\s+continue;/);
  });

  it("no force layout runs while topics are served, and nothing is saved over the served seats", () => {
    expect(CANVAS.match(/tickForces\(/g)).toHaveLength(1);
    expect(CANVAS).toContain("if (!seated && !sim.frozen && !holdForTopics && sim.alpha > 0.02) {");
    expect(CANVAS).toContain("if (liveLayoutKey && !seated && sim.alpha <= 0.02");
  });

  it("a new version re-seats with a short transition from where every memory is", () => {
    expect(CANVAS).toContain("const RESEAT_MS = 450;");
    expect(CANVAS).toContain("reseatRef.current = { start: performance.now(), from };");
    expect(CANVAS).toContain("ln.x = from ? from.x + (target.x - from.x) * ease : target.x;");
  });

  it("the viewer drags a circle by its title: dragCircle (repel only), remembered by key", () => {
    expect(CANVAS).toContain("offsetsRef.current = dragCircle(servedNow, offsetsRef.current, drag.circle, dx / cam.zoom, dy / cam.zoom);");
    expect(CANVAS).toContain("localStorage.setItem(topicOffsetsStorageKey(key), serializeOffsets(offsetsRef.current));");
  });

  it("each version read prunes the drags of keys it no longer serves, in storage too (review N2)", () => {
    const effect = CANVAS.slice(CANVAS.indexOf("  // Each version read keeps the drags"), CANVAS.indexOf("}, [servedRead, layoutKey]);"));
    expect(effect).toContain("const pruned = pruneOffsets(offsetsRef.current, new Set(servedRead.communities.map((c) => c.key)));");
    expect(effect).toContain("offsetsRef.current = pruned;");
    expect(effect).toContain("offsetsRevRef.current += 1;");
    expect(effect).toContain("localStorage.setItem(topicOffsetsStorageKey(layoutKey), serializeOffsets(pruned));");
  });

  it("the circle's title is the served one (topicTitle), never a keyword", () => {
    expect(CANVAS).toContain("topicHalos.push({ label: topicTitle(c, TITLE_BEING_WRITTEN), topic: circle.id,");
    for (const f of ["graph_canvas.tsx", "communities.ts", "topic_layout.ts", "topic_labels.ts", "topic_map.tsx", "topics_panel.tsx", "communities_source.ts", "entity_view.tsx", "hover_card.ts"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/\bkeywords\b|exemplar_|member_ids|readableTopicLabel|readableKeyword/);
    }
  });
});

describe("the live marker and the focus reach the graph", () => {
  it("the view reads the newest marker over the whole stream and hands it to the canvas", () => {
    expect(VIEW).toContain('const communitiesMarker = useCommunitiesMarker(envelopes, sourceKind === "gateway");');
    expect(VIEW).toContain("communitiesMarker={communitiesMarker}");
    expect(CANVAS).toContain("useServedCommunities(gatewaySource, communitiesMarker)");
  });

  it("memories placed since the version join without a re-read; only a new version read re-seats with the glide", () => {
    expect(VIEW).toContain('const communitiesPlaced = usePlacedOnStream(envelopes, sourceKind === "gateway");');
    expect(VIEW).toContain("communitiesPlaced={communitiesPlaced}");
    expect(CANVAS).toContain("const served = useMemo(() => (servedRead ? withTailPlacements(servedRead, communitiesPlaced) : null), [servedRead, communitiesPlaced]);");
    expect(CANVAS).toContain("if (servedRead !== servedSeenRef.current) {");
  });

  it("the focus rides the stable key (a nightly revision keeps it) and re-emits new members", () => {
    expect(VIEW).toContain("pickedTopic={topicFilter?.key ?? null}");
    expect(CANVAS).toContain("onPickTopicRef.current(pick);");
  });

  it("the Topics panel: open on a wide screen, folded on a phone, clear of the motion buttons and the legend", () => {
    expect(CANVAS).toContain("const [topicsOpen, setTopicsOpen] = useState(() => !narrowViewport());");
    // A topic picked in the panel on a phone folds it, so the graph shows the
    // circle — unless none of its memories is loaded (no circle: the panel
    // stays open on its sentence).
    expect(CANVAS).toContain("if (key !== null && narrowViewport() && loadedOf(key) > 0) setTopicsOpen(false);");
    expect(CANVAS).toContain("requestAnimationFrame(() => frameTopic(key));");
    const css = read("graph_canvas.css");
    const narrow = css.slice(css.indexOf("@container entity-canvas (max-width: 859.98px) {"));
    const rule = narrow.slice(narrow.indexOf("  .gc_topics {"), narrow.indexOf("}", narrow.indexOf("  .gc_topics {")));
    expect(rule).toContain("bottom: calc(var(--gc-motion-bottom) + var(--tap-min, 32px) + 8px);");
    expect(rule).toContain("max-height: calc(100% - var(--gc-legend-top) - var(--gc-legend-floor) - 16px - var(--gc-motion-bottom) - var(--tap-min, 32px));");
  });

  it("open on a short canvas the panel keeps its floor — its head and one topic row — and its bottom yields (review S2)", () => {
    const css = read("graph_canvas.css");
    const narrow = css.slice(css.indexOf("@container entity-canvas (max-width: 859.98px) {"));
    const open = narrow.slice(narrow.indexOf("  .gc_topics.gc_tp_open {"), narrow.indexOf("}", narrow.indexOf("  .gc_topics.gc_tp_open {")));
    expect(open).toContain("--gc-tp-floor: min(var(--gc-topics-floor), calc(100% - var(--gc-legend-top) - 16px));");
    expect(open).toContain("bottom: max(8px, min(calc(var(--gc-motion-bottom) + var(--tap-min, 32px) + 8px), calc(100% - var(--gc-legend-top) - 8px - var(--gc-tp-floor))));");
    expect(open).toContain("max-height: max(var(--gc-tp-floor), calc(100% - var(--gc-legend-top) - var(--gc-legend-floor) - 16px - var(--gc-motion-bottom) - var(--tap-min, 32px)));");
    expect(open).toContain("z-index: 3;");
    expect(narrow).toContain(".entity_canvas_wrap:not(:has(.gc_recall_legend)) .gc_topics.gc_tp_open {\n    max-height: max(var(--gc-tp-floor), calc(100% - var(--gc-legend-top) - 16px - var(--gc-motion-bottom) - var(--tap-min, 32px)));");
    expect(read("entity.css")).toContain("--gc-topics-floor: calc(3 * var(--tap-min, 32px) + 14px);");
  });

  it("the panel head's fold mark is drawn, never part of its accessible name (review N3)", () => {
    const css = read("graph_canvas.css");
    expect(css).toContain('.gc_tp_head::before {\n  content: "▸";\n  content: "▸" / "";');
    expect(css).toContain('.gc_tp_open .gc_tp_head::before {\n  content: "▾";\n  content: "▾" / "";');
  });

  it("wide canvas: the motion buttons stay inside the room the lens row leaves them, so a click on freeze lands", () => {
    const css = read("entity.css");
    expect(css).toMatch(/\.entity_graph_overlay \{\n  position: absolute;\n  top: 10px;\n  left: 12px;\n  right: 200px;/);
    const wide = css.slice(css.indexOf("@container entity-canvas (min-width: 860px) {"));
    const rule = wide.slice(wide.indexOf("  .gc_motion_controls {"), wide.indexOf("}", wide.indexOf("  .gc_motion_controls {")));
    expect(rule).toContain("max-width: 180px;");
    expect(rule).toContain("flex-wrap: wrap;");
  });
});

describe("a topic none of whose memories is loaded (review S1)", () => {
  it("stays focused without lighting or dimming anything, and the camera holds", () => {
    expect(VIEW).toContain("onPickTopic={(pick) => setTopicFilter(pick ? { key: pick.key, ids: pick.rowIds, label: pick.label } : null)}");
    expect(VIEW).toContain("if (topicFilter !== null && topicFilter.ids.size > 0) sources.push(topicFilter.ids);");
    expect(CANVAS).toMatch(/onPickTopic\(pick\);\n\s+if \(pick\.rowIds\.size === 0\) return;\n[^\n]*\n\s+requestAnimationFrame\(\(\) => frameTopic\(key\)\);/);
    // No circle and no title for it.
    expect(CANVAS).toContain("if (!ids || ids.length === 0 || !c) continue;");
  });

  it("the title's card counts like the panel: held, and loaded when it differs; its list action counts the list", () => {
    expect(CANVAS).toContain("{topicCountWords(heldCount(topicCard), loadedOf(topicCard.key))}");
    expect(CANVAS).toContain("<CardActions actions={topicActions(loadedOf(topicCard.key))} onAction={runCardAction} />");
    expect(CANVAS).not.toContain("topicCard.members.length");
  });
});

describe("no per-frame DOM layout reads in the title pass (review S3)", () => {
  it("the frame reads the overlays through the cache and places the titles once per change", () => {
    // The topics' pass of the frame: the circles, then the titles (the
    // auto-fit's one read, once per life, is not in it).
    const frame = CANVAS.slice(CANVAS.indexOf("const topicHalos: Array<"), CANVAS.indexOf("raf = requestAnimationFrame(frame);\n    };"));
    expect(frame).not.toContain("overlayRectsOver(");
    expect(frame).not.toContain("getBoundingClientRect");
    expect(frame).not.toContain("querySelector");
    expect(frame).toContain("const overlayRects = overlays.current();");
    expect(frame).toContain("if (titlesCache.key !== titlesKey) {");
    // screenNodes and the placement are inside the cached branch.
    const branch = frame.slice(frame.indexOf("if (titlesCache.key !== titlesKey) {"), frame.indexOf("labelHits = titlesCache.placed;"));
    expect(branch).toContain("screenNodes.push(");
    expect(branch).toContain("placeTopicLabel({");
    expect(branch).toContain("ctx.measureText(");
    // The key: the camera, the canvas, the overlays, the seated placement, the glide.
    expect(frame).toContain("const titlesKey = `${cam.x}|${cam.y}|${cam.zoom}|${cssW}|${cssH}|${overlays.rev}|${pc.gen}|${reseat ? reseat.start : 0}|${reseat ? ease : 1}|${layout.size}|${topicHalos.length}`;");
  });

  it("OverlayRects reads the DOM once, then again only after a resize or a change around the canvas", async () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = { window: g.window, ResizeObserver: g.ResizeObserver, MutationObserver: g.MutationObserver };
    const resizeCbs: Array<() => void> = [];
    const mutationCbs: Array<(records: Array<{ target: unknown }>) => void> = [];
    const observed: unknown[] = [];
    g.window = { addEventListener() {}, removeEventListener() {} };
    g.ResizeObserver = class {
      constructor(cb: () => void) { resizeCbs.push(cb); }
      observe(el: unknown) { observed.push(el); }
      unobserve() {}
      disconnect() {}
    };
    g.MutationObserver = class {
      constructor(cb: (records: Array<{ target: unknown }>) => void) { mutationCbs.push(cb); }
      observe() {}
      disconnect() {}
    };
    try {
      const { OverlayRects } = await import("./graph_canvas");
      let reads = 0;
      let rectReads = 0;
      const el = (x: number) => ({ box: { left: x, top: 10, width: 50, height: 20 }, getBoundingClientRect() { rectReads += 1; return this.box; } });
      const panel = el(100);
      const els = [panel, el(300)];
      const host = { querySelectorAll: () => { reads += 1; return els; } };
      const canvas = { parentElement: host, getBoundingClientRect: () => { rectReads += 1; return { left: 0, top: 0 }; } };
      const o = new OverlayRects(canvas as unknown as HTMLCanvasElement);
      const first = o.current();
      expect(first).toEqual([{ x: 100, y: 10, w: 50, h: 20 }, { x: 300, y: 10, w: 50, h: 20 }]);
      const rev = o.rev;
      for (let i = 0; i < 100; i++) o.current();
      expect(reads).toBe(1);
      expect(rectReads).toBe(3);
      // Each overlay is watched for its own resizes.
      expect(observed).toEqual([canvas, ...els]);
      // The canvas's own attributes (its cursor) never mark the rects stale.
      mutationCbs[0]([{ target: canvas }]);
      o.current();
      expect(reads).toBe(1);
      // A change around the canvas does: one read, the same rects, the same rev.
      mutationCbs[0]([{ target: host }]);
      o.current();
      o.current();
      expect(reads).toBe(2);
      expect(o.rev).toBe(rev);
      // An overlay resized: read again, the rev moves (the titles re-place).
      panel.box = { left: 100, top: 10, width: 50, height: 300 };
      resizeCbs[0]();
      expect(o.current()[0]).toEqual({ x: 100, y: 10, w: 50, h: 300 });
      expect(reads).toBe(3);
      expect(o.rev).toBe(rev + 1);
      o.dispose();
    } finally {
      g.window = saved.window;
      g.ResizeObserver = saved.ResizeObserver;
      g.MutationObserver = saved.MutationObserver;
    }
  });
});

describe("freeCentre: a focused topic is framed where the panel leaves room", () => {
  it("no panel: the canvas centre", async () => {
    const { freeCentre } = await import("./graph_canvas");
    expect(freeCentre({ w: 1000, h: 600 }, null, 0)).toEqual({ x: 500, y: 300, w: 1000, h: 600 });
    // Below the lens row by default.
    expect(freeCentre({ w: 1000, h: 648 }, null)).toEqual({ x: 500, y: 348, w: 1000, h: 600 });
  });
  it("a panel on the right (wide canvas): the centre of the part left of it", async () => {
    const { freeCentre } = await import("./graph_canvas");
    expect(freeCentre({ w: 1000, h: 600 }, { x: 670, y: 250, w: 320, h: 340 }, 0)).toEqual({ x: 335, y: 300, w: 670, h: 600 });
  });
  it("a panel across the bottom (a phone): the centre of the part above it", async () => {
    const { freeCentre } = await import("./graph_canvas");
    expect(freeCentre({ w: 384, h: 330 }, { x: 8, y: 180, w: 368, h: 44 }, 0)).toEqual({ x: 192, y: 90, w: 384, h: 180 });
    expect(freeCentre({ w: 384, h: 330 }, { x: 8, y: 180, w: 368, h: 44 })).toEqual({ x: 192, y: 114, w: 384, h: 132 });
  });
});
