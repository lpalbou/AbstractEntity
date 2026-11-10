# Planned (built): A world-model revision is one ledger row, by its title, that opens it

## Metadata
- Created: 2026-11-10
- Status: Planned (built, waiting for the operator's check)
- Completed: N/A
- Source: the operator, round 5 (2026-11-10 23:07, aletheia's ledger at 10:02), relayed by the Entity/memory
  session
- Lane: W2

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"this is not really readable; can we have the name of the world model instead? and clicking on it would
open it?" (on ten consecutive rows "Belief revised — ex:world_model-dd6e8096295b9df59f4259e180
refines/derived_from — world-model revision 49 for topic:diary-entry (evidence changed)").

## Current code reality (before)
- A world-model revision reaches the stream as the new version's binding (its card fields:
  `card_revision`, `source_count`, `target`), the closed version's closure (its title, its card fields,
  `replacement_ids` = the new version), then one closure per LINK of the closed version (display kind
  "memory", title "<graph id> <relation>", the closed version's graph id), all with the same reason
  string ("world-model revision N for <target key> (evidence changed)").
- `src/ledger_lines.ts` made one "Belief revised" row per closure: the version's row named it by title
  but carried the reason string (the target's key), and each link's row named the graph id and the
  relation (`relationPredicate` does not read `world_model`'s underscore). On castor's snapshot: nine
  rows for revision 2 of "Castor's working notes on admin (Nov 2026)".

## Scope
One row per revision: "Belief revised — <title>", detail from the card fields (the new version's
revision, how many memories it is drawn from, "evidence changed (N before)" when that count changed); a
click opens the new version in Detail; the links' closures that follow it in the same revision have no
row (structural: the same graph id and replacement ids, in stream order); "a world model" and one #SEAM
log when the title is missing. No key, id, relation name or subject key in the words.

## Non-goals
The feeling rows ("Felt +2 about ex:summary-…") and other closures' reasons are not changed here.

## Expected outcomes
A revision reads as one sentence about a named world model, and a click shows it.

## Validation
- `src/ledger_world_models.test.ts`: a ten-link revision gives one row with the title, clickable (the new
  version), no id/relation/key in any row; red with per-link rows, with the closed version as the target,
  or with the reason string in the words (mutants checked).
- Castor's snapshot through the app's fold: 0 "Belief" rows name an id or a relation.
- Hermetic shot (never :8080) of the row at 1440.

## Size
S.
