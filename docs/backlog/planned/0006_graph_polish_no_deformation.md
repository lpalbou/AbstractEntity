# Planned: Graph polish: no periodic deformation, better layout, more professional look

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's live test of 0.12.0 (2026-11-10, ruling 10:40: every finding logged in his words)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"it deforms every now and then; better layout, aesthetics, more professional"

## Current code reality
`src/graph_canvas.tsx:735-808`: the force simulation cools toward a freeze (`simRef.alpha`), and
arrivals reheat it (`simRef.current.alpha = 1` at `:808`); live arrivals during a turn and the
topic placement cache re-run it, which reads as the graph deforming. Rendering constants are spread
over the draw loop (`:1280-1660`).

## Scope
Find which events reheat the whole layout (arrivals, topic placement, refetch) and make a new node
settle locally (pinned neighbours, low reheat) instead of re-shaping the map; one pass on the
visual hierarchy (ring weights, label density, halo use) with before/after screenshots.

## Non-goals
No change of graph library; the usage scale and the recall emphasis stay as ruled.

## Expected outcomes
A settled graph keeps its shape while he lives; the canvas reads as one consistent design.

## Validation
A trace of reheat causes over a live turn; screenshots before/after, dark and light, wide and
400 px.

## Size
L (2-3 days; investigation first).
