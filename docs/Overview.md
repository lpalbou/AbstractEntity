# Overview

AbstractEntity is the **summoned-entity app** for AbstractFramework: where
you create entities, watch a mind's memory live, read what it has kept, and
talk with it. It is a thin client — a static React SPA with no server state
of its own; everything renders from the gateway's HTTP endpoints and the
memory engine's frozen replay-stream format.

## Goals

- **Observe a mind honestly.** Show the memory graph, the diary, the mood,
  and the on-disk shape of a life — each from its real source, none faked.
  When something cannot be known (a redacted diary word, a byte count the
  stream doesn't carry), the app says so rather than inventing it.
- **Talk with an entity.** Visits (chat) with per-cycle visibility,
  steering, and per-phase workspace/tool grants; two entities can be
  convened into one conversation (the Meet console).
- **One code path for time.** Replay, live tail, and time-scrub are the
  same pure fold over the replay stream — the state at any position is the
  fold of every envelope up to it.

## The challenge

The memory engine emits an append-only **replay stream** (form / recall /
commit / appraise / diary / valence / maintenance envelopes, plus gateway
host markers). The app's job is to fold that stream into a faithful,
scrubbable picture of a mind — at operator scale (a handful of homes, tens
of thousands of envelopes per busy life) and without ever misrepresenting
what the engine actually recorded. The hard parts are all honesty and
resilience: two id namespaces that must join correctly, diary redaction that
must survive every render path, embedding spaces that must never be crossed
silently, and a single malformed line that must never brick the view.

## Core components

- **Stream + fold** (`stream_source.ts`, `stream_fold.ts`) — NDJSON/SSE
  ingest with `normalizeEnvelope` at every boundary; a pure incremental fold
  that yields `FoldState` (nodes, edges, standings, beats, sessions,
  attention windows) at any scrub position.
- **Memory graph** (`graph_canvas.tsx`, `graph_lenses.ts`,
  `force_layout.ts`) — the mind as a live force-directed graph with lenses,
  temporal-vs-lifetime warmth, and durable spatial memory.
- **Reading surfaces** — **Book** (`book_reader.tsx`): the diary as a
  chronological journal; **Health** (`health_panel.tsx` + `health_metrics.ts`):
  memory-shape metrics + on-disk footprint; **Cognition Wave**
  (`cognition_wave_panel.tsx`): uic's text-mood instrument.
- **Visits** (`chat_drawer.tsx`, `workspace_panel.tsx`) — turns with cycle
  visibility, steering, per-phase grants; the fabricated-liveness guard.
- **Meets** (`meet_reader.tsx`, `meet_console.tsx`) — read a past shared
  moment; convene/relay/close a live two-entity conversation.
- **Fleet + auth** (`entities_index.tsx`, `fleet_view.tsx`,
  `connect_gateway_modal.tsx`) — roster, watch-all wall, and the shared
  app-origin session sign-in.

## What lives elsewhere

The lanes that make entities *live* — homes, the entity gate, visit
workflows, phase policies, sleep/dream, skills — are owned by the gateway,
runtime, and memory seats and are governed by the entity-topology consensus
plan. They migrate into this repo only by their owners' rulings; today this
app consumes them over HTTP. See `docs/architecture.md`.

## Honesty invariants

These are load-bearing and test-pinned:

- Diary redaction is honored in the pixel path and never reconstructed; a
  sealed entry's words never enter any feed (Book, Cognition Wave).
- The cognition wave always carries "reads the expressive character of
  text, not inner state," and never crosses embedding spaces (the home's
  embedder pin drives scoring; a mismatch refuses loudly).
- Tool claims render from `tools_used` attributes and host events only,
  never from reply prose.
- A single malformed journal line skips with a warning; it never throws to
  the render root.
- On-disk footprint comes from the gateway's endpoint; when that route is
  absent the panel shows a labeled gap, never estimated bytes.
