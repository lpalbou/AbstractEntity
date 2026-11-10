# Planned: The closed-memories toggle sits left of fit; whether it stays waits for the operator

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-4 test of 0.12.0 (2026-11-10 20:13, relayed by the framework session)
- Lane: W2 (round 4, 2026-11-10)
- Follows: 0021 (round 3, the toggle named "closed memories", hidden by default)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"closed memories should be to the left of the fit. but i am unsure why we even have that?"

## Current code reality
- `.gc_motion_controls` (`src/graph_canvas.tsx:2677-2738`; CSS `src/entity.css:1668-...`, top
  right): freeze and settle (only without served topics), then fit (`:2702-2721`), then the toggle
  "◌ N closed memories" (`:2722-2736`, only when topics are served and `outside.closed > 0`).
- What it does: `showOutside` (`:701`) draws the closed memories on the ring outside every circle
  (`src/graph_canvas_outside.ts:17-18`; `hiddenOutside`, `graph_canvas.tsx:1053`); off by default.
- Where closed versions are reachable without it: a closed memory's Detail says Superseded or
  Retracted and links what replaced it (`src/record_detail.tsx:57-75` `ClosedNotice`); an
  understanding (topic, world model) lists its earlier readings (`record_detail.tsx:285`
  `EarlierUnderstandings`); the World tab lists superseded cards
  (`src/lessons_world_panels.tsx:236-244`). Not found in this read: an open plain memory's Detail
  listing the versions it replaced (grep of `record_detail*.tsx`, `detail_fold.tsx`); confirm
  before the removal.
- Tests: `src/graph_canvas_outside.test.ts:123` pins the toggle's markup.

## Problem
The toggle sits after fit, and its use is unclear to him.

## Scope
- Now: the toggle moves left of fit (closed memories, then fit), at every width; a test pins the
  order.
- Decision gate, waiting for the operator: remove the toggle. The Entity seat recommends removal:
  closed versions stay reachable from each memory's history in Detail and from the World tab's
  superseded list, and a control whose meaning has to be explained costs more than it gives. If he
  agrees: the toggle, `showOutside`, the ring's shown branch and their tests go; closed memories are
  never drawn on the graph; the Detail links stay. Until his word, only the move is done.

## Non-goals
No change to which records count as closed (0021's Q3 counts) nor to fit.

## Expected outcomes
The toggle reads left of fit; after his decision, either it stays there or it is gone and nothing
else on the graph moved.

## Validation
- A test pinning the order (toggle, then fit); if removed, a test that no closed memory is drawn
  and that the Detail links still open them.
- Screenshots on the hermetic app (scratch build, never :8080) at 1440 x 900 and 400 px of the
  motion buttons.
- `npm test` green; adversarial review with the screenshots before merge.

## Size
XS (the move); S if the removal is approved.
