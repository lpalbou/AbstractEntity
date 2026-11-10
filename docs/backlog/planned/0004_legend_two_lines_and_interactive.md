# Planned: The legend: two lines at most at the bottom, and interactive

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
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
