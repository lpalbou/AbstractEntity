# Planned: Unpressing "topics" clears the selected topic; the topic chip is one truncated line

## Metadata
- Created: 2026-11-10
- Status: Planned
- Completed: N/A
- Source: the operator's round-4 test of 0.12.0 (2026-11-10 20:13, relayed by the framework session)
- Lane: W1 (round 4, 2026-11-10)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"when i unselect topics, it should remve a selected topic and the topic should take 1 line, not 2 (here you can truncate)"

## Current code reality
- The "topics" toggle (`src/entity_view.tsx:2117-2129`): `onClick={() => setShowTopics((v) => !v)}`
  only. The selected topic `topicFilter` (`:1578`) survives it: the graph stays lit to the topic
  (`emphasisIds`, `:1596-1611`), the canvas keeps it picked (`pickedTopic`, `:2181`), and its chip
  stays after the circles and the panel are hidden.
- The chip (`:2138-2151`): `lens_chip active tm_filter_chip gc_topic_chip_full`, "🗺 {label} ✕",
  a click clears it; its comment says "The whole label (it wraps; graph_canvas.css), never cut".
- CSS: `src/entity.css:5617` `.tm_filter_chip { max-width: 260px; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap }`, overridden by `src/graph_canvas.css:971-980`
  `.lens_chip.tm_filter_chip.gc_topic_chip_full { max-width: min(420px, 100%); white-space: normal;
  overflow: visible }`: a long title takes two lines.

## Problem
Hiding the topics leaves a topic selected and the graph lit to it, with a chip that can take two
lines in the toolbar.

## Scope
- Unpressing "topics" clears the selected topic (the graph lets it go, the chip goes); pressing it
  again shows the topics with none selected.
- The chip is one line at every width: the label cut with an ellipsis, the whole label in its
  `title` and accessible name; the `gc_topic_chip_full` wrap rule goes.

## Non-goals
No change to how a topic is selected (the panel, its title on the graph) nor to the chip's click.

## Expected outcomes
Topics off: no topic lit, no chip. A long topic title in the chip: one line, cut, readable in full
on hover.

## Validation
- Tests: the toggle off clears the selection; the chip's rule is one line (nowrap, ellipsis) and
  its accessible name is the whole label.
- Screenshots on the hermetic app (scratch build, never :8080) at 1440 x 900 and 400 px: a long
  topic selected (one-line chip), then topics off.
- `npm test` green; adversarial review with the screenshots before merge.

## Size
XS-S (about an hour).
