# Planned: The wave panel leaves the side rail; the cognitive monitor lives at the bottom with the replay

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
"remove the 'wave' side panel; put it as a button next to the timeline controls (⏮ ◀ ▶ ▶ ⏭ 500x Live): the cognitive monitor lives at the bottom with the temporal replay, evolving with the replay and per message, so nothing of it at the top"

## Current code reality
- Side rail: the "🌸 Wave" tab (`src/entity_view.tsx:2365-2380`) renders `CognitionWavePanel`
  (`src/cognition_wave_panel.tsx:67`): it scores on a button press (`runScore`, `:109-133`) and
  follows the replay position (`scrubSeq`, `:151-159`).
- Top of the chat: the chat drawer's inline monitor `CognitionWaveInline`
  (`src/chat_drawer.tsx:1262-1280`, from `src/cognition_wave_inline.tsx`) sits at the TOP of the
  chat and follows the reply scrolled to.
- The timeline's controls: `.et_right` (`src/timeline.tsx:250-303`): ⏮ ◀ play ▶ ⏭, the speed,
  ● Live and the position. The timeline is mounted below `.entity_main`
  (`src/entity_view.tsx:2444-2498`).
- `EntityView` already holds what the monitor needs to follow the replay: `scrubSeq`,
  `effectiveIndex`, the playhead.
- `src/cognition_wave_inline.tsx` also exports what stays in use elsewhere: `toolCallsOf` (the
  chat drawer's tool rows, `src/chat_drawer.tsx:1192`), `EmbeddingsUnconfiguredNote` (the wave
  panel), `initialMonitorFolded` (`src/phone_space.test.tsx`); tests read its source
  (`cognition_reads`, `cognition_conduct`, `cognition_tone`), and
  `scripts/check_cognition_browser.mjs` mounts `CognitionWaveInline`.

## Problem
The same monitor lives in two places (a side tab and the top of the chat), neither next to the
replay it describes.

## Scope
- Remove the "Wave" side tab.
- A monitor button in `.et_right`, next to the transport (a pressed toggle with its state shown),
  opens the cognitive monitor at the bottom, with the timeline (above it, folded by default).
- The monitor follows the replay (the playhead as it plays or is scrubbed) and per message: when
  the chat is scrolled to or a reply is selected, it shows that reply's turn; live, it follows the
  head.
- Remove `CognitionWaveInline` from the top of the chat (its per-message following moves into the
  bottom monitor); nothing of the monitor remains at the top. The module's other exports, the
  tests that read it and the browser check script move with it or are rewritten, never left
  pointing at a removed component.
- Scoring stays an explicit press (`runScore`), no automatic scoring cost.
- 400 px: the button fits the transport row (icon with its accessible name); the monitor opens as
  a sheet over the bottom of the graph.

## Non-goals
No change to how waves are computed or scored; no new data from the gateway.

## Expected outcomes
One cognitive monitor, opened from the timeline, moving with the replay and with the message he
reads; the side rail and the top of the chat no longer carry it.

## Validation
- Tests: the side tab gone; the button in `.et_right` toggles the monitor; the monitor's position
  follows `scrubSeq` and the chosen message; no `CognitionWaveInline` in the chat drawer.
- Screenshots at 1440 x 900 and 400 px: closed, open while replaying, open on a chosen reply
  (scratch build, never :8080).
- `npm test` green; adversarial review with the screenshots before merge.

## Size
M-L (one to two days).
