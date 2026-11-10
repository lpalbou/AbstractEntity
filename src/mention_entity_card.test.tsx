/**
 * Mentions in the thread (panel-chat 0.9.13, operator 2026-11-10): a sent message shows the chips its
 * send carried, in its bubble, placed by `start` (never read out of the text), with the composer's
 * look; resting on a chip shows the mentioned entity's card (the kit's EntityCard, compact) from the
 * roster the `@` list read. A message without mentions (a reload: the stored turns carry none) shows
 * no chip. Rendered with react-dom/server (no DOM in the tests).
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EntityTile } from "@abstractframework/ui-kit";

import { ChatMessageList, type DrawerMessage } from "./chat_message_list";
import { mentionedRosterRow, mentionEntityCard, readMentionTile } from "./mention_entity_card";
import { sentMessageMentions, type MentionableEntity } from "./visit_mentions";

const LOOK = { style: "watch-halo", color: "#336699" };
const ROWS: MentionableEntity[] = [{ name: "Castor", slug: "castor", avatar: LOOK }, { name: "Pollux", slug: "pollux", avatar: null }];
const castorChip = { id: "castor", name: "Castor", kind: "entity" as const, avatar: LOOK, start: 3 };

describe("a sent message carries the chips its send did", () => {
  it("each chip, its start on the sent (trimmed) words, the composer's look; the agent's chip too", () => {
    const typed = "  hi @Castor and @Pollux, @Basic agent?";
    const picked = [
      { id: "castor", name: "Castor", kind: "entity" as const, index: 0, start: 5 },
      { id: "pollux", name: "Pollux", kind: "entity" as const, index: 1, start: 17 },
      { id: "agent", name: "Basic agent", kind: "agent" as const, index: 2, start: 26 },
    ];
    const shown = sentMessageMentions(typed, picked, [{ ...castorChip, start: 5 }, { id: "pollux", name: "Pollux", kind: "entity", avatar: null }]);
    const sent = typed.trim();
    for (const m of shown) expect(sent.slice(m.start!, m.start! + m.name.length + 1)).toBe(`@${m.name}`);
    expect(shown.map((m) => [m.id, m.index, m.avatar ?? null])).toEqual([["castor", 0, LOOK], ["pollux", 1, null], ["agent", 2, null]]);
    expect(sentMessageMentions("hi", [], [])).toEqual([]);
  });

  it("the drawer sets them on both lanes' sent message; a reloaded visit's turns get none (no reconstruction)", () => {
    const src = fs.readFileSync(path.join(__dirname, "chat_drawer.tsx"), "utf8");
    expect(src).toContain("const shownMentions = sentMessageMentions(draft, picked, mentionChipsRef.current);");
    expect(src).toContain('push({ role: "user", content: flowText, ...mentionsField });');
    expect(src).toContain('push({ role: "user", content: text, ...(chips.length ? { attachments: chips } : {}), ...mentionsField });');
    const rehydrate = src.slice(src.indexOf("const rehydrate = useCallback("), src.indexOf("setMessages(rebuilt);"));
    expect(rehydrate).not.toContain("mentions");
  });
});

describe("the bubble", () => {
  const user = (over: Partial<DrawerMessage>): DrawerMessage => ({ id: "m1", role: "user", content: "hi @Castor, the tide?", ...over });

  it("draws the chip where the send placed it, with the card prop", () => {
    const out = renderToStaticMarkup(
      <ChatMessageList messages={[user({ mentions: [{ ...castorChip, index: 0 }] })]} onDetail={() => undefined} renderMentionCard={() => null} />,
    );
    expect(out).toContain('class="pc-mention-chip pc-mention-chip--inline pc-mention-chip--message"');
    expect(out).toContain('data-mention-kind="entity"');
  });

  it("no chip without mentions (a reload, a plain message): the words as typed", () => {
    const out = renderToStaticMarkup(<ChatMessageList messages={[user({})]} onDetail={() => undefined} />);
    expect(out).not.toContain("pc-mention-chip");
    expect(out).toContain("@Castor");
  });

  it("the drawer gives the card to the chat list and the avatar view", () => {
    const src = fs.readFileSync(path.join(__dirname, "chat_drawer.tsx"), "utf8");
    expect(src).toContain("renderMentionCard={renderMentionCard}");
    expect(src).toMatch(/messageProps=\{\{\s*onNoticeOpen: openNotice,\s*renderMentionCard,/);
  });
});

describe("the card on a chip", () => {
  it("the mentioned entity's EntityCard, compact, from the roster; none for the agent or a stranger", async () => {
    const tile = { name: "Castor" } as unknown as EntityTile;
    await readMentionTile("http://gw.test", "castor", async () => tile).read;
    const out = renderToStaticMarkup(<>{mentionEntityCard({ ...castorChip, index: 0 }, ROWS, "http://gw.test")}</>);
    expect(out).toContain('data-density="compact"');
    expect(out).toContain("cd_mention_card");
    expect(out).toContain("Castor");
    expect(mentionEntityCard({ id: "agent", name: "Basic agent", kind: "agent", index: 0, start: 0 }, ROWS, "http://gw.test")).toBeNull();
    expect(mentionEntityCard({ id: "vega", name: "Vega", kind: "entity", index: 0, start: 0 }, ROWS, "http://gw.test")).toBeNull();
    expect(mentionedRosterRow({ id: "pollux", kind: "entity" }, ROWS)?.name).toBe("Pollux");
  });

  it("one tile read per entity, shared, kept five minutes; a failed read says why", async () => {
    let reads = 0;
    const fetchTile = async () => { reads += 1; throw new Error("The card could not be read (HTTP 503)."); };
    const a = readMentionTile("http://gw.other", "pollux", fetchTile);
    const b = readMentionTile("http://gw.other", "pollux", fetchTile);
    await a.read;
    expect(a).toBe(b);
    expect(reads).toBe(1);
    expect(a.error).toBe("The card could not be read (HTTP 503).");
  });
});
