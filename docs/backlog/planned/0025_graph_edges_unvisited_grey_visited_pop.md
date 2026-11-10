# Planned: Graph lines and memories: never travelled is dark grey, travelled pops by use; hover still dims the rest

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-4 test of 0.12.0 (2026-11-10 20:13, relayed by the framework session)
- Lane: W2 (round 4, 2026-11-10)
- Follows: 0007 and 0008 (completed, the same scale tuned in the first test of 0.12.0)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"what happened, edges were supposed to be dark grey if not visited ? here nothing really pops up in terms of visited edges/memories. i am more expecting something like [his earlier screenshot: dark background, most edges barely visible grey, the travelled ones bright green/white forming clear paths], maybe a bit more, but more nuanced. and we should still be able to highlight node & dim the rest"

## Current code reality
- Two kinds of line. Born-linked (structural, never travelled) lines are drawn first
  (`src/graph_canvas.tsx:1483-1527`) in one uniform stroke `rgbaOf(CANVAS_THEME.dim, 0.16)`
  (`:1498`); `dim` is `--text-dim` (default `[148, 168, 194]`, `:276`): a light blue-grey.
- Co-use (travelled) lines (`:1534-1600`): colour on the grey-to-green ramp
  `usageRgb(usageMix(place), cold, warm)` (`:1534-1537`, `:1591`), cold = `coldOf(--bg, --text)`
  (`:330`; `src/graph_usage.ts:136-138`, 28 % from the background toward the text), warm =
  `--adm-both` (`:329`); width `0.8 + log1p(count) * 0.4`.
- The place is a quantile rank among every co-use line of the loaded life
  (`src/graph_usage.ts:64-96`): every co-use line exists because he used the pair at least once,
  so each is ranked above 0; the "never used" end applies to no line that is drawn as travelled.
- Below the top decile (`TOP_DECILE = 0.9`, `:99`) the mix stays at most 0.3 (`usageMix`,
  `:107-111`) and the alpha 0.03-0.11 (`usageEdgeAlpha`, `:128-132`); the top tenth steps to mix
  0.85-1 and alpha 0.2-0.62.
- So nine travelled lines in ten draw fainter (alpha at most 0.11, dark grey) than the
  never-travelled born-linked lines (0.16, light grey): the travelled paths sink under the
  untravelled topology and only a scattered top tenth shows. This is the code's reading; the
  screenshots below confirm it.
- Memories use the same ramp (`:1741-1755`): rank 0 is cold, below the decile at most 0.3 of the way
  to green, the top tenth glows.
- Under a recall a travelled path takes its ring's colour with an arrow (`:1553-1589`); the amber
  "just travelled" flash rides on top (`:1600-1607`).
- Hover, selection, a focused topic: `src/recall_emphasis.ts:492-497` `DIMMED_NODE = 0.1`,
  `DIMMED_EDGE = 0.08`, `FOCUS_LIT_GAIN = 1.2`; `edgeDimTarget` (`:509-520`) dims every line
  without both ends emphasized (under the recall: every line not travelled); the canvas applies it
  as the eased `globalAlpha` (`graph_canvas.tsx:1414-1418`).
- Tests pin the numbers: `src/graph_usage.test.ts:155` (mix 0.85 at the decile), `:165` (alpha 0.03
  at 0); `src/recall_emphasis.test.ts` (the dims).

## Problem
The graph does not show where he has been: the never-travelled lines are lighter than most
travelled ones, so nothing forms a path, neither on the lines nor on the memories.

## Scope
- Never travelled (born-linked lines, and lines and memories not used up to the replay position):
  dark grey, barely visible, the quietest thing on the canvas, on the dark and the light theme.
- Travelled: every travelled line and memory above the never-travelled grey, on a graded ramp
  (dim green up to bright green/white) so the most travelled read as clear paths, like his earlier
  screenshot, "a bit more, but more nuanced". The implementer proposes the ramp (rank or log of
  the count, the alpha and lightness ends, the width) with screenshots on a dense real life (castor
  or aletheia, thousands of lines) and the demo; the operator picks if two candidates are close.
- Hover a memory, select it, focus a topic: the rest still dims and the lit neighbourhood keeps the
  contrast 0008 gave it; the recall's ring colours and the amber flash unchanged.
- The usage words follow the new scale (`USAGE_TITLE`, `graph_usage.ts:146`, and the Context
  legend's fill row).

## Non-goals
No change to what counts as a use (the fold's co-use pairs and selections), to the memory kinds'
colours, or to the recall's travelled-path drawing.

## Expected outcomes
On a lived graph, the paths he travelled stand out in green to white, graded by use, over a
dark-grey web of what he never travelled; hovering a memory still lights its neighbourhood and
dims the rest.

## Validation
- Tests: the ramp's order (any travelled line or memory draws above the never-travelled grey in
  colour and alpha), its grading across the scale, the dims unchanged; the pinned numbers in
  `graph_usage.test.ts` rewritten to the new ramp.
- Screenshots on the hermetic app (scratch build, never :8080) at 1440 x 900 and 400 px: the
  dense life at rest, the same with a memory hovered, both themes; side by side with the round-3
  build.
- `npm test` green; adversarial review with the screenshots before merge.

## Size
M (half a day, most of it the visual tuning).
