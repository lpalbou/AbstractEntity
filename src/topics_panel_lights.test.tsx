/**
 * THE PANEL'S OWN LIGHTS, driven as the panel drives them (review
 * 2026-11-10 F2: no test sent a pointer to a rendered row). The package
 * ships no DOM for tests, so each row is rendered for real — the kit's
 * DisclosureList around the panel's own row content (renderTopicRow) — and
 * its markup becomes a minimal element tree (the row and what it holds:
 * closest, querySelector by attribute, getAttribute). The pointer and the
 * keyboard reach panelLights through those elements, exactly the targets
 * the body's handlers hand it; what reaches onHoverRows / onFrameRows /
 * reveal is asserted id for id.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DisclosureList } from "@abstractframework/ui-kit";

import { readCommunities } from "./communities";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { HOVER_INTENT_MS, type HoverIntentTimers } from "./hover_intent";
import { membershipOf } from "./topic_layout";
import { groupRowKey, panelLights, pathRowKey, renderTopicRow, revealScrollTop, topicRows, typesRowKey, type PanelLightsHost, type RowContext, type TopicRow } from "./topics_panel";

// ------------------------------------------------------------ a minimal element tree from real markup

/** An element of the rendered markup: its attributes, its row (the kit's <li>), what it holds. */
class FakeElement {
  children: FakeElement[] = [];
  constructor(
    readonly tag: string,
    readonly attrs: Map<string, string>,
    readonly parent: FakeElement | null,
  ) {
    parent?.children.push(this);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  /** Only the selectors the panel uses: `.class` and `[attr]`. */
  private matches(selector: string): boolean {
    const cls = selector.match(/^\.([\w-]+)$/);
    if (cls) return (this.attrs.get("class") ?? "").split(/\s+/).includes(cls[1]);
    const attr = selector.match(/^\[([\w-]+)\]$/);
    if (attr) return this.attrs.has(attr[1]);
    throw new Error(`selector not supported by the test's tree: ${selector}`);
  }
  closest(selector: string): FakeElement | null {
    for (let el: FakeElement | null = this; el; el = el.parent) if (el.matches(selector)) return el;
    return null;
  }
  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const hit = child.querySelector(selector);
      if (hit) return hit;
    }
    return null;
  }
  find(pred: (el: FakeElement) => boolean): FakeElement | null {
    if (pred(this)) return this;
    for (const child of this.children) {
      const hit = child.find(pred);
      if (hit) return hit;
    }
    return null;
  }
}

const VOID = new Set(["i", "img", "br", "input"]);
function tree(html: string): FakeElement {
  const root = new FakeElement("#root", new Map(), null);
  let at = root;
  for (const m of html.matchAll(/<(\/?)([a-z]+)([^>]*?)(\/?)>/g)) {
    if (m[1]) {
      at = at.parent ?? root;
      continue;
    }
    const attrs = new Map([...m[3].matchAll(/([\w-:]+)="([^"]*)"/g)].map((a) => [a[1], a[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&")]));
    const el = new FakeElement(m[2], attrs, at);
    if (!m[4] && !VOID.has(m[2])) at = el;
  }
  return root;
}

// The panel's rowLitKey checks `instanceof Element`: the test's elements are the DOM's here.
const realElement = (globalThis as { Element?: unknown }).Element;
beforeAll(() => {
  (globalThis as { Element?: unknown }).Element = FakeElement;
});
afterAll(() => {
  (globalThis as { Element?: unknown }).Element = realElement;
});

// ------------------------------------------------------------ the fixture: a topic with a path and two types

function binding(seq: number, id: string, kind: string, title: string, diary = false): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family: "binding",
    observed_at: "2026-11-10T10:00:00+00:00",
    scope: "life",
    owner_id: "entity:castor",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload: { record_id: id, scope: "life", owner_id: "entity:castor", search_state: "indexed", prompt_state: "active", lifecycle: "none", source: "remember", reason: null, binding_id: `b${seq}`, seq },
    display: { record_id: id, kind, title, graph_id: id, ...(diary ? { diary: true } : {}) } as ReplayEnvelope["display"],
  } as ReplayEnvelope;
}
const FOLD = foldEnvelopes([
  binding(1, "ex:episode-1", "episode", "exchange: the harbour archive opens at nine"),
  binding(2, "ex:episode-2", "episode", "exchange: tide tables for the week"),
  binding(3, "ex:diary-3", "diary", "the mirrors held overnight", true),
  binding(4, "ex:episode-4", "episode", "exchange: the pilot boat schedule"),
]);
const READ = readCommunities({
  version: 2,
  version_seq: 1,
  first_sleep_pending: false,
  algorithm: "louvain-warm-v1",
  links: [],
  communities: [
    {
      id: "ex:community-harbour-r1",
      key: "harbour",
      title: "The harbour archive",
      summary: "Where he reads the port's ledgers.",
      pending: [],
      verdict: null,
      size: 4,
      kinds: { episode: 3, diary: 1 },
      members: ["ex:episode-1", "ex:episode-2", "ex:diary-3", "ex:episode-4"].map((id) => ({ id, via: "detected" })),
      provisional_ids: [],
      cohesion: 0.5,
      layout: { xy: [0, 0], radius: 1, seats: {} },
      centroid_stale: false,
      facts: { paths: [{ from: "ex:episode-1", to: "ex:diary-3", count: 4 }] },
    },
  ],
});
if (READ.kind !== "served") throw new Error(JSON.stringify(READ));
const DATA = READ.data;
const ROWS_OF = membershipOf(FOLD, DATA).rowsOf;
const PATH = pathRowKey("harbour", { from: "ex:episode-1", to: "ex:diary-3" });
const TYPES = typesRowKey("harbour");
const EPISODES = groupRowKey("harbour", "episode");
const rowsWith = (opened: string[]) => topicRows(DATA.communities, new Set(["harbour"]), ROWS_OF, FOLD, { opened: new Set(opened) });
const ROWS = rowsWith([TYPES]);

const CTX: RowContext = { focused: "harbour", shownRow: null, cardOf: new Map(), colorOf: () => "#fff", focus: () => {}, clickPath: () => {}, toggleOpen: () => {}, openMember: () => {} };
/** The row as the panel renders it (the kit's <li> around its content), as an element tree: its <li>. */
function rendered(key: string, rows: TopicRow[] = ROWS): FakeElement {
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error(`no row ${key}`);
  const html = renderToStaticMarkup(<DisclosureList rows={[row]} selection={null} onSelect={() => {}} onToggleExpand={() => {}} renderRow={(r) => renderTopicRow(r as TopicRow, CTX)} />);
  const li = tree(html).find((el) => el.closest(".af-disclosure__row") === el);
  if (!li) throw new Error(`no kit row in ${html.slice(0, 120)}`);
  return li;
}
const inside = (li: FakeElement, cls: string) => li.find((el) => (el.getAttribute("class") ?? "").split(" ").includes(cls))!;

function fakeTimers(): { timers: HoverIntentTimers; advance(ms: number): void } {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      set(fn, ms) {
        pending.set(next, { at: now + ms, fn });
        return next++;
      },
      clear(id) {
        pending.delete(id);
      },
    },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...pending]) {
        if (t.at <= now) {
          pending.delete(id);
          t.fn();
        }
      }
    },
  };
}

function setup(rows: TopicRow[] = ROWS) {
  const { timers, advance } = fakeTimers();
  const calls = { hover: [] as Array<string[] | null>, frame: [] as string[][], shown: [] as Array<string | null>, reveal: [] as Array<[string, string]> };
  const host: PanelLightsHost = {
    onHoverRows: (ids) => calls.hover.push(ids),
    onFrameRows: (ids) => calls.frame.push(ids),
    onShown: (key) => calls.shown.push(key),
    reveal: (first, last) => calls.reveal.push([first, last]),
  };
  const lights = panelLights(host, timers);
  lights.setRows(rows);
  return { lights, advance, calls };
}

// ------------------------------------------------------------ the pointer on a rendered row

describe("a pointer resting on a rendered row lights exactly its memories", () => {
  it("a path row: its two memories, after the 150 ms rest, from anywhere on its row", () => {
    const { lights, advance, calls } = setup();
    const li = rendered(PATH);
    expect(li.querySelector("[data-rows]")?.getAttribute("data-rows")).toBe(PATH);
    lights.pointerOver(inside(li, "gc_tp_path_end"), "mouse");
    advance(HOVER_INTENT_MS - 1);
    expect(calls.hover).toEqual([]);
    advance(1);
    expect(calls.hover).toEqual([["ex:episode-1", "ex:diary-3"]]);
    expect(calls.shown).toEqual([PATH]);
    // Moving across its count, its arrow, the row's own box: nothing more is sent.
    lights.pointerOver(inside(li, "gc_tp_path_count"), "mouse");
    lights.pointerOver(li, "mouse");
    advance(500);
    expect(calls.hover).toEqual([["ex:episode-1", "ex:diary-3"]]);
  });

  it("a memory type row: that type's memories in this topic, newest first", () => {
    const { lights, advance, calls } = setup();
    const li = rendered(EPISODES);
    lights.pointerOver(inside(li, "gc_tp_kdot"), "mouse");
    advance(HOVER_INTENT_MS);
    expect(calls.hover).toEqual([["ex:episode-4", "ex:episode-2", "ex:episode-1"]]);
    // From the path to the type: the path stays lit until the type has rested.
    const { lights: l2, advance: a2, calls: c2 } = setup();
    l2.pointerOver(rendered(PATH), "mouse");
    a2(HOVER_INTENT_MS);
    l2.pointerOver(li, "mouse");
    a2(HOVER_INTENT_MS - 1);
    expect(c2.hover).toEqual([["ex:episode-1", "ex:diary-3"]]);
    a2(1);
    expect(c2.hover).toEqual([["ex:episode-1", "ex:diary-3"], ["ex:episode-4", "ex:episode-2", "ex:episode-1"]]);
  });

  it("onto a row that lights nothing of its own (the types head, a memory, the topic): let go at once", () => {
    const { lights, advance, calls } = setup(rowsWith([TYPES, EPISODES]));
    lights.pointerOver(rendered(PATH), "mouse");
    advance(HOVER_INTENT_MS);
    lights.pointerOver(inside(rendered(TYPES), "gc_tp_types_head"), "mouse");
    expect(calls.hover).toEqual([["ex:episode-1", "ex:diary-3"], null]);
    lights.pointerOver(rendered("member:harbour:ex:episode-4", rowsWith([TYPES, EPISODES])), "mouse");
    lights.pointerOver(rendered("topic:harbour"), "mouse");
    advance(500);
    expect(calls.hover).toEqual([["ex:episode-1", "ex:diary-3"], null]);
  });

  it("leaving the panel straight from a lit row lets go (onHoverRows(null)); a touch never lights", () => {
    const { lights, advance, calls } = setup();
    lights.pointerOver(rendered(PATH), "mouse");
    advance(HOVER_INTENT_MS);
    lights.pointerLeave("mouse");
    expect(calls.hover).toEqual([["ex:episode-1", "ex:diary-3"], null]);
    expect(calls.shown).toEqual([PATH, null]);
    lights.pointerOver(rendered(EPISODES), "touch");
    lights.pointerLeave("touch");
    advance(500);
    expect(calls.hover).toEqual([["ex:episode-1", "ex:diary-3"], null]);
  });

  it("the keyboard on a row lights it after the same rest; leaving the list lets go", () => {
    const { lights, advance, calls } = setup();
    lights.focus(rendered(EPISODES));
    advance(HOVER_INTENT_MS);
    lights.blur(true);
    expect(calls.hover).toEqual([["ex:episode-4", "ex:episode-2", "ex:episode-1"]]);
    lights.blur(false);
    expect(calls.hover).toEqual([["ex:episode-4", "ex:episode-2", "ex:episode-1"], null]);
  });

  it("a row resting without memories of its own is a broken seam: said (#SEAM), nothing lit", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { lights, advance, calls } = setup();
      const broken = tree('<li class="af-disclosure__row"><span data-rows="path:harbour:gone" data-tkey="harbour">x</span></li>').children[0];
      lights.pointerOver(broken, "mouse");
      advance(HOVER_INTENT_MS);
      expect(calls.hover).toEqual([]);
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0][0])).toMatch(/^#SEAM TopicsPanel: the rested row path:harbour:gone lights no memories/);
    } finally {
      error.mockRestore();
    }
  });
});

// ------------------------------------------------------------ once per change, clicks, folds

describe("what the lights send, and when", () => {
  it("once per change: the rows rebuilt (a fold, the stream) with the same memories send nothing again", () => {
    const { lights, advance, calls } = setup();
    lights.pointerOver(rendered(EPISODES), "mouse");
    advance(HOVER_INTENT_MS);
    lights.setRows(rowsWith([TYPES]));
    lights.setRows(rowsWith([TYPES, EPISODES]));
    expect(calls.hover).toEqual([["ex:episode-4", "ex:episode-2", "ex:episode-1"]]);
    // The type's memories changed (one fewer loaded): sent once.
    const fewer = rowsWith([TYPES]).map((r) => (r.key === EPISODES && r.data?.kind === "group" ? { ...r, data: { ...r.data, ids: ["ex:episode-4", "ex:episode-2"] } } : r));
    lights.setRows(fewer);
    lights.setRows(fewer);
    expect(calls.hover).toEqual([["ex:episode-4", "ex:episode-2", "ex:episode-1"], ["ex:episode-4", "ex:episode-2"]]);
    // Its row gone (the topic folded): let go.
    lights.setRows(topicRows(DATA.communities, new Set(), ROWS_OF, FOLD));
    expect(calls.hover.at(-1)).toBeNull();
  });

  it("a click frames the path and keeps it lit with the pointer gone; the same click again lets it go", () => {
    const { lights, calls } = setup();
    lights.clickPath(PATH);
    expect(calls.frame).toEqual([["ex:episode-1", "ex:diary-3"]]);
    expect(calls.hover).toEqual([["ex:episode-1", "ex:diary-3"]]);
    lights.pointerLeave("mouse");
    expect(calls.hover).toEqual([["ex:episode-1", "ex:diary-3"]]);
    lights.clickPath(PATH);
    expect(calls.frame).toHaveLength(1);
    expect(calls.hover).toEqual([["ex:episode-1", "ex:diary-3"], null]);
  });

  it("the clicked path lets go when another topic is focused, when the panel folds (release can keep it: release(true))", () => {
    const { lights, calls } = setup();
    lights.clickPath(PATH);
    lights.unpin();
    expect(calls.hover).toEqual([["ex:episode-1", "ex:diary-3"], null]);
    lights.clickPath(PATH);
    lights.release(true);
    expect(calls.hover).toEqual([["ex:episode-1", "ex:diary-3"], null, ["ex:episode-1", "ex:diary-3"]]);
    lights.release();
    expect(calls.hover.at(-1)).toBeNull();
  });

  it("a fold that opens is revealed once its rows are in: itself and what it lists, down to its last row", () => {
    const { lights, calls } = setup();
    lights.opening(EPISODES);
    lights.setRows(rowsWith([TYPES, EPISODES]));
    expect(calls.reveal).toEqual([[EPISODES, "member:harbour:ex:episode-1"]]);
    lights.opening(TYPES);
    lights.setRows(rowsWith([TYPES]));
    expect(calls.reveal).toEqual([[EPISODES, "member:harbour:ex:episode-1"], [TYPES, groupRowKey("harbour", "diary")]]);
    // Once: the next rows (the stream) reveal nothing.
    lights.setRows(rowsWith([TYPES]));
    expect(calls.reveal).toHaveLength(2);
  });

  it("the reveal scrolls the body: as much of the list as fits, its row never above the top; nothing when it all shows", () => {
    // Body 143 px tall at the viewport's y = 400, scrolled 0.
    const body = { top: 400, scrollTop: 0, height: 143 };
    expect(revealScrollTop(body, { top: 420 }, { bottom: 530 })).toBeNull();
    // Opened near the bottom, its list running far below: the opened row goes to the top.
    expect(revealScrollTop(body, { top: 500 }, { bottom: 2400 })).toBe(100);
    // A short list just past the bottom: scrolled so its last row shows, the row still inside.
    expect(revealScrollTop(body, { top: 500 }, { bottom: 600 })).toBe(57);
    // Scrolled past the opened row (it is above the top): back to it.
    expect(revealScrollTop({ ...body, scrollTop: 300 }, { top: 350 }, { bottom: 900 })).toBe(250);
  });
});
