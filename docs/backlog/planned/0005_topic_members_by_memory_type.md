# Planned: A topic's members grouped by memory type; its description carries type counts and recency

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's live test of 0.12.0 (2026-11-10, ruling 10:40: every finding logged in his words)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
A topic's member list grouped by memory type ("xx episodes, xx dreams, xx interests…"); the
topic's description carries those type stats and when the last memories formed.

## Current code reality
`src/topics_panel.tsx:186-215` `topicRows`: an open topic lists a facts row (`topicFacts`) and then
its members as one flat list sorted by `first_seq` (newest first); no grouping by kind, no per-kind
counts, no "last formed" date in the facts.

## Scope
Members grouped under one sub-row per kind with its count; the facts row says "N episodes, N
dreams, N interests…" and when the newest member formed (from the members' first seen time).

## Non-goals
No change to what the gateway serves; counts are over the loaded members, worded as such when the
topic holds more than is loaded (`topicCountWords`).

## Expected outcomes
An open topic reads as a short summary by type, then its memories by type.

## Validation
`topic_rows` tests for grouping order, counts and the recency line; a 400 px screenshot.

## Size
S-M (half a day).
