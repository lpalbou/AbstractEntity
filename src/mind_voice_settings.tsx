/**
 * Settings → Mind (round 3, operator 2026-10-01): the kit's SHARED picker,
 * exactly as Code / Assistant / the gateway console mount it. "Gateway
 * default" is the first choice and the default: the entity then thinks with
 * the gateway's text route. A provider/model is the entity's own override.
 * Every change saves itself; going back to "Gateway default" clears the
 * override on the gateway (recorded in its history like any mind change).
 *
 * Its voice is part of its identity (framework ADR 0052): chosen in
 * Settings → Identity (identity_settings.tsx) with the kit's voice picker;
 * the voice helpers it shares live here (voiceValueOf, entityVoiceCreation).
 *
 * The state mapping is pure (mindValueOf / mindSaveBody / voiceValueOf) so the tests pin the default/override rules without a DOM.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  ProviderModelPicker,
  type ProviderModelPickerValue,
  type VoiceCreation,
  type VoicePreferences,
} from "@abstractframework/ui-kit";

import { authRefusedMsg } from "./gateway_session";
import { WordsLine } from "./words_line";
import {
  cloneVoice,
  designVoice,
  discoveryModelCapabilities,
  discoveryProviderModels,
  discoveryProviders,
  getEntityAccess,
  getEntitySubstrate,
  putEntitySubstrate,
  type EntityAccess,
  type EntitySubstrate,
  type EntityVoiceChoice,
} from "./stream_source";

// ------------------------------------------------------------- who may change it

/** R16.5 (operator ruling 2026-10-08): an entity's mind and identity are changed by an admin or the
 * entity's CREATOR — the gateway says which (`GET /entities/{name}/access`). `null` = the gateway
 * has no access route (older): the controls stay live and a refused write shows the gateway's own
 * sentence. The refusal sentence of someone who may not, else null. */
export function accessRefusal(access: EntityAccess | null): string | null {
  if (!access || access.can_configure) return null;
  return access.reason || "Only an admin or the entity's creator can change its settings.";
}

export function useEntityAccess(baseUrl: string, entity: string): { access: EntityAccess | null; error: string | null } {
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

/** The sentence line under a control the caller may not use (a note), or under a change the gateway
 * refused (`tone="error"`: the modal's error style, announced). The kit tooltip carries it too; the
 * words go through the shared renderer. */
export function RefusalLine({ text, tone = "note" }: { text: string; tone?: "note" | "error" }): React.ReactElement {
  return (
    <div
      className={tone === "error" ? "stg_error wsp_status_refused" : "wsp_status wsp_status_refused"}
      role={tone === "error" ? "alert" : "note"}
      data-af-tip={text}
      data-testid="entity-settings-refusal"
      data-tone={tone}
    >
      <WordsLine text={text} />
    </div>
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

/** "Create a voice" in his voice picker: the gateway's voice library (`voice/design`, `voice/clones`).
 * The new voice is selected and saved as his own, like any picked voice. */
export function entityVoiceCreation(baseUrl: string, token: string | null): VoiceCreation {
  return {
    design: (request) => designVoice(baseUrl, request, token),
    clone: (file, request) => cloneVoice(baseUrl, file, request, token),
  };
}
