/**
 * The live activity panel's data (live_activity.ts maps it to rows).
 *
 * His own visit: the visit run's ledger, read while a turn runs. Cost, stated (performance first):
 * one `GET .../visit/{run}/ledger?after=<cursor>` per second while a turn runs and the drawer is
 * shown, each answering only the records not yet read (a turn is ~10-80 records, ~100-400 KB in
 * all); one read when the turn ends (the summary is then whole), and one short read when the drawer
 * mounts on an open visit (the last turn's summary after a reload). Nothing runs between turns.
 * Gateway side, each read lists the run's ledger (entity_visits `ledger`): 10-130 ms measured on a
 * 34-record visit.
 *
 * The flow brain: the replay view the conversation hook already follows, and the memory stream.
 *
 * Rows are recomputed at most once per animation frame, and the panel gets the same object while
 * nothing changed (no re-render per envelope).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReplayView } from "@abstractframework/panel-chat";

import { NO_ACTIVITY, foldFlowTurn, foldVisitTurn, isVisitorTurnStart, visitTurnSlice, type TurnActivity } from "./live_activity";
import { getVisitLedger, type VisitLedgerPage, type VisitLedgerRecord } from "./stream_source";
import type { ReplayEnvelope } from "./stream_types";

export const LEDGER_POLL_MS = 1000;
/** Records per read. */
export const LEDGER_PAGE = 200;
/** How far back the first read of a visit looks for the newest turn's start, then x4 each time. */
export const FIRST_LOOKBACK = 4;

export type ReadLedger = (after: number, limit: number) => Promise<VisitLedgerPage>;

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

/**
 * Follows one visit run's ledger from its newest turn on. Keeps only the records from the newest
 * visitor-turn start (a new turn drops the previous one's records). DOM-free; the hook drives it.
 */
export class VisitLedgerFollower {
  private cursor: number | null = null;
  private held: VisitLedgerRecord[] = [];
  private runStatus = "";
  private reading: Promise<boolean> | null = null;

  constructor(private readonly read: ReadLedger) {}

  /** One read: the first finds the newest turn (looking back from the end), later ones read on
   * from the cursor. Resolves true when records arrived. Concurrent calls share one read. */
  step(): Promise<boolean> {
    if (!this.reading) this.reading = this.readOnce().finally(() => (this.reading = null));
    return this.reading;
  }

  get records(): readonly VisitLedgerRecord[] {
    return this.held;
  }

  get runEnded(): boolean {
    return TERMINAL.has(this.runStatus);
  }

  activity(): TurnActivity {
    const slice = visitTurnSlice(this.held);
    return { ...foldVisitTurn(slice.records, { begun: slice.begun, complete: slice.complete, runEnded: this.runEnded }), turnKey: slice.turnKey };
  }

  private keep(records: VisitLedgerRecord[]): void {
    let start = -1;
    for (let i = records.length - 1; i >= 0; i--) {
      if (isVisitorTurnStart(records[i])) {
        start = i;
        break;
      }
    }
    this.held = start >= 0 ? records.slice(start) : this.held.concat(records);
  }

  private async readOnce(): Promise<boolean> {
    if (this.cursor === null) {
      // Where the ledger ends now (an `after` past the end answers no records and the total).
      const head = await this.read(Number.MAX_SAFE_INTEGER, 1);
      this.runStatus = String(head.status || "");
      const total = head.next_cursor;
      let back = FIRST_LOOKBACK;
      for (;;) {
        const from = Math.max(0, total - back);
        const page = await this.readAll(from);
        const records = page.records;
        if (records.some(isVisitorTurnStart) || from === 0) {
          this.held = [];
          this.keep(records);
          return true;
        }
        back *= 4;
      }
    }
    const page = await this.readAll(this.cursor);
    if (page.records.length === 0) return false;
    this.keep(page.records);
    return true;
  }

  /** Every record after `from` (page by page), moving the cursor. */
  private async readAll(from: number): Promise<{ records: VisitLedgerRecord[] }> {
    const out: VisitLedgerRecord[] = [];
    let after = from;
    for (;;) {
      const page = await this.read(after, LEDGER_PAGE);
      this.runStatus = String(page.status || "");
      for (const r of page.records) out.push(r.record);
      after = page.next_cursor;
      this.cursor = after;
      if (page.records.length < LEDGER_PAGE) return { records: out };
    }
  }
}

/** Calls `fn` at most once per animation frame (a timer where there are no frames). */
function frameScheduler(fn: () => void): { schedule(): void; cancel(): void } {
  let handle: number | ReturnType<typeof setTimeout> | null = null;
  const raf = typeof requestAnimationFrame === "function";
  return {
    schedule() {
      if (handle !== null) return;
      const run = () => {
        handle = null;
        fn();
      };
      handle = raf ? requestAnimationFrame(run) : setTimeout(run, 16);
    },
    cancel() {
      if (handle === null) return;
      if (raf) cancelAnimationFrame(handle as number);
      else clearTimeout(handle as ReturnType<typeof setTimeout>);
      handle = null;
    },
  };
}

function sameActivity(a: TurnActivity, b: TurnActivity): boolean {
  if (a === b) return true;
  if (a.turnKey !== b.turnKey || a.begun !== b.begun || a.complete !== b.complete || a.steps !== b.steps || a.tools !== b.tools || a.recalled !== b.recalled || a.formed !== b.formed || a.seconds !== b.seconds || a.rows.length !== b.rows.length) return false;
  return a.rows.every((r, i) => {
    const o = b.rows[i];
    return r.key === o.key && r.text === o.text && r.state === o.state && r.detail === o.detail && r.seconds === o.seconds;
  });
}

/** What the panel shows for his own visit: the held read when it is this visit's, the waiting state
 * while a turn just sent has not reached the ledger yet (the newest turn read is then the previous
 * one, already over: `staleTurn` is its key), nothing when there is no turn. */
export function shownVisitActivity(held: { runId: string; activity: TurnActivity } | null, runId: string | null, live: boolean, staleTurn: string | null | undefined): TurnActivity | null {
  if (!runId || !held || held.runId !== runId) return live ? NO_ACTIVITY : null;
  if (live && held.activity.complete && staleTurn !== undefined && held.activity.turnKey === staleTurn) return NO_ACTIVITY;
  return held.activity.begun || live ? held.activity : null;
}

export interface LiveActivityInput {
  baseUrl: string;
  entity: string;
  brain: "driver" | "flow";
  /** His open visit's run (the driver lane). */
  visitRunId: string | null;
  /** A turn is running now. */
  live: boolean;
  /** The drawer is shown (no reads for a hidden drawer). */
  visible: boolean;
  /** The flow brain's run view (null until served). */
  flowView: ReplayView | null;
  /** The flow brain's turn is open (its view and stream window still describe it). */
  flowActive: boolean;
  envelopes: readonly ReplayEnvelope[];
  /** The memory stream's seq when the turn started. */
  turnStartSeq: number;
  /** Test seam: the ledger read (defaults to the gateway). */
  readLedger?: ReadLedger;
}

/** The newest turn's activity for the drawer: live while it runs, whole once it ended; null when
 * there is no turn to show. */
export function useLiveActivity(input: LiveActivityInput): TurnActivity | null {
  const { baseUrl, entity, brain, visitRunId, live, visible, flowView, flowActive, envelopes, turnStartSeq, readLedger } = input;
  const [visit, setVisit] = useState<{ runId: string; activity: TurnActivity } | null>(null);
  const followerRef = useRef<{ runId: string; follower: VisitLedgerFollower } | null>(null);
  /** The turn already over when the current turn was sent (its key), so it is not shown as live. */
  const staleTurn = useRef<string | null | undefined>(undefined);
  const lastVisit = useRef(visit);
  lastVisit.current = visit;
  const wasLive = useRef(false);
  if (live !== wasLive.current) {
    wasLive.current = live;
    const held = lastVisit.current;
    staleTurn.current = live && held && held.runId === visitRunId && held.activity.complete ? (held.activity.turnKey ?? null) : undefined;
  }

  // His own visit: read while a turn runs (and once at its end / on mount).
  useEffect(() => {
    if (brain !== "driver" || !visitRunId || !visible) return;
    const runId = visitRunId;
    if (!followerRef.current || followerRef.current.runId !== runId) {
      const read: ReadLedger = readLedger ?? ((after, limit) => getVisitLedger(baseUrl, entity, runId, after, limit));
      followerRef.current = { runId, follower: new VisitLedgerFollower(read) };
    }
    const { follower } = followerRef.current;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const frame = frameScheduler(() => {
      if (stopped) return;
      const next = follower.activity();
      setVisit((old) => (old && old.runId === runId && sameActivity(old.activity, next) ? old : { runId, activity: next }));
    });
    const tick = async () => {
      try {
        if (await follower.step()) frame.schedule();
      } catch {
        // A failed read shows nothing new; the next tick reads again (the turn's own answer is the
        // authority on how it went).
      }
      if (!stopped && live) timer = setTimeout(() => void tick(), LEDGER_POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      frame.cancel();
    };
  }, [brain, visitRunId, visible, live, baseUrl, entity, readLedger]);

  // The flow brain: fold the served view and the stream, once per frame.
  const [flow, setFlow] = useState<TurnActivity | null>(null);
  const flowInputs = useRef({ flowView, envelopes, turnStartSeq });
  flowInputs.current = { flowView, envelopes, turnStartSeq };
  const flowFrame = useMemo(
    () =>
      frameScheduler(() => {
        const { flowView: v, envelopes: e, turnStartSeq: s } = flowInputs.current;
        const next = foldFlowTurn(v, e, s);
        setFlow((old) => (old && sameActivity(old, next) ? old : next));
      }),
    [],
  );
  const flowOn = brain === "flow" && (live || flowActive) && Number.isFinite(turnStartSeq);
  useEffect(() => {
    if (flowOn) flowFrame.schedule();
  }, [flowOn, flowView, envelopes, turnStartSeq, flowFrame]);
  useEffect(() => () => flowFrame.cancel(), [flowFrame]);

  if (brain === "driver") return shownVisitActivity(visit, visitRunId, live, staleTurn.current);
  if (!flowOn) return null;
  return flow && (flow.begun || live) ? flow : live ? NO_ACTIVITY : null;
}
