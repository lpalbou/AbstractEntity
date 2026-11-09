/**
 * Host-marker render contracts (gateway c746 confirmation of observer's
 * c745 proposals): the payload keys below are the AGREED wire shapes —
 * gateway writes them the day the N4 gate + own_time grant land; these
 * pins keep the render half honest against the confirmed contract, so a
 * key rename on either side fails a test instead of silently falling to
 * the generic "Host: <kind>" line.
 */

import { describe, expect, it } from "vitest";

import { ledgerLine } from "./ledger_lines";
import type { ReplayEnvelope } from "./stream_types";

function hostEnv(seq: number, payload: Record<string, unknown>): ReplayEnvelope {
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family: "host",
    observed_at: "2026-07-11T18:00:00+00:00",
    scope: "life",
    owner_id: "entity:test",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload,
    display: null,
  } as unknown as ReplayEnvelope;
}

describe("deposit_refused (N4 render leg, R5 — c746 contract)", () => {
  it("renders the sleep phase-gate refusal loud with the door's sentence verbatim", () => {
    const line = ledgerLine(
      hostEnv(1, {
        kind: "deposit_refused",
        phase: "sleep",
        effect_type: "MEMORY_FORM",
        refused_by: "phase_gate",
        record_kind: "episode",
        scope: "self",
        reason: "sleep deposits nothing (N4)",
      }),
    );
    expect(line.title).toBe("⛔ A sleep-phase deposit was refused");
    expect(line.detail).toContain("MEMORY_FORM");
    expect(line.detail).toContain("into self");
    expect(line.detail).toContain("sleep deposits nothing (N4)");
  });

  it("MEMORY_ACCESS is the enum member for the commit-selection refusal (c746 amendment)", () => {
    const line = ledgerLine(
      hostEnv(2, {
        kind: "deposit_refused",
        phase: "sleep",
        effect_type: "MEMORY_ACCESS",
        refused_by: "phase_gate",
        reason: "commit is the strengthening path",
      }),
    );
    expect(line.detail).toContain("MEMORY_ACCESS");
  });

  it("a non-phase-gate refusal renders without claiming the sleep class", () => {
    const line = ledgerLine(
      hostEnv(3, { kind: "deposit_refused", effect_type: "MEMORY_FORM", reason: "not a workplace act" }),
    );
    expect(line.title).toBe("⛔ A deposit was refused");
  });
});

describe("personal-time grant lifecycle (c746 contract, ruled vocabulary c794/c798)", () => {
  it("granted renders as ARM, never start (an armed grant permits, never starts)", () => {
    const line = ledgerLine(
      hostEnv(4, {
        kind: "personal_granted",
        mode: "timer",
        expires_at: "2026-07-11T19:00:00+00:00",
        granted_by: "person:laurent",
      }),
    );
    expect(line.title).toBe("Personal time armed");
    expect(line.detail).toContain("armed, not started");
    expect(line.detail).toContain("person:laurent");
    expect(line.detail).toContain("timer until 2026-07-11T19:00:00+00:00");
  });

  it("until_revoked mode says so (revoke, not retract — c794: retract is spent in the identity lane)", () => {
    const line = ledgerLine(hostEnv(5, { kind: "personal_granted", mode: "until_revoked", granted_by: "person:laurent" }));
    expect(line.detail).toContain("until revoked");
  });

  it("a backstop expiry is LOUD — it means the gateway was not there (c746)", () => {
    const line = ledgerLine(
      hostEnv(6, { kind: "personal_grant_expired", expired_at: "2026-07-11T19:00:05+00:00", enforced_by: "wall_clock_backstop" }),
    );
    expect(line.title).toContain("backstop");
    expect(line.title).toContain("⛔");
    expect(line.detail).toContain("the gateway was not there");
  });

  it("a poll expiry renders calm", () => {
    const line = ledgerLine(hostEnv(7, { kind: "personal_grant_expired", expired_at: "2026-07-11T19:00:05+00:00", enforced_by: "poll" }));
    expect(line.title).toBe("Personal-time grant expired");
    expect(line.detail).toContain("tick poll");
  });

  it("revoked names who withdrew it", () => {
    const line = ledgerLine(hostEnv(8, { kind: "personal_grant_revoked", revoked_by: "person:laurent" }));
    expect(line.title).toBe("Personal-time grant revoked");
    expect(line.detail).toContain("person:laurent");
  });

  it("the DEAD pre-ruling kinds render as generic host lines, never aliased (zero envelopes ever carried them)", () => {
    expect(ledgerLine(hostEnv(20, { kind: "own_time_granted", mode: "timer" })).title).toBe("Host: own_time_granted");
    expect(ledgerLine(hostEnv(21, { kind: "own_time_grant_retracted" })).title).toBe("Host: own_time_grant_retracted");
  });

  it("loop-lifecycle kinds render under BOTH spellings (historical streams carry own_time_*)", () => {
    expect(ledgerLine(hostEnv(22, { kind: "own_time_started" })).title).toBe("His own time began");
    expect(ledgerLine(hostEnv(23, { kind: "personal_started" })).title).toBe("His own time began");
  });
});

describe("prompt_overlay_changed (marker-first prompt edits, word-free)", () => {
  it("names rewritten and reverted layers without any prompt words", () => {
    const line = ledgerLine(
      hostEnv(9, {
        kind: "prompt_overlay_changed",
        channel: "operator",
        layers: { conversation: "ab12cd34", operator: "ef56ab78" },
        reverted: ["visit"],
      }),
    );
    expect(line.title).toBe("✍️ Standing instructions changed");
    expect(line.detail).toContain("conversation");
    expect(line.detail).toContain("operator");
    expect(line.detail).toContain("reverted to default: visit");
    // Word-free invariant: hashes never render as content, and no layer
    // TEXT exists in the payload to leak in the first place.
    expect(line.detail).not.toContain("ab12cd34");
  });
});

describe("unknown host kinds stay honest", () => {
  it("falls to the generic line instead of guessing", () => {
    const line = ledgerLine(hostEnv(10, { kind: "some_future_marker", reason: "new thing" }));
    expect(line.title).toBe("Host: some_future_marker");
  });
});

describe("malformed payloads never fabricate claims (adversary pins)", () => {
  it("missing mode renders 'mode unrecorded', never the strongest 'until revoked' claim", () => {
    const line = ledgerLine(hostEnv(11, { kind: "personal_granted", granted_by: "person:laurent" }));
    expect(line.detail).toContain("mode unrecorded");
    expect(line.detail).not.toContain("until revoked");
  });

  it("missing enforced_by renders 'enforcement unrecorded', never the calm poll claim", () => {
    const line = ledgerLine(hostEnv(12, { kind: "personal_grant_expired", expired_at: "2026-07-11T19:00:05+00:00" }));
    expect(line.detail).toContain("enforcement unrecorded");
    expect(line.detail).not.toContain("tick poll");
    expect(line.title).not.toContain("backstop");
  });

  it("layers as an ARRAY never renders indices as layer names", () => {
    const line = ledgerLine(hostEnv(13, { kind: "prompt_overlay_changed", layers: ["conversation", "visit"] }));
    expect(line.detail).not.toContain("rewrote: 0");
    expect(line.detail).toBe("the operator changed the prompt overlay");
  });

  it("phase_gate without a named phase never claims the sleep class", () => {
    const line = ledgerLine(hostEnv(14, { kind: "deposit_refused", refused_by: "phase_gate", effect_type: "MEMORY_FORM" }));
    expect(line.title).toBe("⛔ A phase-gated deposit was refused");
    expect(line.title).not.toContain("sleep");
  });

  it("deposit_refused reason is kept whole (never truncated; the row clamps in CSS)", () => {
    const long = "x".repeat(200);
    const line = ledgerLine(hostEnv(15, { kind: "deposit_refused", effect_type: "MEMORY_FORM", reason: long }));
    expect(line.detail).not.toContain("…");
    expect(line.detail.length).toBeGreaterThan(160);
  });

  it("record_kind renders when present (contract completeness)", () => {
    const line = ledgerLine(
      hostEnv(16, { kind: "deposit_refused", refused_by: "phase_gate", phase: "sleep", effect_type: "MEMORY_FORM", record_kind: "episode", scope: "self" }),
    );
    expect(line.detail).toContain("(episode)");
  });

  it("night_voice renders the narration with the SELF-LABEL visible and the dream as its subject (memory ruling c3745)", () => {
    const line = ledgerLine(
      hostEnv(17, {
        kind: "night_voice",
        dream_record_id: "ex:dream-0791d2e6",
        narration: "The night also moved: four cards taking shape, one tension still warm.",
        self_label: "dreamed, not lived",
      }),
    );
    expect(line.title).toContain("dreamed, not lived");
    expect(line.detail).toContain("four cards taking shape");
    expect(line.subject_id).toBe("ex:dream-0791d2e6");
    // Absent narration renders an honest placeholder, never a blank line.
    const bare = ledgerLine(hostEnv(18, { kind: "night_voice" }));
    expect(bare.detail).toContain("narration was spoken");
    expect(bare.subject_id).toBeNull();
  });
});

describe("phase_changed (the gateway's marker, entity_phase._announce; the runtime loop's, life.append_phase_changed)", () => {
  // The live shape (castor seq 102207.0002, operator test 2026-11-09): from/to/cause, no old/new.
  const SERVED = { kind: "phase_changed", name: "castor", from: "visit", to: "sleep", phase: "sleep", toggles: { personal: false }, stopped: false, rev: 11, generation: 0, cause: "visit_closed", sentence: "Asleep until you wake him." };

  it("names the transition by the served from/to and its cause", () => {
    const line = ledgerLine(hostEnv(30, SERVED));
    expect(line.title).toBe("⭢ Phase: visit → sleep");
    expect(line.detail).toBe("cause: visit_closed");
    expect(line.tone).toBe("session");
    expect(line.subject_id).toBeNull();
  });

  it("idle and stopped are states with their own words, never a non-phase word", () => {
    expect(ledgerLine(hostEnv(31, { ...SERVED, from: "sleep", to: "idle", phase: "idle", cause: "maintenance_done" })).title).toBe("⭢ Phase: sleep → idle");
    expect(ledgerLine(hostEnv(32, { ...SERVED, from: "idle", to: "stopped", phase: "stopped", stopped: true, cause: "operator_stop" })).title).toBe("⭢ Phase: idle → stopped");
    expect(ledgerLine(hostEnv(33, { ...SERVED, from: "stopped", to: "idle", cause: "operator_resume" })).title).toBe("⭢ Phase: stopped → idle");
    for (const w of ["visit", "idle", "work", "personal", "sleep", "stopped"]) {
      expect(ledgerLine(hostEnv(34, { ...SERVED, from: w, to: w })).title).not.toContain("non-phase word");
    }
  });

  it("the contract is from/to: the v1 keys old/new are not read, and nothing reads \"?\"", () => {
    const line = ledgerLine(hostEnv(35, { kind: "phase_changed", old: "visit", new: "sleep", cause: "visit_closed" }));
    expect(line.title).toBe("⭢ Phase: not recorded");
    expect(ledgerLine(hostEnv(35, { ...SERVED, to: null })).title).toBe("⭢ Phase: visit → not recorded");
    expect(ledgerLine(hostEnv(35, { ...SERVED, from: undefined })).title).toBe("⭢ Phase: sleep (previous not recorded)");
  });

  // Live verification 2026-11-09 (untracked/live-verify-2026-11-09/report.json): the gateway's
  // first marker of an entity serves from: null; it read "Phase: ? → sleep".
  const FIRST_CASTOR = { kind: "phase_changed", session_id: null, name: "castor", from: null, to: "sleep", phase: "sleep", toggles: { personal: false }, stopped: false, since: "2026-11-09T12:13:58.810057+00:00", rev: 1, generation: 0, cause: "observed", sentence: "Asleep until you wake him." };
  const FIRST_NERIN = { kind: "phase_changed", session_id: null, name: "nerin", from: null, to: "sleep", phase: "sleep", toggles: { work: true, personal: true }, stopped: false, since: "2026-11-08T18:22:30.979293+00:00", rev: 1, generation: 0, cause: "observed", sentence: "Asleep until you wake him." };

  it("a served from: null is his first recorded phase, in words (castor #99033.0002, nerin #164102.0005)", () => {
    for (const [seq, p] of [[99033.0002, FIRST_CASTOR], [164102.0005, FIRST_NERIN]] as const) {
      const line = ledgerLine(hostEnv(seq, p));
      expect(line.title).toBe("⭢ Phase: sleep (first recorded)");
      expect(line.detail).toBe("cause: observed");
      expect(`${line.title} ${line.detail}`).not.toContain("?");
    }
  });

  it("from == to names what he keeps doing, led by the cause in words, never \"sleep → sleep\"", () => {
    // castor #100936.0003 and #100940.0003, nerin #186054.0003 and #186064.0003 (live payloads).
    const castorSleep = { ...SERVED, from: "sleep", to: "sleep", rev: 8, cause: "visit_closed" };
    const castorVisit = { ...SERVED, from: "visit", to: "visit", phase: "visit", rev: 10, cause: "observed", sentence: "In a visit with you." };
    const sleepLine = ledgerLine(hostEnv(100936.0003, castorSleep));
    expect(sleepLine.title).toBe("⭢ Visit closed · stays asleep");
    expect(sleepLine.detail).toBe("");
    expect(ledgerLine(hostEnv(100940.0003, castorVisit)).title).toBe("⭢ Observed · the visit goes on");
    expect(ledgerLine(hostEnv(186054.0003, { ...SERVED, name: "nerin", from: "idle", to: "idle", cause: "observed" })).title).toBe("⭢ Observed · stays idle");
    expect(ledgerLine(hostEnv(186064.0003, { ...SERVED, name: "nerin", from: "personal", to: "personal", cause: "observed" })).title).toBe("⭢ Observed · stays on his own time");
    expect(ledgerLine(hostEnv(40, { ...SERVED, from: "work", to: "work", cause: "task_complete" })).title).toBe("⭢ Task complete · keeps working");
    expect(ledgerLine(hostEnv(41, { ...SERVED, from: "stopped", to: "stopped", cause: "operator_stop" })).title).toBe("⭢ Operator stop · stays stopped");
    // No cause served: the state alone, the detail says so.
    const bare = ledgerLine(hostEnv(42, { ...SERVED, from: "sleep", to: "sleep", cause: undefined }));
    expect(bare.title).toBe("⭢ Stays asleep");
    expect(bare.detail).toBe("cause unrecorded");
    for (const w of ["visit", "idle", "work", "personal", "sleep", "stopped"]) {
      const t = ledgerLine(hostEnv(43, { ...SERVED, from: w, to: w })).title;
      expect(t).not.toContain("→");
      expect(t).not.toContain("?");
    }
  });

  it("a word outside the states renders labeled, never bare (AWAKE-NEVER-RENDERS)", () => {
    expect(ledgerLine(hostEnv(36, { ...SERVED, from: "awake" })).title).toBe("⭢ Phase: non-phase word: “awake” → sleep");
    expect(ledgerLine(hostEnv(37, { ...SERVED, cause: undefined })).detail).toBe("cause unrecorded");
  });
});
