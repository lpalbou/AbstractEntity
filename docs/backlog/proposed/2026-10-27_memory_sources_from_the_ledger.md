# Every memory of an entity names its ledger sources; the app shows them

Status: proposed 2026-10-27 (operator goal of 2026-10-27; AbstractMemory ADR 0003
`abstractmemory/docs/adr/0003-one-graph-ledger-provenance-and-revisions.md`).

## Why

An entity learns, reconsiders and writes notes to itself (diary entries of type
question/problem/idea/note, remembered episodes, lessons, world-model cards). The
operator requires every derived memory to be tied to the ledger (the run, the
ledger row `(run_id, seq)`, the verbatim artifact, the hash-chained diary entry) so
that (a) memory is reached quickly through the graph and (b) the verbatim source of
an understanding, or of a change of understanding, can be rebuilt from the ledger.
Today an episode carries `run_id`/`turn_id` and a `payload_ref` artifact, a diary
projection carries its `entry_id`; nothing carries a ledger row, the night's
derived records (dreams, world models, mined summaries) carry no source at all,
and the home-direct chat writes under a synthetic `chat-<session>` run id that no
store can load (audit: `abstractframework/untracked/memory-transition/audit/`).

## What the services change (not this repo)

- AbstractMemory 0.4: typed mandatory provenance (`sources` = `run | step | artifact
  | message | event | diary_entry` refs, `derived_from` lineage), a revision log with
  causes ("reconsidered on <date>, superseded by <id>" is `history(id)`), three
  time axes (event, observation, record).
- AbstractRuntime: `memory_facade` stamps `(run_id, seq, step_id)` and the verbatim
  artifact on `MEMORY_FORM`, `MEMORY_KG_ASSERT` and `DIARY_WRITE`; `reconstruct_source`
  returns the verbatim or `source_gone`, never raising. Direct engine writes (world
  model, tend, night) gain `derived_from` lineage (runtime item).
- AbstractGateway: `GET /api/gateway/memory/{id}/sources`, `GET .../history`,
  `POST .../sources/reconstruct`.

## This app

1. Detail panel of a memory: a "Sources" section listing each `SourceRef` (kind,
   key) and, on demand, the reconstructed verbatim from `sources/reconstruct`; a
   `source_gone` answer is shown as such (never an empty panel).
2. Book tab (diary): each projected entry shows its `diary_entry` ref and the
   episodes it was written amid; a reconsidered lesson or card shows its
   `history` (closed by which revision, cause, successor).
3. The replay-stream fold keeps working unchanged: the new provenance rides inside
   the `form` envelopes' provenance (additive keys `sources`, `derived_from`); the
   drift test over `abstractmemory.MEMORY_RECORD_KINDS` stays the guard.

## Open with the operator

Whether the home-direct chat becomes a durable run (every episode gets a `step`
ref) or the verbatim artifact + diary entry stay the ground for that path (what
phase 1 ships). See `untracked/memory-transition/report.md` "Decisions needed" 3.
