# Planned: The Topics panel: one card per topic, tinted with the topic's colour

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-3 test of 0.12.0 (2026-11-10 17:45, relayed by the framework session)
- Lane: W3 (round 3, 2026-11-10)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"Topics panel: one card per topic, the card background slightly tinted with the topic's colour"

## Current code reality
- `src/topics_panel.tsx:294-338` `topicRows` builds one flat list of rows: a topic row, then (when
  open) its facts row, its type groups and members; the kit's `DisclosureList` renders them
  (`:555-571`). Nothing frames one topic's rows together.
- The topic row (`:466-485`): a colour dot `.gc_tp_dot` (the only use of the topic's colour in the
  panel), the title, a count chip, the lead facts (types, "last formed"), a two-line summary and
  the verdict.
- CSS: `src/graph_canvas.css:223-241` (`.gc_topics`, opaque `--bg-panel`), `:254-296` (head and
  rows), `:308-372` (topic row, dot, title, summary).
- The colour is `topicColor(key)` (`src/topic_layout.ts:49-66`, twelve mid-tones in
  `TOPIC_COLORS`, keyed by the community's stable id), the same colour as the topic's circle on
  the canvas.

## Problem
The list reads as one long column of lines; where one topic ends and the next begins, and which
circle a row belongs to, is carried by a small dot only.

## Scope
- Each topic is one card: its row and, when open, everything under it (facts, types, members)
  inside one rounded box, a small gap between cards.
- The card's background is the topic's colour at a low strength (a `color-mix` of `topicColor`
  into the panel surface, roughly 8-12 %, a little stronger when the topic is focused or hovered),
  with a hairline border in the same colour; the dot may stay.
- Text keeps WCAG AA contrast (4.5:1) on every tint in both themes.
- The kit's `DisclosureList` keyboard and disclosure behaviour kept (a card per group of rows, or
  the rows of one topic styled as one card); if the kit cannot frame grouped rows, say so to the
  kit's owner rather than forking the list.

## Non-goals
No new colours (the twelve `TOPIC_COLORS` stay); no change to what a row says; the panel's
placement and size are 0017, the type sub-panel is 0016.

## Expected outcomes
At a glance the panel is a stack of coloured cards, each the colour of its circle on the graph.

## Validation
- A test that each card's tint derives from `topicColor(key)` and a contrast check of the text on
  all twelve tints, dark and light.
- Screenshots at 1440 x 900 and 400 px, dark and light, one topic open and all folded (scratch
  build, never :8080).
- `npm test` green; adversarial review with the screenshots before merge.

## Size
S (half a day).
