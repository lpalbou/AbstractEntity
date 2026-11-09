/**
 * The phase bar's gateway seam (operator ruling 2026-11-08, root
 * untracked/entity-phases-2026-11-08/TARGET.md; built against CONTRACT-phases.md v2 there,
 * 2026-11-09, with CONTRACT-v3-deltas.md on top: the five-state life cycle).
 *
 * One read and three writes, nothing else:
 *   - GET  /entities/{name}/life_state           (§1) the phase, the one toggle (personal), the
 *                                                 kill switch, the sentence for now (no clock
 *                                                 time: the app formats `since`), what comes next,
 *                                                 what blocks (and the act that unblocks), what a
 *                                                 person may ask for now (`can`), the visit/work/
 *                                                 sleep facts (work: the job queue, v3 D1), `rev`
 *                                                 and `generation`;
 *   - PUT  /entities/{name}/life_state/toggles   (§2, v3 D1) {personal}: allow own time, or stop
 *                                                 allowing it. There is no work switch: a body
 *                                                 with `work` is refused (422 unknown_field), and
 *                                                 this app never sends one;
 *   - POST /entities/{name}/lifecycle            (§3) {action: "stop" | "resume" | "retry"}: the
 *                                                 kill switch (v3 D3: Stop also revokes own time;
 *                                                 Resume lands idle), and retry (start his own
 *                                                 time again after it stopped unexpectedly);
 *   - POST /entities/{name}/state                (§4.3, §8.5) {state: "sleep", dream: true}: the
 *                                                 operator's "sleep now".
 * Live (§5): a host envelope `payload.kind == "phase_changed"` on the replay stream the app already
 * holds; the highest `rev` wins, a lower one is ignored.
 *
 * Never hedged: a life_state answer without the contract's fields (an older gateway, v1's body
 * included: no `can`, no `generation`; v2's too: its `work` is not the job queue) is "this gateway
 * does not serve the phase bar yet" (one visible sentence, every control off), never a fall back
 * to the old loop/start, loop/stop or `state paused` routes, which this app no longer calls.
 */
import { joinBaseUrl } from "@abstractframework/ui-kit";

import { gatewayReadHeaders, gatewayWriteHeaders } from "./stream_source";
import type { ReplayEnvelope } from "./stream_types";

/** What life_state.phase says (§1.2). `idle` = awake and reachable, nothing to do, own time not
 * granted (v3: a state of its own; a newborn starts idle); `stopped` = the kill switch is on
 * (outside the machine, unreachable). */
export const SERVED_PHASES = ["visit", "work", "personal", "sleep", "stopped", "idle"] as const;
export type ServedPhase = (typeof SERVED_PHASES)[number];

/** v3 D1: the one toggle. Own time, granted or revoked by the operator only; there is no work
 * switch (work starts when a job is queued). */
export interface PhaseToggles {
  personal: boolean;
}

/** §1.3, present while the phase is visit. `waiting_for`: the open visit waits for him to finish
 * his own step ("loop") or his maintenance ("maintenance"), with no time limit; null otherwise. */
export interface PhaseVisit {
  lane: string;
  run_id: string | null;
  chat_id: string | null;
  session_id: string | null;
  participants: string[];
  since: string | null;
  waiting_for: "loop" | "maintenance" | null;
}

/** The job he is working on now (v3 D1): its kind ("summon", "work_order", "automation", …),
 * its run and since when. */
export interface PhaseJob {
  kind: string;
  run_id: string | null;
  since: string | null;
}

/** v3 D1: his job queue, always served. A queued job moves idle or own time to work; when all are
 * done he returns where `next.phase` says. `current` is null when no job runs. */
export interface PhaseWork {
  jobs_queued: number;
  current: PhaseJob | null;
}

/** §1.3, present while the phase is sleep. `ends`: "when maintenance is done", an ISO time, or null
 * (nothing but a person ends it). `reason`: why he sleeps — for a sleep the idle thresholds started
 * (v3 D2), the threshold that fired ("24 h since the last sleep", "500 new memories since the last
 * sleep"). */
export interface PhaseSleep {
  kind: string;
  reason: string | null;
  since: string | null;
  ends: string | null;
}

/** §1.5: one thing a person may ask for now; `sentence` says why not (null when allowed). */
export interface PhaseCanEntry {
  allowed: boolean;
  sentence: string | null;
}

/** §1.5: what a person may ask for now. Every control's enabled state and tooltip come from it.
 * v3 D1: `toggle_work` is gone (no work switch). */
export interface PhaseCan {
  visit: PhaseCanEntry;
  sleep_now: PhaseCanEntry;
  toggle_personal: PhaseCanEntry;
}
export const PHASE_CAN_KEYS = ["visit", "sleep_now", "toggle_personal"] as const;

/** The served phase bar: the contract's GET body, the fields this app reads. */
export interface PhaseBar {
  rev: number;
  /** The lifecycle fence (§3.3): Stop bumps it. Read with `rev` so an answer from before a Stop
   * never repaints after it. */
  generation: number;
  phase: ServedPhase;
  stopped: boolean;
  toggles: PhaseToggles;
  /** When the current phase began (ISO), null when no fact exists. */
  since: string | null;
  /** One plain line for the person, never empty, with no clock time ("On his own time."). */
  sentence: string;
  /** What happens next without anyone acting. */
  next: { phase: string | null; sentence: string } | null;
  /** Why a phase the toggles allow is not running, and the act that unblocks it ("retry": POST
   * lifecycle {retry}), or null. */
  blocked: { code: string; sentence: string; action: string | null } | null;
  can: PhaseCan;
  visit: PhaseVisit | null;
  /** The job queue (v3 D1), in every phase. */
  work: PhaseWork;
  sleep: PhaseSleep | null;
}

/** The one sentence a gateway without the phase bar gets. */
export const PHASE_BAR_UNSERVED = "This gateway does not serve the phase bar yet.";

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
/** "Every field listed is always present; a value that does not apply is null, never omitted." */
const has = (o: Record<string, unknown>, ...keys: string[]) => keys.every((k) => k in o);

function nextOf(v: unknown): PhaseBar["next"] | undefined {
  if (v === null) return null;
  if (!isObj(v) || !has(v, "phase", "sentence")) return undefined;
  const sentence = text(v.sentence);
  if (!sentence || (v.phase !== null && typeof v.phase !== "string")) return undefined;
  return { phase: text(v.phase), sentence };
}

function blockedOf(v: unknown): PhaseBar["blocked"] | undefined {
  if (v === null) return null;
  if (!isObj(v) || !has(v, "code", "sentence", "action")) return undefined;
  const code = text(v.code);
  const sentence = text(v.sentence);
  if (v.action !== null && typeof v.action !== "string") return undefined;
  return code && sentence ? { code, sentence, action: text(v.action) } : undefined;
}

function canEntryOf(v: unknown): PhaseCanEntry | undefined {
  if (!isObj(v) || !has(v, "allowed", "sentence") || typeof v.allowed !== "boolean") return undefined;
  if (v.sentence !== null && typeof v.sentence !== "string") return undefined;
  const sentence = text(v.sentence);
  // A refusal always says why (§1.5).
  if (!v.allowed && !sentence) return undefined;
  return { allowed: v.allowed, sentence: v.allowed ? null : sentence };
}

function canOf(v: unknown): PhaseCan | undefined {
  if (!isObj(v)) return undefined;
  const out: Partial<PhaseCan> = {};
  for (const key of PHASE_CAN_KEYS) {
    const entry = canEntryOf(v[key]);
    if (!entry) return undefined;
    out[key] = entry;
  }
  return out as PhaseCan;
}

function visitOf(v: unknown): PhaseVisit | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !has(v, "lane", "run_id", "chat_id", "session_id", "participants", "since", "waiting_for") || !Array.isArray(v.participants)) return undefined;
  const lane = text(v.lane);
  if (!lane) return undefined;
  if (v.waiting_for !== null && v.waiting_for !== "loop" && v.waiting_for !== "maintenance") return undefined;
  return {
    lane,
    run_id: text(v.run_id),
    chat_id: text(v.chat_id),
    session_id: text(v.session_id),
    participants: v.participants.filter((p): p is string => typeof p === "string"),
    since: text(v.since),
    waiting_for: v.waiting_for,
  };
}

function jobOf(v: unknown): PhaseJob | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !has(v, "kind", "run_id", "since")) return undefined;
  const kind = text(v.kind);
  return kind ? { kind, run_id: text(v.run_id), since: text(v.since) } : undefined;
}

/** v3 D1: `{jobs_queued, current}`, never null (a v2 body's work sub-object is not the queue). */
function workOf(v: unknown): PhaseWork | undefined {
  if (!isObj(v) || !has(v, "jobs_queued", "current")) return undefined;
  const n = v.jobs_queued;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return undefined;
  const current = jobOf(v.current);
  return current === undefined ? undefined : { jobs_queued: n, current };
}

function sleepOf(v: unknown): PhaseSleep | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !has(v, "kind", "reason", "since", "ends")) return undefined;
  const kind = text(v.kind);
  return kind ? { kind, reason: text(v.reason), since: text(v.since), ends: text(v.ends) } : undefined;
}

/** The served bar, or null when the body lacks a field the contract always sends (an older
 * life_state: `phase` without `rev`, or v1's body without `can` and `generation`…). */
export function parsePhaseBar(body: unknown): PhaseBar | null {
  if (!isObj(body)) return null;
  if (!has(body, "rev", "generation", "phase", "stopped", "toggles", "since", "sentence", "next", "blocked", "can", "visit", "work", "sleep")) return null;
  const { rev, generation, phase, stopped, toggles } = body;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 1) return null;
  if (typeof generation !== "number" || !Number.isInteger(generation) || generation < 0) return null;
  if (typeof phase !== "string" || !(SERVED_PHASES as readonly string[]).includes(phase)) return null;
  if (typeof stopped !== "boolean") return null;
  if (!isObj(toggles) || typeof toggles.personal !== "boolean") return null;
  const sentence = text(body.sentence);
  if (!sentence) return null;
  if (body.since !== null && typeof body.since !== "string") return null;
  const next = nextOf(body.next);
  const blocked = blockedOf(body.blocked);
  const visit = visitOf(body.visit);
  const work = workOf(body.work);
  const sleep = sleepOf(body.sleep);
  const can = canOf(body.can);
  if (next === undefined || blocked === undefined || visit === undefined || work === undefined || sleep === undefined || can === undefined) return null;
  return {
    rev,
    generation,
    phase: phase as ServedPhase,
    stopped,
    toggles: { personal: toggles.personal },
    since: text(body.since),
    sentence,
    next,
    blocked,
    can,
    visit,
    work,
    sleep,
  };
}

/** The §5 marker's payload: what the app renders at once (the rest comes with a re-read). */
export interface PhaseMarker {
  rev: number;
  generation: number;
  phase: ServedPhase;
  stopped: boolean;
  toggles: PhaseToggles;
  since: string | null;
  sentence: string;
}

export function parsePhaseMarker(payload: unknown): PhaseMarker | null {
  if (!isObj(payload) || payload.kind !== "phase_changed") return null;
  const { rev, generation, phase, stopped, toggles } = payload;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 1) return null;
  if (typeof generation !== "number" || !Number.isInteger(generation) || generation < 0) return null;
  if (typeof phase !== "string" || !(SERVED_PHASES as readonly string[]).includes(phase)) return null;
  if (typeof stopped !== "boolean" || !isObj(toggles) || typeof toggles.personal !== "boolean") return null;
  const sentence = text(payload.sentence);
  if (!sentence) return null;
  return { rev, generation, phase: phase as ServedPhase, stopped, toggles: { personal: toggles.personal }, since: text(payload.since), sentence };
}

/** The highest-rev phase marker (§5) among `envelopes[from..]` and `prev` (the one an earlier pass
 * found), or null. Incremental: the caller passes where its last pass ended. */
export function highestPhaseMarker(envelopes: readonly ReplayEnvelope[], from = 0, prev: PhaseMarker | null = null): PhaseMarker | null {
  let best = prev;
  for (let i = Math.max(0, from); i < envelopes.length; i++) {
    const env = envelopes[i];
    if (env.family !== "host") continue;
    const marker = parsePhaseMarker(env.payload);
    if (marker && (!best || marker.rev > best.rev)) best = marker;
  }
  return best;
}

/** One gateway answer, kept whole: the status, the JSON body (null when not JSON) and the error
 * code (`detail.reason_code`, the body's `reason_code` / `code`, else the X-Gateway-Error-Code
 * header). */
export interface PhaseWire {
  status: number;
  body: Record<string, unknown> | null;
  code: string | null;
}

export type PhaseFetch = (url: string, init: RequestInit) => Promise<Response>;

export async function phaseWireOf(res: Response): Promise<PhaseWire> {
  let body: Record<string, unknown> | null = null;
  try {
    const v = (await res.json()) as unknown;
    if (isObj(v)) body = v;
  } catch {
    body = null;
  }
  const detail = body && isObj(body.detail) ? body.detail : null;
  const code = text(detail?.reason_code) ?? text(body?.reason_code) ?? text(body?.code) ?? text(res.headers.get("X-Gateway-Error-Code"));
  return { status: res.status, body, code };
}

const entityPath = (entity: string, rest: string) => `api/gateway/entities/${encodeURIComponent(entity)}/${rest}`;

/** GET life_state. */
export async function getPhaseBar(baseUrl: string, entity: string, fetchImpl: PhaseFetch = fetch): Promise<PhaseWire> {
  const res = await fetchImpl(joinBaseUrl(baseUrl, entityPath(entity, "life_state")), {
    credentials: "include",
    headers: gatewayReadHeaders({ Accept: "application/json" }),
  });
  return phaseWireOf(res);
}

/** The PUT body for the one toggle (§2, v3 D1): `{personal}`, a strict boolean, and nothing else —
 * never `work` (there is no work switch; the gateway answers 422 unknown_field). */
export function toggleBody(key: keyof PhaseToggles, on: boolean): PhaseToggles {
  // Exhaustive: a second toggle key would fail to compile here, never send itself.
  switch (key) {
    case "personal":
      return { personal: on };
  }
}

export type LifecycleAction = "stop" | "resume" | "retry";

/** The POST body for the kill switch, and retry (§3). */
export function lifecycleBody(action: LifecycleAction): { action: LifecycleAction } {
  return { action };
}

/** The POST body for the operator's "sleep now" (§8.5): the operator sleep with its maintenance
 * pass (§4.3: he wakes when the pass returns). */
export function sleepNowBody(): { state: "sleep"; dream: true } {
  return { state: "sleep", dream: true };
}

async function write(baseUrl: string, path: string, method: "PUT" | "POST", body: unknown, token: string | null, fetchImpl: PhaseFetch): Promise<PhaseWire> {
  const res = await fetchImpl(joinBaseUrl(baseUrl, path), {
    credentials: "include",
    method,
    headers: gatewayWriteHeaders(token),
    body: JSON.stringify(body),
  });
  return phaseWireOf(res);
}

export function putPhaseToggle(baseUrl: string, entity: string, key: keyof PhaseToggles, on: boolean, token: string | null, fetchImpl: PhaseFetch = fetch): Promise<PhaseWire> {
  return write(baseUrl, entityPath(entity, "life_state/toggles"), "PUT", toggleBody(key, on), token, fetchImpl);
}

export function postLifecycle(baseUrl: string, entity: string, action: LifecycleAction, token: string | null, fetchImpl: PhaseFetch = fetch): Promise<PhaseWire> {
  return write(baseUrl, entityPath(entity, "lifecycle"), "POST", lifecycleBody(action), token, fetchImpl);
}

/** §4.3: the pass runs inside this request, so it can take long; the caller does not wait on it for
 * the bar (the stream shows the sleep, then the wake). */
export function postSleepNow(baseUrl: string, entity: string, token: string | null, fetchImpl: PhaseFetch = fetch): Promise<PhaseWire> {
  return write(baseUrl, entityPath(entity, "state"), "POST", sleepNowBody(), token, fetchImpl);
}
