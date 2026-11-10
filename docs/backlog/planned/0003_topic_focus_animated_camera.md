# Completed: Topic focus moves the camera as an animated transition, never a teleport

## Metadata
- Created: 2026-11-10
- Status: Completed
- Completed: 2026-11-10
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

## Completion
- Done 2026-11-10 (operator's test round 2, topics lane): 1af01a3 `src/graph_canvas_camera.ts`
  (pure: `CAMERA_GLIDE_MS` 300, cubic `easeInOut`, `poseAt` with a geometric zoom, `startGlide`
  one step under `prefers-reduced-motion`, `glideAt` frame-rate independent); `moveCamera` used
  by `frameTopic`, Fit view and the lens/search fit; a wheel or pan drops the glide. 43be8a1
  (review 2a): a member opened from the panel glides too, the glide lasts 300 ms + 1 ms per 8 px
  travelled, capped at 600 ms, and reduced motion is followed live.
- Validation: `graph_canvas_camera.test.ts` (tween + source pins: no direct camera assignment left
  in `frameTopic`, Fit view or the lens fit); `npm test` 1707 green, 11/11 mutants red with a green
  control; harness C on castor's live data: before 0 intermediate frames, after 7 over 305 ms,
  reduced motion one step. CHANGELOG [Unreleased]: "The camera glides to a topic".
- Original path: `docs/backlog/planned/0003_topic_focus_animated_camera.md` (file still under
  planned/, move pending).
