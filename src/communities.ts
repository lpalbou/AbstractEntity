/**
 * His TOPICS as memory serves them (memory-owned communities,
 * COMMUNITIES-DESIGN 2026-11-10 §3-§4). Memory forms the communities in his
 * sleep, authors each one's title and summary, lays them out and counts what
 * it knows of each one; the gateway serves that one record set unchanged
 * (payload v2, GET /entities/{name}/communities; memory's
 * community_index.communities() at d1c1d9a):
 *
 *   {version: 2, version_seq, first_sleep_pending, algorithm,
 *    communities: [{id, key, title, summary, pending, verdict, size, kinds,
 *      members: [{id, via}], provisional_ids, cohesion,
 *      layout: {xy: [x, y], radius, seats: {id: [dx, dy]}}, centroid_stale,
 *      facts: {span: {first, last}, activity, hub, bridges,
 *        paths: [{from, to, count}],
 *        changed_since_last_sleep: {added, moved, split_from}}}],
 *    links: [{a, b, weight}]}
 *
 * `key` is the community's STABLE key across versions (the viewer's focus,
 * its circle's colour and the viewer's drags ride it, so a nightly revision
 * keeps them); `id` is the current revision's record id (it changes when the
 * membership changed) — the record, never the topic's identity.
 *
 * This module READS that payload (readCommunities: served, first sleep
 * pending, not served, or a wrong shape named) and says a topic's title and
 * summary in his words (authored, or "being written…" — never a label the
 * app made). The geometry is topic_layout.ts (and topic_labels.ts for the
 * titles on the canvas), the fetch communities_source.ts, the live marker
 * topic_map.tsx, the drill-down and the facts in words topics_panel.tsx;
 * graph_canvas draws.
 *
 * NOT SERVED is ABSENCE: an answer with no `version` (a gateway before v2),
 * or one that leaves out a field this shape requires (a gateway between the
 * first v2 and the final shape), shows the one sentence UNSERVED_SENTENCE;
 * there is no client-side fallback and nothing is filled in. Only the
 * fields of `facts` may be absent (each one then simply is not said). A
 * field that is THERE with the wrong type is named, never repaired.
 */

export const COMMUNITIES_PAYLOAD_VERSION = 2;

/** The graph's one sentence while his first sleep has not formed topics
 * (COMMUNITIES-DESIGN §4: "topics form during his next sleep"). */
export const FIRST_SLEEP_SENTENCE = "His topics form during his next sleep.";
/** The one sentence for a gateway that does not serve this shape. */
export const UNSERVED_SENTENCE = "This gateway does not serve topics yet.";
export const SUMMARY_BEING_WRITTEN = "summary being written…";
/** The badge on a member placed since the version (memory's place_record). */
export const PROVISIONAL_BADGE = "placed until his next sleep";
/** A community served with no title and none pending (a contract breach:
 * memory's I5). Never a made-up label. */
export const UNTITLED_TOPIC = "untitled topic";
/** The one verdict memory's author may return (communities.NO_COMMON_SUBJECT:
 * "If these memories share no common subject, say so plainly."), an authored
 * final state with no task behind it. */
export const NO_COMMON_SUBJECT = "no_common_subject";

export interface ServedMember {
  id: string;
  /** detected | attached | provisional (memory's words, kept as served). */
  via: string;
}

/** What memory counts of a topic (`facts`), each field absent when not
 * served. Ids are member record graph ids. */
export interface TopicFacts {
  /** When its members were formed (first, last); null ends: none known. */
  span?: { first: string | null; last: string | null };
  /** Uses of its members in memory's window (FACTS_WINDOW_DAYS). */
  activity?: number;
  /** Its most used member ever (null: none used yet). */
  hub?: string | null;
  /** Its members an engraved edge ties to another topic's member. */
  bridges?: string[];
  /** Its member pairs most used together in the window, most first. */
  paths?: { from: string; to: string; count: number }[];
  /** What this version changed (zeros and null for a topic it kept). */
  changed?: { added: number; moved: number; splitFrom: string | null };
}

export interface ServedCommunity {
  /** The stable community key (identity across versions). The record's
   * `id` is read (required, unique across the answer) and not kept: nothing
   * here rides the revision. */
  key: string;
  title: string | null;
  summary: string | null;
  titlePending: boolean;
  summaryPending: boolean;
  /** null, or NO_COMMON_SUBJECT: his author found no common subject. */
  verdict: typeof NO_COMMON_SUBJECT | null;
  /** How many memories the version holds in it (memory's count). */
  size: number;
  kinds: Map<string, number>;
  /** Members, each once, then provisional ids not listed among them: join
   * order. */
  members: ServedMember[];
  /** How many of `members` the version lists (the rest joined since:
   * provisional_ids, placed events on the stream). */
  listed: number;
  provisional: Set<string>;
  cohesion: number | null;
  layout: { x: number; y: number; radius: number; seats: Map<string, { dx: number; dy: number }> };
  /** Its centroid was computed in another embedding space: a memory formed
   * now is placed by its neighbours, not by its meaning, until he sleeps. */
  centroidStale: boolean;
  facts: TopicFacts;
}

export interface ServedLink {
  a: string;
  b: string;
  weight: number;
}

export interface ServedCommunities {
  versionSeq: number;
  communities: ServedCommunity[];
  /** Topic-to-topic weights, keyed on community keys. */
  links: ServedLink[];
}

export type CommunitiesRead =
  | { kind: "served"; data: ServedCommunities }
  | { kind: "first_sleep" }
  /** Not served: no `version` (a gateway before v2), or `missing` names the
   * first required field the answer leaves out. */
  | { kind: "unserved"; missing?: string }
  /** v2 with a wrong shape — named, never repaired. */
  | { kind: "malformed"; problem: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((p) => typeof p === "string");

/** A required field the answer leaves out (-> not served). */
class Absent {
  constructor(readonly path: string) {}
}
/** A field that is there with the wrong shape (-> named). */
class Wrong {
  constructor(readonly problem: string) {}
}

const there = (o: Obj, name: string): boolean => name in o && o[name] !== undefined;
/** The field, or Absent (named by its path). */
function need(o: Obj, name: string, path: string): unknown {
  if (!there(o, name)) throw new Absent(path ? `${path}.${name}` : name);
  return o[name];
}
function wrong(problem: string): never {
  throw new Wrong(problem);
}

function readPair(v: unknown): [number, number] | null {
  return Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) ? [v[0], v[1]] : null;
}

const textOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

function readFacts(raw: unknown, where: string, path: string): TopicFacts {
  if (!isObj(raw)) wrong(`${where}: facts is not an object`);
  const facts: TopicFacts = {};
  if (there(raw, "span")) {
    const span = raw.span;
    if (!isObj(span)) wrong(`${where}: facts.span is not {first, last}`);
    const first = need(span, "first", `${path}.span`);
    const last = need(span, "last", `${path}.span`);
    if (!textOrNull(first) || !textOrNull(last)) wrong(`${where}: facts.span is not {first, last}`);
    facts.span = { first, last };
  }
  if (there(raw, "activity")) {
    if (!isNum(raw.activity) || raw.activity < 0) wrong(`${where}: facts.activity is not a count`);
    facts.activity = raw.activity;
  }
  if (there(raw, "hub")) {
    if (!textOrNull(raw.hub)) wrong(`${where}: facts.hub is neither an id nor null`);
    facts.hub = raw.hub;
  }
  if (there(raw, "bridges")) {
    if (!isStrList(raw.bridges)) wrong(`${where}: facts.bridges is not a list of ids`);
    facts.bridges = raw.bridges;
  }
  if (there(raw, "paths")) {
    if (!Array.isArray(raw.paths)) wrong(`${where}: facts.paths is not a list`);
    facts.paths = raw.paths.map((p, i) => {
      if (!isObj(p)) wrong(`${where}: facts.paths[${i}] is not {from, to, count}`);
      const from = need(p, "from", `${path}.paths[${i}]`);
      const to = need(p, "to", `${path}.paths[${i}]`);
      const count = need(p, "count", `${path}.paths[${i}]`);
      if (typeof from !== "string" || typeof to !== "string" || !isNum(count)) wrong(`${where}: facts.paths[${i}] is not {from, to, count}`);
      return { from, to, count };
    });
  }
  if (there(raw, "changed_since_last_sleep")) {
    const ch = raw.changed_since_last_sleep;
    const at = `${path}.changed_since_last_sleep`;
    if (!isObj(ch)) wrong(`${where}: facts.changed_since_last_sleep is not {added, moved, split_from}`);
    const added = need(ch, "added", at);
    const moved = need(ch, "moved", at);
    const splitFrom = need(ch, "split_from", at);
    if (!isNum(added) || !isNum(moved) || !textOrNull(splitFrom)) wrong(`${where}: facts.changed_since_last_sleep is not {added, moved, split_from}`);
    facts.changed = { added, moved, splitFrom };
  }
  return facts;
}

/** A topic named in a problem as a person reads it: its place in the
 * answer and its authored title once read — never its key, its record id
 * or a member's id (review N4). */
function topicNamed(i: number, title?: unknown): string {
  return typeof title === "string" && title.trim() ? `topic ${i + 1} (“${title.trim()}”)` : `topic ${i + 1}`;
}

function readCommunity(raw: unknown, i: number): { id: string; community: ServedCommunity } {
  const at = `communities[${i}]`;
  if (!isObj(raw)) wrong(`${topicNamed(i)} is not an object`);
  const id = need(raw, "id", at);
  if (typeof id !== "string" || !id) wrong(`${topicNamed(i)}: id is not a string`);
  const key = need(raw, "key", at);
  if (typeof key !== "string" || !key) wrong(`${topicNamed(i)}: key is not a string`);
  const title = need(raw, "title", at);
  if (!textOrNull(title)) wrong(`${topicNamed(i)}: title is neither text nor null`);
  const where = topicNamed(i, title);
  const summary = need(raw, "summary", at);
  if (!textOrNull(summary)) wrong(`${where}: summary is neither text nor null`);
  const pending = need(raw, "pending", at);
  if (!isStrList(pending)) wrong(`${where}: pending is not a list of field names`);
  const verdict = need(raw, "verdict", at);
  if (verdict !== null && verdict !== NO_COMMON_SUBJECT) wrong(`${where}: its verdict is not one this app reads`);
  const size = need(raw, "size", at);
  if (!isNum(size) || size < 0) wrong(`${where}: size is not a count`);
  const rawKinds = need(raw, "kinds", at);
  if (!isObj(rawKinds) || !Object.values(rawKinds).every(isNum)) wrong(`${where}: kinds is not {kind: count}`);
  const kinds = new Map(Object.entries(rawKinds as Record<string, number>));
  const rawMembers = need(raw, "members", at);
  if (!Array.isArray(rawMembers)) wrong(`${where}: members is not a list`);
  const members: ServedMember[] = [];
  const listed = new Set<string>();
  for (const m of rawMembers) {
    if (!isObj(m) || typeof m.id !== "string" || !m.id || typeof m.via !== "string") wrong(`${where}: a member is not {id, via}`);
    // A member listed twice is one memory: counted once, one seat.
    if (listed.has(m.id)) continue;
    listed.add(m.id);
    members.push({ id: m.id, via: m.via });
  }
  const listedCount = members.length;
  const provisionalIds = need(raw, "provisional_ids", at);
  if (!isStrList(provisionalIds)) wrong(`${where}: provisional_ids is not a list of ids`);
  const provisional = new Set<string>();
  for (const m of members) if (m.via === "provisional") provisional.add(m.id);
  for (const p of provisionalIds) {
    provisional.add(p);
    if (!listed.has(p)) {
      listed.add(p);
      members.push({ id: p, via: "provisional" });
    }
  }
  const cohesion = need(raw, "cohesion", at);
  if (cohesion !== null && !isNum(cohesion)) wrong(`${where}: cohesion is not a number`);
  const layout = need(raw, "layout", at);
  if (!isObj(layout)) wrong(`${where}: layout is not an object`);
  const xy = readPair(need(layout, "xy", `${at}.layout`));
  if (!xy) wrong(`${where}: layout.xy is not [x, y]`);
  const radius = need(layout, "radius", `${at}.layout`);
  if (!isNum(radius) || radius <= 0) wrong(`${where}: layout.radius is not a positive number`);
  const rawSeats = need(layout, "seats", `${at}.layout`);
  if (!isObj(rawSeats)) wrong(`${where}: layout.seats is not an object`);
  const seats = new Map<string, { dx: number; dy: number }>();
  for (const [mid, seat] of Object.entries(rawSeats)) {
    const p = readPair(seat);
    if (!p) wrong(`${where}: a member's seat is not [dx, dy]`);
    seats.set(mid, { dx: p[0], dy: p[1] });
  }
  const centroidStale = need(raw, "centroid_stale", at);
  if (typeof centroidStale !== "boolean") wrong(`${where}: centroid_stale is not true or false`);
  const facts = readFacts(need(raw, "facts", at), where, `${at}.facts`);
  const community: ServedCommunity = {
    key,
    title: typeof title === "string" && title.trim() ? title.trim() : null,
    summary: typeof summary === "string" && summary.trim() ? summary.trim() : null,
    titlePending: pending.includes("title"),
    summaryPending: pending.includes("summary"),
    verdict,
    size,
    kinds,
    members,
    listed: listedCount,
    provisional,
    cohesion,
    layout: { x: xy[0], y: xy[1], radius, seats },
    centroidStale,
    facts,
  };
  return { id, community };
}

function readLinks(raw: unknown): ServedLink[] {
  if (!Array.isArray(raw)) wrong("links is not a list");
  return raw.map((l, i) => {
    if (!isObj(l)) wrong(`links[${i}] is not {a, b, weight}`);
    const a = need(l, "a", `links[${i}]`);
    const b = need(l, "b", `links[${i}]`);
    const weight = need(l, "weight", `links[${i}]`);
    if (typeof a !== "string" || typeof b !== "string" || !isNum(weight)) wrong(`links[${i}] is not {a, b, weight}`);
    return { a, b, weight };
  });
}

function readBody(body: Obj): CommunitiesRead {
  if (body.version !== COMMUNITIES_PAYLOAD_VERSION) wrong(`topics version ${JSON.stringify(body.version)} (this app reads version ${COMMUNITIES_PAYLOAD_VERSION})`);
  const firstSleep = need(body, "first_sleep_pending", "");
  const versionSeq = need(body, "version_seq", "");
  const algorithm = need(body, "algorithm", "");
  const rawCommunities = need(body, "communities", "");
  const rawLinks = need(body, "links", "");
  if (typeof firstSleep !== "boolean") wrong("first_sleep_pending is not true or false");
  if (firstSleep) return { kind: "first_sleep" };
  if (!isNum(versionSeq)) wrong("version_seq is not a number");
  if (typeof algorithm !== "string" || !algorithm) wrong("algorithm is not a name");
  if (!Array.isArray(rawCommunities)) wrong("communities is not a list");
  const communities: ServedCommunity[] = [];
  const keys = new Set<string>();
  const ids = new Set<string>();
  rawCommunities.forEach((raw, i) => {
    const { id, community: c } = readCommunity(raw, i);
    if (keys.has(c.key)) wrong("two topics share one key");
    if (ids.has(id)) wrong("two topics share one record id");
    keys.add(c.key);
    ids.add(id);
    communities.push(c);
  });
  return { kind: "served", data: { versionSeq, communities, links: readLinks(rawLinks) } };
}

/** What the gateway's answer is: v2 served, his first sleep still to come,
 * not served (no `version`, or a required field left out — named in
 * `missing`, never filled in), or a v2 answer whose shape is wrong (named). */
export function readCommunities(body: unknown): CommunitiesRead {
  if (!isObj(body)) return { kind: "malformed", problem: "the answer is not a JSON object" };
  if (!there(body, "version")) return { kind: "unserved" };
  try {
    return readBody(body);
  } catch (e) {
    if (e instanceof Absent) return { kind: "unserved", missing: e.path };
    if (e instanceof Wrong) return { kind: "malformed", problem: e.problem };
    throw e;
  }
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

/** How many memories a topic holds: the version's count (`size`, memory's
 * own) plus the memories placed in it since (provisional, not listed by the
 * version). What the panel and the title's card say, beside how many of
 * them the graph has loaded when the two differ. */
export function heldCount(c: Pick<ServedCommunity, "size" | "members" | "listed">): number {
  return c.size + Math.max(0, c.members.length - c.listed);
}
