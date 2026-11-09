/**
 * The phase bar's gateway seam (CONTRACT-phases v2 + v3 deltas): the exact routes, methods and
 * bodies (the toggle PUT never carries `work`), the strict parse (a field the contract always sends
 * that is missing = unserved; v2's work sub-object is not the v3 queue), the error code from body
 * or header, and the stream marker fold.
 */
import { describe, expect, it } from "vitest";

import { CAN_ALL, phaseBody } from "./fixtures/phase_bodies";
import {
  getPhaseBar,
  highestPhaseMarker,
  lifecycleBody,
  parsePhaseBar,
  parsePhaseMarker,
  phaseWireOf,
  postLifecycle,
  postSleepNow,
  putPhaseToggle,
  sleepNowBody,
  toggleBody,
  type PhaseFetch,
} from "./phase_bar_source";
import type { ReplayEnvelope } from "./stream_types";

function recordingFetch(status = 200, body: unknown = phaseBody("idle"), headers: Record<string, string> = {}) {
  const calls: Array<{ url: string; method: string; body: unknown; headers: Record<string, string> }> = [];
  const fetchImpl: PhaseFetch = async (url, init) => {
    calls.push({ url, method: String(init.method ?? "GET"), body: init.body ? JSON.parse(String(init.body)) : undefined, headers: (init.headers ?? {}) as Record<string, string> });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  };
  return { calls, fetchImpl };
}

describe("request bodies (contract §2, §3, §8.5)", () => {
  it("the toggle PUT sends {personal} alone, a strict boolean — never work (v3 D1: 422 unknown_field)", () => {
    expect(toggleBody("personal", false)).toEqual({ personal: false });
    expect(toggleBody("personal", true)).toEqual({ personal: true });
    expect(Object.keys(toggleBody("personal", true))).toEqual(["personal"]);
  });
  it("lifecycle sends the action alone: stop, resume or retry", () => {
    expect(lifecycleBody("stop")).toEqual({ action: "stop" });
    expect(lifecycleBody("resume")).toEqual({ action: "resume" });
    expect(lifecycleBody("retry")).toEqual({ action: "retry" });
  });
  it("sleep now is the operator sleep with its maintenance pass, exactly §8.5's body", () => {
    expect(sleepNowBody()).toEqual({ state: "sleep", dream: true });
  });
});

describe("routes and methods", () => {
  it("GET life_state, PUT life_state/toggles, POST lifecycle, POST state — under the entity, nothing else", async () => {
    const r = recordingFetch();
    await getPhaseBar("http://gw", "castor", r.fetchImpl);
    await putPhaseToggle("http://gw", "castor", "personal", true, "tok", r.fetchImpl);
    await postLifecycle("http://gw", "castor", "stop", "tok", r.fetchImpl);
    await postLifecycle("http://gw", "castor", "resume", "tok", r.fetchImpl);
    await postLifecycle("http://gw", "castor", "retry", "tok", r.fetchImpl);
    await postSleepNow("http://gw", "castor", "tok", r.fetchImpl);
    expect(r.calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ["GET", "http://gw/api/gateway/entities/castor/life_state", undefined],
      ["PUT", "http://gw/api/gateway/entities/castor/life_state/toggles", { personal: true }],
      ["POST", "http://gw/api/gateway/entities/castor/lifecycle", { action: "stop" }],
      ["POST", "http://gw/api/gateway/entities/castor/lifecycle", { action: "resume" }],
      ["POST", "http://gw/api/gateway/entities/castor/lifecycle", { action: "retry" }],
      ["POST", "http://gw/api/gateway/entities/castor/state", { state: "sleep", dream: true }],
    ]);
    // Writes carry JSON and the credential.
    expect(r.calls[1].headers["Content-Type"]).toBe("application/json");
    expect(r.calls[1].headers["Authorization"]).toBe("Bearer tok");
    // No old route is ever called, and no body names work.
    expect(r.calls.some((c) => /loop\/(start|stop)|personal-grant/.test(c.url))).toBe(false);
    expect(r.calls.some((c) => c.body && typeof c.body === "object" && "work" in (c.body as object))).toBe(false);
  });
  it("the entity name is path-encoded", async () => {
    const r = recordingFetch();
    await getPhaseBar("http://gw/", "a b", r.fetchImpl);
    expect(r.calls[0].url).toBe("http://gw/api/gateway/entities/a%20b/life_state");
  });
});

describe("the error code: detail.reason_code, then the body's, then the header", () => {
  it("reads each place", async () => {
    const mk = (body: unknown, headers: Record<string, string> = {}) => phaseWireOf(new Response(JSON.stringify(body), { status: 409, headers }));
    expect((await mk({ detail: { reason_code: "stopped_use_resume", message: "x" } })).code).toBe("stopped_use_resume");
    expect((await mk({ detail: "Admin principal required", reason_code: "admin_required" })).code).toBe("admin_required");
    expect((await mk({ detail: "Stopped. Resume to visit.", code: "stopped_use_resume" })).code).toBe("stopped_use_resume");
    expect((await mk({ code: "in_visit", detail: { reason_code: "in_visit", message: "He is in a visit; end it to let him sleep.", life_state: null } })).code).toBe("in_visit");
    expect((await mk({ detail: "x" }, { "X-Gateway-Error-Code": "unknown_field" })).code).toBe("unknown_field");
    expect((await mk({ detail: "x" })).code).toBeNull();
  });
  it("a body that is not JSON is null, never a throw", async () => {
    const wire = await phaseWireOf(new Response("<html>bad gateway</html>", { status: 502 }));
    expect(wire).toEqual({ status: 502, body: null, code: null });
  });
});

describe("parse: every field the contract always sends", () => {
  it("each §1.6 example parses (v3 shapes), with can, generation, waiting_for, the job queue and blocked.action", () => {
    for (const phase of ["visit", "work", "personal", "sleep", "stopped", "idle"] as const) {
      expect(parsePhaseBar(phaseBody(phase))?.phase).toBe(phase);
    }
    expect(parsePhaseBar(phaseBody("sleep"))?.sleep).toEqual({ kind: "operator", reason: "maintenance requested", since: "2026-11-08T18:02:00.000+00:00", ends: "when maintenance is done" });
    expect(parsePhaseBar(phaseBody("stopped"))).toMatchObject({ generation: 8, can: { visit: { allowed: false, sentence: "Stopped. Resume to visit." } } });
    expect(parsePhaseBar(phaseBody("visit"))?.visit?.waiting_for).toBeNull();
    expect(parsePhaseBar(phaseBody("visit", { visit: { ...(phaseBody("visit").visit as object), waiting_for: "maintenance" } }))?.visit?.waiting_for).toBe("maintenance");
    expect(parsePhaseBar(phaseBody("work"))?.work).toEqual({ jobs_queued: 2, current: { kind: "summon", run_id: "run_a11", since: "2026-11-08T18:20:00.000+00:00" } });
    expect(parsePhaseBar(phaseBody("idle"))?.work).toEqual({ jobs_queued: 0, current: null });
    expect(parsePhaseBar(phaseBody("idle"))?.toggles).toEqual({ personal: false });
    expect(Object.keys(parsePhaseBar(phaseBody("idle"))!.can).sort()).toEqual(["sleep_now", "toggle_personal", "visit"]);
    const crashed = parsePhaseBar(phaseBody("idle", { blocked: { code: "loop_crashed", sentence: "His own time stopped unexpectedly. Retry to start it again.", action: "retry" } }));
    expect(crashed?.blocked).toEqual({ code: "loop_crashed", sentence: "His own time stopped unexpectedly. Retry to start it again.", action: "retry" });
  });
  it.each(["rev", "generation", "phase", "stopped", "toggles", "since", "sentence", "next", "blocked", "can", "visit", "work", "sleep"])("a body without %s is unserved", (key) => {
    const body = phaseBody("idle");
    delete body[key];
    expect(parsePhaseBar(body)).toBeNull();
  });
  it("wrong values are unserved too (never guessed)", () => {
    expect(parsePhaseBar(phaseBody("idle", { phase: "resting" }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { rev: 0 }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { toggles: {} }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { toggles: { personal: "false" } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { sentence: "" }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { stopped: "no" }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { next: { phase: "idle" } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("visit", { visit: { lane: "visit" } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { generation: -1 }))).toBeNull();
    // can: three entries (v3: no toggle_work), strict booleans; a refusal always says why.
    expect(parsePhaseBar(phaseBody("idle", { can: { ...CAN_ALL, toggle_personal: undefined } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { can: { ...CAN_ALL, visit: { allowed: "yes", sentence: null } } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { can: { ...CAN_ALL, sleep_now: { allowed: false, sentence: null } } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { can: { ...CAN_ALL, sleep_now: { allowed: false } } }))).toBeNull();
    // v2 sub-object fields are always there.
    const { waiting_for: _w, ...visitV1 } = phaseBody("visit").visit as Record<string, unknown>;
    expect(parsePhaseBar(phaseBody("visit", { visit: visitV1 }))).toBeNull();
    expect(parsePhaseBar(phaseBody("visit", { visit: { ...(phaseBody("visit").visit as object), waiting_for: "lunch" } }))).toBeNull();
    // v3 D1: work is the job queue, always an object; a count is a whole number ≥ 0; a job has its three fields.
    expect(parsePhaseBar(phaseBody("idle", { work: null }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { work: { jobs_queued: 0 } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { work: { jobs_queued: -1, current: null } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { work: { jobs_queued: 1.5, current: null } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("work", { work: { jobs_queued: 1, current: { kind: "summon", run_id: null } } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("work", { work: { jobs_queued: 1, current: { kind: "", run_id: null, since: null } } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { blocked: { code: "loop_crashed", sentence: "x" } }))).toBeNull();
  });
  it("today's life_state (before the contract) is unserved", () => {
    expect(parsePhaseBar({ phase: "sleep", posture: "resting", chat_open: false, state: "awake", own_time_running: false })).toBeNull();
  });
  it("a v2 body (the work toggle and finishing, no job queue) is unserved: the app has no fallback", () => {
    const v2 = phaseBody("work", {
      toggles: { work: false, personal: false },
      can: { ...CAN_ALL, toggle_work: { allowed: true, sentence: null } },
      work: { kind: "summon", run_id: "run_a11", since: "2026-11-08T18:20:00.000+00:00", finishing: true },
    });
    expect(parsePhaseBar(v2)).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { work: null }))).toBeNull();
  });
  it("a v1 body (rev, but no can and no generation) is unserved: the app has no fallback (contract v2 §8.1)", () => {
    const v1 = phaseBody("personal");
    delete v1.can;
    delete v1.generation;
    expect(parsePhaseBar(v1)).toBeNull();
  });
});

describe("the stream marker (contract §5)", () => {
  const env = (seq: number, payload: unknown, family = "host"): ReplayEnvelope =>
    ({ stream: "abstractmemory.replay", stream_version: 1, seq, family, observed_at: "", scope: "", owner_id: "castor", trace_id: null, turn_id: null, run_id: null, payload, display: {} }) as unknown as ReplayEnvelope;
  const marker = (rev: number, phase = "idle") => ({ kind: "phase_changed", name: "castor", from: "personal", to: phase, phase, toggles: { personal: false }, stopped: false, since: null, rev, generation: 2, cause: "toggle", sentence: "Awake and reachable." });
  it("only host phase_changed payloads with the fields count", () => {
    expect(parsePhaseMarker(marker(3))).toMatchObject({ rev: 3, generation: 2 });
    expect(parsePhaseMarker({ ...marker(3), generation: undefined })).toBeNull();
    expect(parsePhaseMarker({ ...marker(3), kind: "wake" })).toBeNull();
    expect(parsePhaseMarker({ ...marker(3), rev: undefined })).toBeNull();
    expect(parsePhaseMarker({ ...marker(3), phase: "asleep" })).toBeNull();
    expect(parsePhaseMarker({ ...marker(3), toggles: {} })).toBeNull();
    expect(parsePhaseMarker(marker(3))?.toggles).toEqual({ personal: false });
  });
  it("the highest rev wins, not the last one; other families are ignored; the fold is incremental", () => {
    const envs = [env(1, marker(5)), env(2, marker(9, "personal")), env(3, marker(7)), env(4, marker(12), "event")];
    expect(highestPhaseMarker(envs)?.rev).toBe(9);
    const first = highestPhaseMarker(envs.slice(0, 2));
    expect(highestPhaseMarker([...envs, env(5, marker(10))], 2, first)?.rev).toBe(10);
    expect(highestPhaseMarker([])).toBeNull();
  });
});
