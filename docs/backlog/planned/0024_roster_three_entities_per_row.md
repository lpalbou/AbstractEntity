# Planned: The roster shows at least three entities per row on a desktop

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-4 test of 0.12.0 (2026-11-10 20:13, relayed by the framework session)
- Lane: W4 (round 4, 2026-11-10)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"UI should be responsive (desktop+phone). but on a desktop, i would probably put at least 3 entities per row"

## Current code reality
- `src/entities_index.tsx:434-451`: `div.eix_grid.eix_cards` renders one kit `EntityCard` per
  entity (`RosterEntityCard`; the kit draws the card, `.af-entity-card`).
- `src/entity.css:5076-5080` `.eix_grid`: `grid-template-columns: repeat(auto-fill,
  minmax(min(340px, 100%), 1fr))`; `src/roster_cards.css:4-7` sets the gap to 14 px, `:11-16` 12 px
  below 768 px (one card per row), `:8-10` fits the phase bar in the card's actions row.
- The column is narrow: `src/entity.css:3567-3575` `.entities_index { max-width: 900px; padding:
  28px clamp(20px, 6vw, 80px) }`, widened at `:5888-5892` to `max-width: clamp(900px, 60vw - 100px,
  1320px)` (its comment: "1280-1600 px windows keep today's 900 px column exactly").
- Arithmetic at 1440 px: 60vw - 100 = 764, so the 900 px floor; 80 px padding each side leaves
  740 px; three 340 px columns need 3 x 340 + 2 x 14 = 1 048 px, so two per row. Three columns
  first appear near a 2 180 px window.
- Phone: `src/entity.css:6606-6615` (the old flat-section rule) and `roster_cards.css:11-16`.
- No test pins the grid's columns or the column's width (grep of `eix_grid` and `clamp(900px` in
  `src/*.test.*`).

## Problem
On a 1440 px window the roster is two cards per row in a 740 px column with wide empty margins on
both sides.

## Scope
- Desktop (a 1280 px window and wider): at least three cards per row, more on wide screens when
  they still fit at the card's minimum width; the roster's column widens to carry them (the 900 px
  floor and the clamp revised), its side gutter kept.
- The card's minimum width is measured on the kit card (its actions row with the phase bar) so
  three fit at 1280 px and stay legible; if the kit card cannot be legible that narrow, raise it
  with the kit's owner (uic) rather than override the kit's internals here.
- Between phone and desktop (about 768-1279 px): two per row, stated in the review.
- Phone (below 768 px): one card per row, unchanged.

## Non-goals
No change to the card's content, actions or phase bar; no change to the roster head, the empty
state or "How this works".

## Expected outcomes
At 1440 x 900 and at 1280 px: three cards per row, equal widths, the row's edges aligned with the
head; at 400 px: one per row, as today.

## Validation
- A test pinning the grid rule and the column width at 1280 and 1440 px (the arithmetic in one
  pure helper, or the stylesheet's rules read by the test).
- Screenshots on the hermetic app (scratch build, never :8080) at 1440 x 900 and 400 px with at
  least four entities, plus 1280 and 1024 px.
- Targeted tests (`roster_tiles`, `roster_empty`, `index_page`) and `npm test` green; adversarial
  review with the screenshots before merge.

## Size
S (1-2 hours).
