# Contributing

AbstractEntity is a Vite + React + TypeScript app (strict TypeScript,
snake_case file names, Vitest). It is a thin client: entity state lives on
AbstractGateway, and the app renders and commands it.

## Setup

```bash
npm install
npm run dev      # Vite dev server on :3007 with the gateway sign-in proxy
```

`@abstractframework/ui-kit`, `@abstractframework/panel-chat` and
`@abstractframework/app-server` are regular dependencies installed by
`npm install`. The dev server proxies `/api` to `ABSTRACTENTITY_GATEWAY_URL` (default
`http://127.0.0.1:8080`).

## Before you open a pull request

```bash
npm test         # vitest
npm run build    # tsc + vite build; must stay green
```

CI runs the same two steps.

To check the layout at phone, tablet and desktop sizes, open the app in your
browser's device toolbar; the responsive rules are guarded by
`src/responsive_css.test.ts` and `src/side_tabs_state.test.ts`.

Voice in a visit has a browser check, `scripts/voice.e2e.mjs`: it drives the built
app (`node bin/cli.js`) against AbstractCode's isolated fixture gateway
(`abstractcode/web/e2e/gateway_fixture.py`, no model) with a fake microphone, fakes
only the speech and transcription routes, and fails on any broken step:

```bash
node scripts/voice.e2e.mjs --app http://127.0.0.1:18736 --gateway http://127.0.0.1:18737 \
  [--playwright <dir with @playwright/test>] [--shots <dir>]
```

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
