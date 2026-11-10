/**
 * His self-knowledge brief on the identity card (operator test round 2, 2026-11-10; root backlog 1197):
 * the route's answer read exactly (AbstractGateway c6ca5128: {text, written_at, version, tokens};
 * 404 no_brief before his first brief; 500 with the runtime's reason), FastAPI's own 404 read as "not
 * served" with its one sentence, the section under the card's header with its heading, "written
 * <how long ago> · version N" and his words. Rendered with react-dom/server (no DOM in the tests);
 * the reads run against a stubbed fetch.
 */
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CardBody } from "./identity_card";
import {
  SELF_BRIEF_HEADING,
  SELF_BRIEF_NONE,
  SELF_BRIEF_UNSERVED,
  SelfBriefView,
  readSelfBrief,
  selfBriefOf,
  selfBriefState,
  agoWords,
  writtenAt,
  writtenLine,
  type SelfBrief,
} from "./self_brief";

/** A castor-like brief in the runtime's shape (identity/self_brief.py: topics, one line each, trails). */
const TEXT =
  "Harbour archives: how the tide tables were kept, and who kept them.\n" +
  "Durable visits: a visit survives a restart because the room is a run.\n" +
  "Trails of thought: The tide tables → The archive mirrors (4 times).";
const SERVED = { text: `${TEXT}\n`, written_at: "2026-11-10T03:12:40+00:00", version: 107166, tokens: 245 };
const NOW = Date.parse("2026-11-10T05:20:00+00:00");
/** The gateway's 404 before his first brief (routes/entities.py entity_self_brief). */
const NO_BRIEF = { detail: { code: "no_brief", message: "castor has no brief yet: it is written at the end of a sleep." } };

const answer = (status: number, body: unknown) =>
  vi.fn(async (_url: string, _init?: RequestInit) => new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => vi.unstubAllGlobals());

describe("the answer, read exactly", () => {
  it("his brief: the text trimmed, the other fields as served", () => {
    expect(selfBriefOf(SERVED)).toEqual({ text: TEXT, written_at: SERVED.written_at, version: 107166, tokens: 245 });
    expect(selfBriefOf({ ...SERVED, version: null }).version).toBeNull();
  });
  it("a missing or mistyped field is an error naming it, nothing filled in", () => {
    const cases: Array<[unknown, RegExp]> = [
      [null, /not an object/],
      [[], /not an object/],
      ["brief", /not an object/],
      [{ ...SERVED, text: undefined }, /no text/],
      [{ ...SERVED, text: "   " }, /no text/],
      [{ ...SERVED, written_at: undefined }, /written_at/],
      [{ ...SERVED, written_at: "last night" }, /written_at/],
      [{ ...SERVED, version: undefined }, /version/],
      [{ ...SERVED, version: "107166" }, /version/],
      [{ ...SERVED, tokens: undefined }, /tokens/],
      [{ ...SERVED, tokens: 6.5 }, /tokens/],
    ];
    for (const [raw, error] of cases) expect(() => selfBriefOf(raw), JSON.stringify(raw)).toThrow(error);
  });
});

describe("one read of GET /api/gateway/entities/{name}/self-brief", () => {
  it("asks the entity's route with the read headers", async () => {
    const f = answer(200, SERVED);
    await readSelfBrief("http://gw.test", "castor", f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe("http://gw.test/api/gateway/entities/castor/self-brief");
    expect((f.mock.calls[0][1]?.headers as Record<string, string>).Accept).toBe("application/json");
  });
  it("a gateway without the route (FastAPI's own 404) does not serve it", async () => {
    expect(await readSelfBrief("http://gw.test", "castor", answer(404, { detail: "Not Found" }) as unknown as typeof fetch)).toEqual({ served: false });
  });
  it("404 no_brief = served, none written yet; 200 = his brief", async () => {
    expect(await readSelfBrief("http://gw.test", "castor", answer(404, NO_BRIEF) as unknown as typeof fetch)).toEqual({ served: true, brief: null });
    expect(await readSelfBrief("http://gw.test", "castor", answer(200, SERVED) as unknown as typeof fetch)).toEqual({ served: true, brief: selfBriefOf(SERVED) });
  });
  it("any other refusal rejects with its served message (never read as no brief or not served)", async () => {
    const reject = (status: number, body: unknown) => readSelfBrief("http://gw.test", "castor", answer(status, body) as unknown as typeof fetch);
    // The runtime's reason for a file that is not a brief.
    await expect(reject(500, { detail: "/homes/castor/self_brief.md has no header (a '---' block naming version_seq, written_at, tokens)" })).rejects.toThrow(/self_brief\.md has no header/);
    // An unknown entity's 404 is not "not served".
    await expect(reject(404, { detail: "unknown entity: nobody" })).rejects.toThrow("unknown entity: nobody");
    await expect(reject(404, { detail: { code: "other", message: "something else" } })).rejects.toThrow("something else");
    await expect(reject(401, {})).rejects.toThrow("HTTP 401");
    await expect(reject(502, undefined)).rejects.toThrow("HTTP 502");
    await expect(reject(200, { ...SERVED, written_at: 3 })).rejects.toThrow(/written_at/);
  });
  it("the read's outcome is the section's state", () => {
    expect(selfBriefState({ served: false })).toEqual({ phase: "unserved" });
    expect(selfBriefState({ served: true, brief: null })).toEqual({ phase: "none" });
    const brief: SelfBrief = selfBriefOf(SERVED);
    expect(selfBriefState({ served: true, brief })).toEqual({ phase: "ready", brief });
  });
});

describe("when it was written", () => {
  const at = (iso: string) => agoWords(iso, NOW, "UTC");
  it("how long ago, in words", () => {
    expect(at("2026-11-10T05:19:30+00:00")).toBe("just now");
    expect(at("2026-11-10T05:20:30+00:00")).toBe("just now"); // a clock a little ahead
    expect(at("2026-11-10T05:08:00+00:00")).toBe("12 min ago");
    expect(at("2026-11-10T04:20:00+00:00")).toBe("1 h ago");
    expect(at("2026-11-10T03:12:40+00:00")).toBe("2 h ago");
    expect(at("2026-11-09T05:00:00+00:00")).toBe("1 day ago");
    expect(at("2026-11-07T05:00:00+00:00")).toBe("3 days ago");
    expect(at("2026-11-01T05:00:00+00:00")).toBe("on Nov 1");
  });
  it("the line: written … · version N (no version: written …)", () => {
    const brief = selfBriefOf(SERVED);
    expect(writtenLine(brief, NOW, "UTC")).toBe("written 2 h ago · version 107166");
    expect(writtenLine({ ...brief, version: null }, NOW, "UTC")).toBe("written 2 h ago");
  });
  it("the exact time behind it, 24-hour, in the given zone", () => {
    expect(writtenAt("2026-11-10T03:12:40+00:00", "UTC")).toBe("Nov 10, 2026, 03:12");
    expect(writtenAt("2026-11-10T00:05:00+00:00", "Europe/Paris")).toBe("Nov 10, 2026, 01:05");
  });
});

describe("the section", () => {
  const html = (state: Parameters<typeof SelfBriefView>[0]["state"]) => renderToStaticMarkup(<SelfBriefView state={state} now={NOW} timeZone="UTC" />);
  it("is headed 'What he knows about, at a glance' in every state", () => {
    expect(SELF_BRIEF_HEADING).toBe("What he knows about, at a glance");
    for (const state of [{ phase: "loading" }, { phase: "unserved" }, { phase: "none" }, { phase: "error", message: "HTTP 500" }, { phase: "ready", brief: selfBriefOf(SERVED) as SelfBrief }] as const) {
      expect(html(state), state.phase).toContain(`<h4>${SELF_BRIEF_HEADING}</h4>`);
      expect(html(state), state.phase).toContain(`data-phase="${state.phase}"`);
    }
  });
  it("his brief: written … · version N, then his words line by line", () => {
    const out = html({ phase: "ready", brief: selfBriefOf(SERVED) as SelfBrief });
    expect(out).toContain('<p class="ic_brief_when" title="Nov 10, 2026, 03:12">written 2 h ago · version 107166</p>');
    expect(out).toContain("Harbour archives: how the tide tables were kept, and who kept them.<br/>Durable visits:");
    expect(out).toContain("Trails of thought: The tide tables → The archive mirrors (4 times).");
    expect(out).not.toContain(SELF_BRIEF_UNSERVED);
    expect(out).not.toContain(SELF_BRIEF_NONE);
  });
  it("not served: the one sentence, no date, no words", () => {
    const out = html({ phase: "unserved" });
    expect(SELF_BRIEF_UNSERVED).toBe("This gateway does not serve his brief yet.");
    expect(out).toContain(SELF_BRIEF_UNSERVED);
    expect(out).not.toContain("ic_brief_when");
  });
  it("none yet (no_brief): his brief forms at his next sleep", () => {
    expect(SELF_BRIEF_NONE).toBe("His brief forms at his next sleep.");
    const out = html({ phase: "none" });
    expect(out).toContain(SELF_BRIEF_NONE);
    expect(out).not.toContain(SELF_BRIEF_UNSERVED);
  });
  it("a failed read says the served message, one full stop", () => {
    expect(html({ phase: "error", message: "HTTP 500" })).toContain("Could not read his brief: HTTP 500.");
    expect(html({ phase: "error", message: "the file has no header." })).toContain("Could not read his brief: the file has no header.<");
  });
});

describe("on the identity card, right under its header", () => {
  const CARD = { name: "castor", identity: { values: [{ name: "care", statement: "I care for the archive." }] } };
  it("sits between the header row and his values", () => {
    const out = renderToStaticMarkup(
      <CardBody card={CARD as never} fold={null} baseUrl="http://gw" entity="castor" brief={<SelfBriefView state={{ phase: "unserved" }} />} />,
    );
    const header = out.indexOf('class="ic_header_row"');
    const brief = out.indexOf('data-testid="self-brief"');
    const values = out.indexOf("<h4>Values</h4>");
    expect(header).toBeGreaterThan(-1);
    expect(brief).toBeGreaterThan(header);
    expect(values).toBeGreaterThan(brief);
  });
  it("the card passes its own section (its read follows the card's revision and visibility)", () => {
    const src = fs.readFileSync(path.join(__dirname, "identity_card.tsx"), "utf8");
    expect(src).toContain("brief={<SelfBriefSection baseUrl={baseUrl} entity={entity} revision={revision} shown={shown} />}");
  });
  it("the section reads on screen only, once per revision, and keeps a shown brief over a failed refresh", () => {
    const src = fs.readFileSync(path.join(__dirname, "self_brief.tsx"), "utf8");
    expect(src).toContain("if (!shown) return;");
    expect(src).toContain("readRef.current.key === key && readRef.current.revision === revision) return;");
    expect(src).toContain('setState((prev) => (prev.phase === "ready" ? prev : { phase: "error"');
  });
});
