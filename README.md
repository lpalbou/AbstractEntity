# AbstractEntity

The summoned-entity package for [AbstractFramework](https://github.com/lpalbou):
everything about **living with entities** in one place.

This repository is designed to hold two halves:

- **(a) Entity code, orchestration and skills** — the lanes that make
  summoned entities live (homes, gates, visit workflows, phase policies,
  skills). These lanes are owned by their current packages (gateway,
  runtime, memory) and migrate here as their owners rule; this repo gives
  them a destination. Nothing has moved yet — see `docs/architecture.md`
  for the intended layout.
- **(b) The Entity app** — the web UI shipped here today: create/list
  entities, watch a mind's memory graph live (replay, scrub, live tail),
  and talk with it (visits, workspace/tool grants, system prompt, identity
  card, verbatims, diary-honest rendering). Alongside the graph, a set of
  reading surfaces: the **Book** (his diary as a chronological journal), the
  **Health** panel (memory-shape metrics + on-disk footprint), the
  **Cognition Wave** (uic's text-mood instrument), and a **Meet console**
  for convening two entities into one conversation. See
  [`docs/Overview.md`](docs/Overview.md) and
  [`docs/DataFlow.md`](docs/DataFlow.md).

Provenance: the app was born inside
[AbstractObserver](https://github.com/lpalbou/AbstractObserver) as its
second entry (`entity.html`) and moved here on 2026-07-12 so each package
has one purpose — the observer observes runs/runtime/gateway; this app is
where entities live. The observer still *watches* entities (board tiles,
card endpoints) but no longer serves this UI.

## Quick start

```bash
# from a checkout (the AbstractUIC workspace must sit at ../abstractuic)
npm install
npm run build
npm start            # serves on http://127.0.0.1:3007

# development
npm run dev          # Vite on :3007 with the same session proxy
npm test             # vitest
```

Environment:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` / `HOST` | `3007` / `127.0.0.1` | Static server bind (loopback default; set `HOST=0.0.0.0` to expose on the network) |
| `ABSTRACTENTITY_GATEWAY_URL` (or `ABSTRACTGATEWAY_URL`) | `http://127.0.0.1:8080` | The gateway this deployment fronts |
| `ABSTRACTENTITY_OBSERVER_URL` | `http://127.0.0.1:3001` (client default) | Where the header "Observer ↗" backlink points |

## Authentication

Same contract as every AbstractFramework app: the **app-origin session
proxy** (`POST /api/connection/gateway` → HttpOnly cookies → proxied
`/api/gateway/*`), with the shared `@abstractframework/ui-kit`
`GatewayConnectModal` as the one sign-in dialog. Tokens never rest
client-side; the direct bearer posture (cross-origin `?gateway=` deep
links) keeps credentials in memory for the tab's lifetime only.

## The app in one paragraph

Open `/` for the multi-entity index (create, list, pick a mind; "🤝 convene
a meet" opens the Meet console). Open `/?entity=NAME&live=1` to land on one
entity: the memory graph renders the engine's replay stream as a pure fold
(state at any scrub position is the fold of every envelope up to it —
offline replay, live tail and time scrub are one code path), with a
first-class memory search (flying bar over the graph) plus graph lenses
(identity/recent/warm/feelings/diary/dreams/questions),
temporal-vs-lifetime warmth honesty, diary redaction honored in the pixel
path, and a chat drawer for visits with ReAct cycle visibility, a per-turn
inline cognition wave, and per-phase workspace/tool grants (in ⚙ Settings,
with the 🧠 mind substrate). The four lifecycle phases render as one pushed
radio — the active phase is gold and blooming. The right-hand tabs read the
same fold from different angles: **Detail** (inspector), **Book**,
**Health** (headline counts + billed cognition live here), **Wave**, and
**Ledger**. The top bar carries the shared framework cluster: assistant,
appearance (themes + font scale — the app is fully abstractuic
theme-compliant, light themes included), and connect/disconnect.

## The surfaces

| Surface | What it is | Source of truth |
| --- | --- | --- |
| Memory graph | The mind as a live force-directed graph; scrub/replay/tail; typed edges carry a direction glyph at the target end | replay-stream fold (`stream_fold.ts`) |
| Detail (inspector) | One record: verbatim, feelings, associations, closure | fold + verbatim/diary doors |
| Book | The diary as a day-grouped chronological journal; sealed entries stay sealed | fold diary nodes → operator diary door |
| Lessons | What he has learned (`kind=lesson`) — practices and cautions that survived reflection | replay-stream fold |
| World | His orientation cards (`kind=world_model`) — one brief card per entity he has encountered (person, AI, system, event, concept); superseded cards stay visible | replay-stream fold |
| Health | One explained stat grid (memories, associations, recall coverage, sessions, billed cognition) + concentration, forgetting, kind mix, on-disk footprint | fold metrics (`health_metrics.ts`) + gateway `/footprint` + cognition wire |
| Wave | uic's cognition-wave with per-turn request/answer and replay transport — driven by the bottom timeline by default, so cognition correlates with the graph and the discussion | harvest → gateway embed → vendored scorer/basis |
| Ledger | The continuous life ledger (form/recall/commit/appraise/diary/maintenance) | replay-stream fold |
| Meet console | Convene two entities into one conversation; steer, watch both legs, read after | gateway `/meets` API |

Honesty is a through-line: diary redaction is never reconstructed, the
cognition wave always carries "reads the expressive character of text, not
inner state," the footprint states its gap when the gateway route is
absent, and a sealed diary entry's words never enter any feed.
