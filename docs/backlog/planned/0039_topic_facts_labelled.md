# Completed: An expanded topic's facts as labelled facts, not sentences

## Metadata
- Created: 2026-11-11
- Status: Completed (in place under planned/, move pending)
- Completed: 2026-11-11
- Source: the operator, round 6 (2026-11-11 02:00), relayed by the Entity/memory session
- Lane: W3

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
On the facts block of an expanded topic card ("used 1407 times in the last 7 days / most used:
Settled state declared after rejecting a dream bridge, then back to rest / 109 memories bridge to
other topics"): "do a better job at formatting the information, eg terrible to have so much
unformatted text"

## Current code reality (before)
- `src/topics_panel.tsx` `topicFacts`: each fact was a sentence (`{kind, text}`): "used 1407 times
  in the last 7 days" (or "not used in the last 7 days"), "most used: <title>", "109 memories
  bridge to other topics", "changed since his last sleep: +5 joined · 2 moved out · split from …",
  "placement may be stale until his next sleep". Numbers unformatted.
- The facts row (`renderTopicRow`, kind `facts`) stacked those sentences one per line, all in the
  dim colour; the most used memory was one of them (no hover, no click); the paths' head
  ("paths most travelled") a plain dim line.

## Scope
The facts block of an expanded topic card: a row of small labelled facts (the label in the dim
meta colour, the value in the text colour) on a line that wraps; "Most used" a labelled row of its
own whose value (the memory's title) is one line, cut, whole once lit, and behaves like a path row
(hover lights it through `onHoverRows`, a click frames it and keeps it lit); the paths' head in the
same label style; numbers with thousands separators; no sentence in the block. Phone: the same,
wrapping. The topic row's own lines (types, last formed) unchanged.

## Non-goals
No change to the paths' rows, the memory types, the lead lines under the title, or the vertical
rhythm between rows (the list's row padding stays: the coordinator's ruling, 2026-11-11).

## Expected outcomes
"Used 1,407× · 7 days · Bridges 109 memories · Changed since sleep +5 · −2" as label / value pairs,
then "Most used <title>" on one line, then "Paths most travelled" and its rows.

## What was done
- 6b0d568: `TopicFact` carries `label` / `value` for the block's facts (`FACT_LABELS`: Used,
  Bridges, Changed since sleep, Placement, Most used) and the hub's record id; `countWords` formats
  counts ("1,407", path counts too). The facts row renders `.gc_tp_fact` pairs
  (`.gc_tp_label` + `.gc_tp_value`, wrapping, `src/topics_panel.css`). The most used memory is a
  row of its own (kind `hub`, key `hub:<topic>`): its title on one line (`.gc_tp_hub_title`, cut;
  whole once lit), lit and framed by the panel's lights controller like a path. The paths' head is
  "Paths most travelled" in the label style.

## Validation
- `src/topics_panel.test.tsx`: the facts as label / value objects; the rendered block is exactly
  its pairs, red if any of the old sentences returns; thousands separators; the hub row's markup
  (focusable, `data-rows`, label then the one-line title). `src/topics_panel_lights.test.tsx`: a
  pointer resting on the rendered hub row lights exactly its memory, leaving lets go, a click frames
  it. The five panel test files: 104 tests green.
- Build under the heavy lock (1-minute load 12.53). Hermetic shots (:3014 -> :18851, castor copy,
  0 blocked requests, 0 page errors): `untracked/round3-shots/W3/round6/1440-facts.png`,
  `1440-facts-panel.png`, `400-facts.png`, `400-facts-panel.png` (the pairs on one line at both
  widths, no horizontal scroll at 400), `1440-hub-hover.png`, `1440-hub-hover-panel.png` (resting on
  "Most used" lights that one memory and unfolds its title); measurements in `report.json`.

## Size
S.
