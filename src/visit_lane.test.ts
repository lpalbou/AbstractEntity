/**
 * The durable-visit transport half (design v4 §5 consumer contract).
 *
 * The body-status rule is pinned here because it is the exact weak-assert
 * class that misled a night of forensics once (2026-07-11): the visit door
 * answers HTTP 200 with `status:"failed"` + `error` in the BODY — transport
 * success is never operation success.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openVisit, visitBodyProblem } from "./stream_source";

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

describe("a visit open never writes his state (the door returns him to his previous state at close)", () => {
  const drawer = readFileSync(new URL("./chat_drawer.tsx", import.meta.url), "utf8");
  afterEach(() => vi.unstubAllGlobals());

  it("the drawer opens through the visit door and has no state-awake call, not even on an asleep refusal", () => {
    expect(drawer).toContain("openVisit(baseUrl, entity, token, undefined, avatarMode)");
    expect(drawer).not.toMatch(/postEntityState|isAsleepWakeRefusal/);
    expect(drawer).not.toMatch(/\/state[`"'?]/);
    expect(drawer).not.toMatch(/["'`]awake["'`]/);
  });

  it("an asleep refusal from the door is one request to visit/open, never a second one to the state route", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ detail: "entity:castor is asleep — wake him first" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(openVisit("http://gw.test/", "castor", "tok")).rejects.toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/\/entities\/castor\/visit\/open$/);
  });
});
