# Planned: The World tab opens on two clear lines: what his world model is

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
"this is the world model, how the entity represents and sees the world. 2 lines top, better explain."

## Current code reality
- `src/lessons_world_panels.tsx:212-218` the head: "🌍 World" and the sub "his orientation cards
  — N live · M superseded" (`:216`).
- `:219-221` `.lw_framing`: "One card per "something" he understands — a person, a place, a
  concept, a system. The card is the distilled working model (what would remain if everything
  else vanished); "why he thinks this" unfolds its provenance — the memories behind the claim,
  each one click away. Sleep maintains the cards; his own revisions refine them." About 330
  characters at 11 px italic (`src/entity.css:4680-4686`) in the side panel's default 380 px
  (`src/drawer.tsx:40`): roughly six lines (estimated).
- `:222-226` a note shown only when his cards cover two subjects or fewer; it carries a ship date
  ("which shipped 2026-07-19"), developer words in an end-user tab. Not in his ask; flagged for
  his word.
- No test pins the framing's words (grep of "One card per" in `src/*.test.*`).

## Problem
The tab does not say plainly what it shows, and the explanation it has is long and abstract.

## Scope
- The top of the tab says, in two lines at the default width and at 400 px, what the world model
  is (how he represents and sees the world) and how to read a card. Draft for the operator's word
  (the implementer may refine): "His world model: how he represents and sees the world." / "One
  card per person, place, idea or system he understands; "why he thinks this" shows the memories
  behind it."
- The head's sub says "world model" too ("his world model — N live · M superseded"), so head and
  lines agree.

## Non-goals
No change to the cards, their provenance or the superseded list; the narrow-breadth note stays as
it is unless the operator asks.

## Expected outcomes
Opening World, he reads in two lines what it is and how to use it.

## Validation
- A test pinning the two lines' words (and the old framing gone).
- Screenshots on the hermetic app (scratch build, never :8080) at 1440 x 900 (default side panel
  width) and 400 px: the two lines, each a full line or less.
- `npm test` green; adversarial review with the screenshots before merge.

## Size
XS (under an hour, plus the words' check with the operator).
