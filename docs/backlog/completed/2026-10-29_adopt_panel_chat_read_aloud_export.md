# Planned: adopt panel-chat's `readAloudStep` export; delete the inlined copy

## Metadata
- Created: 2026-10-29
- Status: Completed 2026-11-02 (release 0.10.0, on `@abstractframework/panel-chat` 0.7.0)
- Area: `src/read_aloud.ts` (the inlined copy), `src/chat_drawer.tsx` and `src/read_aloud.test.ts` (the importers)
- Related: AbstractUIC backlog 0065 (the rule, panel-chat PR #26) and 0066 (the kit-side tracker of this debt);
  AbstractEntity PR #9 (the inlining)

## Summary
AbstractEntity PR #9 (merged 2026-10-29) fixed "read aloud speaks a visit's existing replies on re-open" by applying
the kit's rule — AbstractUIC panel-chat `src/read_aloud.ts` (`READ_ALOUD_INITIAL`, `readAloudStep`, `readAloudPhase`,
types `ReadAloudInput`, `ReadAloudPhase`, `ReadAloudReply`, `ReadAloudState`), exported from
`@abstractframework/panel-chat` by AbstractUIC PR #26. That export is in no published panel-chat (0.6.4 is the
newest; this app pins `^0.6.4`), so PR #9 shipped a VERBATIM COPY of the kit file as `src/read_aloud.ts`, plus one
Entity-specific adapter in the same file (`entityReadAloudInput`: scope = the visit's run id, phase = the drawer's
`busy === "turn"`).

The copy breaks the operator's standing rule: shared UI behaviour is reused from AbstractUIC, never re-implemented
locally (AbstractUIC ADR 0001; the same rule that put the message footer spec in the kit,
`2026-10-28_kit_message_footer_spec.md`). It is tolerated only until the kit ships the export. This item is the
dated debt.

## What to do (when panel-chat with `readAloudStep` is published)
1. Bump `package.json` `@abstractframework/panel-chat` to the version that carries `read_aloud.ts` (AbstractUIC 0066
   names it), reinstall, relock.
2. `src/chat_drawer.tsx` and `src/read_aloud.test.ts`: import `READ_ALOUD_INITIAL`, `readAloudStep` and the types
   from `@abstractframework/panel-chat`.
3. Reduce `src/read_aloud.ts` to the adapter `entityReadAloudInput` (importing `ReadAloudInput` / `ReadAloudReply`
   from the kit), or move the adapter into `chat_drawer.tsx` and delete the file. No copy of the rule remains.
4. `src/read_aloud.test.ts` keeps passing unchanged.

## Acceptance
- `grep -rn "function readAloudStep" src` finds nothing; `readAloudStep` is imported from
  `@abstractframework/panel-chat` only.
- `npm test` green; CHANGELOG names the kit version adopted.

## Evidence (2026-11-02)
- `package.json`: `@abstractframework/panel-chat` ^0.7.0 (published 2026-11-02, exports `READ_ALOUD_INITIAL`,
  `readAloudStep`, `readAloudPhase` and the types); lockfile resolves 0.7.0 (`npm run check:lock` OK).
- `src/read_aloud.ts` holds only the adapter `entityReadAloudInput` (types imported from the kit);
  `src/chat_drawer.tsx` and `src/read_aloud.test.ts` import `READ_ALOUD_INITIAL` and `readAloudStep` from
  `@abstractframework/panel-chat`.
- `grep -rn "function readAloudStep" src` finds only the vendored `.d.ts` declarations, no implementation.
- `npm test`: 60 files, 600 passed, 1 skipped; `src/read_aloud.test.ts` unchanged and green.
