# Completed: The most used green: a little more contrast

## Metadata
- Created: 2026-11-10
- Status: Completed
- Completed: 2026-11-10
- Source: the operator's live test of 0.12.0 (2026-11-10, ruling 10:40: every finding logged in his words)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
Green = the last accessed memories: boost the contrast a bit, not too much.

## Current code reality
`src/graph_usage.ts:101-109` `usageMix`: below the top decile the grey-to-green ramp stays at most
0.3 of the way to green; the top decile STEPS to 0.75 and climbs to 1. The green end is
`--adm-both` (`src/graph_canvas.tsx:279`, `:325`), shared with other UI, so the stop is the place
to change, not the token.

## Scope
Raise the top-decile step slightly (0.75 to 0.85) so the most used tenth separates more from the
grey; nothing else.

## Expected outcomes
The green memories and lines stand out a little more; the grey whisper is unchanged.

## Validation
`graph_usage.test.ts` pins the new step; `npm test`.

## Size
XS (one constant).

## Completion
- Done 2026-11-10 (trivial fix, operator ruling 10:40): Top-decile step 0.75 -> 0.85 in `src/graph_usage.ts` `usageMix`; `graph_usage.test.ts` pins 0.85.
- Validation: `npm test` 1609 green, `tsc` clean. Not screenshot-checked (credits); the operator sees it on the next local redeploy.
- Original path: `docs/backlog/planned/0007_most_used_green_contrast.md`.
