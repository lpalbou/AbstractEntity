/**
 * The phase bar's writes in flight (DOM-free; the entity page holds one in a ref). Two lanes:
 *
 * - toggles and Resume: one at a time; another is dropped while one (or a Stop) is in flight;
 * - Stop, the kill switch: never waits for, and is never held by, a toggle or Resume in flight. A
 *   Stop pressed again sends again (the gateway answers `already: true`, and retries a failed
 *   step).
 *
 * An answer to a write that a later Stop overtook brings only its bar, and the rev rule
 * (phase_bar.adoptPhaseBar: the highest rev seen wins) keeps it from repainting over the stopped
 * view; its sentence is dropped (it describes a moment the Stop ended), and so is its follow-up
 * (`after`: the visit a "Resume and visit" opens). A new entity (`reset`) forgets every write in
 * flight: their late answers touch nothing. A Stop's answer records whether it left something
 * outstanding (`ui.stopIncomplete`, contract §3.1 `complete: false`).
 */
import { phaseWriteOutcome, type PhaseBarAct, type PhaseBarUi, type PhaseWriteOutcome } from "./phase_bar";
import type { PhaseBar, PhaseWire } from "./phase_bar_source";

/** What one write may touch on the page, resolved when the write starts. */
export interface PhaseWriteHost {
  /** The answer still belongs to the entity on screen. */
  current(): boolean;
  /** Paint a bar the gateway answered with (the page applies the rev rule). */
  adopt(bar: PhaseBar): void;
  note(sentence: string | null): void;
  ui(update: (u: PhaseBarUi) => PhaseBarUi): void;
  /** Re-read the truth after an act. */
  refresh(): void;
  /** The gateway refused the sign-in (401). */
  authRefused(): void;
  /** What follows this act once it is answered (never after a Stop overtook it). */
  after?(outcome: PhaseWriteOutcome): void;
}

export class PhaseWrites {
  private busy: PhaseBarAct | null = null;
  private stopsInFlight = 0;
  private stopsSent = 0;
  private generation = 0;

  /** A toggle, Resume or Stop is in flight: no pill acts (Stop still does). */
  held(): boolean {
    return this.busy !== null || this.stopsInFlight > 0;
  }

  /** A new entity: every write in flight is forgotten. */
  reset(): void {
    this.generation += 1;
    this.busy = null;
    this.stopsInFlight = 0;
  }

  /** Send one act. Stop always goes out at once; a toggle or Resume is dropped (false) while a
   * write is in flight. */
  run(act: PhaseBarAct, send: () => Promise<PhaseWire>, host: PhaseWriteHost): boolean {
    const stop = act === "stop";
    if (!stop && this.held()) return false;
    const generation = this.generation;
    const stopsAtStart = this.stopsSent;
    if (stop) {
      this.stopsSent += 1;
      this.stopsInFlight += 1;
      host.ui((u) => ({ ...u, stopping: true, confirm: null }));
    } else {
      this.busy = act;
      host.ui((u) => ({ ...u, busy: act, confirm: null }));
    }
    host.note(null);
    const mine = () => generation === this.generation && host.current();
    // A toggle or Resume answered after a Stop went out speaks of a moment the Stop ended.
    const overtaken = () => !stop && this.stopsSent !== stopsAtStart;
    const done = () => {
      if (generation !== this.generation) return;
      if (stop) {
        this.stopsInFlight -= 1;
        if (this.stopsInFlight === 0) host.ui((u) => ({ ...u, stopping: false }));
      } else {
        this.busy = null;
        host.ui((u) => ({ ...u, busy: null }));
      }
    };
    void send()
      .then(
        (wire) => {
          if (!mine()) return;
          const out = phaseWriteOutcome(wire, act);
          if (out.bar) host.adopt(out.bar);
          if (stop && out.ok) host.ui((u) => ({ ...u, stopIncomplete: out.incomplete }));
          if (!overtaken()) {
            host.note(out.sentence);
            host.after?.(out);
          }
          if (wire.status === 401) host.authRefused();
          host.refresh();
        },
        (e: unknown) => {
          if (!mine()) return;
          if (!overtaken()) host.note(`The gateway did not answer: ${(e as Error)?.message || "no response"}.`);
          host.refresh();
        },
      )
      .finally(done);
    return true;
  }
}
