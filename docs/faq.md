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

## Can I use the app without a gateway?

Yes, to explore: without a reachable gateway the app opens a bundled demo life,
and `/?src=URL` loads any exported replay stream. Creating and talking with
entities needs a gateway.

For fixes to specific problems, see [Troubleshooting](troubleshooting.md).
