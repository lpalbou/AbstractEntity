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

The app serves on `http://127.0.0.1:3007` and talks to the gateway at
`http://127.0.0.1:8080`. If your gateway is elsewhere, set
`ABSTRACTENTITY_GATEWAY_URL`:

```bash
ABSTRACTENTITY_GATEWAY_URL=http://192.168.1.20:8080 npx @abstractframework/entity
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
(YAML). By default the gateway checks it against the framework rules; you can
turn that check off in the same fold.

## 4. Talk with it

On the entity's page, open the **Chat** tab and say hello. A visit starts when
you speak; a sleeping entity wakes up for it. While you talk, the memory graph
shows memories forming and being recalled, and the **Book** tab collects the
diary entries the entity writes.

## Next steps

- Tour the tabs described in the [README](../README.md#what-you-can-do-in-the-app).
- Open **convene a meet** on the entities list to put two entities in one
  conversation.
- Read [Architecture](architecture.md) to see how the app reads a life from the
  gateway.
- Something not working? See [Troubleshooting](troubleshooting.md).
