# Planned: The side tabs read chat, card, health, book, world, lessons, detail, ledger

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-4 test of 0.12.0 (2026-11-10 20:13, relayed by the framework session)
- Lane: W1 (round 4, 2026-11-10)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"i would reorganize the tabs: chat (to talk to it), card (who the entity is), health (how it is), book (its history), world (the models of the world it created), lessons (what it learned), details (when we select a memory) and ledger."

## Current code reality
- `src/entity_view.tsx:2195-2330` `SideTabs`: the `tabs` array, rendered in its order
  (`src/drawer.tsx:196-197`, the `st_rail` tab list). Chat (`:2208`) and Card (`:2241`) only for a
  verified gateway source (`:2205`), then Detail (`:2249`), Book (`:2265`), Health (`:2271`),
  Lessons (`:2288`), World (`:2302`), Ledger (`:2316`).
- So today: chat, card, detail, book, health, lessons, world, ledger. `defaultTab="ledger"`
  (`:2196`); selecting a memory jumps to Detail (`setRequestedTab`, `:1515`, `:2159`).
- `src/side_tabs_state.test.ts:5` uses its own three-tab list; no test pins the page's order.

## Problem
The tabs do not follow the order he reads the entity in: who it is and how it is come after the
selected memory.

## Scope
- Order: chat, card, health, book, world, lessons, detail, ledger. Without a verified gateway (no
  chat, no card): health, book, world, lessons, detail, ledger.
- Titles and icons unchanged ("Detail" is his "details"); the default tab, the jumps to Detail and
  Book, and the emphasized chat unchanged; the same order in the phone's strip.

## Non-goals
No change to any tab's content, title or icon.

## Expected outcomes
The rail reads chat, card, health, book, world, lessons, detail, ledger on a desktop and on a phone.

## Validation
- A test pinning the order for both source kinds (verified gateway, file or demo).
- Screenshots on the hermetic app (scratch build, never :8080) at 1440 x 900 and 400 px of the tab
  strip.
- `npm test` green; adversarial review with the screenshots before merge.

## Size
XS (under an hour).
