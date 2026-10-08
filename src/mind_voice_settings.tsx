/**
 * Settings → Mind and → Voice (round 3, operator 2026-10-01): the kit's
 * SHARED pickers, exactly as Code / Assistant / the gateway console mount
 * them. "Gateway default" is the first choice and the default: the entity
 * then thinks with the gateway's text route and speaks with its default
 * voice. A provider/model (or a voice) is the entity's own override. Every
 * change saves itself; going back to "Gateway default" clears the override
 * on the gateway (recorded in its history like any mind change).
 *
 * The state mapping is pure (mindValueOf / mindSaveBody / voiceValueOf /
 * voiceSaveBody) so the tests pin the default/override rules without a DOM.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ProviderModelPicker,
  VoiceSettings,
  voiceRouteText,
  type ProviderModelPickerValue,
  type VoicePreferences,
} from "@abstractframework/ui-kit";

import { authRefusedMsg } from "./gateway_session";
import {
  discoveryModelCapabilities,
  discoveryProviderModels,
  discoveryProviders,
  getEntityAccess,
  getEntitySubstrate,
  getEntityVoice,
  getVoiceCatalog,
  putEntitySubstrate,
  putEntityVoice,
  type EntityAccess,
  type EntitySubstrate,
  type EntityVoiceChoice,
} from "./stream_source";

// ------------------------------------------------------------- who may change it

/** R16.5 (operator ruling 2026-10-08): an entity's mind and voice are changed by an admin or the
 * entity's CREATOR — the gateway says which (`GET /entities/{name}/access`). `null` = the gateway
 * has no access route (older): the controls stay live and a refused write shows the gateway's own
 * sentence. The refusal sentence of someone who may not, else null. */
export function accessRefusal(access: EntityAccess | null): string | null {
  if (!access || access.can_configure) return null;
  return access.reason || "Only an admin or the entity's creator can change its settings.";
}

function useEntityAccess(baseUrl: string, entity: string): { access: EntityAccess | null; error: string | null } {
  const [state, setState] = useState<{ access: EntityAccess | null; error: string | null }>({ access: null, error: null });
  useEffect(() => {
    let alive = true;
    getEntityAccess(baseUrl, entity)
      .then((access) => alive && setState({ access, error: null }))
      .catch((e: Error) => alive && setState({ access: null, error: `Who may change its settings could not be read: ${e.message}` }));
    return () => {
      alive = false;
    };
  }, [baseUrl, entity]);
  return state;
}

/** The sentence line under a control the caller may not use (the kit tooltip carries it too). */
function RefusalLine({ text }: { text: string }): React.ReactElement {
  return (
    <p className="wsp_status wsp_status_refused" role="note" data-af-tip={text} data-testid="entity-settings-refusal">
      {text}
    </p>
  );
}

// ------------------------------------------------------------------ mind

/** The entity's own mind as the views keep it (null = Gateway default). */
export interface SubstrateChoice {
  provider: string;
  model: string;
  /** Reasoning effort (wire key `thinking`) — optional; null/absent = unset. */
  thinking?: string | null;
}

export function substrateChoiceOf(s: EntitySubstrate | null): SubstrateChoice | null {
  return s && s.source === "entity" && s.provider && s.model ? { provider: s.provider, model: s.model, thinking: s.thinking ?? null } : null;
}

/** The picker value for a GET /substrate answer: empty = Gateway default. */
export function mindValueOf(s: EntitySubstrate | null): ProviderModelPickerValue {
  if (!s || s.source !== "entity" || !s.provider || !s.model) return { provider: "", model: "" };
  const out: ProviderModelPickerValue = { provider: s.provider, model: s.model, reasoning: s.thinking || "" };
  if (s.speculation === false || (s.speculation && typeof s.speculation === "object")) {
    out.speculation = s.speculation as ProviderModelPickerValue["speculation"];
  }
  return out;
}

export type MindSave = { provider: string; model: string; thinking: string | null; speculation: unknown } | { clear: true } | null;

/** What a picker change writes: null = nothing yet (already the default,
 * or half a pair); {clear:true} = back to the Gateway default. */
export function mindSaveBody(next: ProviderModelPickerValue, hasOwn: boolean): MindSave {
  const provider = String(next.provider || "").trim();
  const model = String(next.model || "").trim();
  if (!provider && !model) return hasOwn ? { clear: true } : null;
  if (!provider || !model) return null;
  return {
    provider,
    model,
    thinking: next.reasoning ? next.reasoning : null,
    speculation: next.speculation === undefined ? null : next.speculation,
  };
}

/** One short line naming what "Gateway default" is. */
export function mindDefaultHint(s: EntitySubstrate | null): string {
  const gd = s?.gateway_default;
  if (gd?.provider && gd?.model) return `Gateway default: ${gd.provider} · ${gd.model}.`;
  return s?.note || "This gateway has no text model yet.";
}

export function EntityMindPicker({
  baseUrl,
  entity,
  token,
  onSaved,
}: {
  baseUrl: string;
  entity: string;
  token: string | null;
  /** Called with the saved answer (the view keeps its own copy for the loop cue). */
  onSaved?(s: EntitySubstrate): void;
}): React.ReactElement {
  const [mind, setMind] = useState<EntitySubstrate | null>(null);
  const [value, setValue] = useState<ProviderModelPickerValue>({ provider: "", model: "" });
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "error" | "" } | null>(null);
  const { access, error: accessError } = useEntityAccess(baseUrl, entity);
  const refused = accessRefusal(access) || accessError;

  useEffect(() => {
    let alive = true;
    getEntitySubstrate(baseUrl, entity)
      .then((s) => {
        if (!alive) return;
        setMind(s);
        setValue(mindValueOf(s));
      })
      .catch((e: Error) => alive && setStatus({ text: `The mind could not be read: ${e.message}`, tone: "error" }));
    return () => {
      alive = false;
    };
  }, [baseUrl, entity]);

  const change = useCallback(
    (next: ProviderModelPickerValue) => {
      setValue(next);
      const body = mindSaveBody(next, mind?.source === "entity");
      if (!body) return;
      setStatus({ text: "Saving…", tone: "" });
      putEntitySubstrate(baseUrl, entity, token, body)
        .then((s) => {
          setMind(s);
          setValue(mindValueOf(s));
          setStatus({ text: "clear" in body ? "Saved: it uses the Gateway default." : "Saved", tone: "ok" });
          onSaved?.(s);
        })
        .catch((e: Error & { status?: number }) =>
          setStatus({
            text: `Not saved: ${e.status === 401 || e.status === 403 ? authRefusedMsg(e.status, e.message) : e.message}`,
            tone: "error",
          }),
        );
    },
    [baseUrl, entity, token, mind, onSaved],
  );

  const gd = mind?.gateway_default;
  return (
    <div className="wsp_picker" data-testid="entity-mind-picker">
      <ProviderModelPicker
        value={value}
        onChange={change}
        inheritLabel="Gateway default"
        optionsInDefaultMode={false}
        enableSpeculation
        effectiveDefault={gd?.provider && gd?.model ? { provider: gd.provider, model: gd.model } : undefined}
        defaultHint={mindDefaultHint(mind)}
        fetchProviders={() => discoveryProviders(baseUrl)}
        fetchModels={(provider) => discoveryProviderModels(baseUrl, provider)}
        fetchModelCapabilities={(model, provider) => discoveryModelCapabilities(baseUrl, model, provider)}
        disabled={Boolean(refused)}
      />
      {refused ? <RefusalLine text={refused} /> : null}
      {status ? (
        <p className={`wsp_status${status.tone ? ` wsp_status_${status.tone}` : ""}`} role="status" aria-live="polite">
          {status.text}
        </p>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------- voice

/** The picker value for a GET /voice answer: empty = Gateway default. */
export function voiceValueOf(v: EntityVoiceChoice | null): VoicePreferences {
  if (!v || !v.provider) return {};
  return { provider: v.provider || "", model: v.model || "", voice: v.voice || "" };
}

export type VoiceSave =
  | { provider: string; model: string; voice: string }
  | { clear: true }
  | { needsModel: string; voice: string }
  | null;

/** What a voice picker change writes. The door stores provider + model +
 * voice together: a voice picked without a model asks the caller for its
 * provider's speech model (`needsModel`). */
export function voiceSaveBody(next: VoicePreferences, hasOwn: boolean): VoiceSave {
  const provider = String(next.provider || "").trim();
  const voice = String(next.voice || next.profile || "").trim();
  if (!provider && !voice) return hasOwn ? { clear: true } : null;
  if (!provider || !voice) return null;
  const model = String(next.model || "").trim();
  return model ? { provider, model, voice } : { needsModel: provider, voice };
}

export function voiceDefaultHint(v: EntityVoiceChoice | null): string | undefined {
  if (v?.provider) return undefined;
  const eff = v?.effective;
  // The kit's wording ("Gateway default · supertonic / supertonic-3"), plus the voice id the route names.
  if (eff?.provider) return `Gateway default · ${voiceRouteText(eff)} · ${eff.voice || "the engine's default voice"}`;
  return v?.note || "No gateway default voice is set, so the speech engine decides.";
}

export function EntityVoicePicker({ baseUrl, entity, token }: { baseUrl: string; entity: string; token: string | null }): React.ReactElement {
  const [current, setCurrent] = useState<EntityVoiceChoice | null>(null);
  const [value, setValue] = useState<VoicePreferences>({});
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "error" | "" } | null>(null);
  const { access, error: accessError } = useEntityAccess(baseUrl, entity);
  const refused = accessRefusal(access) || accessError;

  useEffect(() => {
    let alive = true;
    getEntityVoice(baseUrl, entity)
      .then((v) => {
        if (!alive) return;
        setCurrent(v);
        setValue(voiceValueOf(v));
      })
      .catch((e: Error) => alive && setStatus({ text: `The voice could not be read: ${e.message}`, tone: "error" }));
    return () => {
      alive = false;
    };
  }, [baseUrl, entity]);

  const change = useCallback(
    async (next: VoicePreferences) => {
      setValue(next);
      let body = voiceSaveBody(next, Boolean(current?.provider));
      if (!body) return;
      if ("needsModel" in body) {
        const catalog = await getVoiceCatalog(baseUrl, body.needsModel).catch(() => null);
        const model = catalog?.tts_models_by_provider?.[body.needsModel]?.[0] || "";
        if (!model) {
          setStatus({ text: `Not saved: ${body.needsModel} lists no speech model for this voice.`, tone: "error" });
          return;
        }
        body = { provider: body.needsModel, model, voice: body.voice };
      }
      const sent = body;
      setStatus({ text: "Saving…", tone: "" });
      putEntityVoice(baseUrl, entity, sent, token)
        .then((v) => {
          setCurrent(v);
          setValue(voiceValueOf(v));
          setStatus({ text: "clear" in sent ? "Saved: it uses the Gateway default voice." : "Saved", tone: "ok" });
        })
        .catch((e: Error & { status?: number }) =>
          setStatus({
            text: `Not saved: ${e.status === 401 || e.status === 403 ? authRefusedMsg(e.status, e.message) : e.message}`,
            tone: "error",
          }),
        );
    },
    [baseUrl, entity, token, current],
  );

  return (
    <div className="wsp_picker" data-testid="entity-voice-picker">
      {refused ? (
        <>
          {/* Someone who may not change it reads its voice as text (the console's rule). */}
          <p className="wsp_status" data-testid="entity-voice-current">
            {current?.provider ? `Its own voice: ${current.provider} · ${current.voice || "?"}.` : voiceDefaultHint(current)}
          </p>
          <RefusalLine text={refused} />
        </>
      ) : (
      <VoiceSettings
        value={value}
        onChange={(next) => void change(next)}
        fetchCatalog={(provider, model) => getVoiceCatalog(baseUrl, provider, model)}
        intro={null}
        delivery={false}
        showReset={false}
        defaultHint={voiceDefaultHint(current)}
        voiceDefaultLabel="Gateway default voice"
      />
      )}
      {status ? (
        <p className={`wsp_status${status.tone ? ` wsp_status_${status.tone}` : ""}`} role="status" aria-live="polite">
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
