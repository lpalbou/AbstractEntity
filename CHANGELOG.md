# Changelog

All notable changes to `@abstractframework/entity` are recorded here.

## [Unreleased]

### Changed

- **A calmer, better organised Settings window.** Its nine sections now sit in four groups (Mind &
  voice, Identity & record, Workspace, Prompt) in a side list — a section picker on a phone — and
  each opens with a title and one line saying what it is for, with the long explanations folded
  under "How … works". The window, its menus, switches and buttons are the shared AbstractFramework
  ones, and every setting saves exactly as before.

### Fixed

- **The "what moved in his mind" window under a reply is readable.** Each lookup now says in
  plain words what he asked (the web search, the page, the memory search) and what came back:
  web results as titles, snippets and links, a page with its title and text, memory search hits
  as rows, failures marked clearly, with long results folded and the exact text one click away.
  The system prompt opens as titled sections (who he is, his values, his diary, then the
  framework's instructions) and copy still copies it exactly. Every memory in the context can be
  opened to its full words; a diary entry opens only when you click, and says that this read is
  recorded in his biography.
- **The ledger follows the entity live again.** In live mode the ledger kept showing only what
  had loaded when the page opened, while the timeline went on counting, so an entity's personal
  time looked stuck on its first recall. Every new line now appears as it lands: the diary entries
  he writes, the moments he lives, the memories he holds in mind, his feelings and dreams.
- **Personal time reads as days and ticks.** Each day opens once ("a day of his own begins"),
  each tick is marked where it starts (at the recall that opens it), and "he closes the day"
  marks the evening reflection. "A day of his own begins" no longer repeats before every tick.
- **The ledger stays at the bottom while you watch.** Opening the Ledger tab in live mode shows
  the newest line, and the ledger no longer stops following on its own when many lines land at
  once; only scrolling up stops it. The "new lines below" button counts the rows you will see and
  no longer shows through the rows beneath it.
- Opening another recorded life with the same event numbers no longer keeps the previous one's
  lines in the ledger.
- **The Card and the header follow the entity live.** The Card tab used to show the card as it
  was when the tab first opened; it now reads it again a moment after the entity changes (a new
  memory, diary entry, feeling or a visit/phase moment), only while the tab is open, and catches up
  when you open it. The header's state, phase and spend refresh on the same moments instead of
  waiting for their 15-second check.
- **The ledger reads by time.** Each row shows when it happened (UTC), with the date at the start
  of every day; hovering a time shows its date, its tick (or visit turn) and its event number. A
  colour key names the six colours, all taken from the theme so they stay readable in light and
  dark; it can be folded, and stays as you left it. Grouped "memories drawn on" rows read in two
  lines (hover for every memory, click for each event), and each tick line says when it started.

### Changed

- **A world model reads as his understanding of something.** The Detail tab now opens a world
  model with what it is about: when it first formed, how many times it was revised and by whom
  (him, or the sleep pass gathering evidence), when it was last updated, the evidence behind it and
  its threads. Then comes his understanding in his own words, as of when he wrote it (or a plain
  statement that he has not written it yet), how his view evolved from revision to revision, and
  finally the memories it comes from, one line each, his words one click away.
- **A dream shows what it touched.** Instead of the sleep pass's run-on summary, the Detail tab
  shows how his understanding changed (the card revised, and the memories new in it) and what the
  night set side by side, each with the night's own note and how it felt, and the memories
  themselves in full; the summary stays below.
- **His words are formatted.** Answers render as Markdown (images stay links), his choice to
  rest reads as a line ("Chose to rest: …"), and code blocks wrap instead of scrolling sideways.
  "Used together with" and a recall's "considered but dropped" list every memory behind "(…)".

## [0.11.2] - 2026-11-07

On `@abstractframework/ui-kit` ^0.9.16 (AbstractUIC 0.10.3, with `IdentityPanel` and the avatar frame-rate fix) and
`@abstractframework/panel-chat` ^0.8.2. Works with the same gateways as 0.11.1.

### Fixed

- **The home page shows every entity at once.** The "Summoned entities" grid used to wait for every
  entity's details before drawing anything, then read their cards one at a time, so a long life
  (such as one whose card takes seconds to compose) left most tiles on "reading his card…". Now
  each entity's tile appears as soon as the list arrives, with its name and its sleep or wake
  state, and fills in on its own: its phase buttons as soon as its state is read, its age, mind,
  interests and key moments when its card arrives. Cards are read three at a time, kept, and read
  again only after five minutes or when the entity's state changes. A tile still waiting shows
  quiet placeholder lines at the size of the finished tile, so nothing jumps, and a refresh never
  empties a tile. A card that cannot be read says "details unavailable right now" (the reason is
  on hover) and is tried again a minute later.
- **The Cognitive Monitor always reads the tone of a reply.** When no emotion cleared the evidence
  gate (common for factual replies), the monitor said only "Read complete · no clear emotional tone".
  It now says the tone of the phrasing from the five tone channels it already scores, on both sides:
  warm or discouraged, urgent or unhurried, reflective or matter-of-fact, structured or loosely
  associative, assured or hedging. A channel speaks only when the reply is more extreme than 97% of
  a reference set on that side ("very …" beyond 99%); otherwise the reading says the phrasing is
  typical. The reference set is this home's embedding cache (1,599 texts, 2026-11-07), committed as
  channel scores only (`src/fixtures/tone_reference_scores.json`); the cutoffs are re-derived from it
  in a test. Known limitation: a short hazard warning ("The forecast mentions a storm…") reads
  "hedging". For Castor's reply to "what are the last things you remember?" it reads "Discouraged
  phrasing — no clear emotion."; a plain "The meeting is at 3pm." reads "Typical phrasing, no tone
  stands out — no clear emotion.". When an emotion clears the gate it is named first ("faint
  evidence" when the gate is weak) and warmth is left to the emotion, so the two never contradict.
  A row of the five channels under the bloom (WAR, TSN, REF, STR, CER) shows the same reading as
  marks (· typical, + or − beyond 97%, ++ or −− beyond 99%); each mark is a button named with the
  exact value and its word, and opens the channel's explanation with the current value. The Wave
  tab shows the same sentence. No scoring change and no text matching: only the existing embedding
  scores. `scripts/derive_tone_cutoffs.mjs` re-derives the cutoffs, or re-cuts them from new vectors.
- **The monitor describes its basis correctly.** The tooltip and the information panel said the basis
  was calibrated on the entity's own words. The registers and channels are generic (the same for
  every entity); the basis's normalization and emotion-gate floor were fitted on a mixed corpus
  (20 curated texts, 125 anchor texts and 74 utterances of entity:ephemeral, recorded 2026-08-01).
  The panel no longer mentions the retired v0 calibration.

### Changed

- **Settings → identity is one clear page.** It is now the shared identity panel from the kit
  (`IdentityPanel`): first the **Look** (the avatar as it will be drawn, its design and colour),
  then the **Voice** (the engine, then a voice it offers; choosing a voice plays a short sample in
  that voice; **Create a new voice** from a description or a recording opens only when you ask),
  then the **History**, and at the bottom one line saying what happened and one **Save**. The
  "Gateway default / Custom" switch, "Speech provider" and "Voice / profile" are gone, and the
  speech model is offered only when an engine has several ("Automatic" by default). As before,
  the gateway's refusal is shown as it is, with a **Download** button when it offers one, and a
  viewer who may not change the identity sees it in words with the reason.

## [0.11.1] - 2026-11-07

On AbstractUIC `@abstractframework/ui-kit` ^0.9.15 and `@abstractframework/panel-chat` ^0.8.2.
Works with the same gateways as 0.11.0.

### Fixed

- **The cognitive readings follow the reply you are looking at.** When you move between replies
  while their readings are still loading, the emotional diagram shows the measurements of the
  reply on screen, never those of the one you just left, and a reading that failed while you were
  elsewhere is fetched again instead of leaving the diagram empty. Switching entity or gateway
  starts the diagram afresh. For an entity whose memory uses a different embedding model, the
  diagram now appears with a note saying so, where 0.11.0 hid it.
- **In the Avatar view, the avatar speaks only while you can hear it.** It shows the speaking pose
  while the reply is actually audible, not while it is still being prepared or while the browser
  holds the sound back. When the browser blocks the sound, the app says so ("Audio playback is
  paused by the browser. Press Play to try again."), and Play then resumes the same audio instead
  of preparing the reply again.
- **The live line and the answer each have their own read-aloud button** in the Avatar view, the
  same speaker as in Chat: play or pause it there.
- **Completed answers no longer carry an accent border** in the Avatar view.
- An entity without its own identity yet is drawn in the shared default avatar design in the
  Avatar view.

## [0.11.0] - 2026-11-04

On AbstractUIC `@abstractframework/ui-kit` ^0.9.14 and `@abstractframework/panel-chat` ^0.8.1.
Needs AbstractGateway 0.20.0 (with AbstractRuntime 0.18.0 and AbstractAgent 0.6.0) for the digital identity
(the two new Settings tabs and the visit's own look) and for the Avatar view's live line and Findings panel.
With an older gateway those tabs say what could not be read, the visit keeps the kit's avatar and every
update is shown as progress. Chat works with any gateway.

### Added

- **Settings → identity** (framework ADR 0052): the entity's look and voice, one record kept in its
  home. Its avatar is drawn in its own design and colour; choose another **Design** (the designs the
  Watch can draw too), a **Colour** and a **Voice** (the kit's voice picker, with Create a voice),
  then **Save** once. The gateway checks the choice when it is saved: when it refuses (closed for
  maintenance, a design it cannot draw, a voice it does not offer, a voice model not downloaded),
  its sentence is shown as it is, never retried, with a **Download** button when it offers one. An
  entity without a voice yet shows the gateway's own sentence ("Castor has no voice yet: …") and no
  voice in its place. **History** lists every revision, newest first: what changed, when and by whom.
- **Settings → track record**: sessions, runs, successes, failures and tokens; **Trust by task**
  with how many outcomes each trust rests on ("Trust 0.75 over 6 outcomes", "No experience yet")
  and the plain note that a success only means the task finished; **Who it has met**: the people
  and the entities, how many times, first and last. Read when the tab opens, never on a poll.
- **The Avatar view draws the entity by the identity its visit names**: its design and colour from
  the record (`identity_ref` of the visit, resolved with `GET /entities/{name}/identity?rev=N`).
  The live line and the Findings panel are unchanged.

### Changed

- **Avatar view: one live line and a Findings panel.** Under the avatar, one line shows the latest
  thing the entity reports while it works, replaced as soon as something new arrives; click it to
  read it in full, then **Reply to this** or **Latest** (back to following). The findings it reports
  (facts or evidence it established) accumulate in a **Findings** panel beside the avatar, a sheet
  opened with **Findings** on a phone; each opens to the results it came from. The answer appears
  once, as a message. The rolling captions and the in-view Conversation history are gone. Needs the producer-typed public
  updates of AbstractAgent (`kind`) and AbstractRuntime (`update_kind`); older updates are shown as
  progress. Shared conversation bundle re-synced from AbstractUIC panel-chat.
- An open question appears once, above the live line, and answered questions no longer carry a
  "Question" / "Answer" footer. Replying to an update from an earlier exchange now says: "Choose
  Latest, then send your message again."
- Each public update keeps the type the gateway serves (`update_kind`: `finding` or `progress`), so
  findings reach the Findings panel.
- **Settings → voice** keeps your own speaker, microphone, language and Read aloud; the entity's
  voice moved to Settings → identity (its "Gateway default voice" choice is gone: an identity always
  names its voice).

## [0.10.0] - 2026-11-02

On AbstractUIC 0.9.0 (`@abstractframework/ui-kit` ^0.9.12, `@abstractframework/panel-chat` ^0.7.0, `@abstractframework/app-server` ^0.1.13).
The Avatar conversation's public updates, corrections and question answers need AbstractGateway 0.19.0 or newer; Chat works with any gateway.

### Changed

- The chat drawer and the meet console use the shared rounded multiline composer (AbstractUIC
  panel-chat 0.7.0). The meet console keeps "speak to" above the field, Ctrl/Cmd+Enter to relay,
  and the closing note next to Send; the chat drawer's Attach button is the composer's own and
  its voice controls sit beside Send. A browser check covers the meet console:
  `npm run e2e:meet -- --playwright ../abstractcode/web` after `npm run build`. The Docs assistant
  drawer is the shared AbstractUIC component (vendored, `npm run sync:docs`), so its composer,
  dictation microphone and footer ("Powered by AbstractEntity’s documentation.") match every app,
  and it opens under the top bar.

- Avatar question history restores actual answers, expiry outcomes and late replies
  retained for their original question after reconnect. Public events follow the
  gateway's recorded order, and bounded history shows an explicit omissions notice.

- **Optional Avatar conversation view** centers the entity with public subtitles,
  revisit-able history, source IDs and the existing voice,
  file and composer controls. Chat stays the default. New Avatar visits and Flow
  turns opt in to public updates; view changes preserve ongoing work and drafts.
  A message sent just after a reply lands starts a new turn; it is sent as guidance
  only while the visit is still working.
  Corrections during a durable visit use its owned guidance/answer routes, while
  summoned Flow turns use their existing principal-owned workflow runtime.
  Questions and permissions remain distinct, refusals preserve the draft, and
  history/reconnect/hidden-panel speech stays silent. Diary content and technical
  internals never enter the public subtitle projection. Permission requests show the
  assistant's public reason when it is attached to that exact request. The avatar
  signals questions, permission requests and completion with both a visual and an
  audio cue; the view itself has no cue settings. The avatar follows the gateway's
  pause state, and files delivered in a reply use the shared presenter.

- **The top bar's account is the kit's ONE account widget** (operator ruling 2026-10-29: the docs button, Appearance,
  About and the account are the same kit components in every app). Signed in, one button shows the person icon, your
  name and the connection light; its menu holds Signed in as, Gateway, Copy user id and Disconnect. It replaces the
  Disconnect pill. The account comes from the app server's connection answer (proxy posture) or the verified bearer
  (`src/entity_account.ts`). Test: `src/top_bar_set.test.tsx`.

### Fixed

- **Read aloud no longer speaks existing messages** when re-opening a visit (operator 2026-10-29): a reply is spoken by
  itself only when it was produced while the conversation is open (AbstractUIC panel-chat's rule, `readAloudStep`,
  imported from `@abstractframework/panel-chat` 0.7.0). The effect used to remember the newest reply before the
  conversation had loaded, so the first loaded reply was spoken.

## [0.9.3] - 2026-10-28

On AbstractUIC 0.8.4 (`@abstractframework/ui-kit` ^0.9.5, `@abstractframework/panel-chat` ^0.6.4, `@abstractframework/app-server` ^0.1.13).

### Fixed

- From the kit, in the entity chat (`chat_message_list.tsx` renders panel-chat's `ChatMessageCard`): a message's stamp carries the date when it is not from today ("Yesterday · 10:52 PM", "Oct 21 · 10:52 PM"; the full date on hover), and a reply with no text keeps its speaker, disabled with the reason "No text to read aloud" (AbstractUIC backlog 0064, the message footer spec).

## [0.9.2] - 2026-10-28

On AbstractUIC 0.8.3 (`@abstractframework/ui-kit` ^0.9.5, `@abstractframework/panel-chat` ^0.6.3, `@abstractframework/app-server` ^0.1.13).

### Fixed

- From the kit: in the entity chat, a reply's speaker and copy buttons are always visible (they appeared only on hover); the speaker shows a spinner only while the first audio is generated, then Pause, and Play when paused (`chat_message_list.tsx` renders panel-chat's `ChatMessageCard`); the entity's own voice picker (`mind_voice_settings.tsx`, the kit's `VoiceSettings`) shows each speech model once, labels a saved voice the gateway no longer lists "Saved voice (not listed)" instead of its id, and under a cloned voice names the model it is always spoken with.

## [0.9.1] - 2026-10-28

On AbstractUIC 0.8.2 (`@abstractframework/ui-kit` ^0.9.4, `@abstractframework/panel-chat` ^0.6.2, `@abstractframework/app-server` ^0.1.13).

### Fixed

- The connection dialog says "Gateway … did not answer" when the gateway is down (it said "Session rejected — sign in again"); the voice settings list each Qwen3-TTS voice once and style "Create a voice" / "Manage voices".
- Also from the kit: the model picker's "Custom" is no longer cut.

## [0.9.0] - 2026-10-28

### Changed

- **A summoned turn is followed on the gateway's replay view** (AbstractGateway 0.17.0 `GET runs/{id}/view` and
  `/view/stream`; AbstractRuntime backlog 0854, framework backlog 0993): the drawer's flow lane, the queue's admitted
  turn and the goodbye no longer poll `GET runs/{id}` every 1.5 s. The view stream says when the run ends; the run
  summary is then read once for its structured output (the degraded contract, `tool_rounds`), and the view's final
  message stands in if the summary never turns terminal (`followRunToTerminal` in `src/flow_lane.ts`).
- Built on `@abstractframework/panel-chat` ^0.6.0 (AbstractUIC 0.8.0), up from ^0.5.0, for its replay view client
  (`createReplayViewTransport`, `ReplayViewFold`).

### Fixed

- **A turn that asks no longer hangs silently.** A tool approval or a question anywhere in the run tree is shown once
  per wait ("The turn is waiting for a tool approval … Answer it from AbstractCode or the Observer"), and the lane keeps
  following the run; before, a waiting run counted as unfinished until the 10-minute deadline.
- The follower never parks on a half-open connection: a view read has a 30 s budget, the view stream is aborted after
  20 s without a byte (the gateway's keep-alive comments count) and reconnects from its last frame; reconnects back off
  up to 2 s and the run is reported lost only after 30 s without a frame. A stop during the final summary read stops
  the turn (the old answer is not shown); a summary that trails the run is retried, and when the view stands in it keeps
  the goodbye's words and the summary's real error. A repeated question on the same step key is shown again.
- A gateway without the replay view (before 0.17.0) keeps the status poll, said once in the conversation ("Following
  runs by polling their status: …"). Any other failure of the view counts toward "the drawer lost its view of the run",
  never a silent switch.

## [0.8.0] - 2026-10-28

### Added

- **Create a voice for him** (AbstractGateway 0.16.0 voice library): Settings → Voice offers **Create…** on his voice
  picker: from a description (`POST voice/design`, with an optional name and language; bounded at 10 minutes because the
  design engine may load first) or from a recording (`POST voice/clones`: file, name, language, reference text). The new
  voice is selected and saved as his own. A refusal (403 on a gateway with one shared voice store, 501 when the engine is
  missing) shows the gateway's own sentence. Not offered on the listener section, whose speech never carries a voice.

### Changed

- Built on `@abstractframework/ui-kit` ^0.9.2 and `@abstractframework/panel-chat` ^0.5.0 (AbstractUIC 0.7.2), up from
  ui-kit ^0.8.9 / panel-chat ^0.4.0.

## [0.7.1] - 2026-10-15

### Changed

- **The creator configures their entity** (operator ruling 2026-10-08, gateway 0.14+): Settings →
  mind and voice read `GET /entities/{name}/access`. An admin or the entity's creator changes them;
  anyone else sees the mind picker disabled and the voice as text, with the gateway's sentence
  ("Only an admin or nova's creator can change its settings.") on a line carrying the kit tooltip.
  A gateway without the route keeps the controls live (a refused write shows its own sentence).

- CI: `npm run check:lock` (also a CI step, before `npm ci`) fails when `package-lock.json` lags `package.json` or resolves an `@abstractframework/*` dependency below its floor, in another major.minor or from a local tarball; `--latest` also catches a published patch the lock has not taken. The lock now resolves `@abstractframework/app-server` 0.1.12 (floor `^0.1.12`). See [CONTRIBUTING](CONTRIBUTING.md#lockfile-check).

## [0.7.0] - 2026-10-05

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
- **Docs assistant is the kit's shared `DocsAssistantDrawer`** (panel-chat 0.4.0; the book icon in
  the top bar, the same drawer as the console and the other apps): your question on the right, the
  answer on the left with markdown, code, JSON and links rendered, streaming, copy, attachments, an
  icon-only New conversation and a one-line grounding footer. It answers from this app's `llms.txt`
  through the gateway's docs-qa workflow (`GET /docs/corpus?app=entity`), one gateway session per
  conversation; the former `runs/{session}/chat` transport is gone. The build ships `llms.txt` in
  `dist/` and the app server serves it as `text/plain`.
- Dependencies: `@abstractframework/ui-kit` ^0.8.0 and `@abstractframework/panel-chat` ^0.4.0.
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
