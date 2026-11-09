/**
 * A record with no served title (operator 2026-11-09, adversarial review
 * S2): "title being written…" ONLY while the stream says so — the served
 * `display.pending.title` (AbstractMemory replay.py: "the app says 'title
 * being written…' for title None + pending.title") — otherwise its raw kind
 * and the date it was formed. Never a title the app makes up, never its id,
 * never a claim the stream does not make. One rule for the graph's hover
 * card, the lit-line tooltip and the ledger (Detail's heading says the same
 * with a capital, episode_view.untitledHeading).
 */

export const TITLE_BEING_WRITTEN = "title being written…";

/** The words for an untitled record: `pending` = the stream says its title
 * is being written; `at` = an ISO time (its formation). */
export function untitledWords(kind: string | null | undefined, at: string | null | undefined, pending: boolean): string {
  if (pending) return TITLE_BEING_WRITTEN;
  const when = at ? String(at).slice(0, 16).replace("T", " ") : "";
  return [kind || "memory", when].filter(Boolean).join(" · ");
}

/** Does a served display block say its title is being written? */
export function displaySaysTitlePending(display: { pending?: { title?: unknown } | null } | null | undefined): boolean {
  return display?.pending?.title === true;
}
