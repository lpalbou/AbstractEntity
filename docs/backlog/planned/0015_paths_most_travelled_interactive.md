# Planned: "Paths most travelled": hover shows the full pair and lights the path; click frames it

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
"'paths most travelled': no hover, no interactivity, truncated text → hover shows the full pair and lights the path in the graph, click frames it"

## Current code reality
- Memory serves `facts.paths: [{from, to, count}]`, a topic's member pairs most used together over
  the facts window (7 days) (`src/communities.ts:75`, parsed `:184-191`).
- `src/topics_panel.tsx:224-230` `topicFacts` keeps only the two titles (`titleOf(p.from)`,
  `titleOf(p.to)`) and DROPS the graph ids, so nothing downstream can find the two memories.
- The facts row renders each pair statically (`:490-501`, `.gc_tp_path`): two ends, "↔", the
  count; each end cut by CSS ellipsis (`src/graph_canvas.css:473-488`), no `title`, no handler.
- What the canvas already offers: the hovered-topic spotlight (`hoverTopicRef`,
  `src/graph_canvas.tsx:701`; `src/graph_canvas_spotlight.ts`), the emphasis driver, `frameTopic`
  (`:2199-2213`) framing a box in the part the panel leaves free (`freeCentre`, `:558`) through
  the `moveCamera` glide (0003), and the panel's 150 ms hover intent (`topicHover`,
  `src/topics_panel.tsx:347-387`).

## Problem
The most useful fact about a topic (which of its memories he uses together) cannot be read in full
and cannot be found on the graph.

## Scope
- `topicFacts` keeps `from`/`to` graph ids with the titles (the pair's two fold rows resolved the
  way member rows are).
- A pair is a focusable item: a mouse or pen resting on it (the 150 ms hover intent) or a
  keyboard `:focus-visible` shows the whole pair (both titles unclipped, wrapped in place or in a
  tooltip) and lights the path on the graph: the two memories and, where the graph draws one, the
  line between them; the rest dims as for a topic hover. Leaving lets go at once.
- A click (or tap) frames the two memories with the glide, in the free part of the canvas, and
  keeps them lit until the next hover, a click elsewhere or Escape. Touch has no hover: a tap shows
  the whole pair and frames it.
- A pair whose ends are not loaded says so on hover and frames nothing.

## Non-goals
No change to how memory computes paths or to the 7-day window; no new line drawing (an absent line
stays absent).

## Expected outcomes
Hovering "A ↔ B (12)" shows both full titles and the two memories light up; clicking it brings
them into view smoothly.

## Validation
- Tests: `topicFacts` keeps the ids; the pair's hover emits its two ids after the intent delay and
  none on a sweep; click frames both ends (source pin on `moveCamera`, no direct camera write).
- Screenshots at 1440 x 900 and 400 px: a pair at rest, hovered (lit), clicked (framed) (scratch
  build, never :8080).
- `npm test` green; adversarial review with the screenshots before merge.

## Size
M (one day).
