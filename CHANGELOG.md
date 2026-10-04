# Changelog

All notable changes to `@abstractframework/entity` are recorded here.

## [Unreleased]

## [0.7.0] - 2026-10-04

### Added

- **Voice in a visit**: the composer **microphone** dictates — hold it while you speak, or tap to
  start and tap again to stop; the recording goes to the gateway's default speech-to-text route (or
  the one you chose) and the composer shows `Transcribing… 4 s · faster-whisper / large-v3` while it
  works; a refusal or no answer within 180 s is a sentence. **Read aloud** speaks each new reply.
  Built on the ui-kit's `useGatewayVoice`, like AbstractCode.
- **Settings → voice, your half**: below the entity's own voice, the ui-kit's shared voice section —
  speaker choice with Test and volume, microphone choice with Test and a level meter, spoken
  language, input level, Read aloud and latency, kept in this browser. "Gateway default" names the
  gateway's real routes (`GET /voice/defaults`). Its text-to-speech row is not offered: the entity
  always speaks with its own voice.

### Fixed

- **Cognitive Monitor without embeddings.** A gateway without an embedding route makes the monitor
  read "Embeddings are not configured on this gateway, so the cognitive monitor cannot run." on its
  own line, with a **Set up embeddings** link to the gateway console's Multimodal page
  (`/console#defaults`), in place of a cut-off JSON body. Every other gateway refusal in the app
  (record and diary reads, state, uploads, the docs assistant) shows the refusal's `detail`
  sentence, never the JSON body.
- **Stop ends a spoken reply at the gateway too**: Stop aborts the streaming request, so the
  gateway stops synthesising.

### Changed

- Speaking a reply never names a voice, so the entity's own voice — else the gateway default —
  always speaks. The entity voice picker names the default the same way as every app:
  `Gateway default · supertonic / supertonic-3 · M3`.
- **About is the shared compact card** (ui-kit `AfAboutDialog`): the app's name and version, the
  AbstractFramework and AbstractGateway versions, the website, source, docs, issues, feedback and
  contact links, and one author/licence line, at about half the old height. The per-package version
  list is gone; a gateway that cannot answer still shows why, in place of its version.
- Dependencies: `@abstractframework/ui-kit` ^0.8.0 and `@abstractframework/panel-chat` ^0.3.1.
  Voice needs AbstractGateway 0.13.0 or later (`GET /api/gateway/voice/defaults`).

## [0.6.0] - 2026-10-01


### Changed

- **Settings → mind and → voice use the shared pickers** from the ui-kit, the same as AbstractCode
  and the gateway console. **Gateway default** comes first and is the default: the entity thinks
  with the gateway's text model and speaks with its default voice. **Custom** sets its own provider
  and model, with reasoning and MTP depth when the model offers them; the voice picker sets its own
  voice. Changes save themselves, and choosing Gateway default again clears its own choice. The
  old provider/model pair, the reasoning dial, the long explanations and the "set his voice" form
  are gone. Needs an AbstractGateway with the round-3 entity door and a ui-kit with the route-picker
  props (`inheritLabel`, `optionsInDefaultMode`, VoiceSettings `intro` / `delivery`).

## [0.5.0] - 2026-10-01

On/off settings are switches labelled by what they control; the switch shows
the state. Anyone who edits an entity's tools or creates an entity is
affected; nothing changes in how you install, start or sign in.

On a phone the panels use the whole width of the screen, and long lists in
the side panel fold away so the detail gets the room. A desktop window keeps
its layout.

### Changed
- **Tools tab.** Each tool in each phase is a switch that applies at once:
  there is no **save policy** button any more. Only the phase you changed is
  written to `tool_policy.yaml`, so the other phases keep following the
  framework defaults. While a change saves, the other switches wait; a
  refused change switches back and shows the reason. The confirmation names
  the new state ("web_search is off for visit — the next summon obeys it").
- **Create an entity.** **Framework check** under Advanced is a switch; it
  sets how the entity is created, and **Create entity** stays the one action.
- **Full-width panels on phones.** Below 768 px the chat transcript, the
  ledger, the health panel and the entity list are flat: no card borders or
  card padding, a thin line between items, and text that starts at the screen
  gutter. A message now spans about 94 % of a 393 px phone (it was 79 %), and
  a ledger entry's text starts 12 px from the edge (it was 74 px).
- **Folding lists in the side panel.** Below 1024 px, where the side panel is
  a drawer, each list in the Detail tab (the memories a recall admitted or
  dropped, the memories used together, what a night moved, how it feels) has
  a heading you can tap to fold it. Lists start open; the app remembers each
  fold on this browser.
- **The Cognitive Monitor starts folded on phones**, so the conversation gets
  the drawer (about 11 lines of a 393×852 phone instead of 6). Unfold it once
  and the app remembers your choice.
- **Readable text sizes everywhere.** On phones and tablets no text is
  smaller than 14 px, and panel text reads at 14–17 px (the transcript at
  15 px). On a desktop, text is at least 13 px, and the ledger and the tool
  grants at least 12 px, so small labels and notes grow slightly while larger
  text keeps its size. The graph's node labels and the blueprint map keep their
  own sizes; the map's zoom buttons read it closer.
- While a phone drawer is open, the graph's own controls under it are hidden
  from screen readers and taps.
- **Shared UI packages.** Builds against `@abstractframework/ui-kit` 0.4.0
  (the switch, the plain-http helpers) and `@abstractframework/panel-chat`
  0.2.2.

### Fixed
- **Plain http from another machine** (LAN, Tailscale). Browsers withhold
  `crypto.subtle` and the clipboard API outside https and localhost. The spec
  drift check now falls back to a plain SHA-256 (same digest) instead of
  failing, and every **Copy** (visit transcript, turn detail) falls back to a
  text-selection copy and says whether it worked ("Copy failed — select and
  copy" when the browser refuses).
- **The launch-flag test no longer depends on a build.** The test of the
  gateway precedence (flag, then environment, then the local gateway pointer)
  runs the real CLI and now reads the gateway URL from the running server's
  connection endpoint instead of the page in `dist/`. It failed on a fresh
  checkout and while a build was rewriting `dist/`. Each case is its own test,
  the "server is listening" banner is the synchronisation point, and a CLI
  that exits early fails with its output.

## [0.4.0] - 2026-09-30

The app adapts to the screen it runs on: a phone in portrait or landscape, a
tablet, a resized browser window and a very wide monitor. A desktop window of
1280 px or wider keeps its layout. Everyone who opens the app benefits; nothing
changes in how you install, start or sign in.

### Changed

- **Side panel as a drawer below 1024 px.** The tab rail stays at the right
  edge and an open tab slides over the graph. Close it with Escape, a tap
  outside it or its close button; focus returns to the tab that opened it.
  On a narrow screen the app opens with the panel closed so the graph shows
  first, and a wider window brings back the panel you use on the desktop.
- **Tab strip on phones.** Below 768 px, and on a phone held sideways, the tabs
  become a strip along the bottom of the view.
- **Chat with the keyboard up.** When the on-screen keyboard is open, or on a
  phone held sideways, an open panel fills the screen above the keyboard with
  the tab strip kept under it, so the conversation keeps its room.
- **Header, controls and timeline wrap** instead of hiding buttons. Below
  480 px the phase controls are one row you can swipe.
- **Graph overlays follow the graph's width.** When the graph is narrower than
  860 px (a narrow window, or a laptop window between 1024 and 1239 px with the
  panel open), the lens chips and the legend become one scrollable row each and
  the layout buttons show their symbols only.
- **Dialogs as sheets on phones.** Settings, verbatim, turn detail and meet
  dialogs open from the bottom of the screen; the Settings tabs scroll
  sideways.
- **Blueprint zoom bar.** The memory blueprint has **fit**, **−**, **+** and
  **reset** buttons; on a phone the map scrolls inside its frame.
- **Touch sizes.** On touch screens buttons, selects, fields and the labels of
  radio buttons and checkboxes are at least 44 px tall, text fields use 16 px
  text so iOS does not zoom on focus, and the reading panes (side panel, roster,
  dialogs, blueprint) show text 1.2 times larger.
- **Wide screens.** The roster and the blueprint use more of a very wide window
  (up to 1320 px and 1600 px).
- **Screen edges.** The page declares `viewport-fit=cover` and
  `interactive-widget=resizes-content`, and the header, timeline, tab strip and
  sheets keep clear of the notch and the home indicator.
- **Shared UI packages.** Builds against `@abstractframework/ui-kit` 0.3.2 and
  `@abstractframework/panel-chat` 0.2.1, installed by `npm install` like any
  other dependency; a checkout no longer needs the AbstractUIC repository next
  to it.

## [0.3.0] - 2026-09-28

Serving the Entity app through the gateway at `/apps/entity/` needs
AbstractGateway 0.7.0 or newer. Standalone use on the app's own port works as
before. The server keeps listening on `127.0.0.1` by default.

### Added

- **Served through the gateway at `/apps/entity/`.** A gateway that manages
  the Entity app opens it on the gateway's own address, so a remote or
  headless machine needs one port and one tunnel for the console and every
  app. Every response announces `X-AbstractFramework-App: entity; mount=1`;
  the page is served with its `<base href>` and `base_path`; the session
  cookies carry `Path=/apps/entity/`. Standalone at `/` on the app's own port
  works as before.
- **Launch flags**: `--gateway-url` (aliases `--gateway`, `--url`), `--port`,
  `--host`, `--help`. `ABSTRACTENTITY_GATEWAY_URL`, `ABSTRACTGATEWAY_URL`,
  `PORT` and `HOST` remain legacy aliases below the flags. An unknown flag
  stops the start (exit code 2).
- With no flag or environment variable naming a gateway, the app uses the
  gateway installed on this computer (`~/.abstractframework/gateway.json`)
  and follows it to a new port while running.

### Changed

- Every request the page makes is relative to the page (`api/gateway/…`,
  `api/connection/gateway`, `app/host`, the demo life), and the build uses
  relative asset URLs. `npm run build` fails on a root-absolute same-origin
  URL in `dist/`.
- `/entity.html` redirects to `./` (the app's home under whichever address
  serves it), keeping the query.
- Requires `@abstractframework/app-server` 0.1.11 or newer (the mount kit)
  and is built against `@abstractframework/ui-kit` 0.1.14 (`joinBaseUrl` /
  `GATEWAY_CONNECTION_PATH`).
- **The docs assistant sends the whole documentation corpus (ADR-0026).** The
  top-bar assistant used to cut the gateway's docs corpus to 40,000
  characters, so questions about later sections were answered from a partial
  corpus. The whole corpus now goes to the model; a corpus larger than the
  model's context fails with the provider's error instead of being cut.

### Security

- With `@abstractframework/app-server` 0.1.11 or newer, a request counts as
  coming from this computer only when both its connection address and the
  host name the browser addressed are loopback, so a page served from another
  site under a name that resolves to `127.0.0.1` is treated as remote.

## [0.2.2] - 2026-09-26

### Added

- An **About** button in the top bar opens the AbstractFramework About dialog:
  the app's name and version, the framework website, author and licence, links
  to the website, source, documentation, issue tracker and feedback, and the
  versions the connected gateway reports (read from `GET /api/gateway/about`
  when the dialog opens; if the gateway cannot answer, the dialog says why).

### Changed

- Requires `@abstractframework/app-server` 0.1.10 or newer (was 0.1.9), so the
  forwarding-header protection below is always present.

- `package.json` `homepage` now points to https://abstractframework.ai and a
  `bugs` URL is set, both from the shared AbstractFramework descriptor.

### Security

- With `@abstractframework/app-server` 0.1.10 or newer, the sign-in proxy sends
  the browser's connection address as `X-Forwarded-For` (browser-supplied
  forwarding headers are dropped) and the marker
  `X-AbstractFramework-App-Proxy: abstractentity` on every gateway-bound
  request; a connection whose address is unknown is refused with HTTP 400. See
  [SECURITY.md](SECURITY.md#session-model).

## [0.2.1] - 2026-09-25

### Removed

- `ABSTRACTENTITY_OBSERVER_URL` is no longer read. The `abstractentity` command
  passed it to the page, but the app never showed a link to AbstractObserver,
  so setting it had no effect.

### Documentation

- The README explains what an entity is and walks through creating your first
  one; new guides cover getting started, the API and configuration reference
  (command, environment, app URLs such as `#new` and `?page=blueprint`, and the
  gateway routes the app uses), FAQ and troubleshooting, indexed from
  `docs/README.md`.
- `docs/architecture.md` adds diagrams of the app, its server and the gateway
  entity routes, and a complete `src/` module map; the phase-graph page shows
  every transition of `spec/entity_phases.json` version 21.
- Added `CONTRIBUTING.md`, `SECURITY.md`, `ACKNOWLEDGEMENTS.md` and
  `CODE_OF_CONDUCT.md`; `llms.txt` and `llms-full.txt` cover the full set.

## [0.2.0] - 2026-09-24

Compatibility: the app works with any AbstractGateway; the gateway console's
**Create your first entity** button (which opens the app on `#new`) needs
abstractgateway 0.4.1 or newer.

### Added

- **A first-run screen when the gateway has no entity**. The list's empty
  line is now a centred card: what an entity is in one plain sentence, a **Create your first entity** button that opens the
  creation form scrolled into view with the name field focused, and a "What
  is an entity?" link to the README. With no entity, "watch all" and
  "convene a meet" are hidden (nothing to watch or convene); they return with
  the first entity.
- **`#new` deep link**: opening the app on `/#new` opens the creation form
  directly (the gateway console's "Create your first entity" button lands
  there through the signed-in handover). Closing the form drops the fragment.

### Changed

- **Creation form wording, for someone who has never made an entity**: a
  "Name" label, "Create entity" (was "create") with "Creating…" while it
  works (was "engramming…"), a Cancel button, one plain line on what the name
  means; the custom spark and the framework check moved into an "Advanced:
  starting document" fold. Results read "Pollux is ready." / "Pollux already
  exists — opening it." (were "born — spark engrammed, home created" /
  "opening the existing home").
- The "Reads are pure…" footnote moved into a closed "How this works"
  disclosure under the list, reworded in plain terms; it no longer shows on
  the empty screen.

## [0.1.0] - 2026-09-23

First public release of AbstractEntity, the summoned-entity app for
AbstractFramework, published on npm as `@abstractframework/entity`.

### What it is

A thin React web app, served by the `abstractentity` command, for living with
the entities an AbstractGateway hosts. It keeps no server state of its own:
every view is derived from the gateway's HTTP endpoints and the memory
engine's replay stream.

### Added

- **`abstractentity` command** (`npx @abstractframework/entity`): serves the
  built app on `http://127.0.0.1:3007` (loopback by default; `PORT` / `HOST`
  to change) together with the shared app-origin gateway session proxy, so
  tokens stay in HttpOnly cookies instead of the browser. Point it at a
  gateway with `ABSTRACTENTITY_GATEWAY_URL` (or `ABSTRACTGATEWAY_URL`); set
  `ABSTRACTENTITY_OBSERVER_URL` for the header link to AbstractObserver.
- **Entity index**: create and list entities, pick one, watch the whole fleet,
  and convene two entities in the **Meet console**.
- **Memory graph**: the entity's memory as a live force-directed graph, with
  replay, time scrub and live tail as one code path, memory search, graph
  lenses (identity, recent, warm, feelings, diary, dreams, questions) and a
  local replay cache for fast reopening.
- **Reading surfaces**: Detail (one record with its verbatim, feelings and
  associations), Book (the diary as a chronological journal; sealed entries
  stay sealed), Lessons, World (orientation cards), Health (memory-shape
  metrics and on-disk footprint), Wave (cognition wave over the entity's
  words) and Ledger (the continuous life ledger).
- **Visits**: a chat drawer with reasoning-cycle visibility, a per-turn
  cognition wave, and a settings dialog for the mind substrate, workspace
  files and mounts, per-phase tool grants and the system prompt.
- **Lifecycle and blueprint**: the four lifecycle phases as one control, the
  phase-transition editor, operator dials and the cognition map.
- **Offline demo**: a bundled demo stream so the graph can be explored without
  a gateway.

### Requirements

- Node.js 18 or newer.
- A running AbstractGateway for live entities.

## Development history (before the first public release)

Before 0.1.0 the app was built in short iterations: the replay-stream fold
behind the memory graph, the reading tabs, visits and the chat drawer, the
lifecycle phase graph and its editor, the memory blueprint, operator dials and
the meet console. The 0.1.0 section above describes the result; the step-by-step
history is in the repository's git log.
