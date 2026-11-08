/**
 * Settings → Mind, the cognition profile (entity 0002, contract 2026-11-08): the three parts of
 * thinking and the memory bounds. The package ships no DOM for tests: the rules are pinned through the
 * pure mappings and the read/save steps (fetch stubbed at the wire), and the page through its
 * static markup in each state the steps produce.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COGNITION_PROFILE_UNAVAILABLE,
  CognitionProfileView,
  FOLLOWS_THE_MIND,
  MEMORY_HELP,
  NO_MIND_YET,
  PROFILE_READING,
  afterSave,
  cognitionProfileOf,
  pickerPending,
  profileController,
  profileSaveBody,
  profileValueOf,
  readCognitionProfile,
  saveCognitionChange,
  type ProfileState,
  type SaveOutcome,
} from "./mind_cognition_profile";
import { getEntityCognitionProfile, putEntityCognitionProfile, type CognitionProfilePut, type EntityCognitionProfile } from "./stream_source";
import { SettingsPanel } from "./workspace_panel";

const MIND = { provider: "openai", model: "gpt-5.6-terra", thinking: null };
const same = () => ({ choice: { inherit: "mind" as const }, effective: { ...MIND }, source: "mind" as const });
/** A home without a cognition.yaml: every part inherits the mind, the default bounds. */
const DEFAULTS: EntityCognitionProfile = {
  schema_version: 1,
  capabilities: { summaries: same(), understanding: same(), extraction: same() },
  recall: { shelf_size: 50, source: "default", applies_to_running_loop: "on restart" },
  rebuild: { sensitivity: 0.5, cap_per_turn: 3, source: "default" },
  mind: { ...MIND, source: "entity" },
};
const FORGE = { provider: "theforge-nvidia", model: "qwen/qwen3.8-27b" };
const WITH_FORGE: EntityCognitionProfile = {
  ...DEFAULTS,
  capabilities: { ...DEFAULTS.capabilities, summaries: { choice: { ...FORGE }, effective: { ...FORGE, thinking: null }, source: "profile" } },
};
const RANGE = "Memories per turn must be a whole number from 1 to 400.";
const NOT_CREATOR = "Only an admin or nerin's creator can change his settings.";
const URL_OF = "http://gw.test/api/gateway/entities/nerin/cognition-profile";
const noop = () => {};

type Call = { url: string; method: string; body: unknown; auth: string | undefined };
let calls: Call[] = [];
/** The gateway at the wire: one answer per method, every call recorded. */
function gateway(answers: { GET?: [number, unknown]; PUT?: [number, unknown] }) {
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method || "GET";
    const headers = (init.headers || {}) as Record<string, string>;
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined, auth: headers.Authorization });
    const [status, body] = answers[method as "GET" | "PUT"] ?? [500, { detail: `no ${method} answer` }];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
}
afterEach(() => vi.unstubAllGlobals());

function page(state: ProfileState, refused: string | null = null): string {
  return renderToStaticMarkup(
    <CognitionProfileView baseUrl="http://gw.test" state={state} refused={refused} onPart={noop} onField={noop} onCommit={noop} />,
  );
}
const ready = (profile: EntityCognitionProfile): ProfileState => ({ ...PROFILE_READING, phase: "ready", profile });
const count = (html: string, needle: string | RegExp) => (typeof needle === "string" ? html.split(needle).length - 1 : [...html.matchAll(needle)].length);
/** The value of a memory field's input (undefined = no such input). */
function inputValue(html: string, field: string): string | undefined {
  const tag = new RegExp(`<input[^>]*data-memory-field="${field}"[^>]*>`).exec(html)?.[0];
  return tag === undefined ? undefined : (/ value="([^"]*)"/.exec(tag)?.[1] ?? "(no value)");
}
/** The markup of one part's row. */
function row(html: string, part: string): string {
  const at = html.indexOf(`data-setting="cognition-${part}"`);
  expect(at, part).toBeGreaterThan(0);
  const next = html.indexOf('data-setting="', at + 1);
  return html.slice(at, next < 0 ? undefined : next);
}

// ------------------------------------------------------------------ the answer

describe("the answer is checked against the contract", () => {
  it("a complete answer passes as it is", () => {
    expect(cognitionProfileOf(structuredClone(DEFAULTS))).toEqual(DEFAULTS);
    expect(cognitionProfileOf(structuredClone(WITH_FORGE))).toEqual(WITH_FORGE);
  });

  it("a missing or mistyped field fails loudly, naming it", () => {
    const noExtraction = structuredClone(DEFAULTS) as unknown as { capabilities: Record<string, unknown> };
    delete noExtraction.capabilities.extraction;
    expect(() => cognitionProfileOf(noExtraction)).toThrow(/capabilities\.extraction\./);
    const textShelf = { ...structuredClone(DEFAULTS), recall: { shelf_size: "50", source: "default" } };
    expect(() => cognitionProfileOf(textShelf)).toThrow(/recall\.shelf_size/);
    const halfChoice = structuredClone(DEFAULTS) as unknown as { capabilities: { summaries: { choice: unknown } } };
    halfChoice.capabilities.summaries.choice = { provider: "theforge-nvidia" };
    expect(() => cognitionProfileOf(halfChoice)).toThrow(/capabilities\.summaries\.choice\.model/);
    const noEffective = structuredClone(DEFAULTS) as unknown as { capabilities: { understanding: { effective: unknown } } };
    noEffective.capabilities.understanding.effective = null;
    expect(() => cognitionProfileOf(noEffective)).toThrow(/capabilities\.understanding\.effective/);
    const noModel = structuredClone(DEFAULTS) as unknown as { capabilities: { extraction: { effective: unknown } } };
    noModel.capabilities.extraction.effective = { provider: "openai" };
    expect(() => cognitionProfileOf(noModel)).toThrow(/capabilities\.extraction\.effective\.model/);
    expect(() => cognitionProfileOf({ ...structuredClone(DEFAULTS), rebuild: { sensitivity: 0.5, source: "default" } })).toThrow(/rebuild\.cap_per_turn/);
  });
});

describe("profileValueOf: what the page shows for a stored profile", () => {
  it("a home without a profile: every part the mind's, named, and 50 / 0.5 / 3", () => {
    const v = profileValueOf(DEFAULTS);
    for (const part of ["summaries", "understanding", "extraction"] as const) {
      expect(v.parts[part]).toEqual({ picker: { provider: "", model: "" }, line: "Same as the mind (gpt-5.6-terra)" });
    }
    expect(v.memory).toEqual({ shelf_size: "50", sensitivity: "0.5", cap_per_turn: "3" });
  });

  it("a part with its own model shows it in the picker (with its reasoning) and in its line", () => {
    const own = structuredClone(WITH_FORGE);
    own.capabilities.summaries.choice = { ...FORGE, thinking: "high" };
    expect(profileValueOf(own).parts.summaries).toEqual({
      picker: { ...FORGE, reasoning: "high" },
      line: "theforge-nvidia · qwen/qwen3.8-27b",
    });
    expect(profileValueOf(own).parts.understanding.line).toBe("Same as the mind (gpt-5.6-terra)");
  });
});

describe("profileSaveBody: what a change writes", () => {
  it("a full pair writes the part's own model, with its reasoning when chosen", () => {
    expect(profileSaveBody({ part: "summaries", value: { ...FORGE, reasoning: "" } }, DEFAULTS)).toEqual({ capabilities: { summaries: { ...FORGE } } });
    expect(profileSaveBody({ part: "understanding", value: { ...FORGE, reasoning: "low" } }, DEFAULTS)).toEqual({
      capabilities: { understanding: { ...FORGE, thinking: "low" } },
    });
  });

  it("back to Same as the mind writes the inherit; nothing when it already is; half a pair waits", () => {
    expect(profileSaveBody({ part: "summaries", value: { provider: "", model: "", reasoning: "" } }, WITH_FORGE)).toEqual({
      capabilities: { summaries: { inherit: "mind" } },
    });
    expect(profileSaveBody({ part: "summaries", value: { provider: "", model: "" } }, DEFAULTS)).toBeNull();
    expect(profileSaveBody({ part: "summaries", value: { provider: "theforge-nvidia", model: "" } }, DEFAULTS)).toBeNull();
    expect(pickerPending({ provider: "theforge-nvidia", model: "" })).toBe(true);
    expect(pickerPending({ provider: "", model: "" })).toBe(false);
    expect(pickerPending(FORGE)).toBe(false);
  });

  it("the stored choice again writes nothing; a token cap set elsewhere survives a model change", () => {
    expect(profileSaveBody({ part: "summaries", value: { ...FORGE, reasoning: "" } }, WITH_FORGE)).toBeNull();
    const capped = structuredClone(WITH_FORGE);
    capped.capabilities.summaries.choice = { ...FORGE, max_input_tokens: 60000 };
    expect(profileSaveBody({ part: "summaries", value: { provider: "theforge-nvidia", model: "qwen/qwen3.8-9b" } }, capped)).toEqual({
      capabilities: { summaries: { provider: "theforge-nvidia", model: "qwen/qwen3.8-9b", max_input_tokens: 60000 } },
    });
  });

  it("the numbers go as typed (the gateway owns the ranges); an empty field or the stored value writes nothing", () => {
    expect(profileSaveBody({ field: "shelf_size", text: "120" }, DEFAULTS)).toEqual({ recall: { shelf_size: 120 } });
    expect(profileSaveBody({ field: "shelf_size", text: "2.5" }, DEFAULTS)).toEqual({ recall: { shelf_size: 2.5 } });
    expect(profileSaveBody({ field: "shelf_size", text: "500" }, DEFAULTS)).toEqual({ recall: { shelf_size: 500 } });
    expect(profileSaveBody({ field: "sensitivity", text: "0.7" }, DEFAULTS)).toEqual({ rebuild: { sensitivity: 0.7 } });
    expect(profileSaveBody({ field: "cap_per_turn", text: "0" }, DEFAULTS)).toEqual({ rebuild: { cap_per_turn: 0 } });
    expect(profileSaveBody({ field: "shelf_size", text: "50" }, DEFAULTS)).toBeNull();
    expect(profileSaveBody({ field: "sensitivity", text: " 0.5 " }, DEFAULTS)).toBeNull();
    expect(profileSaveBody({ field: "cap_per_turn", text: "" }, DEFAULTS)).toBeNull();
    expect(profileSaveBody({ field: "cap_per_turn", text: "abc" }, DEFAULTS)).toBeNull();
  });
});

// ------------------------------------------------------------------ the wire

describe("getEntityCognitionProfile / putEntityCognitionProfile", () => {
  it("GET reads the entity's route; 404 is null (a gateway without it)", async () => {
    gateway({ GET: [200, DEFAULTS] });
    expect(await getEntityCognitionProfile("http://gw.test", "nerin")).toEqual(DEFAULTS);
    expect(calls).toEqual([{ url: URL_OF, method: "GET", body: undefined, auth: undefined }]);
    gateway({ GET: [404, { detail: "Not Found" }] });
    expect(await getEntityCognitionProfile("http://gw.test", "nerin")).toBeNull();
  });

  it("PUT sends the body with the token; a refusal is the gateway's sentence and its status", async () => {
    gateway({ PUT: [200, DEFAULTS] });
    expect(await putEntityCognitionProfile("http://gw.test", "nerin", "tok", { recall: { shelf_size: 80 } })).toEqual(DEFAULTS);
    expect(calls).toEqual([{ url: URL_OF, method: "PUT", body: { recall: { shelf_size: 80 } }, auth: "Bearer tok" }]);
    gateway({ PUT: [422, { detail: RANGE }] });
    const err = await putEntityCognitionProfile("http://gw.test", "nerin", null, { recall: { shelf_size: 500 } }).catch((e) => e);
    expect(err.message).toBe(RANGE);
    expect(err.status).toBe(422);
    gateway({ PUT: [502, "<html>Bad gateway</html>"] });
    expect((await putEntityCognitionProfile("http://gw.test", "nerin", null, {}).catch((e) => e)).message).toBe("HTTP 502");
  });
});

// ------------------------------------------------------------------ the page

describe("Settings → Mind: a home without a profile", () => {
  it("shows every part as Same as the mind (gpt-5.6-terra), and 50 / 0.5 / 3, all usable", async () => {
    gateway({ GET: [200, DEFAULTS] });
    const state = { ...PROFILE_READING, ...(await readCognitionProfile("http://gw.test", "nerin")) };
    expect(state.phase).toBe("ready");
    const html = page(state);
    for (const title of ["What each part of thinking uses", "Memory", "Summaries and memory details", "Understanding and dreams", "Extraction"]) {
      expect(html).toContain(title);
    }
    expect(count(html, /aria-selected="true"[^>]*>Same as the mind</g)).toBe(3);
    expect(count(html, "Same as the mind (gpt-5.6-terra)")).toBe(3);
    expect(inputValue(html, "shelf_size")).toBe("50");
    expect(inputValue(html, "sensitivity")).toBe("0.5");
    expect(inputValue(html, "cap_per_turn")).toBe("3");
    expect(html).not.toMatch(/<input[^>]*disabled=""/);
    expect(html).not.toContain("entity-settings-refusal");
    // The help lines are the contract's words.
    expect(html).toContain("How many memories he may bring to mind for each turn, in visits and in his own time. A running day picks it up at its next start.");
    expect(html).toContain("How easily a new memory or a surprise starts a rebuild.");
    expect(html).toContain("A safety cap. 0 = only while he rests.");
  });

  it("the line under each part goes through the shared renderer", () => {
    const html = page(ready(DEFAULTS));
    expect(html).toMatch(/data-cognition-effective="summaries"><div class="pc-md wl_line"/);
  });
});

describe("choosing theforge-nvidia · qwen/qwen3.8-27b for summaries", () => {
  it("saves that part only, reads the profile again and shows what the gateway stores", async () => {
    const body = profileSaveBody({ part: "summaries", value: { ...FORGE, reasoning: "" } }, DEFAULTS);
    gateway({ PUT: [200, WITH_FORGE], GET: [200, WITH_FORGE] });
    const outcome = await saveCognitionChange("http://gw.test", "nerin", "tok", body!);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ["PUT", URL_OF],
      ["GET", URL_OF],
    ]);
    expect(calls[0].body).toEqual({ capabilities: { summaries: { provider: "theforge-nvidia", model: "qwen/qwen3.8-27b" } } });
    const before: ProfileState = { ...ready(DEFAULTS), drafts: { parts: { summaries: { ...FORGE, reasoning: "" } }, memory: {} } };
    const after = afterSave(before, "summaries", outcome, { ...FORGE, reasoning: "" });
    expect(after.profile).toEqual(WITH_FORGE);
    expect(after.drafts.parts.summaries).toBeUndefined();
    const html = page(after);
    const summaries = row(html, "summaries");
    expect(summaries).toMatch(/aria-selected="true"[^>]*>Custom</);
    expect(summaries).toContain("theforge-nvidia · qwen/qwen3.8-27b");
    expect(summaries).toMatch(/data-cognition-status="summaries"[^>]*><div class="pc-md wl_line"><p[^>]*>Saved</);
    expect(row(html, "understanding")).toContain("Same as the mind (gpt-5.6-terra)");
    expect(row(html, "extraction")).toContain("Same as the mind (gpt-5.6-terra)");
  });
});

describe("a refusal", () => {
  it("shows the gateway's sentence and the field returns to the stored value; nothing is read again", async () => {
    const typed: ProfileState = { ...ready(DEFAULTS), drafts: { parts: {}, memory: { shelf_size: "500" } } };
    expect(inputValue(page(typed), "shelf_size")).toBe("500");
    gateway({ PUT: [422, { detail: RANGE }], GET: [200, DEFAULTS] });
    const outcome = await saveCognitionChange("http://gw.test", "nerin", "tok", profileSaveBody({ field: "shelf_size", text: "500" }, DEFAULTS)!);
    expect(calls.map((c) => c.method)).toEqual(["PUT"]);
    const after = afterSave(typed, "shelf_size", outcome, "500");
    const html = page(after);
    expect(inputValue(html, "shelf_size")).toBe("50");
    expect(html).toMatch(
      new RegExp(`<div class="stg_error wsp_status_refused" role="alert"[^>]*data-tone="error"><div class="pc-md wl_line"><p[^>]*>${RANGE.replace(/\./g, "\\.")}<`),
    );
    expect(after.profile).toEqual(DEFAULTS);
  });

  it("a 403 is the gateway's sentence itself, also from a {reason_code, message} detail; no sentence → a plain one", async () => {
    gateway({ PUT: [403, { detail: NOT_CREATOR }] });
    expect(await saveCognitionChange("http://gw.test", "nerin", null, { rebuild: { cap_per_turn: 5 } })).toEqual({ saved: false, sentence: NOT_CREATOR });
    const offered = "Summaries and memory details: qwen/qwen3.8-27b is not a model this gateway offers to creators.";
    gateway({ PUT: [403, { detail: { reason_code: "model_not_offered", message: offered } }] });
    expect(await saveCognitionChange("http://gw.test", "nerin", null, { capabilities: { summaries: { ...FORGE } } })).toEqual({ saved: false, sentence: offered });
    gateway({ PUT: [401, ""] });
    expect(await saveCognitionChange("http://gw.test", "nerin", null, {})).toEqual({ saved: false, sentence: "Sign in to change his settings." });
    gateway({ PUT: [403, "<html>proxy</html>"] });
    expect(await saveCognitionChange("http://gw.test", "nerin", null, {})).toEqual({ saved: false, sentence: "You may not change his settings." });
  });
});

describe("a member who may not configure him", () => {
  it("sees every control disabled, with the access sentence", () => {
    const html = page(ready(DEFAULTS), NOT_CREATOR);
    expect(count(html, /<input[^>]*disabled=""[^>]*data-memory-field=/g)).toBe(3);
    expect(count(html, /<button[^>]*role="tab"[^>]*disabled=""/g)).toBe(6);
    expect(count(html, `data-af-tip="${NOT_CREATOR.replace(/'/g, "&#x27;")}"`)).toBe(2);
    // The stored state still reads truthfully.
    expect(count(html, "Same as the mind (gpt-5.6-terra)")).toBe(3);
    expect(inputValue(html, "shelf_size")).toBe("50");
  });
});

describe("a gateway without the route (404)", () => {
  it("shows the one sentence and keeps the sections visible, disabled", async () => {
    gateway({ GET: [404, { detail: "Not Found" }] });
    const state = { ...PROFILE_READING, ...(await readCognitionProfile("http://gw.test", "nerin")) };
    expect(state.phase).toBe("unavailable");
    const html = page(state);
    expect(COGNITION_PROFILE_UNAVAILABLE).toMatch(/^This gateway does not offer the cognition profile yet \(gateway ≥ \d+\.\d+\.\d+\)\.$/);
    expect(count(html, COGNITION_PROFILE_UNAVAILABLE)).toBe(1);
    expect(html).toContain("What each part of thinking uses");
    expect(html).toContain("Memories retrieved per turn");
    expect(count(html, /<input[^>]*disabled=""[^>]*data-memory-field=/g)).toBe(3);
    expect(count(html, /<button[^>]*role="tab"[^>]*disabled=""/g)).toBe(6);
    expect(inputValue(html, "shelf_size")).toBe("");
    expect(html).not.toContain("Same as the mind (");
  });
});

describe("other reads", () => {
  it("an error and a drifted answer are sentences on the page, the controls disabled", async () => {
    gateway({ GET: [500, { detail: "The profile file is unreadable." }] });
    const failed = await readCognitionProfile("http://gw.test", "nerin");
    expect(failed).toEqual({ phase: "error", profile: null, error: "His thinking settings could not be read: The profile file is unreadable." });
    gateway({ GET: [200, { ...DEFAULTS, rebuild: { sensitivity: 0.5 } }] });
    const drifted = await readCognitionProfile("http://gw.test", "nerin");
    expect(drifted.phase).toBe("error");
    expect(drifted.error).toMatch(/rebuild\.cap_per_turn/);
    const html = page({ ...PROFILE_READING, ...drifted });
    expect(html).toContain('data-cognition-error=""');
    expect(count(html, /<input[^>]*disabled=""[^>]*data-memory-field=/g)).toBe(3);
  });
});

describe("in the Settings modal", () => {
  it("Mind holds the mind picker first, then the parts of thinking and Memory", () => {
    const html = renderToStaticMarkup(
      <SettingsPanel baseUrl="http://gw.test" entity="nerin" entityName="nerin" token={null} substrate={null} onSubstrateChange={() => {}} initialSection="mind" onClose={() => {}} />,
    );
    const mind = html.indexOf('data-testid="entity-mind-picker"');
    const profile = html.indexOf('data-testid="entity-cognition-profile"');
    expect(mind).toBeGreaterThan(0);
    expect(profile).toBeGreaterThan(mind);
    expect(html.indexOf("Memories retrieved per turn")).toBeGreaterThan(html.indexOf("What each part of thinking uses"));
    // Before the read lands: reading, every control disabled.
    expect(html).toContain('data-phase="reading"');
    expect(count(html, /<input[^>]*disabled=""[^>]*data-memory-field=/g)).toBe(3);
  });

  it("each change goes through one save step, and his mind's change reads the profile again", () => {
    const src = fs.readFileSync(path.join(__dirname, "mind_cognition_profile.tsx"), "utf8");
    expect(src.split("saveCognitionChange(baseUrl, entity, token, body)").length - 1).toBe(1);
    expect(src).toContain("}, [baseUrl, entity, mindKey, store]);");
    const panel = fs.readFileSync(path.join(__dirname, "workspace_panel.tsx"), "utf8");
    expect(panel).toContain("mindKey={substrate ? `${substrate.provider}|${substrate.model}|${substrate.thinking ?? \"\"}` : \"\"}");
  });
});

// ------------------------------------------------------------ review fixes (2026-11-08)

/** The controller on a plain store, its saves answered by hand (each save waits for its reply). */
function harness(initial: ProfileState) {
  let state = initial;
  const sends: CognitionProfilePut[] = [];
  const replies: Array<(o: SaveOutcome) => void> = [];
  const controller = profileController(
    { get: () => state, set: (update) => void (state = update(state)) },
    (body) => {
      sends.push(body);
      return new Promise<SaveOutcome>((resolve) => replies.push(resolve));
    },
  );
  return { c: controller, sends, replies, get state() { return state; } };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const storedRead = (profile: EntityCognitionProfile): SaveOutcome => ({ saved: true, read: { phase: "ready", profile, error: null } });
const withShelf = (n: number): EntityCognitionProfile => ({ ...DEFAULTS, recall: { ...DEFAULTS.recall, shelf_size: n, source: "profile" } });

describe("(1) a slow save keeps what was typed during it", () => {
  it("typed 13 while 120 saved: 13 stays (not reset to 120), and the next key sends 130", async () => {
    const h = harness(ready(DEFAULTS));
    h.c.field("shelf_size", "120");
    h.c.commit("shelf_size");
    await flush();
    expect(h.sends).toEqual([{ recall: { shelf_size: 120 } }]);
    h.c.field("shelf_size", "13");
    h.replies[0](storedRead(withShelf(120)));
    await h.c.idle();
    expect(h.state.profile?.recall.shelf_size).toBe(120);
    expect(h.state.drafts.memory.shelf_size).toBe("13");
    expect(inputValue(page(h.state), "shelf_size")).toBe("13");
    h.c.field("shelf_size", "130");
    h.c.commit("shelf_size");
    await flush();
    expect(h.sends[1]).toEqual({ recall: { shelf_size: 130 } });
  });

  it("a refusal returns the field to the stored value only if nothing new was typed", async () => {
    const h = harness(ready(DEFAULTS));
    h.c.field("shelf_size", "500");
    h.c.commit("shelf_size");
    await flush();
    h.c.field("shelf_size", "60");
    h.replies[0]({ saved: false, sentence: RANGE });
    await h.c.idle();
    expect(h.state.drafts.memory.shelf_size).toBe("60");
    const quiet = harness(ready(DEFAULTS));
    quiet.c.field("shelf_size", "500");
    quiet.c.commit("shelf_size");
    await flush();
    quiet.replies[0]({ saved: false, sentence: RANGE });
    await quiet.c.idle();
    expect(quiet.state.drafts.memory.shelf_size).toBeUndefined();
    expect(inputValue(page(quiet.state), "shelf_size")).toBe("50");
  });

  it("a picker choice made during a save of another stays", () => {
    const before: ProfileState = { ...ready(DEFAULTS), drafts: { parts: { summaries: { provider: "lmstudio", model: "" } }, memory: {} } };
    const after = afterSave(before, "summaries", storedRead(WITH_FORGE), { ...FORGE });
    expect(after.drafts.parts.summaries).toEqual({ provider: "lmstudio", model: "" });
  });
});

describe("(2) a mind the gateway cannot name", () => {
  /** abstractgateway entity_cognition_profile.py: effective null on inheriting parts, mind unset. */
  const UNSET: EntityCognitionProfile = {
    ...DEFAULTS,
    capabilities: {
      summaries: { choice: { inherit: "mind" }, effective: null, source: "mind" },
      understanding: { choice: { inherit: "mind" }, effective: null, source: "mind" },
      extraction: { choice: { ...FORGE }, effective: { ...FORGE, thinking: null }, source: "profile" },
    },
    rebuild: { ...DEFAULTS.rebuild, sources: { sensitivity: "default", cap_per_turn: "default" } },
    mind: { provider: null, model: null, thinking: null, source: "unset", note: "This gateway has no text model yet." },
  };

  it("is a valid answer: those rows say No mind chosen yet, and the panel stays usable", async () => {
    gateway({ GET: [200, UNSET] });
    const read = await readCognitionProfile("http://gw.test", "nerin");
    expect(read.phase).toBe("ready");
    const v = profileValueOf(read.profile!);
    expect(v.parts.summaries.line).toBe(NO_MIND_YET);
    expect(v.parts.understanding.line).toBe(NO_MIND_YET);
    expect(v.parts.extraction.line).toBe("theforge-nvidia · qwen/qwen3.8-27b");
    const html = page({ ...PROFILE_READING, ...read });
    expect(row(html, "summaries")).toContain(NO_MIND_YET);
    expect(html).not.toMatch(/<input[^>]*disabled=""/);
    expect(html).not.toMatch(/<button[^>]*role="tab"[^>]*disabled=""/);
    expect(html).not.toContain("data-cognition-error");
  });

  it("a null elsewhere is still a contract break", () => {
    const customNull = structuredClone(UNSET);
    customNull.capabilities.extraction.effective = null;
    expect(() => cognitionProfileOf(customNull)).toThrow(/capabilities\.extraction\.effective/);
    const knownMind = structuredClone(DEFAULTS);
    knownMind.capabilities.summaries.effective = null;
    expect(() => cognitionProfileOf(knownMind)).toThrow(/capabilities\.summaries\.effective/);
    expect(() => cognitionProfileOf({ ...structuredClone(DEFAULTS), mind: { provider: null, model: null, source: "entity" } })).toThrow(/mind\.model/);
    expect(() => cognitionProfileOf({ ...structuredClone(DEFAULTS), mind: { ...MIND, source: "elsewhere" } })).toThrow(/mind\.source/);
  });
});

describe("(3) keyboard: Enter saves in place, and the same save is sent once", () => {
  it("Enter then leaving the field writes once", async () => {
    const h = harness(ready(DEFAULTS));
    h.c.field("shelf_size", "80");
    h.c.commit("shelf_size");
    h.c.commit("shelf_size");
    await flush();
    expect(h.sends).toEqual([{ recall: { shelf_size: 80 } }]);
    h.replies[0](storedRead(withShelf(80)));
    await h.c.idle();
    h.c.commit("shelf_size");
    await flush();
    expect(h.sends).toHaveLength(1);
  });

  it("a model picked by keyboard (reported twice) is saved once, its Saving… kept", async () => {
    const h = harness(ready(DEFAULTS));
    h.c.part("summaries", { ...FORGE, reasoning: "" });
    h.c.part("summaries", { ...FORGE, reasoning: "" });
    await flush();
    expect(h.sends).toEqual([{ capabilities: { summaries: { ...FORGE } } }]);
    expect(h.state.status.summaries).toEqual({ text: "Saving…", tone: "" });
    h.replies[0](storedRead(WITH_FORGE));
    await h.c.idle();
    h.c.part("summaries", { ...FORGE });
    await flush();
    expect(h.sends).toHaveLength(1);
    expect(h.state.status.summaries).toEqual({ text: "Saved", tone: "ok" });
  });

  it("the field's Enter commits without blurring (the focus stays; Tab goes on to the next field)", () => {
    const src = fs.readFileSync(path.join(__dirname, "mind_cognition_profile.tsx"), "utf8");
    expect(src).toContain('if (e.key === "Enter") onCommit(f.id);');
    expect(src).not.toContain(".blur()");
  });
});

describe("(4) every control keeps its own status", () => {
  it("a refusal under one field survives the next field's Saved", async () => {
    const h = harness(ready(DEFAULTS));
    h.c.field("shelf_size", "500");
    h.c.commit("shelf_size");
    h.c.field("sensitivity", "0.7");
    h.c.commit("sensitivity");
    await flush();
    h.replies[0]({ saved: false, sentence: RANGE });
    await flush();
    h.replies[1](storedRead({ ...DEFAULTS, rebuild: { ...DEFAULTS.rebuild, sensitivity: 0.7, source: "profile" } }));
    await h.c.idle();
    expect(h.sends).toEqual([{ recall: { shelf_size: 500 } }, { rebuild: { sensitivity: 0.7 } }]);
    expect(h.state.status).toEqual({ shelf_size: { text: RANGE, tone: "refused" }, sensitivity: { text: "Saved", tone: "ok" } });
    const html = page(h.state);
    expect(html).toContain(RANGE);
    expect(html).toMatch(/data-cognition-status="sensitivity"[^>]*><div class="pc-md wl_line"><p[^>]*>Saved</);
  });

  it("a stale Saved leaves when that control changes (a half-chosen provider, a new keystroke)", () => {
    const h = harness({ ...ready(WITH_FORGE), status: { summaries: { text: "Saved", tone: "ok" }, shelf_size: { text: RANGE, tone: "refused" } } });
    h.c.part("summaries", { provider: "lmstudio", model: "" });
    expect(h.state.status.summaries).toBeUndefined();
    expect(h.state.drafts.parts.summaries).toEqual({ provider: "lmstudio", model: "" });
    expect(h.state.status.shelf_size).toEqual({ text: RANGE, tone: "refused" });
    h.c.field("shelf_size", "6");
    expect(h.state.status.shelf_size).toBeUndefined();
    expect(h.sends).toEqual([]);
  });
});

describe("(5) words", () => {
  it("the panel says the mind throughout, explains rebuilds and Extraction, and a refusal reads as an error", () => {
    const html = page({ ...ready(DEFAULTS), status: { cap_per_turn: { text: "Rebuilds per turn must be a whole number from 0 to 10.", tone: "refused" } } });
    expect(count(html, FOLLOWS_THE_MIND)).toBe(3);
    expect(html).not.toContain("A change of mind");
    expect(html).toContain(MEMORY_HELP);
    expect(MEMORY_HELP).toMatch(/^A rebuild is when a new memory or a surprise makes him revisit what he already understood\./);
    expect(row(html, "extraction")).toContain("Pulls facts and names out of what he reads and hears. Not used yet.");
    expect(html).toMatch(/class="stg_error wsp_status_refused" role="alert"[^>]*data-tone="error"/);
    expect(html).not.toContain("door");
    const settings = renderToStaticMarkup(
      <SettingsPanel baseUrl="http://gw.test" entity="nerin" entityName="nerin" token={null} substrate={null} onSubstrateChange={() => {}} initialSection="mind" onClose={() => {}} />,
    );
    expect(settings).toMatch(/af-settings-group__title"[^>]*>Mind</);
    expect(settings).not.toMatch(/af-settings-group__title"[^>]*>Model</);
  });

  it("the access sentence stays a note, not an error", () => {
    expect(page(ready(DEFAULTS), NOT_CREATOR)).toMatch(/class="wsp_status wsp_status_refused" role="note"[^>]*data-tone="note"/);
  });
});
