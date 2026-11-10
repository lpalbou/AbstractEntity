# Completed: Hovering a topic highlights its community; communities are visible and explorable

## Metadata
- Created: 2026-11-10
- Status: Completed
- Completed: 2026-11-10
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

## Completion
- Done 2026-11-10 (operator's test round 2, topics lane): 3adccc8 (a) a lit topic is a spotlight
  (`src/graph_canvas_spotlight.ts`: stronger rest circle 0.065 fill / 0.42 x 1.3 px ring, lit
  0.16 / 1.0 x 3 px plus a glow, the rest veiled, each member of the lit topic ringed in its
  colour); f6c2b77 (b) hovering a topic row in the panel lights it on the graph and dims the rest
  (`topicHover`, 150 ms hover intent, keyboard only on `:focus-visible`, touch never hovers,
  `hoverTopicRef` read by the frame loop); 43be8a1 review 2a fixes (an off-screen topic's hover no
  longer veils the whole graph, `circleMeetsCanvas`; the lit title always drawn).
- Validation: `graph_canvas_spotlight.test.ts`, `topics_panel_hover.test.ts`,
  `graph_canvas_review2a.test.ts`; `npm test` 1628 green (a), 1682 green + 1 red in another lane's
  uncommitted `roster_tiles` (b), 1751 green (review); mutants 13/13, 14/14, 13/13 red with a green
  control; harnesses A/B on castor's live data (scratch builds, never `dist/`), desktop and 400 px
  shots. CHANGELOG [Unreleased]: "A focused topic is a spotlight on the graph", "Hovering a topic
  in the Topics panel lights it on the graph".
- Follow-up: hovering a memory TYPE inside a topic is 0016 (round 3).
- Original path: `docs/backlog/planned/0002_topic_hover_highlights_its_community.md` (file still
  under planned/, move pending).
