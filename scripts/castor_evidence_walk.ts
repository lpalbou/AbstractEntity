/** Castor evidence walk — pure read over the SHIPPED fold (never a
 * re-implementation; the two-id-namespace join lives in stream_fold).
 * Counts and dates only, per the ask-author's framing rules. */
import { readFileSync } from "node:fs";

import { foldEnvelopes, cleanTitle } from "../src/stream_fold";
import { parseNdjson } from "../src/stream_source";

const raw = readFileSync(process.argv[2] ?? "/tmp/castor_evidence.ndjson", "utf-8");
const { envelopes, errors } = parseNdjson(raw);
if (errors.length) console.error(`parse errors: ${errors.length}`);
const state = foldEnvelopes(envelopes);

const BRIDGE = /bridge/i;
const by_kind: Record<string, { n: number; selected: number }> = {};
const bridge = { records: 0, selected_uses: 0, by_kind: {} as Record<string, number>, first: "", last: "" };
const day_counts: Record<string, number> = {};
let total_selected = 0;
const top: Array<{ title: string; kind: string; selected: number; born: string }> = [];

for (const node of state.nodes.values()) {
  const kind = node.kind || "unknown";
  const slot = (by_kind[kind] ??= { n: 0, selected: 0 });
  slot.n += 1;
  slot.selected += node.selected_count;
  total_selected += node.selected_count;
  const day = String(node.born_at || "").slice(0, 10);
  if (day) day_counts[day] = (day_counts[day] || 0) + 1;
  const title = cleanTitle(node.title);
  if (BRIDGE.test(title)) {
    bridge.records += 1;
    bridge.selected_uses += node.selected_count;
    bridge.by_kind[kind] = (bridge.by_kind[kind] || 0) + 1;
    if (!bridge.first || (day && day < bridge.first)) bridge.first = day;
    if (day && day > bridge.last) bridge.last = day;
  }
  top.push({ title: title.slice(0, 90), kind, selected: node.selected_count, born: day });
}
top.sort((a, b) => b.selected - a.selected);

// RETRIEVAL-LANDSCAPE SHAPE (doctoring before/after, e-s 257 ask 2):
// how concentrated is retrieval, and how much of the record mass is
// near-duplicate (identical fold titles — the wake-cue episode class).
const top16_selected = top.slice(0, 16).reduce((acc, t) => acc + t.selected, 0);
const title_counts = new Map<string, { n: number; selected: number; kind: string }>();
for (const t of top) {
  const key = `${t.kind}:${t.title}`;
  const slot = title_counts.get(key) ?? { n: 0, selected: 0, kind: t.kind };
  slot.n += 1;
  slot.selected += t.selected;
  title_counts.set(key, slot);
}
const duplicate_title_groups = [...title_counts.entries()]
  .filter(([, v]) => v.n >= 5)
  .map(([key, v]) => ({ title: key.slice(0, 80), records: v.n, selected_uses: v.selected }))
  .sort((a, b) => b.records - a.records);
const duplicate_record_mass = duplicate_title_groups.reduce((acc, g) => acc + g.records, 0);

console.log(
  JSON.stringify(
    {
      records_total: state.nodes.size,
      by_kind,
      total_selected_uses: total_selected,
      landscape: {
        top16_share_of_selected_uses: total_selected ? Number((top16_selected / total_selected).toFixed(4)) : null,
        duplicate_title_groups,
        duplicate_record_mass,
      },
      bridge_footprint: bridge,
      bridge_share_of_all_selected_uses: total_selected ? Number((bridge.selected_uses / total_selected).toFixed(4)) : null,
      records_per_day: Object.fromEntries(Object.entries(day_counts).sort()),
      top_20_most_selected: top.slice(0, 20),
    },
    null,
    1,
  ),
);
