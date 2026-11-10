/**
 * The summary under his reply (operator 2026-11-10 20:36: "clicking on the tag after the AI answer
 * crashes"). The click path: the drawer's message for a visit turn (visitReplyMessage, the visit
 * lane's response as served: fixtures/visit_turn_reply.ts) → the summary under his words → the
 * turn panel (TurnDetailModal) on that turn's facts. The visit lane serves `diary_entries` as
 * entries `{entry_id, kind, visibility, projected_record_id, title}`; the panel rendered each as a
 * React child (React error #31). Rendered with react-dom/server (no DOM in the tests).
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { visitReplyMessage } from "./chat_drawer";
import { ChatMessageList, type DrawerMessage } from "./chat_message_list";
import { DIARY_ENTRY, DIARY_RECORD, DIARY_TITLE, FORMED_RECORD, VISIT_TURN_WITH_DIARY } from "./fixtures/visit_turn_reply";
import { openTurnFact, TurnFactsRow, turnDiaryEntries, turnFactChips, type TurnFactChip, type TurnPanelTab } from "./reply_notices_summary";
import { TurnDetailModal, type ProbeTab } from "./turn_detail_modal";
import type { ChatTurnResult } from "./stream_source";

const SOURCE = { baseUrl: "http://gw.test", entity: "castor" };
const message = (): DrawerMessage => ({ ...visitReplyMessage(VISIT_TURN_WITH_DIARY, "Castor", 1200), id: "m1" });
const probe = (turn: ChatTurnResult, tab?: ProbeTab) =>
  renderToStaticMarkup(<TurnDetailModal turn={turn} initialTab={tab} entityName="Castor" source={SOURCE} onClose={() => undefined} />);

describe("the diary entries a visit turn serves", () => {
  it("reads the visit lane's entries (objects) and the hosted lane's (entry ids)", () => {
    expect(turnDiaryEntries(VISIT_TURN_WITH_DIARY.diary_entries)).toEqual([
      { entryId: DIARY_ENTRY, kind: "note", private: false, recordId: DIARY_RECORD, title: DIARY_TITLE },
    ]);
    expect(turnDiaryEntries([DIARY_ENTRY])).toEqual([{ entryId: DIARY_ENTRY, kind: "", private: false, recordId: null, title: "" }]);
    expect(turnDiaryEntries([{ entry_id: "diary_p", kind: "note", visibility: "private", projected_record_id: "ex:diary-p" }])).toEqual([
      { entryId: "diary_p", kind: "note", private: true, recordId: "ex:diary-p", title: "" },
    ]);
    expect(turnDiaryEntries(undefined)).toEqual([]);
  });
});

describe("clicking the summary under his reply opens the turn panel", () => {
  it("the drawer's message carries the turn's facts as served (the entries are objects)", () => {
    const m = message();
    expect(m.detail?.diary_entries).toEqual(VISIT_TURN_WITH_DIARY.diary_entries);
    expect(renderToStaticMarkup(<ChatMessageList messages={[m]} onDetail={() => undefined} />)).toContain(DIARY_TITLE);
  });

  it("the panel renders that turn: no React error, the entry by its title, never an id", () => {
    const out = probe(message().detail!);
    expect(out).toContain("Formed this turn");
    expect(out).toContain(DIARY_TITLE);
    expect(out).not.toContain(DIARY_ENTRY);
    expect(out).not.toContain(DIARY_RECORD);
    expect(out).toMatch(/Formed this turn <span class="tdm_count">2<\/span>/); // the episode and the entry
  });

  it("a private entry reads as private, a title still being written says so", () => {
    const turn = {
      ...message().detail!,
      diary_entries: [
        { entry_id: "diary_p", kind: "note", visibility: "private", projected_record_id: "ex:diary-p" },
        { entry_id: "diary_w", kind: "question", visibility: "self", projected_record_id: "ex:diary-w", title: null },
      ],
    } as unknown as ChatTurnResult;
    const out = probe(turn);
    expect(out).toContain("a private entry");
    expect(out).toContain("its title is still being written");
    expect(out).not.toContain("diary_p");
  });
});

/** The row's buttons, as the row renders them (it has no hooks: called, it is its element tree). */
function rowButtons(chips: TurnFactChip[], onOpen: (c: TurnFactChip) => void, authorKind?: string): React.ReactElement<{ onClick(): void; "data-fact": string }>[] {
  const row = TurnFactsRow({ chips, onOpen, authorKind }) as React.ReactElement<{ children: React.ReactNode }>;
  return React.Children.toArray(row.props.children).filter((c): c is React.ReactElement<{ onClick(): void; "data-fact": string }> => React.isValidElement(c) && c.type === "button");
}

describe("the summary in his message's footer (operator design 2026-11-10)", () => {
  const chips = turnFactChips(message().detail!);

  it("one chip per fact: memories recalled, formed, diary, tools (zero included)", () => {
    expect(chips.map((c) => c.label)).toEqual(["44 memories", "1 formed", "1 diary", "0 tools"]);
    expect(chips[0].title).toBe("The 44 memories he recalled this turn");
    expect(chips.map((c) => [c.key, c.record, c.tab])).toEqual([
      ["memories", null, "context"],
      ["formed", FORMED_RECORD, "context"],
      ["diary", DIARY_RECORD, "context"],
      ["tools", null, "tools"],
    ]);
    // An absent tool gauge is not a zero.
    expect(turnFactChips({ reply: "x" } as ChatTurnResult).map((c) => c.label)).toEqual(["tools unverified"]);
    expect(turnFactChips({ memories_in_context: 1, tools_ran: ["web_search"], files: [{}, {}], notices: ["n"] }).map((c) => c.label)).toEqual([
      "1 memory", "1 tool", "2 files", "1 notice",
    ]);
  });

  it("sits inside his card's footer, after the badge of what the reply formed, left in the kit's chips; no 'system', no old pill", () => {
    const out = renderToStaticMarkup(<ChatMessageList messages={[message()]} onDetail={() => undefined} />);
    const card = out.slice(out.indexOf('class="pc-chat-item'));
    const badge = card.indexOf('class="pc-chat-notices"');
    const footer = card.indexOf('class="pc-chat-footer"');
    expect(badge).toBeGreaterThan(0);
    expect(footer).toBeGreaterThan(badge);
    const row = card.slice(footer);
    expect(row).toMatch(/^class="pc-chat-footer"><div class="pc-chat-notices__row cd_turnfacts" role="group" aria-label="What this turn did">/);
    for (const c of chips) expect(row).toContain(`<span class="pc-chat-notice__label">${c.label}</span>`);
    expect(out).not.toContain("cd_sysbadge");
    expect(out).not.toMatch(/>system</);
    // Another author's reply (an agent) keeps the word.
    const agent = renderToStaticMarkup(<>{TurnFactsRow({ chips, onOpen: () => undefined, authorKind: "agent" })}</>);
    expect(agent).toContain('<span class="pc-chat-notice__kind cd_turnfacts_lead">system</span>');
  });

  it("each chip opens what it names: memories and tools the panel on their tab, formed and diary their record", () => {
    const opened: string[] = [];
    const host = (holds: boolean) => ({
      onDetail: (_d: ChatTurnResult, tab: TurnPanelTab) => void opened.push(`panel:${tab}`),
      onOpenRecord: (id: string) => (opened.push(`record:${id}`), holds),
    });
    for (const b of rowButtons(chips, (c) => openTurnFact(c, message().detail!, host(true)))) b.props.onClick();
    expect(opened).toEqual(["panel:context", `record:${FORMED_RECORD}`, `record:${DIARY_RECORD}`, "panel:tools"]);
    // Detail does not hold the record yet: the panel opens where it is listed.
    opened.length = 0;
    for (const b of rowButtons(chips, (c) => openTurnFact(c, message().detail!, host(false)))) b.props.onClick();
    expect(opened).toEqual(["panel:context", `record:${FORMED_RECORD}`, "panel:context", `record:${DIARY_RECORD}`, "panel:context", "panel:tools"]);
  });

  it("the panel opens on the chip's tab and renders the turn", () => {
    expect(probe(message().detail!, "tools")).toContain("No lookups");
    expect(probe(message().detail!, "tools")).not.toContain("Formed this turn");
    expect(probe(message().detail!, "context")).toContain(DIARY_TITLE);
  });
});
