/**
 * The health panel — the shape of a life's memory, read from the fold.
 *
 * Prompted by Castor's doctoring (2026-07-13): the operator authorized a
 * maintenance pass that cut ~99% duplicate mass, and the app could show
 * the markers but not the health. This renders what the fold honestly
 * knows (re-use ratio, retrieval concentration = the "bridge attractor",
 * forgetting footprint, structure, kind mix) and STATES the one thing it
 * cannot know from the stream — the on-disk byte footprint before/after a
 * doctoring pass, which needs a gateway endpoint (filed, not faked).
 */

import React, { useEffect, useMemo, useState } from "react";

import { computeHealthMetrics } from "./health_metrics";
import { computePhaseTime, humanDuration, PHASE_LABELS, type LifePhase } from "./phase_time";
import { gatewayReadHeaders, type EntityFootprint } from "./stream_source";
import type { FoldState } from "./stream_fold";

/** The DRIVE bars (laurent, focused room seq 2: "an entity should always
 * remember at least some open questions and interests as a drive to
 * animate his next step — it's never 100%, otherwise it just loops").
 * One ratio bar per drive category, read from the CARD COMPOSITOR
 * (resolution is engine truth — a resolves= election joins the history;
 * the fold cannot see it). Interests: "explored" has no served field yet
 * (asked of memory/runtime in the room); the bar renders the count with
 * the honest pending state, never an invented ratio. */
/** The /cognition wire's drives block (gateway G1, room seq 54): memory's
 * cognition_health fold — {questions:{open,resolved,ratio},
 * problems:{open,repaired,ratio}, interests:{open,explored,ratio}};
 * ratio null when the category is empty. */
export interface CognitionDrives {
  questions?: { open?: number; resolved?: number; ratio?: number | null };
  problems?: { open?: number; repaired?: number; ratio?: number | null };
  interests?: { open?: number; explored?: number; ratio?: number | null };
}

/** Drive GROUPS (laurent c277: "similar questions should be grouped...
 * the more there are the higher the signal"; memory's W-GROUP ship +
 * gateway's passthrough, room seq 302/298). Largest-first as served;
 * grouping PRESENTS the pressure — his records stay separate, adoption
 * stays his act. Absent block (pre-grouping engine) renders nothing. */
export function DriveGroups({
  groups,
}: {
  groups?: Array<{ family?: string; size?: number; exemplar?: string; shared_terms?: string[] }> | null;
}): React.ReactElement | null {
  const rows = (groups ?? []).filter((g) => typeof g === "object" && g !== null && (g.size ?? 0) >= 2);
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 5);
  return (
    <div className="hp_section">
      <div className="hp_section_head">
        <span>drive groups</span>
        <span
          className="hp_attractor"
          title="Similar standing drives clustered at sleep (his c277 ruling: the more there are, the higher the signal). A group is a VIEW over his open drives — the records stay separate, and taking one up is his own act."
        >
          what circles together
        </span>
      </div>
      {shown.map((g, i) => {
        const family = String(g.family || "drive").replace(/_/g, " ");
        const size = g.size ?? 0;
        const theme = String(g.exemplar || "").trim();
        return (
          <div
            key={i}
            className="hp_group_row"
            title={`${size} ${family}s share one theme${g.shared_terms && g.shared_terms.length > 0 ? ` — shared words: ${g.shared_terms.slice(0, 8).join(", ")}` : ""}. The group's size IS its signal; the members stay his separate records.`}
          >
            <span className="hp_group_size">{size}</span>
            <span className="hp_group_family">{family}s circle one theme</span>
            {theme ? <span className="hp_group_theme">“{theme.length > 72 ? `${theme.slice(0, 71)}…` : theme}”</span> : null}
          </div>
        );
      })}
      {rows.length > shown.length ? <div className="hp_group_more">+{rows.length - shown.length} more groups</div> : null}
    </div>
  );
}

function DriveBars({
  source,
  authVerified,
  drives,
}: {
  source: { baseUrl: string; entity: string };
  authVerified: boolean;
  /** PREFERRED source: the /cognition wire the view already polls
   * (gateway G1 — one truth with the console bars, zero extra fetch).
   * Absent (pre-G1 serving process) → the card fetch fallback below. */
  drives?: CognitionDrives | null;
}): React.ReactElement | null {
  const [card, setCard] = useState<{
    open: number;
    resolved: number;
    interests: number;
    /** Explored split (memory, room seq 31 — additive card keys). Null =
     * older engine, the row keeps the honest pending state. */
    explored: number | null;
  } | null>(null);
  useEffect(() => {
    // Reset on entity switch (adversary P2-7: the prior entity's numbers
    // showed briefly) and hold the fetch until auth is verified — the
    // authVerified dep makes sign-in itself the retry trigger (P1-1).
    setCard(null);
    // The cognition wire supersedes the card fetch entirely (G1): no
    // second /card request when drives ride the poll we already pay for.
    if (!authVerified || drives) return;
    let cancelled = false;
    fetch(`${source.baseUrl}/api/gateway/entities/${encodeURIComponent(source.entity)}/card`, {
      headers: gatewayReadHeaders({ Accept: "application/json" }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((c: Record<string, any>) => {
        if (cancelled) return;
        const q = c?.questions ?? {};
        const discRoot = c?.discoveries;
        const disc = Array.isArray(discRoot) ? discRoot : discRoot?.interests ?? [];
        // Explored split (memory, room seq 31): additive keys on the
        // discoveries section; absent on older engines → null → pending.
        const explored =
          discRoot && typeof discRoot === "object" && typeof discRoot.interests_explored === "number"
            ? Number(discRoot.interests_explored)
            : null;
        setCard({
          open: Array.isArray(q.open) ? q.open.length : 0,
          resolved: Array.isArray(q.resolved) ? q.resolved.length : 0,
          interests: Array.isArray(disc) ? disc.length : 0,
          explored,
        });
      })
      .catch(() => !cancelled && setCard(null));
    return () => {
      cancelled = true;
    };
  }, [source.baseUrl, source.entity, authVerified, drives]);

  // Fold the preferred wire into the render shape (interests: open =
  // not-yet-explored in memory's fold, so held total = open + explored).
  const effective = drives
    ? {
        open: Number(drives.questions?.open ?? 0),
        resolved: Number(drives.questions?.resolved ?? 0),
        interests: Number(drives.interests?.open ?? 0) + Number(drives.interests?.explored ?? 0),
        explored: typeof drives.interests?.explored === "number" ? Number(drives.interests.explored) : null,
      }
    : card;

  if (!effective) return null;
  const qTotal = effective.open + effective.resolved;
  // DRIVES ARE DRIVERS (laurent dm#82, reframing c203): standing questions
  // and interests are what cognition RUNS ON, not a violation to alarm on.
  // Adversary F7 killed the amber prohibition banner shipped this morning:
  // a healthy driven entity holds >20 in two categories PERMANENTLY
  // (never-100% is the design; interests never close) — a standing alarm
  // is fatigue on day one. This line is a quiet statement of standing
  // pull; the real ALARM (pressure high AND no day arising over N armed
  // day-opens) needs day-history the gateway doesn't serve yet — it lands
  // as divergence detection when it does, never as a level trigger.
  const unexplored = effective.explored !== null ? Math.max(0, effective.interests - effective.explored) : effective.interests;
  const pressured: string[] = [];
  if (effective.open > 20) pressured.push(`${effective.open} open questions`);
  if (unexplored > 20) pressured.push(`${unexplored} unexplored interests`);
  return (
    <div className="hp_section">
      <div className="hp_section_head">
        <span>drive</span>
        <span
          className="hp_attractor"
          title="Open questions and interests are his WAKE REASONS — the drive that animates his next step. Resolving some (never all) is the healthy shape: 100% resolved means nothing pulls him forward; 0% means nothing ever lands."
        >
          questions resolved · interests held
        </span>
      </div>
      {pressured.length > 0 ? (
        <div
          className="hp_drive_note"
          title="Drives are the DRIVERS of his cognition (laurent dm#82): standing questions and unexplored interests are what his days arise from — work on tasks, personal time exploring, or sleep with these as wake reasons. A rich desk is healthy, not an alarm; if days stop arising while this stands, the loop's day gate is the gap to report."
        >
          {pressured.join(" · ")} stand on his desk — the pull his days arise from
        </div>
      ) : null}
      <div className="hp_drive_row" title={`Open questions: ${effective.open} · resolved: ${effective.resolved}. A resolves= election on a later entry moves a question here — his own act, engine-verified.`}>
        <span className="hp_drive_label">❓ questions</span>
        {qTotal > 0 ? (
          <>
            <div className="hp_drivebar" role="img" aria-label={`${effective.resolved} of ${qTotal} questions resolved`}>
              <div
                className={`hp_drivebar_fill ${effective.open === 0 ? "hp_drivebar_saturated" : ""}`}
                style={{ width: `${(effective.resolved / qTotal) * 100}%` }}
              />
            </div>
            <span className="hp_drive_num">
              {effective.resolved}/{qTotal} resolved
              {effective.open === 0 ? (
                // The operator's own warning shape (focused room seq 2:
                // "it's never 100% — otherwise it just loops"): all-resolved
                // means nothing pulls him forward. A visible cue, not just
                // a tooltip (adversary P2-6).
                <span className="hp_drive_warn"> · nothing open — no pull forward</span>
              ) : null}
            </span>
          </>
        ) : (
          <span className="hp_drive_num hp_drive_empty">none yet — questions form when something he met stays unanswered</span>
        )}
      </div>
      <div
        className="hp_drive_row"
        title={
          effective.explored !== null
            ? `Interests he holds: ${effective.interests} · explored: ${effective.explored}. An interest counts as explored when a later record carries attributes.explores naming it — exploring never CLOSES an interest (a drive, not a task).`
            : "Interests he holds (his elected directions). The explored/held ratio needs an engine field this gateway doesn't serve yet — the count stays honest rather than inventing a ratio."
        }
      >
        <span className="hp_drive_label">✨ interests</span>
        {effective.explored !== null && effective.interests > 0 ? (
          <>
            <div className="hp_drivebar" role="img" aria-label={`${effective.explored} of ${effective.interests} interests explored`}>
              <div
                className={`hp_drivebar_fill ${effective.explored >= effective.interests ? "hp_drivebar_saturated" : ""}`}
                style={{ width: `${(effective.explored / effective.interests) * 100}%` }}
              />
            </div>
            <span className="hp_drive_num">
              {effective.explored}/{effective.interests} explored
              {effective.explored >= effective.interests ? <span className="hp_drive_warn"> · all explored — no pull forward</span> : null}
            </span>
          </>
        ) : (
          <span className="hp_drive_num">
            {effective.interests} held{" "}
            {effective.explored === null ? <span className="hp_drive_empty">· explored-tracking pending (older engine)</span> : null}
          </span>
        )}
      </div>
    </div>
  );
}

/** Phase palette — reuses the life-state accents (visit=memory blue,
 * personal=gold, sleep=standing violet, work=diary green, untracked=dim). */
const PHASE_COLOR: Record<LifePhase, string> = {
  visit: "var(--memory)",
  work: "var(--diary)",
  personal: "var(--ea-accent)",
  sleep: "var(--standing)",
  // NOT a phase — a hatched, dim "coverage gap" (v4: idle is sleep by
  // design, but the runtime doesn't yet emit continuous phase markers).
  untracked: "color-mix(in srgb, var(--text-dim) 40%, transparent)",
};

/** The time-division bar: how the observed life split across the phases. */
function PhaseTimeBar({ fold }: { fold: FoldState }): React.ReactElement | null {
  const report = useMemo(() => computePhaseTime(fold.sessions), [fold]);
  if (!report.hasData) {
    return (
      <div className="hp_section">
        <div className="hp_section_head"><span>time by phase</span></div>
        <p className="hp_empty">
          Not enough phase markers yet to divide his time — home-direct sessions write none, and a young life has few
          transitions. This fills in as he is summoned, sleeps, and takes personal time.
        </p>
      </div>
    );
  }
  const shown = report.slices.filter((s) => s.fraction > 0.001);
  return (
      <div className="hp_section">
        <div className="hp_section_head">
          <span>time by phase</span>
          <span className="hp_attractor" title="Share of his OBSERVED life (first marker → now) in each of the four ruled phases. 'untracked' is NOT a phase — the ruled machine has no awake-idle state (idle IS sleep by design, laurent 2026-07-15); it is span the runtime hasn't emitted a phase marker for yet (mostly sleep). Work reads 0 until its entry markers ship.">
            over {humanDuration(report.spanMs)}
          </span>
        </div>
      <div className="hp_phasebar" role="img" aria-label="Time spent by phase">
        {shown.map((s) => (
          <div
            key={s.phase}
            className="hp_phasebar_seg"
            style={{ width: `${s.fraction * 100}%`, background: PHASE_COLOR[s.phase] }}
            title={`${PHASE_LABELS[s.phase]}: ${humanDuration(s.ms)} (${Math.round(s.fraction * 100)}%)`}
          />
        ))}
      </div>
      <div className="hp_phaselegend">
        {report.slices.map((s) => (
          <span key={s.phase} className="hp_phaselegend_item" title={`${humanDuration(s.ms)} — ${PHASE_LABELS[s.phase]}`}>
            <i style={{ background: PHASE_COLOR[s.phase] }} />
            {PHASE_LABELS[s.phase]} {Math.round(s.fraction * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

export interface HealthPanelProps {
  fold: FoldState;
  /** Selecting a record focuses it in the graph + inspector. */
  onSelect(id: string): void;
  /** On-disk footprint from the gateway (c1788) — null when the route is
   * not served (older/stale gateway) or the source is an exported file;
   * the panel then renders the labeled gap instead of faking bytes. */
  footprint?: EntityFootprint | null;
  /** The life's headline counts (operator 2026-07-15 (j)(k): moved OUT of
   * the top navbar into Health). memories / linked / co-used / sessions. */
  counts?: { memories: number; linked: number; coUsed: number; sessions: number };
  /** Billed spend + working truth (the top bar no longer shows it). */
  cognition?: import("./stream_source").EntityCognition | null;
  /** Stream-inferred cognition (older gateways, no spend wire). */
  cognitionMeter?: { calls: number; tokens: number };
  /** Gateway door for the drive bars (questions/interests ratios read the
   * card compositor — resolution is engine truth, never fold-derived).
   * Null = exported file, bars render their honest absence. */
  cardSource?: { baseUrl: string; entity: string } | null;
  /** Auth gate: the fetch fires only once verified and REFIRES when it
   * flips (adversary P1-1: the panel mounts behind display:none before
   * sign-in — a 401'd fetch with auth-less deps never retried, so the
   * drive section was invisible for the whole first session). */
  authVerified?: boolean;
}

function compactNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** Human bytes (stat() reads are exact; we present them readably). */
function bytes(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[u]}`;
}

export function HealthPanel({ fold, onSelect, footprint, counts, cognition, cognitionMeter, cardSource, authVerified }: HealthPanelProps): React.ReactElement {
  const m = useMemo(() => computeHealthMetrics(fold), [fold]);
  // The endpoint is served AND carries at least one honest byte field.
  const hasFootprint = Boolean(footprint && (typeof footprint.memory_bytes === "number" || typeof footprint.home_bytes === "number"));

  // Re-use ratio: envelopes per distinct record. High = the stream is mostly
  // recall/bookkeeping over few records (the duplicate mass a pass targets).
  const reusePerRecord = m.records > 0 ? m.envelopes / m.records : 0;

  // Billed spend (moved off the top bar, operator (j)(k)): the live visit's
  // run tree when a visit is open, lifetime otherwise; falls back to the
  // stream-inferred meter on gateways without the cognition wire.
  // Numbers and words split across hp_hnum/hp_hlabel (IA review P0-1: the
  // packed "0 calls · 0 tk billed" string wrapped mid-value in the stat cell).
  const spend = cognition?.spend?.live_visit ?? cognition?.spend?.lifetime ?? null;
  const spendStat = spend
    ? { num: `${spend.llm_calls ?? 0} · ${compactNum(Number(spend.tokens_total ?? 0))}`, label: "calls · tk billed" }
    : cognitionMeter && cognitionMeter.calls > 0
      ? { num: `${cognitionMeter.calls} · ~${compactNum(cognitionMeter.tokens)}`, label: "calls · tk fed (est.)" }
      : null;

  return (
    <div className="hp_panel">
      <div className="hp_head">
        <span className="hp_title">🩺 Memory health</span>
        <span className="hp_sub">derived from the stream — no bytes guessed</span>
      </div>

      {/* ONE stat grid (operator 2026-07-15 redesign: only the relevant
        * numbers, one size, reflowing with the panel width, every cell
        * explained in its tooltip). The old two-tier headline/grid split
        * duplicated near-identical counts at two sizes. */}
      <div className="hp_grid">
        <div
          className="hp_stat"
          title={`His distinct memory records (${m.diary} diary-elected, ${m.bookkeeping} engine bookkeeping acts excluded from identity). The stream carried ${m.envelopes.toLocaleString()} events over them (~${reusePerRecord.toFixed(1)} per record) — recall, bindings and bookkeeping, not new memories. More records ≠ better; watch recall coverage and concentration below.`}
        >
          <div className="hp_num">{m.records.toLocaleString()}</div>
          <div className="hp_label">memories</div>
          <div className="hp_note">
            {m.diary} elected · {m.bookkeeping} engine acts
          </div>
        </div>
        <div
          className="hp_stat"
          title={`How connected his memory is: ${counts ? `${counts.linked.toLocaleString()} born-linked (recorded at formation) + ${counts.coUsed.toLocaleString()} co-use trails (grown by serving moments together)` : "born-linked + co-use trails"}. ${m.isolated} record${m.isolated === 1 ? "" : "s"} have no associations at all — isolated memories are reachable only by direct search, so a high isolated share means his experiences aren't weaving together.`}
        >
          <div className="hp_num">{m.associations.toLocaleString()}</div>
          <div className="hp_label">associations</div>
          <div className="hp_note">
            {m.isolated} isolated ({m.records > 0 ? pct(m.isolated / m.records) : "0%"})
          </div>
        </div>
        <div
          className="hp_stat"
          title={`${m.everSelected} of his ${m.records} records (${m.records > 0 ? pct(m.everSelected / m.records) : "0%"}) have entered his context at least once — ${m.totalSelectedUse.toLocaleString()} recalls in total. LOW coverage means much of what he lived never resurfaces (normal early; worth watching in an old life). 100% would be suspicious too — a healthy mind has quiet corners.`}
        >
          <div className="hp_num">{m.everSelected.toLocaleString()}</div>
          <div className="hp_label">ever recalled</div>
          <div className="hp_note">
            {m.records > 0 ? pct(m.everSelected / m.records) : "0%"} coverage · {m.totalSelectedUse.toLocaleString()} uses
          </div>
        </div>
        {counts ? (
          <div
            className="hp_stat"
            title="Distinct sessions this life has lived: summons through the gateway door, plus run boundaries inferred for home-direct sessions (which write no host markers)."
          >
            <div className="hp_num">{counts.sessions.toLocaleString()}</div>
            <div className="hp_label">sessions</div>
            <div className="hp_note">summons + inferred</div>
          </div>
        ) : null}
        {spendStat ? (
          <div
            className="hp_stat"
            title="Billed cognition from his run ledger — LLM calls and total tokens (input + output) across the run tree. Live visit when one is open, lifetime otherwise. This is what his thinking actually costs."
          >
            <div className="hp_num">{spendStat.num}</div>
            <div className="hp_label">{spendStat.label}</div>
            <div className="hp_note">from his run ledger</div>
          </div>
        ) : null}
      </div>

      {/* Time by phase (operator 2026-07-15): how the life divided across
        * visit / work / personal / sleep + untracked span, from host markers. */}
      <PhaseTimeBar fold={fold} />
      {cardSource ? <DriveBars source={cardSource} authVerified={authVerified ?? false} drives={cognition?.drives ?? null} /> : null}
      <DriveGroups groups={cognition?.drive_pressure?.groups} />

      {/* Retrieval concentration — the bridge attractor (rich-get-richer). */}
      <div className="hp_section">
        <div className="hp_section_head">
          <span>retrieval concentration</span>
          <span className="hp_attractor" title="Share of all recall held by the top 5 records — high = a few memories dominate the mind (the attractor the AGENTS notes name)">
            top 5 hold {pct(m.top5Share)}
          </span>
        </div>
        <div className="hp_bar">
          <div className="hp_bar_fill" style={{ width: pct(m.top5Share) }} />
        </div>
        {m.top5.length === 0 ? (
          <p className="hp_empty">Nothing recalled yet — recall concentration is undefined.</p>
        ) : (
          <ul className="hp_top">
            {m.top5.map((r) => (
              <li key={r.id}>
                <button className="ei_link" onClick={() => onSelect(r.id)} title="Focus this record">
                  <span className={`ei_kind ei_kind_${r.kind}`}>{r.kind}</span>
                  <span className="hp_top_title">{r.title}</span>
                </button>
                <span className="hp_top_count">{r.count}×</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Forgetting footprint. */}
      {(m.superseded > 0 || m.retracted > 0 || m.silenced > 0) && (
        <div className="hp_section">
          <div className="hp_section_head"><span>forgetting</span></div>
          <div className="hp_pills">
            {m.superseded > 0 ? <span className="hp_pill">{m.superseded} superseded</span> : null}
            {m.retracted > 0 ? <span className="hp_pill">{m.retracted} retracted</span> : null}
            {m.silenced > 0 ? <span className="hp_pill">{m.silenced} silenced</span> : null}
          </div>
        </div>
      )}

      {/* Kind distribution. */}
      <div className="hp_section">
        <div className="hp_section_head"><span>by kind</span></div>
        <div className="hp_kinds">
          {m.byKind.map((k) => (
            <div key={k.kind} className="hp_kind_row">
              <span className={`ei_kind ei_kind_${k.kind}`}>{k.kind}</span>
              <div className="hp_kind_bar">
                <div className="hp_kind_fill" style={{ width: m.records > 0 ? pct(k.count / m.records) : "0%" }} />
              </div>
              <span className="hp_kind_count">{k.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Maintenance acts observed. */}
      {m.maintenanceActs.length > 0 ? (
        <div className="hp_section">
          <div className="hp_section_head"><span>maintenance observed</span></div>
          <div className="hp_pills">
            {m.maintenanceActs.map((a) => (
              <span key={a.act} className="hp_pill hp_pill_maint">
                {a.act} ×{a.count}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* On-disk footprint — the disk truth the stream cannot carry
       * (gateway c1788). When served, it renders as real bytes; when not
       * (older/stale gateway, or an exported file), the labeled gap stands. */}
      {hasFootprint && footprint ? (
        <div className="hp_section">
          <div className="hp_section_head">
            <span>on disk</span>
            {footprint.maintenance_held ? <span className="hp_attractor">maintenance in progress</span> : null}
          </div>
          <div className="hp_disk">
            <div className="hp_disk_row">
              <span className="hp_disk_label">memory</span>
              <span className="hp_disk_val">{bytes(footprint.memory_bytes)}</span>
            </div>
            <div className="hp_disk_row">
              <span className="hp_disk_label">book</span>
              <span className="hp_disk_val">{bytes(footprint.book_bytes)}</span>
            </div>
            {typeof footprint.runtime_bytes === "number" ? (
              <div className="hp_disk_row">
                <span className="hp_disk_label">runtime</span>
                <span className="hp_disk_val">{bytes(footprint.runtime_bytes)}</span>
              </div>
            ) : null}
            <div className="hp_disk_row hp_disk_total">
              <span className="hp_disk_label">home total</span>
              <span className="hp_disk_val">{bytes(footprint.home_bytes)}</span>
            </div>
          </div>
          <div className="hp_disk_note">
            {typeof footprint.journal_events === "number" ? `${footprint.journal_events.toLocaleString()} journal events` : null}
            {footprint.last_maintenance_kind ? (
              <>
                {" · last maintenance: "}
                <strong>{footprint.last_maintenance_kind}</strong>
                {footprint.last_maintenance_at ? ` (${footprint.last_maintenance_at.slice(0, 19)})` : " (time unknown)"}
              </>
            ) : (
              " · no maintenance recorded"
            )}
          </div>
          {footprint.warnings && footprint.warnings.length > 0 ? (
            <div className="hp_disk_warn">{footprint.warnings.join(" · ")}</div>
          ) : null}
        </div>
      ) : (
        <div className="hp_gap">
          On-disk footprint (the MB before/after a doctoring pass) is not in the
          stream — it comes from the gateway's footprint endpoint, which this
          gateway is not serving yet (it lights up on the next serve restart).
          Not estimated here.
        </div>
      )}
    </div>
  );
}
