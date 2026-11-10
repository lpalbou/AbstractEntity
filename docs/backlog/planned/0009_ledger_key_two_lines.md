# Planned: Ledger key: drop the two help lines so the panel is 2-3 lines

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's live test of 0.12.0 (2026-11-10, ruling 10:40: every finding logged in his words)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
Ledger: remove "hover a time: its date, tick and event number" and "Colour key · times are UTC" so
the panel is 2-3 lines.

## Current code reality
`src/ledger_panel.tsx:162-217` `LedgerKey`: a `<details>` whose `<summary>` is "Colour key · times
are UTC", remembered open/folded in `localStorage` (`entity.ledger.keyOpen`), with the six colour
items, the "— day · tick —" mark and the italic note "hover a time: its date, tick and event
number" (`:213`); CSS `src/entity.css:2731-2785`.

## Scope
The key becomes the colour items and the day/tick mark only, always shown (no summary, no fold, no
stored state); the note's CSS goes with it.

## Expected outcomes
The key is two lines wide, three at 400 px.

## Validation
`npm test`, tsc.

## Size
XS.
