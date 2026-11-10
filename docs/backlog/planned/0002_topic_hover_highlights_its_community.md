# Planned: Hovering a topic highlights its community; communities are visible and explorable

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's live test of 0.12.0 (2026-11-10, ruling 10:40: every finding logged in his words)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
Hovering a topic in the panel should highlight its community in the graph and dim the rest:
"today nothing is visible; before hovering a node he could not even see the community". Improve
community visibility/rendering, and interactive ways to see where they are and what they contain.

## Current code reality
- `src/topics_panel.tsx`: the topic row has `onClick={() => focus(c.key)}` (line 290); no hover
  handler — hovering a topic does nothing on the canvas.
- `src/graph_canvas.tsx:1280-1300`: a community is a circle at fill alpha 0.055 (0.09 focused) and
  stroke 0.3 (0.75 focused), dimmed to 0.25 when an emphasis set misses it — nearly invisible on
  the dark theme before a focus.
- The emphasis mechanism (`src/recall_emphasis.ts` `emphasisDriver`, `DIMMED_NODE`) already dims
  everything outside a set for hover/selection/filter/recall.

## Problem
A community cannot be found on the map until it is clicked; hovering its name shows nothing.

## Scope
Topic-row hover (and keyboard focus) drives the canvas emphasis with the topic's member ids; a
more visible community rendering (stronger ring/fill, its title at the ring); a way to see what a
community holds from the canvas (its hover card already exists: `topicCard`).

## Non-goals
No new layout algorithm (see 0006).

## Expected outcomes
Hovering a topic lights its members and ring and dims the rest within the existing 0.5 s ramp;
communities are readable without hovering.

## Validation
A test that a topic-row hover sets the emphasis to its members; screenshots dark and light, wide and
400 px.

## Size
M (one day).
