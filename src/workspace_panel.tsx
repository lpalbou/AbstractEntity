/**
 * The Settings modal (operator 2026-07-15 (d)(e): the old "workspace"
 * button was really settings — everything a summoned entity's operator
 * configures lives behind ONE modal, kept off the top bar by progressive
 * disclosure):
 *
 * - 🧠 mind: the one provider + model carrying his mind (substrate) —
 *   visits and own time both resolve this stored choice. MOVED here from
 *   the top controls strip.
 * - 📁 files: browse the entity's home workspace and read files.
 * - mounts: whitelist extra directories the entity may reach (read-only or
 *   read+write). Writes go through the operator door (token).
 * - tools: the per-phase tool grant (visit / work / personal / sleep) as a
 *   checkbox matrix over <home>/tool_policy.yaml. (Per-phase skills/MCP is
 *   deferred by ruling; when it ships it slots in this same modal.)
 * - prompt: the entity's prompt layers.
 *
 * Everything renders from gateway answers; a refused write shows the
 * door's words verbatim. (File kept as workspace_panel.tsx; the component
 * is the Settings modal.)
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { authRefusedMsg } from "./gateway_session";
import { SubstratePicker, saveSubstrateChoice, type SubstrateChoice } from "./substrate_picker";
import { PhaseCapabilityMatrix } from "@abstractframework/ui-kit";

import {
  getEntityPrompt,
  getEntitySkills,
  getEntityVoice,
  getGatewayVoiceDefault,
  getToolPolicy,
  getVoiceCatalog,
  getWorkspaceMounts,
  listWorkspace,
  putEntityPrompt,
  putEntitySkills,
  putEntitySubstrate,
  putEntityVoice,
  putToolPolicy,
  putWorkspaceMounts,
  readWorkspaceFile,
  type CatalogVoice,
  type EntitySkillsResolved,
  type EntityVoiceChoice,
  type PromptLayerInfo,
  type ToolPolicyInfo,
  type WorkspaceEntry,
  type WorkspaceListing,
  type WorkspaceMount,
} from "./stream_source";

export interface SettingsPanelProps {
  baseUrl: string;
  entity: string;
  entityName: string;
  token: string | null;
  /** The one mind-substrate for this entity (provider/model) + its change
   * history from the stream — the substrate control moved here (operator
   * (e)); the drawer/loop resolve the same stored choice. */
  substrate: SubstrateChoice | null;
  onSubstrateChange(choice: SubstrateChoice | null): void;
  substrateTimeline?: string[];
  /** ISO time of the newest substrate_changed marker (two-minded cue). */
  lastSubstrateChangeAt?: string | null;
  /** Loop process facts from /cognition: pid facts + (runtime c84) the mind
   * the loop is ACTUALLY running, recorded at each day-open/heal. */
  loopFacts?: {
    running: boolean;
    pid_started_at: string | null;
    substrate?: { provider?: string; model?: string } | null;
    substrate_at?: string | null;
  } | null;
  onClose(): void;
}

type Tab = "mind" | "voice" | "files" | "mounts" | "tools" | "skills" | "prompt";

const TAB_LABELS: Array<[Tab, string]> = [
  ["mind", "🧠 mind"],
  ["voice", "🔊 voice"],
  ["files", "📁 files"],
  ["mounts", "🗂 mounts"],
  ["tools", "🛠 tools"],
  ["skills", "🎒 skills"],
  ["prompt", "📜 prompt"],
];

export function SettingsPanel({ baseUrl, entity, entityName, token, substrate, onSubstrateChange, substrateTimeline, lastSubstrateChangeAt, loopFacts, onClose }: SettingsPanelProps): React.ReactElement {
  const [tab, setTab] = useState<Tab>("mind");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Consumed-event convention (kit AfDrawer/appearance do the same):
      // one Escape closes ONE layer, never the whole stack.
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="ev_backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ev_panel wsp_panel">
        <div className="ev_head">
          <div className="ev_title">
            <span className="ei_kind ei_kind_lesson">settings</span>
            <span>{entityName}</span>
          </div>
          <div className="wsp_tabs">
            {TAB_LABELS.map(([id, label]) => (
              <button key={id} className={tab === id ? "wsp_tab wsp_tab_on" : "wsp_tab"} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <button className="ev_close" onClick={onClose}>
            close
          </button>
        </div>
        <div className="ev_body wsp_body">
          {tab === "mind" ? (
            <MindTab
              baseUrl={baseUrl}
              entity={entity}
              entityName={entityName}
              token={token}
              substrate={substrate}
              onSubstrateChange={onSubstrateChange}
              substrateTimeline={substrateTimeline}
              lastSubstrateChangeAt={lastSubstrateChangeAt}
              loopFacts={loopFacts}
            />
          ) : null}
          {tab === "voice" ? <VoiceTab baseUrl={baseUrl} entity={entity} entityName={entityName} token={token} /> : null}
          {tab === "files" ? <FilesTab baseUrl={baseUrl} entity={entity} /> : null}
          {tab === "mounts" ? <MountsTab baseUrl={baseUrl} entity={entity} token={token} /> : null}
          {tab === "tools" ? <ToolsTab baseUrl={baseUrl} entity={entity} token={token} /> : null}
          {tab === "skills" ? <SkillsTab baseUrl={baseUrl} entity={entity} entityName={entityName} token={token} /> : null}
          {tab === "prompt" ? <PromptTab baseUrl={baseUrl} entity={entity} entityName={entityName} token={token} /> : null}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- mind

/** The mind-substrate tab: the ONE provider + model for this entity (moved
 * off the top strip, operator (e)). Persists to the gateway on change; the
 * visit drawer and own-time loop resolve the same stored choice. */
function MindTab({
  baseUrl,
  entity,
  entityName,
  token,
  substrate,
  onSubstrateChange,
  substrateTimeline,
  lastSubstrateChangeAt,
  loopFacts,
}: {
  baseUrl: string;
  entity: string;
  entityName: string;
  token: string | null;
  substrate: SubstrateChoice | null;
  onSubstrateChange(choice: SubstrateChoice | null): void;
  substrateTimeline?: string[];
  lastSubstrateChangeAt?: string | null;
  loopFacts?: {
    running: boolean;
    pid_started_at: string | null;
    substrate?: { provider?: string; model?: string } | null;
    substrate_at?: string | null;
  } | null;
}): React.ReactElement {
  const [note, setNote] = useState<string | null>(null);
  // Two-minded cue (grant audit 2026-07-18): a substrate change persists to
  // the home instantly, but an ALREADY-RUNNING own-time loop keeps the mind
  // it spawned with — until its next day-open re-resolution (runtime c82).
  // PREFERRED TRUTH (runtime c84): loop_status now records the mind the
  // loop is ACTUALLY running (substrate + substrate_at, written at each
  // day-open/heal) — warn only while the picker's choice differs from the
  // loop's recorded mind AND the change is newer than the recording. The
  // pid-time inference stays as the fallback for pre-c84 runtimes, where
  // it over-warns (can't see a day-open pickup inside a running process).
  const staleLoop = useMemo(() => {
    if (!loopFacts?.running || !lastSubstrateChangeAt) return false;
    const changed = Date.parse(lastSubstrateChangeAt);
    if (!Number.isFinite(changed)) return false;
    const recorded = loopFacts.substrate;
    if (recorded && (recorded.provider || recorded.model)) {
      const differs =
        Boolean(substrate) &&
        ((substrate?.provider ?? "") !== (recorded.provider ?? "") || (substrate?.model ?? "") !== (recorded.model ?? ""));
      const recordedAt = Date.parse(loopFacts.substrate_at || "");
      return differs && (!Number.isFinite(recordedAt) || changed > recordedAt);
    }
    if (!loopFacts.pid_started_at) return false;
    const started = Date.parse(loopFacts.pid_started_at);
    return Number.isFinite(started) && changed > started;
  }, [loopFacts, lastSubstrateChangeAt, substrate]);
  return (
    <div className="wsp_mind">
      <p className="wsp_mind_intro">
        The one provider + model carrying <strong>{entityName}</strong>'s mind. Visits and his own time both resolve this stored
        choice — there is no per-mode picker (maintainer ruling 2026-07-09).
      </p>
      {staleLoop ? (
        <p className="wsp_note wsp_warn">
          His own-time loop is still speaking the previous substrate
          {loopFacts?.substrate?.model ? ` (${[loopFacts.substrate.provider, loopFacts.substrate.model].filter(Boolean).join("/")})` : ""} — a
          restart applies this change now; the loop also adopts it on its own at the next day boundary (and heals onto it if the
          old mind is failing).
        </p>
      ) : null}
      <div className="wsp_mind_picker">
        <SubstratePicker
          baseUrl={baseUrl}
          entity={entity}
          value={substrate}
          onChange={(choice) => {
            onSubstrateChange(choice);
            if (choice?.provider && choice?.model) {
              saveSubstrateChoice(entity, choice); // legacy seed for older gateways
              putEntitySubstrate(baseUrl, entity, token, choice).catch((e: Error) => setNote(`Could not persist his substrate on the gateway: ${e.message}`));
            }
          }}
        />
      </div>
      {substrate?.provider && substrate?.model ? (
        <ReasoningDial
          value={substrate.thinking ?? null}
          onPick={(thinking) => {
            const next = { ...substrate, thinking };
            onSubstrateChange(next);
            saveSubstrateChoice(entity, next);
            putEntitySubstrate(baseUrl, entity, token, next).catch((e: Error) => setNote(`Could not save the reasoning choice: ${e.message}`));
          }}
        />
      ) : null}
      {note ? <p className="wsp_note wsp_warn">{note}</p> : null}
      {substrateTimeline && substrateTimeline.length > 0 ? (
        <div className="wsp_mind_history">
          <div className="wsp_mind_history_head">mind history (from his stream)</div>
          {substrateTimeline.map((line, i) => (
            <div key={i} className="wsp_mind_history_row">
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The reasoning dial (operator task c5710: provider, model, AND reasoning
 * wherever a mind is chosen). Plain words: this sets how hard the model
 * thinks before it answers. The gateway does not yet tell us whether a
 * given model supports reasoning, so the dial starts LOCKED and an explicit
 * "set anyway" click unlocks it — that way a model that cannot reason is
 * never silently configured, and a local model that CAN is not blocked
 * (the agreed three-state rule; the wire key is `thinking`). */
const REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const;

function ReasoningDial({ value, onPick }: { value: string | null; onPick(thinking: string | null): void }): React.ReactElement {
  const [unlocked, setUnlocked] = useState(false);
  const active = unlocked || value != null;
  return (
    <div className="wsp_reasoning">
      <div className="wsp_reasoning_row">
        <span className="wsp_reasoning_label" title="How hard his mind thinks before answering. 'unset' leaves the model at its own default; the levels only take effect on models that support reasoning — others ignore or refuse them loudly at the provider.">
          reasoning
        </span>
        {active ? (
          <select
            className="wsp_reasoning_select"
            value={value ?? ""}
            onChange={(e) => onPick(e.target.value === "" ? null : e.target.value)}
          >
            <option value="">unset (model's own default)</option>
            {REASONING_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        ) : (
          <button
            className="wsp_reasoning_unlock"
            onClick={() => setUnlocked(true)}
            title="The gateway does not yet say whether this model supports reasoning, so the dial is locked to be safe. Click to set it anyway — a model that cannot reason will ignore or refuse the setting loudly, never silently."
          >
            locked (support unknown) — set anyway
          </button>
        )}
      </div>
      <p className="wsp_quiet">
        Saved with his mind: visits and his own time both use it. Applies from the next conversation or day.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ voice

/** The entity's personal voice (entity-personal-voice room, laurent
 * 2026-07-19): pick provider + voice from the gateway's live TTS catalog;
 * the choice persists in the HOME (voice.yaml, travels with the life) and
 * every change is marker-first (voice_changed in his stream). The entity
 * TTS lanes resolve the stored triple automatically — once set, the chat
 * speaker speaks with HIS voice with zero further wiring. */
function VoiceTab({ baseUrl, entity, entityName, token }: { baseUrl: string; entity: string; entityName: string; token: string | null }): React.ReactElement {
  const [current, setCurrent] = useState<EntityVoiceChoice | null>(null);
  const [items, setItems] = useState<CatalogVoice[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, string[]>>({});
  /** The CONFIGURED gateway default (output.voice row), authoritative and
   * live today — the one source the console's Defaults modal reads. Only
   * for the render when the door doesn't yet serve `effective`. */
  const [gwDefault, setGwDefault] = useState<{ provider?: string; model?: string; voice?: string } | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("");
  const [voiceId, setVoiceId] = useState<string>("");
  const [model, setModel] = useState<string>("");

  useEffect(() => {
    getEntityVoice(baseUrl, entity)
      .then((v) => {
        setCurrent(v);
        if (v.provider) setProvider(v.provider);
        if (v.voice) setVoiceId(v.voice);
        if (v.model) setModel(v.model);
      })
      .catch((e: Error) => setError(e.message));
    getVoiceCatalog(baseUrl)
      .then((c) => {
        setItems((c.items ?? []).filter((it) => it.provider && it.id));
        setModelsByProvider(c.tts_models_by_provider ?? {});
        if (c.error) setCatalogError(String(c.error));
      })
      .catch((e: Error) => setCatalogError(`The voice catalog could not be read: ${e.message}`));
    // The CONFIGURED default (authoritative, live today) — for the render
    // only when GET /voice does not yet serve `effective`.
    getGatewayVoiceDefault(baseUrl)
      .then((row) => {
        if (row) setGwDefault({ provider: row.provider, model: row.model, voice: row.options?.voice });
      })
      .catch(() => {
        /* absent = engine decides; the render says so, never invents */
      });
  }, [baseUrl, entity]);

  const providers = useMemo(() => {
    const seen = new Set<string>();
    for (const it of items) seen.add(String(it.provider));
    return [...seen].sort();
  }, [items]);

  const voicesOf = useMemo(() => items.filter((it) => String(it.provider) === provider), [items, provider]);

  /** Model for the PUT: the item's own model wins; else the provider's
   * first catalog model (editable below — the door requires all three). */
  const deriveModel = (it: CatalogVoice | undefined, prov: string): string =>
    String(it?.model || modelsByProvider[prov]?.[0] || "");

  const pick = (it: CatalogVoice) => {
    setVoiceId(String(it.id));
    setModel(deriveModel(it, String(it.provider)));
    setSaved(null);
  };

  const save = () => {
    if (!provider || !voiceId || !model) {
      setError("A voice needs provider AND model AND voice — pick a voice, and fill the model if the catalog didn't derive one.");
      return;
    }
    setBusy(true);
    setError(null);
    putEntityVoice(baseUrl, entity, { provider, model, voice: voiceId }, token)
      .then((v) => {
        setCurrent(v);
        setSaved(`saved — his stream carries the voice_changed marker; the speaker uses it from the next utterance`);
      })
      .catch((e: Error & { status?: number }) => setError(e.status === 401 || e.status === 403 ? authRefusedMsg(e.status, e.message) : e.message))
      .finally(() => setBusy(false));
  };

  const clear = () => {
    setBusy(true);
    setError(null);
    putEntityVoice(baseUrl, entity, { clear: true }, token)
      .then((v) => {
        setCurrent(v);
        setProvider("");
        setVoiceId("");
        setModel("");
        setSaved("cleared — he inherits the gateway default again");
      })
      .catch((e: Error & { status?: number }) => setError(e.status === 401 || e.status === 403 ? authRefusedMsg(e.status, e.message) : e.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="wsp_voice">
      <p className="wsp_quiet">
        The voice <strong>{entityName}</strong> speaks with. The choice lives in his home (<code>voice.yaml</code> — it travels with the
        life) and every change lands a <code>voice_changed</code> marker in his stream. Once set, the chat speaker uses it automatically.
      </p>
      <div className="wsp_voice_current">
        {current?.source === "entity" ? (
          <>
            current: <code>{[current.provider, current.model, current.voice].filter(Boolean).join(" / ")}</code>{" "}
            <span className="wsp_quiet">(his own choice — overrides the gateway default)</span>
          </>
        ) : current?.effective && (current.effective.provider || current.effective.voice) ? (
          // Inheritance is the ruled semantic (laurent dm#68). The ONLY
          // source for the inherited triple is the door's served
          // `effective` (the real gateway default — output.voice
          // capability). NEVER guess it from the catalog's active fields:
          // that invented gpt-4o-mini-tts when the real baseline is
          // supertonic/supertonic-3 (laurent, dm — "STOP INVENTING").
          <>
            inheriting the gateway default: <code>{[current.effective.provider, current.effective.model, current.effective.voice].filter(Boolean).join(" / ")}</code>{" "}
            <span className="wsp_quiet">(pick a voice below to give him his own)</span>
          </>
        ) : gwDefault && (gwDefault.provider || gwDefault.voice) ? (
          // Pre-`effective` door: the CONFIGURED default from
          // config/capability-defaults (output.voice) — the operator's
          // chosen baseline, authoritative and live today. NOT the
          // catalog's active model (that invented gpt-4o-mini-tts).
          <>
            inheriting the gateway default: <code>{[gwDefault.provider, gwDefault.model, gwDefault.voice].filter(Boolean).join(" / ")}</code>{" "}
            <span className="wsp_quiet">(pick a voice below to give him his own)</span>
          </>
        ) : (
          // No configured default served → the engine decides; never invent.
          <span className="wsp_quiet">inheriting the gateway default (no configured voice — the voice engine decides; pick a voice below to give him his own)</span>
        )}
      </div>
      {catalogError ? <p className="wsp_note wsp_warn">{catalogError}</p> : null}
      {providers.length > 0 ? (
        <>
          <div className="wsp_voice_row">
            <label>provider</label>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setVoiceId("");
                setModel(modelsByProvider[e.target.value]?.[0] ?? "");
                setSaved(null);
              }}
            >
              <option value="">choose…</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          {provider ? (
            <div className="wsp_voice_list">
              {voicesOf.map((it) => (
                <button
                  key={`${it.provider}:${it.id}`}
                  className={`wsp_voice_item ${voiceId === it.id ? "wsp_voice_item_on" : ""}`}
                  onClick={() => pick(it)}
                  title={`${it.voice_kind === "clone" ? "cloned voice" : it.voice_kind === "voice" ? "custom voice" : "built-in profile"} — id ${it.id}`}
                >
                  <span className="wsp_voice_label">{it.label || it.id}</span>
                  <span className={`wsp_voice_kind wsp_voice_kind_${it.voice_kind || "profile"}`}>{it.voice_kind || "profile"}</span>
                </button>
              ))}
              {voicesOf.length === 0 ? <p className="wsp_quiet">no voices listed for this provider</p> : null}
            </div>
          ) : null}
          {provider && voiceId ? (
            <div className="wsp_voice_row">
              <label title="The door requires provider AND model AND voice — a voice id is only meaningful to its backend.">model</label>
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="tts model id" />
            </div>
          ) : null}
        </>
      ) : !catalogError ? (
        <p className="wsp_quiet">reading the voice catalog…</p>
      ) : null}
      {error ? <p className="wsp_error">{error}</p> : null}
      <div className="wsp_save_row">
        <button onClick={save} disabled={busy || !provider || !voiceId}>
          {busy ? "saving…" : "set his voice"}
        </button>
        {current?.source === "entity" ? (
          <button onClick={clear} disabled={busy} className="wsp_voice_clear">
            clear
          </button>
        ) : null}
        {saved ? <span className="wsp_saved">{saved}</span> : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ files

function FilesTab({ baseUrl, entity }: { baseUrl: string; entity: string }): React.ReactElement {
  const [path, setPath] = useState(".");
  const [listing, setListing] = useState<WorkspaceListing | null>(null);
  const [file, setFile] = useState<{ path: string; text: string; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (p: string) => {
      setError(null);
      setFile(null);
      listWorkspace(baseUrl, entity, p)
        .then((l) => {
          setListing(l);
          setPath(l.path);
        })
        .catch((e: Error) => setError(e.message));
    },
    [baseUrl, entity],
  );

  useEffect(() => {
    load(".");
  }, [load]);

  const openEntry = (entry: WorkspaceEntry) => {
    if (entry.kind === "file") {
      readWorkspaceFile(baseUrl, entity, entry.path)
        .then((f) => setFile({ path: f.path, text: f.text, truncated: f.truncated }))
        .catch((e: Error) => setError(e.message));
    } else {
      load(entry.path);
    }
  };

  const up = () => {
    if (path === "." || !path.includes("/")) {
      load(".");
      return;
    }
    const parent = path.split("/").slice(0, -1).join("/") || ".";
    load(parent);
  };

  return (
    <div className="wsp_files">
      <div className="wsp_crumbs">
        <button className="wsp_up" onClick={up} disabled={path === "."}>
          ↑ up
        </button>
        <code>{path === "." ? "workspace/" : `workspace/${path}`}</code>
      </div>
      {error ? <p className="wsp_error">{error}</p> : null}
      {file ? (
        <div className="wsp_file">
          <div className="wsp_file_head">
            <code>{file.path}</code>
            <button className="wsp_up" onClick={() => setFile(null)}>
              back to listing
            </button>
          </div>
          {file.truncated ? <p className="wsp_error">(truncated at the read cap — the file continues on disk)</p> : null}
          <pre className="wsp_pre">{file.text || "(empty file)"}</pre>
        </div>
      ) : listing ? (
        listing.entries.length === 0 ? (
          <p className="wsp_quiet">Empty — nothing here yet.</p>
        ) : (
          <ul className="wsp_list">
            {listing.entries.map((e) => (
              <li key={e.path}>
                <button className="wsp_entry" onClick={() => openEntry(e)}>
                  <span className="wsp_icon">{e.kind === "file" ? "📄" : e.kind === "mount" ? "🔗" : "📁"}</span>
                  <span className="wsp_name">{e.name}</span>
                  {e.kind === "file" && typeof e.size === "number" ? <span className="wsp_size">{e.size} B</span> : null}
                  {e.kind === "mount" ? <span className={`wsp_mode wsp_mode_${e.mode}`}>{e.mode === "rw" ? "read+write" : "read-only"}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="wsp_quiet">reading…</p>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- mounts

function MountsTab({ baseUrl, entity, token }: { baseUrl: string; entity: string; token: string | null }): React.ReactElement {
  const [mounts, setMounts] = useState<WorkspaceMount[] | null>(null);
  const [newPath, setNewPath] = useState("");
  const [newName, setNewName] = useState("");
  const [newMode, setNewMode] = useState<"ro" | "rw">("ro");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getWorkspaceMounts(baseUrl, entity)
      .then((r) => setMounts(r.mounts))
      .catch((e: Error) => setError(e.message));
  }, [baseUrl, entity]);

  const save = (next: WorkspaceMount[]) => {
    setBusy(true);
    setError(null);
    putWorkspaceMounts(baseUrl, entity, next, token)
      .then((r) => {
        setMounts(r.mounts);
        setNewPath("");
        setNewName("");
      })
      .catch((e: Error & { status?: number }) => {
        setError(e.status === 401 || e.status === 403 ? authRefusedMsg(e.status, e.message) : e.message);
      })
      .finally(() => setBusy(false));
  };

  const add = () => {
    const path = newPath.trim();
    if (!path || !mounts) return;
    const fallbackName = path.split("/").filter(Boolean).slice(-1)[0] ?? "mount";
    const name = (newName.trim() || fallbackName).replace(/[^a-zA-Z0-9_-]/g, "_");
    save([...mounts, { name, path, mode: newMode }]);
  };

  return (
    <div className="wsp_mounts">
      <p className="wsp_quiet">
        Extra workspaces the entity may reach, beside its home workspace. They appear to him as <code>mounts/&lt;name&gt;/</code>, each with its honest
        mode; a read-only mount refuses his writes structurally.
      </p>
      {error ? <p className="wsp_error">{error}</p> : null}
      {mounts === null ? (
        <p className="wsp_quiet">reading…</p>
      ) : mounts.length === 0 ? (
        <p className="wsp_quiet">No extra workspaces granted.</p>
      ) : (
        <ul className="wsp_list">
          {mounts.map((m) => (
            <li key={m.name} className="wsp_mount_row">
              <span className="wsp_icon">🔗</span>
              <code className="wsp_name">mounts/{m.name}/</code>
              <span className={`wsp_mode wsp_mode_${m.mode}`}>{m.mode === "rw" ? "read+write" : "read-only"}</span>
              <span className="wsp_target" title={m.path}>
                {m.path}
              </span>
              <button
                className="wsp_remove"
                disabled={busy}
                title="Remove this grant (his tools lose it on their next call)"
                onClick={() => save(mounts.filter((x) => x.name !== m.name))}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="wsp_add">
        <input type="text" placeholder="/absolute/path/to/directory" value={newPath} onChange={(e) => setNewPath(e.target.value)} />
        <input type="text" className="wsp_add_name" placeholder="name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <select value={newMode} onChange={(e) => setNewMode(e.target.value as "ro" | "rw")}>
          <option value="ro">read-only</option>
          <option value="rw">read+write</option>
        </select>
        <button onClick={add} disabled={busy || !newPath.trim() || mounts === null}>
          + grant
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tools

/** Labels for the phase vocabulary. RULED (laurent, 2026-07-11 20:30 via
 * agency c786, after a 9-0 room ballot): the four phases are single human
 * words — visit / work / personal / sleep. `tasked`/`own_time` are the
 * pre-ruling spellings and `resident` the oldest — all three render
 * labeled as legacy during the migration window (runtime aliases them:
 * tasked→work, own_time/resident→personal, loud #FALLBACK). The matrix
 * itself is server-driven — it renders whatever keys the gateway serves;
 * only labels/hints live client-side. DELETABLE STOPGAP: when the gateway
 * GET carries per-phase label/hint (uic's MatrixPhase {id,label?,hint?}
 * shape, c703), delete both maps and render the payload's words —
 * client-side vocabulary is the drift class the adversary already caught
 * here once. */
const PHASE_LABEL: Record<string, string> = {
  visit: "visit",
  work: "work",
  personal: "personal",
  sleep: "sleep",
  resident: "personal (legacy spelling)",
  tasked: "work (legacy spelling)",
  own_time: "personal (legacy spelling)",
};

/** Honest state of each column (adversary A's caveat, 2026-07-11): the
 * sleep grant is CONFIG the consolidation pass will consume when it gains
 * tool use — checking it today configures the future, it does not run
 * anything tonight. */
const PHASE_HINT: Record<string, string> = {
  visit: "Applies at the next summon (chat or visit).",
  work: "Pursuing operator-given tasks; ticks until done, then sleeps. Grants here decide his hands — nothing above the cognition lane is on by default (execute_command included: grant it explicitly if his work needs it). The tools are BUILT — what is not yet wired is the work PHASE lane itself (a task queue + the loop entering work on a task); grants set here arm the day that lands. Runtime + gateway own that build.",
  personal: "His own time — self-directed, no given tasks. Full set by default (Q1 ruling: same as work); the brake is the personal-time grant (off by default, operator-granted with a timer or until retracted), never an empty toolset. Applies at the next day boundary.",
  sleep: "Configures the sleep/dream pass. The DEFAULT is explore-only (recall, search, reads) — widen it here if his dreams should act (a dedicated sleep workspace, extra tools: the operator's call). It does not run tools yet: this column takes effect when the sleep pass gains tool use.",
  resident: "Legacy spelling of the personal phase (older gateway). Applies at the next day boundary.",
  tasked: "Legacy spelling of the work phase (older gateway).",
  own_time: "Legacy spelling of the personal phase (older gateway).",
};

// ------------------------------------------------------------------ prompt

/** Labels/hints for the layer keys the server is KNOWN to serve. The list
 * itself comes from the server (`editable`) so a new layer renders (with a
 * generic label) instead of being silently dropped from the next save —
 * the whole-document-replace PUT makes a missing key a deletion. */
const PROMPT_LAYER_META: Record<string, { label: string; hint: string }> = {
  conversation: { label: "conversation contract", hint: "How memories arrive and how the diary is offered — every session." },
  visit: { label: "visit paragraph", hint: "The life framing during visits (own time continues after)." },
  own_time: { label: "own-time contract", hint: "The framing of the entity's own 24/7 loop sessions." },
  operator: {
    label: "operator instructions",
    hint:
      "Standing direction and PERMISSIONS, appended last and attributed to you — never blended into the entity's own voice. " +
      "Grants of authority belong here (\"You have my standing permission to act without asking\"). CHARACTER statements " +
      "(\"You are curious, fair…\") belong in the SPARK at creation — there they are the entity's own and its memory can find them; " +
      "here they read as orders, and a self-search would contradict them. Mid-life character change is the entity's own act (its reflection), not an operator edit.",
  },
};


function PromptTab({
  baseUrl,
  entity,
  entityName,
  token,
}: {
  baseUrl: string;
  entity: string;
  entityName: string;
  token: string | null;
}): React.ReactElement {
  const [info, setInfo] = useState<PromptLayerInfo | null>(null);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [open, setOpen] = useState<string | null>("operator");
  const [showPrelude, setShowPrelude] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const layerKeys = (p: PromptLayerInfo): string[] =>
    p.editable?.length ? p.editable : Object.keys(PROMPT_LAYER_META);

  const draftFrom = (p: PromptLayerInfo): Record<string, string> => {
    const d: Record<string, string> = {};
    for (const key of layerKeys(p)) d[key] = p.layers[key]?.source === "overlay" ? p.layers[key].text : "";
    return d;
  };

  useEffect(() => {
    getEntityPrompt(baseUrl, entity)
      .then((p) => {
        setInfo(p);
        setDraft(draftFrom(p));
      })
      .catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, entity]);

  const save = () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    putEntityPrompt(baseUrl, entity, draft, token)
      .then((p) => {
        setInfo(p);
        setDraft(draftFrom(p));
        setSaved(true);
      })
      .catch((e: Error & { status?: number }) => {
        setError(e.status === 401 || e.status === 403 ? authRefusedMsg(e.status, e.message) : e.message);
      })
      .finally(() => setBusy(false));
  };

  if (error && !info) return <p className="wsp_error">{error}</p>;
  if (!info || !draft) return <p className="wsp_quiet">reading…</p>;

  const dirty = layerKeys(info).some((key) => {
    const live = info.layers[key]?.source === "overlay" ? info.layers[key].text : "";
    return (draft[key] ?? "") !== live;
  });

  return (
    <div className="wsp_prompt">
      <p className="wsp_quiet">
        {entityName}'s system prompt, layer by layer. The identity block and the tools text are machine-owned (identity evolves by the entity's own
        acts; tools text follows the actual grant — edit it in the tools tab). The layers below are yours to rewrite; empty = the built-in default.
        Saving writes <code>system_prompt.yaml</code> in the home — the next summon obeys it; a session already open keeps the prompt it was
        summoned with.
      </p>
      {info.warnings.length > 0 ? <p className="wsp_error">{info.warnings.join(" · ")}</p> : null}
      {info.raw_file ? (
        <div className="wsp_prompt_section">
          <div className="wsp_prompt_editor">
            <p className="wsp_error">The file on disk could not be parsed — its raw content is shown here so nothing is lost. Saving replaces it.</p>
            <pre className="wsp_pre wsp_prompt_pre">{info.raw_file}</pre>
          </div>
        </div>
      ) : null}
      {error ? <p className="wsp_error">{error}</p> : null}

      <div className="wsp_prompt_section">
        <button className="wsp_prompt_head" onClick={() => setShowPrelude(!showPrelude)}>
          <span className="wsp_prompt_arrow">{showPrelude ? "▾" : "▸"}</span> identity prelude
          <span className="wsp_badge wsp_badge_locked" title="Rendered from the engrammed core + diary + standing; evolves only by the entity's own acts">
            read-only
          </span>
        </button>
        {showPrelude ? <pre className="wsp_pre wsp_prompt_pre">{info.prelude || "(prelude refused to render — see warnings)"}</pre> : null}
      </div>

      {layerKeys(info).map((key) => {
        const meta = PROMPT_LAYER_META[key] ?? { label: key.replace(/_/g, " "), hint: "" };
        const live = info.layers[key];
        const isOpen = open === key;
        const overlayOn = (draft[key] ?? "").trim().length > 0;
        return (
          <div className="wsp_prompt_section" key={key}>
            <button className="wsp_prompt_head" onClick={() => setOpen(isOpen ? null : key)}>
              <span className="wsp_prompt_arrow">{isOpen ? "▾" : "▸"}</span> {meta.label}
              <span className={overlayOn ? "wsp_badge wsp_badge_overlay" : "wsp_badge"} title={overlayOn ? "Your rewrite is live" : "Built-in default text"}>
                {overlayOn ? "rewritten" : "default"}
              </span>
            </button>
            {isOpen ? (
              <div className="wsp_prompt_editor">
                {meta.hint ? <p className="wsp_quiet">{meta.hint}</p> : null}
                <textarea
                  className="wsp_prompt_text"
                  rows={key === "operator" ? 4 : 8}
                  placeholder={key === "operator" ? "(nothing yet — standing instructions you want in every summon)" : "(empty = the built-in default below)"}
                  value={draft[key] ?? ""}
                  onChange={(e) => {
                    setDraft({ ...draft, [key]: e.target.value });
                    setSaved(false);
                  }}
                />
                {(info.defaults[key] ?? "") !== "" ? (
                  <div className="wsp_prompt_default">
                    <div className="wsp_prompt_default_head">
                      built-in default{live?.source === "overlay" ? " (replaced by your rewrite)" : " (live)"}
                      <button
                        className="wsp_up"
                        onClick={() => {
                          setDraft({ ...draft, [key]: info.defaults[key] ?? "" });
                          setSaved(false);
                        }}
                        title="Copy the default into the editor as a starting point (saving it unchanged keeps the default live)"
                      >
                        copy to editor
                      </button>
                    </div>
                    <pre className="wsp_pre wsp_prompt_pre">{info.defaults[key]}</pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="wsp_prompt_section">
        <button className="wsp_prompt_head" onClick={() => setShowPreview(!showPreview)}>
          <span className="wsp_prompt_arrow">{showPreview ? "▾" : "▸"}</span> full preview
          <span className="wsp_badge" title="The exact head the next VISIT summon composes (per-turn presence + MEMORIES append at runtime; own-time sessions swap the visit paragraph for the own-time contract)">
            next visit summon
          </span>
        </button>
        {showPreview ? <pre className="wsp_pre wsp_prompt_pre">{info.preview || "(no preview — prelude refused)"}</pre> : null}
      </div>

      <div className="wsp_save_row">
        <button onClick={save} disabled={busy || !dirty}>
          {busy ? "saving…" : "save prompt"}
        </button>
        {saved ? <span className="wsp_saved">saved — next summon obeys it</span> : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ skills

type MatrixPatch = { section: string; item: string; phase: string; op: "grant" | "deny" | "clear" };

/** Fold the served matrix + pending patches into the PUT's whole-document
 * selection ({name, phases?}[]): a cell is SELECTED when a patch grants
 * it, DESELECTED when a patch denies/clears it, else it keeps the stored
 * word (assigned && resolved_value — resolved-only cells are shelf
 * defaults, not the operator's selection). All four phases selected →
 * global entry (phases omitted). Exported-for-tests shape kept simple:
 * pure data in, pure data out. */
export function foldSkillsSelection(
  matrix: unknown,
  patches: MatrixPatch[],
): Array<{ name: string; phases?: string[] }> {
  const m = matrix as { phases?: Array<{ id: string }>; sections?: Array<{ id: string; items?: Array<{ id: string; cells?: Record<string, { assigned?: boolean; resolved_value?: boolean }> }> }> };
  const phaseIds = (m?.phases ?? []).map((p) => p.id);
  const out: Array<{ name: string; phases?: string[] }> = [];
  for (const section of m?.sections ?? []) {
    for (const item of section.items ?? []) {
      const selected: string[] = [];
      for (const phase of phaseIds) {
        const patch = patches.find((p) => p.section === section.id && p.item === item.id && p.phase === phase);
        const cell = item.cells?.[phase];
        const stored = Boolean(cell?.assigned && cell?.resolved_value);
        const on = patch ? patch.op === "grant" : stored;
        if (on) selected.push(phase);
      }
      if (selected.length === 0) continue;
      out.push(selected.length === phaseIds.length ? { name: item.id } : { name: item.id, phases: selected });
    }
  }
  return out;
}

/** The skills tab (laurent c2857: manage what an entity is TAUGHT).
 * Renders SERVER truth only: the kit's PhaseCapabilityMatrix over the
 * gateway's validated payload (one truth with the console, zero mapping
 * code), trust verdicts verbatim, and a whole-document save through the
 * marker-first PUT — a typo'd or blocked skill is visible the moment it
 * is written, never a silent no-op. */
function SkillsTab({ baseUrl, entity, entityName, token }: { baseUrl: string; entity: string; entityName: string; token: string | null }): React.ReactElement {
  const [data, setData] = useState<EntitySkillsResolved | null>(null);
  const [patches, setPatches] = useState<MatrixPatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getEntitySkills(baseUrl, entity)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [baseUrl, entity]);

  const save = () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    const skills = foldSkillsSelection(data.matrix, patches);
    putEntitySkills(baseUrl, entity, skills, token)
      .then((next) => {
        setData(next);
        setPatches([]);
        setSaved(true);
      })
      .catch((e: Error & { status?: number }) => {
        setError(e.status === 401 || e.status === 403 ? authRefusedMsg(e.status, e.message) : e.message);
      })
      .finally(() => setBusy(false));
  };

  if (error && !data) return <p className="wsp_error">{error}</p>;
  if (!data) return <p className="wsp_quiet">reading his shelf…</p>;

  const verdicts = data.resolved?.verdicts ?? [];
  const resolvedSkills = data.resolved?.skills ?? [];
  // Audience taxonomy (skill c165/c170): entity-self-knowledge IS the
  // capability map (delivered every summon — render delivered, not off);
  // audience=host skills (entity-observation et al.) are un-grantable for
  // an entity and shown grayed; either = conditional. Read structurally
  // from the registry, never inferred from a skill's name.
  const hostOnly = resolvedSkills.filter((s) => s.audience === "host").map((s) => s.name);
  const deliveredMap = resolvedSkills.filter((s) => s.delivered_via_map || s.name === "entity-self-knowledge");
  // 0008 requires contract (gateway c3964): a selected skill whose declared
  // dependency is missing DROPS from active with a labeled verdict — render
  // the drop verbatim (never a silent activation on this surface either).
  // Absent field = pre-contract gateway = nothing renders.
  const requiresUnmet = resolvedSkills.filter(
    (s) =>
      s.requires_unmet != null &&
      s.requires_unmet !== "" &&
      // An empty object is no verdict (impl adversary P2-5) — render only
      // rows carrying actual words/keys.
      (typeof s.requires_unmet === "string" || Object.keys(s.requires_unmet).length > 0),
  );
  return (
    <div className="wsp_skills">
      <p className="wsp_quiet">
        What {entityName} is taught beyond his capability map — skills selected here ride his sessions per phase (Grant),
        stay off (Deny), or follow the framework default (Default = not selected). Saving writes <code>skills.yaml</code> in
        his home, marker-first: the change is a visible moment in his biography. Trust verdicts come from the shelf's gate
        verbatim — a blocked skill renders blocked, never silently skipped. Delivery into his prompts lands with runtime's
        composition slot (in flight); until then a selection is standing config.
      </p>
      {deliveredMap.length > 0 || hostOnly.length > 0 ? (
        <div className="wsp_skills_audience">
          {deliveredMap.length > 0 ? (
            <p>
              <span className="wsp_aud_delivered">● delivered</span> <code>{deliveredMap.map((s) => s.name).join(", ")}</code> — his
              capability map, riding every summon (it IS the entity-self-knowledge teaching; not a per-phase toggle).
            </p>
          ) : null}
          {hostOnly.length > 0 ? (
            <p className="wsp_quiet">
              <span className="wsp_aud_host">▲ observer/dev only</span> {hostOnly.join(", ")} — audience=host in the registry:
              these teach agents/operators, never {entityName}. Un-grantable to an entity by construction (skill's fail-closed
              audience field), shown for transparency.
            </p>
          ) : null}
        </div>
      ) : null}
      {requiresUnmet.length > 0 ? (
        <div className="wsp_skills_audience">
          {requiresUnmet.map((s, i) => (
            <p key={`${s.name}:${(s.phases ?? []).join(",")}:${i}`} className="wsp_quiet">
              <span className="wsp_aud_unmet">⚠ dependency unmet</span> <code>{s.name}</code> —{" "}
              {typeof s.requires_unmet === "string" ? s.requires_unmet : JSON.stringify(s.requires_unmet)} (selected but
              dropped from his teaching until the dependency is declared; the gate's verdict, verbatim).
            </p>
          ))}
        </div>
      ) : null}
      {error ? <p className="wsp_error">{error}</p> : null}
      <PhaseCapabilityMatrix
        payload={data.matrix}
        patches={patches}
        onPatchesChange={(next) => {
          setPatches(next as MatrixPatch[]);
          setSaved(false);
        }}
        disabled={busy}
        title="skills by phase"
        subtitle="Grant = taught in that phase · Default = not selected"
      />
      {verdicts.length > 0 ? (
        <div className="wsp_skills_verdicts">
          <span className="wsp_quiet">gate verdicts (server verbatim):</span>
          <ul>
            {verdicts.map((v, i) => (
              <li key={i}>
                <code>{JSON.stringify(v)}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="wsp_save_row">
        <button onClick={save} disabled={busy || patches.length === 0}>
          {busy ? "saving…" : "save selection"}
        </button>
        {saved ? <span className="wsp_saved">saved — the marker is in his stream</span> : null}
        {patches.length > 0 ? <span className="wsp_quiet">{patches.length} unsaved change{patches.length === 1 ? "" : "s"}</span> : null}
      </div>
    </div>
  );
}

function ToolsTab({ baseUrl, entity, token }: { baseUrl: string; entity: string; token: string | null }): React.ReactElement {
  const [policy, setPolicy] = useState<ToolPolicyInfo | null>(null);
  const [draft, setDraft] = useState<Record<string, Set<string>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getToolPolicy(baseUrl, entity)
      .then((p) => {
        setPolicy(p);
        const d: Record<string, Set<string>> = {};
        for (const [phase, info] of Object.entries(p.phases)) d[phase] = new Set(info.tools);
        setDraft(d);
      })
      .catch((e: Error) => setError(e.message));
  }, [baseUrl, entity]);

  const toggle = (phase: string, tool: string) => {
    if (!draft) return;
    const next = { ...draft, [phase]: new Set(draft[phase]) };
    if (next[phase].has(tool)) next[phase].delete(tool);
    else next[phase].add(tool);
    setDraft(next);
    setSaved(false);
  };

  const save = () => {
    if (!draft || !policy) return;
    setBusy(true);
    setError(null);
    // TOUCHED PHASES ONLY (adversary find, 2026-07-11): sending every
    // phase materialized the day's RESOLVED defaults into the file as
    // "the operator's word" — every real home ended up with a frozen
    // `sleep: []` from pre-ruling saves, killing the ruled sleep default.
    // The server merges per phase; unchanged phases stay as they were
    // (absent = follows the evolving framework defaults).
    const body: Record<string, string[]> = {};
    for (const [phase, tools] of Object.entries(draft)) {
      const shown = new Set(policy.phases[phase]?.tools ?? []);
      const changed = tools.size !== shown.size || [...tools].some((t) => !shown.has(t));
      if (changed) body[phase] = policy.all_tools.filter((t) => tools.has(t));
    }
    if (Object.keys(body).length === 0) {
      setBusy(false);
      setSaved(true);
      return;
    }
    putToolPolicy(baseUrl, entity, body, token)
      .then((p) => {
        setPolicy(p);
        const d: Record<string, Set<string>> = {};
        for (const [phase, info] of Object.entries(p.phases)) d[phase] = new Set(info.tools);
        setDraft(d);
        setSaved(true);
      })
      .catch((e: Error & { status?: number }) => {
        setError(e.status === 401 || e.status === 403 ? authRefusedMsg(e.status, e.message) : e.message);
      })
      .finally(() => setBusy(false));
  };

  if (error && !policy) return <p className="wsp_error">{error}</p>;
  if (!policy || !draft) return <p className="wsp_quiet">reading…</p>;

  const tier1 = new Set(policy.tiers["tier1"] ?? []);

  return (
    <div className="wsp_tools">
      <p className="wsp_quiet">
        Which tools he holds in each phase of life. The ● mark is his read-only COGNITION lane (his own memory and book — no reach into the world);
        everything else reaches outward to some degree: workspace reads/writes, web lanes (network egress), and execute_command (a sandboxed shell —
        walled, but real hands). Saving writes <code>tool_policy.yaml</code> in his home — the next summon of each phase obeys it; a session already
        open (a live visit, an own-time day mid-run) keeps the grant it was summoned with. The sleep column (⏳) is standing config with an explore-only
        DEFAULT (recall, search, read) — widen it if his dreams should act; it takes effect when the sleep pass gains tool use.
      </p>
      <p className="wsp_quiet">
        A check is the <strong>grant</strong> — the operator's word. What a live session can actually <em>call</em> also depends on that lane's
        wiring; a granted tool the lane cannot offer yet shows <span className="wsp_unwired" title="granted but not yet callable on this lane">▲</span> with
        the reason.
      </p>
      {error ? <p className="wsp_error">{error}</p> : null}
      <table className="wsp_matrix">
        <thead>
          <tr>
            <th>tool</th>
            {Object.keys(policy.phases).map((phase) => (
              <th key={phase} title={PHASE_HINT[phase] ?? ""}>
                {PHASE_LABEL[phase] ?? phase}
                {phase === "sleep" ? (
                  <span className="wsp_phase_note" title={PHASE_HINT.sleep}>
                    {" "}
                    ⏳
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {policy.all_tools.map((tool) => (
            <tr key={tool}>
              <td>
                <code>{tool}</code> {tier1.has(tool) ? <span className="wsp_tier1" title="his read-only cognition lane (memory + book reads — no reach into the world)">●</span> : null}
                {/* THE RISK BADGE (tool-tiers round): renders ONLY what the
                  * gateway serves — a derived band with its words. A tool
                  * the server has not vetted says so; nothing is guessed
                  * client-side (the drifted-claims lesson, three times). */}
                {(() => {
                  const riskMap = policy.risk ?? policy.risk_tier;
                  if (!riskMap) return null;
                  const risk = riskMap[tool];
                  // The settled wire (semantics c4589): risk_rank = integer
                  // ordinal, the word rides risk_tier/band; presentation
                  // "unvetted" marks a factless row whose rank-4 must never
                  // read as destructive. Older tier/label spellings read too.
                  const rank = typeof risk?.risk_rank === "number" ? risk.risk_rank : typeof risk?.tier === "number" ? risk.tier : null;
                  const word = risk?.band ?? (typeof risk?.risk_tier === "string" ? risk.risk_tier : undefined) ?? risk?.label;
                  const unvetted = risk?.risk_presentation === "unvetted";
                  if (!risk || rank === null) {
                    return <span className="wsp_risk wsp_risk_unvetted" title="unvetted — this tool's structural facts are undeclared; treated deny-safe">?</span>;
                  }
                  if (unvetted) {
                    return <span className="wsp_risk wsp_risk_unvetted" title={`risk ${rank} (unvetted) — facts undeclared, held at the deny-safe top band; not a destructive verdict`}>{rank}?</span>;
                  }
                  return (
                    <span className={`wsp_risk wsp_risk_${rank}`} title={`risk ${rank}${word ? ` · ${word}` : ""} — served, derived from the tool's declared facts`}>
                      {rank}
                    </span>
                  );
                })()}
              </td>
              {Object.keys(policy.phases).map((phase) => {
                const exec = policy.phases[phase]?.executable?.[tool];
                const unwired = exec ? exec.ok === false : false;
                return (
                  <td key={phase}>
                    <input type="checkbox" checked={draft[phase]?.has(tool) ?? false} onChange={() => toggle(phase, tool)} />
                    {unwired && (draft[phase]?.has(tool) ?? false) ? (
                      <span className="wsp_unwired" title={exec?.reason || "granted but not yet callable on this lane"}>
                        ▲
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="wsp_save_row">
        <button onClick={save} disabled={busy}>
          {busy ? "saving…" : "save policy"}
        </button>
        {saved ? <span className="wsp_saved">saved — next summon obeys it</span> : null}
        {policy.phases["visit"]?.source === "default" && !saved ? <span className="wsp_quiet">(currently on defaults — no policy file yet)</span> : null}
      </div>
    </div>
  );
}
