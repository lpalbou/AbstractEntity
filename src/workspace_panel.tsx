/**
 * The Settings modal (operator 2026-07-15 (d)(e): the old "workspace"
 * button was really settings — everything a summoned entity's operator
 * configures lives behind ONE modal, kept off the top bar by progressive
 * disclosure). Remodelled 2026-11-07 (operator: "completely remodel the
 * settings modal. it is ugly. make it aesthetically pleasant and better
 * organize"): the kit's AfModal chrome, nine sections in four groups
 * (settings_sections.ts) with a side list on desktop and the kit's AfSelect
 * on a phone, a title and one line per section, long explanations folded
 * under "How … works".
 *
 * - Mind & voice: Mind — the kit's shared picker ("Gateway default" or its
 *   own choice; mind_voice_settings.tsx), used by visits and its own time,
 *   then which model each part of thinking uses and the per-turn memory
 *   bounds (the cognition profile, mind_cognition_profile.tsx);
 *   Voice — the listener's own playback and microphone (entity_voice.tsx).
 * - Identity & record: Identity — its look and its voice, one record, one
 *   Save (framework ADR 0052; identity_settings.tsx); Track record — what it
 *   has done, trust by task, whom it has met (track_record_panel.tsx).
 * - Workspace: Files (browse the home workspace, read files); Mounts (extra
 *   directories, read-only or read+write; writes go through the operator
 *   door with the token); Tools (the per-phase tool grant over
 *   <home>/tool_policy.yaml, one switch per cell, applied at once); Skills
 *   (the per-phase skill selection, saved whole).
 * - Prompt: the entity's prompt layers.
 *
 * Everything renders from gateway answers; a refused write shows the
 * door's words verbatim. What each control writes is unchanged by the
 * remodel. (File kept as workspace_panel.tsx; the component is the
 * Settings modal.)
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { authRefusedMsg } from "./gateway_session";
import { EntityMindPicker, substrateChoiceOf, type SubstrateChoice } from "./mind_voice_settings";
import { EntityCognitionProfile } from "./mind_cognition_profile";
import { IdentitySettings } from "./identity_settings";
import { TrackRecordPanel } from "./track_record_panel";
import { ListenerVoiceSettings } from "./entity_voice";
import { SETTINGS_GROUPS, settingsSection, settingsSectionOptions, type SettingsSection } from "./settings_sections";
import { escapeClosesSettings, isKitPopoverTarget, sectionMounted, unsavedSections, unsavedSentence } from "./settings_guard";
import {
  AfChip,
  AfModal,
  AfSelect,
  AfSettingRow,
  AfSettingsGroup,
  AfSwitch,
  Icon,
  PhaseCapabilityMatrix,
  formatFileSize,
} from "@abstractframework/ui-kit";
import "./settings_modal.css";
import { WordsLine } from "./words_line";

import {
  getEntityPrompt,
  getEntitySkills,
  getToolPolicy,
  getWorkspaceMounts,
  listWorkspace,
  putEntityPrompt,
  putEntitySkills,
  putToolPolicy,
  putWorkspaceMounts,
  readWorkspaceFile,
  type EntitySkillsResolved,
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
  /** The section shown first (default Mind). */
  initialSection?: SettingsSection;
  onClose(): void;
}

export function SettingsPanel({
  baseUrl,
  entity,
  entityName,
  token,
  substrate,
  onSubstrateChange,
  substrateTimeline,
  lastSubstrateChangeAt,
  loopFacts,
  initialSection = "mind",
  onClose,
}: SettingsPanelProps): React.ReactElement {
  const [tab, setTabState] = useState<SettingsSection>(initialSection);
  const [visited, setVisited] = useState<ReadonlySet<SettingsSection>>(() => new Set([initialSection]));
  const setTab = useCallback((next: SettingsSection) => {
    setTabState(next);
    setVisited((v) => (v.has(next) ? v : new Set([...v, next])));
  }, []);
  const { section, group } = settingsSection(tab);
  const titleId = `${useId().replace(/:/g, "")}-section`;
  const mainRef = useRef<HTMLDivElement>(null);

  // Unsaved drafts (settings_guard.ts): kept across sections, asked about on close.
  const [dirty, setDirty] = useState<Partial<Record<SettingsSection, boolean>>>({});
  const markDirty = useCallback(
    (id: SettingsSection) => (d: boolean) => setDirty((prev) => (Boolean(prev[id]) === d ? prev : { ...prev, [id]: d })),
    [],
  );
  const onSkillsDirty = useMemo(() => markDirty("skills"), [markDirty]);
  const onPromptDirty = useMemo(() => markDirty("prompt"), [markDirty]);
  const unsaved = unsavedSections(dirty);
  const [confirming, setConfirming] = useState(false);
  const requestClose = useRef<() => void>(() => {});
  requestClose.current = () => (unsaved.length > 0 ? setConfirming(true) : onClose());

  // A new section starts at its top (the page column scrolls, on a phone too).
  useEffect(() => {
    const main = mainRef.current;
    if (main && typeof main.scrollTo === "function") main.scrollTo({ top: 0 });
  }, [tab]);

  // Escape closes Settings only when nothing inside handled it (an open dropdown closes alone).
  // Bubble phase on window: the dropdown's own handler runs first and marks the key handled.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!escapeClosesSettings(e)) return;
      e.preventDefault();
      requestClose.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus inside a kit dropdown list (rendered in document.body) stays there: stopped at the
  // window, before the kit modal's document-level trap would pull it back into the dialog.
  useEffect(() => {
    const keep = (e: FocusEvent) => {
      if (isKitPopoverTarget(e.target)) e.stopPropagation();
    };
    window.addEventListener("focusin", keep, true);
    return () => window.removeEventListener("focusin", keep, true);
  }, []);

  const mounted = (id: SettingsSection) => sectionMounted(id, tab, visited);

  return (
    <AfModal
      open
      onClose={() => requestClose.current()}
      closeOnEscape={false}
      size="wide"
      // In the app's tree (like the dialog it replaces): the #root-scoped touch
      // targets and type floors keep applying to everything inside.
      portal={false}
      className="stg_modal"
      closeLabel="Close settings"
      title={
        <span className="stg_title">
          <span className="stg_title_word">Settings</span>
          <span className="stg_title_name">{entityName}</span>
        </span>
      }
    >
      <div className="stg" data-testid="settings-modal" data-section={tab}>
        <nav className="stg_nav" aria-label="Settings sections">
          {SETTINGS_GROUPS.map((g) => (
            <div key={g.id} className="af-nav-group stg_nav_group" role="group" aria-label={g.label}>
              <p className="af-nav-group__caption" aria-hidden="true">
                {g.label}
              </p>
              {g.sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="stg_nav_item"
                  data-section={s.id}
                  aria-current={tab === s.id ? "page" : undefined}
                  onClick={() => setTab(s.id)}
                >
                  <Icon name={s.icon} size={16} aria-hidden="true" />
                  <span>{s.label}</span>
                  {dirty[s.id] ? <span className="stg_nav_dirty" role="img" aria-label="unsaved changes" title="Unsaved changes" /> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="stg_main" ref={mainRef}>
          <div className="stg_jump">
            <AfSelect
              value={tab}
              options={settingsSectionOptions()}
              onChange={(next) => setTab(next as SettingsSection)}
              searchable={false}
              ariaLabel="Settings section"
              className="stg_jump_select"
            />
          </div>
          <section className="stg_page" aria-labelledby={titleId}>
            <header className="stg_page_head">
              <p className="stg_page_group">{group.label}</p>
              <h3 className="stg_page_title" id={titleId}>
                {section.label}
              </h3>
              <div className="stg_page_lede">
                <WordsLine text={section.lede(entityName)} />
              </div>
            </header>
            <div className="stg_page_body">
              {tab === "mind" ? (
                <MindTab
                  baseUrl={baseUrl}
                  entity={entity}
                  token={token}
                  substrate={substrate}
                  onSubstrateChange={onSubstrateChange}
                  substrateTimeline={substrateTimeline}
                  lastSubstrateChangeAt={lastSubstrateChangeAt}
                  loopFacts={loopFacts}
                />
              ) : null}
              {tab === "voice" ? <VoiceTab baseUrl={baseUrl} onOpenIdentity={() => setTab("identity")} /> : null}
              {mounted("identity") ? (
                <div hidden={tab !== "identity"} data-panel="identity">
                  <IdentitySettings baseUrl={baseUrl} entity={entity} entityName={entityName} token={token} />
                </div>
              ) : null}
              {tab === "record" ? <TrackRecordPanel baseUrl={baseUrl} entity={entity} entityName={entityName} /> : null}
              {tab === "files" ? <FilesTab baseUrl={baseUrl} entity={entity} /> : null}
              {tab === "mounts" ? <MountsTab baseUrl={baseUrl} entity={entity} entityName={entityName} token={token} /> : null}
              {tab === "tools" ? <ToolsTab baseUrl={baseUrl} entity={entity} token={token} /> : null}
              {mounted("skills") ? (
                <div hidden={tab !== "skills"} data-panel="skills">
                  <SkillsTab baseUrl={baseUrl} entity={entity} entityName={entityName} token={token} onDirtyChange={onSkillsDirty} />
                </div>
              ) : null}
              {mounted("prompt") ? (
                <div hidden={tab !== "prompt"} data-panel="prompt">
                  <PromptTab baseUrl={baseUrl} entity={entity} entityName={entityName} token={token} onDirtyChange={onPromptDirty} />
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
      <AfModal
        open={confirming}
        onClose={() => setConfirming(false)}
        size="narrow"
        portal={false}
        className="stg_confirm"
        closeLabel="Keep editing"
        title="Discard unsaved changes?"
        footer={
          <>
            <button type="button" className="af-setting-btn" data-action="keep-editing" data-af-autofocus onClick={() => setConfirming(false)}>
              Keep editing
            </button>
            <button type="button" className="af-setting-btn stg_btn_danger" data-action="discard-close" onClick={onClose}>
              Discard and close
            </button>
          </>
        }
      >
        <p className="stg_confirm_text">{unsavedSentence(unsaved)}</p>
      </AfModal>
    </AfModal>
  );
}

/** "How … works": a section's long explanation, folded so the page reads calm. */
function MoreAbout({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <details className="stg_more">
      <summary>
        <Icon name="info" size={14} aria-hidden="true" />
        <span>{title}</span>
        <Icon name="chevronDown" size={14} className="stg_more_chevron" aria-hidden="true" />
      </summary>
      <div className="stg_more_body">{children}</div>
    </details>
  );
}

/** The error line a refused read/write shows (the gateway's words). */
function ErrorLine({ text }: { text: string }): React.ReactElement {
  return (
    <p className="wsp_error stg_error" role="alert">
      {text}
    </p>
  );
}

function Reading({ text = "Reading…" }: { text?: string }): React.ReactElement {
  return <p className="stg_quiet">{text}</p>;
}

// -------------------------------------------------------------------- mind

/** The mind tab: the kit's shared route picker ("Gateway default" or its
 * own provider + model, reasoning and MTP). Visits and its own time use it. */
function MindTab({
  baseUrl,
  entity,
  token,
  substrate,
  onSubstrateChange,
  substrateTimeline,
  lastSubstrateChangeAt,
  loopFacts,
}: {
  baseUrl: string;
  entity: string;
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
    <div className="stg_stack">
      {staleLoop ? (
        <p className="stg_callout stg_callout_warn" role="note">
          <Icon name="warning" size={16} aria-hidden="true" />
          <span>His own time still uses the previous mind until his next day; restart it to switch now.</span>
        </p>
      ) : null}
      <AfSettingsGroup title="Model" help="Every change saves itself. “Gateway default” follows the gateway's text model.">
        <EntityMindPicker
          baseUrl={baseUrl}
          entity={entity}
          token={token}
          onSaved={(s) => onSubstrateChange(substrateChoiceOf(s))}
        />
      </AfSettingsGroup>
      {substrateTimeline && substrateTimeline.length > 0 ? (
        <details className="stg_more stg_history">
          <summary>
            <Icon name="history" size={14} aria-hidden="true" />
            <span>Mind history</span>
            <span className="stg_count">{substrateTimeline.length}</span>
            <Icon name="chevronDown" size={14} className="stg_more_chevron" aria-hidden="true" />
          </summary>
          <ol className="stg_more_body stg_history_list">
            {substrateTimeline.map((line, i) => (
              <li key={i} className="stg_history_row">
                {line}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <EntityCognitionProfile
        baseUrl={baseUrl}
        entity={entity}
        token={token}
        mindKey={substrate ? `${substrate.provider}|${substrate.model}|${substrate.thinking ?? ""}` : ""}
      />
    </div>
  );
}

// ------------------------------------------------------------------ voice

/** The listener's own playback/microphone settings (the kit's AfVoiceSection, entity_voice.tsx). The
 * entity's own voice is part of its identity (the identity section). */
function VoiceTab({ baseUrl, onOpenIdentity }: { baseUrl: string; onOpenIdentity(): void }): React.ReactElement {
  return (
    <div className="stg_stack">
      <p className="stg_callout" role="note">
        <Icon name="user" size={16} aria-hidden="true" />
        <span>The voice he speaks with is part of his identity.</span>
        <button type="button" className="af-setting-btn stg_callout_action" data-action="open-identity" onClick={onOpenIdentity}>
          Open Identity
        </button>
      </p>
      <ListenerVoiceSettings baseUrl={baseUrl} />
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
    <div className="stg_stack">
      <div className="stg_toolbar">
        <button type="button" className="af-setting-btn" onClick={up} disabled={path === "."} data-action="up">
          Up
        </button>
        <code className="stg_path" title={path === "." ? "workspace/" : `workspace/${path}`}>
          {path === "." ? "workspace/" : `workspace/${path}`}
        </code>
      </div>
      {error ? <ErrorLine text={error} /> : null}
      {file ? (
        <div className="stg_card stg_file">
          <div className="stg_file_head">
            <code className="stg_path">{file.path}</code>
            <button type="button" className="af-setting-btn" onClick={() => setFile(null)} data-action="back">
              Back to files
            </button>
          </div>
          {file.truncated ? <p className="stg_quiet">Truncated at the read cap — the file continues on disk.</p> : null}
          <pre className="stg_pre">{file.text || "(empty file)"}</pre>
        </div>
      ) : listing ? (
        listing.entries.length === 0 ? (
          <p className="stg_empty">Empty — nothing here yet.</p>
        ) : (
          <ul className="stg_list">
            {listing.entries.map((e) => (
              <li key={e.path}>
                <button type="button" className="stg_row stg_row_button" onClick={() => openEntry(e)}>
                  <Icon name={e.kind === "file" ? "file" : e.kind === "mount" ? "database" : "folder"} size={16} className="stg_row_icon" aria-hidden="true" />
                  <span className="stg_row_name">{e.name}</span>
                  {e.kind === "file" && typeof e.size === "number" ? <span className="stg_row_meta">{formatFileSize(e.size)}</span> : null}
                  {e.kind === "mount" ? <ModeChip mode={e.mode} /> : null}
                  {e.kind !== "file" ? <Icon name="chevronRight" size={14} className="stg_row_chevron" aria-hidden="true" /> : null}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <Reading />
      )}
    </div>
  );
}

function ModeChip({ mode }: { mode: string | undefined }): React.ReactElement {
  return (
    <AfChip size="sm" tone={mode === "rw" ? "warning" : "muted"}>
      {mode === "rw" ? "read+write" : "read-only"}
    </AfChip>
  );
}

// ----------------------------------------------------------------- mounts

const MOUNT_MODE_OPTIONS = [
  { value: "ro", label: "read-only" },
  { value: "rw", label: "read+write" },
];

function MountsTab({ baseUrl, entity, entityName, token }: { baseUrl: string; entity: string; entityName: string; token: string | null }): React.ReactElement {
  const [mounts, setMounts] = useState<WorkspaceMount[] | null>(null);
  const [newPath, setNewPath] = useState("");
  const [newName, setNewName] = useState("");
  const [newMode, setNewMode] = useState<"ro" | "rw">("ro");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = useId().replace(/:/g, "");

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
    <div className="stg_stack">
      {error ? <ErrorLine text={error} /> : null}
      <AfSettingsGroup
        title="Granted folders"
        help={
          <>
            Each appears to {entityName} as <code>mounts/&lt;name&gt;/</code> with its mode; a read-only mount refuses his writes structurally.
          </>
        }
      >
        {mounts === null ? (
          <Reading />
        ) : mounts.length === 0 ? (
          <p className="stg_empty">No extra folders granted.</p>
        ) : (
          <ul className="stg_list stg_list_flat">
            {mounts.map((m) => (
              <li key={m.name} className="stg_row stg_mount">
                <Icon name="database" size={16} className="stg_row_icon" aria-hidden="true" />
                <span className="stg_mount_text">
                  <span className="stg_mount_name">
                    <code>mounts/{m.name}/</code>
                    <ModeChip mode={m.mode} />
                  </span>
                  <span className="stg_mount_path" title={m.path}>
                    {m.path}
                  </span>
                </span>
                <button
                  type="button"
                  className="af-setting-btn stg_btn_danger"
                  data-action="remove-mount"
                  disabled={busy}
                  title="Remove this grant (his tools lose it on their next call)"
                  onClick={() => save(mounts.filter((x) => x.name !== m.name))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </AfSettingsGroup>
      <AfSettingsGroup title="Grant a folder" help="An absolute path on the gateway's machine.">
        <AfSettingRow label="Folder" htmlFor={`${ids}-path`} stack>
          <input
            id={`${ids}-path`}
            type="text"
            className="stg_input"
            placeholder="/absolute/path/to/directory"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
          />
        </AfSettingRow>
        <AfSettingRow label="Name" help="Optional; the folder's own name otherwise." htmlFor={`${ids}-name`}>
          <input
            id={`${ids}-name`}
            type="text"
            className="stg_input"
            placeholder="name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </AfSettingRow>
        <AfSettingRow label="Access">
          <AfSelect value={newMode} options={MOUNT_MODE_OPTIONS} onChange={(v) => setNewMode(v as "ro" | "rw")} searchable={false} ariaLabel="Access" />
        </AfSettingRow>
        <div className="stg_actions">
          <button
            type="button"
            className="af-setting-btn stg_btn_primary"
            data-action="grant-mount"
            onClick={add}
            disabled={busy || !newPath.trim() || mounts === null}
          >
            Grant access
          </button>
        </div>
      </AfSettingsGroup>
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
  conversation: { label: "Conversation contract", hint: "How memories arrive and how the diary is offered — every session." },
  visit: { label: "Visit paragraph", hint: "The life framing during visits (own time continues after)." },
  own_time: { label: "Own-time contract", hint: "The framing of the entity's own 24/7 loop sessions." },
  operator: {
    label: "Operator instructions",
    hint:
      "Standing direction and PERMISSIONS, appended last and attributed to you — never blended into the entity's own voice. " +
      "Grants of authority belong here (\"You have my standing permission to act without asking\"). CHARACTER statements " +
      "(\"You are curious, fair…\") belong in the SPARK at creation — there they are the entity's own and its memory can find them; " +
      "here they read as orders, and a self-search would contradict them. Mid-life character change is the entity's own act (its reflection), not an operator edit.",
  },
};

/** A served layer the app has no words for reads as its key, capitalised ("own_time" → "Own time"). */
export function layerLabel(key: string): string {
  const words = key.replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/** One fold of the prompt page: a header button (chevron, title, state chip) over its content. */
function PromptFold({
  title,
  chip,
  chipTone = "muted",
  chipTitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  chip: string;
  chipTone?: "muted" | "accent" | "info";
  chipTitle?: string;
  open: boolean;
  onToggle(): void;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={open ? "stg_fold stg_fold_open" : "stg_fold"}>
      <button type="button" className="stg_fold_head" aria-expanded={open} onClick={onToggle}>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} aria-hidden="true" />
        <span className="stg_fold_title">{title}</span>
        <AfChip size="sm" tone={chipTone} title={chipTitle}>
          {chip}
        </AfChip>
      </button>
      {open ? <div className="stg_fold_body">{children}</div> : null}
    </div>
  );
}

function PromptTab({
  baseUrl,
  entity,
  entityName,
  token,
  onDirtyChange,
}: {
  baseUrl: string;
  entity: string;
  entityName: string;
  token: string | null;
  /** Unsaved layer edits (the modal asks before closing over them). */
  onDirtyChange?(dirty: boolean): void;
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

  const dirty =
    info !== null &&
    draft !== null &&
    layerKeys(info).some((key) => {
      const live = info.layers[key]?.source === "overlay" ? info.layers[key].text : "";
      return (draft[key] ?? "") !== live;
    });
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  if (error && !info) return <ErrorLine text={error} />;
  if (!info || !draft) return <Reading />;

  return (
    <div className="stg_stack">
      <MoreAbout title="How the prompt works">
        <p>
          {entityName}'s system prompt, layer by layer. The identity block and the tools text are machine-owned (identity evolves by the entity's own
          acts; tools text follows the actual grant — edit it in Tools). The layers below are yours to rewrite; empty = the built-in default.
          Saving writes <code>system_prompt.yaml</code> in the home — the next summon obeys it; a session already open keeps the prompt it was
          summoned with.
        </p>
      </MoreAbout>
      {info.warnings.length > 0 ? <ErrorLine text={info.warnings.join(" · ")} /> : null}
      {info.raw_file ? (
        <div className="stg_card">
          <p className="wsp_error stg_error">The file on disk could not be parsed — its raw content is shown here so nothing is lost. Saving replaces it.</p>
          <pre className="stg_pre">{info.raw_file}</pre>
        </div>
      ) : null}
      {error ? <ErrorLine text={error} /> : null}

      <div className="stg_folds">
        <PromptFold
          title="Identity prelude"
          chip="read-only"
          chipTitle="Rendered from the engrammed core + diary + standing; evolves only by the entity's own acts"
          open={showPrelude}
          onToggle={() => setShowPrelude(!showPrelude)}
        >
          <pre className="stg_pre">{info.prelude || "(prelude refused to render — see warnings)"}</pre>
        </PromptFold>

        {layerKeys(info).map((key) => {
          const meta = PROMPT_LAYER_META[key] ?? { label: layerLabel(key), hint: "" };
          const live = info.layers[key];
          const isOpen = open === key;
          const overlayOn = (draft[key] ?? "").trim().length > 0;
          return (
            <PromptFold
              key={key}
              title={meta.label}
              chip={overlayOn ? "rewritten" : "default"}
              chipTone={overlayOn ? "accent" : "muted"}
              chipTitle={overlayOn ? "Your rewrite is live" : "Built-in default text"}
              open={isOpen}
              onToggle={() => setOpen(isOpen ? null : key)}
            >
              {meta.hint ? <p className="stg_hint">{meta.hint}</p> : null}
              <textarea
                className="stg_textarea"
                aria-label={meta.label}
                rows={key === "operator" ? 4 : 8}
                placeholder={key === "operator" ? "(nothing yet — standing instructions you want in every summon)" : "(empty = the built-in default below)"}
                value={draft[key] ?? ""}
                onChange={(e) => {
                  setDraft({ ...draft, [key]: e.target.value });
                  setSaved(false);
                }}
              />
              {(info.defaults[key] ?? "") !== "" ? (
                <div className="stg_default">
                  <div className="stg_default_head">
                    <span>Built-in default{live?.source === "overlay" ? " (replaced by your rewrite)" : " (live)"}</span>
                    <button
                      type="button"
                      className="af-setting-btn af-setting-btn--quiet"
                      data-action="copy-default"
                      onClick={() => {
                        setDraft({ ...draft, [key]: info.defaults[key] ?? "" });
                        setSaved(false);
                      }}
                      title="Copy the default into the editor as a starting point (saving it unchanged keeps the default live)"
                    >
                      Copy to editor
                    </button>
                  </div>
                  <pre className="stg_pre">{info.defaults[key]}</pre>
                </div>
              ) : null}
            </PromptFold>
          );
        })}

        <PromptFold
          title="Full preview"
          chip="next visit summon"
          chipTone="info"
          chipTitle="The exact head the next VISIT summon composes (per-turn presence + MEMORIES append at runtime; own-time sessions swap the visit paragraph for the own-time contract)"
          open={showPreview}
          onToggle={() => setShowPreview(!showPreview)}
        >
          <pre className="stg_pre">{info.preview || "(no preview — prelude refused)"}</pre>
        </PromptFold>
      </div>

      <div className="stg_savebar">
        <button type="button" className="af-setting-btn stg_btn_primary" data-action="save-prompt" onClick={save} disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save prompt"}
        </button>
        {saved ? <span className="stg_saved" role="status">Saved — the next summon obeys it</span> : null}
        {dirty && !busy ? <span className="stg_quiet">Unsaved changes</span> : null}
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
function SkillsTab({
  baseUrl,
  entity,
  entityName,
  token,
  onDirtyChange,
}: {
  baseUrl: string;
  entity: string;
  entityName: string;
  token: string | null;
  /** Unsaved selection changes (the modal asks before closing over them). */
  onDirtyChange?(dirty: boolean): void;
}): React.ReactElement {
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

  useEffect(() => {
    onDirtyChange?.(patches.length > 0);
  }, [patches.length, onDirtyChange]);

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

  if (error && !data) return <ErrorLine text={error} />;
  if (!data) return <Reading text="Reading its shelf…" />;

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
    <div className="stg_stack">
      <MoreAbout title="How skills work">
        <p>
          What {entityName} is taught beyond his capability map — skills selected here ride his sessions per phase (Grant),
          stay off (Deny), or follow the framework default (Default = not selected). Saving writes <code>skills.yaml</code> in
          his home, marker-first: the change is a visible moment in his biography. Trust verdicts come from the shelf's gate
          verbatim — a blocked skill renders blocked, never silently skipped.
        </p>
      </MoreAbout>
      <p className="stg_quiet" data-testid="skills-standing-config">
        Delivery into his prompts lands with runtime's composition slot (in flight); until then a selection is standing config.
      </p>
      {deliveredMap.length > 0 || hostOnly.length > 0 ? (
        <div className="stg_notes wsp_skills_audience">
          {deliveredMap.length > 0 ? (
            <p>
              <span className="wsp_aud_delivered">● delivered</span> <code>{deliveredMap.map((s) => s.name).join(", ")}</code> — his
              capability map, riding every summon (it IS the entity-self-knowledge teaching; not a per-phase toggle).
            </p>
          ) : null}
          {hostOnly.length > 0 ? (
            <p className="stg_quiet">
              <span className="wsp_aud_host">▲ observer/dev only</span> {hostOnly.join(", ")} — audience=host in the registry:
              these teach agents/operators, never {entityName}. Un-grantable to an entity by construction (skill's fail-closed
              audience field), shown for transparency.
            </p>
          ) : null}
        </div>
      ) : null}
      {requiresUnmet.length > 0 ? (
        <div className="stg_notes wsp_skills_audience">
          {requiresUnmet.map((s, i) => (
            <p key={`${s.name}:${(s.phases ?? []).join(",")}:${i}`} className="stg_quiet">
              <span className="wsp_aud_unmet">⚠ dependency unmet</span> <code>{s.name}</code> —{" "}
              {typeof s.requires_unmet === "string" ? s.requires_unmet : JSON.stringify(s.requires_unmet)} (selected but
              dropped from his teaching until the dependency is declared; the gate's verdict, verbatim).
            </p>
          ))}
        </div>
      ) : null}
      {error ? <ErrorLine text={error} /> : null}
      <div className="stg_table_wrap">
        <PhaseCapabilityMatrix
          payload={data.matrix}
          patches={patches}
          onPatchesChange={(next) => {
            setPatches(next as MatrixPatch[]);
            setSaved(false);
          }}
          disabled={busy}
          title="Skills by phase"
          subtitle="Grant = taught in that phase · Default = not selected"
        />
      </div>
      {verdicts.length > 0 ? (
        <div className="stg_notes wsp_skills_verdicts" role="note" data-testid="skills-verdicts">
          <span className="wsp_aud_unmet">⚠ gate verdicts (server verbatim)</span>
          <ul className="stg_verdicts">
            {verdicts.map((v, i) => (
              <li key={i}>
                <code>{JSON.stringify(v)}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="stg_savebar">
        <button type="button" className="af-setting-btn stg_btn_primary" data-action="save-skills" onClick={save} disabled={busy || patches.length === 0}>
          {busy ? "Saving…" : "Save selection"}
        </button>
        {saved ? <span className="stg_saved" role="status">Saved — the marker is in his stream</span> : null}
        {patches.length > 0 ? <span className="stg_quiet">{patches.length} unsaved change{patches.length === 1 ? "" : "s"}</span> : null}
      </div>
    </div>
  );
}

function ToolsTab({ baseUrl, entity, token }: { baseUrl: string; entity: string; token: string | null }): React.ReactElement {
  const [policy, setPolicy] = useState<ToolPolicyInfo | null>(null);
  const [draft, setDraft] = useState<Record<string, Set<string>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The cell being written ("phase/tool"); one write at a time. */
  const [busyCell, setBusyCell] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const adopt = (p: ToolPolicyInfo) => {
    setPolicy(p);
    const d: Record<string, Set<string>> = {};
    for (const [phase, info] of Object.entries(p.phases)) d[phase] = new Set(info.tools);
    setDraft(d);
  };

  useEffect(() => {
    getToolPolicy(baseUrl, entity)
      .then(adopt)
      .catch((e: Error) => setError(e.message));
  }, [baseUrl, entity]);

  /** Each switch applies at once (state-toggles rule: no Save button for a
   * switch). TOUCHED PHASE ONLY (adversary find, 2026-07-11): sending every
   * phase materialized the day's RESOLVED defaults into the file as "the
   * operator's word" — every real home ended up with a frozen `sleep: []`
   * from pre-ruling saves, killing the ruled sleep default. The server merges
   * per phase; the other phases stay as they were (absent = follows the
   * evolving framework defaults). A refused write reverts the switch and
   * shows the reason. */
  const toggle = (phase: string, tool: string, next: boolean) => {
    if (!draft || !policy || busyCell) return;
    const before = draft;
    const change = toolSwitchChange(policy.all_tools, draft, phase, tool, next);
    setDraft(change.draft);
    setBusyCell(`${phase}/${tool}`);
    setError(null);
    setSaved(null);
    const label = PHASE_LABEL[phase] ?? phase;
    putToolPolicy(baseUrl, entity, change.body, token)
      .then((p) => {
        adopt(p);
        setSaved(`${tool} is ${next ? "on" : "off"} for ${label} — the next summon obeys it`);
      })
      .catch((e: Error & { status?: number }) => {
        setDraft(before);
        setError(e.status === 401 || e.status === 403 ? authRefusedMsg(e.status, e.message) : e.message);
      })
      .finally(() => setBusyCell(null));
  };

  if (error && !policy) return <ErrorLine text={error} />;
  if (!policy || !draft) return <Reading />;

  return <ToolGrantsView policy={policy} draft={draft} error={error} saved={saved} busyCell={busyCell} onToggle={toggle} />;
}

/** A tool name that may wrap only after its underscores ("recent_<wbr>memories"), never mid-word. */
export function breakAtUnderscores(name: string): React.ReactNode {
  const parts = name.split("_");
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {part}
      {i < parts.length - 1 ? (
        <>
          _<wbr />
        </>
      ) : null}
    </React.Fragment>
  ));
}

/** One tool switch flipped: the next draft and the PUT body — the touched
 * phase only, in the policy's tool order (pure; pinned by tests). */
export function toolSwitchChange(
  allTools: string[],
  draft: Record<string, Set<string>>,
  phase: string,
  tool: string,
  next: boolean,
): { draft: Record<string, Set<string>>; body: Record<string, string[]> } {
  const tools = new Set(draft[phase]);
  if (next) tools.add(tool);
  else tools.delete(tool);
  return { draft: { ...draft, [phase]: tools }, body: { [phase]: allTools.filter((t) => tools.has(t)) } };
}

/** The tool-grant matrix: one kit switch per tool and phase, applied at once. */
export function ToolGrantsView({
  policy,
  draft,
  error,
  saved,
  busyCell,
  onToggle,
}: {
  policy: ToolPolicyInfo;
  draft: Record<string, Set<string>>;
  error: string | null;
  saved: string | null;
  busyCell: string | null;
  onToggle(phase: string, tool: string, next: boolean): void;
}): React.ReactElement {
  const tier1 = new Set(policy.tiers["tier1"] ?? []);

  return (
    <div className="stg_stack wsp_tools">
      <MoreAbout title="How tool grants work">
        <p>
          Which tools he holds in each phase of life. The ● mark is his read-only COGNITION lane (his own memory and book — no reach into the world);
          everything else reaches outward to some degree: workspace reads/writes, web lanes (network egress), and execute_command (a sandboxed shell —
          walled, but real hands). Each switch writes <code>tool_policy.yaml</code> in his home at once — the next summon of each phase obeys it; a session already
          open (a live visit, an own-time day mid-run) keeps the grant it was summoned with. The sleep column (⏳) is standing config with an explore-only
          DEFAULT (recall, search, read) — widen it if his dreams should act; it takes effect when the sleep pass gains tool use.
        </p>
        <p>
          A switch that is on is the <strong>grant</strong> — the operator's word. What a live session can actually <em>call</em> also depends on that lane's
          wiring; a granted tool the lane cannot offer yet shows <span className="wsp_unwired" title="granted but not yet callable on this lane">▲</span> with
          the reason. The number beside a tool is its risk rank, served by the gateway.
        </p>
      </MoreAbout>
      {error ? <ErrorLine text={error} /> : null}
      <div className="stg_table_wrap">
        <table className="wsp_matrix stg_matrix">
          <thead>
            <tr>
              <th scope="col">Tool</th>
              {Object.keys(policy.phases).map((phase) => (
                <th key={phase} scope="col" title={PHASE_HINT[phase] ?? ""}>
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
                  <code>{breakAtUnderscores(tool)}</code> {tier1.has(tool) ? <span className="wsp_tier1" title="his read-only cognition lane (memory + book reads — no reach into the world)">●</span> : null}
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
                      <AfSwitch
                        variant="sm"
                        className="wsp_cell_switch"
                        label={tool}
                        ariaLabel={`${tool} in ${PHASE_LABEL[phase] ?? phase}`}
                        checked={draft[phase]?.has(tool) ?? false}
                        busy={busyCell === `${phase}/${tool}`}
                        unavailableReason={busyCell && busyCell !== `${phase}/${tool}` ? "Saving another change…" : null}
                        reasonVisible={false}
                        onChange={(next) => onToggle(phase, tool, next)}
                      />
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
      </div>
      <div className="stg_savebar" role="status">
        {saved ? <span className="stg_saved">{saved}</span> : null}
        {policy.phases["visit"]?.source === "default" && !saved ? <span className="stg_quiet">Currently on defaults — no policy file yet.</span> : null}
      </div>
    </div>
  );
}
