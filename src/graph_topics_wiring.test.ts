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
    // A topic picked in the panel on a phone folds it, so the graph shows the circle.
    expect(CANVAS).toContain("if (key !== null && narrowViewport()) setTopicsOpen(false);");
    expect(CANVAS).toContain("requestAnimationFrame(() => frameTopic(key));");
    const css = read("graph_canvas.css");
    const narrow = css.slice(css.indexOf("@container entity-canvas (max-width: 859.98px) {"));
    const rule = narrow.slice(narrow.indexOf("  .gc_topics {"), narrow.indexOf("}", narrow.indexOf("  .gc_topics {")));
    expect(rule).toContain("bottom: calc(var(--gc-motion-bottom) + var(--tap-min, 32px) + 8px);");
    expect(rule).toContain("max-height: calc(100% - var(--gc-legend-top) - var(--gc-legend-floor) - 16px - var(--gc-motion-bottom) - var(--tap-min, 32px));");
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
