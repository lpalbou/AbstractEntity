# Planned: The status sentence never shifts the toolbar; the buttons read Files, then Settings

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
"the status sentence under the toolbar ('his own time stopped after repeated tick failures — restart when ready') must never shift the layout; and the buttons read Files, then Settings"

## Current code reality
- `src/entity_view.tsx:1814-1900` `.entity_controls`: one flex row (the phase bar, the day-cause
  note, Settings, Files, then the other notes). `src/entity.css:781-789`: no wrap rule, so its
  items shrink and a long one wraps inside itself.
- The tick-failure note `span.ec_note.ec_warn` (`:1893-1897`, shown when the loop is not running
  and `stopped_by === "failures"`) is appended to the row after the buttons, like the inbox
  warning (`:1876`), the blueprint-modulated / phase-graph drift notes (`:1881-1891`) and
  `controlNote` (`:1898`).
- `src/entity.css:1005-1010` `.ec_settings_btn { margin-left: auto }`: the free space sits before
  Settings, so any note after the buttons takes part of it and pulls Settings and Files left.
- `src/entity.css:1055-1058` `.ec_note`: colour and size only, no `white-space: nowrap`, no
  `min-width: 0` or ellipsis, so a long sentence wraps and raises the row (the graph moves down).
- Phone (`src/entity.css:6503-6520`): one swipeable row, every child `flex: none`; a note there
  lengthens the row and can push the buttons out of sight.
- Order: Settings (`src/entity_view.tsx:1858`) precedes Files (`:1868`);
  `src/files_view.test.tsx:58-71` pins "Files right after Settings, nothing between".

## Problem
When his own time stops (or any note appears), the controls jump: the buttons slide left and the
row can grow a line.

## Scope
- Files first, then Settings, at the right end of the row (one group carrying the
  `margin-left: auto`), nothing between them; the `files_view.test.tsx` pin rewritten to the new
  order.
- Every note in the row (tick failure, inbox warning, modulated/drift, `controlNote`) sits where it
  can never move the buttons nor change the row's height: one line, `min-width: 0`, ellipsis, the
  whole sentence as its `title` and accessible name; or a reserved slot of fixed height. The
  implementer picks; the measured test below decides.
- 400 px: the buttons stay where they are (and reachable) whether a note shows or not.

## Non-goals
No change to the notes' words or to when they show; no change to what Settings and Files open; no
restart button (the sentence stays a note).

## Expected outcomes
The toolbar's height and the Files/Settings boxes are identical with and without any note, at
1440 x 900 and 400 px; the buttons read "Files", "Settings".

## Validation
- A test pinning the order (Files before Settings, nothing between) and the note slot's CSS.
- Screenshots at 1440 x 900 and 400 px with the tick-failure note shown and hidden (scratch build,
  never :8080); the row height and both button rects measured equal in each pair.
- `npm test` green; adversarial review with the screenshots before merge.

## Size
S (2-3 hours).
