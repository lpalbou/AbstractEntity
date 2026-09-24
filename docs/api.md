# API and configuration

AbstractEntity is an app, not a library: it has no importable JavaScript API.
Its public surface is the `abstractentity` command, its environment variables,
the app's URLs, the routes its server exposes, and the AbstractGateway routes it
calls. This page is the reference for all of them. For a guided first run, see
[Getting started](getting-started.md); for how the pieces fit, see
[Architecture](architecture.md).

## Command

```bash
npx @abstractframework/entity      # run without installing
abstractentity                     # after npm install -g @abstractframework/entity
```

The command serves the built app and the sign-in proxy, prints the local address
and the gateway it fronts, and stops on Ctrl+C. It takes no arguments; configure
it with environment variables.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3007` | Port the server listens on |
| `HOST` | `127.0.0.1` | Bind address. Loopback by default; set `HOST=0.0.0.0` to expose the app on your network |
| `ABSTRACTENTITY_GATEWAY_URL` (or `ABSTRACTGATEWAY_URL`) | `http://127.0.0.1:8080` | The gateway this deployment fronts; the sign-in dialog defaults to it |
| `ABSTRACTENTITY_OBSERVER_URL` | unset | Injected into the page as `observer_url`; the current app does not display it |

The sign-in proxy (`@abstractframework/app-server`) reads its own
`ABSTRACTENTITY_*` / `ABSTRACTGATEWAY_*` settings, for example whether the
browser may change the gateway URL from a non-loopback host; see the
AbstractUIC `app-server` documentation.

## App URLs

| URL | Opens |
| --- | --- |
| `/` | The entities list (or **No entities yet** with **Create your first entity**) |
| `/#new` (also `/#/new`) | The entities list with the creation form open; the fragment is cleared when the form closes |
| `/?page=blueprint` | The blueprint page: the lifecycle state graph, operator dials and the cognition map |
| `/?entity=NAME` | One entity's page, starting on its live present |
| `/?entity=NAME&live=0` | One entity's page, replaying its life from the start |
| `/?gateway=URL&entity=NAME` | One entity on a gateway at another origin (direct sign-in, token kept in memory for the tab) |
| `/?src=URL` | Any exported replay stream (NDJSON) loaded as a read-only life |

With no `entity` or `src` parameter and no reachable gateway, the app opens the
bundled demo life.

## Server routes

| Route | Purpose |
| --- | --- |
| `POST /api/connection/gateway` | Sign in: exchanges a gateway token for a session held in HttpOnly cookies (`abstractentity_gateway_*`) |
| `/api/gateway/*` | Proxied to the gateway with the session's credentials; mutating calls need the CSRF header |
| `GET /app/host` | `{"lan_ip": "..."}`: the machine's first non-internal IPv4 address (or `null`), used for entity handles such as `pollux@192.168.1.20` |
| `GET /entity.html` | Redirects to `/` |
| any other path | A file from `dist/`, else the app (SPA fallback) |

## Gateway routes the app uses

All paths are under `/api/gateway`. The app works against whatever subset the
gateway serves; a surface whose route is missing shows a labelled gap instead
of invented data.

| Family | Routes |
| --- | --- |
| Entities | `GET /entities` (list), `POST /entities` (create: `name`, optional `spark_text`, `framework`), `POST /entities/auth/probe` |
| Life stream | `GET /entities/{name}/replay` (NDJSON), `GET /entities/{name}/replay/stream` (SSE) |
| Records | `GET /entities/{name}/records/{id}/verbatim`, `GET /entities/{name}/diary/{id}` |
| State and lifecycle | `/entities/{name}/state`, `/life_state`, `/loop`, `/loop/start`, `/loop/stop`, `/seat`, `GET /entities/spec/phases` |
| Card and metrics | `/entities/{name}/card`, `/footprint`, `/cognition`, `/communities`, `/embedding` |
| Visits and chat | `/entities/{name}/visit/open`, `/visit/{run}/turn`, `/tick`, `/close`, `/transcript`; `/chat/open`, `/chat/{id}/turn`, `/close`, `/transcript`; `/summon`; `/queue/{id}` |
| Settings | `/entities/{name}/substrate`, `/prompt`, `/tool-policy`, `/skills`, `/workspace`, `/workspace/file`, `/workspace/mounts`, `/voice`; `GET /voice/voices` |
| Meets | `POST /entities/meets/open`, `/entities/meets/{id}/relay`, `/close`, `GET /entities/meets/{id}` |
| Other | `POST /embeddings` (cognition wave), `/docs/corpus` (top-bar assistant) |

The replay stream format and the gateway routes are owned by AbstractMemory and
AbstractGateway; see their documentation for request and response shapes.

## Specifications in this repository

- [`spec/entity_phases.json`](../spec/entity_phases.json): the entity lifecycle
  phase graph, served by the gateway at `GET /api/gateway/entities/spec/phases`.
  Human-readable companion: [The entity phase graph](entity-phases.md).
- [`spec/cognition_graph.json`](../spec/cognition_graph.json): the cognition map
  drawn on the blueprint page.

## Related

- [Troubleshooting](troubleshooting.md) for sign-in, gateway and port problems.
- [Data flow](DataFlow.md) for which route feeds which surface.
