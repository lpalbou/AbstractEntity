# Planned: On a phone the graph and the ledger get at least half the screen

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: lane W2's round-3 shots and their review (2026-11-10; untracked/round3-shots/W2/review/REVIEW.md,
  "Phone 400x700"), relayed by the framework session
- Lane: none yet (a phone layout pass; it touches the header, the phase bar and the drawer, W1's files)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
The standing rule (2026-10-25): "every UI works on a phone".

## Current code reality
Pre-existing (the same in every shot before and after round 3), measured at 400 x 700 on castor:
- The chrome above the graph eats the phone's height: the header (the identity line and its event
  count), the phase bar (five states and Stop on two rows), the status line, the toolbar and the
  lens row leave the graph canvas about 150 px tall (`untracked/round3-shots/W2/0017/after-castor-400-docked.png`).
- On that canvas the motion buttons (`.gc_motion_controls`, `src/entity.css:5948`, moved down on
  a short canvas) sit over the folded Topics panel's head, the foot of the phone overlay column
  (`.gc_overlay_stack`, `src/graph_canvas.css:671`).
- The Ledger tab gets no list height: only its key shows, no row
  (`untracked/round3-shots/W2/ledger-topic-links/after-castor-400-ledger.png`; `.entity_ledger`
  `src/entity.css:2547`, `.el_list` `:2565`).

## Scope
One phone layout pass: the chrome above the canvas (header, phase bar, status line, toolbar, lens
row) folds or tightens so that, at 400 x 700, the graph canvas and the open drawer's list (the
ledger first) each get at least 50 % of the viewport's height; the motion buttons and the folded
Topics head never share a row.

## Non-goals
No change to the wide layout; no new controls; the phone overlay stack (legend over the Topics
panel, `src/overlay_stack.ts`) keeps its order.

## Decision boundaries
What folds first (the phase bar's second row, the status line, the header's event count) is the
operator's call: show the candidates side by side before building.

## Expected outcomes
At 400 x 700 and 400 x 860: the graph shows his circles at a readable size, the ledger lists rows,
nothing overlaps the Topics head.

## Validation
- Canvas and ledger-list heights measured at 400 x 700 / 400 x 860 (>= 50 % of the viewport).
- Screenshots at those sizes on a hermetic build (never :8080), one phone screenshot checked before
  deploy.
- Adversarial review with the screenshots before merge.

## Size
M (a layout pass over several files).
