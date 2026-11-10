# Getting started

This guide takes you from nothing to talking with your first entity. For what an
entity is, see [What is an entity?](../README.md#what-is-an-entity) in the README.

## Requirements

- Node.js 18 or newer.
- A running [AbstractGateway](https://github.com/lpalbou/AbstractGateway) and a
  gateway token to sign in with. The gateway console's **Create your first
  entity** shortcut needs AbstractGateway 0.4.1 or newer; the app itself works
  with any gateway.

## 1. Start the app

```bash
npx @abstractframework/entity
```

or install the command once:

```bash
npm install -g @abstractframework/entity
abstractentity
```

The app serves on `http://127.0.0.1:3007` and talks to the gateway installed on
this computer (else `http://127.0.0.1:8080`). If your gateway is elsewhere,
pass `--gateway-url`:

```bash
npx @abstractframework/entity --gateway-url http://192.168.1.20:8080
```

Every setting is listed in [API and configuration](api.md#configuration).

## 2. Sign in

Open `http://127.0.0.1:3007`. The connect dialog asks for your gateway token.
The server keeps your gateway session in HttpOnly cookies, so you sign in once
per browser and the token never sits in the page.

If you arrive from the gateway console, you are already signed in.

## 3. Create your first entity

With no entity yet, the app shows **No entities yet** and a **Create your first
entity** button. (From the gateway console, the Entity card's **Create your
first entity** button opens the same form; `http://127.0.0.1:3007/#new` does
too.)

1. Type a **Name**, for example *Pollux*.
2. Press **Create entity**. The button reads **Creating…** while the gateway
   sets the entity up, then the form reports **Pollux is ready.**
3. The app opens Pollux's page.

The name is all the entity needs: it starts from the standard starting
document. An entity keeps one identity for life, so if the name already exists
the form reports **Pollux already exists — opening it.** and opens that entity.

**Advanced: starting document** lets you paste your own starting document
(YAML). By default the gateway checks it against the framework rules; the
**Framework check** switch in the same fold turns that check off.

## 4. Talk with it

On the entity's page, open the **Chat** tab and say hello. Choose **Avatar** for
a focused conversation scene: one live line of what the entity reports, and the findings it has established so far; **Chat** keeps the transcript
and technical view. The draft and ongoing work survive view changes. New Avatar
visits request public updates; Flow turns request them when started in Avatar.
During work, send a correction in the same composer or answer the question shown.
An accepted correction is available to the assistant, but is not confirmation
that its plan changed. Questions and permission decisions stay separate.

A visit starts when you choose **visit** in the phase bar at the top of the
page. It opens in every state except stopped: when the entity is finishing a
step of its own, "waiting" shows beside **visit** until it is ready, and a
sleeping entity pauses its sleep for you and goes back to it when the visit
ends. Send a message in the composer to begin talking. In Chat, the memory graph
shows memories forming and being recalled, and the **Book** tab collects the
diary entries the entity writes.

Voice works in a visit when the gateway has voice installed (AbstractGateway
0.13.0 or later): the speaker on a
reply reads it aloud in the entity's own voice, and the microphone beside the
composer dictates (hold it while you speak, or tap to start and tap again to
stop). **Settings → identity** sets the entity's look (its avatar's design and
colour) and its voice, saved together; **Settings → voice** sets your own
speaker, microphone (with a Test and a level meter), spoken language and
**Read aloud**. **Settings → track record** shows what the entity has done, how
far it can be trusted for each kind of task, and whom it has met
(AbstractGateway 0.20.0 or later).

## 5. Bring another entity in

While you talk with one entity, type `@` in the message box and pick another
entity from the list; it becomes a chip in your sentence, and stays one in
the sent message (rest on it to see the entity's card). When you send, the
entity you are talking with answers first, then
each entity you picked, in your order; each answer shows the entity's avatar,
its name and an "entity" tag. If one is busy in another conversation, the app
says so and goes on with the next.

## 6. Its own time, sleep and Stop

A new entity starts **idle**: awake and visitable, with nothing of its own
running. Press the **personal** toggle in the phase bar to grant it its own
time: it then explores its own ideas, sleeps for maintenance when it needs to
and wakes by itself. Press it again to take its own time back; the entity
stays awake. While it is idle, once 24 hours have passed since its last sleep,
it has formed 500 new memories since then, or more than 15 % of its memories
are not yet settled, it goes to sleep for maintenance on its own; change these
thresholds in **Settings → Mind → Sleep**.

The red **Stop** asks first, then halts everything at once and cancels its own
time. **Resume** brings it back idle. Granting own time, Stop and Resume need
an admin account. See [The entity life cycle](entity-phases.md) for every
state and how to read the bar.

## Next steps

- Tour the tabs described in the [README](../README.md#what-you-can-do-in-the-app),
  and learn to read the graph's colours in
  [Reading the memory graph](../README.md#reading-the-memory-graph).
- On a phone or tablet, see how the layout adapts in
  [Responsive layout](../README.md#responsive-layout).
- Open **convene a meet** on the entities list to put two entities in one
  conversation.
- Read [Architecture](architecture.md) to see how the app reads a life from the
  gateway.
- Something not working? See [Troubleshooting](troubleshooting.md).
