# 1215: Preserve confirmed diary-question resolution in replay and Detail

> Package: AbstractEntity, AbstractRuntime, AbstractMemory, AbstractGateway

## Metadata
- Created: 2026-11-14
- Status: Planned — in progress
- Completed: N/A
- Source: operator release recovery, root backlog 1209

## ADR status
- Governing ADRs: framework ADR 0050/0051 release gates; existing package contracts.
- ADR impact: implementation correction within existing contracts.

## Current code reality

NodeState/display fold did not retain resolution verdicts, so Detail could not identify a confirmed resolution. The pure graph-lens helper also ignored diary resolution, but the app removed lens controls on 2026-11-10; helper behavior does not establish an exposed Questions view.

## Scope and expected outcome

Retain content-free resolution fields across display and graph/row merges; derive confirmed question/problem targets without fabricating belief closures. Handle either stream arrival order and scrub prefixes; Detail shows Resolved/Repaired. Publish required panel-chat snapshot provenance before app cut.

Deferred governance, spoken-language, Core reasoning/usage, composer redesign and breaking TUI migration remain outside this item.

## Validation

Targeted fold/lens/detail tests; privacy, ownership, duplicates, refusal, book-id join and late graph/row merge. Full app gate and live/reload proof pending.

2026-11-14: actual Runtime diary writes and SQLite Memory replay feed the Entity fold, lens and
Detail plus shared panel-chat badges (four question/answer privacy combinations). Typed public
targets show Resolved in Detail, including with a private answer. Pure lens-helper assertions
also pass, but do not prove a Questions control in the shipped app. Actual private
targets deliberately project as generic notes: their Detail
does not invent a question type, and their badge hides the title. Replay/reload and no fabricated
belief closure pass. This preserves the private projection policy. Evidence is the framework's
`untracked/release-recovery-2026-11-13/resolution-{chain,ui}-proof` scripts and logs.

## Release acceptance

Code, tests and coredoc reach remote main; all exact-commit gates green; changed artifacts published in dependency order. Root/site publication remains held for operator GO.

2026-11-14 browser-review correction: current app controls are graph search, topics and the
clickable legend. No Questions lens is exposed. README/API/release notes and AI indexes describe
Detail and timeline behavior without restoring the deliberately removed control. Earlier
fold/lens/SSR evidence is helper/component evidence, not a browser Questions-view proof.
