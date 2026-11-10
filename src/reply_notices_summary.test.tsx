/**
 * The summary under his reply (operator 2026-11-10 20:36: "clicking on the tag after the AI answer
 * crashes"). The click path: the drawer's message for a visit turn (visitReplyMessage, the visit
 * lane's response as served: fixtures/visit_turn_reply.ts) → the summary under his words → the
 * turn panel (TurnDetailModal) on that turn's facts. The visit lane serves `diary_entries` as
 * entries `{entry_id, kind, visibility, projected_record_id, title}`; the panel rendered each as a
 * React child (React error #31). Rendered with react-dom/server (no DOM in the tests).
 */
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { visitReplyMessage } from "./chat_drawer";
import { ChatMessageList, type DrawerMessage } from "./chat_message_list";
import { DIARY_ENTRY, DIARY_RECORD, DIARY_TITLE, FORMED_RECORD, VISIT_TURN_WITH_DIARY } from "./fixtures/visit_turn_reply";
import { diaryEntryWords, openTurnFact, TurnFactsRow, turnDiaryEntries, turnFactChips, turnFormedIds, type TurnFactChip, type TurnPanelTab } from "./reply_notices_summary";
import { TurnDetailModal, type ProbeTab } from "./turn_detail_modal";
import type { ChatTurnResult } from "./stream_source";

const SOURCE = { baseUrl: "http://gw.test", entity: "castor" };
const message = (): DrawerMessage => ({ ...visitReplyMessage(VISIT_TURN_WITH_DIARY, "Castor", 1200), id: "m1" });
const probe = (turn: ChatTurnResult, tab?: ProbeTab) =>
  renderToStaticMarkup(<TurnDetailModal turn={turn} initialTab={tab} entityName="Castor" source={SOURCE} onClose={() => undefined} />);

describe("the diary entries a visit turn serves", () => {
  it("reads the visit lane's entries (objects) and the hosted lane's (entry ids)", () => {
    expect(turnDiaryEntries(VISIT_TURN_WITH_DIARY.diary_entries)).toEqual([
      { entryId: DIARY_ENTRY, kind: "note", private: false, recordId: DIARY_RECORD, title: DIARY_TITLE, unreadable: false },
    ]);
    expect(turnDiaryEntries([DIARY_ENTRY])).toEqual([{ entryId: DIARY_ENTRY, kind: "", private: false, recordId: null, title: "", unreadable: false }]);
    expect(turnDiaryEntries([{ entry_id: "diary_p", kind: "note", visibility: "private", projected_record_id: "ex:diary-p" }])).toEqual([
      { entryId: "diary_p", kind: "note", private: true, recordId: "ex:diary-p", title: "", unreadable: false },
    ]);
    expect(turnDiaryEntries(undefined)).toEqual([]);
  });
});

describe("a served shape neither lane sends is said loudly, never read as healthy (review N1, N2)", () => {
  const errors = () => vi.spyOn(console, "error").mockImplementation(() => undefined);
  afterEach(() => vi.restoreAllMocks());
  const seams = (spy: ReturnType<typeof errors>) => spy.mock.calls.filter((c) => String(c[0]).startsWith("#SEAM"));

  it("a count instead of a list: no chip, nothing listed, a #SEAM error (never '1 diary' / '1 formed')", () => {
    const spy = errors();
    const turn = { ...message().detail!, diary_entries: 2, records_formed: 3 } as unknown as ChatTurnResult;
    expect(turnFactChips(turn).map((c) => c.key)).toEqual(["memories", "tools"]);
    expect(seams(spy).map((c) => String(c[0]))).toEqual([
      expect.stringContaining("`records_formed`: not a list"),
      expect.stringContaining("`diary_entries`: not a list"),
    ]);
    const out = probe(turn);
    expect(out).toMatch(/Formed this turn <span class="tdm_count">0<\/span>/);
  });

  it("items that are neither a key nor an entry: listed as unreadable, reported once per list", () => {
    const spy = errors();
    const served = [{}, null, 7];
    const entries = turnDiaryEntries(served);
    expect(entries.map((e) => [e.unreadable, diaryEntryWords(e)])).toEqual([
      [true, "an entry this page cannot read"],
      [true, "an entry this page cannot read"],
      [true, "an entry this page cannot read"],
    ]);
    turnDiaryEntries(served); // the thread re-reads it on every render
    expect(seams(spy)).toHaveLength(1);
    expect(diaryEntryWords(turnDiaryEntries(["diary_k"])[0])).toBe("a diary entry"); // a healthy hosted key
    expect(turnFormedIds(["ex:episode-1", 5])).toEqual(["ex:episode-1", null]);
    const out = probe({ ...message().detail!, records_formed: ["ex:episode-1", 5], diary_entries: served } as unknown as ChatTurnResult);
    expect(out).toContain("a record this page cannot read");
    expect(out.match(/an entry this page cannot read/g)).toHaveLength(3);
    expect(seams(spy).length).toBeGreaterThanOrEqual(2);
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

  it("no pronoun in any chip's words or tooltip (none is served for an entity)", () => {
    const wide = turnFactChips({ memories_in_context: 3, records_formed: ["a", "b"], diary_entries: ["d1", "d2"], tools_ran: ["web_search"], tool_details: [], files: [{}], notices: ["n"] });
    const none = turnFactChips({ memories_in_context: 1, records_formed: ["a"], diary_entries: ["d1"], tools_ran: [], tool_details: [] });
    for (const c of [...chips, ...wide, ...none, ...turnFactChips({})]) {
      expect(`${c.label} ${c.title}`, c.key).not.toMatch(/\b(he|his|him|she|her|hers)\b/i);
    }
    expect(chips[0].title).toBe("The 44 memories recalled this turn");
    expect(chips[3].title).toBe("No tool was used this turn");
  });

  it("one line in the side panel's default width: the row's gap and padding against the measured chips (review N4)", () => {
    // Measured in Chrome on the fixture page (review-final fixture_results.json default_1440_row,
    // 2026-11-10): each chip's width at 7 px side padding, less that padding, at the kit chip's 12 px
    // type; the row is the bubble's content width in the 380 px side panel (thread 319 px).
    const TEXT_AND_BORDER_PX = { "44 memories": 76, "1 formed": 52, "1 diary": 39, "0 tools": 41 };
    const ROW_PX = 285;
    const DIGIT_PX = 7; // "12 tools", "69 memories": one more digit than the fixture's widest
    const css = fs.readFileSync(path.join(__dirname, "chat_notices.css"), "utf8");
    const gap = Number(css.match(/\.cd_turnfacts \{[^}]*gap: (\d+)px;/)?.[1]);
    const chipRule = css.match(/\.cd_turnfacts \.cd_turnfact \{([^}]*)\}/)?.[1] ?? "";
    const padX = Number(chipRule.match(/padding: \d+px (\d+)px;/)?.[1]);
    expect(Number.isFinite(gap) && Number.isFinite(padX)).toBe(true);
    expect(chipRule).not.toContain("font-size"); // the kit chip's size, the one measured
    expect(chips.map((c) => c.label)).toEqual(Object.keys(TEXT_AND_BORDER_PX));
    const widths = Object.values(TEXT_AND_BORDER_PX);
    const row = widths.reduce((a, w) => a + w + 2 * padX, 0) + gap * (widths.length - 1);
    expect(row).toBe(276); // what the browser drew at gap 4, padding 7 (1126 → 1402)
    expect(row + DIGIT_PX).toBeLessThanOrEqual(ROW_PX);
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
