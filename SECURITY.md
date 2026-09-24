# Security

## What the app can do

A signed-in user of AbstractEntity can create entities, talk with them, change
their model, system prompt, tool grants and workspace mounts, and start or stop
their personal time and sleep, all through the gateway. Give gateway tokens only
to people who should hold those rights.

## Session model

The `abstractentity` server uses the shared app-origin sign-in proxy
(`@abstractframework/app-server`):

- Signing in exchanges a gateway user token for a gateway session held in
  first-party HttpOnly cookies (`abstractentity_gateway_*`). The browser never
  stores the token.
- Mutating requests through the proxy require the CSRF header matching the CSRF
  cookie.
- A `?gateway=` link to a gateway on another origin uses a direct posture: the
  verified token is kept in memory for that tab only and is never written to
  browser storage or put in URLs.
- Tokens in URLs (`?token=`) are ignored and removed from URLs the app writes.

## Deployment defaults

- The server binds to loopback (`127.0.0.1`). Binding wider with `HOST` is an
  explicit choice; do it only on a network you trust, or behind your own
  authenticating reverse proxy.
- `GET /app/host` reports the machine's LAN IPv4 address (for entity handles)
  and nothing else.
- The Vite dev server (`npm run dev`) listens on all interfaces and is not a
  production surface.

This repository contains no credentials.

## Reporting a vulnerability

Report vulnerabilities privately to `contact@abstractframework.ai`, or through
GitHub's private vulnerability reporting on
[lpalbou/AbstractEntity](https://github.com/lpalbou/AbstractEntity), rather than
opening a public issue. Include a description, reproduction steps and the
affected version.
