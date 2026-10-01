# Troubleshooting

Each entry lists the symptom, how to confirm the cause, and the fix. Setup
steps are in [Getting started](getting-started.md); settings are in
[API and configuration](api.md#configuration).

## The app shows a demo life instead of my entities

**Cause:** the app could not reach a gateway, so it opened the bundled demo.

**Check:** the command prints `Gateway: <url>` on start. Confirm that gateway is
running and reachable from the machine that runs `abstractentity`.

**Fix:** start the gateway, or point the app at it with
`abstractentity --gateway-url http://HOST:PORT`, then reload the page.

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

**Cause:** with the **Framework check** switch on (the default), the gateway requires the `shared_vulnerability` core value in the
starting document.

**Fix:** add that value to your document, or switch **Framework check** off in
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

## About shows "Gateway: unavailable (…)"

**Cause:** the app could not read `GET /api/gateway/about`. The reason in
brackets tells you why: `HTTP 404` means the gateway does not serve the About
route, and `not a gateway response` means no gateway answered behind the app's
address.

**Fix:** check that the gateway is running (see the first entry above), or
upgrade it to a version that serves `GET /about`. The rest of the app is unaffected; see
[the FAQ](faq.md#how-do-i-see-which-versions-i-am-running).

## The port is already in use

**Fix:** start on another port with `abstractentity --port 3017`.

## Other devices on my network cannot open the app

**Cause:** the server binds to `127.0.0.1` by default.

**Fix:** open it through your gateway (`/apps/entity/`, one port for the
console and every app), or start it with `--host 0.0.0.0` and only on a network
you trust; see [SECURITY.md](../SECURITY.md).

## Copy says "Copy failed — select and copy"

**Cause:** the app is open over plain `http://` from another machine (a LAN or
Tailscale address such as `http://100.x.y.z:8080/apps/entity/`). Browsers
offer the clipboard, the microphone and the camera only on https pages or on
`localhost`, so **Copy** falls back to a text-selection copy that the browser
may refuse. Everything else in the app works over plain http.

**Fix:** open the app over https or on the gateway's own computer. With
Tailscale, run `tailscale serve --bg http://127.0.0.1:<port>` on the gateway
machine and open `https://<host>.<tailnet>.ts.net/apps/entity/`; the gateway
console's Network page explains the steps.

## `npm run build` fails in a checkout with unresolved `@abstractframework/ui-kit`

**Cause:** the dependencies are not installed yet.

**Fix:** run `npm install`, then `npm run build` again. See
[CONTRIBUTING.md](../CONTRIBUTING.md).
