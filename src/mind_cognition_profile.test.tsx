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
  PROFILE_READING,
  afterSave,
  cognitionProfileOf,
  pickerPending,
  profileSaveBody,
  profileValueOf,
  readCognitionProfile,
  saveCognitionChange,
  type ProfileState,
} from "./mind_cognition_profile";
import { getEntityCognitionProfile, putEntityCognitionProfile, type EntityCognitionProfile } from "./stream_source";
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
    expect(html).toContain("How easily a new memory or a surprise makes him revisit what he already understood.");
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
    const after = afterSave(before, "summaries", outcome);
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
    const after = afterSave(typed, "shelf_size", outcome);
    const html = page(after);
    expect(inputValue(html, "shelf_size")).toBe("50");
    expect(html).toMatch(new RegExp(`data-testid="entity-settings-refusal"><div class="pc-md wl_line"><p[^>]*>${RANGE.replace(/\./g, "\\.")}<`));
    expect(after.profile).toEqual(DEFAULTS);
  });

  it("a creator-bound refusal (403) reads as the door's refusal with the gateway's sentence", async () => {
    gateway({ PUT: [403, { detail: NOT_CREATOR }] });
    const outcome = await saveCognitionChange("http://gw.test", "nerin", null, { rebuild: { cap_per_turn: 5 } });
    expect(outcome).toEqual({ saved: false, sentence: `The door refused: ${NOT_CREATOR}` });
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
    expect(src).toContain("}, [baseUrl, entity, mindKey]);");
    const panel = fs.readFileSync(path.join(__dirname, "workspace_panel.tsx"), "utf8");
    expect(panel).toContain("mindKey={substrate ? `${substrate.provider}|${substrate.model}|${substrate.thinking ?? \"\"}` : \"\"}");
  });
});
