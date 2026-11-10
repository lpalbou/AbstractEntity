# Planned (blocked: the stream carries no tool calls): each step's row says how many tools, files read, files written

## Metadata
- Created: 2026-11-10
- Status: Planned (blocked on a data gap; nothing built)
- Completed: N/A
- Source: the operator, 2026-11-10 22:02 (relayed by the Entity/memory session)
- Lane: W2 (the ledger rows) once the data reaches the stream

## ADR status
- Governing ADRs: None
- ADR impact: None

## Operator's words
"there is one or two information useful in the ledger that would be nice to add: how many [tools] did it
use at a step, how many files did it read or write. and in something concise with button icons eg (tools
button icon) xx (files read icon) xx (files written icon). and those icons only appear if there was > 0
tool, file read or file written. the idea is just to understand in a glimpse what the entity is doing
during sleep, during personal time etc"

## Current code reality (facts, read 2026-11-10)
- The ledger is a fold of the replay stream (`src/ledger_lines.ts` over `GET /entities/{name}/replay`).
  The stream carries memory's six families (abstractmemory `replay.py`: event, binding, closure, trace,
  snapshot, valence; event kinds `journal.py` ATTENTION/DECAY/AUDIT_KINDS: selected, co_selected,
  pinned, silenced, refocus, listed, shown, expanded, cited, placed) and the gateway's host markers
  (abstractgateway `entity_replay.py` HOST_MARKER_KINDS: summon, sleep, wake, phase_changed,
  personal_*, queue_*, communities_changed, …). NONE carries a tool call, a tool count or a file path
  for any step, in any phase. A valence target can name a tool ("tool:web_search", a feeling about it),
  never a call.
- Each envelope does carry the step's correlation keys (run_id, turn_id): the join key exists.
- Tool calls live in the runtime's run ledger (TOOL_CALLS effects: tool name and arguments, e.g.
  `file_path`) in the home's `runtime_<slug>.sqlite3`. The gateway serves that ledger only for stamped
  VISIT runs (`GET /entities/{name}/visit/{run_id}/ledger`, routes/entities.py `visit_ledger`; the app's
  live activity panel reads it during a visit). Own-time (loop) and sleep runs are not served; the
  gateway reads the home's run ledger internally for spend (`life_state` "home-run-ledger+loop-spend").
- File read / write by tool: abstractcore `tools/inventory.py` `_CLASSIFICATION_BY_NAME` gives `mutating`
  (write_file, edit_file, execute_command true) but no "reads a file" fact. By the registered names:
  file content read = read_file, skim_files; file written = write_file, edit_file; list_files,
  search_files, skim_folders list or search (not reads); execute_command can do either (unknowable from
  its name).

## The gap (for the framework seat: gateway, runtime, core)
The stream must carry, per step (run_id + turn_id), three counts: tools used, files read, files written.
Preferred: one host marker per finished own-time / sleep / visit step (gateway, from the step's
TOOL_CALLS, at the step's end), e.g. `{kind: "step_tools", run_id, turn_id, tools, files_read,
files_written}`, so the ledger reads counts it already has in order (no per-row fetch: performance
first). The file counts need a structural fact on the tool definition (core: a `file_effect: read |
write | none` beside `mutating` in the inventory), never a name list in the app.

## Scope (once the marker ships)
On the rows that stand for a step (He lived a moment, He summed it up, the own-time and sleep step
rows), a compact trailing group: ⚙ 12 · 📄 3 · ✎ 1 (tools used · files read · files written; the kit's
icons if it has them), each shown only when > 0, its title in words ("12 tools used · 3 files read · 1
file written"), the row's meta colour, phone-safe.

## Non-goals
No per-row fetch of a run ledger; no guessing from tool names in the app.

## Expected outcomes
A glance at the ledger says how busy each step was with tools and files, in sleep and in his own time.

## Validation
- Counts from a fixture stream; a step with zero shows nothing (a test that goes red if the group shows
  at zero).
- Hermetic shots (never :8080) of an own-time step row at 1440 and 400 px.
- Adversarial review before merge.

## Size
S in the app once the marker exists; the marker and the tool fact are the other seats'.
