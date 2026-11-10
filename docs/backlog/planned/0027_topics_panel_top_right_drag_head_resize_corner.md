# Planned: The Topics panel opens top right, moves smoothly by its whole head anywhere on the page, and resizes toward the corner dragged

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-4 test of 0.12.0 (2026-11-10 20:13, relayed by the framework session)
- Lane: W2 (round 4, 2026-11-10)
- Follows: 0017 (round 3, the floating panel; it folds in 0001)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"it opened at the bottom right, not top right"

"the moving is quite clanky and it should be able to move anywhere on the page. and we should be able to drag & drop from the menu bar [the panel's head bar]. also the resize... resize on the opposite side of the window, not intuitive at all"

## Current code reality
- The float (0017): `src/overlay_stack.ts:44-156` `PanelFloat` (`at` null = docked top right),
  `panelVars` (`:137-151`) writes custom properties on `.gc_overlay_stack`, read by
  `.gc_topics_float` (`src/graph_canvas.css:245-259`: `top: var(--gc-tp-top, 48px)`,
  `right: var(--gc-tp-right, 10px)`). The docked top is measured under the motion buttons
  (`src/graph_canvas.tsx:735-750`).
- Where it can open bottom right: below 860 px of canvas (`@container entity-canvas (max-width:
  859.98px)`, `graph_canvas.css:650-705`) the float box is `display: contents` and the panel is the
  overlay column's foot (`:690-692`); the canvas is the window minus the side panel, so a desktop
  window with the side panel open can fall under it. A remembered place (`localStorage`
  `abstractentity_topics_panel_v1`, `overlay_stack.ts:71`, read at `graph_canvas.tsx:457-463`) also
  reopens it where it was left. Which one he saw is reproduced first at his window size.
- Drag: only the 32 px grip at the head's right end (`graph_canvas.tsx:2656-2658`,
  `graph_canvas.css:283-308`); the head itself is the fold button (`src/topics_panel.tsx:941`), so a
  press on the head folds or unfolds and never moves the panel.
- Movement: `startPanelDrag` (`graph_canvas.tsx:2320-2363`) writes the custom properties on every
  `pointermove` (no frame batching) through CSS `max()`/`min()` clamps; `movePanel`
  (`overlay_stack.ts:78-83`) clamps it to the canvas, never above 48 px (`PANEL_TOP_MIN`), and
  SNAPS it below the motion buttons whenever it crosses their column (`:81`). The snap and the
  edge clamps are the likely "clanky"; to be confirmed on a recording.
- Anywhere on the page: the float box lives in the canvas wrap (the drag measures its
  `offsetParent`, `graph_canvas.tsx:2324-2331`): it can never go over the toolbar, the timeline or
  the side panel.
- Resize: one corner, bottom right (`.gc_tp_resize`, `graph_canvas.css:341-357`;
  `graph_canvas.tsx:2667-2669`, only while the list is open). `resizePanel`
  (`overlay_stack.ts:89-102`): a docked panel keeps its right edge, so dragging the bottom-right
  corner to the right grows the panel to the LEFT (`x = right - w`); a moved panel at the canvas's
  right edge does the same. That is "resize on the opposite side".
- Framing reads the panel's real box (`frameTopic`/`frameRows`, `graph_canvas.tsx:2288-2318`,
  `freeCentre`, `:576`).
- Tests: `src/overlay_stack.test.ts:255-310` pin the round-3 rules (`:260` "moves anywhere inside the
  canvas, below the lens row, its head never under the motion buttons"; `:272` "a docked one keeps
  its right edge").

## Problem
The panel can open where he does not expect it, moves in jumps from a small grip only, stays
inside the graph, and grows away from the corner he pulls.

## Scope
- Opens top right on a desktop, docked under the motion buttons, on first open and after "put
  back"; the bottom-right opening reproduced and gone at 1280, 1440 and 1920 px, side panel open
  and closed. If a stored round-3 place is the cause, the key's version moves on.
- Drag from the whole head bar: a press that moves past a small threshold (about 4 px) drags the
  panel; a click without movement still folds and unfolds it; the separate grip goes if the head
  carries the drag (a grab cursor on the head).
- Smooth: the panel follows the pointer one to one at frame rate (one write per animation frame,
  a transform while dragging, no snap mid-drag); any overlap rule applies on release, never as a
  jump under the pointer.
- Anywhere on the page: over the toolbar, the timeline and the side panel too, its head always
  inside the window; the panel leaves the canvas's box for that (fixed position or a portal) while
  framing still avoids its real box where it covers the canvas.
- Resize toward the corner dragged: the edge or corner he pulls follows the pointer, the opposite
  one stays; at a window edge the implementer picks between a grip on each free corner and a grip
  that moves to the side with room, stated in the review. The minimum and maximum sizes stay
  (`PANEL_W`, `PANEL_MIN_H`).
- Remembered place and size, and "put back", kept; re-clamped into the window when it shrinks.
- Phone (a canvas under 860 px): unchanged, the overlay column and its sheet.

## Non-goals
No kit floating-panel component; no change to the rows (0026 is lane W3's in the same panel: lane
W2 owns `.gc_topics` and its head, lane W3 the rows in `.gc_tp_body`).

## Expected outcomes
The panel opens top right; he drags it by its head, smoothly, anywhere in the app window; pulling a
corner grows it on that side; it reopens where he left it.

## Validation
- Tests: click vs drag on the head (the threshold), the move clamp to the window with the head
  reachable, resize toward the pulled corner for a docked and a moved panel, storage round trip and
  failure; `overlay_stack.test.ts` rewritten where its round-3 pins change.
- Screenshots on the hermetic app (scratch build, never :8080) at 1440 x 900 (opened top right;
  dragged by its head over the timeline; resized from its corner) and 400 px (unchanged), plus a
  short recording or frame-timing trace of a drag for "smooth"; a topic framed with the panel moved.
- `npm test` green; adversarial review with the screenshots before merge.

## Size
M (half a day to a day).
