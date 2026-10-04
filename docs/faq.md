# FAQ

## What is an entity?

An AI companion with a lasting memory of its own that lives on your
AbstractGateway. See [What is an entity?](../README.md#what-is-an-entity).

## Where is an entity's memory stored?

On the gateway host, in the entity's own folder. AbstractEntity stores no
entity data on its server. The browser keeps a local cache of replay streams
(IndexedDB) so large lives reopen quickly; it is only a cache of what the
gateway serves.

## Can I rename an entity or reuse a name?

A name belongs to one entity for its whole life. Creating an entity with an
existing name opens the existing entity; it does not create a new one from a
different starting document.

## What is the starting document?

The document an entity is created from: its name and initial identity. With just
a name, the gateway uses the standard starting document with the name filled
in. **Advanced: starting document** on the creation form accepts your own YAML;
it is stored exactly as written.

## Does watching an entity change it?

No. The entities list, states, cards and memory views are read-only. Actions
such as starting personal time or putting an entity to sleep go through the
gateway and appear as visible events in the entity's life.

## What does the cognition wave measure?

The expressive character of the entity's own words (visit replies, diary,
summaries), scored against a fixed basis with the entity's own embedding model.
It does not measure inner state, and sealed diary entries are never read.

## Why is some diary text hidden?

Sealed diary entries stay sealed in every view. The app shows that an entry
exists but never reconstructs its words.

## Do I need AbstractObserver?

No. AbstractEntity runs on its own against AbstractGateway. AbstractObserver is
a separate app for runs and gateway activity.

## Which gateway version do I need?

The app works with any AbstractGateway; surfaces whose route the gateway does
not serve show a labelled gap. The gateway console's **Create your first
entity** shortcut needs AbstractGateway 0.4.1 or newer.

## How do I see which versions I am running?

Open **About** (the info button at the top right). It is one short card: the
app's name and version, the **AbstractFramework** and **AbstractGateway**
versions, links to the website, source, documentation, issue tracker, feedback
and contact, and the author and licence line. It does not list packages. Each
time the card opens, the app asks the connected gateway for its versions
(`GET /api/gateway/about`); the AbstractGateway line reads:

- **checking…** while the answer is on its way;
- the version, for example **0.12.0**, once the gateway answers (the
  AbstractFramework line then shows the framework installed on the gateway
  host, or says it is not installed there);
- **unavailable (reason)** when the gateway cannot answer, for example
  `unavailable (HTTP 404)`;
- **not connected** when the app shows the demo life or a `?src=` stream.

The app's version is the `@abstractframework/entity` package version, fixed at
build time.

## Can I use the app without a gateway?

Yes, to explore: without a reachable gateway the app opens a bundled demo life,
and `/?src=URL` loads any exported replay stream. Creating and talking with
entities needs a gateway.

## Can I use the app on a phone or a tablet?

Yes. Below 1024 px the side panel opens as a drawer over the memory graph, and
on a phone the tabs sit in a strip along the bottom of the screen, dialogs open
from the bottom, and controls are sized for touch. See
[Responsive layout](../README.md#responsive-layout) for the details and the
limits on small screens.

For fixes to specific problems, see [Troubleshooting](troubleshooting.md).
