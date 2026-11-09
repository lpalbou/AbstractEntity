/**
 * Drift pins between THE canonical phase-graph artifact
 * (spec/entity_phases.json — the one source every seat verifies against,
 * laurent 13:54) and this app's own derivation. If the artifact changes,
 * these pins force the app to follow in the same commit — the exact
 * re-derivation drift class the artifact exists to kill.
 */
import { describe, expect, it } from "vitest";

import graph from "../spec/entity_phases.json";
import { PHASE_SLOT_KEYS } from "./phase_bar";

const PHASE_KEYS = Object.keys(graph.phases);

interface Edge {
  from: string;
  to: string;
  cause: string;
  edge_id: string;
  authority: string;
  edit_policy: string;
  owner: string;
  guards?: string[];
  semantics: string;
}
const EDGES = graph.transitions as unknown as Edge[];
const pair = (t: { from: string; to: string }) => `${t.from}>${t.to}`;

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

  it("v22: personal off never leads to sleep — no grant cause exists, and every edge into sleep is the operator, his election, or a visit returning to the sleep it interrupted", () => {
    // TARGET (root 1178): turning personal off ends own time AWAKE (idle,
    // visitable). The v21 grant_expired/grant_revoked -> sleep edges were
    // exactly the "off lands him asleep for 6 h" defect.
    expect(graph.transition_causes).not.toContain("grant_expired");
    expect(graph.transition_causes).not.toContain("grant_revoked");
    const intoSleep = new Set(EDGES.filter((t) => t.to === "sleep").map((t) => t.cause));
    expect([...intoSleep].sort()).toEqual(["crash_recovered", "operator", "self_elected", "visit_close"]);
    expect(EDGES.some((t) => t.to === "sleep" && (t.guards ?? []).includes("grant_gone"))).toBe(false);
    expect(JSON.stringify(graph.invariants)).toContain("PERSONAL-OFF-NEVER-SLEEPS");
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

  it("v22 task lifecycle: visit_close resumes work, work that runs out lands in personal (never sleep), work<->personal both ways", () => {
    // v4's visit -> work -> sleep chain is retired with IDLE-IS-SLEEP: when
    // no work remains he goes to personal (toggle on) or idle (no edge).
    expect(EDGES.some((t) => t.edge_id === "visit->work#visit_close")).toBe(true);
    expect(EDGES.some((t) => t.edge_id === "work->personal#no_task")).toBe(true);
    expect(EDGES.some((t) => t.from === "work" && t.to === "sleep" && ["no_task", "task_complete"].includes(t.cause))).toBe(false);
    expect(EDGES.some((t) => pair(t) === "work>personal")).toBe(true);
    expect(EDGES.some((t) => pair(t) === "personal>work")).toBe(true);
    // v4's confirmed interruption is gone: no toggle interrupts work.
    expect(EDGES.some((t) => (t.guards ?? []).includes("operator_confirmation"))).toBe(false);
  });
});

describe("this app's derivation maps onto the artifact's keys", () => {
  it("the phase bar's four pills are exactly the artifact's phase keys (idle and stopped light none)", () => {
    expect([...PHASE_SLOT_KEYS].sort()).toEqual([...PHASE_KEYS].sort());
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

  it("v22 sleep is a decision: entered only by the operator or his own election, no clock, and it never disarms personal or clears work", () => {
    // v9's preemption clauses (6h cap, work forbids sleep, grant-use floor)
    // and v17's composite operator sleep are superseded; ruled_by keeps
    // them as history only.
    expect(graph.ruled_by.some((r) => r.includes("sleep-preemption-rules"))).toBe(true);
    const sleepText = graph.phases.sleep.behavior;
    expect(sleepText).toContain("ENTERED ONLY on the operator's request");
    expect(sleepText).toContain("a fixed clock never forces it");
    expect(sleepText).not.toContain("MAX SLEEP 6H is the general cap");
    const inv = graph.invariants as string[];
    expect(inv.some((x) => x.startsWith("SLEEP-IS-A-DECISION"))).toBe(true);
    expect(inv.some((x) => x.startsWith("OPERATOR-SLEEP-IS-ABSOLUTE"))).toBe(false);
    expect(JSON.stringify(inv)).not.toContain("sleep is FORBIDDEN while a work order stands");
    // The operator sleeps him from personal AND from work; neither act is a
    // composite any more (plain locked, no locked-absolute left).
    const opSleep = EDGES.filter((t) => t.to === "sleep" && t.cause === "operator");
    expect(opSleep.map((t) => t.from).sort()).toEqual(["personal", "work"]);
    for (const t of opSleep) expect(t.edit_policy).toBe("locked");
    expect(EDGES.some((t) => t.edit_policy === "locked-absolute")).toBe(false);
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

  it("v22 retires the timed cycle: personal_cycle names only the personal self-loop, the cadence word is gone, and the clock dials are retired, not live", () => {
    // TARGET: no clock forces sleep — the v11/v12 personal->sleep->personal
    // window and the v13/v14 6h need-check cadence are gone as edges.
    expect(graph.transition_causes).toContain("personal_cycle");
    const cyc = EDGES.filter((t) => t.cause === "personal_cycle");
    expect(cyc.map(pair)).toEqual(["personal>personal"]);
    expect(graph.transition_causes).not.toContain("cadence_need_check");
    // The keys stay for readers (runtime load_phase_tunables, the dials UI,
    // cognition_graph toggle paths), but no retired dial may present as
    // live law: wired:false + retired_by citing v22, and the cycle's own
    // off-switch held false (a loop still reading it holds the cycle).
    const tun = graph.tunables as unknown as Record<string, unknown>;
    expect(tun).not.toHaveProperty("sleep_bound_s");
    expect(tun).toHaveProperty("sleep_bound_h");
    expect((tun.personal_cycle as { enabled?: boolean }).enabled).toBe(false);
    const meta = tun.tunables_meta as Record<string, { wired?: boolean; retired_by?: string }>;
    for (const key of [
      "personal_cycle.enabled",
      "personal_cycle.personal_window_h",
      "personal_cycle.sleep_window_h",
      "sleep_bound_h",
      "unattended_wake_cadence_h",
      "grant_unused_floor_h",
    ]) {
      expect(meta[key]?.wired, `${key} wired`).toBe(false);
      expect(String(meta[key]?.retired_by ?? ""), `${key} retired_by`).toMatch(/^v22: /);
    }
    // Dials TARGET did not touch keep their own honesty flags.
    expect(meta["window_limit"]?.retired_by).toBeUndefined();
    expect(JSON.stringify(graph.invariants)).not.toContain("CYCLE SLEEPS EXEMPT");
  });

  it("v22 wake conditions: a sleep ends at maintenance_done or the operator's wake, a visit interrupts it — no clock source, the need-check retired", () => {
    const wc = graph.wake_conditions as unknown as { wake_sources: Record<string, string>; need_check: string; owner: string };
    expect(Object.keys(wc.wake_sources).sort()).toEqual(["maintenance_done", "operator", "visit_open"]);
    expect(wc.need_check).toMatch(/^RETIRED \(v22\)/);
    expect(wc.wake_sources.visit_open).toContain("the SAME sleep continues");
    // The machine's only self-wake exists as edges into both toggled phases,
    // locked (removal would strand every sleep until a person acts).
    const md = EDGES.filter((t) => t.cause === "maintenance_done");
    expect(md.map(pair).sort()).toEqual(["sleep>personal", "sleep>work"]);
    for (const t of md) expect(t.edit_policy).toBe("locked");
  });

  it("v8 records laurent's dm#89 day rulings + the banked consumer asks; v22 makes work a TOGGLE (no longer always granted)", () => {
    expect(graph.version).toBeGreaterThanOrEqual(8);
    expect(graph.ruled_by.some((r) => r.includes("drives-day-rulings"))).toBe(true);
    // v22 supersedes dm#89 (3): the work toggle gates every admission point,
    // and it ALLOWS work, never forces it.
    expect(graph.phases.work.gating).toMatch(/^TOGGLE \(v22, supersedes dm#89 'work is always granted'\)/);
    expect(graph.phases.work.gating).not.toMatch(/^NONE/);
    for (const t of EDGES.filter((e) => e.to === "work")) expect(t.guards ?? [], `${t.edge_id} work_on`).toContain("work_on");
    for (const t of EDGES.filter((e) => e.to === "personal")) expect(t.guards ?? [], `${t.edge_id} grant_armed`).toContain("grant_armed");
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

  it("the v22 census holds: 21 edges = 6 loop / 8 door / 5 operator / 2 entity", () => {
    // v21 was B's 22-edge census (9/8/4/1). v22 removed 8 timed/grant edges
    // and added 7 (two self-loops, no_task->personal, two maintenance_done
    // wakes, work->sleep for the operator and for his own election).
    const by: Record<string, number> = {};
    for (const t of EDGES) by[t.authority] = (by[t.authority] ?? 0) + 1;
    expect(by).toEqual({ loop: 6, door: 8, operator: 5, entity: 2 });
    expect(EDGES).toHaveLength(21);
  });

  it("every cause word has an evaluator row and no registry row is orphaned; both sleep elections are the entity's, locked", () => {
    const reg = (graph as unknown as Record<string, unknown>).cause_evaluators as Record<string, unknown>;
    for (const c of graph.transition_causes as string[]) expect(reg[c], `cause ${c} missing evaluator`).toBeTruthy();
    // The vocabulary is closed both ways: a registry row no edge uses would
    // be a legal-looking cause the editor offers for nothing (v22 removed
    // grant_expired / grant_revoked / cadence_need_check rows with their edges).
    const used = new Set(EDGES.map((t) => t.cause));
    expect(Object.keys(reg).filter((k) => k !== "$comment").sort()).toEqual([...used].sort());
    expect([...used].sort()).toEqual([...(graph.transition_causes as string[])].sort());
    const elections = EDGES.filter((t) => t.cause === "self_elected");
    expect(elections.map(pair).sort()).toEqual(["personal>sleep", "work>sleep"]);
    for (const e of elections) {
      expect(e.authority).toBe("entity");
      expect(e.edit_policy).toBe("locked");
    }
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
  it("v20: the work-close pair is SHIPPED (runtime c4865 evaluator), crash_recovered stays reserved", () => {
    const reg = (graph as unknown as Record<string, unknown>).cause_evaluators as Record<string, Record<string, unknown>>;
    for (const c of ["task_complete", "no_task"]) expect(reg[c].status).toBe("shipped");
    expect(reg.crash_recovered.status).toBe("reserved");
  });

  it("v22: status follows SHIPPED code — maintenance_done and the re-pointed personal_cycle are reserved (no minting site yet), the retired grant legs are gone", () => {
    const reg = (graph as unknown as Record<string, unknown>).cause_evaluators as Record<string, Record<string, unknown>>;
    expect(reg.maintenance_done?.class).toBe("evaluated_predicate");
    expect(reg.maintenance_done?.status).toBe("reserved");
    expect(String(reg.maintenance_done?.status_note)).toContain("§10.6");
    expect(reg.personal_cycle?.status).toBe("reserved");
    expect(String(reg.personal_cycle?.status_note)).toContain("§10.3");
    for (const gone of ["grant_expired", "grant_revoked", "cadence_need_check"]) expect(reg[gone], gone).toBeUndefined();
  });
});

describe("v22 target phases (operator ruling 2026-11-08 19:02 + 19:11; contract v2 §9)", () => {
  it("v22 is in ruled_by, citing TARGET + the contract", () => {
    expect(graph.version).toBeGreaterThanOrEqual(22);
    const v22 = graph.ruled_by.filter((r) => r.startsWith("v22-target-phases (operator ruling 2026-11-08 19:02 + 19:11 correction, untracked/entity-phases-2026-11-08/TARGET.md; contract v2 2026-11-09 §9): "));
    expect(v22).toHaveLength(1);
  });

  it("idle and stopped are STATUSES outside the four phases: named, never phase keys, never an edge endpoint", () => {
    const statuses = (graph as unknown as Record<string, Record<string, Record<string, string>>>).statuses;
    expect(statuses, "statuses block").toBeDefined();
    expect(Object.keys(statuses).filter((k) => k !== "$comment").sort()).toEqual(["idle", "stopped"]);
    for (const s of ["idle", "stopped"]) {
      expect(String(statuses[s].definition).length, `${s} definition`).toBeGreaterThan(20);
      expect(PHASE_KEYS).not.toContain(s);
      expect(EDGES.some((t) => t.from === s || t.to === s)).toBe(false);
    }
    expect(statuses.stopped.axis).toContain("liveness_axis");
    expect(graph.liveness_axis.values).toEqual(["alive", "stop"]); // the kill switch keeps its axis
    const inv = graph.invariants as string[];
    expect(inv.some((x) => x.startsWith("IDLE-IS-A-STATUS"))).toBe(true);
    expect(inv.some((x) => x.startsWith("IDLE-IS-SLEEP"))).toBe(false);
  });

  it("the allowed transitions are exactly TARGET's diagram (plus visit's crash-recovery self-loop)", () => {
    expect(new Set(EDGES.map(pair))).toEqual(
      new Set([
        "visit>work", "work>visit",
        "visit>personal", "personal>visit",
        "visit>sleep", "sleep>visit",
        "work>personal", "personal>work",
        "work>sleep", "sleep>work",
        "personal>sleep", "sleep>personal",
        "work>work", "personal>personal",
        "visit>visit",
      ]),
    );
  });

  it("there is no sleep->sleep edge, ever — from sleep he goes to personal, work or visit", () => {
    expect(EDGES.some((t) => t.from === "sleep" && t.to === "sleep")).toBe(false);
    expect(new Set(EDGES.filter((t) => t.from === "sleep").map((t) => t.to))).toEqual(new Set(["personal", "work", "visit"]));
    expect((graph.invariants as string[]).some((x) => x.startsWith("NO-SLEEP-AFTER-SLEEP"))).toBe(true);
  });

  it("self-loops exist for work and personal (sleep is never mandatory); visit's only self-loop is crash recovery", () => {
    const loops = EDGES.filter((t) => t.from === t.to).map((t) => t.edge_id).sort();
    expect(loops).toEqual(["personal->personal#personal_cycle", "visit->visit#crash_recovered", "work->work#task_complete"]);
  });

  it("a visit's close into sleep is the INTERRUPTED sleep continuing, not a new one (contract §4.4)", () => {
    const back = EDGES.find((t) => t.edge_id === "visit->sleep#visit_close");
    expect(back?.semantics).toContain("The INTERRUPTED SLEEP CONTINUES");
    expect(back?.semantics).toContain("no sleep->sleep");
    const into = EDGES.find((t) => t.edge_id === "sleep->visit#visit_open");
    expect(into?.semantics).toContain("INTERRUPTS");
  });

  it("toggles allow, never force; sleep never disarms personal nor clears work", () => {
    const inv = graph.invariants as string[];
    expect(inv.some((x) => x.startsWith("TOGGLES-ALLOW-NEVER-FORCE"))).toBe(true);
    expect(inv.some((x) => x.startsWith("PERSONAL-INTERRUPT-IS-CONFIRMED"))).toBe(false);
    const decision = inv.find((x) => x.startsWith("SLEEP-IS-A-DECISION")) ?? "";
    expect(decision).toContain("NEVER disarms the personal toggle and NEVER clears the work order");
    expect(graph.phases.personal.gating).toContain("Sleep never disarms it");
  });
});

describe("v23 own time is a privilege (operator ruling 2026-11-09, TARGET 'Own time is a privilege')", () => {
  const inv = graph.invariants as string[];
  const intoPersonal = EDGES.filter((t) => t.to === "personal");

  it("is version 23 and its ruled_by entry is the last one, citing the ruling", () => {
    expect(graph.version).toBe(23);
    const last = graph.ruled_by[graph.ruled_by.length - 1];
    expect(last.startsWith("v23-own-time-privilege (operator ruling 2026-11-09, untracked/entity-phases-2026-11-08/TARGET.md 'Own time is a privilege'): ")).toBe(true);
    expect(last).toContain("SCHEMA UNCHANGED");
  });

  it("the invariant: only the operator grants or revokes own time; personal is entered by his grant/resume or a return via resume_to, never from idle by the entity's choice; revoked meanwhile = idle", () => {
    const rule = inv.filter((x) => x.startsWith("OWN-TIME-IS-A-PRIVILEGE (v23"));
    expect(rule).toHaveLength(1);
    for (const words of [
      "granted or revoked ONLY by the operator",
      "The entity NEVER gives itself own time",
      "RETURNING to it via resume_to",
      "never from idle by the entity's own choice",
      "he ends IDLE: awake and visitable",
      "No edge into personal carries the entity's own election",
    ]) {
      expect(rule[0]).toContain(words);
    }
  });

  it("no edge into personal is the entity's own act: every entry is the operator, a door's restore or the loop's return", () => {
    expect(intoPersonal.map((t) => t.edge_id).sort()).toEqual([
      "personal->personal#personal_cycle",
      "sleep->personal#maintenance_done",
      "sleep->personal#operator",
      "visit->personal#visit_close",
      "work->personal#no_task",
      "work->personal#operator",
    ]);
    for (const t of intoPersonal) {
      expect(t.authority, t.edge_id).not.toBe("entity");
      expect(t.cause, t.edge_id).not.toBe("self_elected");
      expect(t.guards ?? [], t.edge_id).toContain("grant_armed");
    }
  });

  it("every entry into personal that is not the operator's act is a RETURN: the restore at a visit close, resume_to after work or a sleep, or staying in personal", () => {
    const returns = intoPersonal.filter((t) => t.authority !== "operator");
    const why: Record<string, string> = {
      "visit->personal#visit_close": "RESTORE-PREVIOUS",
      "work->personal#no_task": "own time resumes when resume_to names it",
      "sleep->personal#maintenance_done": "RETURNS to the phase the sleep interrupted (resume_to)",
      "personal->personal#personal_cycle": "SELF-LOOP",
    };
    expect(returns.map((t) => t.edge_id).sort()).toEqual(Object.keys(why).sort());
    for (const t of returns) expect(t.semantics, t.edge_id).toContain(why[t.edge_id]);
    expect(EDGES.find((t) => t.edge_id === "work->personal#no_task")?.semantics).toContain("v23 OWN-TIME-IS-A-PRIVILEGE");
    expect(EDGES.find((t) => t.edge_id === "sleep->personal#maintenance_done")?.semantics).toContain("v23 OWN-TIME-IS-A-PRIVILEGE");
  });

  it("personal says how it is entered, and idle is left for personal only by the operator's grant", () => {
    expect(graph.phases.personal.entered_by.startsWith("v23 OWN-TIME-IS-A-PRIVILEGE: ONLY by the operator's grant or resume, or by RETURNING to it via resume_to — never from idle by the entity's own choice.")).toBe(true);
    expect(graph.phases.personal.gating).toContain("v23: only the operator grants it too");
    const idle = (graph as unknown as { statuses: Record<string, Record<string, string>> }).statuses.idle;
    expect(idle.left_when).toContain("the operator turns personal on and reconcile starts own time (personal — the operator's grant only, never the entity's own choice");
  });

  it("the schema is v22's: same top-level keys, same edge fields, no cause added", () => {
    expect(Object.keys(graph).sort()).toEqual(
      [
        "$comment", "artifact", "version", "ruled_by", "liveness_axis", "axes_note", "representation_note", "consumption_contract", "phases", "statuses",
        "initial_phase", "transition_causes", "transition_causes_reserved", "transitions", "visit_boundaries", "composite_precedence", "wake_conditions",
        "tunables", "invariants", "newborn_shape", "resolved_questions", "open_questions", "pressure_floor", "state_mode_axis", "cause_evaluators",
        "graph_overlay_contract",
      ].sort(),
    );
    const fields = new Set(["from", "to", "cause", "semantics", "edge_id", "authority", "edit_policy", "owner", "edit_policy_reason", "guards"]);
    for (const t of graph.transitions) for (const k of Object.keys(t)) expect(fields.has(k), `${(t as Edge).edge_id}.${k}`).toBe(true);
    expect([...graph.transition_causes].sort()).toEqual(["maintenance_done", "no_task", "operator", "personal_cycle", "self_elected", "task_complete", "visit_close", "visit_open", "crash_recovered"].sort());
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
