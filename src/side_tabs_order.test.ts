/**
 * The side panel's tabs, in the operator's order (2026-11-10, backlog 0029): "chat (to talk to it),
 * card (who the entity is), health (how it is), book (its history), world (the models of the world it
 * created), lessons (what it learned), details (when we select a memory) and ledger".
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("the side panel's tabs", () => {
  it("chat, card, health, book, world, lessons, detail, ledger", () => {
    const view = fs.readFileSync(path.join(__dirname, "entity_view.tsx"), "utf8");
    const tabs = view.slice(view.indexOf("<SideTabs"), view.indexOf("</div>", view.indexOf('id: "ledger"')));
    const ids = [...tabs.matchAll(/^\s+id: "([a-z]+)",$/gm)].map((m) => m[1]);
    expect(ids).toEqual(["chat", "card", "health", "book", "world", "lessons", "detail", "ledger"]);
  });
});
