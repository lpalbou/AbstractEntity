/**
 * Card → Likes / Dislikes / How he sees others (operator 2026-11-08): one
 * row per target — an icon and a kind tag, the target's NAME or TITLE
 * (never an id), the score aligned right, the quote below. A remembered
 * record takes its title from the card brief (memory's entity_card
 * `_standing_entry` carries `title`); a brief without one reads "untitled
 * memory" with a "title missing" tag, so the gap shows instead of a hash.
 * Scores and feelings are computed exactly as before. Rendered with
 * react-dom/server (no DOM in the tests).
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CardBody, feelingLabel } from "./identity_card";
import { foldEnvelopes } from "./stream_fold";
import { CUT_SUMMARY_LINE } from "./understanding";
import type { ReplayEnvelope } from "./stream_types";

describe("feelingLabel: the name or title, never an id", () => {
  it("a remembered record shows the brief's title and its kind in words", () => {
    expect(feelingLabel("ex:episode-15e2", "exchange: what did you find in the harbour archive?")).toEqual({
      icon: "💬",
      kind: "exchange",
      name: "what did you find in the harbour archive?",
      titleMissing: false,
    });
    expect(feelingLabel("ex:world_model-9a1", "The harbour tide tables")).toMatchObject({ kind: "world model", name: "The harbour tide tables", icon: "🌍" });
    expect(feelingLabel("ex:diary-3261", "Diary entry — the archive mirrors held")).toMatchObject({ kind: "diary entry", icon: "📔", name: "Diary entry — the archive mirrors held", titleMissing: false });
  });

  it("a record whose brief has no title reads 'untitled memory' and says the title is missing", () => {
    for (const title of [undefined, "", "   ", null, "ex:episode-77ab"]) {
      const label = feelingLabel("ex:episode-77ab", title);
      expect(label).toEqual({ icon: "💬", kind: "exchange", name: "untitled memory", titleMissing: true });
    }
    // A bare record id (a digest-assertion id) is a record too, never shown as the hash.
    expect(feelingLabel("e8289ae0eab2483682746ae3034505ea")).toEqual({ icon: "◆", kind: "memory", name: "untitled memory", titleMissing: true });
    expect(feelingLabel("e8289ae0eab2483682746ae3034505ea", "the archive visit")).toMatchObject({ name: "the archive visit", titleMissing: false });
  });

  it("a person, an entity or a tool is named by its target", () => {
    expect(feelingLabel("person:admin")).toEqual({ icon: "👤", kind: "person", name: "admin", titleMissing: false });
    expect(feelingLabel("entity:nerin")).toMatchObject({ kind: "entity", name: "nerin", icon: "🫂" });
    expect(feelingLabel("tool:web_search")).toMatchObject({ kind: "tool", name: "web search", icon: "🔧" });
  });
});

let seq = 0;
function valence(target: string, sign: number, magnitude: number, reason: string, kind = "appraisal"): ReplayEnvelope {
  seq += 1;
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq,
    family: "valence",
    observed_at: `2026-11-0${(seq % 8) + 1}T10:00:00+00:00`,
    scope: "life",
    owner_id: "entity:castor",
    trace_id: null,
    turn_id: null,
    run_id: null,
    payload: { target_id: target, kind, sign, magnitude, reason, event_id: `v-${seq}` },
  } as unknown as ReplayEnvelope;
}

const CARD = {
  name: "Castor",
  entity_id: "entity:castor",
  likes_dislikes: {
    likes: [
      { target: "person:admin", net: 11, positive: 12, negative: 1, bonded: true },
      { target: "ex:episode-15e2", title: "exchange: what did you find in the harbour archive?", net: 7, positive: 7, negative: 0 },
      { target: "ex:episode-77ab", net: 3, positive: 3, negative: 0 },
    ],
    dislikes: [{ target: "tool:web_search", net: -2, positive: 2, negative: 4, scarred: true }],
  },
};

const sectionOf = (html: string, title: string) => {
  const start = html.indexOf(`<h4>${title}</h4>`);
  expect(start, `section ${title}`).toBeGreaterThanOrEqual(0);
  const end = html.indexOf("<h4>", start + 4);
  return html.slice(start, end < 0 ? undefined : end);
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("CardBody feeling rows", () => {
  const fold = foldEnvelopes([
    valence("ex:episode-15e2", 1, 7, "he stayed to read what I found"),
    valence("person:admin", 1, 12, "he gave me my own time"),
    valence("tool:web_search", -1, 4, "three days of dead links in a row"),
    valence("person:grace", -1, 3, "she rewrote my notes without asking"),
    valence("person:grace", 1, 2, "she apologised, and meant it"),
  ]);
  const html = renderToStaticMarkup(<CardBody card={CARD as never} fold={fold} baseUrl="http://gw" entity="castor" />);

  it("Likes: one row per target, kind tag + name, score at the end, the quote below; no id anywhere", () => {
    const likes = sectionOf(html, "Likes");
    expect(likes.match(/class="ic_like_row"/g)).toHaveLength(3);
    const t = text(likes);
    expect(t).toContain("person admin bond +12 −1");
    expect(t).toContain("exchange what did you find in the harbour archive? +7");
    expect(t).toContain("“he stayed to read what I found”");
    expect(t).toContain("exchange untitled memory title missing +3");
    expect(likes).not.toMatch(/ex:|15e2|77ab/);
    // The score is the row's last cell, the quote spans under the name.
    expect(likes).toMatch(/<span class="ic_like_score"><span class="ic_feeling_net ei_feeling_pos">\+12<\/span><span class="ic_feeling_net ei_feeling_neg">−1<\/span><\/span><div class="ic_like_quote">/);
    expect(likes).toContain('class="af-chip af-chip--muted af-chip--sm ic_like_kind"');
    expect(likes).toContain("af-chip--warning af-chip--sm ic_like_missing");
  });

  it("Dislikes keep their channels and marks", () => {
    const t = text(sectionOf(html, "Dislikes"));
    expect(t).toContain("tool web search scar −4 +2");
    expect(t).toContain("“three days of dead links in a row”");
  });

  it("How he sees others: people by name, net and both channels, the latest reason", () => {
    const others = sectionOf(html, "How he sees others");
    expect(others.match(/class="ic_like_row"/g)).toHaveLength(2);
    const t = text(others);
    expect(t).toContain("person grace -1 (+2 / −3)");
    expect(t).toContain("“she apologised, and meant it”");
    expect(t).toContain("person admin +12 (+12 / −0)");
  });
});

describe("CardBody identity statements cut when saved (AbstractGateway 32c9cc05 `cut` on GET /card identity)", () => {
  const CUT_WORDS = "I keep what I learn about the harb [#TRUNCATION: 140 kept]\nand I say so when I do not kn [#TRUNCATION: 140 kept]";
  const card = {
    name: "Castor",
    entity_id: "entity:castor",
    identity: {
      values: [
        { title: "honesty", statement: "I tell the truth, even when it costs me.", value_class: "core", cut: false },
        { title: "curiosity", statement: CUT_WORDS, cut: true },
      ],
      purposes: [
        { title: "keep the harbour archive", statement: CUT_WORDS, cut: true },
        { title: "help Laurent", statement: "I help Laurent think out loud." },
      ],
    },
  };
  const html = renderToStaticMarkup(<CardBody card={card as never} fold={null} baseUrl="http://gw" entity="castor" />);

  it("a cut statement shows its title and the hover card's line, never the cut text's marker lines", () => {
    expect(html).not.toContain("#TRUNCATION");
    expect(html).not.toContain("I keep what I learn");
    const values = text(sectionOf(html, "Values"));
    expect(values).toContain(`curiosity ${CUT_SUMMARY_LINE}`);
    const purposes = text(sectionOf(html, "Purposes"));
    expect(purposes).toContain(`keep the harbour archive ${CUT_SUMMARY_LINE}`);
    expect(html.match(/data-cut="true"/g)).toHaveLength(2);
  });

  it("a whole statement (cut false, or no flag from an older gateway) keeps its words as today", () => {
    expect(text(sectionOf(html, "Values"))).toContain("I tell the truth, even when it costs me.");
    expect(text(sectionOf(html, "Purposes"))).toContain("I help Laurent think out loud.");
    // A whole row's look is unchanged: no title is added to it.
    expect(text(sectionOf(html, "Purposes"))).not.toContain("help Laurent I help");
  });

  it("read from the served flag, never parsed from the words: the same cut words without the flag render as words", () => {
    const unflagged = renderToStaticMarkup(<CardBody card={{ ...card, identity: { purposes: [{ title: "x", statement: "plain words" }], values: [{ title: "y", statement: CUT_WORDS }] } } as never} fold={null} baseUrl="http://gw" entity="castor" />);
    expect(unflagged).toContain("#TRUNCATION");
    expect(unflagged).not.toContain(CUT_SUMMARY_LINE);
  });
});
