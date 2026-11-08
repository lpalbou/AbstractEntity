/**
 * Settings → Mind, below the mind picker (entity 0002; contract 2026-11-08 with gateway 1013 and
 * runtime 0867): which model each part of his thinking uses, and how his memory is bounded per turn.
 *
 * - What each part of thinking uses: Summaries and memory details, Understanding and dreams,
 *   Extraction. Each is the kit's shared ProviderModelPicker with "Same as the mind" | "Custom"; the
 *   line under it says what that part uses now ("Same as the mind (gpt-5.6-terra)",
 *   "theforge-nvidia · qwen/qwen3.8-27b", or "No mind chosen yet" when the gateway cannot name one).
 * - Memory: memories retrieved per turn (1..400), rebuild sensitivity (0..1), rebuilds per turn at
 *   most (0..10). The kit has no number or slider component: the three are number fields in the
 *   kit's setting rows (the modal's input style), sensitivity included.
 *
 * Every change saves itself (`PUT …/cognition-profile`; a number on Enter or when the field is left),
 * then the page reads the profile again and shows what the gateway stores. Saves run one at a time;
 * the same save twice in a row is sent once. Each control keeps its own status line, cleared when that
 * control changes. A refusal shows the gateway's sentence as an error and the field returns to the
 * stored value — unless something new was typed meanwhile, which stays. A gateway without the route
 * (404) gets one sentence and the controls stay visible, disabled. A member who may not configure him
 * sees them disabled with the access sentence.
 *
 * Pure parts (`cognitionProfileOf`, `profileValueOf`, `profileSaveBody`, `readCognitionProfile`,
 * `saveCognitionChange`, `afterSave`, `profileController`) carry the rules so the tests pin them
 * without a DOM.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AfSettingRow, AfSettingsGroup, ProviderModelPicker, type ProviderModelPickerValue } from "@abstractframework/ui-kit";

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

/** The first gateway release that serves the cognition profile (gateway 1013, in abstractgateway's
 * changelog.d after the 0.21.0 merge); set this to the release that ships it. */
export const COGNITION_PROFILE_GATEWAY_VERSION = "0.22.0";

/** The one sentence a gateway without the route gets (contract: no silent hiding). */
export const COGNITION_PROFILE_UNAVAILABLE = `This gateway does not offer the cognition profile yet (gateway ≥ ${COGNITION_PROFILE_GATEWAY_VERSION}).`;

/** The line of a part that follows a mind the gateway cannot name (no text model yet). */
export const NO_MIND_YET = "No mind chosen yet";

export const COGNITION_PARTS: ReadonlyArray<{ id: CognitionCapability; label: string; help?: string }> = [
  { id: "summaries", label: "Summaries and memory details" },
  { id: "understanding", label: "Understanding and dreams" },
  { id: "extraction", label: "Extraction", help: "Pulls facts and names out of what he reads and hears. Not used yet." },
];

export const PARTS_HELP = "Each part thinks with the mind unless you choose another model for it. Every change saves itself.";
export const FOLLOWS_THE_MIND = "Follows the mind if you change it.";
export const MEMORY_HELP =
  "A rebuild is when a new memory or a surprise makes him revisit what he already understood. Every change saves itself when you press Enter or leave the field.";

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
  { id: "sensitivity", label: "Rebuild sensitivity", help: "How easily a new memory or a surprise starts a rebuild.", min: 0, max: 1, step: 0.05 },
  { id: "cap_per_turn", label: "Rebuilds per turn, at most", help: "A safety cap. 0 = only while he rests.", min: 0, max: 10, step: 1 },
];

// ------------------------------------------------------------- the answer

const CAPABILITY_SOURCES = ["profile", "mind"];
const SETTING_SOURCES = ["profile", "default"];
const MIND_SOURCES = ["entity", "gateway", "unset"];

/** The GET/PUT answer, checked against the contract. A missing or mistyped field throws a sentence
 * naming it (loud: a gateway that drifted from the contract must not show a half-true page). The one
 * absence the contract allows: `effective: null` on a part that follows a mind the gateway cannot
 * name (`mind.source: "unset"`). */
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
  const mind = obj(root.mind, "mind");
  const mindUnset = oneOf(mind.source, MIND_SOURCES, "mind.source") === "unset";
  if (!mindUnset) str(mind.model, "mind.model");
  const caps = obj(root.capabilities, "capabilities");
  for (const { id } of COGNITION_PARTS) {
    const at = `capabilities.${id}`;
    const entry = obj(caps[id], at);
    const choice = obj(entry.choice, `${at}.choice`);
    const inherits = choice.inherit === "mind";
    if (!inherits) {
      str(choice.provider, `${at}.choice.provider`);
      str(choice.model, `${at}.choice.model`);
    }
    oneOf(entry.source, CAPABILITY_SOURCES, `${at}.source`);
    if (entry.effective === null && inherits && mindUnset) continue;
    const effective = obj(entry.effective, `${at}.effective`);
    str(effective.provider, `${at}.effective.provider`);
    str(effective.model, `${at}.effective.model`);
  }
  const recall = obj(root.recall, "recall");
  num(recall.shelf_size, "recall.shelf_size");
  oneOf(recall.source, SETTING_SOURCES, "recall.source");
  const rebuild = obj(root.rebuild, "rebuild");
  num(rebuild.sensitivity, "rebuild.sensitivity");
  num(rebuild.cap_per_turn, "rebuild.cap_per_turn");
  oneOf(rebuild.source, SETTING_SOURCES, "rebuild.source");
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
      line: !effective ? NO_MIND_YET : source === "mind" ? `Same as the mind (${effective.model})` : `${effective.provider} · ${effective.model}`,
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
/** What a control holds before it is stored: a picker value or a field's text. */
export type ProfileDraft = ProviderModelPickerValue | string;
export type ProfileStatus = { text: string; tone: "" | "ok" | "refused" };

export interface ProfileState {
  phase: "reading" | "ready" | "unavailable" | "error";
  profile: EntityCognitionProfile | null;
  error: string | null;
  /** What is being chosen or typed and not stored yet. */
  drafts: { parts: Partial<Record<CognitionCapability, ProviderModelPickerValue>>; memory: Partial<Record<MemoryField, string>> };
  /** Each control's own status line (its last save), cleared when that control changes. */
  status: Partial<Record<ProfileAt, ProfileStatus>>;
}

export const PROFILE_READING: ProfileState = { phase: "reading", profile: null, error: null, drafts: { parts: {}, memory: {} }, status: {} };

export type ProfileRead = Pick<ProfileState, "phase" | "profile" | "error">;

const isPart = (at: ProfileAt): at is CognitionCapability => COGNITION_PARTS.some((p) => p.id === at);

/** The same choice or the same text (a picker value without reasoning equals one with ""). */
export function sameDraft(a: ProfileDraft | undefined, b: ProfileDraft | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (typeof a === "string" || typeof b === "string") return a === b;
  const key = (v: ProviderModelPickerValue) => [v.provider, v.model, v.reasoning].map((x) => String(x || "").trim()).join("\u0000");
  return key(a) === key(b);
}

/** What a control shows: its draft, else the stored value. */
export function shownValue(state: ProfileState, at: ProfileAt): ProfileDraft | undefined {
  const value = state.profile ? profileValueOf(state.profile) : null;
  if (isPart(at)) return state.drafts.parts[at] ?? value?.parts[at].picker;
  return state.drafts.memory[at] ?? value?.memory[at];
}

function withDraft(drafts: ProfileState["drafts"], at: ProfileAt, draft: ProfileDraft | undefined): ProfileState["drafts"] {
  const parts = { ...drafts.parts };
  const memory = { ...drafts.memory };
  if (isPart(at)) {
    if (draft === undefined) delete parts[at];
    else parts[at] = draft as ProviderModelPickerValue;
  } else if (draft === undefined) delete memory[at];
  else memory[at] = draft as string;
  return { parts, memory };
}

function withStatus(state: ProfileState, at: ProfileAt, status: ProfileStatus | null): ProfileState {
  const next = { ...state.status };
  if (status) next[at] = status;
  else delete next[at];
  return { ...state, status: next };
}

/** The gateway's own sentence. Only when it gave none: a plain one for the status. */
function refusalSentence(e: unknown): string {
  const err = e as Error & { status?: number; detail?: string };
  const said = (err.detail ?? err.message ?? "").trim();
  if (said) return said;
  if (err.status === 401) return "Sign in to change his settings.";
  if (err.status === 403) return "You may not change his settings.";
  return String(e);
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

/** The state after a save of `sent` from control `at`: the re-read profile and "Saved", or the stored
 * profile kept with the refusal sentence. The control drops its draft only while the draft is still
 * what was sent: something typed or chosen during the save stays. */
export function afterSave(state: ProfileState, at: ProfileAt, outcome: SaveOutcome, sent: ProfileDraft): ProfileState {
  const draft = isPart(at) ? state.drafts.parts[at] : state.drafts.memory[at];
  const drafts = sameDraft(draft, sent) ? withDraft(state.drafts, at, undefined) : state.drafts;
  if (!outcome.saved) return withStatus({ ...state, drafts }, at, { text: outcome.sentence, tone: "refused" });
  return withStatus({ ...state, ...outcome.read, drafts }, at, outcome.read.phase === "ready" ? { text: "Saved", tone: "ok" } : null);
}

/** The state the controls read and write; `get` is always the latest (no render in between). */
export interface ProfileStore {
  get(): ProfileState;
  set(update: (s: ProfileState) => ProfileState): void;
}

export interface ProfileController {
  /** A picker's change. */
  part(part: CognitionCapability, value: ProviderModelPickerValue): void;
  /** A number field's text, as typed (saved by `commit`). */
  field(field: MemoryField, text: string): void;
  /** Enter, or the field left: save what it holds. */
  commit(field: MemoryField): void;
  /** Resolves once every queued save has landed. */
  idle(): Promise<void>;
}

/** The controls' rules, without React: one save at a time (each sees the profile the previous one
 * left); a save identical to the one on its way for that control is not sent again (a keyboard pick
 * reports twice; Enter then leaving the field commits twice); a control's status clears when it
 * changes; a draft stays until it is stored, refused, or back to the stored value. */
export function profileController(store: ProfileStore, send: (body: CognitionProfilePut) => Promise<SaveOutcome>): ProfileController {
  let queue: Promise<void> = Promise.resolve();
  const inFlight = new Map<ProfileAt, string>();

  const save = (at: ProfileAt, body: CognitionProfilePut, sent: ProfileDraft) => {
    const key = JSON.stringify(body);
    if (inFlight.get(at) === key) return;
    inFlight.set(at, key);
    store.set((s) => withStatus(s, at, { text: "Saving…", tone: "" }));
    queue = queue.then(async () => {
      const outcome = await send(body);
      if (inFlight.get(at) === key) inFlight.delete(at);
      store.set((s) => afterSave(s, at, outcome, sent));
    });
  };

  return {
    part(part, value) {
      const state = store.get();
      if (!state.profile || sameDraft(shownValue(state, part), value)) return;
      const pending = pickerPending(value);
      const body = pending ? null : profileSaveBody({ part, value }, state.profile);
      store.set((s) => withStatus({ ...s, drafts: withDraft(s.drafts, part, body || pending ? value : undefined) }, part, null));
      if (body) save(part, body, value);
    },
    field(field, text) {
      if (sameDraft(shownValue(store.get(), field), text)) return;
      store.set((s) => withStatus({ ...s, drafts: withDraft(s.drafts, field, text) }, field, null));
    },
    commit(field) {
      const { profile, drafts } = store.get();
      const text = drafts.memory[field];
      if (!profile || text === undefined) return;
      const body = profileSaveBody({ field, text }, profile);
      if (body) save(field, body, text);
      else store.set((s) => (sameDraft(s.drafts.memory[field], text) ? { ...s, drafts: withDraft(s.drafts, field, undefined) } : s));
    },
    idle: () => queue,
  };
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
  const status = state.status[at];
  if (!status) return null;
  if (status.tone === "refused") return <RefusalLine text={status.text} tone="error" />;
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
      <AfSettingsGroup title="What each part of thinking uses" help={PARTS_HELP}>
        {refused ? <RefusalLine text={refused} /> : null}
        {state.phase === "reading" ? (
          <div className="wsp_status" role="status">
            <WordsLine text="Reading…" />
          </div>
        ) : null}
        {COGNITION_PARTS.map(({ id, label, help }) => (
          <AfSettingRow key={id} label={label} help={help} stack setting={`cognition-${id}`}>
            <div className="wsp_picker mcp_part">
              <ProviderModelPicker
                value={state.drafts.parts[id] ?? value?.parts[id].picker ?? { provider: "", model: "" }}
                onChange={(next) => onPart(id, next)}
                defaultModeLabel="Same as the mind"
                customModeLabel="Custom"
                inheritLabel="Model default"
                optionsInDefaultMode={false}
                defaultHint={FOLLOWS_THE_MIND}
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
      <AfSettingsGroup title="Memory" help={MEMORY_HELP}>
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
                  // Enter saves in place: the focus stays in the field (Tab goes on to the next one).
                  if (e.key === "Enter") onCommit(f.id);
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
  const latest = useRef<ProfileState>(PROFILE_READING);
  const [state, setState] = useState<ProfileState>(PROFILE_READING);
  const store = useMemo<ProfileStore>(
    () => ({
      get: () => latest.current,
      set: (update) => {
        latest.current = update(latest.current);
        setState(latest.current);
      },
    }),
    [],
  );
  const controller = useMemo(() => profileController(store, (body) => saveCognitionChange(baseUrl, entity, token, body)), [store, baseUrl, entity, token]);
  const { access, error: accessError } = useEntityAccess(baseUrl, entity);
  const refused = accessRefusal(access) || accessError;

  useEffect(() => {
    let alive = true;
    readCognitionProfile(baseUrl, entity).then((read) => alive && store.set((s) => ({ ...s, ...read })));
    return () => {
      alive = false;
    };
  }, [baseUrl, entity, mindKey, store]);

  return <CognitionProfileView baseUrl={baseUrl} state={state} refused={refused} onPart={controller.part} onField={controller.field} onCommit={controller.commit} />;
}
