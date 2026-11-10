# Completed: The legend: two lines at most at the bottom, and interactive

## Metadata
- Created: 2026-11-10
- Status: Completed
- Completed: 2026-11-10
- Source: the operator's live test of 0.12.0 (2026-11-10, ruling 10:40: every finding logged in his words)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
Legend: at most 2 lines at the bottom, never more; interactive (click a legend item, show where
those nodes/edges are).

## Current code reality
- `src/entity_view.tsx:2231-2260` `.entity_legend`: six core kinds, every extra kind of this life
  (`extraKinds`), a separator and the usage scale; plain `<span>`s, no handler.
- `src/entity.css:1719-1735`: `flex-wrap: wrap`, `max-width: calc(100% - 200px)` — on a life with
  many kinds, or with the Topics panel open (`:6036-6039` narrows it), it wraps to three or more
  lines.

## Scope
A layout that never exceeds two lines (fold the overflow behind a "+N" item, or shorten labels);
each item a button that drives the canvas emphasis with the nodes of that kind (edges: the lines
of that class); a second click or Escape clears it.

## Non-goals
No new colours.

## Expected outcomes
Two lines at most at every width down to 400 px; clicking "dream" lights the dreams.

## Validation
A test of the overflow rule and of the click-to-emphasis wiring; screenshots wide and 400 px.

## Size
M (one day).

## Completion
- Done 2026-11-10 (operator's test round 2, topics lane): 4d2ee64 `src/graph_canvas_legend.tsx`
  (moved out of `entity_view`): two rows (the memories; the lines and colours), each one line that
  scrolls sideways when it holds more, one scrollable row at phone width; every memory item and
  relation type a pressed toggle (second click or Escape lets go); `legendIds` lights a class's or
  kind's memories (never an engine record) or both ends of a relation's edges; the legend pick is
  one more emphasis source and the camera frames it.
- Validation: `graph_canvas_legend.test.tsx` (the usage-key pin moved from
  `context_legend.test.tsx`); `npm test` 1752 green, tsc clean, 14/14 mutants red with a green
  control; harness E on castor's live data: 3 lines (87 px) before at 1440 x 900, 2 lines (58 px)
  after, 1 line at 1024 and 400 px, "dream" pressed lights 11 and frames them. CHANGELOG
  [Unreleased]: "The graph's legend is two lines and you can click it".
- Follow-up: the legend replaces the filter chips row in 0019 (round 3).
- Original path: `docs/backlog/planned/0004_legend_two_lines_and_interactive.md` (file still under
  planned/, move pending).
