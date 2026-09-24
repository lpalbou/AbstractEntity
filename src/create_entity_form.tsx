/**
 * Create an entity home (the manager's second half, 0010 121500Z).
 *
 * The server owns the defaults: spark_text is OPTIONAL (the gateway fills
 * DEFAULT_SPARK_TEMPLATE with the name), and `framework: true` runs the
 * spark lint that REQUIRES the shared_vulnerability core value. Refusals
 * (lint errors, spark drift 409s) are human-written on the server — they
 * render here VERBATIM, never paraphrased.
 */

import React, { useEffect, useRef, useState } from "react";

import { createEntity } from "./stream_source";

export interface CreateEntityFormProps {
  baseUrl: string;
  token: string | null;
  onCreated(slug: string): void;
  /** Focus the name field and scroll the form into view when it opens (the
   * empty state's button and the `#new` deep link, mission JJ). */
  autoFocus?: boolean;
  /** A quiet Cancel beside the primary action (absent = no Cancel). */
  onCancel?(): void;
}

export function CreateEntityForm({ baseUrl, token, onCreated, autoFocus, onCancel }: CreateEntityFormProps): React.ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!autoFocus) return;
    rootRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    nameRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  const [name, setName] = useState("");
  const [sparkText, setSparkText] = useState("");
  const [showSpark, setShowSpark] = useState(false);
  const [framework, setFramework] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setNote(null);
    createEntity(baseUrl, trimmed, token, { spark_text: sparkText, framework })
      .then((r) => {
        const slug = String(r.slug || trimmed.toLowerCase());
        setNote(
          r.created === false
            ? `${r.name ?? trimmed} already exists — opening it.`
            : `${r.name ?? trimmed} is ready.`,
        );
        onCreated(slug);
      })
      .catch((e: Error) => {
        // Server refusals are written for humans — verbatim, never rewrapped.
        setNote(e.message);
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="create_entity" ref={rootRef} data-testid="create-entity">
      <h3 className="ce_title">Create an entity</h3>
      <label className="ce_label" htmlFor="ce_name">
        Name
      </label>
      <div className="ce_row">
        <input
          id="ce_name"
          ref={nameRef}
          type="text"
          className="ce_name"
          placeholder="For example: Pollux"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape" && onCancel) onCancel();
          }}
        />
        <button className="ce_submit" onClick={submit} disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create entity"}
        </button>
        {onCancel ? (
          <button type="button" className="ce_cancel" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      <p className="ce_hint">
        The name is all it needs: it starts from the standard starting document. An entity keeps one identity for life, so a name
        cannot later be reused for a different starting document.
      </p>
      {note ? <p className="ce_note">{note}</p> : null}
      <button type="button" className="ce_spark_toggle" aria-expanded={showSpark} onClick={() => setShowSpark((v) => !v)}>
        {showSpark ? "▾" : "▸"} Advanced: starting document {sparkText.trim() ? "(your own)" : "(standard)"}
      </button>
      {showSpark ? (
        <div className="ce_advanced">
          <textarea
            className="ce_spark"
            aria-label="Starting document (YAML)"
            placeholder="Optional starting document (YAML). Leave empty to use the standard template with the name filled in. It is stored exactly as written."
            value={sparkText}
            onChange={(e) => setSparkText(e.target.value)}
            rows={10}
            spellCheck={false}
          />
          <label
            className="ce_lint"
            title="The framework check requires the shared_vulnerability core value in the starting document; turning it off is a deliberate operator override"
          >
            <input type="checkbox" checked={framework} onChange={(e) => setFramework(e.target.checked)} />
            Check the document against the framework rules
          </label>
        </div>
      ) : null}
    </div>
  );
}
