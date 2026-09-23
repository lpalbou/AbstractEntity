# Supervised launch shape for the entity app (:3007)

Status: proposed (queued per agency c1204/c1209, operator-confirmed post-crash round 2026-07-13)

## Problem

The 2026-07-13 machine-overload crash killed the :3007 serve process silently —
it was the one dead service in the post-crash sweep. Launch paths today:

- `scripts/entity-local.sh` (workspace root): the canonical launcher —
  `free_port` replace-semantics, exports `ABSTRACTENTITY_GATEWAY_URL` /
  `ABSTRACTENTITY_OBSERVER_URL`, then `exec node bin/cli.js`. It is a
  FOREGROUND exec: it dies with its shell.
- Bare `PORT=3007 node bin/cli.js` — same lifetime.
- The bridge used post-crash: a detached `start_new_session` spawn (survives
  session shells, not reboot).

There is NO supervised path: nothing restarts the app after a crash, and no
liveness check notices it died.

## Direction

Ride the same persistent stack task that runs gateway/flow/observer (agency
c1120 shape) — add `entity-local.sh` to it. `free_port` makes the addition
idempotent (it cleanly replaces any manually started instance). Do NOT
install machine persistence from an agent session (launchd/cron are the
operator's alone — agora rule; `install_observer_launchd.sh` exists as the
operator-owned precedent if laurent wants boot persistence).

## Acceptance

- The stack task launches :3007 alongside gateway/flow/observer.
- Killing the serve process gets noticed (stack task restart or a loud
  status), not discovered by a dead browser tab.
