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
import { DIARY_ENTRY, DIARY_RECORD, DIARY_TITLE, VISIT_TURN_WITH_DIARY } from "./fixtures/visit_turn_reply";
import { turnDiaryEntries } from "./reply_notices_summary";
import { TurnDetailModal } from "./turn_detail_modal";
import type { ChatTurnResult } from "./stream_source";

const SOURCE = { baseUrl: "http://gw.test", entity: "castor" };
const message = (): DrawerMessage => ({ ...visitReplyMessage(VISIT_TURN_WITH_DIARY, "Castor", 1200), id: "m1" });
const probe = (turn: ChatTurnResult) =>
  renderToStaticMarkup(<TurnDetailModal turn={turn} entityName="Castor" source={SOURCE} onClose={() => undefined} />);

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
