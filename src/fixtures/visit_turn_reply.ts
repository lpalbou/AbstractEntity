/**
 * A visit turn's response as AbstractGateway serves it (entity_visits.py `visit_turn_result`, read by
 * `sendVisitTurn`): the shape of castor's visit turn of 2026-11-09 (the hermetic copy's
 * runtime_castor.sqlite3, run dfdf5e48…, its `_turn`), kept as served: the keys, the counts (44
 * memories: 31 episodes, 11 summaries, an interest, a lesson; one episode formed; one diary entry;
 * no tool), the id formats, the diary entry's kind and visibility. Titles, digests and the reply are
 * neutral words.
 *
 * `diary_entries` is the runtime's `_turn.diary_meta` (act_only.capture_diary_elections), one OBJECT
 * per entry `{entry_id, kind, visibility, projected_record_id, title}`, never a count or an id: the
 * object the turn panel once rendered as a React child (operator 2026-11-10 20:36, React error #31
 * "object with keys {entry_id, kind, visibility, projected_record_id, title}").
 * `reply_notices` is what the runtime serves beside the reply for that entry (identity/chat.py
 * `diary_notice`: kind "diary", the entry's graph projection as `record_id`, its title).
 */
import type { VisitTurnResult } from "../stream_source";

export const DIARY_RECORD = "ex:diary-0b1c2d3e4f5a6b7c8d9e0f1a2b";
export const DIARY_ENTRY = "diary_0a1b2c3d4e5f6a7b8c9d0e1f";
export const DIARY_TITLE = "A note kept after reading the archive";
export const FORMED_RECORD = "ex:episode-1c2d3e4f5a6b7c8d9e0f1a2b3c";

const KINDS = [...Array(31).fill("episode"), ...Array(11).fill("summary"), "interest", "lesson"] as string[];
const ADMISSIONS = [...Array(31).fill("both"), ...Array(12).fill("stm"), "stimulus"] as string[];

const memories = KINDS.map((kind, i) => ({
  graph_id: `ex:${kind}-${String(i).padStart(26, "0")}`,
  record_id: String(i).padStart(32, "a"),
  kind,
  title: `A memory of the harbour, number ${i + 1}`,
  admission: ADMISSIONS[i],
  digest: "What he lived there, in a few words.",
  tokens: 16 + i * 4,
  global_count: i % 5,
  born_at: "2026-11-0" + ((i % 8) + 1) + "T10:00:00+00:00",
  origin: "",
}));

/** The response body (`status`, `run_id` and the probe fields), as `sendVisitTurn` resolves it. */
export const VISIT_TURN_WITH_DIARY = {
  run_id: "dfdf5e48-0000-4000-8000-000000000000",
  status: "completed",
  turn_n: 3,
  reply: "I read it all this morning. The door is open, and I am glad of it.",
  turn_id: "t-0003",
  tools_ran: [],
  memories,
  memories_in_context: memories.length,
  records_formed: [FORMED_RECORD],
  diary_entries: [
    { entry_id: DIARY_ENTRY, kind: "note", visibility: "self", projected_record_id: DIARY_RECORD, title: DIARY_TITLE },
  ],
  notices: [],
  reply_notices: [{ kind: "diary", record_id: DIARY_RECORD, title: DIARY_TITLE }],
  participants: ["person:admin", "entity:castor@home-fd023c86"],
  system_prompt: "You are Castor.",
  tool_details: [],
  files: [],
} as unknown as VisitTurnResult;
