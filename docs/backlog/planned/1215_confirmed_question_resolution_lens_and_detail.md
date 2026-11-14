# 1215: Show confirmed diary-question resolution in Questions and Detail

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

NodeState/display fold did not retain resolution verdicts and Questions filtered only belief closure. A diary resolution therefore left an answered question under open Questions.

## Scope and expected outcome

Retain content-free resolution fields across display and graph/row merges; derive confirmed question/problem targets without fabricating belief closures. Handle either stream arrival order and scrub prefixes; Detail shows Resolved/Repaired. Publish required panel-chat snapshot provenance before app cut.

Deferred governance, spoken-language, Core reasoning/usage, composer redesign and breaking TUI migration remain outside this item.

## Validation

Targeted fold/lens/detail tests; privacy, ownership, duplicates, refusal, book-id join and late graph/row merge. Full app gate and live/reload proof pending.

## Release acceptance

Code, tests and coredoc reach remote main; all exact-commit gates green; changed artifacts published in dependency order. Root/site publication remains held for operator GO.
