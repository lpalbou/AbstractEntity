# Planned: The filter chips row goes; the clickable legend replaces it (search, topics, Context stay)

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-3 test of 0.12.0 (2026-11-10 17:45, relayed by the framework session)
- Lane: W1 (round 3, 2026-11-10)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"remove the filter chips row (All / Identity / Recent / Warm / Feelings / Diary / Dreams / Questions / N emphasized): the clickable legend replaces it; keep only search, topics, Context"

## Current code reality
- `src/entity_view.tsx:2140-2207` `.entity_lens_bar`: 🔍 search (`:2141-2149`), 🗺 topics
  (`:2153-2164`), `ContextToggle` (`:2166-2173`), the focused-topic chip "🗺 <topic> ✕"
  (`:2174-2187`, shown only while a topic filter is set), the `LENSES` chips (`:2188-2199`, from
  `src/graph_lenses.ts:16-25`) and the "N emphasized" / "nothing matches" count (`:2200-2206`).
- `emphasisIds` (`src/entity_view.tsx:1608-1625`) = lens ∩ search ∩ topic ∩ legend pick, which the
  canvas reads (passed as `searchIds`); lens clicks also trigger the camera fit.
- The clickable legend (`src/graph_canvas_legend.tsx`, 0004, built 4d2ee64): classes identity,
  memory, diary, feeling, scar, bond, then this life's extra kinds, and the relation types; a
  pressed item emphasizes its memories (never an engine record) and the camera frames them.
- What only the lenses offer today: Questions (open question/lesson records plus open diary
  questions), Recent (born or selected in the newest tenth), Warm (temporally active now).
  "Identity" differs: the lens means value/purpose/trait/interest
  (`src/graph_lenses.ts` `IDENTITY_KINDS`), the legend's class value/purpose/trait/claim without
  engine records (`src/graph_canvas.tsx:146`, `nodeClass`); interest is its own legend kind.
- `src/graph_lenses.ts` is imported only by `entity_view.tsx:61` and `graph_lenses.test.ts`.

## Problem
Two filter vocabularies over the same graph (the chips and the legend) disagree on words and sets
and cost a toolbar row.

## Scope
- Remove the lens chips and the "N emphasized" count; the bar keeps search, topics, Context.
- The focused-topic chip is not in his list: it is the topic state (it clears a focus), so it
  stays with "topics" unless the screenshots show the panel already says and clears it; the
  implementer states which in the report.
- `lens` state, its camera-fit trigger and `lensIds` leave `EntityView`; `emphasisIds` = search ∩
  topic ∩ legend pick. `graph_lenses.ts` and its test go if nothing else reads them.
- The lens-only sets (Questions, Recent, Warm) go with the row; any that is wanted back becomes a
  legend item in a later item, not here.
- Docs that describe the lenses (README, `docs/`, `llms*.txt`) updated in the same change.

## Non-goals
No new legend items; no change to the legend's sets (the "Identity" difference resolves to the
legend's meaning).

## Expected outcomes
One row less above the graph; filtering is the legend, finding is search, topics and Context
toggle what they did.

## Validation
- Tests: no lens chip rendered; `emphasisIds` without a lens source; the bar holds search, topics,
  Context (and the topic chip if kept); docs grep for the removed words.
- Screenshots at 1440 x 900 and 400 px before and after (scratch build, never :8080).
- `npm test` green; adversarial review with the screenshots before merge.

## Size
M (half a day to a day, with the docs).
