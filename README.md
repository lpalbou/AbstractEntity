# AbstractEntity

AbstractEntity is the entity app of [AbstractFramework](https://github.com/lpalbou):
the place where you create entities, talk with them, watch what they remember as a
live memory graph, and read their diaries. It is published on npm as
`@abstractframework/entity` and runs as a small local web app in front of your
[AbstractGateway](https://github.com/lpalbou/AbstractGateway).

## What is an entity?

An entity is an AI companion with a lasting memory of its own. You give it a
name; from then on it remembers what you talk about, keeps a diary, sleeps to
sort its memories and grows over time. It lives on your AbstractGateway (its
memory is stored there, in its own folder), and it keeps one identity for its
whole life. In this app you can talk with it, watch what it remembers as a
live graph, and read its diary.

## Your first entity

1. Open the Entity app. From the gateway console, the Entity card's button
   reads **Create your first entity** while the gateway has none; it opens
   the app signed in, straight on the creation form. That console button
   needs AbstractGateway 0.4.1 or newer; the app itself works with any
   gateway.
2. Type a name (for example *Pollux*) and press **Create entity**. The name is
   all it needs: the entity starts from the standard starting document.
3. The app opens the new entity's page. Say hello in the **Chat** tab.

With no entity yet, the app shows **No entities yet**, one sentence on what an
entity is, and the same **Create your first entity** button. The address
`http://127.0.0.1:3007/#new` opens the creation form directly (the gateway
console uses it). The **Advanced: starting document** fold of the form takes
your own starting document (YAML) if you write one.

A name belongs to one entity for its whole life: creating an entity whose name
already exists opens the existing one instead.

## Install and run

AbstractEntity needs Node.js 18 or newer and an AbstractGateway to talk to.

```bash
# run without installing
npx @abstractframework/entity

# or install the `abstractentity` command globally
npm install -g @abstractframework/entity
abstractentity

# point it at your gateway (default: the gateway installed on this computer,
# else http://127.0.0.1:8080)
npx @abstractframework/entity --gateway-url http://127.0.0.1:8080
```

The app serves on `http://127.0.0.1:3007`. Open it and sign in to your gateway
from the connect dialog. When your gateway manages the Entity app (the gateway
console's **Apps** screen), open it from there instead: the gateway serves it
at `/apps/entity/` on its own address. See [Getting started](docs/getting-started.md)
for the full first run and [the configuration reference](docs/api.md#configuration)
for every launch flag.

## What you can do in the app

- **Entities list** (`/`): create entities, open one, watch them all at once
  (**watch all**), convene two of them into one conversation (**convene a
  meet**), and open the **blueprint** page that shows how every entity's
  memory and daily cycle work.
- **Entity page** (`/?entity=NAME`): the memory graph, the chat, and a set of
  reading tabs over the same life.

| Surface | What it shows |
| --- | --- |
| Memory graph | The entity's memories as a live force-directed graph, with search, lenses (identity, recent, warm, feelings, diary, dreams, questions), replay, time scrub and live tail |
| Chat | Visits: talk with the entity, see its reasoning cycles and tool use, adjust its mind (Gateway default or its own provider and model), voice, files, tools and system prompt in **Settings**. In its **tools** tab each tool in each phase is a switch that applies at once and writes only that phase to `tool_policy.yaml`; a refused change switches back and shows the reason |
| Card | The entity's identity card: values, purposes, likes, open questions, interests, key moments and life so far |
| Detail | One memory: its verbatim text, feelings and associations |
| Book | The diary as a day-grouped journal; sealed entries stay sealed |
| Lessons | What the entity has learned and kept |
| World | The entity's short orientation cards about people, systems and ideas it has met |
| Health | Memory counts, recall coverage, sessions, model usage and on-disk footprint |
| Wave | The cognition wave: the expressive character of the entity's own words over time (not its inner state) |
| Ledger | The continuous life ledger: memories formed, recalled, committed, appraised, diary and maintenance |
| Meet console | Two entities in one conversation: steer it, watch both sides, read it afterwards |

The app is a thin client: it keeps no server state of its own. Every view is
read from the gateway, and the memory views are computed from the memory
engine's replay stream, so replay, live tail and scrubbing back in time show the
same picture. See [Architecture](docs/architecture.md) for how this works.

Without a reachable gateway the app opens a bundled demo life, so you can
explore the memory graph offline.

The **About** button in the top bar shows the app's version and the versions
your gateway reports; see [the FAQ](docs/faq.md#how-do-i-see-which-versions-i-am-running).

## Responsive layout

The app works on a phone, a tablet, a resized browser window and a wide
monitor.

- **Desktop (1024 px and wider):** the side panel sits beside the memory graph.
  Drag its left edge to resize it; click the open tab to collapse it.
- **Tablet and narrow windows (below 1024 px):** the tab rail stays at the right
  edge and an open tab slides over the graph as a drawer. Close it with Escape,
  a tap outside it, or its close button. On a narrow screen the app opens with
  the panel closed, and a wider window brings back the panel you use on the
  desktop.
- **Phones (below 768 px, or held sideways):** the tabs become a strip along the
  bottom of the view, dialogs open from the bottom of the screen, and the header
  and timeline wrap onto a second row. Below 480 px the phase controls are one
  row you can swipe.
- **On-screen keyboard:** while the keyboard is open, an open panel fills the
  screen above it with the tab strip kept underneath, so the chat stays usable.
- **Graph overlays:** when the graph is narrower than 860 px, the lens chips and
  the legend become one scrollable row each and the layout buttons (freeze,
  settle, reset, fit) show their symbols only.
- **Blueprint zoom bar:** the memory blueprint (`/?page=blueprint`) has **fit**,
  **−**, **+** and **reset** buttons. On a phone the map scrolls inside its
  frame; pinch-zoom also works.
- **Full-width panels on phones:** below 768 px the chat transcript, the
  ledger, the health panel and the entity list are flat sections without card
  borders, with a thin line between items and text that starts at the screen
  gutter.
- **Folding lists:** below 1024 px, where the side panel is a drawer, each list
  in the Detail tab has a heading you tap to fold it. Lists start open, and the
  app remembers each fold in this browser. On a phone the Cognitive Monitor
  starts folded, so the conversation gets the drawer; unfold it once and the
  app remembers your choice.
- **Touch screens:** buttons, selects and fields are at least 44 px tall, text
  fields use 16 px text, no text is smaller than 14 px, and the chat
  transcript reads at 15 px.
- **Text on a desktop:** text is at least 13 px, and the ledger and the tool
  grants at least 12 px. The graph's node labels and the blueprint map keep
  their own sizes; the map's zoom buttons read it closer.

Limits:

- On a small phone (375 x 667) the memory graph gets about 275 px of height
  with the panel closed, because the header, phase controls, tab strip and
  timeline stay on screen. Larger phones give it more room.
- On a phone held sideways, an open panel covers the graph and the header; the
  tab strip stays visible under it.
- The side tabs are buttons: they do not support arrow-key navigation between
  tabs.

## Sign-in and security

The `abstractentity` server includes the shared AbstractFramework sign-in proxy:
you sign in once with a gateway token, the server keeps the gateway session in
HttpOnly cookies, and the browser never stores the token. The server binds to
loopback (`127.0.0.1`) by default. See [SECURITY.md](SECURITY.md).

## Develop from a checkout

```bash
npm install          # includes the shared UI packages (ui-kit, panel-chat)
npm run build
npm start            # serves dist/ on http://127.0.0.1:3007

npm run dev          # Vite dev server on :3007 with the same sign-in proxy
npm test             # vitest
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [Documentation index](docs/README.md)
- [Getting started](docs/getting-started.md): install, sign in, create your first entity
- [Architecture](docs/architecture.md): components, gateway routes, invariants
- [API and configuration](docs/api.md): command, environment, URLs, gateway routes used
- [FAQ](docs/faq.md) and [Troubleshooting](docs/troubleshooting.md)
- [Changelog](CHANGELOG.md)

## License

MIT, see [LICENSE](LICENSE).
