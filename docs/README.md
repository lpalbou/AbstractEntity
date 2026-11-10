# AbstractEntity documentation

Start with the [project README](../README.md) for what an entity is and how to
create your first one. The pages below go deeper.

## Core guides

- [Getting started](getting-started.md): install, sign in, create your first
  entity and talk with it.
- [Architecture](architecture.md): the app, its server and the gateway routes it
  uses, with diagrams; the replay-stream fold and the invariants the tests pin.
- [API and configuration](api.md): the `abstractentity` command, environment
  variables, app URLs (`#new`, `?entity=`, `?src=`), server routes and
  the gateway routes the app calls, including the life cycle (phase bar and
  sleep thresholds), his topics, reply badges, `@` mentions and the optional
  Avatar conversation.
- [FAQ](faq.md): common questions about entities, names, what an entity does
  when nobody talks to it, what the Cognitive Monitor measures, privacy of the
  diary, gateway versions, the About dialog and using the app on a phone or
  tablet.
- [Troubleshooting](troubleshooting.md): symptoms and fixes for gateway, sign-in,
  creation, the phase bar, mentions, topics, the Cognitive Monitor (refusing to
  score, or without embeddings), About, port, copy over plain http and build
  problems.

## Topic pages

- [Overview](Overview.md): the app's goals, the problem it solves and its core
  components, in prose.
- [Data flow](DataFlow.md): transport and sign-in, the replay-stream fold, what
  each surface reads, and the pipeline behind the Cognitive Monitor.
- [The entity life cycle](entity-phases.md): the five states (idle, own time,
  work, visit, sleep), who moves an entity between them, sleep thresholds,
  Stop and Resume, how to read the phase bar (also on a phone) and the known
  limits; a companion to [`spec/entity_phases.json`](../spec/entity_phases.json).

## Project

- [Changelog](../CHANGELOG.md)
- [Contributing](../CONTRIBUTING.md)
- [Security](../SECURITY.md)
- [Acknowledgements](../ACKNOWLEDGEMENTS.md)
- [Code of conduct](../CODE_OF_CONDUCT.md)
