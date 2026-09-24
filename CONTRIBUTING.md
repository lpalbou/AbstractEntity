# Contributing

AbstractEntity is a Vite + React + TypeScript app (strict TypeScript,
snake_case file names, Vitest). It is a thin client: entity state lives on
AbstractGateway, and the app renders and commands it.

## Setup

```bash
# clone AbstractUIC next to this repository first: ../abstractuic
npm install
npm run dev      # Vite dev server on :3007 with the gateway sign-in proxy
```

The build resolves `@abstractframework/ui-kit` and
`@abstractframework/panel-chat` from the sibling `../abstractuic` checkout (see
the aliases in `vite.config.ts`); `@abstractframework/app-server` comes from
npm. The dev server proxies `/api` to `ABSTRACTENTITY_GATEWAY_URL` (default
`http://127.0.0.1:8080`).

## Before you open a pull request

```bash
npm test         # vitest
npm run build    # tsc + vite build; must stay green
```

CI runs the same two steps with AbstractUIC checked out beside the repository.

## Guidelines

- Keep logic in pure, tested modules (`stream_fold.ts`, `roster_empty.ts`,
  `edge_ops.ts` and similar) and keep components thin over them.
- Keep the invariants listed in [Architecture](docs/architecture.md#invariants):
  the pure fold, diary redaction, tool claims from data, and the malformed-line
  guard are pinned by tests.
- Treat [`spec/entity_phases.json`](spec/entity_phases.json) and
  [`spec/cognition_graph.json`](spec/cognition_graph.json) as shared contracts
  that the gateway and runtime also read; change them deliberately and update
  [The entity phase graph](docs/entity-phases.md) with them.
- Record user-visible changes in [CHANGELOG.md](CHANGELOG.md) and update the
  docs in the same change (see [the documentation index](docs/README.md)).
- Report security issues privately; see [SECURITY.md](SECURITY.md).
