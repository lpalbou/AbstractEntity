# Planned: Memory types inside a topic: one collapsed sub-panel with counts; hover shows where, click opens the list

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
"memory types inside a topic = ONE sub-panel collapsed by default showing the types with their counts; hover a type shows where those memories sit in the clusters; click opens the scrollable list"

## Current code reality
- 0005 (completed, 97a1650) grouped an open topic's members by type: `memberGroups`
  (`src/topics_panel.tsx:262-282`) gives one static type line per kind ("118 episodes",
  `.gc_tp_group`, `:511-518`) followed by ALL its members (`:526-536`), open by default, no fold.
- A type line carries `data-tkey` = the topic's key, so hovering it lights the whole topic, not
  that type (`topicHover` `:347-387` → `onHoverTopic`, one key only).
- `memoryKindOf` (`:152-154`) maps a node to its memory type (diary = diary).
- The panel body scrolls as one (`.gc_tp_body`, `src/graph_canvas.css:299-306`), the panel capped
  at 58 % of the canvas: a topic of 118 episodes pushes every other type and topic far down.
- The topic row already says the type counts in its lead line (0005's `kindsLine`).

## Problem
An open topic dumps every member at once, and pointing at a type does not show where those
memories are.

## Scope
- One sub-panel per open topic ("Memory types"), collapsed by default; collapsed it shows the types
  with their counts (one line or chips, most first), and nothing lists members.
- Hovering a type (hover intent, or keyboard `:focus-visible`) lights that type's members of this
  topic on the graph and dims the rest, the topic's circle still lit (a hover carrying the topic
  key AND the type, not the topic key alone).
- Clicking a type opens its members as a list with its own bounded height and scroll, so the other
  types stay in view; clicking again closes it.
- The lead line's type counts are not said twice (the sub-panel's head carries them, or the lead
  keeps them and the sub-panel shows the types only; the implementer picks one and states it).

## Non-goals
No change to what the gateway serves or to the type order and words of 0005; the card frame is
0014.

## Expected outcomes
An open topic shows a short line of types; pointing at "29 diary entries" shows where they are in
the circle; clicking it lists them in a small scrolling box.

## Validation
- Tests: the sub-panel folded by default; a type hover emits (topic, type) and the emphasis is
  that type's members only; a click opens a bounded list; `memberGroups` order unchanged.
- Screenshots at 1440 x 900 and 400 px: folded, a type hovered (lit on the graph), a type opened
  (scratch build, never :8080).
- `npm test` green; adversarial review with the screenshots before merge.

## Size
M (one day).
