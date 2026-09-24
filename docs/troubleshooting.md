# Troubleshooting

Each entry lists the symptom, how to confirm the cause, and the fix. Setup
steps are in [Getting started](getting-started.md); settings are in
[API and configuration](api.md#configuration).

## The app shows a demo life instead of my entities

**Cause:** the app could not reach a gateway, so it opened the bundled demo.

**Check:** the command prints `Gateway: <url>` on start. Confirm that gateway is
running and reachable from the machine that runs `abstractentity`.

**Fix:** start the gateway, or point the app at it with
`ABSTRACTENTITY_GATEWAY_URL=http://HOST:PORT`, then reload the page.

## The sign-in dialog rejects my token or keeps coming back

**Check:** the gateway URL in the dialog is the gateway you expect, and the
token is a valid user token for that gateway.

**Fix:** sign in again with a valid token. If you opened a `?gateway=` link to
a gateway on another origin, the token is kept only for that tab; open the app
from its own address (`http://127.0.0.1:3007`) to use the persistent cookie
session. See [Sign-in in Architecture](architecture.md#components-and-connections).

## The gateway console has no "Create your first entity" button

**Cause:** the button comes with AbstractGateway 0.4.1 or newer.

**Fix:** upgrade the gateway, or open the app yourself at
`http://127.0.0.1:3007/#new`, which opens the same creation form.

## Creating an entity opens an existing one

**Cause:** the name is already taken. A name belongs to one entity for life
(see the [FAQ](faq.md#can-i-rename-an-entity-or-reuse-a-name)).

**Fix:** choose a different name.

## Creating an entity with my own starting document is refused

**Cause:** with **Check the document against the framework rules** on (the
default), the gateway requires the `shared_vulnerability` core value in the
starting document.

**Fix:** add that value to your document, or turn the check off in
**Advanced: starting document** if you deliberately want to skip it.

## A panel shows a gap instead of data

**Cause:** the gateway does not serve that route (for example the on-disk
footprint in **Health**). The app labels the gap rather than estimating.

**Fix:** upgrade the gateway to a version that serves the route; see
[Gateway routes the app uses](api.md#gateway-routes-the-app-uses).

## The Wave tab refuses to score

**Cause:** the cognition wave scores only with the entity's own embedding model;
if the gateway's embeddings do not match the scorer's basis, or the gateway has
no embedding endpoint, the wave stops with an explanation rather than showing
invented scores.

**Fix:** make sure the gateway serves `/api/gateway/embeddings` with the model
the entity was created with. The rest of the app is unaffected.

## The port is already in use

**Fix:** start on another port with `PORT=3017 abstractentity`.

## Other devices on my network cannot open the app

**Cause:** the server binds to `127.0.0.1` by default.

**Fix:** start it with `HOST=0.0.0.0` and only on a network you trust; see
[SECURITY.md](../SECURITY.md).

## `npm run build` fails in a checkout with unresolved `@abstractframework/ui-kit`

**Cause:** the build resolves the shared UI packages from a sibling AbstractUIC
checkout.

**Fix:** clone [AbstractUIC](https://github.com/lpalbou/AbstractUIC) next to this
repository as `../abstractuic`, then run `npm install` and `npm run build` again.
See [CONTRIBUTING.md](../CONTRIBUTING.md).
