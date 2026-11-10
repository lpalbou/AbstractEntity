# Planned: The live activity panel as actionable realtime feedback

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's live test of 0.12.0 (2026-11-10, ruling 10:40: every finding logged in his words)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
The live activity panel (turns/recall bars) must be actionable realtime feedback: what the entity
is doing, memory passively retrieved, tools used with key parameters, memory actively retrieved,
number of iterations.

## Current code reality
`src/turn_pulse_bars.tsx` (mounted at `src/chat_drawer.tsx:1500`): three rows of bars — turns
(pips per turn of the thread), recall (shelf memories, "+N formed") and the recall token estimate —
numbers from `turn_pulse.ts`. It shows quantities, not what he is doing: no current phase or
step, no tool names or parameters, no split between passive recall and his own memory searches,
no iteration count.

## Dependencies and related tasks
Root `docs/backlog/planned/1196_live_activity_panel_actionable_realtime_feedback.md` (gateway
ledger stream fields, shared UIC activity row). This item is the app half.

## Scope
The panel shows, live: the current activity line; passive recall (count, top titles); each tool
call with its key parameters; active memory retrieval (his searches and hits); the iteration count.
Built on the fields 1196 serves; no client-side guessing.

## Expected outcomes
During a turn he can tell at a glance what the entity is doing and why it is taking time.

## Validation
Tests on a recorded turn stream; a live check on the hermetic gateway (never :8080).

## Size
M-L (1-2 days, after the gateway fields).
