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
import { describe, expect, it } from "vitest";

import {
  accessRefusal,
  mindDefaultHint,
  mindSaveBody,
  mindValueOf,
  substrateChoiceOf,
  voiceDefaultHint,
  voiceSaveBody,
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

describe("Voice: the kit's voice picker, Gateway default voice first", () => {
  const unset: EntityVoiceChoice = { provider: null, model: null, voice: null, source: "unset", effective: { provider: "supertonic", model: "supertonic-3", voice: "F1" } };
  const own: EntityVoiceChoice = { provider: "supertonic", model: "supertonic-3", voice: "M2", source: "entity" };

  it("shows the gateway default as the current value; its own voice as the override", () => {
    expect(voiceValueOf(unset)).toEqual({});
    expect(voiceDefaultHint(unset)).toBe("Gateway default · supertonic / supertonic-3 · F1");
    expect(voiceValueOf(own)).toEqual({ provider: "supertonic", model: "supertonic-3", voice: "M2" });
    expect(voiceDefaultHint(own)).toBeUndefined();
    const html = renderToStaticMarkup(
      <VoiceSettings
        value={voiceValueOf(unset)}
        onChange={() => {}}
        fetchCatalog={async () => ({})}
        intro={null}
        delivery={false}
        showReset={false}
        defaultHint={voiceDefaultHint(unset)}
        voiceDefaultLabel="Gateway default voice"
      />,
    );
    expect(html).toContain("Gateway default · supertonic / supertonic-3 · F1");
    expect(html).toContain("Gateway default voice");
    expect(html).not.toContain("Speaking speed");
    expect(html).not.toContain("Speech is generated");
  });

  it("saves provider + model + voice together, asks for a model when the voice has none, clears to the default", () => {
    expect(voiceSaveBody({ provider: "supertonic", model: "supertonic-3", voice: "M1" }, false)).toEqual({ provider: "supertonic", model: "supertonic-3", voice: "M1" });
    expect(voiceSaveBody({ provider: "supertonic", model: "", voice: "", profile: "F2" }, false)).toEqual({ needsModel: "supertonic", voice: "F2" });
    expect(voiceSaveBody({}, true)).toEqual({ clear: true });
    expect(voiceSaveBody({}, false)).toBeNull();
    expect(voiceSaveBody({ provider: "supertonic", model: "", voice: "" }, true)).toBeNull();
  });
});

describe("the bespoke forms are gone", () => {
  it("Settings mounts the shared pickers, not the old provider…/choose…/set his voice form", () => {
    const panel = fs.readFileSync(path.resolve(__dirname, "workspace_panel.tsx"), "utf8");
    expect(panel).toContain("<EntityMindPicker");
    expect(panel).toContain("<EntityVoicePicker");
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
  it("the pickers follow the answer: mind disabled + the sentence, voice read as text + the sentence", () => {
    const src = fs.readFileSync(path.join(__dirname, "mind_voice_settings.tsx"), "utf8");
    expect(src).toContain("disabled={Boolean(refused)}");
    expect(src.match(/<RefusalLine text=\{refused\} \/>/g)?.length).toBe(2);
    expect(src).toContain('data-testid="entity-voice-current"');
  });
});
