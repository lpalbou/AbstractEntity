/**
 * The zero-entity first run (mission JJ): the empty state, its one create
 * button, the `#new` deep link, and the head actions that return with the
 * first entity. The package ships no DOM for tests (no jsdom / Testing
 * Library), so components render with react-dom/server and clicks are the
 * element's own onClick; the browser run (Playwright, mission JJ evidence)
 * drives the same flow in a real page.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmptyRoster, EntitiesIndex, ENTITY_DOCS_URL, RosterStatus } from "./entities_index";
import { rosterHeadActions, rosterMode, wantsCreateFlow } from "./roster_empty";

type AnyElement = React.ReactElement<Record<string, unknown>>;

/** Depth-first search of a rendered element tree (host elements only). */
function findElement(node: unknown, pred: (el: AnyElement) => boolean): AnyElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, pred);
      if (hit) return hit;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  const el = node as AnyElement;
  if (pred(el)) return el;
  return findElement(el.props.children, pred);
}

const noop = () => undefined;

describe("empty state (zero entities)", () => {
  it("renders the create button, the docs link and plain words", () => {
    const html = renderToStaticMarkup(<EmptyRoster onCreate={noop} />);
    expect(html).toContain("No entities yet");
    expect(html).toContain("Create your first entity");
    expect(html).toContain("What is an entity?");
    expect(html).toContain(ENTITY_DOCS_URL);
    // The operator's list of words a first-time reader should not meet.
    for (const jargon of ["entity homes", "home", "own-time", "own time", "moments", "spark", "engram"]) {
      expect(html.toLowerCase()).not.toContain(jargon);
    }
  });

  it("the button opens the creation flow", () => {
    const onCreate = vi.fn();
    const tree = EmptyRoster({ onCreate });
    const button = findElement(tree, (el) => el.type === "button" && el.props["data-testid"] === "eix-create-first");
    expect(button).not.toBeNull();
    (button!.props.onClick as () => void)();
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe("what stands in for the list", () => {
  it("zero entities renders the empty state with its button", () => {
    const html = renderToStaticMarkup(<RosterStatus mode="empty" showCreate={false} onCreate={noop} />);
    expect(html).toContain('data-testid="eix-empty"');
    expect(html).toContain("Create your first entity");
  });

  it("the empty state steps aside while the creation form is open", () => {
    expect(renderToStaticMarkup(<RosterStatus mode="empty" showCreate onCreate={noop} />)).toBe("");
  });

  it("with one or more entities the empty state is gone", () => {
    expect(renderToStaticMarkup(<RosterStatus mode="list" showCreate={false} onCreate={noop} />)).toBe("");
    for (const mode of ["signin", "error"] as const) {
      expect(renderToStaticMarkup(<RosterStatus mode={mode} showCreate={false} onCreate={noop} />)).not.toContain("eix-empty");
    }
  });
});

describe("#new deep link", () => {
  it("recognises the creation fragment and nothing else", () => {
    expect(wantsCreateFlow("#new")).toBe(true);
    expect(wantsCreateFlow("#NEW")).toBe(true);
    expect(wantsCreateFlow("#/new")).toBe(true);
    for (const other of ["", "#", "#news", "#new-entity", "new", "#blueprint", null, undefined]) {
      expect(wantsCreateFlow(other as string)).toBe(false);
    }
  });

  it("a pending request opens the creation form on the first paint, focused on its name field", () => {
    const html = renderToStaticMarkup(
      <EntitiesIndex baseUrl="http://gw.test" token={null} onOpen={noop} createRequest={1} />,
    );
    expect(html).toContain('data-testid="create-entity"');
    expect(html).toContain("Create entity");
    expect(html).toContain('id="ce_name"');
  });

  it("no request, no form", () => {
    const html = renderToStaticMarkup(<EntitiesIndex baseUrl="http://gw.test" token={null} onOpen={noop} />);
    expect(html).not.toContain('data-testid="create-entity"');
  });
});

describe("roster mode and head actions", () => {
  it("zero entities is the empty mode; one or more is the list", () => {
    expect(rosterMode({ rowCount: 0, authNeeded: false, error: null })).toBe("empty");
    expect(rosterMode({ rowCount: 1, authNeeded: false, error: null })).toBe("list");
    expect(rosterMode({ rowCount: null, authNeeded: false, error: null })).toBe("loading");
    expect(rosterMode({ rowCount: null, authNeeded: false, error: "down" })).toBe("error");
    expect(rosterMode({ rowCount: 0, authNeeded: true, error: null })).toBe("signin");
  });

  it("with no entity there is nothing to watch or convene; the actions return with the first one", () => {
    const empty = rosterHeadActions("empty");
    expect(empty.watchAll).toBe(false);
    expect(empty.convene).toBe(false);
    expect(empty.newEntity).toBe(false); // the empty card carries the one create button
    expect(empty.blueprint).toBe(true);
    expect(empty.refresh).toBe(true);
    const list = rosterHeadActions("list");
    expect(list).toEqual({ watchAll: true, convene: true, blueprint: true, refresh: true, newEntity: true });
  });

  it("the loading screen shows neither the empty card nor the list actions", () => {
    const html = renderToStaticMarkup(
      <EntitiesIndex baseUrl="http://gw.test" token={null} onOpen={noop} onWatchAll={noop} onConvene={noop} onBlueprint={noop} />,
    );
    expect(html).not.toContain("eix-empty");
    expect(html).not.toContain("watch all");
    expect(html).not.toContain("convene a meet");
    expect(html).not.toContain("entity homes");
  });
});
