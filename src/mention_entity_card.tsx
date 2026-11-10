/**
 * The card on a mention chip in a message (panel-chat 0.9.13 `renderMentionCard`, operator
 * 2026-11-10): resting on "@Castor" in a bubble shows Castor's card, the kit's `EntityCard`
 * (compact), the same card the entities index draws. The entity is looked up in the roster the
 * drawer read for its `@` list (`GET /entities` rows): a name that is not in it, or the session
 * agent's chip, has no card (null). The card's tile (`GET /entities/{name}/tile`, about 2 KB) is
 * read when the card first shows and kept for five minutes, like the index's card reads.
 */
import React, { useEffect, useState } from "react";

import { EntityCard, type EntityTile } from "@abstractframework/ui-kit";
import type { ChatMessageMention } from "@abstractframework/panel-chat";

import { fetchRosterTile } from "./entities_index";
import type { MentionableEntity } from "./visit_mentions";

const KEEP_MS = 5 * 60 * 1000;
type TileRead = { at: number; tile: EntityTile | null; error: string | null; read: Promise<void> };
const tileReads = new Map<string, TileRead>();

/** One tile read per entity and gateway, shared by every chip naming it; again after five minutes. */
export function readMentionTile(baseUrl: string, slug: string, fetchTile: (baseUrl: string, slug: string) => Promise<EntityTile> = fetchRosterTile): TileRead {
  const key = `${baseUrl}|${slug}`;
  const held = tileReads.get(key);
  if (held && Date.now() - held.at < KEEP_MS) return held;
  const entry: TileRead = { at: Date.now(), tile: held?.tile ?? null, error: null, read: Promise.resolve() };
  entry.read = fetchTile(baseUrl, slug).then(
    (tile) => { entry.tile = tile; entry.error = null; },
    (e: Error) => { entry.error = e.message || "The card could not be read."; },
  );
  tileReads.set(key, entry);
  return entry;
}

/** The roster row a message's mention names (by slug, the mention's id), or null: the agent's chip,
 * or a name the roster does not hold. */
export function mentionedRosterRow(mention: Pick<ChatMessageMention, "id" | "kind">, rows: readonly MentionableEntity[]): MentionableEntity | null {
  if (mention.kind !== "entity") return null;
  return rows.find((r) => r.slug === mention.id) ?? null;
}

/** The kit's EntityCard, compact, for one roster entity; its tile read on first show. */
export function MentionEntityCard({ baseUrl, row }: { baseUrl: string; row: MentionableEntity }): React.ReactElement {
  const [read, setRead] = useState(() => readMentionTile(baseUrl, row.slug));
  const [, setDone] = useState(0);
  useEffect(() => {
    const current = readMentionTile(baseUrl, row.slug);
    setRead(current);
    let live = true;
    void current.read.then(() => { if (live) setDone((n) => n + 1); });
    return () => { live = false; };
  }, [baseUrl, row.slug]);
  const status = read.tile ? (read.error ? "stale" : "ready") : read.error ? "unavailable" : "loading";
  return (
    <EntityCard
      className="cd_mention_card"
      density="compact"
      tile={read.tile}
      status={status}
      name={row.name}
      look={row.avatar ?? null}
      reason={read.error ?? undefined}
      nowMs={Date.now()}
    />
  );
}

/** `renderMentionCard` for the drawer's threads: the entity's card from the roster read, else null. */
export function mentionEntityCard(mention: ChatMessageMention, rows: readonly MentionableEntity[], baseUrl: string): React.ReactNode | null {
  const row = mentionedRosterRow(mention, rows);
  return row ? <MentionEntityCard baseUrl={baseUrl} row={row} /> : null;
}
