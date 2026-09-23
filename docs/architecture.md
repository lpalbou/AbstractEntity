# AbstractEntity architecture

## The two halves

**(b) The entity app (shipped today)** — a static React SPA served by
`bin/cli.js` with the shared app-origin gateway session proxy
(`@abstractframework/app-server`, `appId: "abstractentity"`). No server
state of its own: everything renders from gateway endpoints
(`/api/gateway/entities/*`) and the engine's frozen replay-stream format.

**(a) Entity orchestration + skills (destination, not yet moved)** — the
runtime/gateway/memory lanes that make entities live (homes, the entity
gate, visit workflows, phase tool policies, sleep/dream, skills). Those
lanes are owned by their seats and move here only by their owners' rulings
(the entity-topology consensus plan governs). When they land, the expected
shape is a Python package beside this app (`pyproject.toml` +
`src/abstractentity/`), keeping the JS app exactly where it is.

## App modules (src/)

| Area | Modules |
| --- | --- |
| Entry + shell | `main.tsx`, `entity_view.tsx`, `error_boundary.tsx`, `entity.css` |
| Stream | `stream_types.ts`, `stream_source.ts` (NDJSON/SSE + auth headers), `stream_fold.ts` (pure fold; state-at-T), `temporal_activation.ts` (engine-parity decay) |
| Graph | `graph_canvas.tsx` (canvas, spatial memory, warmth), `graph_lenses.ts`, `force_layout.ts` |
| Panels | `ledger_panel.tsx` + `ledger_lines.ts` + `host_marker_lines`, `timeline.tsx`, `inspector.tsx`, `identity_card.tsx`, `turn_detail_modal.tsx`, `verbatim_modal.tsx`, `node_label.ts` |
| Reading surfaces | `book_reader.tsx` + `book_reader_select.ts` (diary journal), `health_panel.tsx` + `health_metrics.ts` (memory shape + footprint), `cognition_wave_panel.tsx` (wave with per-turn request/answer, timeline-driven replay), `lessons_world_panels.tsx` (🎓 lessons + 🌍 world orientation cards) |
| Cognition wave | `utterance_harvest.ts` (entity's own text → sample shape), `cognition_adapter.ts` (harvest→embed→score seam), `vendor/cognition/` (uic's scorer + core + Bloom + basis, vendored pending the kit package) |
| Meets | `meet_reader.tsx` (read a past correlated moment), `meet_console.tsx` (convene/relay/close live, two entities) |
| Visits | `chat_drawer.tsx` (turns, tool rounds, inline cognition wave via `cognition_wave_inline.tsx`), `tool_claim_guard.ts` (fabricated-liveness guard), `workspace_panel.tsx` (the ⚙ Settings modal: 🧠 mind substrate, files, mounts, per-phase tools, prompt), `substrate_picker.tsx` |
| Fleet | `entities_index.tsx`, `create_entity_form.tsx`, `fleet_view.tsx`, `entity_state.ts` |
| Auth | `connect_gateway_modal.tsx` (kit modal + direct posture), `gateway_session.ts` |

Load-bearing invariants carried over from the observer era (tests pin
them):

- **State-at-T is a pure fold** — replay, live tail and scrub are one code
  path; renders are pure reads.
- **Two id namespaces** — bindings use graph ids, usage events use row
  ids; the fold joins only on `display.graph_id` (or canonical-text
  titles for pre-delta exports).
- **Diary redaction in the pixel path** — the engine's
  `{"redacted":"diary"}` display block is the only source; the view never
  reconstructs diary text.
- **Never render tool claims from prose** — `tools_used` attributes and
  host events only.
- **Spatial memory is a durable operator artifact** — layout anchors are
  world constants persisted per entity; never derived from camera state.
- **Kind vocabulary syncs on widening** — `ENGINE_RECORD_KINDS` mirrors
  `abstractmemory.MEMORY_RECORD_KINDS`; the drift test fails when a
  canonical kind would render unknown-gray.
- **Malformed stream never bricks the app** — `normalizeEnvelope` at every
  ingest boundary + a per-envelope fold guard; one bad journal line skips,
  never throws to the render root above the panel error boundaries.
- **Embedding space is never crossed silently** (cognition wave) — the
  harvest reads the home's M1 embedder pin and hands the real id to uic's
  scorer, which refuses a pin↔basis mismatch; a sealed diary entry's words
  never enter the feed.

## Serving

```
abstractentity (bin/cli.js, :3007)
  ├─ /                    the entity app (SPA fallback)
  ├─ /entity.html         302 → /   (pre-split bookmarks)
  ├─ /api/connection/*    app-origin session sign-in (HttpOnly cookies)
  └─ /api/*               proxied to the gateway with session headers
```

The observer app is a separate deployment (default `:3001`); the header
backlink between the two apps is configuration
(`ABSTRACTENTITY_OBSERVER_URL` / observer's `ABSTRACTOBSERVER_ENTITY_APP_URL`).
