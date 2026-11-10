/**
 * His topics in the ledger (castor's first topics night, 2026-11-10: the
 * twelve community records #105487–105498 read "Memory formed — title being
 * written…"). The envelopes below are the served shapes: memory's replay
 * projection of a community version (AbstractMemory replay.py COMMUNITIES:
 * kind "community", title or pending, community_key, version_seq, size, the
 * reading's provenance, and only its `refines` edge — never its members),
 * copied from castor's replay (digest shortened). A topic version is its own
 * row kind — "A topic took shape" / "A topic changed" — and opens the Topics
 * panel focused on it; never "Memory formed".
 */
import fs from "node:fs";
import path from "node:path";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { REVEAL_GRAPH, SideTabs } from "./drawer";
import { foldLedgerLines, ledgerLine, lineTarget, topicKeyOfTarget, topicTarget, type LedgerLine } from "./ledger_lines";
import { LedgerLineRow } from "./ledger_panel";
import { foldEnvelopes } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";
import { topicRequestStep } from "./topics_panel";

/** castor #105487, as served (digest shortened). */
const CASTOR_105487 = {
  stream: "abstractmemory.replay",
  stream_version: 1,
  seq: 105487,
  family: "binding",
  observed_at: "2026-11-10T02:40:14.099435+00:00",
  scope: "self",
  owner_id: "entity:castor@home-fd023c86",
  trace_id: null,
  turn_id: null,
  run_id: null,
  payload: {
    record_id: "ex:community-9a231e91a104c9f88b02d49fd0",
    scope: "self",
    owner_id: "entity:castor@home-fd023c86",
    search_state: "indexed",
    prompt_state: "inactive",
    lifecycle: "inactive_candidate",
    source: "remember",
    reason: null,
    observed_at: "2026-11-10T02:40:14.099435+00:00",
    provenance: {},
    binding_id: "1cd9ae011d57037b70f57347b5be9300",
    seq: 105487,
  },
  display: {
    record_id: "ex:community-9a231e91a104c9f88b02d49fd0",
    kind: "community",
    title: null,
    token_estimate: 1574,
    pending: {
      title: true,
      summary: true,
      since: "2026-11-10T02:40:14.099285+00:00",
      attempts: 0,
      failure: { reason: "budget_spent", error_class: null, at: "2026-11-10T02:40:13.957351+00:00", fields: ["title", "summary"], message: "the pass's authoring budget (0 calls) was spent: the drainer authors it" },
    },
    graph_id: "ex:community-9a231e91a104c9f88b02d49fd0",
    community_key: "ex:community-121b7564a948",
    version_seq: 105486,
    size: 157,
    digest_method: "mechanical-community-briefing-v1",
    digest_version: 0,
    version_count: 1,
    authored_by: { kind: "mechanical", id: "mechanical-community-briefing-v1" },
    understood_at: "2026-11-10T02:40:14.099285+00:00",
    cause: "formation",
    digest: "A topic of this memory: 157 memories that belong together (118 episode, 16 summary, 13 diary, 10 interest).",
    cut: false,
  },
} as unknown as ReplayEnvelope;

/** A version of castor's shape: `id`, `key`, `size`, title (null = pending), the version it refines. */
function version(seq: number, id: string, key: string, size: number, title: string | null, refines: string | null = null): ReplayEnvelope {
  const base = CASTOR_105487 as unknown as { payload: Record<string, unknown>; display: Record<string, unknown> };
  const display: Record<string, unknown> = { ...base.display, record_id: id, graph_id: id, community_key: key, size, title };
  if (title !== null) delete display.pending;
  if (refines) display.edges = [{ relation: "refines", target_graph_id: refines }];
  return { ...CASTOR_105487, seq, payload: { ...base.payload, record_id: id, seq }, display } as unknown as ReplayEnvelope;
}

function closure(seq: number, of: ReplayEnvelope, kind: "supersede" | "retract", reason: string): ReplayEnvelope {
  const id = String((of.payload as { record_id: string }).record_id);
  return {
    ...of,
    seq,
    family: "closure",
    payload: { assertion_id: id, kind, reason, replacement_ids: [], closure_id: `c${seq}`, seq },
  } as unknown as ReplayEnvelope;
}

const marker = (seq: number) =>
  ({ ...CASTOR_105487, seq, family: "host", payload: { kind: "communities_changed", session_id: null, version_seq: 105486 }, display: {} }) as unknown as ReplayEnvelope;

const lines = (envs: ReplayEnvelope[]): LedgerLine[] => foldLedgerLines(null, envs).lines.map((l) => l.line);

describe("a topic version formed is its own row, never 'Memory formed'", () => {
  it("castor #105487 (title pending): 'A topic took shape (title being written…)', its size, opens the topic by its key", () => {
    const line = ledgerLine(CASTOR_105487);
    expect(line.title).toBe("🗺 A topic took shape (title being written…)");
    expect(line.detail).toBe("157 memories");
    expect(line.tone).toBe("formation");
    expect(line.subject_id).toBe("topic:ex:community-121b7564a948");
    expect(lineTarget(line)).toBe("topic:ex:community-121b7564a948");
    expect(`${line.title} ${line.detail}`).not.toMatch(/Memory formed|ex:community|community-9a23/);
  });

  it("a titled version: 'A topic took shape: <its title>'", () => {
    const line = ledgerLine(version(7, "ex:community-a1", "ex:community-k1", 1, "Tending the twelve bridges"));
    expect(line.title).toBe("🗺 A topic took shape: Tending the twelve bridges");
    expect(line.detail).toBe("1 memory");
  });

  it("no title and nothing pending: '(untitled)', never its key or id", () => {
    const env = version(7, "ex:community-a1", "ex:community-k1", 3, null);
    delete (env.display as Record<string, unknown>).pending;
    expect(ledgerLine(env).title).toBe("🗺 A topic took shape (untitled)");
  });

  it("castor's night (twelve versions, then the marker): twelve topic rows, no 'Memory formed'", () => {
    const night = [CASTOR_105487, ...Array.from({ length: 11 }, (_, i) => version(105488 + i, `ex:community-n${i}`, `ex:community-k${i}`, 100 - i, null)), marker(105498.0001)];
    const out = lines(night);
    expect(out.filter((l) => l.title.startsWith("🗺 A topic took shape (title being written…)"))).toHaveLength(12);
    expect(out.some((l) => /Memory formed/.test(l.title))).toBe(false);
    expect(out[12].title).toBe("🗺 His topics changed");
  });

  it("a plain memory with its title pending still reads 'Memory formed' (the topic rule is the kind, not the pending)", () => {
    const env = version(9, "ex:memory-1", "", 0, null);
    (env.display as Record<string, unknown>).kind = "memory";
    expect(ledgerLine(env).title).toBe("Memory formed");
  });
});

describe("a newer version of a topic: 'A topic changed', counted against the version it refines", () => {
  const v1 = version(10, "ex:community-v1", "ex:community-k3", 85, "Building the framework with Laurent");

  it("grew: '(+N memories)'; shrank: '(−N memories)'; same count: no count", () => {
    const grew = lines([v1, version(20, "ex:community-v2", "ex:community-k3", 90, "Building the framework with Laurent", "ex:community-v1")]);
    expect(grew[0].title).toBe("🗺 A topic took shape: Building the framework with Laurent");
    expect(grew[1].title).toBe("🗺 A topic changed: Building the framework with Laurent (+5 memories)");
    expect(grew[1].detail).toBe("90 memories");
    expect(grew[1].subject_id).toBe(topicTarget("ex:community-k3"));
    const shrank = lines([v1, version(20, "ex:community-v2", "ex:community-k3", 84, "Building", "ex:community-v1")]);
    expect(shrank[1].title).toBe("🗺 A topic changed: Building (−1 memory)");
    const same = lines([v1, version(20, "ex:community-v2", "ex:community-k3", 85, "Building", "ex:community-v1")]);
    expect(same[1].title).toBe("🗺 A topic changed: Building");
  });

  it("its earlier version outside the loaded window: 'changed', no count made up", () => {
    expect(ledgerLine(version(20, "ex:community-v2", "ex:community-k3", 90, null, "ex:community-v0")).title).toBe("🗺 A topic changed (title being written…)");
  });

  it("the count is the fold's: a live append extends it, the earlier fold is left as it was", () => {
    const first = foldLedgerLines(null, [v1]);
    const next = foldLedgerLines(first, [v1, version(20, "ex:community-v2", "ex:community-k3", 92, "B", "ex:community-v1")]);
    expect(next.lines[1].line.title).toBe("🗺 A topic changed: B (+7 memories)");
    expect([...first.topicSizes.keys()]).toEqual(["ex:community-v1"]);
    expect([...next.topicSizes.keys()]).toEqual(["ex:community-v1", "ex:community-v2"]);
  });

  it("the earlier version's closure is an audit line; a dissolved topic says so, its size, no target", () => {
    const replaced = ledgerLine(closure(21, v1, "supersede", "community ex:community-k3: version 105486"));
    expect(replaced.title).toBe("A topic's earlier version was closed: Building the framework with Laurent");
    expect(replaced.tone).toBe("quiet");
    expect(replaced.subject_id).toBe(topicTarget("ex:community-k3"));
    expect(`${replaced.title} ${replaced.detail}`).not.toMatch(/Belief|ex:community|version 105486/);
    const gone = ledgerLine(closure(22, version(11, "ex:community-g", "ex:community-kg", 12, "Old weekend chores"), "retract", "dissolved"));
    expect(gone.title).toBe("🗺 A topic dissolved: Old weekend chores");
    expect(gone.detail).toBe("it held 12 memories");
    expect(gone.subject_id).toBeNull();
    expect(gone.tone).toBe("revision");
  });
});

describe("the link between two versions of a topic has no row (castor 2026-11-10: 17 'Belief revised the “refines” link — community ex:community-…')", () => {
  // castor #105713 as served: closed right after its version (#105712), the
  // version's `refines` link row — kind "memory", the version's graph id.
  const link = (seq: number, of: ReplayEnvelope): ReplayEnvelope => {
    const gid = String((of.payload as { record_id: string }).record_id);
    return {
      ...of,
      seq,
      family: "closure",
      payload: { assertion_id: `row-${seq}`, kind: "supersede", reason: "community ex:community-k3: version 105702", replacement_ids: ["ex:community-v2"], observed_at: of.observed_at, actor: "system", provenance: {}, closure_id: `c${seq}`, seq },
      display: { record_id: `row-${seq}`, kind: "memory", title: `${gid} refines`, token_estimate: 22, graph_id: gid },
    } as unknown as ReplayEnvelope;
  };
  const v1 = version(10, "ex:community-a1", "ex:community-k3", 85, "Tending the twelve continuity bridges");
  const v2 = version(20, "ex:community-a2", "ex:community-k3", 90, "Tending the twelve continuity bridges", "ex:community-a1");
  const night = [v1, v2, closure(21, v1, "supersede", "community ex:community-k3: version 105702"), link(22, v1)];

  it("the night reads: the topic took shape, it changed, its earlier version was closed (audit) — no link row, no key, no id", () => {
    const fold = foldLedgerLines(null, night);
    expect(fold.lines.map((l) => [l.line.seq, l.line.title])).toEqual([
      [10, "🗺 A topic took shape: Tending the twelve continuity bridges"],
      [20, "🗺 A topic changed: Tending the twelve continuity bridges (+5 memories)"],
      [21, "A topic's earlier version was closed: Tending the twelve continuity bridges"],
    ]);
    const words = fold.lines.map((l) => `${l.line.title} ${l.line.detail}`).join(" ");
    expect(words).not.toMatch(/Belief|refines|ex:community|version 105702/);
    expect([...fold.topicIds]).toEqual(["ex:community-a1", "ex:community-a2"]);
  });

  it("the same graph-id rule as the graph's fold (stream_fold community_graph_ids)", () => {
    expect(foldLedgerLines(null, night).topicIds).toEqual(foldEnvelopes(night).community_graph_ids);
    // A version whose formation is before the loaded part: its own closure names it.
    expect(foldLedgerLines(null, night.slice(2)).lines.map((l) => l.line.seq)).toEqual([21]);
  });

  it("a live append extends the ids; the earlier fold is left as it was", () => {
    const first = foldLedgerLines(null, night.slice(0, 3));
    const next = foldLedgerLines(first, night);
    expect(next.lines.map((l) => l.line.seq)).toEqual([10, 20, 21]);
    expect(first.topicIds).toEqual(next.topicIds);
    const later = foldLedgerLines(first, [...night.slice(0, 3), version(30, "ex:community-a3", "ex:community-k4", 12, "New")]);
    expect([...first.topicIds]).toEqual(["ex:community-a1", "ex:community-a2"]);
    expect(later.topicIds.has("ex:community-a3")).toBe(true);
  });

  it("the same link arriving as a binding has no row either (the graph's fold drops its node there too)", () => {
    const asBinding = { ...v1, seq: 23, display: { record_id: "row-23", kind: "memory", title: "ex:community-a1 refines", graph_id: "ex:community-a1" } } as unknown as ReplayEnvelope;
    expect(foldLedgerLines(null, [...night, asBinding]).lines.map((l) => l.line.seq)).toEqual([10, 20, 21]);
    expect(foldEnvelopes([...night, asBinding]).nodes.size).toBe(0);
  });

  it("read alone, with the topic ids: an audit line in words; with nothing saying it is a topic's, it stays a belief's line (the rule never reads its words)", () => {
    const quiet = ledgerLine(link(22, v1), undefined, new Set(["ex:community-a1"]));
    expect(quiet).toMatchObject({ title: "A topic's link to its earlier version was closed", detail: "a newer version replaced it", tone: "quiet", subject_id: null });
    expect(ledgerLine(link(22, v1)).title).toBe("Belief revised");
    expect(foldLedgerLines(null, [link(22, v1)]).lines).toHaveLength(1);
    // A memory's own link closed with it stays its line.
    const memoryLink = { ...link(23, v1), display: { record_id: "row-23", kind: "memory", title: "ex:episode-0a1 refines", graph_id: "ex:episode-0a1" } } as unknown as ReplayEnvelope;
    expect(foldLedgerLines(null, [...night, memoryLink]).lines.map((l) => l.line.seq)).toEqual([10, 20, 21, 23]);
  });
});

describe("clicking a topic's row: the Topics panel, focused on it", () => {
  it("the target names the topic by its key, and only a topic", () => {
    expect(topicKeyOfTarget(topicTarget("ex:community-121b7564a948"))).toBe("ex:community-121b7564a948");
    expect(topicKeyOfTarget("topic:")).toBeNull();
    expect(topicKeyOfTarget("ex:community-121b7564a948")).toBeNull();
    expect(topicKeyOfTarget("beat:trace-1")).toBeNull();
    expect(topicKeyOfTarget(null)).toBeNull();
  });

  it("the row says what a click does and hands the view the topic's target", () => {
    const onSelectSubject = vi.fn();
    const row = LedgerLineRow({ line: ledgerLine(CASTOR_105487), index: 3, own: false, reached: true, current: false, fresh: false, onJump: () => undefined, onSelectSubject }) as React.ReactElement<{ onClick(e: unknown): void }>;
    row.props.onClick({ target: null });
    expect(onSelectSubject).toHaveBeenCalledWith("topic:ex:community-121b7564a948");
    const html = renderToStaticMarkup(row);
    expect(html).toContain('title="Open this topic in the Topics panel"');
    expect(html).toContain("A topic took shape (title being written…)");
    expect(html).not.toContain("Memory formed");
  });

  it("the request waits for his topics, focuses a topic they hold, else opens the panel", () => {
    expect(topicRequestStep({ kind: "loading" }, false)).toBe("wait");
    expect(topicRequestStep({ kind: "loading" }, true)).toBe("wait");
    const read = { kind: "read", read: { kind: "first_sleep" } } as Parameters<typeof topicRequestStep>[0];
    expect(topicRequestStep(read, true)).toBe("focus");
    expect(topicRequestStep(read, false)).toBe("open");
    expect(topicRequestStep({ kind: "error", message: "x" }, false)).toBe("open");
  });

  it("wired: the view turns topics on, asks the graph, gives a phone's drawer back to the graph", () => {
    const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), "utf8");
    const view = read("entity_view.tsx");
    const branch = view.slice(view.indexOf("const topicKey = topicKeyOfTarget(id);"), view.indexOf("setSelectedId(id);\n                      if (id) setRequestedTab"));
    expect(branch).toContain("setShowTopics(true);");
    expect(branch).toContain("setTopicRequest({ key: topicKey, nonce });");
    expect(branch).toContain("setRequestedTab({ tab: REVEAL_GRAPH, nonce });");
    expect(branch).toContain("return;");
    expect(view).toContain("topicRequest={topicRequest}");
    const canvas = read("graph_canvas.tsx");
    const effect = canvas.slice(canvas.indexOf("const topicRequestDoneRef"), canvas.indexOf("}, [topicRequest, showTopics, topicsView, membership, communityByKey]);"));
    expect(effect).toContain('if (step === "wait") return;');
    expect(effect).toContain("setTopicsOpen(true);");
    expect(effect).toContain('if (step === "focus") focusTopicRef.current(topicRequest.key);');
    const drawer = read("drawer.tsx");
    expect(drawer).toContain('if (tabId === REVEAL_GRAPH) {\n        if (narrow) dispatch({ type: "close", narrow });');
    expect(REVEAL_GRAPH).toBe("~graph");
    expect(typeof SideTabs).toBe("function");
  });
});

describe("the time panel on a phone", () => {
  it("touch keeps the marks at their drawn size (the 44 px floor made each a block over the other lanes)", () => {
    const css = fs.readFileSync(path.resolve(__dirname, "entity.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // The touch block that sets the 44 px floor on every button.
    const floor = css.indexOf("#root button {\n    min-width: var(--tap-min, 44px);");
    expect(floor).toBeGreaterThan(0);
    const at = css.lastIndexOf("@media (pointer: coarse) {", floor);
    const block = css.slice(at, css.indexOf("\n}\n", floor));
    expect(block).toMatch(/#root \.et_mark \{\s*min-width: 0;\s*min-height: 0;\s*\}/);
  });
});
