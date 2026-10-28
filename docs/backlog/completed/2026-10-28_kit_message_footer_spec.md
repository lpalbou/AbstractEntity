# Completed: the entity chat follows the kit's message footer spec (0.9.3)

## Metadata
- Created: 2026-10-28
- Status: Completed (0.9.3)
- Area: `src/chat_message_list.tsx` (panel-chat `ChatMessageCard`)

## Summary
Operator QA 2026-10-28, item 2: "we wanted both the speaker and copy icons permanent; where is the speaker? Show the
date when the message is not from today." The message footer is a shared primitive (AbstractUIC ADR 0001): the spec
is written once in panel-chat 0.6.4 (`message_footer.ts`, AbstractUIC backlog 0064) and this app adopts it by pin
bump, with no local twin of the card.

## What changes here
- `@abstractframework/panel-chat` ^0.6.4 (lockfile refreshed): a message not from today is stamped with its date
  ("Yesterday · 10:52 PM", "Oct 21 · 10:52 PM") and a reply with no text keeps its speaker (disabled, "No text to read
  aloud"). The entity chat's messages carry no statistics and no live state, so the chip and streaming parts of the
  spec do not apply here.

## Evidence
- The kit check `panel-chat/scripts/check_message_footer.mjs` (56 checks, mutation-checked) pins the behaviour.
- This app: tests and build green on the bumped pin (see the PR).
