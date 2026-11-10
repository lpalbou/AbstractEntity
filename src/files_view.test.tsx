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

describe("the folder button beside Settings", () => {
  const src = fs.readFileSync(path.join(__dirname, "entity_view.tsx"), "utf8");
  it("comes right after the Settings button, a folder icon and the word Files", () => {
    const settings = src.indexOf('className="ec_btn ec_settings_btn"');
    const files = src.indexOf('className="ec_btn ec_files_btn"');
    expect(settings).toBeGreaterThan(-1);
    expect(files).toBeGreaterThan(settings);
    const button = src.slice(files, src.indexOf("</button>", files));
    expect(button).toContain("onClick={() => setShowFiles(true)}");
    expect(button).toContain('<Icon name="folder" size={14} />');
    expect(button).toContain("<span>Files</span>");
    // Nothing else stands between the two buttons.
    expect(src.slice(src.indexOf("</button>", settings) + 9, src.lastIndexOf("<button", files))).not.toMatch(/<(button|span|div)\b/);
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
