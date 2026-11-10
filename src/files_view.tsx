/**
 * The Files view (operator test round 2, 2026-11-10: a folder icon next to Settings that opens his
 * files). The browser is Settings → Files itself (`FilesTab`, workspace_panel.tsx): the same routes
 * (GET …/workspace and …/workspace/file), read-only as it is there. This file only gives it a dialog
 * of its own, titled like Settings, with that section's line under the title.
 */
import React from "react";
import { AfModal } from "@abstractframework/ui-kit";

import { settingsSection } from "./settings_sections";
import { FilesTab } from "./workspace_panel";
import { WordsLine } from "./words_line";
import "./files_view.css";

export interface FilesViewProps {
  baseUrl: string;
  entity: string;
  /** His display name (the title and the line under it). */
  entityName: string;
  onClose(): void;
}

export function FilesView({ baseUrl, entity, entityName, onClose }: FilesViewProps): React.ReactElement {
  const { section } = settingsSection("files");
  return (
    <AfModal
      open
      onClose={onClose}
      // In the app's tree, like Settings: the #root-scoped touch targets and type floors apply inside.
      portal={false}
      className="stg_modal fls_modal"
      closeLabel="Close files"
      title={
        <span className="stg_title">
          <span className="stg_title_word">Files</span>
          <span className="stg_title_name">{entityName}</span>
        </span>
      }
    >
      <div className="stg fls" data-testid="files-view">
        <div className="stg_main">
          <section className="stg_page" aria-label={`${entityName}'s files`}>
            <header className="stg_page_head">
              <div className="stg_page_lede">
                <WordsLine text={section.lede(entityName)} />
              </div>
            </header>
            <div className="stg_page_body">
              <FilesTab baseUrl={baseUrl} entity={entity} />
            </div>
          </section>
        </div>
      </div>
    </AfModal>
  );
}
