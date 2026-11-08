/**
 * The Detail tab's fold (record_detail.css `rd_fold`): its head says what is
 * inside; one click opens it. Shared by every kind's card and by the
 * understanding's earlier readings (understanding_view.tsx).
 */

import React, { useState } from "react";

import "./record_detail.css";

export function Disclosure({ title, summary, defaultOpen = false, children }: { title: string; summary?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`rd_fold ${open ? "rd_fold_open" : ""}`}>
      <button type="button" className="rd_fold_head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="rd_chev" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="rd_fold_title">{title}</span>
        {summary ? <span className="rd_fold_summary">{summary}</span> : null}
      </button>
      {open ? <div className="rd_fold_body">{children}</div> : null}
    </section>
  );
}
