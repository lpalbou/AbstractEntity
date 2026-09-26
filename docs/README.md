# AbstractEntity documentation

Start with the [project README](../README.md) for what an entity is and how to
create your first one. The pages below go deeper.

## Core guides

- [Getting started](getting-started.md): install, sign in, create your first
  entity and talk with it.
- [Architecture](architecture.md): the app, its server and the gateway routes it
  uses, with diagrams; the replay-stream fold and the invariants the tests pin.
- [API and configuration](api.md): the `abstractentity` command, environment
  variables, app URLs (`#new`, `?entity=`, `?page=blueprint`), server routes and
  the gateway routes the app calls.
- [FAQ](faq.md): common questions about entities, names, privacy of the diary,
  gateway versions and the About dialog.
- [Troubleshooting](troubleshooting.md): symptoms and fixes for gateway, sign-in,
  creation, About, port and build problems.

## Topic pages

- [Overview](Overview.md): the app's goals, the problem it solves and its core
  components, in prose.
- [Data flow](DataFlow.md): transport and sign-in, the replay-stream fold, what
  each surface reads, and the cognition-wave pipeline.
- [The entity phase graph](entity-phases.md): the lifecycle phases (visit, work,
  personal, sleep), the liveness axis and their rules, as a companion to
  [`spec/entity_phases.json`](../spec/entity_phases.json).

## Project

- [Changelog](../CHANGELOG.md)
- [Contributing](../CONTRIBUTING.md)
- [Security](../SECURITY.md)
- [Acknowledgements](../ACKNOWLEDGEMENTS.md)
- [Code of conduct](../CODE_OF_CONDUCT.md)
