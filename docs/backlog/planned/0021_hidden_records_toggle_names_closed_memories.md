# Planned: The hidden-records toggle names what they are: closed memories, hidden by default; topic-version links are not nodes

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-3 test of 0.12.0 (2026-11-10 17:45, relayed by the framework session)
- Lane: W2 (round 3, 2026-11-10)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"the 'outside topics' toggle: after Q3, default-hide closed records and name the toggle for what they are (e.g. '477 closed records'), never 'outside topics' if every open record is placed"

## Current code reality
- Q3 (`untracked/finish-plan-2026-11-09/round3/Q3-aletheia-counts.md` at the framework root,
  counts only, memory read read-only): aletheia's 477 = 247 closed `refines` link rows between
  topic versions + 210 superseded world models + 12 retracted dreams + 7 superseded summaries + 1
  engine claim; 0 open records outside a topic. castor: 151 = 132 closed memories + 17 topic links
  + 2 engine; 0 open.
- The toggle (`src/graph_canvas.tsx:2557-2569`): "◌ {hidden.size} outside topics", the word
  `OUTSIDE_WORD` (`src/graph_canvas_outside.ts:61`), the count `outsideTopics` (`:42-57`), the
  reason `neverJoins` (`:34-38`: closed, then bookkeeping = engine, then kind relation = link),
  the tooltip `outsideTitle` (`:64-71`); hidden by default (`showOutside` false,
  `src/graph_canvas.tsx:671`); a selected hidden record still draws (`drawnOutside`).
- Why the links are nodes at all: the fold's ghost guard drops topic records by
  `display.kind === "community"` (`src/stream_fold.ts:574` bindings, `:999` closures), but memory's
  replay labels a topic record's edge rows `kind: "memory"` (no `record_kind` on edge rows) with
  the topic's graph id; the closure passes the guard, the merge onto the never-seen topic fails
  (`:660`), and a node of its own is made, renamed kind "relation" (`:734`). Every topic change adds
  about 4; aletheia wrote 64 topic versions on 2026-11-10.
- `NodeState.closed` carries `{kind, reason, seq, replacement_ids}` (`src/stream_fold.ts:90`), so
  supersede vs retract is known per node.
- An open memory in no circle is counted apart (`waitingCount`, `src/graph_canvas.tsx:659-664`)
  and shown in the Topics panel; it is never in the toggle's count.

## Scope
- The fold makes no node for an edge row whose graph id is a topic record (the guard extended to
  them); a test on a replayed `refines` row of a community. A memory-side marking of those rows is
  a separate ask to the memory seat, not required here.
- The toggle counts closed memories only: label "◌ 229 closed memories" ("1 closed memory"), the
  tooltip "229 closed memories: 217 replaced by a newer version, 12 retracted. Hidden — click to
  show them on the ring around the graph." (shown: "... Shown on the ring around the graph — click
  to hide them."); on a phone "◌ 229" with that phrase as its accessible name.
- Engine records stay hidden (toggle on or off) and are not counted; a selected one still draws.
- Hidden by default stays; the word "outside topics" never appears (`OUTSIDE_WORD` and its tests
  rewritten).

## Non-goals
No change to memory's data or to what a closed memory looks like when shown; no seating of a
closed memory by its replacement (the app never invents a membership).

## Expected outcomes
On aletheia the toggle reads "◌ 229 closed memories" (castor: "◌ 132 closed memories"), and the
graph no longer carries 247 (17) link nodes.

## Validation
- Tests: the fold drops a topic record's edge rows (closure and binding); `outsideTopics` counts
  closed memories with the supersede/retract split; engine records hidden and uncounted; the label
  and tooltip words; no "outside topics" left in `src/`.
- A counts check on recorded replays (castor's from 2026-11-10 14:09Z or a fresh read-only GET):
  the toggle's number equals Q3's closed-memory count.
- Screenshots at 1440 x 900 and 400 px, toggle off and on (scratch build, never :8080).
- `npm test` green; adversarial review with the screenshots before merge.

## Size
S-M (half a day).
