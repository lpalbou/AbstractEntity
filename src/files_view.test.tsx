/**
 * The Files view (operator test round 2, 2026-11-10): a folder button beside Settings opens his files
 * with the Settings → Files browser itself (the same component, so the same routes), in a dialog of
 * its own titled like Settings; one column on desktop, a full-height sheet on a phone.
 */
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FilesView } from "./files_view";
import { SettingsPanel } from "./workspace_panel";

const view = (): string =>
  renderToStaticMarkup(<FilesView baseUrl="http://gw.test" entity="castor" entityName="Castor" onClose={() => {}} />);
const settingsFiles = (): string =>
  renderToStaticMarkup(
    <SettingsPanel baseUrl="http://gw.test" entity="castor" entityName="Castor" token={null} substrate={null} onSubstrateChange={() => {}} initialSection="files" onClose={() => {}} />,
  );
/** The Files browser's own markup (from its root `stg_stack` to the end of the page body). */
const browser = (html: string): string => {
  const start = html.indexOf('<div class="stg_stack">');
  expect(start, "the Files browser is rendered").toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</section>", start));
};
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("the Files view", () => {
  it("is the kit's dialog titled Files + his name, with a named close button", () => {
    const html = view();
    expect(html).toContain('role="dialog"');
    expect(html).toContain("stg_modal fls_modal");
    expect(html).toMatch(/af-modal__title[^>]*>.*Files.*Castor/);
    expect(html).toContain('aria-label="Close files"');
    expect(html).toContain('data-testid="files-view"');
  });

  it("says what it is in Settings → Files' own line", () => {
    expect(view()).toContain("Browse Castor&#x27;s home workspace and read his files.");
  });

  it("shows the Settings → Files browser itself: the same markup, from his workspace root", () => {
    const own = browser(view());
    expect(own).toBe(browser(settingsFiles()));
    expect(own).toContain('data-action="up"');
    expect(own).toContain(">workspace/</code>");
  });

  it("reuses the component (no second browser, no route of its own)", () => {
    const src = fs.readFileSync(path.join(__dirname, "files_view.tsx"), "utf8");
    expect(src).toContain('import { FilesTab } from "./workspace_panel";');
    expect(src).toContain("<FilesTab baseUrl={baseUrl} entity={entity} />");
    expect(src).not.toMatch(/fetch\(|getJson|listWorkspace|readWorkspaceFile|api\/gateway/);
  });
});

describe("Files, then Settings, at the right end of the strip (backlog 0013)", () => {
  const src = fs.readFileSync(path.join(__dirname, "entity_view.tsx"), "utf8");
  it("Files comes first, a folder icon and the word Files, then Settings, nothing between them", () => {
    const files = src.indexOf('className="ec_btn ec_files_btn"');
    const settings = src.indexOf('className="ec_btn ec_settings_btn"');
    expect(files).toBeGreaterThan(-1);
    expect(settings).toBeGreaterThan(files);
    const button = src.slice(files, src.indexOf("</button>", files));
    expect(button).toContain("onClick={() => setShowFiles(true)}");
    expect(button).toContain('<Icon name="folder" size={14} />');
    expect(button).toContain("<span>Files</span>");
    expect(src.slice(settings, src.indexOf("</button>", settings))).toContain("<span>Settings</span>");
    // Nothing else stands between the two buttons, and nothing follows Settings in the strip.
    expect(src.slice(src.indexOf("</button>", files) + 9, src.lastIndexOf("<button", settings))).not.toMatch(/<(button|span|div)\b/);
    expect(src.slice(src.indexOf("</button>", settings) + 9, src.indexOf("</div>", settings))).not.toMatch(/<(button|span|div)\b|\{[a-zA-Z!]/);
  });

  it("every sentence of the strip sits in the one status line, before the buttons", () => {
    const strip = src.slice(src.indexOf('<div className="entity_controls">'), src.indexOf('className="ec_btn ec_files_btn"'));
    const status = strip.slice(strip.indexOf('<span className="ec_status">'));
    expect(status).not.toBe("");
    // The phase bar comes first; after it, the notes live only inside the status line.
    expect(strip.slice(0, strip.indexOf('<span className="ec_status">'))).not.toContain("ec_note");
    for (const note of ["{TICK_FAILURE_NOTE}", "{loopStatus.inbox_warning}", "phase-graph drift: {specDrift.detail}", "{controlNote}", "dayCauseLine(loopStatus?.day_cause)"]) {
      expect(status).toContain(note);
    }
    // Each note carries its whole sentence in its title (the line cuts it with an ellipsis).
    expect(status).toContain("title={`${TICK_FAILURE_NOTE}.");
    expect(status).toContain("title={controlNote}");
    expect(status).toContain("title={`${line.text}");
  });

  it("the status line: the free space, one fixed line, never wrapped, cut with an ellipsis; on a phone after the buttons", () => {
    const css = strip(fs.readFileSync(path.join(__dirname, "entity.css"), "utf8"));
    const rule = css.match(/\.entity_controls > \.ec_status \{([^}]*)\}/)![1];
    for (const decl of ["flex: 1 1 0;", "min-width: min(200px, 20%);", "height: 1.5em;", "line-height: 1.5em;", "overflow: hidden;", "white-space: nowrap;", "text-overflow: ellipsis;"]) {
      expect(rule).toContain(decl);
    }
    // No button pushes itself with an auto margin any more (the line takes the free space).
    expect(css).not.toMatch(/\.ec_(settings|files)_btn \{[^}]*margin-left: auto/);
    const phone = css.slice(css.indexOf("@media (max-width: 479.98px)"));
    expect(phone).toMatch(/\.entity_controls > \.ec_status \{[^}]*order: 1;[^}]*flex: none;[^}]*min-width: 0;[^}]*max-width: calc\(100vw - 28px\);/);
  });

  it("opens the Files view for the open entity on a gateway, and its close closes it", () => {
    const at = src.indexOf("<FilesView");
    expect(src.slice(src.lastIndexOf("{", at), at)).toContain('showFiles && sourceKind === "gateway" && entityName ? (');
    const el = src.slice(at, src.indexOf("/>", at));
    expect(el).toContain("entity={entityName}");
    expect(el).toContain("onClose={() => setShowFiles(false)}");
  });
});

describe("layout", () => {
  const css = strip(fs.readFileSync(path.join(__dirname, "files_view.css"), "utf8"));
  it("one column (Settings' sheet without its section list)", () => {
    expect(css).toMatch(/\.stg\.fls\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  });
  it("a full-height sheet on a phone", () => {
    const phone = css.slice(css.indexOf("@media (max-width: 767.98px)"));
    expect(phone).toMatch(/\.fls_modal\.af-modal\s*\{[^}]*height:\s*var\(--vh-full, 100vh\);/);
  });
});
