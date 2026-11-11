# Planned (built): the monitor always on, in three columns with the lanes, following the time and his replies

## Metadata
- Created: 2026-11-11
- Status: Planned (built 56c1e38, 3691d0f, 6cf50dc, 49b9ebc, waiting for the operator's check)
- Completed: N/A
- Source: the operator, 2026-11-11 02:00 (relayed by the framework session)
- Lane: W1 (round 6)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"terrible design. try to stack that [the five channel readings: warmth/tension/reflection/structure/
certainty] on top of that [the ● Live · time/position row and the transport row ⏮ ◀ ▶ ▶ ⏭ 5x], and next
to that: [the lanes MOMENTS/DIARY/LESSONS/WORLD/DREAMS/TIME], then to the right, the radar of the
cognitive monitor. goal: no empty space. remove the cognitive monitor button and let it always on, so
that this [Live/time + transport] stacks properly. ALSO the cognitive monitor is supposed to react to the
current moment in time, so when we go back in time, it is supposed to update to show how was the
cognitive monitor; when we play at 100x, we should see the cognitive monitor update rapidly. when we
visit and type a message, we should see the cognitive monitor updating in real time"

## Current code reality (read 2026-11-11, after 0036)
- `src/timeline.tsx`: one grid, label | lanes and bar | the monitor's slot (empty while closed) | the
  controls: ● Live, 🧠 Monitor and the position on one row, the transport and the speed on the next.
- `src/cognition_wave_panel.tsx`: mounted only while the Monitor toggle is pressed; the press starts the
  one read of his words (kept per entity for the page's life); the reading at a position is a lookup
  (`sampleAt`), never a new read. It takes the page's `scrubSeq`, which trails the play head by one paced
  step while playing.
- `src/cognition_wave_inline.tsx`: live with his conversation open, the reply in view is read per
  message (replies arrive whole in the chat drawer) and drawn in its own bloom, channels and conduct
  gauge, in place of the replay's reading.
- The read harvests the fold at the page's position, so a read started in the past covers only the
  life up to there.

## Scope
1. The timeline block in three columns, no empty space: the lanes (the remaining width) | the five
   channel readings stacked above the ● Live · position row and the transport row, right-aligned, as
   wide as the widest of them | the bloom with its nine register names, a fixed width, the block's full
   height. The block keeps one height (the open monitor's, 165 px at 1440x900).
2. The 🧠 Monitor button goes; the monitor is always on. The read starts once his life has loaded, once
   per entity (kept as now), over his whole life whatever the position; "reading…" while it runs; no
   embeddings: one short line in the bloom's place.
3. The readings follow the position: a scrub shows the reading at that moment; playing, they follow the
   play head every frame it moves (a lookup in the one read, never a new read).
4. Live, during a visit: each reply of his updates the same bloom and channels as it lands (per
   message: the chat drawer receives a reply whole, and one reading costs one embedding of the text).
5. Phone: the lanes on top, the readings with the controls and the bloom below, no sideways scroll.

## Non-goals
No new data, no new scorer, no per-chunk reading.

## Expected outcomes
One block that always shows how his words read at the moment shown, at any speed and during a visit,
with no toggle and no empty space.

## Validation
- Tests: the three columns and their order, no Monitor button, always mounted, the read gated on the
  loaded life and started once, the readings at two positions and at the play head, a reply's reading in
  the same panel.
- The browser check (scripts/check_cognition_browser.mjs) over the hermetic fixtures.
- Hermetic shots (:3014) at 1440x900, 1280x720 and 400x700 at two positions, with the block's height
  measured.
