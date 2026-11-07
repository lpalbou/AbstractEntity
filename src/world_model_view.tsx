/**
 * A world model, read as a model (operator 2026-11-07: "a world model is
 * your evolving understanding/perspective on a thing and over time … it is
 * NOT a verbatim of everything we have said about that thing").
 *
 * Order, after abstractnote's entity card: what it is (first formed,
 * revisions, last updated, evidence, threads), then the understanding,
 * then how the card evolved, then the memories it comes from.
 *
 * Honesty rules (adversarial review 2026-11-07):
 *   - Authorship is never inferred. The two sleep-pass shapes are known
 *     exactly (abstractmemory world_model._floor_digest "What I know of …",
 *     and the earlier "Refined understanding of …, distilled from N lived
 *     record(s) …" written at abstractmemory af5d2c6) — those cards are
 *     evidence gathered without a model, so no understanding is written.
 *     Any other text is shown as the card's own words; this gateway does not
 *     say who wrote them (the record's authored_by is not served).
 *   - Evidence counts and dates come from the card's own text (its links
 *     are capped per revision), never from counting links.
 *   - A failed read says so; it is never shown as "nothing written".
 *   - An older revision says it is one and links to the current card.
 */

import React, { useEffect, useMemo, useState } from "react";

import { bookDate } from "./book_reader";
import { parseMechanicalCard } from "./card_words";
import type { FoldState, NodeState } from "./stream_fold";
import type { VerbatimSource } from "./verbatim_modal";
import { readRecordWords, Words } from "./verbatim_view";
import { MemoryRows, sourcesFromIds, type CardSource } from "./world_model_sources";
import { WordsLine } from "./words_line";

export type CardShape =
  | { kind: "floor"; format: "v2" | "v1"; name: string; count: number | null; first: string | null; last: string | null; kinds: string | null; threads: string[]; feeling: string | null }
  | { kind: "prose"; lead: string; since: string | null };

const V1 = /^Refined understanding of (.+?), distilled from (\d+) lived record\(s\) between (\S+) and (\S+) \(([^)]*)\)\.(?: Recurring themes: ([^.]*)\.)? This card is orientation, never authority: the sources remain the evidence, and a live encounter always overrides it\.$/s;

/** What one revision's text is: a sleep-pass evidence floor (two exact
 * shapes) or prose with an optional "Since then …" evidence line. */
export function readCard(text: string): CardShape {
  const v2 = parseMechanicalCard(text);
  if (v2) {
    return {
      kind: "floor",
      format: "v2",
      name: v2.name,
      count: v2.footer?.count ?? null,
      first: v2.footer?.first ?? null,
      last: v2.footer?.last ?? null,
      kinds: v2.footer?.kinds ?? null,
      threads: v2.footer?.threads ?? [],
      feeling: v2.feeling,
    };
  }
  const v1 = String(text || "").trim().match(V1);
  if (v1) {
    return {
      kind: "floor",
      format: "v1",
      name: v1[1],
      count: Number(v1[2]),
      first: v1[3],
      last: v1[4],
      kinds: v1[5],
      threads: (v1[6] ?? "").split(",").map((t) => t.trim()).filter(Boolean),
      feeling: null,
    };
  }
  const [lead, ...rest] = String(text || "").split("\n\nSince then");
  return { kind: "prose", lead: lead.trim(), since: rest.length ? `Since then${rest.join("\n\nSince then")}`.trim() : null };
}

/** The card's whole revision chain, oldest first, and where `card` sits in
 * it. `refines` points from a revision to the one it replaced; the chain is
 * walked both ways so an old revision knows its successors. `broken`: an
 * older revision is named but not in this view. */
export function revisionChain(fold: FoldState, card: NodeState): { chain: NodeState[]; index: number; broken: boolean } {
  const row = (gid: string) => fold.nodes.get(fold.graph_to_row.get(gid) ?? gid) ?? null;
  const back = new Map<string, string>();
  const forward = new Map<string, string>();
  for (const e of fold.structural_edges.values()) {
    if (e.relation !== "refines") continue;
    if (!back.has(e.source_graph_id)) back.set(e.source_graph_id, e.target_graph_id);
    if (!forward.has(e.target_graph_id)) forward.set(e.target_graph_id, e.source_graph_id);
  }
  const id = (n: NodeState) => n.graph_id ?? n.id;
  const seen = new Set<string>([id(card)]);
  const older: NodeState[] = [];
  let broken = false;
  for (let at = back.get(id(card)); at && !seen.has(at); at = back.get(at)) {
    seen.add(at);
    const n = row(at);
    if (!n) {
      broken = true;
      break;
    }
    older.push(n);
  }
  const newer: NodeState[] = [];
  for (let at = forward.get(id(card)); at && !seen.has(at); at = forward.get(at)) {
    seen.add(at);
    const n = row(at);
    if (!n) break;
    newer.push(n);
  }
  const chain = [...older.reverse(), card, ...newer];
  return { chain, index: older.length, broken };
}

/** Every memory the chain's revisions link (`derived_from`), oldest first. */
export function chainSources(fold: FoldState, chain: NodeState[]): CardSource[] {
  const ids = new Set(chain.map((n) => n.graph_id ?? n.id));
  const targets: string[] = [];
  for (const e of fold.structural_edges.values()) if (e.relation === "derived_from" && ids.has(e.source_graph_id)) targets.push(e.target_graph_id);
  return sourcesFromIds(fold, targets).sort((a, b) => (a.bornAt === b.bornAt ? 0 : a.bornAt < b.bornAt ? -1 : 1));
}

type Read = { state: "loading" } | { state: "ready"; text: string; shape: CardShape } | { state: "failed"; message: string };

function useCardRead(source: VerbatimSource, node: NodeState | null, enabled: boolean, attempt: number): Read {
  const [read, setRead] = useState<Read>({ state: "loading" });
  useEffect(() => {
    if (!node || !enabled) return;
    let cancelled = false;
    setRead({ state: "loading" });
    // Card revisions are born-digest records: a pure read, no access recorded.
    readRecordWords(source, node.graph_id ?? node.id, "world_model")
      .then((w) => !cancelled && setRead({ state: "ready", text: w.text, shape: readCard(w.text) }))
      .catch((e) => !cancelled && setRead({ state: "failed", message: (e as Error).message }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, node?.graph_id, enabled, attempt, source.baseUrl, source.entity]);
  return read;
}

const stamp = (iso: string | null | undefined) => (iso ? `${bookDate(iso).day}, ${bookDate(iso).time}` : "—");
const dayOf = (iso: string | null | undefined) => (iso ? bookDate(iso).day : "—");

export function WorldModelView({ fold, card, source, onSelect }: { fold: FoldState; card: NodeState; source: VerbatimSource; onSelect(id: string): void }): React.ReactElement {
  const { chain, index, broken } = useMemo(() => revisionChain(fold, card), [fold, card]);
  const latest = chain[chain.length - 1];
  const viewingOld = latest !== card;
  const [attempt, setAttempt] = useState(0);
  const read = useCardRead(source, card, true, attempt);
  const sources = useMemo(() => chainSources(fold, chain), [fold, chain]);
  const shape = read.state === "ready" ? read.shape : null;
  const name = (shape?.kind === "floor" ? shape.name : null) || String(card.title || "").replace(/^World model:\s*/i, "").trim() || "this";
  const floor = shape?.kind === "floor" ? shape : null;

  return (
    <div className="wmv">
      {viewingOld ? (
        <div className="wmv_banner">
          <WordsLine text={`This is revision ${index + 1} of ${chain.length}, replaced since.`} inline />{" "}
          <button className="wm_open" onClick={() => onSelect(latest.id)}>
            open the current card →
          </button>
        </div>
      ) : null}
      <dl className="wmv_facts">
        <dt>first formed</dt>
        <dd>
          {broken ? "before " : ""}
          {stamp(chain[0]?.born_at)}
        </dd>
        <dt>revisions</dt>
        <dd>
          {chain.length}
          {broken ? " known here (earlier ones are not in this view)" : ""}
        </dd>
        <dt>last updated</dt>
        <dd>{stamp(latest?.born_at)}</dd>
        <dt>evidence</dt>
        <dd>
          {floor?.count != null
            ? `${floor.count} lived ${floor.count === 1 ? "memory" : "memories"}${floor.first ? (floor.first === floor.last ? `, ${dayOf(floor.first)}` : `, ${dayOf(floor.first)} to ${dayOf(floor.last)}`) : ""}${floor.kinds ? ` (${floor.kinds})` : ""}`
            : `${sources.length} linked ${sources.length === 1 ? "memory" : "memories"}`}
          {viewingOld ? " — as of this revision" : ""}
        </dd>
        {floor && floor.threads.length > 0 ? (
          <>
            <dt>threads</dt>
            <dd>
              {floor.threads.map((t) => (
                <span key={t} className="wmv_thread">
                  <WordsLine text={t} inline />
                </span>
              ))}
            </dd>
          </>
        ) : null}
        {floor?.feeling ? (
          <>
            <dt>feeling</dt>
            <dd>
              <WordsLine text={floor.feeling.replace(/^Standing feeling:\s*/, "")} />
            </dd>
          </>
        ) : null}
        <dt>type</dt>
        <dd className="wmv_unknown">not served by this gateway yet</dd>
      </dl>

      <section className="wmv_section">
        <h4 className="wmv_head">Understanding of {name}</h4>
        {read.state === "loading" ? (
          <div className="ei_note wl_p">
            <WordsLine text="reading the card…" />
          </div>
        ) : null}
        {read.state === "failed" ? (
          <div className="wmv_empty">
            <WordsLine text={`The card could not be read just now (${read.message}).`} inline />{" "}
            <button className="wm_more" onClick={() => setAttempt((n) => n + 1)}>
              try again
            </button>
          </div>
        ) : null}
        {shape?.kind === "floor" ? (
          <div className="wmv_empty">
            <WordsLine
              text={`No understanding of ${name} has been written yet. This card is evidence the sleep pass gathered without a model${floor?.count != null ? ` (${floor.count} lived memories)` : ""}; nothing in this home writes an understanding from it today.`}
            />
          </div>
        ) : null}
        {shape?.kind === "prose" ? (
          <>
            <div className="wmv_as_of">
              <WordsLine text={`The card's own words, as of ${stamp(card.born_at)} — this gateway does not say who wrote them.`} />
            </div>
            <Words text={shape.lead} className="ev_markdown wmv_understanding" />
            {shape.since ? (
              <div className="wmv_since">
                <WordsLine text={shape.since} />
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {chain.length > 1 ? <Evolution chain={chain} current={card} source={source} onSelect={onSelect} /> : null}

      <section className="wmv_section">
        <h4 className="wmv_head">Where it comes from</h4>
        <div className="wmv_note">
          <WordsLine
            text={`The memories its revisions link (${sources.length}${floor?.count != null && floor.count > sources.length ? ` of the ${floor.count} it counts — each revision links its most recent ones` : ""}); open one to read his words.`}
          />
        </div>
        <MemoryRows items={sources} source={source} onSelect={onSelect} collapsed />
      </section>
    </div>
  );
}

/** Each revision, oldest first: dates up front; what each one said loads on
 * request (a long chain is dozens of reads). Identical prose in a row reads
 * as one, with "same words, more evidence" for the repeats. */
function Evolution({ chain, current, source, onSelect }: { chain: NodeState[]; current: NodeState; source: VerbatimSource; onSelect(id: string): void }): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <section className="wmv_section">
      <h4 className="wmv_head">How the card evolved</h4>
      <ol className="wmv_timeline">
        {chain.map((n, i) => (
          <RevisionStep key={n.id} node={n} previous={i > 0 ? chain[i - 1] : null} index={i} isCurrent={n === current} open={open} source={source} onSelect={onSelect} />
        ))}
      </ol>
      {!open ? (
        <button className="wm_more" onClick={() => setOpen(true)}>
          (…) what each revision said
        </button>
      ) : null}
    </section>
  );
}

function RevisionStep({ node, previous, index, isCurrent, open, source, onSelect }: { node: NodeState; previous: NodeState | null; index: number; isCurrent: boolean; open: boolean; source: VerbatimSource; onSelect(id: string): void }): React.ReactElement {
  const read = useCardRead(source, node, open, 0);
  const prev = useCardRead(source, previous, open && previous !== null, 0);
  const shape = read.state === "ready" ? read.shape : null;
  const before = prev.state === "ready" ? prev.shape : null;
  let what: React.ReactNode = null;
  if (open && read.state === "failed")
    what = (
      <span className="wmv_unknown">
        <WordsLine text="could not be read just now" inline />
      </span>
    );
  else if (shape?.kind === "floor") {
    const added = before?.kind === "floor" && before.count != null && shape.count != null ? shape.count - before.count : null;
    what = <WordsLine text={`evidence gathered by the sleep pass${shape.count != null ? ` — ${shape.count} memories` : ""}${added != null && added > 0 ? ` (+${added})` : ""}`} />;
  } else if (shape?.kind === "prose") {
    const same = before?.kind === "prose" && before.lead === shape.lead;
    what = same ? (
      <WordsLine text={`same words, more evidence${shape.since ? ` — ${shape.since}` : ""}`} />
    ) : (
      <Words text={shape.lead} className="ev_markdown wmv_step_words" />
    );
  }
  return (
    <li className="wmv_step">
      <span className="wmv_when">
        revision {index + 1} · {stamp(node.born_at)}
        {isCurrent ? " · you are reading this one" : ""}
        {!isCurrent ? (
          <button className="wm_open" onClick={() => onSelect(node.id)}>
            open →
          </button>
        ) : null}
      </span>
      {open ? (read.state === "loading" ? <span className="wmv_unknown">reading…</span> : what) : null}
    </li>
  );
}
