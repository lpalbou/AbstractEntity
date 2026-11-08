/**
 * Settings → Mind, below the mind picker (entity 0002; contract 2026-11-08 with gateway 1013 and
 * runtime 0867): which model each part of his thinking uses, and how his memory is bounded per turn.
 *
 * - What each part of thinking uses: Summaries and memory details, Understanding and dreams,
 *   Extraction. Each is the kit's shared ProviderModelPicker with "Same as the mind" | "Custom"; the
 *   line under it says what that part uses now ("Same as the mind (gpt-5.6-terra)" or
 *   "theforge-nvidia · qwen/qwen3.8-27b").
 * - Memory: memories retrieved per turn (1..400), rebuild sensitivity (0..1), rebuilds per turn at
 *   most (0..10). The kit has no number or slider component: the three are number fields in the
 *   kit's setting rows (the modal's input style), sensitivity included.
 *
 * Every change saves itself (`PUT …/cognition-profile`), then the page reads the profile again and
 * shows what the gateway stores. A refusal shows the gateway's sentence and the field returns to the
 * stored value. A gateway without the route (404) gets one sentence and the controls stay visible,
 * disabled. A member who may not configure him sees them disabled with the access sentence.
 *
 * Pure parts (`cognitionProfileOf`, `profileValueOf`, `profileSaveBody`, `readCognitionProfile`,
 * `saveCognitionChange`, `afterSave`) carry the rules so the tests pin them without a DOM.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { AfSettingRow, AfSettingsGroup, ProviderModelPicker, type ProviderModelPickerValue } from "@abstractframework/ui-kit";

import { authRefusedMsg } from "./gateway_session";
import { accessRefusal, RefusalLine, useEntityAccess } from "./mind_voice_settings";
import {
  discoveryModelCapabilities,
  discoveryProviderModels,
  discoveryProviders,
  getEntityCognitionProfile,
  putEntityCognitionProfile,
  type CognitionCapability,
  type CognitionCapabilityChoice,
  type CognitionProfilePut,
  type EntityCognitionProfile,
} from "./stream_source";
import { WordsLine } from "./words_line";

// ------------------------------------------------------------------ words

/** The first gateway release that serves the cognition profile (gateway 1013). 0.21.0 is the
 * release in preparation without the route; set this to the release that ships it. */
export const COGNITION_PROFILE_GATEWAY_VERSION = "0.22.0";

/** The one sentence a gateway without the route gets (contract: no silent hiding). */
export const COGNITION_PROFILE_UNAVAILABLE = `This gateway does not offer the cognition profile yet (gateway ≥ ${COGNITION_PROFILE_GATEWAY_VERSION}).`;

export const COGNITION_PARTS: ReadonlyArray<{ id: CognitionCapability; label: string }> = [
  { id: "summaries", label: "Summaries and memory details" },
  { id: "understanding", label: "Understanding and dreams" },
  { id: "extraction", label: "Extraction" },
];

export type MemoryField = "shelf_size" | "sensitivity" | "cap_per_turn";

export const MEMORY_FIELDS: ReadonlyArray<{ id: MemoryField; label: string; help: string; min: number; max: number; step: number }> = [
  {
    id: "shelf_size",
    label: "Memories retrieved per turn",
    help: "How many memories he may bring to mind for each turn, in visits and in his own time. A running day picks it up at its next start.",
    min: 1,
    max: 400,
    step: 1,
  },
  {
    id: "sensitivity",
    label: "Rebuild sensitivity",
    help: "How easily a new memory or a surprise makes him revisit what he already understood.",
    min: 0,
    max: 1,
    step: 0.05,
  },
  { id: "cap_per_turn", label: "Rebuilds per turn, at most", help: "A safety cap. 0 = only while he rests.", min: 0, max: 10, step: 1 },
];

// ------------------------------------------------------------- the answer

const CAPABILITY_SOURCES = ["profile", "mind"];
const SETTING_SOURCES = ["profile", "default"];

/** The GET/PUT answer, checked against the contract. A missing or mistyped field throws a sentence
 * naming it (loud: a gateway that drifted from the contract must not show a half-true page). */
export function cognitionProfileOf(raw: unknown): EntityCognitionProfile {
  const fail = (path: string): never => {
    throw new Error(`The gateway's answer about his thinking has no valid ${path}.`);
  };
  const obj = (v: unknown, path: string): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : fail(path);
  const str = (v: unknown, path: string): string => (typeof v === "string" && v.trim() ? v : fail(path));
  const num = (v: unknown, path: string): number => (typeof v === "number" && Number.isFinite(v) ? v : fail(path));
  const oneOf = (v: unknown, allowed: string[], path: string): string => (typeof v === "string" && allowed.includes(v) ? v : fail(path));

  const root = obj(raw, "profile");
  const caps = obj(root.capabilities, "capabilities");
  for (const { id } of COGNITION_PARTS) {
    const at = `capabilities.${id}`;
    const entry = obj(caps[id], at);
    const choice = obj(entry.choice, `${at}.choice`);
    if (choice.inherit !== "mind") {
      str(choice.provider, `${at}.choice.provider`);
      str(choice.model, `${at}.choice.model`);
    }
    const effective = obj(entry.effective, `${at}.effective`);
    str(effective.provider, `${at}.effective.provider`);
    str(effective.model, `${at}.effective.model`);
    oneOf(entry.source, CAPABILITY_SOURCES, `${at}.source`);
  }
  const recall = obj(root.recall, "recall");
  num(recall.shelf_size, "recall.shelf_size");
  oneOf(recall.source, SETTING_SOURCES, "recall.source");
  const rebuild = obj(root.rebuild, "rebuild");
  num(rebuild.sensitivity, "rebuild.sensitivity");
  num(rebuild.cap_per_turn, "rebuild.cap_per_turn");
  oneOf(rebuild.source, SETTING_SOURCES, "rebuild.source");
  const mind = obj(root.mind, "mind");
  str(mind.model, "mind.model");
  return root as unknown as EntityCognitionProfile;
}

/** What the page shows for a stored profile: each part's picker value and its line, and the three
 * memory fields as their input text. */
export interface ProfileValue {
  parts: Record<CognitionCapability, { picker: ProviderModelPickerValue; line: string }>;
  memory: Record<MemoryField, string>;
}

function isInherit(choice: CognitionCapabilityChoice): choice is { inherit: "mind" } {
  return (choice as { inherit?: string }).inherit === "mind";
}

export function profileValueOf(profile: EntityCognitionProfile): ProfileValue {
  const parts = {} as ProfileValue["parts"];
  for (const { id } of COGNITION_PARTS) {
    const { choice, effective, source } = profile.capabilities[id];
    parts[id] = {
      picker: isInherit(choice) ? { provider: "", model: "" } : { provider: choice.provider, model: choice.model, reasoning: choice.thinking || "" },
      line: source === "mind" ? `Same as the mind (${effective.model})` : `${effective.provider} · ${effective.model}`,
    };
  }
  return {
    parts,
    memory: {
      shelf_size: String(profile.recall.shelf_size),
      sensitivity: String(profile.rebuild.sensitivity),
      cap_per_turn: String(profile.rebuild.cap_per_turn),
    },
  };
}

// ---------------------------------------------------------------- a change

export type ProfileChange = { part: CognitionCapability; value: ProviderModelPickerValue } | { field: MemoryField; text: string };

/** Half a provider/model pair: the picker waits for the other half before anything is saved. */
export function pickerPending(value: ProviderModelPickerValue): boolean {
  return Boolean(String(value.provider || "").trim()) !== Boolean(String(value.model || "").trim());
}

/** What a change writes, or null when there is nothing to write (already stored, half a pair, an
 * empty field). Numbers go as typed: the gateway owns the ranges and refuses with its sentence. */
export function profileSaveBody(change: ProfileChange, profile: EntityCognitionProfile): CognitionProfilePut | null {
  if ("part" in change) {
    const stored = profile.capabilities[change.part].choice;
    const provider = String(change.value.provider || "").trim();
    const model = String(change.value.model || "").trim();
    if (!provider && !model) return isInherit(stored) ? null : { capabilities: { [change.part]: { inherit: "mind" } } };
    if (!provider || !model) return null;
    const thinking = String(change.value.reasoning || "").trim();
    const next: CognitionCapabilityChoice = { provider, model, ...(thinking ? { thinking } : {}) };
    if (!isInherit(stored)) {
      if (stored.provider === provider && stored.model === model && (stored.thinking || "") === thinking) return null;
      // A token cap set elsewhere is kept: changing the model must not drop it silently.
      if (typeof stored.max_input_tokens === "number") next.max_input_tokens = stored.max_input_tokens;
    }
    return { capabilities: { [change.part]: next } };
  }
  const text = change.text.trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  if (change.field === "shelf_size") return n === profile.recall.shelf_size ? null : { recall: { shelf_size: n } };
  if (change.field === "sensitivity") return n === profile.rebuild.sensitivity ? null : { rebuild: { sensitivity: n } };
  return n === profile.rebuild.cap_per_turn ? null : { rebuild: { cap_per_turn: n } };
}

// ------------------------------------------------------------ read and save

export type ProfileAt = CognitionCapability | MemoryField;

export interface ProfileState {
  phase: "reading" | "ready" | "unavailable" | "error";
  profile: EntityCognitionProfile | null;
  error: string | null;
  /** What is being chosen or typed and not stored yet. */
  drafts: { parts: Partial<Record<CognitionCapability, ProviderModelPickerValue>>; memory: Partial<Record<MemoryField, string>> };
  /** The last save, under the control it came from. */
  status: { at: ProfileAt; text: string; tone: "" | "ok" | "refused" } | null;
}

export const PROFILE_READING: ProfileState = { phase: "reading", profile: null, error: null, drafts: { parts: {}, memory: {} }, status: null };

export type ProfileRead = Pick<ProfileState, "phase" | "profile" | "error">;

function refusalSentence(e: unknown): string {
  const err = e as Error & { status?: number };
  return err.status === 401 || err.status === 403 ? authRefusedMsg(err.status, err.message) : err.message || String(e);
}

/** GET: ready with the checked profile, unavailable on 404, else the error in a sentence. */
export async function readCognitionProfile(baseUrl: string, entity: string): Promise<ProfileRead> {
  try {
    const raw = await getEntityCognitionProfile(baseUrl, entity);
    if (raw === null) return { phase: "unavailable", profile: null, error: null };
    return { phase: "ready", profile: cognitionProfileOf(raw), error: null };
  } catch (e) {
    return { phase: "error", profile: null, error: `His thinking settings could not be read: ${refusalSentence(e)}` };
  }
}

export type SaveOutcome = { saved: true; read: ProfileRead } | { saved: false; sentence: string };

/** PUT the change, then read the profile again (the page shows what the gateway stores). */
export async function saveCognitionChange(baseUrl: string, entity: string, token: string | null, body: CognitionProfilePut): Promise<SaveOutcome> {
  try {
    await putEntityCognitionProfile(baseUrl, entity, token, body);
  } catch (e) {
    return { saved: false, sentence: refusalSentence(e) };
  }
  return { saved: true, read: await readCognitionProfile(baseUrl, entity) };
}

function withoutDraft(drafts: ProfileState["drafts"], at: ProfileAt): ProfileState["drafts"] {
  const parts = { ...drafts.parts };
  const memory = { ...drafts.memory };
  delete parts[at as CognitionCapability];
  delete memory[at as MemoryField];
  return { parts, memory };
}

/** The state after a save: the re-read profile and "Saved", or the stored profile kept with the
 * refusal sentence. Either way the control drops its draft and shows the stored value. */
export function afterSave(state: ProfileState, at: ProfileAt, outcome: SaveOutcome): ProfileState {
  const drafts = withoutDraft(state.drafts, at);
  if (!outcome.saved) return { ...state, drafts, status: { at, text: outcome.sentence, tone: "refused" } };
  return { ...state, ...outcome.read, drafts, status: outcome.read.phase === "ready" ? { at, text: "Saved", tone: "ok" } : null };
}

// ------------------------------------------------------------------ view

export interface CognitionProfileViewProps {
  baseUrl: string;
  state: ProfileState;
  /** The access sentence of a member who may not configure him (null = may). */
  refused: string | null;
  onPart(part: CognitionCapability, value: ProviderModelPickerValue): void;
  onField(field: MemoryField, text: string): void;
  onCommit(field: MemoryField): void;
}

function StatusLine({ state, at }: { state: ProfileState; at: ProfileAt }): React.ReactElement | null {
  const status = state.status;
  if (!status || status.at !== at) return null;
  if (status.tone === "refused") return <RefusalLine text={status.text} />;
  return (
    <div className={`wsp_status${status.tone ? ` wsp_status_${status.tone}` : ""}`} role="status" aria-live="polite" data-cognition-status={at}>
      <WordsLine text={status.text} />
    </div>
  );
}

export function CognitionProfileView({ baseUrl, state, refused, onPart, onField, onCommit }: CognitionProfileViewProps): React.ReactElement {
  const ids = useId().replace(/:/g, "");
  const value = state.profile ? profileValueOf(state.profile) : null;
  const disabled = Boolean(refused) || state.phase !== "ready";
  return (
    <div className="stg_stack mcp" data-testid="entity-cognition-profile" data-phase={state.phase}>
      {state.phase === "unavailable" ? (
        <div className="stg_callout" role="note" data-cognition-unavailable="">
          <WordsLine text={COGNITION_PROFILE_UNAVAILABLE} />
        </div>
      ) : null}
      {state.phase === "error" && state.error ? (
        <div className="stg_error" role="alert" data-cognition-error="">
          <WordsLine text={state.error} />
        </div>
      ) : null}
      <AfSettingsGroup title="What each part of thinking uses" help="Each part thinks with the mind unless you choose another model for it. Every change saves itself.">
        {refused ? <RefusalLine text={refused} /> : null}
        {state.phase === "reading" ? (
          <div className="wsp_status" role="status">
            <WordsLine text="Reading…" />
          </div>
        ) : null}
        {COGNITION_PARTS.map(({ id, label }) => (
          <AfSettingRow key={id} label={label} stack setting={`cognition-${id}`}>
            <div className="wsp_picker mcp_part">
              <ProviderModelPicker
                value={state.drafts.parts[id] ?? value?.parts[id].picker ?? { provider: "", model: "" }}
                onChange={(next) => onPart(id, next)}
                defaultModeLabel="Same as the mind"
                customModeLabel="Custom"
                inheritLabel="Model default"
                optionsInDefaultMode={false}
                defaultHint="A change of mind changes this too."
                fetchProviders={() => discoveryProviders(baseUrl)}
                fetchModels={(provider) => discoveryProviderModels(baseUrl, provider)}
                fetchModelCapabilities={(model, provider) => discoveryModelCapabilities(baseUrl, model, provider)}
                disabled={disabled}
              />
              {value ? (
                <div className="mcp_effective" data-cognition-effective={id}>
                  <WordsLine text={value.parts[id].line} />
                </div>
              ) : null}
              <StatusLine state={state} at={id} />
            </div>
          </AfSettingRow>
        ))}
      </AfSettingsGroup>
      <AfSettingsGroup title="Memory" help="Every change saves itself when you leave the field.">
        {refused ? <RefusalLine text={refused} /> : null}
        {MEMORY_FIELDS.map((f) => (
          <React.Fragment key={f.id}>
            <AfSettingRow label={f.label} help={f.help} htmlFor={`${ids}-${f.id}`} setting={`memory-${f.id}`} className="mcp_field">
              <input
                id={`${ids}-${f.id}`}
                type="number"
                className="stg_input mcp_number"
                inputMode={f.step < 1 ? "decimal" : "numeric"}
                min={f.min}
                max={f.max}
                step={f.step}
                value={state.drafts.memory[f.id] ?? value?.memory[f.id] ?? ""}
                disabled={disabled}
                data-memory-field={f.id}
                onChange={(e) => onField(f.id, e.target.value)}
                onBlur={() => onCommit(f.id)}
                onKeyDown={(e) => {
                  // Enter saves through the blur, so the value is written once.
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </AfSettingRow>
            <StatusLine state={state} at={f.id} />
          </React.Fragment>
        ))}
      </AfSettingsGroup>
    </div>
  );
}

// ------------------------------------------------------------- the section

/** Settings → Mind's cognition profile. `mindKey` changes when his mind changes: the lines that say
 * "Same as the mind (…)" are read again. */
export function EntityCognitionProfile({
  baseUrl,
  entity,
  token,
  mindKey = "",
}: {
  baseUrl: string;
  entity: string;
  token: string | null;
  mindKey?: string;
}): React.ReactElement {
  const [state, setState] = useState<ProfileState>(PROFILE_READING);
  const latest = useRef(state);
  latest.current = state;
  // Saves run one after another: each sees the stored profile the previous one left.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const { access, error: accessError } = useEntityAccess(baseUrl, entity);
  const refused = accessRefusal(access) || accessError;

  useEffect(() => {
    let alive = true;
    readCognitionProfile(baseUrl, entity).then((read) => alive && setState((s) => ({ ...s, ...read })));
    return () => {
      alive = false;
    };
  }, [baseUrl, entity, mindKey]);

  const save = useCallback(
    (at: ProfileAt, body: CognitionProfilePut) => {
      setState((s) => ({ ...s, status: { at, text: "Saving…", tone: "" } }));
      queue.current = queue.current.then(async () => {
        const outcome = await saveCognitionChange(baseUrl, entity, token, body);
        setState((s) => afterSave(s, at, outcome));
      });
    },
    [baseUrl, entity, token],
  );

  const onPart = useCallback(
    (part: CognitionCapability, next: ProviderModelPickerValue) => {
      const profile = latest.current.profile;
      if (!profile) return;
      const body = pickerPending(next) ? null : profileSaveBody({ part, value: next }, profile);
      if (!body && !pickerPending(next)) {
        setState((s) => ({ ...s, drafts: withoutDraft(s.drafts, part) }));
        return;
      }
      setState((s) => ({ ...s, drafts: { ...s.drafts, parts: { ...s.drafts.parts, [part]: next } } }));
      if (body) save(part, body);
    },
    [save],
  );

  const onField = useCallback((field: MemoryField, text: string) => {
    setState((s) => ({ ...s, drafts: { ...s.drafts, memory: { ...s.drafts.memory, [field]: text } } }));
  }, []);

  const onCommit = useCallback(
    (field: MemoryField) => {
      const { profile, drafts } = latest.current;
      const text = drafts.memory[field];
      if (!profile || text === undefined) return;
      const body = profileSaveBody({ field, text }, profile);
      if (!body) {
        setState((s) => ({ ...s, drafts: withoutDraft(s.drafts, field) }));
        return;
      }
      save(field, body);
    },
    [save],
  );

  return <CognitionProfileView baseUrl={baseUrl} state={state} refused={refused} onPart={onPart} onField={onField} onCommit={onCommit} />;
}
