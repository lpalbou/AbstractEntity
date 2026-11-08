/**
 * The phase bar's gateway seam (CONTRACT-phases v1): the exact routes, methods and bodies, the
 * strict parse (a field the contract always sends that is missing = unserved), the error code from
 * body or header, and the stream marker fold.
 */
import { describe, expect, it } from "vitest";

import { phaseBody } from "./fixtures/phase_bodies";
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

describe("request bodies (contract §2, §3, §6)", () => {
  it("a toggle PUT sends only the toggle that moved, a strict boolean", () => {
    expect(toggleBody("personal", false)).toEqual({ personal: false });
    expect(toggleBody("work", true)).toEqual({ work: true });
  });
  it("lifecycle sends the action alone", () => {
    expect(lifecycleBody("stop")).toEqual({ action: "stop" });
    expect(lifecycleBody("resume")).toEqual({ action: "resume" });
  });
  it("sleep now is the existing operator sleep with its maintenance pass", () => {
    expect(sleepNowBody()).toMatchObject({ state: "asleep", dream: true });
  });
});

describe("routes and methods", () => {
  it("GET life_state, PUT life_state/toggles, POST lifecycle, POST state — under the entity, nothing else", async () => {
    const r = recordingFetch();
    await getPhaseBar("http://gw", "castor", r.fetchImpl);
    await putPhaseToggle("http://gw", "castor", "personal", true, "tok", r.fetchImpl);
    await postLifecycle("http://gw", "castor", "stop", "tok", r.fetchImpl);
    await postLifecycle("http://gw", "castor", "resume", "tok", r.fetchImpl);
    await postSleepNow("http://gw", "castor", "tok", r.fetchImpl);
    expect(r.calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ["GET", "http://gw/api/gateway/entities/castor/life_state", undefined],
      ["PUT", "http://gw/api/gateway/entities/castor/life_state/toggles", { personal: true }],
      ["POST", "http://gw/api/gateway/entities/castor/lifecycle", { action: "stop" }],
      ["POST", "http://gw/api/gateway/entities/castor/lifecycle", { action: "resume" }],
      ["POST", "http://gw/api/gateway/entities/castor/state", sleepNowBody()],
    ]);
    // Writes carry JSON and the credential.
    expect(r.calls[1].headers["Content-Type"]).toBe("application/json");
    expect(r.calls[1].headers["Authorization"]).toBe("Bearer tok");
    // No old route is ever called.
    expect(r.calls.some((c) => /loop\/(start|stop)|personal-grant/.test(c.url))).toBe(false);
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
    expect((await mk({ detail: "Castor is stopped. Resume him to visit.", code: "entity_paused" })).code).toBe("entity_paused");
    expect((await mk({ detail: "x" }, { "X-Gateway-Error-Code": "work_off" })).code).toBe("work_off");
    expect((await mk({ detail: "x" })).code).toBeNull();
  });
  it("a body that is not JSON is null, never a throw", async () => {
    const wire = await phaseWireOf(new Response("<html>bad gateway</html>", { status: 502 }));
    expect(wire).toEqual({ status: 502, body: null, code: null });
  });
});

describe("parse: every field the contract always sends", () => {
  it("each §1.4 example parses", () => {
    for (const phase of ["visit", "work", "personal", "sleep", "stopped", "idle"] as const) {
      expect(parsePhaseBar(phaseBody(phase))?.phase).toBe(phase);
    }
    expect(parsePhaseBar(phaseBody("sleep"))?.sleep).toEqual({ kind: "operator", reason: "maintenance requested", since: "2026-11-08T18:02:00.000+00:00", ends: "when maintenance is done" });
  });
  it.each(["rev", "phase", "stopped", "toggles", "since", "sentence", "next", "blocked", "visit", "work", "sleep"])("a body without %s is unserved", (key) => {
    const body = phaseBody("idle");
    delete body[key];
    expect(parsePhaseBar(body)).toBeNull();
  });
  it("wrong values are unserved too (never guessed)", () => {
    expect(parsePhaseBar(phaseBody("idle", { phase: "resting" }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { rev: 0 }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { toggles: { work: true } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { toggles: { work: "true", personal: false } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { sentence: "" }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { stopped: "no" }))).toBeNull();
    expect(parsePhaseBar(phaseBody("idle", { next: { phase: "idle" } }))).toBeNull();
    expect(parsePhaseBar(phaseBody("visit", { visit: { lane: "visit" } }))).toBeNull();
  });
  it("today's life_state (before the contract) is unserved", () => {
    expect(parsePhaseBar({ phase: "sleep", posture: "resting", chat_open: false, state: "awake", own_time_running: false })).toBeNull();
  });
});

describe("the stream marker (contract §5)", () => {
  const env = (seq: number, payload: unknown, family = "host"): ReplayEnvelope =>
    ({ stream: "abstractmemory.replay", stream_version: 1, seq, family, observed_at: "", scope: "", owner_id: "castor", trace_id: null, turn_id: null, run_id: null, payload, display: {} }) as unknown as ReplayEnvelope;
  const marker = (rev: number, phase = "idle") => ({ kind: "phase_changed", name: "castor", from: "personal", to: phase, phase, toggles: { work: true, personal: false }, stopped: false, since: null, rev, cause: "toggle", sentence: "Awake and reachable." });
  it("only host phase_changed payloads with the fields count", () => {
    expect(parsePhaseMarker(marker(3))?.rev).toBe(3);
    expect(parsePhaseMarker({ ...marker(3), kind: "wake" })).toBeNull();
    expect(parsePhaseMarker({ ...marker(3), rev: undefined })).toBeNull();
    expect(parsePhaseMarker({ ...marker(3), phase: "asleep" })).toBeNull();
  });
  it("the highest rev wins, not the last one; other families are ignored; the fold is incremental", () => {
    const envs = [env(1, marker(5)), env(2, marker(9, "personal")), env(3, marker(7)), env(4, marker(12), "event")];
    expect(highestPhaseMarker(envs)?.rev).toBe(9);
    const first = highestPhaseMarker(envs.slice(0, 2));
    expect(highestPhaseMarker([...envs, env(5, marker(10))], 2, first)?.rev).toBe(10);
    expect(highestPhaseMarker([])).toBeNull();
  });
});
