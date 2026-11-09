/**
 * The phase bar's write lanes (phase_bar_writes.ts) driven with real promises: Stop, the kill
 * switch, goes out at once even while a toggle is in flight, and the toggle's late answer never
 * repaints over the stopped view nor speaks over the Stop's sentence.
 */
import { describe, expect, it } from "vitest";

import { phaseBody } from "./fixtures/phase_bodies";
import { adoptPhaseBar, phaseBarRead, phaseBarView, type PhaseBarRead, type PhaseBarUi } from "./phase_bar";
import type { PhaseWire, ServedPhase } from "./phase_bar_source";
import { PhaseWrites, type PhaseWriteHost } from "./phase_bar_writes";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const wire = (phase: ServedPhase, overrides: Record<string, unknown> = {}, status = 200): PhaseWire => ({ status, code: null, body: phaseBody(phase, overrides) });

/** A page in miniature: the same rules the entity page applies (adoptPhaseBar for every answer). */
function page(initial: ServedPhase) {
  const start = phaseBarRead(wire(initial));
  const state = { read: start as PhaseBarRead, ui: { busy: null, confirm: null } as PhaseBarUi, note: null as string | null, refreshes: 0, authRefused: 0, current: true };
  const host: PhaseWriteHost = {
    current: () => state.current,
    adopt: (bar) => {
      state.read = adoptPhaseBar(state.read, bar);
    },
    note: (s) => {
      state.note = s;
    },
    ui: (update) => {
      state.ui = update(state.ui);
    },
    refresh: () => {
      state.refreshes += 1;
    },
    authRefused: () => {
      state.authRefused += 1;
    },
  };
  return { state, host, view: () => phaseBarView(state.read, state.ui) };
}

describe("Stop goes out while a toggle is in flight", () => {
  it("the toggle holds the pills, never Stop; Stop is sent at once; the toggle's late, older answer leaves the stopped view and the Stop's sentence alone", async () => {
    const p = page("personal"); // rev 45
    const writes = new PhaseWrites();
    const toggle = deferred<PhaseWire>();
    const stop = deferred<PhaseWire>();
    const sent: string[] = [];

    expect(writes.run("personal", () => (sent.push("personal"), toggle.promise), p.host)).toBe(true);
    expect(p.state.ui.busy).toBe("personal");
    expect(writes.held()).toBe(true);
    expect(p.view().slots.every((s) => s.disabled)).toBe(true);
    expect(p.view().power.disabled).toBe(false);

    // The kill switch, pressed while the toggle waits: it goes out now.
    expect(writes.run("stop", () => (sent.push("stop"), stop.promise), p.host)).toBe(true);
    expect(sent).toEqual(["personal", "stop"]);
    expect(p.state.ui.stopping).toBe(true);

    // The stop answers first: stopped, rev 47 (generation 8), with an item that failed.
    stop.resolve(wire("stopped", { complete: false, items: [{ item: "visit", id: "run_7f2c", outcome: "failed", code: "visit_close_failed", sentence: "The visit could not be closed: it was already closing." }] }));
    await flush();
    expect(p.state.read).toMatchObject({ kind: "served", bar: { rev: 47, generation: 8, stopped: true } });
    expect(p.view().power.label).toBe("Resume");
    expect(p.state.note).toBe("The visit could not be closed: it was already closing.");
    expect(p.state.ui.stopping).toBe(false);
    // Something is outstanding: a second Stop stays beside Resume.
    expect(p.state.ui.stopIncomplete).toBe(true);
    expect(p.view().stopAgain?.label).toBe("Stop");

    // The toggle's late answer describes the moment before the stop (rev 46, generation 7): ignored.
    toggle.resolve(wire("personal", { rev: 46, toggles: { personal: false }, next: { phase: "idle", sentence: "His own time ends at the next step." } }));
    await flush();
    expect(p.state.read).toMatchObject({ kind: "served", bar: { rev: 47, stopped: true, phase: "stopped" } });
    expect(p.view().power.label).toBe("Resume");
    expect(p.state.note).toBe("The visit could not be closed: it was already closing.");
    expect(p.state.ui.busy).toBe(null);
    expect(writes.held()).toBe(false);
  });

  it("a toggle refused because the Stop got there first adopts the stopped bar and stays quiet", async () => {
    const p = page("personal");
    const writes = new PhaseWrites();
    const toggle = deferred<PhaseWire>();
    const stop = deferred<PhaseWire>();
    writes.run("personal", () => toggle.promise, p.host);
    writes.run("stop", () => stop.promise, p.host);
    stop.resolve(wire("stopped"));
    await flush();
    toggle.resolve({ status: 409, code: "stopped_use_resume", body: { detail: { reason_code: "stopped_use_resume", message: "Castor is stopped. Resume him first, then choose what he may do.", life_state: phaseBody("stopped") } } });
    await flush();
    expect(p.state.read).toMatchObject({ kind: "served", bar: { rev: 47, stopped: true } });
    expect(p.state.note).toBe(null);
  });

  it("a toggle that fails to answer after a Stop went out says nothing over the Stop", async () => {
    const p = page("personal");
    const writes = new PhaseWrites();
    const toggle = deferred<PhaseWire>();
    writes.run("personal", () => toggle.promise, p.host);
    writes.run("stop", () => Promise.resolve(wire("stopped")), p.host);
    await flush();
    toggle.reject(new Error("network down"));
    await flush();
    expect(p.state.note).toBe(null);
    expect(p.view().power.label).toBe("Resume");
  });

  it("a Stop pressed again while the first is in flight sends again", async () => {
    const p = page("work");
    const writes = new PhaseWrites();
    const first = deferred<PhaseWire>();
    const second = deferred<PhaseWire>();
    let sends = 0;
    writes.run("stop", () => (sends++, first.promise), p.host);
    writes.run("stop", () => (sends++, second.promise), p.host);
    expect(sends).toBe(2);
    first.resolve(wire("stopped"));
    await flush();
    expect(p.state.ui.stopping).toBe(true); // the second is still out
    second.resolve(wire("stopped", { already: true }));
    await flush();
    expect(p.state.ui.stopping).toBe(false);
    expect(p.view().power.label).toBe("Resume");
  });
});

describe("Resume and visit; Stop again", () => {
  it("the visit opens only after the resume is answered and he runs again", async () => {
    const p = page("stopped");
    const writes = new PhaseWrites();
    const resume = deferred<PhaseWire>();
    const opened: string[] = [];
    writes.run("resume", () => resume.promise, { ...p.host, after: (out) => !out.bar?.stopped && out.ok && opened.push("visit") });
    expect(opened).toEqual([]);
    resume.resolve(wire("idle", { rev: 48, toggles: { personal: false } }));
    await flush();
    expect(opened).toEqual(["visit"]);
  });
  it("a resume refused (archived) opens nothing; a resume overtaken by a Stop opens nothing", async () => {
    const p = page("stopped");
    const writes = new PhaseWrites();
    const opened: string[] = [];
    const after = { after: (out: { ok: boolean }) => out.ok && opened.push("visit") };
    writes.run("resume", () => Promise.resolve({ status: 409, code: "entity_archived", body: { code: "entity_archived", detail: { reason_code: "entity_archived", message: "This entity is archived.", life_state: phaseBody("stopped") } } }), { ...p.host, ...after });
    await flush();
    expect(opened).toEqual([]);
    expect(p.state.note).toBe("This entity is archived.");
    const resume = deferred<PhaseWire>();
    writes.run("resume", () => resume.promise, { ...p.host, ...after });
    writes.run("stop", () => Promise.resolve(wire("stopped", { rev: 50, generation: 9 })), p.host);
    await flush();
    resume.resolve(wire("idle", { rev: 49 }));
    await flush();
    expect(opened).toEqual([]);
    expect(p.view().power.label).toBe("Resume");
  });
  it("a clean stop clears the second Stop", async () => {
    const p = page("stopped");
    p.state.ui = { ...p.state.ui, stopIncomplete: true };
    const writes = new PhaseWrites();
    writes.run("stop", () => Promise.resolve(wire("stopped", { already: true, complete: true, items: [] })), p.host);
    await flush();
    expect(p.state.ui.stopIncomplete).toBe(false);
    expect(p.view().stopAgain).toBeNull();
  });
});

describe("the toggle lane", () => {
  it("one toggle or Resume at a time; a second is dropped, not queued; none starts while a Stop is out", async () => {
    const p = page("idle");
    const writes = new PhaseWrites();
    const toggle = deferred<PhaseWire>();
    expect(writes.run("personal", () => toggle.promise, p.host)).toBe(true);
    expect(writes.run("resume", () => Promise.resolve(wire("idle")), p.host)).toBe(false);
    toggle.resolve(wire("personal", { rev: 49 }));
    await flush();
    expect(writes.held()).toBe(false);
    const stop = deferred<PhaseWire>();
    writes.run("stop", () => stop.promise, p.host);
    expect(writes.run("resume", () => Promise.resolve(wire("idle")), p.host)).toBe(false);
    stop.resolve(wire("stopped", { rev: 50 }));
    await flush();
  });

  it("a toggle alone: its bar and its sentence show, then a re-read", async () => {
    const p = page("visit"); // rev 43
    const writes = new PhaseWrites();
    writes.run("personal", () => Promise.resolve(wire("visit", { rev: 44, toggles: { personal: false }, next: { phase: "idle", sentence: "When the visit closes, he stays awake and reachable." } })), p.host);
    await flush();
    expect(p.state.read).toMatchObject({ kind: "served", bar: { rev: 44, toggles: { personal: false } } });
    expect(p.state.note).toBe("When the visit closes, he stays awake and reachable.");
    expect(p.state.refreshes).toBe(1);
  });

  it("the toggle's end never closes a Stop confirmation opened meanwhile", async () => {
    const p = page("personal");
    const writes = new PhaseWrites();
    const toggle = deferred<PhaseWire>();
    writes.run("personal", () => toggle.promise, p.host);
    p.state.ui = { ...p.state.ui, confirm: "stop" };
    toggle.resolve(wire("personal", { rev: 46 }));
    await flush();
    expect(p.state.ui).toMatchObject({ busy: null, confirm: "stop" });
  });

  it("a 401 hands the sign-in back to the page", async () => {
    const p = page("idle");
    const writes = new PhaseWrites();
    writes.run("personal", () => Promise.resolve({ status: 401, code: null, body: null }), p.host);
    await flush();
    expect(p.state.authRefused).toBe(1);
  });

  it("another entity (reset): the old answers touch nothing and the lanes are free", async () => {
    const p = page("personal");
    const writes = new PhaseWrites();
    const toggle = deferred<PhaseWire>();
    writes.run("personal", () => toggle.promise, p.host);
    writes.reset();
    expect(writes.held()).toBe(false);
    p.state.ui = { busy: null, confirm: null };
    toggle.resolve(wire("idle", { rev: 99 }));
    await flush();
    expect(p.state.read).toMatchObject({ kind: "served", bar: { rev: 45 } });
    expect(p.state.ui.busy).toBe(null);
  });
});
