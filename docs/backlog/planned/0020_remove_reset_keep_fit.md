# Planned: The graph's "reset" button goes; "fit" stays

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
"remove 'reset', keep 'fit'"

## Current code reality
- `.gc_motion_controls` (`src/graph_canvas.tsx:2480-2570`): freeze and settle (plain layout only,
  hidden on a served topics layout), ⟲ reset (`:2504-2532`), ⛶ fit (`:2534-2556`), and the
  hidden-records toggle (`:2557-2569`, 0021).
- Reset clears the saved layout key (`layoutStorageKey`) and the viewer's dragged topic offsets
  (`topicOffsetsStorageKey`), empties the seats and restarts the simulation (`alpha = 1`,
  unfrozen).
- Nothing else offers "forget where I dragged his topics": the topics toggle's title invites
  "drag a title to move its circle" (`src/entity_view.tsx:2159`), the offsets persist per life in
  `localStorage` (`src/graph_canvas.tsx:857`, `:897`, `:2060`).
- The wide-canvas rule that wraps the motion buttons names reset in its comment
  (`src/entity.css:6021-6031`).

## Scope
Remove the reset button and its handler; fit unchanged; the motion-buttons CSS and its comment
follow (one row fewer where four wrapped two by two).

## Non-goals
No change to fit, freeze, settle or the topic drag.

## Decision boundaries
With reset gone, a dragged topic circle cannot be put back from the UI. Recorded for the operator
at the end of the round (not asked mid-wave): keep it so (drags persist), or a small "put his
topics back" on a dragged circle's own menu later.

## Expected outcomes
The motion controls read "fit" (plus freeze/settle on a plain layout and the hidden-records
toggle); no reset.

## Validation
- A test that no reset button renders and fit still frames the graph; `npm test` green.
- Screenshots at 1440 x 900 and 400 px of the motion controls (scratch build, never :8080).
- Adversarial review with the screenshots before merge.

## Size
XS (under an hour).
