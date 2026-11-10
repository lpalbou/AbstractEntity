# Planned: A hovered node's reachable edges and memories: about 20 % more contrast

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's live test of 0.12.0 (2026-11-10, ruling 10:40: every finding logged in his words)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
Edges and memories reachable from a hovered node are not visible enough: boost contrast ~20 %.

## Current code reality
- `src/recall_emphasis.ts:489-490`: everything outside the emphasis set eases to `DIMMED_NODE =
  0.12` / `DIMMED_EDGE = 0.08`; the hovered neighbourhood stays at 1.
- `src/graph_canvas.tsx:1414-1416`: a lit co-use line still draws at its usage alpha
  (`usageEdgeAlpha`, 0.03-0.11 below the top decile), so a reachable but rarely used line stays a
  whisper even when hovered.

## Scope
Dimmed nodes to 0.10 (lit-to-dimmed ratio 8.3 to 10, +20 %); a lit co-use line under hover or
selection ("focus" driver) drawn at 1.2x its usage alpha.

## Expected outcomes
The hovered neighbourhood reads more clearly against the rest; the recall and filter keep their
rules (they share the dim target, so their dimmed rest is 20 % darker too).

## Validation
`recall_emphasis` tests read the constants; `npm test`, tsc.

## Size
XS (two constants).
