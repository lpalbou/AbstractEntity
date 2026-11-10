# Planned: The Settings screen loads slowly

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's live test of 0.12.0 (2026-11-10, ruling 10:40: every finding logged in his words)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
The Settings screen loads slowly (a note; a root item covers load performance).

## Current code reality
`src/workspace_panel.tsx` `SettingsPanel` (opened from `src/entity_view.tsx:346`, Settings → Mind
with Sleep). Not profiled here.

## Dependencies and related tasks
Root `docs/backlog/planned/1195_load_performance_code_web_and_entity_settings.md` owns the
measurement and the gateway side; this item is the app half once 1195 names the cause.

## Scope
Measure what the screen waits on (requests in series, a large read); fix the app side (parallel
reads, a skeleton while values load).

## Expected outcomes
Settings opens at once and fills in within a second on the live gateway.

## Validation
A timed trace before/after on the hermetic gateway.

## Size
S-M (after 1195's measurement).
