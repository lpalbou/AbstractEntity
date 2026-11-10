# Planned: The summary under his reply no longer crashes the chat; it sits in his message, left, as small chips

## Metadata
- Created: 2026-11-10
- Status: Planned (built, waiting for the operator's check)
- Completed: N/A
- Source: the operator, 2026-11-10 20:36 (relayed by the Entity/memory session)
- Lane: W5 (2026-11-10)

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"clicking on the tag after the AI answer crashes... fix that."
"also the design is not nice, i would maybe integrate it in the message itself, or something nicer
below and justified left? I did like that you put the link to the diary here"

The crash, as he saw it: the chat panel's error boundary, "Minified React error #31; … object with
keys {entry_id, kind, visibility, projected_record_id, title}".

## Current code reality (before)
- The "tag" is the app's own pill, not the kit's: `src/chat_message_list.tsx:189-198` (933f6fc), a
  centred `button.cd_sysbadge` under the card reading "● system · 69 memories · 1 formed · 1 diary ·
  12 tools", opening the turn panel (`TurnDetailModal`) on the Context tab.
- The visit lane serves `diary_entries` as one object per entry, `{entry_id, kind, visibility,
  projected_record_id, title}` (AbstractGateway `entity_visits.py:756` `visit_turn_result`, the
  runtime's `_turn.diary_meta` from `act_only.capture_diary_elections`); the hosted chat serves the
  entries' keys (`entity_chat.py:1038`). `src/stream_source.ts:617` and `:1365` type it as a
  `number`.
- The crash: `src/turn_detail_modal.tsx:208-210` (933f6fc), "Formed this turn",
  `diaryList.map((id) => <li key={id}> … <code>{id}</code>)`: each served object rendered as a React
  child. Any visit turn that kept a diary entry crashed the panel on open.
- The DIARY chip in his bubble is the kit's `ChatNoticeBadges` (panel-chat 0.9.12, from the turn's
  `reply_notices`); it was not involved.

## Scope
1. Fix: the panel reads the entries through `turnDiaryEntries` (`src/reply_notices_summary.tsx`:
   the visit lane's objects and the hosted chat's keys) and lists each by its title; a private
   entry reads "a private entry", one still being titled says so; never a key.
2. Design: the pill goes; the turn's facts become a row of small chips in his message's own footer
   (the kit card's `renderFooter` slot, inside the bubble, under the DIARY chip, left-aligned), the
   kit's chip classes (`pc-chat-notices__row`, `pc-chat-notice`) at the kit's size, spacing tightened
   so the row is one line in the side panel's default width (`src/chat_notices.css`, no colour).
   Chips: "44 memories" (the panel's Context tab), "1 formed" (the record in Detail), "1 diary" (the
   entry in Detail), "0 tools" (the Tools tab); files and notices when served. A chip naming a record
   Detail does not hold yet opens the panel's Context tab, where the record is listed. "system" is
   dropped; it leads only when a message's served author is not an entity. The DIARY chip stays.

## Non-goals
No kit change (the card's `renderFooter` slot is enough). No change to the panel's tabs or content
beyond the diary rows and the tab it opens on.

## Expected outcomes
Clicking any chip under a reply opens what it names; nothing crashes. The facts read as one quiet
line inside his bubble, under the DIARY chip, at 1440 x 900 (380 px side panel) and at 400 px.

## Validation
- `src/reply_notices_summary.test.tsx` on a fixture of castor's visit turn of 2026-11-09
  (`src/fixtures/visit_turn_reply.ts`: the served shape, 44 memories, 1 formed, 1 diary entry, 0
  tools, neutral words): before the fix 3 of 4 red with the operator's exact error ("Objects are not
  valid as a React child (found: object with keys {entry_id, kind, visibility, projected_record_id,
  title})"); the chips, their order and targets, the row inside the card's footer after the DIARY
  badge, each button's click, the panel on the chip's tab. Mutants (key shown, "system" always, no
  record opening, tab ignored, footer slot dropped, diary without its record) all red.
- Screenshots of a fixture page (the app's SideTabs chat tab, ChatMessageList, TurnDetailModal and
  CSS; no gateway) at 1440 x 900 and 400 px, with the panel opened from "44 memories":
  `untracked/w5-footer-2026-11-10/shots/`.

## Built (2026-11-10, waiting for the operator's check)
- 864026c: the fix (`turn_detail_modal.tsx` reads `turnDiaryEntries`; `visitReplyMessage` in
  `chat_drawer.tsx`; the fixture and the click-path test).
- c22e849: `turn_notices.test.ts` pinned the drawer's inline push; now the call and its behaviour.
- 54571bf: the design (the facts row in the card's footer; `chat_notices.css`; `initialTab`).

## Follow-ups (other owners)
- `src/entity.css:3210-3234` `.cd_sysbadge`, `.cd_sysbadge_dot`: dead since the pill went (entity.css
  owner).
- `src/stream_source.ts:616-617`, `:1364-1365`: `records_formed` / `diary_entries` typed `number`;
  the visit lane serves lists (ids; entries). The wrong type is what let the crash through.
- The panel's "Formed this turn" still shows a formed memory by its graph id (`<code>`): the visit
  lane serves ids only for formed records; a title needs the gateway to serve one, or a fold read.

## Size
S (2-3 hours).
