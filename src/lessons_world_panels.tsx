/**
 * Lessons + World tabs (operator 2026-07-15): the two "special memory"
 * kinds get first-class reading surfaces instead of hiding in the graph.
 *
 * - LESSONS (`kind="lesson"`): what he has learned — practices, cautions,
 *   corrections that survived reflection. A lesson is a memory like any
 *   other (it competes for recall normally); this tab is just a reading
 *   view over the fold.
 * - WORLD (`kind="world_model"`): sleep-formed orientation cards — brief
 *   summaries of the entities he has encountered or worked with (a person,
 *   another AI, a location, a time of day, a system, an event, a concept).
 *   Formed by the sleep pass (engine 2026-07-12), revisable: a superseded
 *   card renders struck, its replacement stands.
 *
 * Both are PURE READS over the fold — no fetches, no writes. Clicking a
 * card selects the record and opens the Detail inspector on it (same
 * gesture as clicking a node on the graph).
 */

import React, { useMemo, useState } from "react";

import { KIND_COLORS } from "./graph_canvas";
import type { FoldState, NodeState } from "./stream_fold";
import { shapeLabel, summaryLabel } from "./node_label";

function fmtDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function nodesOfKind(fold: FoldState, kind: string): NodeState[] {
  const rows: NodeState[] = [];
  for (const n of fold.nodes.values()) {
    if (n.kind === kind && !n.bookkeeping) rows.push(n);
  }
  // Newest first — the most recent learning/orientation is the live one.
  rows.sort((a, b) => (a.born_at === b.born_at ? b.first_seq - a.first_seq : a.born_at < b.born_at ? 1 : -1));
  return rows;
}

function RecordCard({ node, onSelect, kindWord }: { node: NodeState; onSelect(id: string): void; kindWord: string }): React.ReactElement {
  return (
    <button
      className={`lw_card ${node.closed ? "lw_card_closed" : ""}`}
      onClick={() => onSelect(node.id)}
      title={node.closed ? `Superseded (${node.closed.reason || node.closed.kind}) — click to inspect; its replacement stands elsewhere` : `Open this ${kindWord} in the Detail inspector`}
    >
      <span className="lw_dot" style={{ background: KIND_COLORS[node.kind] ?? KIND_COLORS.unknown }} aria-hidden="true" />
      <span className="lw_text">
        {/* laurent dm#84: "do not show 'lesson:' for each card... just show
          * the lesson" — the panel header + dot color already carry the
          * kind; shapeLabel strips the type prefix (and gist: residue). */}
        <span className="lw_title">{shapeLabel(node.title || "") || `(untitled ${kindWord})`}</span>
        <span className="lw_meta">
          {fmtDate(node.born_at)}
          {node.selected_count > 0 ? ` · recalled ${node.selected_count}×` : " · never recalled yet"}
          {node.closed ? " · superseded" : ""}
        </span>
      </span>
    </button>
  );
}

export function LessonsPanel({ fold, onSelect }: { fold: FoldState; onSelect(id: string): void }): React.ReactElement {
  // TWO homes for a lesson (deep-check monitor C, 2026-07-27 — the dm#27
  // blindness class recurring): graph records with kind="lesson" (formed
  // by reflection/sleep) AND diary entries the entity elected with
  // diary_type="lesson". The tab said "none yet" while the Book showed
  // two elected lessons one tab over — a lens named "Lessons" must see
  // both shapes.
  const lessons = useMemo(() => {
    const graph = nodesOfKind(fold, "lesson");
    const elected: NodeState[] = [];
    for (const n of fold.nodes.values()) {
      if (n.kind === "diary" && n.diary_type === "lesson" && !n.bookkeeping) elected.push(n);
    }
    elected.sort((a, b) => (a.born_at === b.born_at ? b.first_seq - a.first_seq : a.born_at < b.born_at ? 1 : -1));
    return [...graph, ...elected];
  }, [fold]);
  return (
    <div className="lw_panel">
      <div className="lw_head">
        <span className="lw_panel_title">🎓 Lessons</span>
        <span className="lw_sub">what he has learned — {lessons.length === 0 ? "none yet" : `${lessons.length} lesson${lessons.length === 1 ? "" : "s"}`}</span>
      </div>
      {lessons.length === 0 ? (
        <p className="lw_empty">
          No lessons yet. Lessons form when reflection or a sleep pass distills an experience into a keepable practice
          ("what I'd do differently") — they then compete for recall like any memory. An empty shelf this early is
          normal, not a fault.
        </p>
      ) : (
        <div className="lw_list">
          {lessons.map((n) => (
            <RecordCard key={n.id} node={n} onSelect={onSelect} kindWord="lesson" />
          ))}
        </div>
      )}
    </div>
  );
}

/** One world card, SUMMARY-FIRST (laurent, focused room seq 2: "it MUST
 * be a human readable high-quality summary … provenance is here if the
 * entity ever asks 'why do I think that'"). The face is the card's words;
 * "why I think this" expands the provenance walk — the record's edges,
 * each clickable into the Detail inspector (the thread-unfolding his (c)
 * names). Summary QUALITY is the engine's lane (memory's formation/
 * update/sleep maintenance, claimed in the room); this render shows
 * whatever the engine serves and never dresses a mechanical distillation
 * as prose — the mechanical shape is labeled as such. */
function WorldCard({ fold, node, onSelect }: { fold: FoldState; node: NodeState; onSelect(id: string): void }): React.ReactElement {
  const [open, setOpen] = useState(false);
  // dm#91 ("we know it's a world model, so don't put it in the card"):
  // the type prefix strips at display — the panel header + card context
  // already say what these are; the RAW title keeps feeding the
  // mechanical detector below.
  const summary = shapeLabel(summaryLabel(node.title, node.redacted) || "") || null;
  // Mechanical stub shapes, labeled as such (adversary P1-2: the live
  // engine titles cards "World model: admin" — capital W, space — which
  // the first detector missed, dressing a template stub as prose).
  const mechanical = !summary || /^Consolidated:|^world[\s_]?model\b/i.test(node.title || "");
  // Provenance: every structural edge touching this card, resolved to
  // titled rows (graph ids → rows at read time — re-keys never orphan).
  const sources = useMemo(() => {
    const gid = node.graph_id;
    if (!gid) return [];
    const rows: Array<{ id: string; relation: string; title: string; direction: "→" | "←" }> = [];
    for (const e of fold.structural_edges.values()) {
      let otherGid: string | null = null;
      let direction: "→" | "←" = "→";
      if (e.source_graph_id === gid) otherGid = e.target_graph_id;
      else if (e.target_graph_id === gid) {
        otherGid = e.source_graph_id;
        direction = "←";
      }
      if (!otherGid) continue;
      const rowId = fold.graph_to_row.get(otherGid) ?? otherGid;
      const target = fold.nodes.get(rowId);
      if (!target) continue;
      rows.push({ id: rowId, relation: e.relation, title: target.redacted ? "a diary entry" : target.title || rowId.slice(0, 22), direction });
    }
    return rows.slice(0, 12);
  }, [fold, node]);

  return (
    <div className={`lw_wcard ${node.closed ? "lw_card_closed" : ""}`}>
      <button className="lw_wcard_head" onClick={() => onSelect(node.id)} title="Open in the Detail inspector">
        <span className="lw_dot" style={{ background: KIND_COLORS[node.kind] ?? KIND_COLORS.unknown }} aria-hidden="true" />
        <span className="lw_text">
          <span className="lw_title">{summary || node.title || "(untitled card)"}</span>
          <span className="lw_meta">
            {fmtDate(node.born_at)}
            {node.selected_count > 0 ? ` · recalled ${node.selected_count}×` : " · never recalled yet"}
            {node.closed ? " · superseded" : ""}
            {mechanical ? (
              <span title="Mechanical distillation — the engine composed this summary from his records; his own prose replaces it when he revises the card. Not his words yet.">
                {" "}· ⚙ mechanical
              </span>
            ) : null}
          </span>
        </span>
      </button>
      {sources.length > 0 ? (
        <div className="lw_prov">
          <button className="lw_prov_toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Why does he think this? The card's provenance — every memory it links to, each one click away.">
            {open ? "▾" : "▸"} why he thinks this ({sources.length})
          </button>
          {open ? (
            <ul className="lw_prov_list">
              {sources.map((s, i) => (
                <li key={i}>
                  <span className="lw_prov_rel">
                    {s.direction} {s.relation}
                  </span>
                  <button className="lw_prov_link" onClick={() => onSelect(s.id)} title="Open this source memory in the Detail inspector">
                    {s.title.length > 70 ? `${s.title.slice(0, 69)}…` : s.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function WorldPanel({ fold, onSelect }: { fold: FoldState; onSelect(id: string): void }): React.ReactElement {
  const cards = useMemo(() => nodesOfKind(fold, "world_model"), [fold]);
  const live = cards.filter((c) => !c.closed);
  const superseded = cards.filter((c) => c.closed);
  // BREADTH-vs-REFINEMENT honesty (laurent 2026-07-19, "world model cards
  // don't work"): cards only ever formed for PARTICIPANTS (people/agents
  // stamped on his episodes) — concept/place/system cards need topic
  // election, which shipped 2026-07-19. Until his loop runs reflection days
  // electing topics, the tab shows only person/agent targets refining, not
  // the world broadening — say so, so "few targets" reads as
  // forward-accumulating-just-started, never broken.
  const distinctTargets = useMemo(
    () => new Set(cards.map((c) => (c.title || "").replace(/^World model:\s*/i, "").trim().toLowerCase()).filter(Boolean)).size,
    [cards],
  );
  const narrowBreadth = cards.length > 0 && distinctTargets <= 2;
  return (
    <div className="lw_panel">
      <div className="lw_head">
        <span className="lw_panel_title">🌍 World</span>
        <span className="lw_sub">
          his orientation cards — {cards.length === 0 ? "none yet" : `${live.length} live${superseded.length ? ` · ${superseded.length} superseded` : ""}`}
        </span>
      </div>
      <p className="lw_framing">
        One card per "something" he understands — a person, a place, a concept, a system. The card is the distilled
        working model (what would remain if everything else vanished); "why he thinks this" unfolds its provenance —
        the memories behind the claim, each one click away. Sleep maintains the cards; his own revisions refine them.
      </p>
      {narrowBreadth ? (
        <p className="lw_note">
          These are all people/agents he's met — cards for <em>concepts, places, systems</em> form once he elects topics in
          reflection ("what did this day circle around?"), which shipped 2026-07-19. Breadth accumulates <strong>forward</strong>
          as he lives days on the new loop, not retroactively — the refinement chain you see here is working; the world widens
          from here.
        </p>
      ) : null}
      {cards.length === 0 ? (
        <p className="lw_empty">
          No world cards yet. They form during sleep passes once his lived episodes give the consolidation something to
          orient on — put him to sleep after a few sessions and look again.
        </p>
      ) : (
        <div className="lw_list">
          {live.map((n) => (
            <WorldCard key={n.id} fold={fold} node={n} onSelect={onSelect} />
          ))}
          {superseded.length > 0 ? (
            <>
              <div className="lw_divider">superseded (his older understanding — kept, never erased)</div>
              {superseded.map((n) => (
                <WorldCard key={n.id} fold={fold} node={n} onSelect={onSelect} />
              ))}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
