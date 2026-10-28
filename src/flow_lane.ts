/**
 * flow_lane — pure logic for the drawer's flow-brain conversation lane
 * (operator-ordered fable5 consolidation, plan/entity-seat.md entity
 * section, findings 1/2/3 + test-gap extractions 1/2/4).
 *
 * Everything here is React-free and injectable so the poll loop, the
 * privacy guard, and the answer fold are table-testable — the drawer
 * component composes these and owns only pixels + state.
 */

import { ReplayViewFold, type ReplayView, type ReplayViewInteraction, type ReplayViewTransport } from "@abstractframework/panel-chat";

export type PollOutcome =
  | { kind: "aborted"; lastStatus: string }
  | { kind: "deadline"; lastStatus: string }
  /** Five consecutive poll failures — the drawer lost its VIEW of the
   * run; the run itself may well have completed server-side. */
  | { kind: "lost_view"; lastStatus: string }
  | { kind: "terminal"; status: "completed" | "failed" | "cancelled"; output: unknown; error: string | null };

export interface RunSummaryShape {
  status?: string;
  output?: unknown;
  error?: string | null;
}

/**
 * Poll a summoned run to terminal. ONE loop for both the turn poll and
 * the goodbye poll (they were ~80% duplicated inline; finding B).
 *
 * The abort signal is a CALLBACK, not a shared mutable boolean — the
 * caller passes a generation-token check so an abort can never be
 * silently wiped by a later poll resetting a shared flag (finding 1,
 * the resurrected-zombie interleaving).
 */
export async function pollRunToTerminal(
  fetchSummary: () => Promise<RunSummaryShape>,
  opts: {
    deadlineMs: number;
    intervalMs?: number;
    maxConsecutiveFailures?: number;
    aborted: () => boolean;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<PollOutcome> {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const interval = opts.intervalMs ?? 1500;
  const maxFailures = opts.maxConsecutiveFailures ?? 5;
  const deadline = now() + opts.deadlineMs;
  let pollFailures = 0;
  let lastStatus = "starting";
  for (;;) {
    if (opts.aborted()) return { kind: "aborted", lastStatus };
    if (now() > deadline) return { kind: "deadline", lastStatus };
    await sleep(interval);
    // Re-check the abort AFTER the sleep too — a stop click lands mid-nap
    // and must not cost one more network round.
    if (opts.aborted()) return { kind: "aborted", lastStatus };
    let run: RunSummaryShape;
    try {
      run = await fetchSummary();
      pollFailures = 0;
      if (typeof run.status === "string" && run.status) lastStatus = run.status;
    } catch {
      pollFailures += 1;
      if (pollFailures >= maxFailures) return { kind: "lost_view", lastStatus };
      continue;
    }
    const st = String(run.status || "");
    if (st === "completed" || st === "failed" || st === "cancelled") {
      return { kind: "terminal", status: st, output: run.output, error: run.error == null ? null : String(run.error) };
    }
  }
}

/** A wait for a person somewhere in the run tree, as the replay view serves it. */
export type RunWaiting = Pick<ReplayViewInteraction, "kind" | "run_id" | "wait_key" | "prompt" | "choices">;

/**
 * Follow a summoned run to terminal through the gateway's REPLAY VIEW (`GET runs/{id}/view` +
 * `/view/stream`, AbstractGateway >= 0.17.0; runtime backlog 0854): no timed `GET runs/{id}`
 * poll. A wait for a person anywhere in the tree (a tool approval, a question) is reported once
 * per wait through `onWaiting`, so a turn that asks is shown as asking, never as a silent hang.
 * At terminal the run summary is read ONCE for its structured `output` (the degraded contract,
 * `tool_rounds`); the view's final message stands in only if the summary never turns terminal.
 *
 * Fallback, labeled: a gateway without the view route (`ReplayViewUnavailableError`) gets the
 * old poll (`pollRunToTerminal`), reported through `onFallback(reason)`. Any other view failure
 * counts toward `lost_view` like a failed poll.
 */
export async function followRunToTerminal(
  runId: string,
  opts: {
    view: ReplayViewTransport;
    fetchSummary: () => Promise<RunSummaryShape>;
    deadlineMs: number;
    aborted: () => boolean;
    onWaiting?: (waiting: RunWaiting) => void;
    onFallback?: (reason: string) => void;
    maxConsecutiveFailures?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<PollOutcome> {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxFailures = opts.maxConsecutiveFailures ?? 5;
  const deadline = now() + opts.deadlineMs;
  const fold = new ReplayViewFold();
  const seenWaits = new Set<string>();
  let failures = 0;
  let lastStatus = "starting";
  const ctrl = new AbortController();
  const watchdog = setInterval(() => {
    if (opts.aborted() || now() > deadline) ctrl.abort();
  }, 250);
  const observe = (view: ReplayView | null): boolean => {
    if (!view) return false;
    lastStatus = String(view.status || lastStatus);
    const it = view.interaction;
    if (it && !seenWaits.has(`${it.run_id}:${it.wait_key}`)) {
      seenWaits.add(`${it.run_id}:${it.wait_key}`);
      opts.onWaiting?.({ kind: it.kind, run_id: it.run_id, wait_key: it.wait_key, prompt: it.prompt, choices: it.choices });
    }
    return TERMINAL_STATUSES.has(lastStatus);
  };
  try {
    for (;;) {
      if (opts.aborted()) return { kind: "aborted", lastStatus };
      if (now() > deadline) return { kind: "deadline", lastStatus };
      try {
        if (!fold.view) {
          const read = await opts.view.getView(runId, { signal: ctrl.signal });
          if (!read.notModified) fold.adopt(read.view, read.etag);
        }
        if (!observe(fold.view)) {
          let reached = false;
          await opts.view.streamView(runId, {
            lastEventId: fold.lastEventId,
            signal: ctrl.signal,
            onFrame: (frame) => {
              const outcome = fold.apply(frame);
              if (outcome === "view" || outcome === "delta") {
                failures = 0;
                if (observe(fold.view)) { reached = true; ctrl.abort(); }
              }
            },
          }).catch((e) => { if (!reached) throw e; });
          if (!reached) {
            if (opts.aborted()) return { kind: "aborted", lastStatus };
            if (now() > deadline) return { kind: "deadline", lastStatus };
            if (fold.terminal) { observe(fold.view); } else { failures += 1; if (failures >= maxFailures) return { kind: "lost_view", lastStatus }; await sleep(Math.min(2000, 150 * 2 ** (failures - 1))); continue; }
          }
        }
      } catch (e) {
        if ((e as Error)?.name === "ReplayViewUnavailableError") {
          opts.onFallback?.((e as Error).message);
          return pollRunToTerminal(opts.fetchSummary, { deadlineMs: Math.max(0, deadline - now()), aborted: opts.aborted, maxConsecutiveFailures: maxFailures, now: opts.now, sleep: opts.sleep });
        }
        if (opts.aborted()) return { kind: "aborted", lastStatus };
        if (now() > deadline) return { kind: "deadline", lastStatus };
        failures += 1;
        if (failures >= maxFailures) return { kind: "lost_view", lastStatus };
        await sleep(Math.min(2000, 150 * 2 ** (failures - 1)));
        continue;
      }
      if (!TERMINAL_STATUSES.has(lastStatus)) continue;
      // Terminal in the view: the run summary carries the structured output. It can trail the
      // ledger's terminal record by a moment (the runtime appends, then saves).
      const settled = await pollRunToTerminal(opts.fetchSummary, { deadlineMs: 15_000, intervalMs: 500, aborted: opts.aborted, maxConsecutiveFailures: maxFailures, now: opts.now, sleep: opts.sleep });
      if (settled.kind === "terminal") return settled;
      const view = fold.view!;
      const final = (view.messages || []).find((m) => m.id === `${view.root_run_id}:final`);
      return { kind: "terminal", status: lastStatus as "completed" | "failed" | "cancelled", output: final ? final.text : null, error: lastStatus === "completed" ? null : `run ${lastStatus}` };
    }
  } finally {
    clearInterval(watchdog);
  }
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

/** One line for a person-facing wait the drawer cannot answer itself. */
export function waitingLine(w: RunWaiting): string {
  const what = w.kind === "tool_approval" ? "a tool approval" : w.kind === "ask_user" ? "an answer to a question" : "an event";
  const prompt = typeof w.prompt === "string" && w.prompt.trim() ? `: “${w.prompt.trim()}”` : "";
  return `The turn is waiting for ${what}${prompt} (run ${w.run_id.slice(0, 8)}). Answer it from AbstractCode or the Observer; this lane keeps following the run.`;
}

/**
 * THE DIARY-FENCE SCREEN GUARD (finding 2+3): words elected for the
 * entity's book must never render to a visitor. One function, applied at
 * EVERY answer fold (the turn fold AND the goodbye fold — guarding one of
 * two surfaces was not defense-in-depth).
 *
 * Conservative by construction: an OPENING ```diary fence with no closing
 * fence (model truncation — the most likely real-world mangling) withholds
 * to end-of-string. Single-line fences without a newline after the info
 * string are also caught (the opener alone is the signal).
 */
export function screenDiaryFences(text: string): { display: string; leaked: boolean } {
  const opener = /```diary/i;
  if (!opener.test(text)) return { display: text, leaked: false };
  // Terminated fences first (fresh regex per call — the /g lastIndex
  // hazard the audit flagged as refactor-fragile is structurally avoided
  // by never reusing a stateful regex object across calls).
  let display = text.replace(/```diary[^\n]*\n[\s\S]*?```/gi, "[diary entry withheld from display]");
  // Any remaining opener is unterminated: withhold from it to the end.
  const idx = display.search(/```diary/i);
  if (idx >= 0) display = `${display.slice(0, idx)}[diary entry withheld from display]`;
  return { display: display.trim(), leaked: true };
}

export interface FlowAnswerFold {
  answer: string | null;
  degraded: boolean;
  momentError: string | null;
  toolsRan: string[] | null;
  toolRoundsPresent: boolean;
}

/** The tolerant answer fold for a summoned turn's output (moved verbatim
 * from the drawer; finding C's extraction 4). */
export function foldFlowAnswer(output: unknown): FlowAnswerFold {
  const o = typeof output === "object" && output !== null ? (output as Record<string, unknown>) : {};
  const rawAnswer =
    typeof output === "string" ? output : [o.answer, o.reply, o.content, o.text].find((v) => typeof v === "string" && v.trim());
  return {
    answer: typeof rawAnswer === "string" && rawAnswer.trim() ? rawAnswer : null,
    degraded: o.degraded === 1 || o.degraded === true,
    momentError: typeof o.moment_error === "string" && o.moment_error ? o.moment_error : null,
    toolsRan: Array.isArray(o.tools_ran) ? (o.tools_ran as unknown[]).map((t) => String(t)) : null,
    toolRoundsPresent: typeof o.tool_rounds === "number",
  };
}

/** Goodbye fold: the close's words, routed through the fence guard by the
 * caller (the goodbye turn is precisely the one that runs elections). */
export function foldGoodbyeWords(output: unknown): string | null {
  const o = typeof output === "object" && output !== null ? (output as Record<string, unknown>) : {};
  const words = [o.answer, o.response].find((v) => typeof v === "string" && v.trim());
  return typeof words === "string" ? words : null;
}

/** The queue card's words (decision:summon-queue-v1 §13 + §3): position
 * honest ("you're next" solo, ordinal when >1), ETA only as the labeled
 * idle-deadline ceiling, and the attempt-not-grant race legible — the
 * own-time card state is the design WORKING, never stuck-looking silence. */
export function queueCardLine(s: { state?: string; position?: number | null; waiting_behind?: string | null; current_idle_deadline?: string | null; reason?: string | null }): string {
  const st = String(s.state || "queued");
  if (st === "failed") return `The door could not admit this message: ${s.reason || "no reason served"} — the entry left the line.`;
  if (st === "reaped") return "The door released your place in line (the wait went quiet too long) — send again when ready.";
  if (st === "stepped_away") return "You stepped away from the line.";
  const pos = typeof s.position === "number" ? s.position : null;
  const posWords = pos === null || pos <= 1 ? "you're next" : `${pos}${pos === 2 ? "nd" : pos === 3 ? "rd" : "th"} in line`;
  const behind =
    s.waiting_behind === "own_time"
      ? "the seat freed, but his own time claimed it — you're still first; the door retries when he pauses"
      : `he is in another conversation — ${posWords}`;
  const ceiling = s.current_idle_deadline
    ? ` (his current session times out ${new Date(s.current_idle_deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} at the latest if it goes quiet — a ceiling, not a promise)`
    : "";
  return `${behind}${ceiling}`;
}

/** Flow-session persistence (mint/read/clear were scattered across three
 * sites; storage failures are best-effort by contract). */
export const flowSession = {
  key(entity: string): string {
    return `abstractentity_flow_session:${entity}`;
  },
  read(entity: string): string | null {
    try {
      return localStorage.getItem(flowSession.key(entity));
    } catch {
      return null;
    }
  },
  mint(entity: string): string {
    const id = `drawer-flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      localStorage.setItem(flowSession.key(entity), id);
    } catch {
      // best-effort persistence
    }
    return id;
  },
  clear(entity: string): void {
    try {
      localStorage.removeItem(flowSession.key(entity));
    } catch {
      // best-effort
    }
  },
};
