/**
 * The phase bar's gateway seam (operator ruling 2026-11-08, root
 * untracked/entity-phases-2026-11-08/TARGET.md; built against CONTRACT-phases.md v1 there).
 *
 * One read and three writes, nothing else:
 *   - GET  /entities/{name}/life_state           (§1) the phase, the two toggles, the kill switch,
 *                                                 the sentence for now, since when, what comes next,
 *                                                 what blocks, the visit/work/sleep facts, `rev`;
 *   - PUT  /entities/{name}/life_state/toggles   (§2) {work?, personal?}: allow, or stop allowing;
 *   - POST /entities/{name}/lifecycle            (§3) {action: "stop" | "resume"}: the kill switch;
 *   - POST /entities/{name}/state                (§6) {state: "asleep", dream: true}: the operator's
 *                                                 "sleep now" (it no longer turns personal off).
 * Live (§5): a host envelope `payload.kind == "phase_changed"` on the replay stream the app already
 * holds; the highest `rev` wins, a lower one is ignored.
 *
 * Never hedged: a life_state answer without the contract's fields is "this gateway does not serve
 * the phase bar yet" (one visible sentence, every control off), never a fall back to the old
 * loop/start, loop/stop or `state paused` routes, which this app no longer calls.
 */
import { joinBaseUrl } from "@abstractframework/ui-kit";

import { gatewayReadHeaders, gatewayWriteHeaders } from "./stream_source";
import type { ReplayEnvelope } from "./stream_types";

/** What life_state.phase says (§1.2). `idle` = awake and reachable, nothing of his own running (a
 * computed label); `stopped` = the kill switch is on (outside the machine, unreachable). */
export const SERVED_PHASES = ["visit", "work", "personal", "sleep", "stopped", "idle"] as const;
export type ServedPhase = (typeof SERVED_PHASES)[number];

export interface PhaseToggles {
  work: boolean;
  personal: boolean;
}

/** §1.3, present while the phase is visit. */
export interface PhaseVisit {
  lane: string;
  run_id: string | null;
  chat_id: string | null;
  session_id: string | null;
  participants: string[];
  since: string | null;
}

/** §1.3, present while the phase is work. */
export interface PhaseWork {
  kind: string;
  run_id: string | null;
  since: string | null;
}

/** §1.3, present while the phase is sleep. `ends`: "when maintenance is done", an ISO time, or null
 * (nothing but a person ends it). */
export interface PhaseSleep {
  kind: string;
  reason: string | null;
  since: string | null;
  ends: string | null;
}

/** The served phase bar: the contract's GET body, the fields this app reads. */
export interface PhaseBar {
  rev: number;
  phase: ServedPhase;
  stopped: boolean;
  toggles: PhaseToggles;
  /** When the current phase began (ISO), null when no fact exists. */
  since: string | null;
  /** One plain line for the person, never empty ("On his own time since 19:02."). */
  sentence: string;
  /** What happens next without anyone acting. */
  next: { phase: string | null; sentence: string } | null;
  /** Why a phase the toggles allow is not running. */
  blocked: { code: string; sentence: string } | null;
  visit: PhaseVisit | null;
  work: PhaseWork | null;
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
  if (!isObj(v)) return undefined;
  const code = text(v.code);
  const sentence = text(v.sentence);
  return code && sentence ? { code, sentence } : undefined;
}

function visitOf(v: unknown): PhaseVisit | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !has(v, "lane", "run_id", "chat_id", "session_id", "participants", "since") || !Array.isArray(v.participants)) return undefined;
  const lane = text(v.lane);
  if (!lane) return undefined;
  return {
    lane,
    run_id: text(v.run_id),
    chat_id: text(v.chat_id),
    session_id: text(v.session_id),
    participants: v.participants.filter((p): p is string => typeof p === "string"),
    since: text(v.since),
  };
}

function workOf(v: unknown): PhaseWork | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !has(v, "kind", "run_id", "since")) return undefined;
  const kind = text(v.kind);
  return kind ? { kind, run_id: text(v.run_id), since: text(v.since) } : undefined;
}

function sleepOf(v: unknown): PhaseSleep | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !has(v, "kind", "reason", "since", "ends")) return undefined;
  const kind = text(v.kind);
  return kind ? { kind, reason: text(v.reason), since: text(v.since), ends: text(v.ends) } : undefined;
}

/** The served bar, or null when the body lacks a field the contract always sends (an older
 * life_state: `phase` without `rev`, toggles, stopped, sentence…). */
export function parsePhaseBar(body: unknown): PhaseBar | null {
  if (!isObj(body)) return null;
  if (!has(body, "rev", "phase", "stopped", "toggles", "since", "sentence", "next", "blocked", "visit", "work", "sleep")) return null;
  const { rev, phase, stopped, toggles } = body;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 1) return null;
  if (typeof phase !== "string" || !(SERVED_PHASES as readonly string[]).includes(phase)) return null;
  if (typeof stopped !== "boolean") return null;
  if (!isObj(toggles) || typeof toggles.work !== "boolean" || typeof toggles.personal !== "boolean") return null;
  const sentence = text(body.sentence);
  if (!sentence) return null;
  if (body.since !== null && typeof body.since !== "string") return null;
  const next = nextOf(body.next);
  const blocked = blockedOf(body.blocked);
  const visit = visitOf(body.visit);
  const work = workOf(body.work);
  const sleep = sleepOf(body.sleep);
  if (next === undefined || blocked === undefined || visit === undefined || work === undefined || sleep === undefined) return null;
  return {
    rev,
    phase: phase as ServedPhase,
    stopped,
    toggles: { work: toggles.work, personal: toggles.personal },
    since: text(body.since),
    sentence,
    next,
    blocked,
    visit,
    work,
    sleep,
  };
}

/** The §5 marker's payload: what the app renders at once (the rest comes with a re-read). */
export interface PhaseMarker {
  rev: number;
  phase: ServedPhase;
  stopped: boolean;
  toggles: PhaseToggles;
  since: string | null;
  sentence: string;
}

export function parsePhaseMarker(payload: unknown): PhaseMarker | null {
  if (!isObj(payload) || payload.kind !== "phase_changed") return null;
  const { rev, phase, stopped, toggles } = payload;
  if (typeof rev !== "number" || !Number.isInteger(rev) || rev < 1) return null;
  if (typeof phase !== "string" || !(SERVED_PHASES as readonly string[]).includes(phase)) return null;
  if (typeof stopped !== "boolean" || !isObj(toggles) || typeof toggles.work !== "boolean" || typeof toggles.personal !== "boolean") return null;
  const sentence = text(payload.sentence);
  if (!sentence) return null;
  return { rev, phase: phase as ServedPhase, stopped, toggles: { work: toggles.work, personal: toggles.personal }, since: text(payload.since), sentence };
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

/** The PUT body for one toggle change: only the toggle that moved (§2: at least one key, no other
 * key, strict booleans). */
export function toggleBody(key: keyof PhaseToggles, on: boolean): Record<string, boolean> {
  return key === "work" ? { work: on } : { personal: on };
}

/** The POST body for the kill switch (§3). */
export function lifecycleBody(action: "stop" | "resume"): { action: "stop" | "resume" } {
  return { action };
}

/** The POST body for the operator's "sleep now": the existing operator sleep with its maintenance
 * pass (§4: with `dream: true` he wakes when the pass returns). */
export function sleepNowBody(): { state: "asleep"; reason: string; dream: true } {
  return { state: "asleep", reason: "sleep now, by the operator", dream: true };
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

export function postLifecycle(baseUrl: string, entity: string, action: "stop" | "resume", token: string | null, fetchImpl: PhaseFetch = fetch): Promise<PhaseWire> {
  return write(baseUrl, entityPath(entity, "lifecycle"), "POST", lifecycleBody(action), token, fetchImpl);
}

/** §O7: the pass runs inside this request, so it can take long; the caller does not wait on it for
 * the bar (the stream shows the sleep, then the wake). */
export function postSleepNow(baseUrl: string, entity: string, token: string | null, fetchImpl: PhaseFetch = fetch): Promise<PhaseWire> {
  return write(baseUrl, entityPath(entity, "state"), "POST", sleepNowBody(), token, fetchImpl);
}
