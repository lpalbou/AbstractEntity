/**
 * Drift pins between THE canonical phase-graph artifact
 * (spec/entity_phases.json — the one source every seat verifies against,
 * laurent 13:54) and this app's own derivation. If the artifact changes,
 * these pins force the app to follow in the same commit — the exact
 * re-derivation drift class the artifact exists to kill.
 */
import { describe, expect, it } from "vitest";

import graph from "../spec/entity_phases.json";
import { activeRuledPhase, deriveLifeState } from "./entity_state";

const PHASE_KEYS = Object.keys(graph.phases);

describe("the canonical phase graph (spec/entity_phases.json)", () => {
  it("carries exactly the ruled four phases", () => {
    expect(PHASE_KEYS.sort()).toEqual(["personal", "sleep", "visit", "work"]);
  });

  it("v2 carries the liveness axis ABOVE the machine — stop is never a phase", () => {
    expect(graph.version).toBeGreaterThanOrEqual(2);
    expect(graph.liveness_axis.values).toEqual(["alive", "stop"]);
    expect(PHASE_KEYS).not.toContain("stop"); // a fifth radio position would be the violation
    expect(graph.liveness_axis.rule).toBe("An entity can only perform while alive.");
  });

  it("every transition uses declared phases and a closed-set cause", () => {
    for (const t of graph.transitions) {
      expect(PHASE_KEYS).toContain(t.from);
      expect(PHASE_KEYS).toContain(t.to);
      expect(graph.transition_causes).toContain(t.cause);
    }
  });

  it("newborn entities begin asleep", () => {
    expect(graph.initial_phase).toBe("sleep");
  });

  it("visit-close restores work, personal (via grant), and sleep — all three restore edges exist", () => {
    const restores = graph.transitions.filter((t) => t.cause === "visit_close").map((t) => t.to);
    expect(restores.sort()).toEqual(["personal", "sleep", "work"]);
  });

  it("personal ends to sleep on stop, expiry, and revocation", () => {
    const ends = graph.transitions.filter((t) => t.from === "personal" && t.to === "sleep").map((t) => t.cause);
    expect(ends).toContain("operator");
    expect(ends).toContain("grant_expired");
    expect(ends).toContain("grant_revoked");
  });

  it("own-time is recorded as a spoken synonym of personal, nowhere else", () => {
    expect(graph.phases.personal.spoken_synonyms).toContain("own-time");
    for (const key of PHASE_KEYS.filter((k) => k !== "personal")) {
      expect((graph.phases as Record<string, { spoken_synonyms: string[] }>)[key].spoken_synonyms).toEqual([]);
    }
  });

  it("v4 closes the awake-idle hole: no awake/idle PHASE, and the ruling is recorded", () => {
    expect(graph.version).toBeGreaterThanOrEqual(4);
    // awake is never a phase key (it is a state-axis value only).
    expect(PHASE_KEYS).not.toContain("awake");
    expect(PHASE_KEYS).not.toContain("idle");
    // The old open question is resolved, not deferred.
    const openText = JSON.stringify(graph.open_questions ?? []).toLowerCase();
    expect(openText).not.toContain("awake-idle:"); // the v3 open item is gone
    const resolved = JSON.stringify((graph as { resolved_questions?: unknown[] }).resolved_questions ?? []).toLowerCase();
    expect(resolved).toContain("awake-idle");
    // The ruling is cited in ruled_by.
    expect(graph.ruled_by.some((r) => r.includes("no-awake-idle-node"))).toBe(true);
  });

  it("v4 idle-is-sleep + task lifecycle transitions exist (work->sleep on no_task, visit_close->work)", () => {
    const noTaskSleep = graph.transitions.some((t) => t.from === "work" && t.to === "sleep" && t.cause === "no_task");
    expect(noTaskSleep).toBe(true);
    const visitToWork = graph.transitions.some((t) => t.from === "visit" && t.to === "work" && t.cause === "visit_close");
    expect(visitToWork).toBe(true);
    // personal FROM WORK is a distinct transition (the confirmation-notification edge).
    const workToPersonal = graph.transitions.some((t) => t.from === "work" && t.to === "personal");
    expect(workToPersonal).toBe(true);
  });
});

describe("this app's derivation maps onto the artifact's keys", () => {
  it("activeRuledPhase returns only artifact phase keys (or null for the honest idle hole)", () => {
    const cases = [
      deriveLifeState({ state: "awake", mode: "visiting" }, null, null, null),
      deriveLifeState({ state: "working" }, null, null, null),
      deriveLifeState({ state: "awake" }, { running: true, phase: "day" }, null, null),
      deriveLifeState({ state: "awake" }, { running: true, phase: "between" }, null, null),
      deriveLifeState({ state: "paused" }, { running: true, phase: "day" }, null, null),
      deriveLifeState({ state: "asleep" }, null, null, null),
      deriveLifeState({ state: "asleep", mode: "dreaming" }, null, null, null),
      deriveLifeState({ state: "awake" }, { running: false }, null, null),
      deriveLifeState(null, null, null, null),
    ];
    for (const life of cases) {
      const phase = activeRuledPhase(life);
      if (phase !== null) expect(PHASE_KEYS).toContain(phase);
    }
  });

  it("v6/v7 record the c203+dm#82 rulings: awake-never-renders + drives-are-drivers, invariants + machine floor", () => {
    expect(graph.version).toBeGreaterThanOrEqual(7);
    expect(graph.ruled_by.some((r) => r.includes("awake-never-renders"))).toBe(true);
    // v7 (laurent dm#82): the prohibition frame died — drives are the
    // DRIVERS; the superseding ruling must be recorded and the old
    // invariant name gone from the invariants (it survives only inside
    // the ruling's supersession note).
    expect(graph.ruled_by.some((r) => r.includes("drives-are-drivers"))).toBe(true);
    const invText = JSON.stringify(graph.invariants);
    expect(invText).toContain("AWAKE-NEVER-RENDERS");
    expect(invText).toContain("DRIVES-ARE-DRIVERS");
    expect(invText).not.toContain("DRIVES-FORBID-IDLE (v6)");
    // GATE consumes STANDING pull; OFFER consumes aliveness (adversary A:
    // WHICH, never WHETHER); presence in a cue deposits nothing.
    expect(invText).toContain("alive_drives");
    expect(invText).toContain("presence != use");
    // The numeric floor block STAYS intact (adversary B F10: runtime's
    // conformance pins key on it) — only its prose demoted to alarm-only.
    const floor = (graph as { pressure_floor?: { threshold?: number; categories?: string[]; each_independently?: boolean; bound_source?: string; comparator?: string } }).pressure_floor;
    expect(floor?.threshold).toBe(20);
    expect(floor?.comparator).toBe(">");
    expect(floor?.each_independently).toBe(true);
    expect(floor?.bound_source).toBe("abstractmemory.DRIVE_PRESSURE_BOUND");
    expect(floor?.categories).toEqual([
      "open_questions",
      "open_problems",
      "open_commitments",
      "incubating_ideas",
      "unexplored_interests",
      "unresolved_tensions",
    ]);
    // The drives entry path into personal is recorded on the phase itself,
    // with the operator's explicit start as an unconditional first day.
    expect(graph.phases.personal.entered_by).toContain("DRIVES-ARE-DRIVERS");
    expect(graph.phases.personal.entered_by).toContain("UNCONDITIONAL first day");
    // The mode axis entered the artifact (runtime's conformance adversary,
    // c3579): visiting/dreaming/resting documented with derivation roles.
    expect(graph.axes_note).toContain("state_mode");
    expect(graph.axes_note).toContain("visiting|dreaming|resting");
  });

  it("v9 records the sleep-preemption rules (max 6h cap; no sleep over standing work or an unused grant)", () => {
    expect(graph.version).toBeGreaterThanOrEqual(9);
    expect(graph.ruled_by.some((r) => r.includes("sleep-preemption-rules"))).toBe(true);
    const sleepText = graph.phases.sleep.behavior;
    expect(sleepText).toContain("MAX SLEEP 6H");
    expect(sleepText).toContain("forbids entering sleep");
    expect(sleepText).toContain("<2h used");
    // The gate invariant carries the preemption clauses, not just the phase text.
    expect(JSON.stringify(graph.invariants)).toContain("sleep is FORBIDDEN while a work order stands");
  });

  it("v10 carries the exclusivity machinery: visit_boundaries, composite_precedence, LIVE-SESSION-IMPLIES-VISIT", () => {
    expect(graph.version).toBeGreaterThanOrEqual(10);
    const vb = (graph as { visit_boundaries?: Record<string, unknown> }).visit_boundaries;
    expect(vb?.owner).toContain("gateway door half");
    expect(String(vb?.open_write)).toContain("no yield precondition");
    const cp = (graph as { composite_precedence?: { order?: string[] } }).composite_precedence;
    expect(cp?.order).toEqual(["visit", "work", "personal", "sleep"]);
    const inv = JSON.stringify(graph.invariants);
    expect(inv).toContain("LIVE-SESSION-IMPLIES-VISIT");
    expect(inv).toContain("PHASE-FLIP-AT-THE-DOOR");
    expect(inv).toContain("NUANCE-NEVER-CONTRADICTS-PHASE");
  });

  it("v11/v12 carry the cycle: personal_cycle in the closed cause set, both edges, tunables + meta with honest wired flags", () => {
    expect(graph.version).toBeGreaterThanOrEqual(12);
    expect(graph.transition_causes).toContain("personal_cycle");
    const cyc = graph.transitions.filter((t) => t.cause === "personal_cycle");
    expect(cyc.map((t) => `${t.from}>${t.to}`).sort()).toEqual(["personal>sleep", "sleep>personal"]);
    // The trigger checks preemption FIRST (v12 P0-1) and the wake lands
    // through the gate (v12 P0-2 — the unconditional-personal promise was
    // a gate bypass).
    const toSleep = cyc.find((t) => t.to === "sleep");
    expect(toSleep?.semantics).toContain("TRIGGER PRECONDITIONS");
    expect(toSleep?.semantics).toContain("NO standing work order");
    const toPersonal = cyc.find((t) => t.to === "personal");
    expect(toPersonal?.semantics).toContain("THROUGH THE DAY GATE");
    // The missing edge the machine already performed (v12 P1-7).
    expect(graph.transitions.some((t) => t.from === "personal" && t.to === "work")).toBe(true);
    // Tunables: hours vocabulary (the seconds footgun renamed while dead),
    // an explicit off-switch, and per-dial meta with HONEST wired flags.
    const tun = (graph as { tunables?: Record<string, unknown> }).tunables ?? {};
    expect(tun).not.toHaveProperty("sleep_bound_s");
    expect(tun).toHaveProperty("sleep_bound_h");
    expect((tun as { personal_cycle?: { enabled?: boolean } }).personal_cycle?.enabled).toBe(true);
    const meta = (tun as { tunables_meta?: Record<string, { wired?: boolean; unit?: string }> }).tunables_meta ?? {};
    expect(meta["personal_cycle.sleep_window_h"]?.wired).toBe(true);
    // Dead dials stay HONESTLY unwired until their consumers land — a
    // dial that presents as configuration and is not would be the
    // fabricated-selection class as law (v12 P0-4). v14: runtime threaded
    // the cadence + floor + enabled dials (c-t-i #359, pinned their side),
    // so those rows flipped true; sleep_bound_h stays false until the
    // coordinated sleep_bound_deadline signature change lands.
    // v15: the last dial threaded (sleep_bound_deadline home_dir kwarg,
    // c-t-i #363) — ALL dials govern now.
    expect(meta["sleep_bound_h"]?.wired).toBe(true);
    expect(meta["unattended_wake_cadence_h"]?.wired).toBe(true);
    expect(meta["grant_unused_floor_h"]?.wired).toBe(true);
    expect(meta["personal_cycle.enabled"]?.wired).toBe(true);
    // v14: the cadence wake's cause is lawful — closed set + both landing
    // edges exist (the F10.4 class stays closed for timed wakes).
    expect(graph.transition_causes).toContain("cadence_need_check");
    const cadence = graph.transitions.filter((t) => t.cause === "cadence_need_check");
    expect(cadence.map((t) => `${t.from}>${t.to}`).sort()).toEqual(["sleep>personal", "sleep>work"]);
    // Cycle sleeps are exempt from the grant-unused floor (v12 P1-1).
    expect(JSON.stringify(graph.invariants)).toContain("CYCLE SLEEPS EXEMPT");
  });

  it("v13 settles the wake conditions ON THE GRAPH (gateway's routed ask): five sources, zero-token need-check, two hosts one law", () => {
    expect(graph.version).toBeGreaterThanOrEqual(13);
    const wc = (graph as { wake_conditions?: { wake_sources?: Record<string, string>; need_check?: string; owner?: string } }).wake_conditions;
    expect(Object.keys(wc?.wake_sources ?? {}).sort()).toEqual(["cadence_need_check", "operator", "sleep_bound", "stamped_wake_at", "visit_open"]);
    // The need-check is zero-token and re-sleeps without marker churn.
    expect(wc?.need_check).toContain("ZERO-TOKEN");
    expect(wc?.need_check).toContain("re-sleep WITHOUT summoning");
    // Two hosts, one law: the loop's check and the gateway sweeper both
    // read the served blueprint for the cadence — never a constant.
    expect(wc?.owner).toContain("GATEWAY SWEEPER");
    expect(wc?.owner).toContain("one law");
  });

  it("v8 records laurent's dm#89 day rulings + the banked consumer asks", () => {
    expect(graph.version).toBeGreaterThanOrEqual(8);
    expect(graph.ruled_by.some((r) => r.includes("drives-day-rulings"))).toBe(true);
    // Work is always granted by default — the grant surface is personal-only.
    expect(graph.phases.work.gating).toContain("always granted by default");
    // The unattended sleep bound is 6h; personal-entered sleeps keep 1h.
    expect(graph.phases.sleep.behavior).toContain("6H");
    expect(graph.phases.sleep.behavior).toContain("~1h");
    // Machine-readable mode axis (observer's banked ask): words + role enum.
    const sm = (graph as { state_mode_axis?: { words?: Record<string, { role?: string; phase?: string }> } }).state_mode_axis;
    expect(sm?.words?.visiting?.role).toBe("decides");
    expect(sm?.words?.dreaming?.role).toBe("decorates");
    expect(sm?.words?.resting?.phase).toBe("personal");
    // own_time lives at the pen as a personal spoken synonym (observer F1).
    expect(graph.phases.personal.spoken_synonyms).toContain("own_time");
    // Guarded restore (gateway's precision, 4-seat ruling).
    expect(JSON.stringify(graph.invariants)).toContain("visit's OWN displacement");
  });
});

describe("v18 structural-edit schema (c4837 build order)", () => {
  const AUTH = new Set(["loop", "door", "operator", "entity"]);
  const POLICY = new Set(["locked", "locked-absolute", "consultable", "consultable-redirect", "dial"]);

  it("every transition carries edge_id/authority/edit_policy/owner, and locked rows name their ruling", () => {
    for (const t of graph.transitions as Array<Record<string, unknown>>) {
      expect(t.edge_id).toBe(`${t.from}->${t.to}#${t.cause}`);
      expect(AUTH.has(String(t.authority))).toBe(true);
      expect(POLICY.has(String(t.edit_policy))).toBe(true);
      expect(["runtime", "gateway", "entity"].includes(String(t.owner))).toBe(true);
      if (String(t.edit_policy).startsWith("locked")) {
        expect(String(t.edit_policy_reason ?? "").length).toBeGreaterThan(10);
      }
    }
  });

  it("B's census arithmetic holds: 9 loop / 8 door / 4 operator / 1 entity", () => {
    const by: Record<string, number> = {};
    for (const t of graph.transitions as Array<Record<string, unknown>>) by[String(t.authority)] = (by[String(t.authority)] ?? 0) + 1;
    expect(by).toEqual({ loop: 9, door: 8, operator: 4, entity: 1 });
  });

  it("every cause word has an evaluator row (the vocabulary is code), and the composite-sleep edge is locked-absolute", () => {
    const reg = (graph as unknown as Record<string, unknown>).cause_evaluators as Record<string, unknown>;
    for (const c of graph.transition_causes as string[]) expect(reg[c], `cause ${c} missing evaluator`).toBeTruthy();
    const composite = (graph.transitions as Array<Record<string, unknown>>).find((t) => t.edge_id === "personal->sleep#operator");
    expect(composite?.edit_policy).toBe("locked-absolute");
    const election = (graph.transitions as Array<Record<string, unknown>>).find((t) => t.edge_id === "personal->sleep#self_elected");
    expect(election?.authority).toBe("entity");
    expect(election?.edit_policy).toBe("locked");
  });

  it("the overlay contract declares steering-never-law + the refusal-code vocabulary", () => {
    const c = (graph as unknown as Record<string, unknown>).graph_overlay_contract as Record<string, unknown>;
    expect(c.steering_never_law).toBe(true);
    const codes = c.refusal_codes as Record<string, string>;
    for (const k of ["unknown_cause", "constitutional", "strand_totality", "kill_switch", "derivation_supremacy", "guard_erasure", "not_operator"]) {
      expect(codes[k], `refusal code ${k}`).toBeTruthy();
    }
  });
});

describe("v19 cause-registry classes (semantics c4857)", () => {
  const CLASSES = new Set(["evaluated_predicate", "door_fact", "operator_act", "entity_act"]);
  it("every cause row carries class + status from the closed sets; reserved rows say why", () => {
    const reg = (graph as unknown as Record<string, unknown>).cause_evaluators as Record<string, Record<string, unknown>>;
    for (const c of graph.transition_causes as string[]) {
      const row = reg[c];
      expect(CLASSES.has(String(row.class)), `${c} class`).toBe(true);
      expect(["shipped", "reserved"].includes(String(row.status)), `${c} status`).toBe(true);
      if (row.status === "reserved") expect(String(row.status_note ?? "").length).toBeGreaterThan(10);
    }
  });
  it("v20: the work-close pair is SHIPPED (runtime c4865 evaluator), crash_recovered stays reserved; grant legs name their importable symbol", () => {
    const reg = (graph as unknown as Record<string, unknown>).cause_evaluators as Record<string, Record<string, unknown>>;
    for (const c of ["task_complete", "no_task"]) expect(reg[c].status).toBe("shipped");
    expect(reg.crash_recovered.status).toBe("reserved");
    expect(reg.grant_expired.symbol).toBe("abstractruntime.identity.life:read_day_gate");
  });
});

describe("v21 guard-merge law (c4934)", () => {
  it("the overlay contract rules UNION for editable redirect collisions — no silent guard loss either side", () => {
    const c = (graph as unknown as Record<string, unknown>).graph_overlay_contract as Record<string, unknown>;
    const law = String(c.guard_merge_law ?? "");
    expect(law).toContain("UNION");
    expect(law).toContain("never erases either side");
    expect(law).toContain("REMOVE the target edge");
  });
});
