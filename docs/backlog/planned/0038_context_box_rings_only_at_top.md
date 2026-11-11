# Planned (built): The Context box keeps its rings only and sits at the top controls' level

## Metadata
- Created: 2026-11-11
- Status: Planned (built fe54ed4, waiting for the operator's check)
- Completed: N/A
- Source: the operator, round 6 (2026-11-11 02:00), relayed by the Entity/memory session
- Lane: W2

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"i asked you to remove that [the 'lit lines: the path he travelled to reach each one, in the colour of its
ring / from what he held in mind → to what he recalled' row] since it's already in the legend in the
bottom. also this context legend should be higher, at the same vertical offset than the other fit button
etc"

## Current code reality (before)
- `src/context_legend.tsx`: the open key had the three ring rows, then the lit-lines row (an arrow swatch,
  its words and direction).
- `src/graph_canvas.css` `.gc_recall_legend`: `top: 48px`, centred in the width the docked Topics panel
  leaves; measured at 1440 x 900 (hermetic): the box's top at y 141, the top controls' row at y 103.
- The bottom legend (`src/graph_canvas_legend.tsx`) had the amber "just travelled" (a co-use flash), not
  the recall's lit lines.

## Scope
The Context box: its count line and the three ring rows only. The bottom legend says the lit lines once
(its arrow swatch, "lit lines: his path to each recalled memory, in its ring's colour"). On a wide canvas
the box's top at the top controls' level, centred in the band between the top row's last button and the
motion buttons or the docked panel (measured on change, never per frame); a band under 360 px keeps the
old place. Phone unchanged.

## Non-goals
No change to the rings, their words or the recall emphasis.

## Expected outcomes
The Context box reads the rings only, level with the top controls, over neither button group.

## Validation
- `src/context_legend.test.tsx` (the rings only), `src/graph_canvas_legend.test.tsx` (the lit-lines key),
  `src/overlay_stack.test.ts` (the band rule, the CSS, the measurement).
- Hermetic shots (never :8080) at 1440 and 400 with Context on: the box's top at the controls' y, no
  overlap with the top row's buttons, the motion buttons or the docked panel.

## Size
S.
