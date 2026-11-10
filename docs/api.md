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
and the gateway it fronts (and where that address came from), and stops on
Ctrl+C. `abstractentity --help` lists the launch flags; an unknown flag stops
the start with exit code 2.

## Configuration

| Launch flag | Default | Purpose | Legacy environment |
| --- | --- | --- | --- |
| `--gateway-url <url>` (aliases `--gateway`, `--url`) | the gateway installed on this computer (`~/.abstractframework/gateway.json`), else `http://127.0.0.1:8080` | The gateway this deployment fronts; the sign-in dialog defaults to it | `ABSTRACTENTITY_GATEWAY_URL`, `ABSTRACTGATEWAY_URL` |
| `--port <n>` | `3007` | Port the server listens on | `PORT` |
| `--host <addr>` | `127.0.0.1` | Bind address. Loopback by default; `--host 0.0.0.0` exposes the app on your network | `HOST` |

A launch flag wins over its legacy environment variable. With neither, the app
uses the gateway installed on this computer: `abstractgateway serve` and the
AbstractFramework installer record its address in
`~/.abstractframework/gateway.json`. A running app re-reads that file when the
gateway refuses a connection, so it follows a gateway that moved to another
port; a gateway URL you chose never moves.

### Serving through the gateway (`/apps/entity/`)

A gateway that manages the Entity app serves it at `/apps/entity/` on the
gateway's own address and starts it on `127.0.0.1`. Nothing needs
configuring: the same build serves at `/` on the app's own port and at
`/apps/entity/` through the gateway. The page is served with
`<base href="/apps/entity/">`, every asset and request is relative to the page,
the session cookies carry `Path=/apps/entity/`, and every response carries
`X-AbstractFramework-App: entity; mount=1`. The app URLs below work under
either address. Serving under `/apps/entity/` needs AbstractGateway 0.7.0 or
newer.

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
| `GET /entity.html` | Redirects to the app's home (`./`, keeping the query) |
| any other path | A file from `dist/`, else the app (SPA fallback) |

## Gateway routes the app uses

All paths are under `/api/gateway`. The app works against whatever subset the
gateway serves; a surface whose route is missing shows a labelled gap instead
of invented data.

| Family | Routes |
| --- | --- |
| Entities | `GET /entities` (list; also the names offered by `@` in a conversation), `POST /entities` (create: `name`, optional `spark_text`, `framework`), `POST /entities/auth/probe` |
| Life stream | `GET /entities/{name}/replay` (NDJSON), `GET /entities/{name}/replay/stream` (SSE) |
| Records | `GET /entities/{name}/records/{id}/verbatim`, `GET /entities/{name}/diary/{id}` |
| Life cycle | `GET /entities/{name}/life_state`, `PUT /entities/{name}/life_state/toggles`, `POST /entities/{name}/lifecycle`, `POST /entities/{name}/state` (sleep now); `GET /entities/{name}/loop` and `/seat` (reads); `GET`/`PUT /entities/spec/phases` (the blueprint). See [Life cycle](#life-cycle-the-phase-bar) |
| Card and metrics | `/entities/{name}/card` (the home grid draws each tile from `GET /entities`, whose rows carry `state`, then reads cards three at a time, kept until 5 minutes pass or the row's `state.changed_at` moves), `/footprint`, `/cognition`, `/communities`, `/embedding` |
| Visits and chat | `/entities/{name}/visit/open`, `/visit/{run}/turn`, `/tick`, `/close`, `/transcript`, `/state`, `/guidance`, `/answer`, `/decision`; `/chat/open`, `/chat/{id}/turn`, `/close`, `/transcript`; `/summon`; `/queue/{id}`; `POST /sessions/{session_id}/mentions` (see [Mentions](#mentions-in-a-conversation)) |
| Settings | `/entities/{name}/substrate`, `/cognition-profile` (Settings → Mind, including the Sleep card), `/prompt`, `/tool-policy`, `/skills`, `/workspace`, `/workspace/file`, `/workspace/mounts`, `/access`; `GET /voice/voices`, `GET /voice/defaults` |
| Identity (AbstractGateway 0.20.0) | `GET /entities/{name}/identity[?rev=N]` (the record: design, colour, voice, revision; `?rev` for the history), `PUT /entities/{name}/identity` (the whole record, one Save; a refusal's `detail` is shown as it is, its `error.download` becomes the **Download** button: `POST /models/download`), `GET /entities/{name}/voice` (only its `note`, the sentence for a record without a voice) |
| Track record (AbstractGateway 0.20.0) | `GET /entities/{name}/track-record`, `/reputation`, `/acquaintances`, read when the tab opens |
| Voice in a visit | `POST /entities/{name}/voice/tts/stream` (speak a reply in the entity's own voice, sentence by sentence); `POST /attachments/upload` (the recording, into session `entity_voice_<name>`) then `POST /runs/{run}/audio/transcribe` (dictation) |
| Meets | `POST /entities/meets/open`, `/entities/meets/{id}/relay`, `/close`, `GET /entities/meets/{id}` |
| Other | `POST /embeddings` (cognition wave; 503 = no embedding route: the monitor says so and links to the console's Multimodal page), `/docs/corpus` (top-bar assistant), `GET /about` (versions in the About dialog) |

### Life cycle (the phase bar)

The phase bar ([The entity life cycle](entity-phases.md)) uses one read, three
writes and the live stream. Every path is under `/api/gateway/entities/{name}`.

| Call | Body | What the app does with it |
| --- | --- | --- |
| `GET /life_state` | none | Draws the bar: `phase` (`idle`, `personal`, `work`, `visit`, `sleep` or `stopped`), `stopped`, `toggles: {personal}`, `since`, `sentence`, `next: {phase, sentence}`, `blocked: {code, sentence, action}`, `can: {visit, sleep_now, toggle_personal}` (each `{allowed, sentence}`), `visit`, `work: {jobs_queued, current: {kind, run_id, since}}`, `sleep: {kind, reason, since, ends}`, `rev` and `generation` |
| `PUT /life_state/toggles` | `{"personal": true}` or `{"personal": false}` | Grants or takes back own time. The app never sends `work`: there is no work switch, and the gateway refuses it (422 `unknown_field`) |
| `POST /lifecycle` | `{"action": "stop"}`, `{"action": "resume"}` or `{"action": "retry"}` | Stop (it also revokes own time), Resume (back to idle), Retry (start own time again when `blocked.action` is `retry`). A stop's answer lists what it did in `items`, each with its `sentence`; `complete: false` keeps a second Stop beside Resume |
| `POST /state` | `{"state": "sleep", "dream": true}` | Sleep now: the entity sleeps for its maintenance and wakes when it is done. The app does not wait on this call; the stream shows the sleep and the wake. The chat also sends `{"state": "awake"}` once, before retrying, when an older visit door refuses a visit because the entity is asleep |

- **Live.** A host event with `payload.kind == "phase_changed"` on
  `GET /replay/stream` repaints the bar at once; the app then reads
  `life_state` again. The bar also re-reads every 15 seconds.
- **Newest wins.** The answer with the highest `rev` wins, and an answer from
  before a Stop (a lower `generation`) never repaints the bar after it.
- **Refusals.** A refusal's `detail.message` is shown as it is, and its
  `detail.life_state` (when present) repaints the bar. Coded refusals without
  a message get the app's sentence for the code: `stopped_use_resume`,
  `in_visit`, `already_asleep`, `entity_archived`, `unknown_field`,
  `invalid_body`, `invalid_toggles`, `invalid_action` and `entity_not_found`.
  `admin_required` always reads "Only an admin can grant his own time, stop or
  resume him."
- **Older gateways.** A `life_state` answer without these fields (no `rev`,
  no `can`, no `generation`, or a `work` that is not the job queue) shows "This
  gateway does not serve the phase bar yet." with every control off. The app
  never falls back to older routes.
- **Sleep thresholds.** Settings → Mind → Sleep reads `GET /cognition-profile`
  and saves one field at a time with `PUT /cognition-profile`:
  `{"sleep": {"after_hours": 48}}` or `{"sleep": {"after_events": 500}}`
  (integers of at least 1; hours at most 720). The answer is the whole
  profile. A refusal shows the gateway's sentence under the field. A profile
  without a `sleep` block shows "This gateway does not offer the sleep
  settings yet." and disables both fields.

### His topics (the graph's layout)

The graph reads his topics with `GET /api/gateway/entities/{name}/communities`.
The app reads payload version 2 as memory serves it: `version`, `version_seq`,
`first_sleep_pending`, `algorithm`, `communities` (each with `id`, `key`,
`title`, `summary`, `pending`, `verdict`, `size`, `kinds`, `members`,
`provisional_ids`, `cohesion`, `layout: {xy, radius, seats}`,
`centroid_stale` and `facts`, whose fields may each be absent) and `links`.

- **Layout.** Each topic is a circle at `layout.xy` with `layout.radius`, and
  each member sits on its seat. A topic's `key` stays the same from one
  version to the next, so your focus, its colour and where you dragged it
  survive a new version; `id` names the current revision.
- **Titles and summaries** are memory's own: "title being written…" while
  `pending` says so, never a label the app makes up. A `verdict` of
  `no_common_subject` reads "He found no common subject in these memories."
- **Live.** A host event with `payload.kind == "communities_changed"` on
  `GET /replay/stream` makes the graph read the new version once; a `placed`
  event seats a new memory in its topic at once, with the badge "placed until
  his next sleep".
- **Before his first sleep** (`first_sleep_pending`) the graph uses its plain
  layout and says "His topics form during his next sleep."
- **Older gateways.** An answer without `version` 2, or one that leaves out a
  required field, shows "This gateway does not serve topics yet." and the
  plain layout; the app never works out topics itself.

### Replies, badges and cut summaries

- **Badges.** What a turn formed is served beside the reply, never inside its
  words: `reply_notices` on a visit turn's answer, and `notices` on a
  flow-brain answer in the replay view. Each notice is one badge under the
  reply; a click opens its record.
- **Cut summaries.** When the gateway marks a record `cut: true` (the record
  read, the replay's record and recall blocks, and the statements of
  `GET /card`), the app shows the record's title and "Older record: its
  summary was cut when saved; he rewrites it in his sleep." instead of the
  cut words. Without the flag, the words show as stored.
- **A Stop during an open.** A visit open answered with 409
  `stopped_use_resume` shows the gateway's sentence and **Resume and visit**.

### Mentions in a conversation

In a visit, or a flow-brain conversation, `@` lists the entities that
`GET /entities` returns for your account, except the one you are talking to.
A pick becomes a chip; the app never reads `@` out of the typed words. On send,
your message goes out as usual, then each mention, in the order you picked it
and each only after the previous one answered:

```http
POST /api/gateway/sessions/{session_id}/mentions
{"entity": "nerin", "text": "<your message as typed>", "mention_index": 0,
 "repeat_of": "<your turn in this session, flow-brain lane only>",
 "mention_id": "<message>:<entity>:<mention_index>"}
```

- **`mention_id`** names one mention of one message. The message part is your
  own turn in the session (`repeat_of`) or, in a visit, an id the app makes
  once for the message (`msg-` and 24 hex digits) and keeps for a resend. When
  you send the same words again after a failure, the same ids go out and the
  gateway returns the answer the entity already gave instead of asking it
  twice.
- **200**: `reply` is shown as its own message, labelled from `author`
  (`{kind, name, entity_id, identity_ref, avatar}`): the entity's avatar, its
  name and an "entity" tag. `mirrors` lists the visits that were also told
  the reply (in a visit, the entity you are visiting); the app adds "Also said
  to Castor." under the answer.
- **409** (`in_another_conversation`, or another refusal from the visit
  door): "Pollux is in another conversation." (or the gateway's sentence), and
  the next mention goes on.
- **503**: the gateway's sentence; your words and the chips that were not
  answered go back to the message box. Sending the same words again asks only
  those entities.
- **404 `entity_not_found`**: "Pollux cannot be mentioned here."; the name is
  no longer offered.
- **422 `repeat_of_unknown`**: the gateway's sentence; your message goes back
  to the message box.
- **404 or 405 without a code**: the gateway has no mentions route. The app
  says "This gateway does not offer mentions yet" and from then on `@` shows
  that sentence instead of names.

In the flow-brain lane, the turn itself also names the chips:
`POST /entities/{name}/summon` carries `mentions` (the picked entities'
slugs, in pick order, each once), so the entity knows the mentioned entities
answer for themselves. A message without chips sends no `mentions`.

The app sets no time limit on a mention, as on any visit turn.

### Avatar conversation

The optional Avatar presentation needs AbstractGateway 0.19.0 or newer. It requests
`conversation: true` on a new durable visit's open body. Existing visits keep their initial mode. The app reads only
`GET /entities/{name}/visit/{run}/state` public fields: `public_updates`,
`public_messages`, `public_questions`, `pending_question` and `pending_wait`. It does not derive
public speech from the entity's private replay envelopes or technical output.

`public_questions` carries canonical question, real user answer, system expiry and
retained-reply messages with their original run/question identity and source.
An expiry fallback stays a system outcome; it is never rendered as a person answering.
Public arrays merge by the gateway's recorded `order` and `published_at`, not a
browser-time estimate. Each of the three public arrays is bounded to 64 messages,
with at most 32 runs in the visit tree inspected. Positive `public_updates_omitted`,
`public_messages_omitted`, `public_questions_omitted` or `conversation_runs_omitted`
shows the earlier-exchanges notice. These bounds limit the view, not durable storage.

During a durable visit, `POST /guidance` under that visit sends
`{text, display_text}`: `text` may quote a selected public update, while
`display_text` is the person's own words for public history. Its accepted receipt
means the guidance is available, not that the actor adopted it. A pending question
uses `POST /answer` with `{wait_key, response, target_run_id}` from that exact
question. Permission controls use `POST /decision` with `{wait_key, approved}`;
silence does not grant permission. A refusal keeps the draft for retry.

The Flow-brain lane is a separate summoned workflow in the authenticated
principal's runtime. Avatar turns request
`input_data._runtime.conversation.enabled: true`. Its existing served run view
provides explicit public messages and interactions; supported workflow commands
carry live guidance or an exact wait response. Durable visit runs use their owned
visit routes and never fall through to those generic commands.

Essential questions wait for an answer. Clarifications show the server's deadline
and declared fallback. Visual and audio cues are both on; the view has no cue
settings. Public-update narration uses the
listener's read-aloud preference and the entity voice described below. Opening,
history restoration, reconnects and hidden conversation panels establish silent
baselines.

### Identity and track record

Settings → identity is the ui-kit's `IdentityPanel` (look, voice, history, one Save at the bottom),
wired to this gateway in `identity_settings.tsx`. It reads `GET /entities/{name}/identity` and
saves the whole record with one `PUT` (`{avatar: {style, color}, voice: {provider, model, voice}}`;
the record's speed and quality ride along while the voice is unchanged; a voice chosen without its
speech model takes the model a cloned voice is bound to, else the engine's first listed model). The
voices come from `GET voice/voices`; choosing one plays a short sample on the entity's own lane
(`POST /entities/{name}/voice/tts/stream` with the chosen voice fields: nothing is saved); **Create a
new voice** uses `POST voice/design` or `POST voice/clones`. The design list is the AbstractAvatar catalog bundled in
the ui-kit, limited to designs with a Watch code (the gateway refuses the others). The avatar draws
the design in the entity's colour: the colour replaces the theme's `--warning` token around the
canvas, the body colour of the kit's palette. A refusal is shown word for word and nothing is
retried. History reads `?rev=N` for every revision, newest first. A record without a voice shows
the `note` of `GET /entities/{name}/voice`, the gateway's sentence.

The Avatar view resolves the visit's `identity_ref` (from `POST /visit/open`, or the newest public
update that carries one) with `GET /entities/{name}/identity?rev=N`. A visit that names no identity
(a visit rejoined after a reload before any update arrives, a Flow conversation) draws the kit's
avatar.

Settings → track record shows the gateway's numbers as they are; the words are the app's: a trust
cell with no outcome reads "No experience yet", and the `completion-rate only` basis reads "A
success here only means the task finished: nobody has judged the quality of the work yet."

### Voice uses the same gateway routes

Voice uses the same gateway routes and ui-kit components as AbstractCode. It
needs AbstractGateway 0.13.0 or later (`GET /voice/defaults`):

- **Speak.** A reply's speaker button, or **Read aloud**, posts the reply to the
  entity-owned streaming lane. The request carries the text and, when set, the
  listener's latency choice — never a provider, model or voice: the gateway
  speaks with the entity's own voice (Settings → identity), else its `output.voice`
  default, and sends the audio one sentence at a time, so the first words play
  while the rest is synthesised. **Stop** aborts the request.
- **Dictate.** The composer microphone records in the browser (hold to dictate,
  or tap to start and tap again to stop), uploads the recording into the
  session `entity_voice_<name>` and transcribes it on the run the upload names,
  with the gateway's `input.voice` route unless you chose another. While it
  works the composer shows `Transcribing… 4 s · faster-whisper / large-v3`; a
  failure, or no answer within 180 s, shows a sentence.
- **Defaults.** "Gateway default · supertonic / supertonic-3" and the
  transcription route come from `GET /voice/defaults`, never from the voice
  catalog's engine fields.

The replay stream format and the gateway routes are owned by AbstractMemory and
AbstractGateway; see their documentation for request and response shapes.

## Specifications in this repository

- [`spec/entity_phases.json`](../spec/entity_phases.json): the entity life
  cycle's phase graph (version 25), served by the gateway at
  `GET /api/gateway/entities/spec/phases`. Human-readable companion:
  [The entity life cycle](entity-phases.md).
- [`spec/cognition_graph.json`](../spec/cognition_graph.json): the cognition map
  drawn on the blueprint page.

## Related

- [Troubleshooting](troubleshooting.md) for sign-in, gateway and port problems.
- [Data flow](DataFlow.md) for which route feeds which surface.
