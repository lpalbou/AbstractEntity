# Planned: The monitor opens in the timeline's empty space; its explanatory block goes

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-4 test of 0.12.0 (2026-11-10 20:13, relayed by the framework session)
- Lane: W1 (round 4, 2026-11-10)
- Follows: 0018 (round 3: the monitor docked as a strip above the timeline; 6d5b3a3, c6bce8c)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"monitor, absolutely fucking not. monitor can be a button there, that's fine BUT the monitor should open in the empty space above [the empty area of the timeline block, right of the lanes, above the controls]. [the Cognitive Monitor block with 'his words at the timeline's position', 'basis v1.0.0 …', the italic note, the 'read his words' button and 'reads his diary and conversations once…']: completely remove that"

## Current code reality
- Round 3: `MonitorDock` (`src/cognition_wave_panel.tsx:132-139`) is mounted in `.entity_main`
  between the canvas and the side panel (`src/entity_view.tsx:2193-2200`); the timeline is mounted
  after `.entity_main` (`:2385`). `src/entity.css:4444-4475`: while it is open the main area is a
  grid, the dock a strip in row 2 under the graph (up to 38 % of the viewport height, its own
  scroll), the side panel down both rows; `.cw_panel.cw_dock` (`:4476-4484`) is a 220-300 px head
  column beside the reading. Phone (`:4545-4565`): the open monitor takes the graph's place.
- The toggle he keeps: "🧠 Monitor" in the transport after ● Live (`src/timeline.tsx:304-318`,
  `et_btn et_monitor`, `aria-pressed`).
- The timeline block: `src/timeline.tsx:213` `.entity_timeline.et_grid`,
  `src/entity.css:3033-3039` three columns (`max-content minmax(0, 1fr) auto`: lane labels, lanes
  and scrub bar, transport). Each of the five lane rows (`timeline.tsx:60-66`) puts an empty
  `<span />` in the third column (`:224`); the transport `.et_right` (`:254`,
  `entity.css:3115-3121`: five buttons, the speed, ● Live, 🧠 Monitor, the position) sits on the
  time row only. So the cell above the transport, as wide as the transport and as tall as the
  five lanes, is empty: the space he points at.
- That cell is short: five lanes of about 10-12 px plus gaps (about 70 px, estimated), while the
  bloom alone is 200 px square (`cognition_wave_panel.tsx:83` `BLOOM = 200`). Open, the monitor
  makes the block taller there.
- Phone (`src/entity.css:6318-6327`): two columns, the empty spans hidden, the transport on its own
  row: no empty cell; the open monitor keeps the round-3 phone rule.
- The block to remove (`cognition_wave_panel.tsx:236-277`): the follow line `cw_follow` ("his words
  at the timeline's position" / "the reply in view in his conversation", `:243`), the provenance
  `cw_prov` ("basis v1.0.0 · …", `:162-168`, `:244`), the italic `cw_framing` (`FRAMING`, `:85`,
  `:246`), and the one-pull bar (`:266-276`): "read his words" (`:273`) and "reads his diary and
  conversations once, for the replay; the read shows in his stream" (`:275`). CSS
  `src/entity.css:4369-4420`, `:4495-...`.
- The read is an explicit act by ruling (c1824, flood fix c2155; comment `:259-263`): it costs door
  reads and embeddings and lands `diary_read` markers in his stream. It is kept once per home for
  the page's life (`corpusReads`, `:96-123`). Today opening the monitor reads nothing; the button
  does.
- Tests: `src/cognition_dock.test.tsx` (`:50` "the page mounts the dock under the graph", `:98` one
  read per home, `:175` "read on demand with its button", "The framing is always said").

## Problem
The open monitor takes a full-width strip off the graph and opens on a block of explanations and a
button, while the space beside the lanes stays empty.

## Scope
- The 🧠 Monitor button stays where it is; open, the monitor fills the timeline block's third
  column over the lane rows (above the transport, right of the lanes); no strip above the
  timeline and nothing taken from the graph's width or the side panel. The block grows only by
  what the monitor needs beyond the lanes' height; the implementer proposes the alignment of the
  lanes and the scrub bar (shown in screenshots).
- The explanatory block goes: the follow line, the provenance, the italic note, the "read his
  words" button and its hint. The title and the ⓘ stay; what the ⓘ window lacks of the removed
  words (the basis provenance, "his words, not his inner state") moves into it, so nothing honest
  is lost.
- The read: the press on 🧠 Monitor becomes the explicit act (the c1824 rule kept: never on load,
  never on a scrub); a kept read shows at once on reopening; no re-read control in the dock (if he
  wants one, he says).
- Phone: the open monitor keeps the round-3 rule (in the graph's place), without the removed
  block.

## Non-goals
No change to the reading itself (the bloom, the tone row, the turn, the live per-reply reading); no
change to the transport's other controls.

## Expected outcomes
He presses 🧠 Monitor: the bloom and the turn open in the empty space right of the lanes, the graph
keeps its size; no block of explanations, no read button.

## Validation
- Tests: the monitor mounts in the timeline's third column when open and nowhere else; the removed
  words and button are absent; the press opens and reads once (a reopen reads nothing); a scrub
  reads nothing; the ⓘ window carries the moved words. `cognition_dock.test.tsx` rewritten where
  its round-3 pins change.
- Screenshots on the hermetic app (scratch build, never :8080) at 1440 x 900 (closed; open on the
  replay; open live with the conversation) and 400 px (open), the graph's box measured equal with
  the monitor open and closed on the desktop.
- `npm test` green; adversarial review with the screenshots before merge.

## Size
M (half a day).
