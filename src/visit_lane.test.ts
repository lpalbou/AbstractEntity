/**
 * The durable-visit transport half (design v4 §5 consumer contract).
 *
 * The body-status rule is pinned here because it is the exact weak-assert
 * class that misled a night of forensics once (2026-07-11): the visit door
 * answers HTTP 200 with `status:"failed"` + `error` in the BODY — transport
 * success is never operation success.
 */
import { describe, expect, it } from "vitest";

import { isAsleepWakeRefusal, visitBodyProblem } from "./stream_source";

describe("visitBodyProblem (body-status rule)", () => {
  it("flags a failed body even though HTTP was 200", () => {
    expect(visitBodyProblem({ status: "failed", error: "the turn failed: LLM timeout" })).toBe(
      "the turn failed: LLM timeout",
    );
  });

  it("gives a failed body without error text a real sentence, never empty", () => {
    const problem = visitBodyProblem({ status: "failed" });
    expect(problem).toBeTruthy();
    expect(problem).toMatch(/failed/);
  });

  it("flags cancelled runs", () => {
    expect(visitBodyProblem({ status: "cancelled" })).toMatch(/cancelled/);
  });

  it("treats waiting (parked) and running as healthy", () => {
    expect(visitBodyProblem({ status: "waiting" })).toBeNull();
    expect(visitBodyProblem({ status: "running" })).toBeNull();
  });

  it("treats completed as healthy (close outcome; turn racing a timed-out close)", () => {
    expect(visitBodyProblem({ status: "completed" })).toBeNull();
  });

  it("refuses a missing body loudly", () => {
    expect(visitBodyProblem(null)).toBeTruthy();
    expect(visitBodyProblem(undefined)).toBeTruthy();
  });
});

describe("isAsleepWakeRefusal (B1 dormant-belt matcher)", () => {
  it("matches the door's asleep refusal sentence (pre-auto-wake gateways)", () => {
    expect(
      isAsleepWakeRefusal("entity:hypnos is asleep (operator put him to sleep) — wake him before starting his own time"),
    ).toBe(true);
    expect(isAsleepWakeRefusal("entity:castor is asleep (no reason recorded) — wake him first")).toBe(true);
  });

  it("stays OFF every other refusal class (two-signal rule)", () => {
    expect(isAsleepWakeRefusal("a visit is already open on entity:castor — one life, one summon")).toBe(false);
    expect(isAsleepWakeRefusal("entity:castor is paused (hard freeze): maintenance")).toBe(false);
    expect(isAsleepWakeRefusal("no substrate configured — set provider and model")).toBe(false);
    // "asleep" alone (e.g. a status echo) is not a wake instruction.
    expect(isAsleepWakeRefusal("state: asleep since 02:30")).toBe(false);
  });
});
