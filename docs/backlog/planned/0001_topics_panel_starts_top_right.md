# Planned: The Topics panel starts at the top right, not the bottom right

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's live test of 0.12.0 (2026-11-10, ruling 10:40: every finding logged in his words)
- Folded into: 0017 (2026-11-10, round 3); closes when 0017 closes

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"very bad use of space; it should start from the top right, not bottom right"

## Current code reality
- `src/graph_canvas.css:218-241` `.gc_topics`: `position: absolute; right: 10px; bottom: 12px;
  max-height: 58%` — anchored bottom-right on a wide canvas.
- The top right is already taken on a wide canvas: the motion buttons
  (`.gc_motion_controls`, `src/entity.css:6040-6050`, inside the 200 px the lens row leaves).
- The kinds legend's width is computed against a bottom-right panel
  (`src/entity.css:6036-6039`, `.entity_canvas_wrap:has(.gc_topics) > .entity_legend`).
- Phone: `.gc_overlay_stack` (`src/graph_canvas.css:498-555`, `src/overlay_stack.ts`) stacks the
  Context legend and the panel in one column; `frameTopic` (`src/graph_canvas.tsx:2044-2059`)
  frames a topic in the part the panel leaves free.

## Problem
The panel grows up from the bottom right, so the open list wastes the top of the canvas and sits
over the busiest part of the graph's lower half.

## Scope
Wide canvas: the panel anchored top-right under the motion buttons (or the motion buttons moved),
growing downward; the kinds legend's width rule and `freeCentre` framing follow. Phone stack
unchanged unless the same rule fits.

## Non-goals
Not a single CSS anchor flip: it collides with the motion buttons and the legend rule (checked
2026-11-10, so it was left out of the trivial fixes).

## Expected outcomes
Open, the panel's head is at the top right and its list runs down; nothing overlaps at 1440 x 900,
860 px and 400 px.

## Validation
Screenshots at 1440 x 900, 860 x 700 and 400 x 700/860 with topics served, open and folded;
`npm test` (overlay_stack, topics_panel tests).

## Size
S-M (half a day: anchor + motion-button placement + legend rule + framing).

## Status note
2026-11-10 (round 3): folded into
[0017 The Topics panel is floatable and resizable](0017_topics_panel_floatable_resizable.md).
The operator's round-3 test asks for a panel he can move and resize; its default place is this
item's top right, so the anchor, the motion-button and legend collisions and the framing are built
there, once. This file stays as the record of the ask; nothing is built from it separately.
