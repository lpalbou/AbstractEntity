/**
 * Settings → Mind / → Voice use the kit's shared pickers with "Gateway
 * default" first (round 3, operator 2026-10-01). The package ships no DOM
 * for tests: components render with react-dom/server and the save rules
 * are pinned through their pure helpers.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProviderModelPicker, VoiceSettings } from "@abstractframework/ui-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  accessRefusal,
  entityVoiceCreation,
  mindDefaultHint,
  mindSaveBody,
  mindValueOf,
  substrateChoiceOf,
  voiceValueOf,
} from "./mind_voice_settings";
import type { EntitySubstrate, EntityVoiceChoice } from "./stream_source";

const GATEWAY: EntitySubstrate = {
  provider: null,
  model: null,
  thinking: null,
  speculation: null,
  source: "gateway",
  gateway_default: { provider: "lmstudio", model: "qwen3-9b", thinking: null },
  effective: { provider: "lmstudio", model: "qwen3-9b", thinking: null },
};
const OWN: EntitySubstrate = {
  provider: "ollama",
  model: "own-model",
  thinking: "high",
  speculation: { mode: "native_mtp", num_draft_tokens: 2, require_acceleration: true },
  source: "entity",
  gateway_default: { provider: "lmstudio", model: "qwen3-9b", thinking: null },
};
const noop = async () => [];

function mindMarkup(s: EntitySubstrate) {
  return renderToStaticMarkup(
    <ProviderModelPicker
      value={mindValueOf(s)}
      onChange={() => {}}
      inheritLabel="Gateway default"
      optionsInDefaultMode={false}
      enableSpeculation
      defaultHint={mindDefaultHint(s)}
      fetchProviders={noop}
      fetchModels={noop}
      fetchModelCapabilities={async () => ({})}
    />,
  );
}

describe("Mind: Gateway default is the default, its own choice the override", () => {
  it("an entity without its own mind shows Gateway default, named, with no reasoning/MTP", () => {
    expect(mindValueOf(GATEWAY)).toEqual({ provider: "", model: "" });
    expect(substrateChoiceOf(GATEWAY)).toBeNull();
    const html = mindMarkup(GATEWAY);
    expect(html).toMatch(/aria-selected="true"[^>]*>Gateway default</);
    expect(html).toContain("Gateway default: lmstudio · qwen3-9b.");
    expect(html).not.toContain("MTP depth");
  });

  it("its own mind shows Custom with provider, model, reasoning and MTP", () => {
    expect(mindValueOf(OWN)).toEqual({
      provider: "ollama",
      model: "own-model",
      reasoning: "high",
      speculation: { mode: "native_mtp", num_draft_tokens: 2, require_acceleration: true },
    });
    const html = mindMarkup(OWN);
    expect(html).toMatch(/aria-selected="true"[^>]*>Custom</);
    expect(html).toContain("MTP depth");
    expect(html).toContain("Reasoning effort");
    expect(html).not.toContain("Workflow / Gateway default");
  });

  it("saves a full pair with reasoning + MTP, clears back to the default, waits on half a pair", () => {
    expect(mindSaveBody({ provider: "ollama", model: "m", reasoning: "low", speculation: false }, false)).toEqual({
      provider: "ollama",
      model: "m",
      thinking: "low",
      speculation: false,
    });
    expect(mindSaveBody({ provider: "ollama", model: "m" }, true)).toEqual({ provider: "ollama", model: "m", thinking: null, speculation: null });
    expect(mindSaveBody({ provider: "", model: "" }, true)).toEqual({ clear: true });
    expect(mindSaveBody({ provider: "", model: "" }, false)).toBeNull();
    expect(mindSaveBody({ provider: "ollama", model: "" }, true)).toBeNull();
  });

  it("names the no-text-model state in the gateway's own sentence", () => {
    const unset: EntitySubstrate = { provider: null, model: null, source: "unset", gateway_default: null, note: "This gateway has no text model yet: open Setup in the console, choose Use recommended defaults, then try again." };
    expect(mindDefaultHint(unset)).toMatch(/^This gateway has no text model yet/);
  });
});

describe("Voice: the picker value of a recorded voice", () => {
  it("an entity's voice fills the kit's picker; no voice leaves it empty", () => {
    const own: EntityVoiceChoice = { provider: "supertonic", model: "supertonic-3", voice: "M2", source: "identity" };
    expect(voiceValueOf(own)).toEqual({ provider: "supertonic", model: "supertonic-3", voice: "M2" });
    expect(voiceValueOf({ provider: null, model: null, voice: null, source: "identity" })).toEqual({});
  });
});

// Create a voice (AbstractGateway 0.16.0 voice library, ui-kit 0.8.9 `createVoice`): his voice
// picker offers it; the new voice is selected and saved as his own like any picked voice.
describe("Voice: create one in the gateway's voice library", () => {
  const VOICE = { voice_id: "v-1", name: "Narrator", engine: "qwen3-tts" };
  let calls: { url: string; init: RequestInit }[] = [];
  const answer = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response(JSON.stringify(body), { status })));
  beforeEach(() => {
    calls = [];
    (globalThis as { window?: unknown }).window = globalThis;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("his voice picker (Settings → identity) shows Create a voice", () => {
    const html = renderToStaticMarkup(
      <VoiceSettings value={{}} onChange={() => {}} fetchCatalog={async () => ({})} intro={null} delivery={false} showReset={false} createVoice={entityVoiceCreation("", null)} />,
    );
    expect(html).toContain("Create a voice");
    expect(html).toContain("From a description");
    expect(html).toContain("From a recording");
    // The identity page is the kit's IdentityPanel; its gateway client carries the voice library.
    const src = fs.readFileSync(path.join(__dirname, "identity_settings.tsx"), "utf8");
    expect(src).toContain("createVoice: entityVoiceCreation(baseUrl, token),");
  });

  it("designs a voice: POST voice/design with the description, name and language", async () => {
    answer(200, VOICE);
    const out = await entityVoiceCreation("http://gw.test", "tok").design!({ description: "a calm, warm low female voice", name: "Narrator", language: "fr" });
    expect(out).toEqual(VOICE);
    expect(calls[0].url).toBe("http://gw.test/api/gateway/voice/design");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ description: "a calm, warm low female voice", name: "Narrator", language: "fr" });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("clones a voice: POST voice/clones as multipart with the recording and its fields", async () => {
    answer(200, VOICE);
    const recording = new File([new Uint8Array([1, 2, 3])], "me.wav", { type: "audio/wav" });
    const out = await entityVoiceCreation("http://gw.test", "tok").clone!(recording, { name: "Me", language: "en", reference_text: "Hello there." });
    expect(out.voice_id).toBe("v-1");
    expect(calls[0].url).toBe("http://gw.test/api/gateway/voice/clones");
    expect(calls[0].init.method).toBe("POST");
    const form = calls[0].init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect((form.get("file") as File).name).toBe("me.wav");
    expect(form.get("name")).toBe("Me");
    expect(form.get("language")).toBe("en");
    expect(form.get("reference_text")).toBe("Hello there.");
    // The browser sets the multipart boundary: no JSON content type.
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("a gateway refusal (403, 501) surfaces as the gateway's own sentence", async () => {
    const creation = entityVoiceCreation("http://gw.test", null);
    const shared = "On this gateway every account shares one voice store, so creating, changing or deleting a voice is an administrator's act.";
    answer(403, { detail: shared });
    const refused = await creation.design!({ description: "x" }).catch((e) => e);
    expect(refused.message).toBe(shared);
    expect(refused.status).toBe(403);
    const missing = "Voice design needs abstractvoice[qwen3-tts] where the voice capability runs.";
    answer(501, { detail: missing });
    const err = await creation.clone!(new Blob([new Uint8Array([1])]), {}).catch((e) => e);
    expect(err.message).toBe(missing);
    expect(err.status).toBe(501);
  });
});

describe("the bespoke forms are gone", () => {
  it("Settings mounts the shared pickers, not the old provider…/choose…/set his voice form", () => {
    const panel = fs.readFileSync(path.resolve(__dirname, "workspace_panel.tsx"), "utf8");
    expect(panel).toContain("<EntityMindPicker");
    // Its voice is part of its identity: one picker, on the identity tab (framework ADR 0052).
    expect(panel).toContain("<IdentitySettings");
    expect(panel).not.toContain("EntityVoicePicker");
    for (const gone of ["SubstratePicker", "set his voice", "choose…", "maintainer ruling 2026-07-09", "ReasoningDial"]) {
      expect(panel).not.toContain(gone);
    }
    expect(fs.existsSync(path.resolve(__dirname, "substrate_picker.tsx"))).toBe(false);
  });
});


describe("R16.5: the creator configures their entity (GET /entities/{name}/access)", () => {
  it("an admin or the creator may; anyone else reads the gateway's sentence", () => {
    expect(accessRefusal({ entity: "nova", can_configure: true, as: "creator", reason: null })).toBeNull();
    expect(accessRefusal({ entity: "nova", can_configure: true, as: "admin", reason: null })).toBeNull();
    expect(
      accessRefusal({ entity: "nova", can_configure: false, as: null, reason: "Only an admin or nova's creator can change its settings." }),
    ).toBe("Only an admin or nova's creator can change its settings.");
  });
  it("a gateway without the route keeps the controls live (its write refusal carries its own sentence)", () => {
    expect(accessRefusal(null)).toBeNull();
  });
  it("the pickers follow the answer: mind disabled + the sentence, identity read as text + the sentence", () => {
    const src = fs.readFileSync(path.join(__dirname, "mind_voice_settings.tsx"), "utf8");
    expect(src).toContain("disabled={Boolean(refused)}");
    expect(src.match(/<RefusalLine text=\{refused\} \/>/g)?.length).toBe(1);
    // Identity: the kit panel reads it as text with the sentence when the answer refuses.
    const identity = fs.readFileSync(path.join(__dirname, "identity_settings.tsx"), "utf8");
    expect(identity).toContain("const refusal = accessRefusal(access) || accessError;");
    expect(identity).toContain("refusal={refusal}");
  });
});
