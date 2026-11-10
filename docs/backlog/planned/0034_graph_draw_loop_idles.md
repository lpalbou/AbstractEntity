# Planned (P1): The graph draws only when something changed; at rest it idles

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Priority: P1 (performance)
- Source: lane W2's round-4 review (2026-11-10; untracked/round3-shots/review-round4/REVIEW.md), relayed by
  the Entity/memory session
- Lane: none yet (the canvas's frame loop, lane W2's files)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
The standing rule (2026-11-09): "performance first" (the framework is already slow; a design states its
hot-path cost, no per-frame work that is not needed).

## Current code reality
Pre-existing, measured on castor at 1440 x 900 with nothing moving:
- The canvas's frame (`src/graph_canvas.tsx`, `const frame = () => {` and its
  `raf = requestAnimationFrame(frame)` at the end) re-schedules itself every animation frame whatever
  happened: a 9.5 ms callback, about 8 151 strokes per frame, the main thread 100 % busy at rest.
- What can change the picture is known and few: the simulation while it cools (`simRef.current.alpha`,
  `frozen`), the camera (`cameraRef`, a glide in `glideRef`), the pointer (`hoverRef`, `mouseRef`'s area
  of influence, the hover card), the eased dims (`dimAnimRef`) and the topic gains while they ease, the
  replay position and fold (`stateRef`: fold, scrub seq, recall, search, topics, the closed-memories
  toggle), a re-seat transition (`reseatRef`), the pulses and amber flashes that fade with the scrub head,
  a resize (`ResizeObserver`) and a theme swap.

## Scope
Render only on change: a dirty flag set by each of the inputs above (and kept set while anything is
easing: the simulation above its rest alpha, a glide, a dim ramp, a topic gain, a re-seat), one frame
drawn, then the loop stops. At rest (nothing moving, nothing easing, the pointer still): no frame at
all, main thread idle. The first frame after a change is drawn in the same animation frame as today
(no added latency).

## Non-goals
No change to what is drawn, to the emphasis rules or to the layout; no worker or offscreen canvas.

## Decision boundaries
None expected; if a source of change cannot be observed cheaply (a per-frame read would be the cost it
removes), say which and keep it drawing, measured.

## Expected outcomes
At rest the canvas draws 0 frames per second (DevTools performance: no rAF callbacks), the main thread
idle; hovering, panning, scrubbing and a live envelope still redraw at once.

## Validation
- A pure test of the dirty rule (each input marks the frame; an idle state schedules none).
- Measured on the hermetic app (never :8080) at 1440 x 900: callbacks per second and main-thread busy
  time at rest, before and after; a hover, a pan and a scrub still smooth.
- Adversarial review before merge.

## Size
M.
