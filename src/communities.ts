/**
 * His TOPICS as memory serves them (memory-owned communities,
 * COMMUNITIES-DESIGN 2026-11-10 §3-§4). Memory forms the communities in his
 * sleep, authors each one's title and summary, and lays them out; the
 * gateway serves that one record set (payload v2, GET
 * /entities/{name}/communities):
 *
 *   {version: 2, version_seq, first_sleep_pending, communities: [{id, key,
 *    title, summary, pending, size, members: [{id, via}], provisional_ids,
 *    cohesion, layout: {xy: [x, y], radius, seats: {id: [dx, dy]}}}], links}
 *
 * `key` is the community's STABLE key across versions (the viewer's focus,
 * its circle's colour and the viewer's drags ride it, so a nightly revision
 * keeps them); `id` is the current revision's record id (it changes when the
 * membership changed) — the record, never the topic's identity.
 *
 * This module READS that payload (readCommunities: served, first sleep
 * pending, a gateway before v2, or a wrong shape named) and says a topic's
 * title and summary in his words (authored, or "being written…" — never a
 * label the app made). The geometry is topic_layout.ts (and topic_labels.ts
 * for the titles on the canvas), the fetch communities_source.ts, the live
 * marker topic_map.tsx, the drill-down topics_panel.tsx; graph_canvas draws.
 *
 * A gateway before v2 (its payload has no `version`) shows the one sentence
 * UNSERVED_SENTENCE; there is no client-side fallback.
 */

export const COMMUNITIES_PAYLOAD_VERSION = 2;

/** The graph's one sentence while his first sleep has not formed topics. */
export const FIRST_SLEEP_SENTENCE = "His topics form at his next sleep.";
/** The one sentence for a gateway that serves the old shape (no `version`). */
export const UNSERVED_SENTENCE = "This gateway does not serve topics yet.";
export const SUMMARY_BEING_WRITTEN = "summary being written…";
/** The badge on a member placed since the version (memory's place_record). */
export const PROVISIONAL_BADGE = "placed until his next sleep";
/** A community served with no title and none pending (a contract breach:
 * memory's I5). Never a made-up label. */
export const UNTITLED_TOPIC = "untitled topic";

export interface ServedMember {
  id: string;
  /** detected | attached | provisional (memory's words, kept as served). */
  via: string;
}

export interface ServedCommunity {
  /** The stable community key (identity across versions). */
  key: string;
  /** The current revision's record id. */
  recordId: string;
  title: string | null;
  summary: string | null;
  titlePending: boolean;
  summaryPending: boolean;
  size: number;
  /** Members, then provisional ids not listed among them: join order. */
  members: ServedMember[];
  provisional: Set<string>;
  cohesion: number | null;
  layout: { x: number; y: number; radius: number; seats: Map<string, { dx: number; dy: number }> };
}

export interface ServedCommunities {
  versionSeq: number;
  communities: ServedCommunity[];
}

export type CommunitiesRead =
  | { kind: "served"; data: ServedCommunities }
  | { kind: "first_sleep" }
  /** A gateway before payload v2: its answer carries no `version`. */
  | { kind: "unserved" }
  /** v2 with a wrong shape — named, never repaired. */
  | { kind: "malformed"; problem: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function readPair(v: unknown): [number, number] | null {
  return Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) ? [v[0], v[1]] : null;
}

function readCommunity(raw: unknown, i: number): ServedCommunity | string {
  const at = `communities[${i}]`;
  if (!isObj(raw)) return `${at} is not an object`;
  const id = raw.id;
  if (typeof id !== "string" || !id) return `${at}.id is not a string`;
  const key = raw.key;
  if (typeof key !== "string" || !key) return `${at}.key is not a string`;
  const where = `community ${key}`;
  if (raw.title !== null && typeof raw.title !== "string") return `${where}: title is neither text nor null`;
  if (raw.summary !== null && raw.summary !== undefined && typeof raw.summary !== "string") return `${where}: summary is neither text nor null`;
  if (!Array.isArray(raw.pending) || !raw.pending.every((p) => typeof p === "string")) return `${where}: pending is not a list of field names`;
  if (!Array.isArray(raw.members)) return `${where}: members is not a list`;
  const members: ServedMember[] = [];
  const listed = new Set<string>();
  for (const m of raw.members) {
    if (!isObj(m) || typeof m.id !== "string" || !m.id || typeof m.via !== "string") return `${where}: a member is not {id, via}`;
    if (listed.has(m.id)) continue;
    listed.add(m.id);
    members.push({ id: m.id, via: m.via });
  }
  if (!Array.isArray(raw.provisional_ids) || !raw.provisional_ids.every((p) => typeof p === "string")) return `${where}: provisional_ids is not a list of ids`;
  const provisional = new Set<string>();
  for (const m of members) if (m.via === "provisional") provisional.add(m.id);
  for (const p of raw.provisional_ids as string[]) {
    provisional.add(p);
    if (!listed.has(p)) {
      listed.add(p);
      members.push({ id: p, via: "provisional" });
    }
  }
  const layout = raw.layout;
  if (!isObj(layout)) return `${where}: no layout`;
  const xy = readPair(layout.xy);
  if (!xy) return `${where}: layout.xy is not [x, y]`;
  if (!isNum(layout.radius) || layout.radius <= 0) return `${where}: layout.radius is not a positive number`;
  if (!isObj(layout.seats)) return `${where}: layout.seats is not an object`;
  const seats = new Map<string, { dx: number; dy: number }>();
  for (const [mid, seat] of Object.entries(layout.seats)) {
    const p = readPair(seat);
    if (!p) return `${where}: the seat of ${mid} is not [dx, dy]`;
    seats.set(mid, { dx: p[0], dy: p[1] });
  }
  if (raw.cohesion !== null && raw.cohesion !== undefined && !isNum(raw.cohesion)) return `${where}: cohesion is not a number`;
  const pending = raw.pending as string[];
  return {
    key,
    recordId: id,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null,
    summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : null,
    titlePending: pending.includes("title"),
    summaryPending: pending.includes("summary"),
    size: isNum(raw.size) ? raw.size : members.length,
    members,
    provisional,
    cohesion: isNum(raw.cohesion) ? raw.cohesion : null,
    layout: { x: xy[0], y: xy[1], radius: layout.radius, seats },
  };
}

/** What the gateway's answer is: v2 served, his first sleep still to come,
 * a gateway before v2 (no `version` — the ONE detection, never a guess from
 * other fields), or a v2 answer whose shape is wrong (named). */
export function readCommunities(body: unknown): CommunitiesRead {
  if (!isObj(body)) return { kind: "malformed", problem: "the answer is not a JSON object" };
  if (!("version" in body)) return { kind: "unserved" };
  if (body.version !== COMMUNITIES_PAYLOAD_VERSION) return { kind: "malformed", problem: `topics version ${JSON.stringify(body.version)} (this app reads version ${COMMUNITIES_PAYLOAD_VERSION})` };
  if (typeof body.first_sleep_pending !== "boolean") return { kind: "malformed", problem: "first_sleep_pending is not true or false" };
  if (body.first_sleep_pending) return { kind: "first_sleep" };
  if (!isNum(body.version_seq)) return { kind: "malformed", problem: "version_seq is not a number" };
  if (!Array.isArray(body.communities)) return { kind: "malformed", problem: "communities is not a list" };
  const communities: ServedCommunity[] = [];
  const keys = new Set<string>();
  for (let i = 0; i < body.communities.length; i++) {
    const c = readCommunity(body.communities[i], i);
    if (typeof c === "string") return { kind: "malformed", problem: c };
    if (keys.has(c.key)) return { kind: "malformed", problem: `two communities share the key ${c.key}` };
    keys.add(c.key);
    communities.push(c);
  }
  return { kind: "served", data: { versionSeq: body.version_seq, communities } };
}

/** A topic's title as a person reads it: the authored title; "title being
 * written…" while memory says so; never a client-made label. */
export function topicTitle(c: Pick<ServedCommunity, "title" | "titlePending">, beingWritten: string): string {
  if (c.titlePending) return beingWritten;
  return c.title ?? UNTITLED_TOPIC;
}

/** Its summary: the authored one, "summary being written…" while memory
 * says so, else nothing. */
export function topicSummary(c: Pick<ServedCommunity, "summary" | "summaryPending">): string | null {
  if (c.summaryPending) return SUMMARY_BEING_WRITTEN;
  return c.summary;
}
