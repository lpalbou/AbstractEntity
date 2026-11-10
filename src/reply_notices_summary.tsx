/**
 * The facts of a visit turn under his reply: what the turn panel (turn_detail_modal) and the
 * summary under his words read from the turn's served detail.
 */
import React from "react";

import "./chat_notices.css";

/** One diary entry a turn kept. */
export interface TurnDiaryEntry {
  /** The book's key (`diary_…`): never shown. */
  entryId: string;
  /** The diary kind ("note", "question", …); "" when the lane serves only the key. */
  kind: string;
  /** A private entry: its words are not served. */
  private: boolean;
  /** Its record in his graph (the entry's projection), the id Detail opens; null when not served. */
  recordId: string | null;
  /** Its title as formed; "" for a private entry or one whose title is still being written. */
  title: string;
}

/** The diary entries of a turn's `diary_entries`, as each lane serves it:
 *  - the visit lane (AbstractGateway entity_visits.py `visit_turn_result`, the runtime's
 *    `_turn.diary_meta`, act_only.capture_diary_elections): one object per entry,
 *    `{entry_id, kind, visibility, projected_record_id, title?}` (a private one has no title);
 *  - the hosted chat (entity_chat.py, `TurnReport.diary`): the entries' keys, strings. */
export function turnDiaryEntries(served: unknown): TurnDiaryEntry[] {
  if (!Array.isArray(served)) return [];
  return served.map((item): TurnDiaryEntry => {
    if (typeof item === "string") return { entryId: item, kind: "", private: false, recordId: null, title: "" };
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const isPrivate = o.visibility === "private";
    return {
      entryId: typeof o.entry_id === "string" ? o.entry_id : "",
      kind: typeof o.kind === "string" ? o.kind : "",
      private: isPrivate,
      recordId: typeof o.projected_record_id === "string" && o.projected_record_id ? o.projected_record_id : null,
      title: !isPrivate && typeof o.title === "string" ? o.title.trim() : "",
    };
  });
}

/** How a diary entry reads in a list: its title; a private entry or one still being titled says so. */
export function diaryEntryWords(entry: TurnDiaryEntry): string {
  if (entry.private) return "a private entry";
  if (entry.title) return entry.title;
  return entry.kind ? "its title is still being written" : "an entry in his book";
}

// ---- the summary under his words (operator 2026-11-10: in the message's own footer, left-aligned,
// the same small chips as the badge of what the reply formed) --------------------------------------

/** The turn panel's tabs a chip can open. */
export type TurnPanelTab = "context" | "tools";

/** One chip of the summary: its words, and what it opens: the record it names in Detail when it
 * names exactly one (`record`), else (or when Detail does not hold it yet) the turn panel on `tab`. */
export interface TurnFactChip {
  key: "memories" | "formed" | "diary" | "tools" | "files" | "notices";
  label: string;
  title: string;
  tab: TurnPanelTab;
  record: string | null;
}

/** Is the turn's tool count TRUSTWORTHY? The visit lane's tools_ran was structurally zero once
 * (incident report 2026-07-16, agent F3: the adapter never wrote turn_captures["tools_ran"]). A live
 * gauge: a non-empty tools_ran, OR the tool_details field PRESENT (even empty = a verified zero). An
 * absent field on a zero count is an unverifiable zero: say so, never "0 tools". */
export function toolGaugeTrustworthy(detail: { tools_ran?: string[]; tool_details?: unknown }): boolean {
  return (detail.tools_ran ?? []).length > 0 || detail.tool_details !== undefined;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The chips of a turn's facts, in order: memories recalled ("44 memories": one line in the side
 * panel), formed, diary, tools (always, zero
 * included: a reader must SEE the zero next to a reply that talks like it looked things up, seq 43),
 * files, the operator's notices. */
export function turnFactChips(detail: {
  memories_in_context?: number;
  records_formed?: unknown;
  diary_entries?: unknown;
  tools_ran?: string[];
  tool_details?: unknown;
  files?: unknown[];
  notices?: unknown[];
}): TurnFactChip[] {
  const chips: TurnFactChip[] = [];
  if (typeof detail.memories_in_context === "number") {
    const n = detail.memories_in_context;
    chips.push({ key: "memories", label: plural(n, "memory", "memories"), title: n === 1 ? "The memory he recalled this turn" : `The ${n} memories he recalled this turn`, tab: "context", record: null });
  }
  const formed = Array.isArray(detail.records_formed) ? detail.records_formed.filter((r): r is string => typeof r === "string" && r !== "") : [];
  const formedCount = Array.isArray(detail.records_formed) ? detail.records_formed.length : detail.records_formed ? 1 : 0;
  if (formedCount) chips.push({ key: "formed", label: `${formedCount} formed`, title: formedCount === 1 ? "The memory this turn formed" : "What this turn formed", tab: "context", record: formedCount === 1 ? formed[0] ?? null : null });
  const diary = turnDiaryEntries(detail.diary_entries);
  const diaryCount = Array.isArray(detail.diary_entries) ? diary.length : detail.diary_entries ? 1 : 0;
  if (diaryCount) chips.push({ key: "diary", label: `${diaryCount} diary`, title: diaryCount === 1 ? "The entry he wrote in his book" : "The entries he wrote in his book", tab: "context", record: diary.length === 1 ? diary[0].recordId : null });
  const toolCount = (detail.tools_ran ?? []).length;
  chips.push(
    toolCount > 0 || toolGaugeTrustworthy(detail)
      ? { key: "tools", label: plural(toolCount, "tool", "tools"), title: toolCount ? "The tools he used this turn" : "He used no tool this turn", tab: "tools", record: null }
      : { key: "tools", label: "tools unverified", title: "Which tools ran is not served for this turn", tab: "tools", record: null },
  );
  const files = detail.files?.length ?? 0;
  if (files) chips.push({ key: "files", label: plural(files, "file", "files"), title: "The files this turn touched", tab: "context", record: null });
  const notices = detail.notices?.length ?? 0;
  if (notices) chips.push({ key: "notices", label: plural(notices, "notice", "notices"), title: "What the turn noted along the way", tab: "tools", record: null });
  return chips;
}

/** A chip's click: the record it names opens in Detail; when it names none, or Detail does not hold
 * it yet (the reply lands before the record's envelope is folded, review S1 2026-11-09), the turn
 * panel opens on the chip's tab, where that record is listed. */
export function openTurnFact<T>(
  chip: TurnFactChip,
  detail: T,
  host: { onDetail(detail: T, tab: TurnPanelTab): void; onOpenRecord?: (graphId: string) => boolean },
): void {
  if (chip.record && host.onOpenRecord?.(chip.record)) return;
  host.onDetail(detail, chip.tab);
}

/** The summary row in his message's footer: the kit's chip classes (the same family as the badge of
 * what the reply formed), left-aligned, one chip per fact. `system` leads only when the message's
 * author is served and is not an entity (his own reply needs no label). No hooks: a plain row. */
export function TurnFactsRow({
  chips,
  authorKind,
  onOpen,
}: {
  chips: readonly TurnFactChip[];
  authorKind?: string | null;
  onOpen(chip: TurnFactChip): void;
}): React.ReactElement | null {
  if (!chips.length) return null;
  return (
    <div className="pc-chat-notices__row cd_turnfacts" role="group" aria-label="What this turn did">
      {authorKind && authorKind !== "entity" ? <span className="pc-chat-notice__kind cd_turnfacts_lead">system</span> : null}
      {chips.map((chip) => (
        <button key={chip.key} type="button" className="pc-chat-notice cd_turnfact" data-fact={chip.key} title={chip.title} onClick={() => onOpen(chip)}>
          <span className="pc-chat-notice__label">{chip.label}</span>
        </button>
      ))}
    </div>
  );
}
