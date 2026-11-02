import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SideTabs } from "./drawer";

describe("optional focused conversation layout", () => {
  const tabs = [{ id: "chat", icon: "chat", title: "Chat", content: (visible: boolean) => <p>{visible ? "Visible conversation" : "Hidden conversation"}</p> }, { id: "book", icon: "book", title: "Book", content: <p>Book</p> }];
  it("preserves default width and supplies the actual mounted-panel visibility", () => {
    const html = renderToStaticMarkup(<SideTabs tabs={tabs} defaultTab="chat" />);
    expect(html).toContain('width:380px');
    expect(html).toContain("Visible conversation");
    expect(html).not.toContain("side_tabs_emphasized");
  });
  it("focuses Avatar only while the requested conversation panel is selected", () => {
    const focused = renderToStaticMarkup(<SideTabs tabs={tabs} defaultTab="chat" emphasizedTab="chat" />);
    expect(focused).toContain('width:100%');
    expect(focused).toContain("side_tabs_emphasized");
    const book = renderToStaticMarkup(<SideTabs tabs={tabs} defaultTab="book" emphasizedTab="chat" />);
    expect(book).toContain("Hidden conversation");
    expect(book).not.toContain("side_tabs_emphasized");
  });
  it("never expands an empty or collapsed panel when no optional focus was supplied", () => {
    const empty = renderToStaticMarkup(<SideTabs tabs={[]} />);
    expect(empty).not.toContain("side_tabs_emphasized");
    expect(empty).not.toContain("side_tabs_avatar");
  });
});
