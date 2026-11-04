/**
 * Settings → Track record (framework ADR 0052 §5, §6, §12; backlog 1119): what the entity has done,
 * how far it can be trusted for each kind of task, and whom it has met. The gateway answers from
 * records the home already keeps (`GET /entities/{name}/track-record`, `/reputation`,
 * `/acquaintances`); nothing is stored for it. Loaded when the tab opens, never on a poll.
 *
 * Trust is always shown with how many outcomes it rests on, and a kind with none reads "No
 * experience yet" (never "trusted"). Today a success only means the task finished: the page says so
 * in plain words. The words here are the app's; the numbers are the gateway's.
 */
import React, { useEffect, useState } from "react";

import {
  getEntityAcquaintances,
  getEntityReputation,
  getEntityTrackRecord,
  type Acquaintance,
  type Acquaintances,
  type Reputation,
  type TrackRecord,
  type TrustCell,
} from "./stream_source";

/** The runtime's `basis` while no one has judged the work (abstractruntime COMPLETION_RATE_ONLY). */
export const COMPLETION_RATE_ONLY = "completion-rate only";

/** A task kind is `<phase or role>/<workflow>` (ADR 0052 §5); these are its phases and roles. */
const KIND_WORDS: Record<string, string> = {
  visit: "Visits",
  work: "Work",
  personal: "Its own time",
  chat: "Chats",
  occurrence: "Automations",
  discussion: "Discussions",
};

/** The home's two work files (abstractruntime track_record: `work/task_inbox`, `work/work_order`). */
const WORK_FILES: Record<string, string> = {
  "work/task_inbox": "Tasks left for it",
  "work/work_order": "Work orders",
};

export function trustText(cell: TrustCell): string {
  if (!cell.support) return "No experience yet";
  return `Trust ${cell.trust.toFixed(2)} over ${cell.support} ${cell.support === 1 ? "outcome" : "outcomes"}`;
}

/** The plain sentence for the runtime's basis; another basis is shown as the runtime words it. */
export function basisText(basis: string): string {
  return basis === COMPLETION_RATE_ONLY ? "A success here only means the task finished: nobody has judged the quality of the work yet." : basis;
}

export interface KindRow {
  kind: string;
  label: string;
  /** The workflow part, shown only when two kinds would read the same. */
  detail: string | null;
  cell: TrustCell;
  runs: number;
}

/** One row per task kind, the most outcomes first. */
export function kindRows(reputation: Reputation, record: TrackRecord | null): KindRow[] {
  const kinds = [...new Set([...Object.keys(reputation.by_task_kind), ...Object.keys(record?.by_task_kind || {})])];
  const named = kinds.map((kind) => {
    const slash = kind.indexOf("/");
    const head = slash >= 0 ? kind.slice(0, slash) : kind;
    const label = WORK_FILES[kind] || KIND_WORDS[head] || kind;
    const cell = reputation.by_task_kind[kind] || { trust: 0.5, support: 0, successes: 0, failures: 0, last_outcome_at: null };
    return { kind, label, workflow: slash >= 0 ? kind.slice(slash + 1) : "", cell, runs: record?.by_task_kind?.[kind]?.runs ?? 0 };
  });
  const seen = new Map<string, number>();
  for (const r of named) seen.set(r.label, (seen.get(r.label) || 0) + 1);
  return named
    .map(({ kind, label, workflow, cell, runs }) => ({ kind, label, detail: (seen.get(label) || 0) > 1 && workflow ? workflow : null, cell, runs }))
    .sort((a, b) => b.cell.support - a.cell.support || a.label.localeCompare(b.label));
}

/** The runtime's reasons an interaction names no one (abstractruntime acquaintances NOT_COUNTED_*),
 * in plain words; another reason is shown as the runtime words it. */
const NOT_COUNTED_WORDS: Record<string, string> = {
  "participant of another kind (not an entity or a human)": "someone who is neither an entity nor a person (an agent in a shared room)",
  "participant without a namespace": "someone whose kind was not recorded",
  "person-started run without an actor": "a person whose name was not recorded",
};

export function notCountedText(reason: string, n: number): string {
  return `Not counted: ${n.toLocaleString()} ${n === 1 ? "meeting" : "meetings"} with ${NOT_COUNTED_WORDS[reason] || reason}.`;
}

/** The name in a recorded id (`entity:pollux` → pollux, `person:laurent` → laurent). */
export function nameOf(id: string): string {
  const i = id.indexOf(":");
  return i >= 0 ? id.slice(i + 1) : id;
}

function dayText(iso: string | null | undefined): string {
  const t = Date.parse(String(iso || ""));
  return Number.isFinite(t) ? new Date(t).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "";
}

const count = (n: number) => n.toLocaleString();

export function TrackRecordPanel({ baseUrl, entity, entityName }: { baseUrl: string; entity: string; entityName: string }): React.ReactElement {
  const [record, setRecord] = useState<TrackRecord | null>(null);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [met, setMet] = useState<Acquaintances | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const fail = (what: string) => (e: Error) => alive && setErrors((old) => [...old, `${what} could not be read: ${e.message}`]);
    getEntityTrackRecord(baseUrl, entity).then((r) => alive && setRecord(r)).catch(fail("The track record"));
    getEntityReputation(baseUrl, entity).then((r) => alive && setReputation(r)).catch(fail("Trust by task"));
    getEntityAcquaintances(baseUrl, entity).then((r) => alive && setMet(r)).catch(fail("Who it has met"));
    return () => {
      alive = false;
    };
  }, [baseUrl, entity]);

  return (
    <div className="trk" data-testid="track-record">
      {errors.map((e) => (
        <p key={e} className="wsp_status wsp_status_error" role="alert">
          {e}
        </p>
      ))}

      <section className="trk_section">
        <h4 className="idn_head">Track record</h4>
        {record ? (
          <dl className="trk_counts" data-testid="track-record-counts">
            <div><dt>Sessions</dt><dd>{count(record.sessions)}</dd></div>
            <div><dt>Runs</dt><dd>{count(record.runs)}</dd></div>
            <div><dt>Successes</dt><dd>{count(record.successes)}</dd></div>
            <div><dt>Failures</dt><dd>{count(record.failures)}</dd></div>
            <div title={`${count(record.tokens.input)} in, ${count(record.tokens.output)} out`}><dt>Tokens</dt><dd>{count(record.tokens.total)}</dd></div>
          </dl>
        ) : !errors.length ? <p className="wsp_status">Loading…</p> : null}
      </section>

      <section className="trk_section">
        <h4 className="idn_head">Trust by task</h4>
        {reputation ? (
          <>
            <p className="trk_overall" data-testid="trust-overall">
              <strong>Overall:</strong> {trustText(reputation.overall)}
            </p>
            {kindRows(reputation, record).length ? (
              <ul className="trk_list" data-testid="trust-by-task">
                {kindRows(reputation, record).map((row) => (
                  <li key={row.kind} className="trk_row">
                    <span className="trk_name">
                      {row.label}
                      {row.detail ? <span className="trk_detail"> · {row.detail}</span> : null}
                    </span>
                    <span className="trk_value">
                      {trustText(row.cell)}
                      {row.cell.support ? ` · ${row.cell.successes} succeeded, ${row.cell.failures} failed` : ""}
                      {row.cell.last_outcome_at ? ` · last ${dayText(row.cell.last_outcome_at)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="wsp_note trk_basis" data-testid="trust-basis">
              {basisText(reputation.basis)}
            </p>
          </>
        ) : null}
      </section>

      <section className="trk_section">
        <h4 className="idn_head">Who {entityName} has met</h4>
        {met ? (
          <>
            <MetList title="People" rows={met.humans} testid="met-people" />
            <MetList title="Entities" rows={met.entities} testid="met-entities" />
            {Object.entries(met.not_counted).map(([reason, n]) => (
              <p key={reason} className="wsp_note" data-testid="met-not-counted">
                {notCountedText(reason, n)}
              </p>
            ))}
          </>
        ) : null}
      </section>
    </div>
  );
}

function MetList({ title, rows, testid }: { title: string; rows: Acquaintance[]; testid: string }): React.ReactElement {
  return (
    <div className="trk_met" data-testid={testid}>
      <h5 className="trk_subhead">{title}</h5>
      {rows.length ? (
        <ul className="trk_list">
          {rows.map((row) => (
            <li key={row.id} className="trk_row">
              <span className="trk_name">{nameOf(row.id)}</span>
              <span className="trk_value">
                {count(row.interactions)} {row.interactions === 1 ? "time" : "times"} · first {dayText(row.first_seen)} · last {dayText(row.last_seen)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="wsp_note">No one yet.</p>
      )}
    </div>
  );
}
