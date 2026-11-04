/**
 * Settings → Identity (framework ADR 0052 §12, backlog 1119): the entity's look (an AbstractAvatar
 * design and a colour) and its voice, ONE record kept in its home, changed with one Save by an
 * admin or its creator (`PUT /entities/{name}/identity`).
 *
 * - The gateway validates at save time (closed for maintenance, a design it cannot draw, a voice it
 *   does not offer, a voice model not downloaded). Its sentence is shown as it is, never rewritten
 *   and never retried; the Download button appears when the refusal offers one.
 * - A record without a voice is a recorded absence: the page shows the gateway's own sentence
 *   (`GET /voice` `note`) and never a voice in its place.
 * - History: every revision (`GET /identity?rev=N`), newest first: when, by whom, what changed.
 *
 * The rules are pure functions (formOf, saveOf, historyRevs, historyRows, …) so the tests pin them
 * without a DOM.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AfSelect, VoiceSettings, avatarDesigns, voiceLabel, type AfSelectOption, type AvatarDesign, type VoicePreferences } from "@abstractframework/ui-kit";

import { IdentityAvatar } from "./identity_avatar";
import { RefusalLine, accessRefusal, entityVoiceCreation, useEntityAccess, voiceValueOf } from "./mind_voice_settings";
import {
  IdentityRefusal,
  getEntityIdentity,
  getEntityVoice,
  getVoiceCatalog,
  putEntityIdentity,
  startOfferedDownload,
  type DownloadAction,
  type EntityIdentity,
  type IdentityRecord,
  type IdentitySave,
  type IdentityVoice,
} from "./stream_source";

const capitalized = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ------------------------------------------------------------------ the form

/** What the page edits: the design, the colour, the voice picker's value. */
export interface IdentityForm {
  style: string;
  color: string;
  voice: VoicePreferences;
}

export function formOf(record: IdentityRecord): IdentityForm {
  return {
    style: record.avatar.style,
    color: record.avatar.color,
    voice: record.voice ? voiceValueOf({ ...record.voice, source: "identity" }) : {},
  };
}

/** The voice a form names, or null while it names no provider and voice (an identity always names
 * its voice, so there is nothing to save yet). `model: ""` = the picker gave no speech model. */
function chosenVoice(form: IdentityForm): { provider: string; model: string; voice: string } | null {
  const provider = String(form.voice.provider || "").trim();
  const voice = String(form.voice.voice || form.voice.profile || "").trim();
  if (!provider || !voice) return null;
  return { provider, model: String(form.voice.model || "").trim(), voice };
}

export type IdentitySaveStep = { body: IdentitySave } | { needsModel: string; body: IdentitySave } | null;

/** What Save sends: the whole record (design, colour, voice). The record's speed and quality are
 * kept while the voice stays the same. `needsModel` = the voice came without its speech model (a
 * voice just created): the caller asks the catalog for the provider's model. null = no voice yet. */
export function saveOf(form: IdentityForm, record: IdentityRecord | null): IdentitySaveStep {
  const v = chosenVoice(form);
  if (!v) return null;
  const voice: IdentitySave["voice"] = { provider: v.provider, model: v.model, voice: v.voice };
  const kept = record?.voice;
  if (kept && kept.provider === v.provider && kept.model === v.model && kept.voice === v.voice) {
    if (kept.speed != null) voice.speed = kept.speed;
    if (kept.quality_preset) voice.quality_preset = kept.quality_preset;
  }
  const body: IdentitySave = { avatar: { style: form.style, color: form.color.toLowerCase() }, voice };
  return v.model ? { body } : { needsModel: v.provider, body };
}

/** True when the form differs from the record (Save has something to say). */
export function formChanged(form: IdentityForm, record: IdentityRecord): boolean {
  const v = chosenVoice(form);
  const r = record.voice;
  const sameVoice = v && r ? v.provider === r.provider && v.voice === r.voice && (!v.model || v.model === r.model) : !v && !r;
  return form.style !== record.avatar.style || form.color.toLowerCase() !== record.avatar.color.toLowerCase() || !sameVoice;
}

/** What the page says for a record without a voice: the gateway's own sentence (`GET /voice`
 * `note`), as it is. Its absence is said too, never covered by a voice. */
export function noVoiceText(answer: { note?: string | null }, entityName: string): string {
  return answer.note || `The gateway did not say why ${entityName} has no voice.`;
}

// ------------------------------------------------------------------ history

/** The revisions to read, newest first: rev N … 1. */
export function historyRevs(current: number): number[] {
  const out: number[] = [];
  for (let rev = Math.floor(current); rev >= 1; rev--) out.push(rev);
  return out;
}

/** Who set a revision, in plain words: the gateway (the recorded default), the operator, or the
 * person's name (`person:laurent` → laurent). */
export function byWhom(setBy: string): string {
  if (setBy === "default") return "the gateway";
  if (setBy === "operator") return "the operator";
  const i = setBy.indexOf(":");
  return i >= 0 ? setBy.slice(i + 1) : setBy;
}

function sameLook(a: IdentityRecord, b: IdentityRecord): boolean {
  return a.avatar.style === b.avatar.style && a.avatar.color.toLowerCase() === b.avatar.color.toLowerCase();
}

function sameVoice(a: IdentityVoice | null, b: IdentityVoice | null): boolean {
  if (!a || !b) return a === b;
  return a.provider === b.provider && a.model === b.model && a.voice === b.voice && (a.speed ?? null) === (b.speed ?? null) && (a.quality_preset ?? null) === (b.quality_preset ?? null);
}

export interface IdentityHistoryRow {
  rev: number;
  at: string;
  by: string;
  change: string;
  record: IdentityRecord;
}

/** One row per revision, newest first, each saying what changed from the revision before it. */
export function historyRows(records: IdentityRecord[]): IdentityHistoryRow[] {
  const byRev = new Map(records.map((r) => [r.rev, r]));
  return [...byRev.values()]
    .sort((a, b) => b.rev - a.rev)
    .map((record) => {
      const before = byRev.get(record.rev - 1);
      let change: string;
      if (!before) change = record.set_by === "default" ? (record.voice ? "Default look and voice" : "Default look, no voice") : "Look and voice chosen";
      else {
        const look = !sameLook(before, record);
        const voice = !sameVoice(before.voice, record.voice);
        change = look && voice ? "New look and voice" : look ? "New look" : voice ? "New voice" : "Saved again, unchanged";
      }
      return { rev: record.rev, at: record.set_at, by: byWhom(record.set_by), change, record };
    });
}

export function whenText(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "openai · alloy": the provider and the voice's readable name. */
export function voiceText(voice: IdentityVoice, catalog?: Record<string, unknown> | null): string {
  return `${voice.provider} · ${voiceLabel(voice.voice, catalog || null)}`;
}

/** The designs an entity may wear: those the Watch can draw too (a non-empty `watchCode`, ADR 0052
 * §1), grouped by family, as the kit's select options. The current design stays listed even if
 * this catalog lacks it. */
export function designOptions(designs: readonly AvatarDesign[], current: string): AfSelectOption[] {
  const out: AfSelectOption[] = designs
    .filter((d) => String(d.watchCode || "").trim())
    .map((d) => ({ value: d.id, label: d.name || d.id, group: capitalized(d.family || "other") }));
  if (current && !out.some((o) => o.value === current)) out.unshift({ value: current, label: current, group: "Current" });
  return out;
}

function designName(designs: readonly AvatarDesign[], id: string): string {
  return designs.find((d) => d.id === id)?.name || id;
}

// ------------------------------------------------------------------ the page

type Status = { text: string; tone: "ok" | "error" | ""; download?: DownloadAction | null };

export function IdentitySettings({ baseUrl, entity, entityName, token }: { baseUrl: string; entity: string; entityName: string; token: string | null }): React.ReactElement {
  const { access, error: accessError } = useEntityAccess(baseUrl, entity);
  const refused = accessRefusal(access) || accessError;
  const [view, setView] = useState<EntityIdentity | null>(null);
  const [form, setForm] = useState<IdentityForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noVoice, setNoVoice] = useState<string | null>(null);
  const [designs, setDesigns] = useState<readonly AvatarDesign[]>([]);
  const [designsError, setDesignsError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const createVoice = useMemo(() => entityVoiceCreation(baseUrl, token), [baseUrl, token]);

  const show = useCallback(
    (answer: EntityIdentity) => {
      setView(answer);
      setForm(formOf(answer.identity));
      setNoVoice(null);
      if (answer.identity.voice === null) {
        // Recorded absence: the gateway's sentence, never a voice in its place.
        getEntityVoice(baseUrl, entity)
          .then((v) => setNoVoice(noVoiceText(v, entityName)))
          .catch((e: Error) => setNoVoice(`Why ${entityName} has no voice could not be read: ${e.message}`));
      }
    },
    [baseUrl, entity, entityName],
  );

  useEffect(() => {
    let alive = true;
    getEntityIdentity(baseUrl, entity)
      .then((answer) => alive && show(answer))
      .catch((e: Error) => alive && setLoadError(e.message));
    avatarDesigns()
      .then((list) => alive && setDesigns(list))
      .catch((e: Error) => alive && setDesignsError(`The list of designs could not be loaded: ${e.message}`));
    return () => {
      alive = false;
    };
  }, [baseUrl, entity, show]);

  const save = useCallback(async () => {
    if (!form || !view) return;
    const step = saveOf(form, view.identity);
    if (!step) return;
    setSaving(true);
    setStatus({ text: "Saving…", tone: "" });
    try {
      let body = step.body;
      if ("needsModel" in step) {
        const catalog = await getVoiceCatalog(baseUrl, step.needsModel);
        const model = catalog?.tts_models_by_provider?.[step.needsModel]?.[0] || "";
        if (!model) {
          setStatus({ text: `Not saved: ${step.needsModel} lists no speech model for this voice.`, tone: "error" });
          return;
        }
        body = { ...body, voice: { ...body.voice, model } };
      }
      show(await putEntityIdentity(baseUrl, entity, body, token));
      setStatus({ text: "Saved", tone: "ok" });
    } catch (e) {
      // The gateway's sentence as it is; nothing is retried.
      if (e instanceof IdentityRefusal) setStatus({ text: e.message, tone: "error", download: e.download });
      else setStatus({ text: `Not saved: ${(e as Error).message}`, tone: "error" });
    } finally {
      setSaving(false);
    }
  }, [form, view, baseUrl, entity, token, show]);

  const download = useCallback(
    (action: DownloadAction) => {
      setStatus({ text: "Starting the download…", tone: "" });
      startOfferedDownload(baseUrl, action, token)
        .then(() => setStatus({ text: "Downloading the voice model. Its progress is on the gateway's Models page; save again when it is done.", tone: "" }))
        .catch((e: Error) => setStatus({ text: `The download did not start: ${e.message}`, tone: "error" }));
    },
    [baseUrl, token],
  );

  if (loadError) return <p className="wsp_status wsp_status_error" role="alert" data-testid="identity-load-error">{loadError}</p>;
  if (!view || !form) return <p className="wsp_status">Loading its identity…</p>;

  const record = view.identity;
  const step = saveOf(form, record);
  const changed = formChanged(form, record);
  return (
    <div className="idn" data-testid="identity-settings">
      <div className="idn_look">
        <IdentityAvatar look={{ style: form.style, color: form.color }} size={112} label={`${entityName}: ${designName(designs, form.style)}`} />
        <div className="idn_fields">
          <div className="idn_field">
            <span id="idn-design-label">Design</span>
            <AfSelect
              ariaLabel="Avatar design"
              value={form.style}
              options={designOptions(designs, form.style)}
              searchable
              disabled={Boolean(refused)}
              onChange={(style) => style && setForm({ ...form, style })}
            />
          </div>
          <label className="idn_field">
            <span>Colour</span>
            <input type="color" value={form.color} disabled={Boolean(refused)} onChange={(e) => setForm({ ...form, color: e.target.value.toLowerCase() })} aria-label="Avatar colour" />
          </label>
          {designsError ? <p className="wsp_status wsp_status_error">{designsError}</p> : null}
        </div>
      </div>

      <h4 className="idn_head">Voice</h4>
      {record.voice === null ? (
        <p className="wsp_status wsp_status_error" role="note" data-testid="identity-no-voice">
          {noVoice ?? ""}
        </p>
      ) : null}
      {refused ? (
        <p className="wsp_status" data-testid="identity-voice-current">
          {record.voice ? `Speaks with ${voiceText(record.voice)}.` : null}
        </p>
      ) : (
        <div className="wsp_picker" data-testid="identity-voice-picker">
          <VoiceSettings
            value={form.voice}
            onChange={(next) => setForm({ ...form, voice: next })}
            fetchCatalog={(provider, model) => getVoiceCatalog(baseUrl, provider, model)}
            intro={null}
            delivery={false}
            showReset={false}
            voiceDefaultLabel="Choose a voice"
            createVoice={createVoice}
          />
        </div>
      )}

      <IdentityHistory baseUrl={baseUrl} entity={entity} current={record} designs={designs} />

      {refused ? <RefusalLine text={refused} /> : null}
      {status ? (
        <p className={`wsp_status${status.tone ? ` wsp_status_${status.tone}` : ""}`} role="status" aria-live="polite" data-testid="identity-status">
          {status.text}
        </p>
      ) : null}
      {!refused ? <p className="wsp_note idn_scope" data-testid="identity-scope">Saves {entityName}'s look and voice for everyone who meets it, on every device.</p> : null}
      {!refused ? (
        <div className="wsp_save_row idn_actions">
          {status?.download ? (
            <button type="button" onClick={() => download(status.download as DownloadAction)} data-testid="identity-download">
              {status.download.size_mb ? `Download (${status.download.size_mb} MB)` : "Download"}
            </button>
          ) : null}
          <button type="button" onClick={() => void save()} disabled={saving || !step || !changed} data-testid="identity-save">
            {saving ? "Saving…" : "Save"}
          </button>
          {!step ? <span className="wsp_note">Choose a voice to save.</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Every revision, newest first, read when opened. */
function IdentityHistory({ baseUrl, entity, current, designs }: { baseUrl: string; entity: string; current: IdentityRecord; designs: readonly AvatarDesign[] }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<IdentityHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setRows(null);
    setError(null);
    Promise.all(historyRevs(current.rev).map((rev) => (rev === current.rev ? Promise.resolve(current) : getEntityIdentity(baseUrl, entity, rev).then((a) => a.identity))))
      .then((records) => alive && setRows(historyRows(records)))
      .catch((e: Error) => alive && setError(`Its history could not be read: ${e.message}`));
    return () => {
      alive = false;
    };
  }, [open, baseUrl, entity, current]);
  return (
    <details className="idn_history" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>History ({current.rev} {current.rev === 1 ? "revision" : "revisions"})</summary>
      {error ? <p className="wsp_status wsp_status_error">{error}</p> : null}
      {open && !rows && !error ? <p className="wsp_status">Loading…</p> : null}
      {rows ? (
        <ol className="idn_history_list" data-testid="identity-history">
          {rows.map((row) => (
            <li key={row.rev} className="idn_history_row" data-rev={row.rev}>
              <span className="idn_history_main">
                <strong>{row.change}</strong> · {whenText(row.at)} · by {row.by}
              </span>
              <span className="idn_history_detail">
                <span className="idn_swatch" style={{ background: row.record.avatar.color }} aria-hidden="true" />
                {designName(designs, row.record.avatar.style)}
                {row.record.voice ? ` · ${voiceText(row.record.voice)}` : " · no voice"}
                {` · revision ${row.rev}`}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </details>
  );
}
