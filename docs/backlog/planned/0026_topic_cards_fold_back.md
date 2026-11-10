# Planned: A clicked topic card folds back to how it was

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-4 test of 0.12.0 (2026-11-10 20:13, relayed by the framework session)
- Lane: W3 (round 4, 2026-11-10)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"we can't refold the topic as they were before clicking, quite annoying"

## Current code reality
- `src/topics_panel.tsx:885` `expanded`: the unfolded topics. `:887-894`: a focused topic is ADDED
  to `expanded` (and selected, scrolled to); nothing ever removes it when the focus goes.
- A click on a topic card calls `ctx.focus` (the card's `onClick`, `:764`; `focus`, `:925`:
  `onFocus(focused === key ? null : key)`). The second click un-focuses (the canvas's `onFocus`,
  `src/graph_canvas.tsx:2636-2644`, then `focusTopic(null)`), but the card stays unfolded with its
  facts, paths, memory types and members listed. Focusing another topic leaves the first one
  unfolded too: the list grows with every card clicked.
- Folding is left to the kit's chevron (`DisclosureList`,
  `node_modules/@abstractframework/ui-kit/dist/disclosure_list.js:234-237`: a 12 px button,
  `aria-hidden`, `tabIndex -1`) through `onToggleExpand` -> `toggleRow`
  (`topics_panel.tsx:917-923`, `:977-980`), or ArrowLeft on the row (`disclosure_list.js:157-161`).
  The row's click (select) and double-click (activate -> `focus`) never fold.
- `topicRows` (`:371-...`) lists a topic's rows only when `expanded.has(c.key)` (`:393-399`).
- Tests: `src/topics_panel.test.tsx:173` ("nothing is listed under a topic until it is focused or
  unfolded"), `topics_panel_kinds.test.tsx`, `topics_panel_lights.test.tsx`.

## Problem
Once he clicks a topic he cannot get the list back to how it was: the card stays open after he
lets the topic go, and every topic he looked at stays open.

## Scope
- Keep "unfolded by him" (the chevron, the arrow keys) apart from "unfolded because focused": a
  topic shows its rows when either holds.
- A second click on the focused card lets the topic go AND folds it back unless he had unfolded it
  himself before; focusing another topic (in the panel or by its title on the graph) folds the
  previous one on the same rule.
- The chevron and the arrow keys keep working as today; a pinned path or lit type of the folded
  topic lets go (`lights.unpin`, `:883`).

## Non-goals
No change to what an unfolded topic lists (0014-0016) nor to the panel's frame, head, place or size
(0027, lane W2: W2 owns `.gc_topics` and its head, W3 the rows in `.gc_tp_body`).

## Expected outcomes
Click a folded topic: it unfolds and the graph focuses it. Click it again: it folds back and the
graph lets it go; the list is exactly as before the first click.

## Validation
- Tests: click/click restores the fold; focusing another topic folds the previous; a topic
  unfolded by its chevron stays unfolded through a focus and un-focus; the title on the graph
  follows the same rule.
- Screenshots on the hermetic app (scratch build, never :8080) at 1440 x 900 and 400 px: before,
  focused, refolded.
- Targeted `topics_panel*` tests and `npm test` green; adversarial review with the screenshots
  before merge.

## Size
S (1-2 hours).
