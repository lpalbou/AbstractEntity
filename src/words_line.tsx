/**
 * Every text the app shows goes through the shared Markdown renderer
 * (operator ruling 2026-11-07: "every text rendered on the abstractentity
 * app must use the shared markdown renderer component in abstractuic").
 * The renderer is panel-chat's `Markdown`, reached only through `Words`
 * (verbatim_view.tsx), so no image in any text ever loads.
 *
 * The renderer has no inline mode: it always draws blocks (a paragraph, a
 * list, a heading). Short texts inside a row, a chip or a sentence keep
 * their container's look through CSS only (words_line.css): `inline`
 * flows the words in the surrounding line, the default keeps them a block
 * with the paragraph spacing removed. Nothing is stripped or cut: the
 * renderer sees the whole text.
 */

import React from "react";

import { Words } from "./verbatim_view";
import "./words_line.css";

/** The same image rule as `Words` for the kit components that draw Markdown themselves, from the leaf
 * module (no_image.ts), never through verbatim_view: this file is in an import cycle with it and
 * builds nothing from it when it loads (`Words` is only used at render time). */
export { NO_IMAGE_PROPS } from "./no_image";

/** A short text through the shared renderer, in its container's type,
 * colour and weight. Memoised: a live list re-renders its rows on every
 * landing, and an unchanged text need not be parsed again. */
export const WordsLine = React.memo(function WordsLine({ text, inline = false, className = "" }: { text: string; inline?: boolean; className?: string }): React.ReactElement {
  return <Words text={text} className={`${inline ? "wl_inline" : "wl_line"}${className ? ` ${className}` : ""}`} />;
});

/** A click that landed on a link inside a clickable row, card or button:
 * the link opens (a new tab) and the row's own action does not run — a
 * Book entry's click is a recorded read, a link in its title must not be. */
export function fromLink(e: { target: EventTarget | null }): boolean {
  const t = e.target as { closest?: (selector: string) => unknown } | null;
  return Boolean(t && typeof t.closest === "function" && t.closest("a[href]"));
}
