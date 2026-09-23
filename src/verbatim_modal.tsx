/**
 * The verbatim reader: click a memory, read the words behind it.
 *
 * Maintainer ruling (2026-07-08 00:59): the operator reads WITHOUT
 * ceremony — no reason prompts, no refusals-by-design. One click, the
 * words. Three paths:
 * - RECORD verbatim: the gateway resolves payload_ref into the home's
 *   artifact store; interest/dream records answer `born_digest: true`
 *   (born as words — the digest IS the complete text, never an error).
 * - IDENTITY records serve the attested spark text (the seed).
 * - DIARY entries read one-click through the gateway's diary endpoint
 *   (a standard reason is attached server-side; the read still lands as
 *   a visible diary_read moment in the stream — truth, not friction).
 *
 * Rendering uses the shared panel-chat Markdown component (abstractuic);
 * structured content (YAML/JSON) is fenced so it reads as code.
 */

import React, { useEffect, useState } from "react";

import { Markdown } from "@abstractframework/panel-chat";

import { fetchDiaryEntry, fetchRecordVerbatim, type DiaryTrailEpisode, type RecordVerbatim } from "./stream_source";
import type { NodeState } from "./stream_fold";

export interface VerbatimSource {
  baseUrl: string;
  entity: string;
}

export interface VerbatimModalProps {
  node: NodeState;
  source: VerbatimSource;
  /** Present when this is a diary read through the operator door. */
  diaryReason?: string;
  onClose(): void;
}

type FetchState =
  | { phase: "loading" }
  | { phase: "ready"; verbatim: RecordVerbatim; note: string | null; trail: DiaryTrail | null }
  | { phase: "error"; message: string; unavailable: boolean };

/** The diary entry's provenance trail as served by the door (lane C). */
interface DiaryTrail {
  reflected_in: DiaryTrailEpisode[];
  written_amid: DiaryTrailEpisode[];
  warning: string | null;
}

const IDENTITY_KINDS = new Set(["value", "purpose", "trait", "claim"]);

/** Fence structured content so the Markdown component renders it as code;
 * prose passes through untouched. */
function presentText(text: string, contentType: string | undefined, kind: string): string {
  const t = String(contentType || "").toLowerCase();
  if (t.includes("yaml") || IDENTITY_KINDS.has(kind)) return "```yaml\n" + text + "\n```";
  if (t.includes("json")) return "```json\n" + text + "\n```";
  return text;
}

/** One trail row: clickable when its verbatim is servable; a plain line
 * otherwise (title without click is still orientation — honest). */
function TrailRow({ ep, onOpen }: { ep: DiaryTrailEpisode; onOpen(graphId: string, title: string): void }): React.ReactElement {
  const date = (ep.observed_at || "").slice(0, 16).replace("T", " ");
  const label = ep.title || ep.graph_id.slice(0, 28);
  return ep.verbatim_available ? (
    <button className="ev_trail_row" onClick={() => onOpen(ep.graph_id, label)} title="Open this conversation's verbatim">
      <span className={`ei_kind ei_kind_${ep.kind || "episode"}`}>{ep.kind || "episode"}</span>
      <span className="ev_trail_title">{label}</span>
      {date ? <span className="ev_trail_date">{date}</span> : null}
    </button>
  ) : (
    <div className="ev_trail_row ev_trail_row_static" title="No verbatim is served for this record">
      <span className={`ei_kind ei_kind_${ep.kind || "episode"}`}>{ep.kind || "episode"}</span>
      <span className="ev_trail_title">{label}</span>
      {date ? <span className="ev_trail_date">{date}</span> : null}
    </div>
  );
}

export function VerbatimModal({ node, source, diaryReason, onClose }: VerbatimModalProps): React.ReactElement {
  const [state, setState] = useState<FetchState>({ phase: "loading" });
  // One-level click-through (diary---verbatims): from the entry to a trail
  // episode's verbatim and back — never a modal stack.
  const [episodeView, setEpisodeView] = useState<{ graphId: string; title: string; state: FetchState } | null>(null);
  const openEpisode = (graphId: string, title: string) => {
    setEpisodeView({ graphId, title, state: { phase: "loading" } });
    fetchRecordVerbatim(source.baseUrl, source.entity, graphId)
      .then((verbatim) => setEpisodeView((prev) => (prev && prev.graphId === graphId ? { ...prev, state: { phase: "ready", verbatim, note: null, trail: null } } : prev)))
      .catch((e: Error & { status?: number }) =>
        setEpisodeView((prev) =>
          prev && prev.graphId === graphId
            ? { ...prev, state: { phase: "error", unavailable: e.status === 404, message: e.status === 404 ? "No verbatim is served for this record." : `Could not read the verbatim: ${e.message}` } }
            : prev,
        ),
      );
  };

  useEffect(() => {
    let cancelled = false;
    setState({ phase: "loading" });

    const load = async (): Promise<{ verbatim: RecordVerbatim; note: string | null; trail: DiaryTrail | null }> => {
      if (node.diary && node.entry_id) {
        const entry = await fetchDiaryEntry(source.baseUrl, source.entity, node.entry_id, diaryReason || "operator review");
        // The provenance trail (diary---verbatims, laurent's directive):
        // reflected_in = the conversation that led to the entry;
        // written_amid = what he attended to at write time. Absent on
        // projection-less old-vintage entries — honest absence, no block.
        const t = entry.trail;
        const trail: DiaryTrail | null =
          t && ((t.reflected_in?.length ?? 0) > 0 || (t.written_amid?.length ?? 0) > 0 || (entry.warnings?.length ?? 0) > 0)
            ? {
                reflected_in: t.reflected_in ?? [],
                written_amid: t.written_amid ?? [],
                warning: entry.warnings?.length ? entry.warnings.join("; ") : null,
              }
            : entry.warnings?.length
              ? { reflected_in: [], written_amid: [], warning: entry.warnings.join("; ") }
              : null;
        return {
          verbatim: {
            record_id: node.entry_id,
            title: node.title,
            text: String(entry.text ?? entry.gist ?? ""),
            content_type: "text/plain",
            turn_id: null,
            run_id: null,
            created_at: typeof entry.written_at === "string" ? entry.written_at : null,
            kind: "diary",
          },
          note: null,
          trail,
        };
      }
      const verbatim = await fetchRecordVerbatim(source.baseUrl, source.entity, node.graph_id ?? node.id);
      let note: string | null = null;
      if (verbatim.born_digest) {
        // World cards carry a machine-worded nuance (memory c2530: cards
        // are mechanical distillations awaiting the entity's OWN
        // re-authoring through the revision chain — honest but not his
        // authored prose yet).
        note =
          node.kind === "world_model"
            ? "His working model of this entity — born as words by the sleep pass (mechanical distillation for now; it becomes his own prose only through his revisions, never batch repair)."
            : "Born as words — this record was never a compression; the words you see are all the words there are.";
      } else if (IDENTITY_KINDS.has(node.kind)) {
        note = "The seed — this is the attested spark text the identity was engrammed from.";
      }
      return { verbatim, note, trail: null };
    };

    load()
      .then(({ verbatim, note, trail }) => {
        if (!cancelled) setState({ phase: "ready", verbatim, note, trail });
      })
      .catch((e: Error & { status?: number }) => {
        if (cancelled) return;
        const unavailable = e.status === 404;
        setState({
          phase: "error",
          unavailable,
          message:
            e.status === 403
              ? "The gateway refused this read (403). Maintainer ruling 2026-07-08: operator reads are not to be refused — this refusal is a gateway-side bug; reported on the channel."
              : unavailable
                ? "No verbatim is served for this memory — the record carries none. The digest above remains the honest summary."
                : `Could not read the verbatim: ${e.message}`,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [node, source, diaryReason]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
      <div className="ev_panel">
        <div className="ev_head">
          <div className="ev_title">
            <span className={`ei_kind ei_kind_${node.diary ? "diary" : node.kind}`}>{node.diary ? "diary" : node.kind}</span>
            <span>{node.title || node.id.slice(0, 24)}</span>
          </div>
          <button className="ev_close" onClick={onClose}>
            close
          </button>
        </div>
        <div className="ev_body">
          {episodeView ? (
            <>
              <button className="ev_trail_back" onClick={() => setEpisodeView(null)}>
                ← back to the entry
              </button>
              <div className="ev_trail_open_title">{episodeView.title}</div>
              {episodeView.state.phase === "loading" ? <div className="ev_status">reading…</div> : null}
              {episodeView.state.phase === "error" ? (
                <div className={`ev_status ${episodeView.state.unavailable ? "" : "ev_status_error"}`}>{episodeView.state.message}</div>
              ) : null}
              {episodeView.state.phase === "ready" ? (
                <>
                  <Markdown text={episodeView.state.verbatim.text} className="ev_markdown" />
                  <div className="ev_meta">
                    {episodeView.state.verbatim.created_at ? <span>{episodeView.state.verbatim.created_at.slice(0, 19)}</span> : null}
                    <span>lossless verbatim — the words that led to the entry</span>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <>
              {state.phase === "loading" ? <div className="ev_status">reading…</div> : null}
              {state.phase === "error" ? <div className={`ev_status ${state.unavailable ? "" : "ev_status_error"}`}>{state.message}</div> : null}
              {state.phase === "ready" ? (
                <>
                  {state.note ? <div className="ev_note">{state.note}</div> : null}
                  <Markdown text={presentText(state.verbatim.text, state.verbatim.content_type, node.kind)} className="ev_markdown" />
                  <div className="ev_meta">
                    {state.verbatim.turn_id ? <span>turn {state.verbatim.turn_id}</span> : null}
                    {state.verbatim.run_id ? <span>{state.verbatim.run_id}</span> : null}
                    {state.verbatim.created_at ? <span>{state.verbatim.created_at.slice(0, 19)}</span> : null}
                    <span>{state.verbatim.born_digest ? "born as words" : node.diary ? "the book" : "lossless verbatim — the digest is what recall carries"}</span>
                  </div>
                  {/* Honest absence, never silence (framework c27, laurent's
                    * click test): a diary entry with no served trail must
                    * SAY why — a silent nothing is indistinguishable from
                    * broken. Two honest causes named. */}
                  {node.diary && !state.trail ? (
                    <div className="ev_trail">
                      <div className="ev_trail_head">provenance</div>
                      <p className="wsp_quiet ev_trail_absent">
                        No trail is served for this entry — either the gateway does not yet serve provenance links (a door restart
                        surfaces them) or this entry formed before trails existed. Its verbatim origins are not reachable from here yet.
                      </p>
                    </div>
                  ) : null}
                  {state.trail ? (
                    <div className="ev_trail">
                      {state.trail.reflected_in.length > 0 ? (
                        <>
                          <div className="ev_trail_head" title="Formation-time edge: the exchange whose reflection this entry was born from — click to read the exact words.">
                            The conversation that led here
                          </div>
                          {state.trail.reflected_in.map((ep) => (
                            <TrailRow key={ep.graph_id} ep={ep} onOpen={openEpisode} />
                          ))}
                        </>
                      ) : null}
                      {state.trail.written_amid.length > 0 ? (
                        <>
                          <div className="ev_trail_head" title="What he was attending to when he wrote — the act-frame edges, private entries included.">
                            Written amid
                          </div>
                          {state.trail.written_amid.map((ep) => (
                            <TrailRow key={ep.graph_id} ep={ep} onOpen={openEpisode} />
                          ))}
                        </>
                      ) : null}
                      {state.trail.warning ? <div className="ev_trail_warn">{state.trail.warning}</div> : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
