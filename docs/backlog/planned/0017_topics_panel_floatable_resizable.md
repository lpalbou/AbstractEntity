# Planned: The Topics panel is floatable and resizable

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-3 test of 0.12.0 (2026-11-10 17:45, relayed by the framework session)
- Lane: W2 (round 3, 2026-11-10)
- Folds in: 0001 (the panel starts at the top right), 2026-11-10

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"the Topics panel floatable and resizable"

And, from 0001 (first test of 0.12.0, 2026-11-10): "very bad use of space; it should start from
the top right, not bottom right"

## Current code reality
- `src/graph_canvas.css:223-241` `.gc_topics`: `position: absolute; right: 10px; bottom: 12px`,
  `width: min(320px, calc(100% - 32px))`, `max-height: 58%`: a fixed box anchored bottom-right; no
  move, no resize.
- Phone: `.gc_overlay_stack` (`src/graph_canvas.css:532-596`, `src/overlay_stack.ts`) stacks the
  Context legend and the panel in one column.
- Neighbours it collides with: the motion buttons (`.gc_motion_controls`, top right,
  `src/entity.css:1674-1680`, wrapped to 180 px on a wide canvas `:6027-6031`); the kinds legend's
  width rule assumes a bottom-right panel (`:6017-6020`, `.entity_canvas_wrap:has(.gc_topics) >
  .entity_legend`).
- Framing reads the panel's real box: `frameTopic` measures `.gc_topics`
  (`src/graph_canvas.tsx:2204-2208`) and `freeCentre` (`:558`) keeps the topic in the part the
  panel leaves free, so a moved panel is framed around correctly as long as the measure stays live.
- The only resize helper in the app is the side drawer's mouse handle (`src/drawer.tsx:134-193`,
  width persisted in `localStorage`, mouse events only). ui-kit 0.9.28 has no floating or
  draggable panel.

## Problem
The panel sits where it was put, at a size chosen for no one: on a wide screen it wastes the top
of the canvas (0001) and covers part of the graph the viewer may want to see.

## Scope
- Default place: top right, under the motion buttons, growing downward (0001's ask), with the
  legend rule and the motion buttons adjusted so nothing overlaps at 1440 x 900, 860 px and
  1024 px.
- Float: the panel's head is a drag handle (pointer events: mouse, pen, touch; pointer capture)
  that moves the panel anywhere inside the canvas, clamped so its head stays reachable and never
  under the lens row or the motion buttons.
- Resize: a grip on the free corner changes width and height between a minimum (about 240 x 160)
  and the canvas; the body scrolls inside.
- Keyboard: the handle and the grip move/resize with the arrow keys; a "dock" action (and a
  double-click on the head) puts it back in its default place and size.
- Position and size remembered per viewer in `localStorage` (try/catch, the default when storage
  fails), clamped again when the canvas shrinks.
- Phone width (the overlay stack): no floating; the stack and sheet behaviour stay.
- The pure clamp/resize math in its own module with tests; the side drawer's handle may move to
  pointer events with it if that shares code cleanly.

## Non-goals
No kit component in this item (a kit floating panel is a separate decision for the kit's owner if
a second app needs one); no change to the panel's contents (0014, 0015, 0016 are lane W3's, in the
same file: lane W2 owns the frame `.gc_topics` and its head, lane W3 the rows).

## Expected outcomes
The panel opens at the top right; he can drag it anywhere on the graph and resize it; it stays
where he left it next time; topic framing avoids it wherever it is.

## Validation
- Tests: the clamp math (inside the canvas, head reachable, min/max size, re-clamp on resize),
  storage round trip and failure, the keyboard moves, dock.
- Screenshots at 1440 x 900 (default, moved to the left, resized large), 860 px and 400 px (the
  stack unchanged) (scratch build, never :8080); a topic framed with the panel moved.
- `npm test` green; adversarial review with the screenshots before merge.

## Size
M-L (one to two days).
