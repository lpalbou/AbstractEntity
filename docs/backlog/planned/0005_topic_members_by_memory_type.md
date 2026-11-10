# Completed: A topic's members grouped by memory type; its description carries type counts and recency

## Metadata
- Created: 2026-11-10
- Status: Completed
- Completed: 2026-11-10
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

## Completion
- Done 2026-11-10 (operator's test round 2, topics lane): 97a1650 `src/topics_panel.tsx`
  (`kindCountWords`, `memoryKindOf`, `topicKinds`/`kindsLine`, `agoWords`, `memberGroups`): the
  topic row itself says the type counts and "last formed <relative> · since <day>" (lead facts,
  above the summary, so they are in view on unfold); members grouped under one line per type with
  its count, newest first inside.
- Validation: `topics_panel_kinds.test.tsx`; `npm test` 1719 green, 18/18 mutants red with a green
  control; harness D on castor's live data, desktop and 400 px touch ("118 episodes · 29 diary
  entries · 17 summaries · 10 interests · 3 world models", "last formed 11 hours ago · since 8 Jul
  2026" in view on unfold). CHANGELOG [Unreleased]: "A topic says what it holds by memory type".
- Follow-up: the operator's round 3 asks for ONE collapsed type sub-panel with hover and a
  scrollable list per type: 0016.
- Original path: `docs/backlog/planned/0005_topic_members_by_memory_type.md` (file still under
  planned/, move pending).
