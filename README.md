# AbstractEntity

AbstractEntity is the entity app of [AbstractFramework](https://github.com/lpalbou):
the place where you create entities, talk with them, watch what they remember as a
live memory graph, and read their diaries. It is published on npm as
`@abstractframework/entity` and runs as a small local web app in front of your
[AbstractGateway](https://github.com/lpalbou/AbstractGateway).

## What's new

0.12.0 follows the entity's five-state life cycle: the phase bar shows **idle**, **visit**,
**work**, **personal** and **sleep**; own time is the one toggle you grant, work is the jobs
queued for him, the red **Stop** halts everything and cancels his own time, and **Resume** brings
him back idle. **Settings → Mind → Sleep** sets when an idle entity sleeps for maintenance. In a
conversation, type `@` to bring other entities in; each answers once, under its own name. Under
a reply, badges show what the turn kept (a diary entry, a lesson, an interest, a question, a
realization), and while he answers, the chat shows what he is doing, step by step. The memory
graph is laid out by the topics his memory forms in his sleep: its lines stay dark grey except the
trails he walked, which light green up to bright, and the paths he travelled to each recalled
memory. The **Topics** panel opens at the top right, and you can move it anywhere on the page and
resize it; each topic is a card in its colour, with its memory types and the paths he travelled
most. A legend you can click shows where each kind of memory or link sits, and **Monitor** beside
**Live** opens the Cognitive Monitor inside the timeline. On a desktop the home page shows three
entities per row. All of this needs AbstractGateway 0.21.0. See the [changelog](CHANGELOG.md#0120---2026-11-10) and
[Reading the memory graph](#reading-the-memory-graph).

0.11.2 shows every entity on the home page at once: each tile appears as soon as the
list arrives and fills in on its own, and a slow entity no longer holds the others on
"reading his card…". **Settings → identity** is now one clear page from the shared kit:
the look, then the voice (choosing a voice plays a short sample; **Create a new voice**
when none fits), the history, and one **Save** at the bottom. See the
[changelog](CHANGELOG.md#0112---2026-11-07).

0.11.1 keeps the cognitive readings attached to the reply on screen: the emotional
diagram shows that reply's measurements even when you move between replies while they
load. In the Avatar view the avatar speaks only while you can hear it, the live line
and the answer each have their own read-aloud button, and completed answers no longer
carry an accent border. See the [changelog](CHANGELOG.md#0111---2026-11-07).

0.11.0 gives each entity its own identity and a track record. **Settings → identity**
keeps its look (design and colour) and its voice in one record that you save once and
the gateway checks; the Avatar view draws the entity in that design and colour.
**Settings → track record** counts its sessions, runs, successes, failures and tokens,
shows its trust for each kind of task as a completion rate only (a success means the
task finished; nobody has judged the quality of the work yet), and lists **who it has
met**: the people and the other entities, how many times, first and last. The
**Avatar** view also gets one live line under the avatar (click it for **Reply to
this** or **Latest**) and a **Findings** panel that collects what the entity
established (a sheet on a phone). All of this needs AbstractGateway 0.20.0 or newer.
See the [changelog](CHANGELOG.md#0110---2026-11-04).

0.10.0 adds an optional **Avatar** conversation view (public subtitles, questions,
corrections and permission requests; needs AbstractGateway 0.19.0 or newer), the
shared rounded composer in the chat drawer and the meet console, and the shared
account widget in the top bar. See the [changelog](CHANGELOG.md#0100---2026-11-02).

## What is an entity?

An entity is an AI companion with a lasting memory of its own. You give it a
name; from then on it remembers what you talk about, keeps a diary, sleeps to
sort its memories and grows over time. It lives on your AbstractGateway (its
memory is stored there, in its own folder), and it keeps one identity for its
whole life. In this app you can talk with it, watch what it remembers as a
live graph, and read its diary.

An entity is always in one of five states: **idle** (awake, nothing to do),
**personal** (its own time, which only you grant), **work** (jobs queued for
it), **visit** (someone is talking with it) or **sleep** (maintenance of its
memory). Every interaction forms a memory. The red **Stop** halts everything at
once; **Resume** brings it back idle. See
[The entity life cycle](docs/entity-phases.md).

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
  (**watch all**) and convene two of them into one conversation (**convene a
  meet**). Each entity is a card with **Watch**, **Retry** when its own time
  stopped unexpectedly and **Resume** when it is stopped: one card per row on a
  phone, two up to 1199 px, three from 1200 px and four from 1700 px.
- **Entity page** (`/?entity=NAME`): the memory graph, the timeline, and the
  side panel's tabs over the same life, in this order: Chat, Card, Health,
  Book, World, Lessons, Detail and Ledger (Chat and Card once you are signed
  in).

| Surface | What it shows |
| --- | --- |
| Phase bar | Where the entity is in its life cycle (idle, own time, work, visit, sleep or stopped), with a sentence, since when and where it goes next ("then: own time"); the **personal** toggle that grants its own time, **sleep now**, and the red **Stop** (or **Resume**). Beside it, one status line (the whole sentence on hover) and the **Files** (his home workspace, read-only) and **Settings** buttons. See [The entity life cycle](docs/entity-phases.md) |
| Memory graph | The entity's memories as a live graph, laid out by his topics (the groups his memory forms and titles in his sleep; with **topics** on, their circles, titles and the **Topics** panel), or as a force-directed graph until his topics are served (before his first sleep, or on an older gateway). Memories run from grey (rarely used) to green (most used); the lines stay dark grey except the trails he walked, which light green up to bright. After a reply, the **Context** view lights what he held in mind and the paths he travelled to each recalled memory. The toolbar holds **search**, **topics** and **Context**; the two-line legend under the graph names the kinds of memories and lines, and a click on one lights where they sit. With replay, time scrub and live tail. See [Reading the memory graph](#reading-the-memory-graph) |
| Chat | Visits: talk with the entity, see its reasoning cycles and tool use, adjust its mind (Gateway default or its own provider and model), its identity (avatar design, colour and voice, with their history), files, tools and system prompt in **Settings**, and read its track record (what it has done, trust by task, whom it has met) — an admin or the entity's creator changes them (gateway 0.14+: someone else reads its mind and identity with the gateway's sentence "Only an admin or <entity>'s creator can change its settings."). Replies can be read aloud in the entity's own voice (sentence by sentence, **Stop** any time) and the composer microphone dictates through the gateway's default speech-to-text route. In its **tools** tab each tool in each phase is a switch that applies at once and writes only that phase to `tool_policy.yaml`; a refused change switches back and shows the reason |
| Card | The entity's identity card: values, purposes, likes, open questions, interests, key moments and life so far |
| Health | Memory counts, recall coverage, sessions, model usage and on-disk footprint |
| Book | The diary as a day-grouped journal; sealed entries stay sealed |
| World | His world model: how he represents and sees the world, one card per thing he understands (people, places, ideas, systems) |
| Lessons | What the entity has learned and kept |
| Detail | One memory: its verbatim text, feelings and associations |
| Ledger | The continuous life ledger: memories formed, recalled, committed, appraised, diary and maintenance |
| Meet console | Two entities in one conversation: steer it, watch both sides, read it afterwards |
| Cognitive Monitor | Opened with **🧠 Monitor**, after **Live** in the timeline's controls, in the timeline's free space right of the lanes: a small bloom and the tone row for the expressive character of the entity's own words (not its inner state), at the timeline's position while you replay and, live with the chat open, for the reply in view. Opening it is what reads his words (once per entity while the page is open); its ⓘ says what it reads and with which basis |

In a conversation, type `@` to bring another entity in: pick it from the list
of entities your account can see, and it becomes a chip inside your sentence (the
first pick says "Nerin will read this conversation's history"). When you send,
the entity you are talking with answers first, then each entity you picked, one
after the other in your order, so the second one reads the first one's answer.
Each answer shows who wrote it: the entity's avatar, its name and an "entity"
tag. An entity busy elsewhere is skipped with "Pollux is in another
conversation."; one that cannot answer puts your words and its chip back in the
message box. A gateway without mentions says "This gateway does not offer
mentions yet". See [Mentions in a conversation](docs/api.md#mentions-in-a-conversation).

Under a reply, a badge shows each thing the turn kept: a diary entry, a lesson, an
interest, a question or a realization, with its title (a private diary entry shows
no words). Click a badge to open its record.

Chat also offers an optional **Avatar** view. It brings the entity to the center
of the scene with one live line of what it reports, a Findings panel and the same composer,
files and voice controls. Chat remains the default. Switching views keeps the
current work and draft; the technical panels and their saved width return when
you switch back. The Avatar view needs AbstractGateway 0.19.0 or newer; with an
older gateway it cannot show progress messages (it asks you to begin a new
conversation, or says the public conversation could not be refreshed), and Chat
works as before. New Avatar visits request public updates, and Flow turns request
them when started in Avatar. An already running visit keeps its original settings.
Permission requests show ordinary actions and destinations, labeled decision icons,
and the assistant’s public reason when it is attached to that exact request. “Review
details” returns to the detailed Chat view. Unknown actions require that review.

While work runs, send a correction in the composer. The gateway may accept it
for the assistant's next opportunity; acceptance does not confirm that the plan
changed. If the entity asks a question, the same composer answers that exact
question. Permission requests keep separate Allow/Deny controls. Refused messages
stay in the composer for retry. Public updates keep their source IDs for the technical view, and diary fences
are screened before the live line, the findings or narration. The avatar shows activity and, under it, one live line: the latest thing the entity reports while it works, replaced as soon as something new arrives (nothing cycles). Click it to read it in full, then **Reply to this** to answer it or **Latest** to follow again. The findings it reports (facts or evidence it established) accumulate in a **Findings** panel beside the avatar, or a sheet you open with **Findings** on a phone; open one to see the results it came from. The answer appears once, as a message, with Markdown, links and files like the conversation. A question, a
permission request and a finished answer are each signalled with both a visual and
an audio cue; the view itself has no cue settings. Optional narration uses the
existing read-aloud setting and the entity's own voice. History, reconnects and hidden panels stay silent.
Reopening a visit restores its public conversation, including actual answers, expired
questions with their declared fallback, and late replies retained for their original
question. A fallback is a system outcome, not a human answer. This public view is bounded; when the gateway omits earlier
exchanges or descendant runs, it says **Some earlier exchanges are not shown in
this view.** The durable conversation remains on the gateway.

The app is a thin client: it keeps no server state of its own. Every view is
read from the gateway, and the memory views are computed from the memory
engine's replay stream, so replay, live tail and scrubbing back in time show the
same picture. See [Architecture](docs/architecture.md) for how this works.

Without a reachable gateway the app opens a bundled demo life, so you can
explore the memory graph offline.

The **About** button in the top bar shows the app's version, the AbstractFramework
and AbstractGateway versions your gateway reports, and the project links; see [the FAQ](docs/faq.md#how-do-i-see-which-versions-i-am-running).

### Reading the memory graph

Each dot is a memory. Its fill runs from dark grey (rarely used) to green (most used), ranked
within his own life, and his most used tenth is bright green. Zoomed in, a small core shows the
memory's kind, in the colours of the legend's first line.

The lines stay quiet: every line he has not walked much is one dark grey, barely visible and still
dark where many cross. Only his walked trails light: the pairs of memories he used together most
turn green, and his most used trails bright green and wider, so they read as paths. An amber
(orange) line is a pair he used together a moment ago; it fades as he goes on. Hover or select a
memory to light its own lines and dim the rest.

After a reply, **Context** lights what he held in mind and rings each memory by why it came: gold
for the memories he always keeps in mind (present by right), pink for continuity (memories that
followed from the last ones) and blue for the memories found for this message (matched). A lit
line is the path he travelled to reach a recalled memory, in its ring's colour: pink for a trail
followed from the last memories, blue for this message's match. The links his memory names
(`continues`, `derived_from`, `mentions` and the others) are always the same quiet dark grey, with a
mark at the end they point to (an arrow, a double chevron, a circle, a diamond, a square or a bar);
the legend lists them by name. The Context box over the graph says what each ring and the lit lines mean.

Click a kind or a link type in the legend to light where those memories sit and frame them; click
it again, or press Escape, to let go. Memories closed when a newer version replaced them, or when
they were retracted, stay hidden until you press the "◌ N closed memories" toggle just before
**fit**.

With **topics** on, each topic is a circle with its title, and the **Topics** panel lists them,
each a card in its circle's colour. On a wide graph the panel opens docked at the top right, under
the layout buttons. Drag it by its head (or its grip) to move it anywhere on the page, over the
toolbar, the timeline and the side panel too; drag its bottom-right corner to grow it toward the
bottom right; **put back** docks it again. Your browser remembers where you left it. Click a topic
to focus and unfold it; click it again (or press Enter or Space) to fold it back to its card.
Unfold a topic for what his memory knows of it: its **Memory types** fold (rest on a type to light
those memories, click it to list them) and its paths most travelled (rest on a pair to light the two
memories, click it to frame them). A focused topic also shows as a one-line chip in the toolbar;
click it, or unpress **topics**, to let it go.

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
  and timeline wrap onto a second row. Below 480 px the controls row swipes
  sideways, and the phase bar takes the first screen width: the five state
  words, **Stop**, then its sentence and any question on lines of their own.
- **On-screen keyboard:** while the keyboard is open, an open panel fills the
  screen above it with the tab strip kept underneath, so the chat stays usable.
- **Graph overlays:** when the graph is narrower than 860 px, the toolbar
  (search, topics, Context) and the legend become one scrollable row each, the
  layout buttons (freeze, settle, fit) show their symbols only, and the
  **Topics** panel stays in place: it sits under the Context box and opens as a
  sheet over the graph.
- **Cognitive Monitor:** on a phone the open monitor takes the place of the
  timeline's lanes; press **Monitor** again to get them back.
- **Full-width panels on phones:** below 768 px the chat transcript, the
  ledger, the health panel and the entity list are flat sections without card
  borders, with a thin line between items and text that starts at the screen
  gutter.
- **Folding lists:** below 1024 px, where the side panel is a drawer, each list
  in the Detail tab has a heading you tap to fold it. Lists start open, and the
  app remembers each fold in this browser.
- **Touch screens:** buttons, selects and fields are at least 44 px tall, text
  fields use 16 px text, no text is smaller than 14 px, and the chat
  transcript reads at 15 px.
- **Text on a desktop:** text is at least 13 px, and the ledger and the tool
  grants at least 12 px. The graph's node labels keep their own sizes.

Limits:

- On a small phone (375 x 667) the memory graph gets about 275 px of height
  with the panel closed, because the header, phase controls, tab strip and
  timeline stay on screen. Larger phones give it more room.
- On a phone held sideways, an open panel covers the graph and the header; the
  tab strip stays visible under it.
- The side tabs are buttons: they do not support arrow-key navigation between
  tabs.

## Known limits

- A **Stop** that lands while the entity is in the middle of a model call can
  let that one call finish before everything halts; nothing new starts after
  it.
- A **mention** opens a visit with the mentioned entity for that conversation;
  the visit closes after 5 minutes without a new mention.

The full list is in [The entity life cycle](docs/entity-phases.md#known-limits).

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
npm test             # vitest (the tests under src/; untracked/ is ignored)
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [Documentation index](docs/README.md)
- [Getting started](docs/getting-started.md): install, sign in, create your first entity
- [Architecture](docs/architecture.md): components, gateway routes, invariants
- [API and configuration](docs/api.md): command, environment, URLs, gateway routes used
- [The entity life cycle](docs/entity-phases.md): the five states, own time, sleep, Stop and Resume, and how to read the phase bar
- [FAQ](docs/faq.md) and [Troubleshooting](docs/troubleshooting.md)
- [Changelog](CHANGELOG.md)

## License

MIT, see [LICENSE](LICENSE).
