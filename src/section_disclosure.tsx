/**
 * A list section that folds on phones and tablets (DESIGN §12, "list panels
 * are collapsible, open by default"). Below 1024 px the side panel is a
 * drawer over the graph; a long list (the memories a recall admitted, the
 * ones it dropped, the partners a memory is used with) can push the rest of
 * the detail out of the drawer. The section head becomes a disclosure: a
 * chevron button (aria-expanded, 44 px on touch) that folds the list and
 * remembers the choice per viewer. On a docked desktop panel the head renders
 * as the plain heading it always was.
 */

import React, { useState } from "react";
import { AF_MEDIA, useAfMedia } from "@abstractframework/ui-kit";

const STORAGE_PREFIX = "abstractentity_section_open_v1:";

/** The remembered state: open unless this viewer folded the section. */
export function readSectionOpen(id: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + id) !== "0";
  } catch {
    return true;
  }
}

export function writeSectionOpen(id: string, open: boolean): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + id, open ? "1" : "0");
  } catch {
    // presentation state only
  }
}

export interface SectionDisclosureProps {
  /** Stable key for the remembered state (not per item: per kind of list). */
  id: string;
  title: React.ReactNode;
  className?: string;
  headClassName?: string;
  sectionTitle?: string;
  /** Test/SSR override of the narrow-layout query. */
  narrow?: boolean;
  children: React.ReactNode;
}

export function SectionDisclosure({ id, title, className, headClassName, sectionTitle, narrow: forced, children }: SectionDisclosureProps): React.ReactElement {
  const media = useAfMedia(AF_MEDIA.md);
  const narrow = forced ?? media;
  const [open, setOpen] = useState<boolean>(() => readSectionOpen(id));
  const cls = `ei_section${className ? ` ${className}` : ""}`;
  if (!narrow) {
    return (
      <div className={cls} title={sectionTitle}>
        <h4 className={headClassName}>{title}</h4>
        {children}
      </div>
    );
  }
  const bodyId = `ei-section-${id.replace(/[^a-z0-9_-]/gi, "-")}`;
  return (
    <div className={`${cls} ei_section_fold${open ? "" : " ei_section_folded"}`} title={sectionTitle}>
      <h4 className={headClassName}>
        <button
          type="button"
          className="ei_disclosure"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            const next = !open;
            setOpen(next);
            writeSectionOpen(id, next);
          }}
        >
          <span className="ei_disclosure_chev" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
          <span>{title}</span>
        </button>
      </h4>
      {open ? <div id={bodyId}>{children}</div> : null}
    </div>
  );
}
