# Planned: Remove the blueprint page (a Flow powers the entity's cognition later)

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-3 test of 0.12.0 (2026-11-10 17:45, relayed by the framework session)
- Lane: W1 (round 3, 2026-11-10)
- Root item: `abstractframework/docs/backlog/proposed/1200_a_flow_powers_the_entitys_cognition.md`
  (step 1 is this item)

## ADR status
- Governing ADRs: None here; the Flow-powered cognition (root 1200) cites ADR-0041 (the operator's
  own workflows as visual flows).
- ADR impact: None

## Operator's words
Relayed: "he thinks it duplicates what Flow should do and wants it removed, with 'a workflow
powers the entity's cognition' later".

His own words, as recorded in root 1200: "the idea was to be able to control the AI cognition
directly from a diagram... but in effect, that's more what abstractflow does... so I wonder if we
should remove that page here, and later enable a workflow to power the actual cognition of an
entity."

## Current code reality
- Reached by the roster's "🧭 blueprint" button (`src/entities_index.tsx:385-393`) and
  `?page=blueprint` (`src/index_page.ts:18-35`; `src/entity_view.tsx:390-420`, `:642`, `:931`,
  `:1209`, the page at `:1955-1981`, the roster's `onBlueprint` `:1991`).
- The page renders `BlueprintPanel` (a static SVG of `spec/cognition_graph.json`),
  `BlueprintTunables` (PUT `/entities/spec/phases {tunables}`) and `PhaseGraphEditor`
  (PUT `{graph: {edge_ops}}`).
- Modules used only by it: `blueprint_panel`, `blueprint_tunables`, `phase_editor`, `phase_map`,
  `edge_ops`, and five `stream_source` exports (`src/stream_source.ts:766-805`, `:928-955`),
  imported only by `entity_view.tsx:46-48`.
- CSS: `src/entity.css:5745-5858`, `:5923`, `:5947-5975`, about `:6792`.
- Screenshot scenes: `scripts/responsive.screens.mjs:146-151`, `scripts/space.screens.mjs:222-227`.
- Tests: `blueprint_panel.test.ts`, `edge_ops.test.ts`, `cognition_graph.test.ts:128-142`,
  `index_page.test.ts`, `roster_empty.test.tsx:117-125`, `phone_space.test.tsx:181`.
- Docs: `README.md:115,211,227`, `docs/api.md:60,90,327`, `docs/architecture.md:18,126,133,143`,
  `docs/entity-phases.md:227`, `docs/README.md:13`, `llms.txt:9,11` (and `llms-full.txt`
  regenerated).
- MUST STAY: `spec/entity_phases.json` (the gateway's assets copy, the runtime's vendored copy and
  their tests read `abstractentity/spec`), `spec/cognition_graph.json` (the gateway serves
  `/spec/cognition-graph`), `src/spec_sync.ts` and its toolbar drift note
  (`src/entity_view.tsx:1881-1891`, today "🎛 blueprint modulated", reworded without
  "blueprint"), `index_page.ts` reduced to roster and fleet.

## Scope
- Remove the page, the roster button, `?page=blueprint` (an old link lands on the roster), the
  modules and exports used only by it, their CSS, scenes and tests; rewrite the tests that pin
  the index pages and the roster.
- Reword the drift note; keep `spec_sync.ts` and both spec files.
- Docs and `llms*.txt` updated in the same change (the diagram itself lives on in the runtime's
  docs, `abstractruntime/docs/entity-runtime.md`, per root 1200).

## Non-goals
No Flow-powered cognition here (root 1200 step 2, its own track); no change to the gateway's spec
routes or to the spec files; no replacement editor.

## Decision boundaries
Consequence recorded in root 1200 (2026-11-10 18:20): the page carried the only editors of the
operator dials (PUT `/entities/spec/phases` tunables) and of the phase-transition rules
(`edge_ops`). After removal the runtime still applies them from `spec/entity_phases.json`; no
screen edits them. If wanted back: Settings → Mind (a later item, on the operator's word).

## Expected outcomes
The roster has no blueprint button; `?page=blueprint` opens the roster; nothing in the app, its
docs or its tests says "blueprint"; the gateway and runtime spec checks still pass.

## Validation
- `npm test` green with the rewritten pins; `rg -i blueprint src docs README.md llms.txt scripts`
  finds no user-facing word (history stays: CHANGELOG, `docs/backlog/`; `spec/` is not edited and
  keeps its own wording).
- The gateway's and runtime's spec tests that read `abstractentity/spec` run once, unchanged.
- Screenshots at 1440 x 900 and 400 px of the roster (scratch build, never :8080).
- Adversarial review with the screenshots before merge.

## Size
M (half a day to a day, mostly removals and doc edits).
