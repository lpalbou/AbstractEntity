/**
 * The facts of a visit turn under his reply: what the turn panel (turn_detail_modal) and the
 * summary under his words read from the turn's served detail.
 */

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
