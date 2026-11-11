# Data flow

This page is a companion to [Architecture](architecture.md). How data moves from the gateway/engine into each surface. The app holds no
server state; every view is a function of gateway responses.

## Transport + auth

```
browser ── same-origin ──▶ bin/cli.js (app-origin session proxy)
                              │  POST /api/connection/gateway  → HttpOnly cookies (url/session/csrf)
                              └─ /api/gateway/*                → proxied with session headers
          ── or direct ────▶ gateway  (cross-origin ?gateway= deep link; bearer in memory for the tab)
```

`stream_source.ts` owns the wire: `readHeaders` (bearer when present),
`proxyCsrfHeader` (mutating calls), `credentials: "include"` (cookie
posture). Local-vs-remote gateway config is gated on the socket peer in the
shared proxy, never on the client `Host` header.

## The replay-stream fold (the spine)

```
GET /entities/{name}/replay        (NDJSON, bounded)      ┐
GET /entities/{name}/replay/stream (SSE, live tail)       � ─▶ normalizeEnvelope ─▶ applyEnvelope ─▶ FoldState
scrub position T (re-fold 0..T, cached incrementally)     ┘
```

- **`normalizeEnvelope`** rejects a non-finite `seq`, coerces `payload` to
  an object, requires a string `family` — a bad line is dropped counted,
  never handed downstream.
- **`applyEnvelope`** dispatches by family (event/binding/closure/trace/
  snapshot/valence + gateway `host` markers) into `FoldState`, wrapped in a
  per-envelope guard (defense-in-depth above the panel error boundaries).
- **State-at-T** is the fold of every envelope with `seq <= T`; forward is
  incremental, backward re-folds from 0 (cheap at entity scale). Replay,
  live tail, and scrub are one path.
- **Life cache** (`replay_cache.ts`): the bounded replay is cached in
  IndexedDB per (gateway origin, entity); reopening a life paints from the
  cached prefix and fetches only `seq > cached max` (cursored delta —
  sound because the journal is append-only and marker seqs mint at journal
  high-water). A journal-head probe (`until_seq=1`) validates lineage
  first; a reborn name drops the cache. On a long life (tens of thousands
  of envelopes) this takes reopening from about 22 s cold to under 1 s warm.

Every surface below reads `FoldState` (or the same doors), so they are all
consistent at any scrub position.

## Per-surface flow

| Surface | Reads | Produces |
| --- | --- | --- |
| Memory graph | `FoldState.nodes/edges` + `temporal_activation` → `graph_usage`; his topics (`GET /communities`) | canvas laid out by his topics (force-laid until they are served), legend picks, usage scale, Context paths, the Topics panel |
| Detail | selected node + `fetchRecordVerbatim` / `fetchDiaryEntry` | verbatim, feelings, associations |
| Book | `FoldState` diary nodes (`selectDiaryEntries`) | day-grouped journal → diary door on click |
| Health | `computeHealthMetrics(FoldState)` + `fetchEntityFootprint` | re-use / concentration / forgetting / kind mix + on-disk bytes |
| Cognitive Monitor | `harvestUtterances` → `embedTexts` → vendored scorer, one read per entity once his life has loaded; the reading at the timeline's position (the play head while playing); live, each reply | scored samples → the bloom and the tone channels |
| Ledger | `FoldState` beats/host markers (`ledgerLine`), including the gateway's `step_tools` marker per step | the continuous life ledger, with each step's tool and file counts |
| Meet console | `openMeet` / `relayMeet` / `closeMeet` / `fetchMeetStatus` | live two-leg transcript |

## The Cognitive Monitor pipeline (the one multi-step seam)

The Cognitive Monitor, always on in the timeline, is the only surface whose
data is not a direct fold read — it is a feed the app owns feeding a scorer uic
owns. Once his life has loaded it reads his words once per entity, up to 120
utterances spread over his whole life, and keeps the result while the page is
open; every timeline position, and the play head while playing, is a lookup in
that one read, never a new one. Live, each reply of his is read once as it
lands (one embedding per distinct text):

```
FoldState + chat transcript
   │  utterance_harvest.ts   (entity's OWN words only: visit replies, diary, episode/summary;
   │                           sealed diary NEVER read; reply-only, chronological)
   ▼
Utterance[] { id, label, text, at, source }
   │  cognition_adapter.ts
   │    ├─ fetchEntityEmbedding  → the home's M1 embedder id (never assumed)
   │    ├─ embedTexts (gateway /embeddings, pinned to that id)  → vectors
   │    └─ scorer.score(vector)  (vendored createScorer + frozen basis_v0)
   ▼
ScoredSample[] { scores, emotions, novelty, ... }
   │  cognition_wave_panel.tsx  (the ui-kit's AfCognitionBloom)
   ▼
the bloom — framing label always on; wandering labeled session-relative
```

Guarantees end to end: a pin↔basis embedder mismatch refuses loudly
(`CognitionSpaceError`), a vectorless/failed utterance drops with a warning
(never fabricated scores), and the whole thing degrades to an explicit
message with no gateway, no utterances, or an embed failure. The vendored
`src/vendor/cognition/` is a temporary copy pending uic's
`@abstractframework/monitor-cognition` kit package; the swap is one import.

## Truth sources at a glance

- **Behavior over time** → the replay stream (graph, book, ledger, health
  metrics).
- **Disk at rest** → the gateway footprint endpoint (health "on disk").
- **Words behind a memory** → the verbatim/diary operator doors.
- **Expressive character of words** → the Cognitive Monitor's scorer (never
  presented as inner state).
- **Live conversation** → the gateway chat/meets APIs.
