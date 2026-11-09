/**
 * B2 (laurent 04:58, hypnos), carried to the phase bar (2026-11-08): a refused act speaks its
 * reason as a sentence and adopts the real state the refusal carries, never JSON armor, never a
 * silent no-op. The old /loop/* refusal parser and the own-time push button it served are gone
 * with the routes (CONTRACT-phases §6); the new routes keep the same refusal shape, v2:
 * {code, detail: {reason_code, message, life_state}} + X-Gateway-Error-Code (§7).
 */
import { describe, expect, it } from "vitest";

import { phaseBody } from "./fixtures/phase_bodies";
import { ADMIN_REQUIRED, REFUSAL_SENTENCES, phaseBarRead, phaseWriteOutcome } from "./phase_bar";
import { PHASE_BAR_UNSERVED, type PhaseWire } from "./phase_bar_source";

const refusal = (status: number, reason_code: string | null, message: string | null, life_state: unknown = null): PhaseWire => ({
  status,
  code: reason_code,
  body: { ...(reason_code ? { code: reason_code } : {}), detail: { ...(reason_code ? { reason_code } : {}), ...(message ? { message } : {}), life_state } },
});

describe("phase refusals are sentences (contract §7)", () => {
  it("a toggle while stopped: the gateway's message, and the bar it carries is adopted", () => {
    const out = phaseWriteOutcome(refusal(409, "stopped_use_resume", "Stopped. Resume him first, then choose what he may do.", phaseBody("stopped")));
    expect(out.ok).toBe(false);
    expect(out.sentence).toBe("Stopped. Resume him first, then choose what he may do.");
    expect(out.bar?.phase).toBe("stopped");
    expect(out.bar?.rev).toBe(47);
  });

  it("a code without words gets the contract's sentence for it", () => {
    for (const [code, sentence] of Object.entries(REFUSAL_SENTENCES)) {
      expect(phaseWriteOutcome(refusal(409, code, null)).sentence).toBe(sentence);
    }
    expect(phaseWriteOutcome(refusal(409, "already_asleep", null)).sentence).toBe("He is already resting; a sleep cannot follow a sleep.");
  });

  it("sleep now during a visit: the gateway's in_visit sentence, and its bar adopted", () => {
    const out = phaseWriteOutcome(refusal(409, "in_visit", "He is in a visit; end it to let him sleep.", phaseBody("visit")));
    expect(out.sentence).toBe("He is in a visit; end it to let him sleep.");
    expect(out.bar?.phase).toBe("visit");
  });

  it("the visit doors' {detail: string, code} shape reads too", () => {
    const out = phaseWriteOutcome({ status: 409, code: "stopped_use_resume", body: { detail: "Stopped. Resume to visit.", code: "stopped_use_resume" } });
    expect(out.sentence).toBe("Stopped. Resume to visit.");
    expect(out.bar).toBeNull();
  });

  it("admin_required never shows its machine words", () => {
    const out = phaseWriteOutcome({ status: 403, code: "admin_required", body: { detail: "Admin principal required", reason_code: "admin_required" } });
    expect(out.sentence).toBe(ADMIN_REQUIRED);
    expect(out.sentence).not.toMatch(/principal/i);
  });

  it("401 asks for a sign-in; a 404 without a code is a missing route (the unserved sentence), with a code it is the entity", () => {
    expect(phaseWriteOutcome({ status: 401, code: null, body: null }).sentence).toMatch(/^Sign in again/);
    expect(phaseWriteOutcome({ status: 404, code: null, body: { detail: "Not Found" } }).sentence).toBe(PHASE_BAR_UNSERVED);
    // 404 entity_not_found carries life_state null: nothing to adopt.
    const gone = phaseWriteOutcome(refusal(404, "entity_not_found", "There is no entity named castor."));
    expect(gone.sentence).toBe("There is no entity named castor.");
    expect(gone.bar).toBeNull();
  });

  it("anything else says the status, never a blank", () => {
    expect(phaseWriteOutcome({ status: 500, code: null, body: null }).sentence).toBe("The gateway refused (HTTP 500).");
  });
});

describe("a write that succeeded says what happens next, or which stop step failed", () => {
  it("personal on during a visit: the answer's next sentence", () => {
    const out = phaseWriteOutcome({ status: 200, code: null, body: { ...phaseBody("visit"), changed: { work: null, personal: { from: false, to: true } } } });
    expect(out.ok).toBe(true);
    expect(out.bar?.phase).toBe("visit");
    expect(out.sentence).toBe("When the visit closes, his own time resumes.");
  });

  const item = (item: string, outcome: string, extra: Record<string, unknown> = {}) => ({ item, id: null, outcome, code: null, sentence: null, ...extra });
  it("a stop with an item that failed names it and says it is incomplete (Stop again retries); a clean stop says nothing (the banner does)", () => {
    const failed = phaseWriteOutcome({
      status: 200,
      code: null,
      body: {
        ...phaseBody("stopped"),
        action: "stop",
        already: false,
        complete: false,
        items: [item("run", "cancelled"), item("visit", "failed", { code: "visit_close_failed", sentence: "The visit could not be closed yet; press Stop again to retry." }), item("loop", "killed_sigterm")],
      },
    });
    expect(failed.sentence).toBe("The visit could not be closed yet; press Stop again to retry.");
    expect(failed.incomplete).toBe(true);
    // A failed item without words still says something.
    const bare = phaseWriteOutcome({ status: 200, code: null, body: { ...phaseBody("stopped"), complete: false, items: [item("loop", "failed", { code: "loop_still_alive" })] } });
    expect(bare.sentence).toBe("One part of the stop did not finish (loop_still_alive).");
    const clean = phaseWriteOutcome({ status: 200, code: null, body: { ...phaseBody("stopped"), action: "stop", already: false, complete: true, items: [item("run", "cancelled"), item("chat", "not_open")] } });
    expect(clean.sentence).toBeNull();
    expect(clean.incomplete).toBe(false);
    expect(clean.bar?.stopped).toBe(true);
  });
});

describe("the read itself (GET life_state)", () => {
  it("an older life_state (no rev, no toggles) is unserved; 404/405 too; a failure says why", () => {
    expect(phaseBarRead({ status: 200, code: null, body: { phase: "sleep", posture: "resting", state: "awake", own_time_running: false } })).toEqual({ kind: "unserved" });
    expect(phaseBarRead({ status: 404, code: null, body: null })).toEqual({ kind: "unserved" });
    expect(phaseBarRead({ status: 405, code: null, body: null })).toEqual({ kind: "unserved" });
    expect(phaseBarRead({ status: 502, code: null, body: { detail: "upstream down" } })).toEqual({ kind: "failed", sentence: "Could not read his phase: upstream down" });
    expect(phaseBarRead({ status: 200, code: null, body: phaseBody("idle") })).toMatchObject({ kind: "served", bar: { phase: "idle", rev: 48 } });
  });
});
