# Planned: Topic focus moves the camera as an animated transition, never a teleport

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's live test of 0.12.0 (2026-11-10, ruling 10:40: every finding logged in his words)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
Clicking a topic already unfolds it and zooms (good) — keep that and the hover highlight (0002),
and make the move/zoom an animated transition, never a teleport.

## Current code reality
`src/graph_canvas.tsx:2044-2059` `frameTopic` assigns `cam.zoom`, `cam.x`, `cam.y` in one frame
(a jump). Fit view (`src/graph_canvas.tsx:2392`) and the auto-fit (`:783-787`) jump the same way.

## Scope
One camera tween (ease-in-out, ~350-450 ms, frame-rate independent, cancelled by a user pan/zoom)
used by topic framing, and by Fit view where it reads better; `prefers-reduced-motion` keeps the
jump.

## Non-goals
No change to what is framed (the free-centre rule stays).

## Expected outcomes
Every programmatic camera move glides; a drag during it wins.

## Validation
A pure tween helper with tests (endpoints exact, monotone, reduced-motion = one step); a manual
check on a dense life.

## Size
S (2-3 hours).
