/**
 * A memory's stored understanding in Detail (understanding.ts reads it):
 * the provenance line under the summary — who wrote it, as of when, why —
 * and "Earlier understandings (N)", folded, every earlier reading newest
 * first, each through the shared renderer (verbatim_view.Words). A gateway
 * that does not serve the understanding gets one sentence, never a guess.
 */

import React from "react";

import { Disclosure } from "./detail_fold";
import { earlierVersions, NOT_YET, provenanceLine, provenanceWords, UNSERVED_SENTENCE, versionHead, type Understanding } from "./understanding";
import { Words } from "./verbatim_view";
import "./record_detail.css";

/** "His own words · understood as of 8 Nov 2026 · first formed". */
export function ProvenanceLine({ understanding, timeZone }: { understanding: Understanding; timeZone?: string }): React.ReactElement {
  return (
    <p className="rd_prov" data-understanding="served">
      {provenanceLine(provenanceWords(understanding, timeZone))}
    </p>
  );
}

/** The one sentence for a gateway without the understanding fields. */
export function UnservedNote(): React.ReactElement {
  return (
    <p className="rd_note" data-understanding="unserved">
      {UNSERVED_SENTENCE}
    </p>
  );
}

/** The summary when the gateway has not computed one yet. */
export function DigestNotYet(): React.ReactElement {
  return <p className="rd_key_line rd_not_yet">Summary: {NOT_YET}.</p>;
}

/** Every reading before the current one, newest first, folded. Nothing
 * when there is none; "not computed yet" when the list is not. */
export function EarlierUnderstandings({ understanding, defaultOpen = false, timeZone }: { understanding: Understanding; defaultOpen?: boolean; timeZone?: string }): React.ReactElement | null {
  const rows = earlierVersions(understanding);
  if (rows === null) {
    return (
      <Disclosure title="Earlier understandings" summary={NOT_YET} defaultOpen={defaultOpen}>
        <p className="rd_note">Whether he understood this memory differently before is {NOT_YET}.</p>
      </Disclosure>
    );
  }
  if (rows.length === 0) return null;
  return (
    <Disclosure title={`Earlier understandings (${rows.length})`} defaultOpen={defaultOpen}>
      <ol className="rd_versions">
        {rows.map((v) => (
          <li key={v.version} className="rd_version">
            <p className="rd_version_head">{versionHead(v, timeZone)}</p>
            {v.text.trim() ? <Words text={v.text} className="ev_markdown rd_summary rd_version_text" /> : <p className="rd_note">(no words)</p>}
          </li>
        ))}
      </ol>
    </Disclosure>
  );
}
