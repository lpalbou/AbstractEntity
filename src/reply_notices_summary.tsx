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
  /** An item neither lane serves (not a key, not an entry object): listed as unreadable, never as a
   * healthy entry (review N2, 2026-11-10). */
  unreadable: boolean;
}

/** Each served value reported once (a list re-reads on every render of the thread). */
const reportedSeams = new WeakSet<object>();
function seam(field: string, value: unknown, what: string): void {
  if (value !== null && typeof value === "object") {
    if (reportedSeams.has(value)) return;
    reportedSeams.add(value);
  }
  console.error(`#SEAM turn detail \`${field}\`: ${what} (the gateway serves a list; entity_visits.py visit_turn_result)`, value);
}

/** A turn's served list field (`records_formed`, `diary_entries`): the list as served; absent = none.
 * Anything else is not what either lane serves: reported loudly (#SEAM) and read as no list, never
 * counted as one item (review N1: "1 diary" over a panel that lists nothing). */
export function servedList(field: string, served: unknown): unknown[] {
  if (served === undefined) return [];
  if (Array.isArray(served)) return served;
  seam(field, served, "not a list");
  return [];
}

/** The records a turn formed (`records_formed`, their graph ids, both lanes): an item that is not an
 * id string is reported and reads null (listed as unreadable, never shown as an id). */
export function turnFormedIds(served: unknown): Array<string | null> {
  const list = servedList("records_formed", served);
  if (list.some((id) => typeof id !== "string" || !id)) seam("records_formed", list, "an item is not a record id");
  return list.map((id) => (typeof id === "string" && id ? id : null));
}

/** The diary entries of a turn's `diary_entries`, as each lane serves it:
 *  - the visit lane (AbstractGateway entity_visits.py `visit_turn_result`, the runtime's
 *    `_turn.diary_meta`, act_only.capture_diary_elections): one object per entry,
 *    `{entry_id, kind, visibility, projected_record_id, title?}` (a private one has no title);
 *  - the hosted chat (entity_chat.py, `TurnReport.diary`): the entries' keys, strings.
 * An item that is neither (no `entry_id` and `kind` strings) is listed as unreadable and reported. */
export function turnDiaryEntries(served: unknown): TurnDiaryEntry[] {
  const list = servedList("diary_entries", served);
  if (list.some((item) => !readableDiaryItem(item))) seam("diary_entries", list, "an item is neither an entry key nor an entry");
  return list.map((item): TurnDiaryEntry => {
    if (typeof item === "string") return { entryId: item, kind: "", private: false, recordId: null, title: "", unreadable: false };
    if (!readableDiaryItem(item)) return { entryId: "", kind: "", private: false, recordId: null, title: "", unreadable: true };
    const o = item as Record<string, unknown>;
    const isPrivate = o.visibility === "private";
    return {
      entryId: o.entry_id as string,
      kind: o.kind as string,
      private: isPrivate,
      recordId: typeof o.projected_record_id === "string" && o.projected_record_id ? o.projected_record_id : null,
      title: !isPrivate && typeof o.title === "string" ? o.title.trim() : "",
      unreadable: false,
    };
  });
}

function readableDiaryItem(item: unknown): boolean {
  if (typeof item === "string") return true;
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const o = item as Record<string, unknown>;
  return typeof o.entry_id === "string" && typeof o.kind === "string";
}

/** How a diary entry reads in a list: its title; a private entry, one still being titled, a bare key
 * and an unreadable item each say so. */
export function diaryEntryWords(entry: TurnDiaryEntry): string {
  if (entry.unreadable) return "an entry this page cannot read";
  if (entry.private) return "a private entry";
  if (entry.title) return entry.title;
  return entry.kind ? "its title is still being written" : "a diary entry";
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
  records_formed?: readonly unknown[];
  diary_entries?: readonly unknown[];
  tools_ran?: string[];
  tool_details?: unknown;
  files?: unknown[];
  notices?: unknown[];
}): TurnFactChip[] {
  const chips: TurnFactChip[] = [];
  if (typeof detail.memories_in_context === "number") {
    const n = detail.memories_in_context;
    chips.push({ key: "memories", label: plural(n, "memory", "memories"), title: n === 1 ? "The memory recalled this turn" : `The ${n} memories recalled this turn`, tab: "context", record: null });
  }
  const formed = turnFormedIds(detail.records_formed);
  if (formed.length) chips.push({ key: "formed", label: `${formed.length} formed`, title: formed.length === 1 ? "The memory this turn formed" : "What this turn formed", tab: "context", record: formed.length === 1 ? formed[0] : null });
  const diary = turnDiaryEntries(detail.diary_entries);
  if (diary.length) chips.push({ key: "diary", label: `${diary.length} diary`, title: diary.length === 1 ? "The diary entry written this turn" : "The diary entries written this turn", tab: "context", record: diary.length === 1 ? diary[0].recordId : null });
  const toolCount = (detail.tools_ran ?? []).length;
  chips.push(
    toolCount > 0 || toolGaugeTrustworthy(detail)
      ? { key: "tools", label: plural(toolCount, "tool", "tools"), title: toolCount ? "The tools used this turn" : "No tool was used this turn", tab: "tools", record: null }
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
