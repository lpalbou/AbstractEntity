# Planned: the monitor uses the timeline's space: the bloom large with its petal labels, the tone channels named, the time and its two buttons stacked above the transport

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator, 2026-11-10 23:07 (relayed by the framework session)
- Lane: W1 (round 5)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"better use the space given; the emotion monitor is too small and no 3 letter codes; they must be here,
but smaller font, like for the right one; we also lost the tree, put it back; i think you could put the
time and the 2 buttons above the [transport controls ⏮ ◀ ▶ ▶ ⏭ 5x] so that you have more vertical space"

## Current code reality (read 2026-11-10, after 0032)
- `src/timeline.tsx`: one grid (label | lane | right column); the right column holds the monitor's slot
  over the lanes' five rows (`.et_monitor_slot`, at most the lanes' 88 px) and, on the time row, one
  transport row `.et_right`: ⏮ ◀ ▶ ▶ ⏭, the speed, ● Live, 🧠 Monitor and the position
  ("22:06 UTC · 157864/157864").
- `src/cognition_wave_panel.tsx` / `src/cognition_wave_inline.tsx`: the compact reading, an 84 px bloom
  with no petal labels and the tone row of five 3-letter codes (WAR TSN REF STR CER) with signed values
  (`ToneRow`, `src/cognitive_monitor.tsx`); the conduct gauge only live with a conversation open.
- The bloom's petal labels and their cards (`BloomAxisOverlay`, `petalLabelTransform`,
  `registerExplainer`) were removed as unused in a76439b.

## Scope
1. The position and the ● Live and 🧠 Monitor buttons move to their own row above the transport row
   (⏮ ◀ ▶ ▶ ⏭ and the speed stay on theirs), both right-aligned in the timeline block.
2. The open monitor takes the space right of the lanes, the block's full height; opening it changes
   neither the graph's nor the timeline's height (closed vs open measured equal at 1440x900, 1280x720,
   400x700).
3. The five tone channels show their full names (warmth, tension, reflection, structure, certainty) in a
   smaller font than their values; no channel code is visible.
4. The bloom's petal labels come back (a76439b's overlay and its cards, with their tests), the bloom drawn
   as large as the block allows.
5. Phone: the same monitor in the lanes' place while open.

## Non-goals
No change to what is read or when (the press reads, once per entity); no new data.

## Expected outcomes
A readable monitor: a bloom with its register labels, five named channels, the stacked controls; the
graph's height unchanged by opening it.

## Validation
- Tests: the controls' two rows and their order, the names shown and no channel code, the overlay back
  with its tests, the layout rules.
- Hermetic shots (:3014) at 1440x900, 1280x720 and 400x700, closed and open, with `.entity_main`, canvas
  and timeline heights measured.
