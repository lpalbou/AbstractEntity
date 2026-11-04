/**
 * The digital identity in the Entity app (framework ADR 0052, backlog 1119): Settings → identity
 * (look, voice, one Save, the gateway's refusals as they are, history), Settings → track record,
 * and the visit drawn by the identity it names. The package ships no DOM for tests: the rules are
 * pinned through their pure helpers and the gateway clients through a stubbed fetch; the screens
 * are driven for real by scripts/identity.e2e.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { visitIdentityRef } from "./avatar_visit";
import { IdentityAvatar, identityAvatarStyle, lookOf } from "./identity_avatar";
import { byWhom, designOptions, formChanged, formOf, historyRevs, historyRows, noVoiceText, saveOf } from "./identity_settings";
import { IdentityRefusal, getEntityIdentity, identityRefusalOf, putEntityIdentity, startOfferedDownload, type IdentityRecord, type Reputation, type TrackRecord } from "./stream_source";
import { basisText, kindRows, nameOf, notCountedText, trustText } from "./track_record_panel";

const VOICE = { provider: "openai", model: "tts-1", voice: "alloy", source: "chosen" };
const rec = (rev: number, over: Partial<IdentityRecord> = {}): IdentityRecord => ({
  rev,
  avatar: { style: "watch-lotus", color: "#3366cc", source: "chosen", watch_code: "R" },
  voice: { ...VOICE },
  set_at: `2026-11-0${rev}T10:00:00+00:00`,
  set_by: "person:laurent",
  ...over,
});

// --------------------------------------------------------------- refusals

describe("a refused save shows the gateway's sentence as it is, with its download action", () => {
  const LADDER = "nope isn't an avatar design this gateway has. Designs: halo, watch-lotus.";
  const MISSING = "The voice model kokoro-big (330 MB) is not downloaded on this computer yet. Download it first (Models page, or: abstractgateway models download kokoro kokoro-big)";
  let calls: { url: string; init: RequestInit }[] = [];
  const answer = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response(JSON.stringify(body), { status })));
  beforeEach(() => {
    calls = [];
    (globalThis as { window?: unknown }).window = globalThis;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("the sentence is the body's detail, untouched", () => {
    const r = identityRefusalOf(400, JSON.stringify({ detail: LADDER }));
    expect(r).toBeInstanceOf(IdentityRefusal);
    expect(r.message).toBe(LADDER);
    expect(r.status).toBe(400);
    expect(r.download).toBeNull();
  });

  it("a 409 with the download action carries it (path, body, size)", () => {
    const body = { detail: MISSING, error: { reason_code: "model_not_downloaded", size_mb: 330, download: { method: "POST", path: "/api/gateway/models/download", body: { provider: "kokoro", artifact: "kokoro-big" } } } };
    const r = identityRefusalOf(409, JSON.stringify(body));
    expect(r.message).toBe(MISSING);
    expect(r.download).toEqual({ method: "POST", path: "/api/gateway/models/download", body: { provider: "kokoro", artifact: "kokoro-big" }, size_mb: 330 });
  });

  it("a body that is not JSON is its own text; an empty one names the status", () => {
    expect(identityRefusalOf(502, "Bad Gateway").message).toBe("Bad Gateway");
    expect(identityRefusalOf(500, "").message).toBe("HTTP 500");
  });

  it("PUT /identity sends the whole record once and rejects with the sentence (never retried)", async () => {
    answer(400, { detail: LADDER });
    const body = { avatar: { style: "nope", color: "#3366cc" }, voice: { provider: "openai", model: "tts-1", voice: "alloy" } };
    const err = await putEntityIdentity("http://gw.test", "castor", body, "tok").catch((e) => e);
    expect(err).toBeInstanceOf(IdentityRefusal);
    expect(err.message).toBe(LADDER);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://gw.test/api/gateway/entities/castor/identity");
    expect(calls[0].init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init.body))).toEqual(body);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("the page shows the refusal's own words (no prefix) and offers its download", () => {
    const src = fs.readFileSync(path.join(__dirname, "identity_settings.tsx"), "utf8");
    expect(src).toContain('if (e instanceof IdentityRefusal) setStatus({ text: e.message, tone: "error", download: e.download });');
    expect(src).toContain('data-testid="identity-download"');
  });

  it("Download posts the offered action to its path", async () => {
    answer(200, { ok: true, job: { id: "j1" } });
    await startOfferedDownload("http://gw.test", { method: "POST", path: "/api/gateway/models/download", body: { provider: "kokoro", artifact: "kokoro-big" } }, null);
    expect(calls[0].url).toBe("http://gw.test/api/gateway/models/download");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ provider: "kokoro", artifact: "kokoro-big" });
  });

  it("GET ?rev=N reads one revision", async () => {
    answer(200, { entity_id: "entity:castor", identity: rec(2), identity_ref: { of: "entity:castor", rev: 2 } });
    await getEntityIdentity("http://gw.test", "castor", 2);
    expect(calls[0].url).toBe("http://gw.test/api/gateway/entities/castor/identity?rev=2");
  });
});

// --------------------------------------------------------------- the form

describe("the form: one Save of the whole record", () => {
  it("fills from the record and saves design, colour and voice together", () => {
    const form = formOf(rec(3));
    expect(form).toEqual({ style: "watch-lotus", color: "#3366cc", voice: { provider: "openai", model: "tts-1", voice: "alloy" } });
    expect(formChanged(form, rec(3))).toBe(false);
    const next = { ...form, style: "watch-halo", color: "#AA00FF" };
    expect(formChanged(next, rec(3))).toBe(true);
    expect(saveOf(next, rec(3))).toEqual({ body: { avatar: { style: "watch-halo", color: "#aa00ff" }, voice: { provider: "openai", model: "tts-1", voice: "alloy" } } });
  });

  it("keeps the record's speed and quality while the voice stays the same, drops them for another voice", () => {
    const r = rec(2, { voice: { ...VOICE, speed: 1.25, quality_preset: "high" } });
    expect(saveOf(formOf(r), r)).toEqual({ body: { avatar: { style: "watch-lotus", color: "#3366cc" }, voice: { provider: "openai", model: "tts-1", voice: "alloy", speed: 1.25, quality_preset: "high" } } });
    const other = { ...formOf(r), voice: { provider: "openai", model: "tts-1", voice: "nova" } };
    expect(saveOf(other, r)).toEqual({ body: { avatar: { style: "watch-lotus", color: "#3366cc" }, voice: { provider: "openai", model: "tts-1", voice: "nova" } } });
  });

  it("a voice that came without its speech model asks for one; no voice saves nothing", () => {
    const form = { ...formOf(rec(1)), voice: { provider: "qwen3-tts", model: "", voice: "v-1" } };
    expect(saveOf(form, rec(1))).toEqual({ needsModel: "qwen3-tts", body: { avatar: { style: "watch-lotus", color: "#3366cc" }, voice: { provider: "qwen3-tts", model: "", voice: "v-1" } } });
    expect(saveOf({ ...form, voice: {} }, rec(1))).toBeNull();
    expect(saveOf({ ...form, voice: { provider: "openai" } }, rec(1))).toBeNull();
  });

  it("only designs the Watch can draw are offered; the current one stays listed", () => {
    const designs = [
      { id: "watch-halo", name: "Watch Halo", description: "", watchCode: "A", family: "orbs", gaze: "none" as const },
      { id: "iphone-weave", name: "Woven orb", description: "", watchCode: "", family: "forms", gaze: "none" as const },
    ];
    expect(designOptions(designs, "watch-halo")).toEqual([{ value: "watch-halo", label: "Watch Halo", group: "Orbs" }]);
    expect(designOptions(designs, "watch-new")[0]).toEqual({ value: "watch-new", label: "watch-new", group: "Current" });
  });
});

// --------------------------------------------------------------- no voice

describe("a record without a voice: the gateway's sentence, never a borrowed voice", () => {
  const SENTENCE = "Castor has no voice yet: choose one in its Identity settings or set the Gateway default voice";
  it("the sentence is the gateway's note, as it is", () => {
    expect(noVoiceText({ note: SENTENCE }, "Castor")).toBe(SENTENCE);
    expect(noVoiceText({}, "Castor")).toBe("The gateway did not say why Castor has no voice.");
  });
  it("the picker starts empty and Save waits for a chosen voice", () => {
    const r = rec(1, { voice: null, set_by: "default" });
    expect(formOf(r).voice).toEqual({});
    expect(saveOf(formOf(r), r)).toBeNull();
  });
  it("the page reads the note from GET /voice only for a record without a voice", () => {
    const src = fs.readFileSync(path.join(__dirname, "identity_settings.tsx"), "utf8");
    expect(src).toContain("if (answer.identity.voice === null) {");
    expect(src).toContain('data-testid="identity-no-voice"');
  });
});

// --------------------------------------------------------------- history

describe("history: every revision, newest first, with what changed", () => {
  it("reads rev N … 1", () => {
    expect(historyRevs(3)).toEqual([3, 2, 1]);
    expect(historyRevs(1)).toEqual([1]);
  });
  it("orders by revision (newest first) whatever order the answers came in", () => {
    const rows = historyRows([
      rec(1, { set_by: "default", avatar: { style: "watch-nebula", color: "#d06439", source: "default" }, voice: null }),
      rec(3, { voice: { ...VOICE, voice: "nova" } }),
      rec(2),
    ]);
    expect(rows.map((r) => r.rev)).toEqual([3, 2, 1]);
    expect(rows.map((r) => r.change)).toEqual(["New voice", "New look and voice", "Default look, no voice"]);
    expect(rows.map((r) => r.by)).toEqual(["laurent", "laurent", "the gateway"]);
  });
  it("names who set it in plain words", () => {
    expect(byWhom("default")).toBe("the gateway");
    expect(byWhom("operator")).toBe("the operator");
    expect(byWhom("person:laurent")).toBe("laurent");
  });
});

// --------------------------------------------------------------- track record

const REPUTATION: Reputation = {
  subject: "entity:castor",
  computed_at: "2026-11-04T10:00:00+00:00",
  overall: { trust: 0.75, support: 2, successes: 2, failures: 0, last_outcome_at: "2026-11-04T09:00:00+00:00" },
  by_task_kind: {
    "visit/entity-visit@1": { trust: 0.75, support: 2, successes: 2, failures: 0, last_outcome_at: "2026-11-04T09:00:00+00:00" },
    "visit/other-flow": { trust: 0.5, support: 0, successes: 0, failures: 0, last_outcome_at: null },
    "work/task_inbox": { trust: 0.5, support: 0, successes: 0, failures: 0, last_outcome_at: null },
  },
  basis: "completion-rate only",
};

describe("track record: trust always with its support, in plain words", () => {
  it("no outcome reads No experience yet, never trusted", () => {
    expect(trustText({ trust: 0.5, support: 0, successes: 0, failures: 0, last_outcome_at: null })).toBe("No experience yet");
    expect(trustText({ trust: 2 / 3, support: 1, successes: 1, failures: 0, last_outcome_at: null })).toBe("Trust 0.67 over 1 outcome");
    expect(trustText({ trust: 0.75, support: 12, successes: 9, failures: 3, last_outcome_at: null })).toBe("Trust 0.75 over 12 outcomes");
  });
  it("completion-rate only is said plainly; never the word basis", () => {
    expect(basisText("completion-rate only")).toBe("A success here only means the task finished: nobody has judged the quality of the work yet.");
    const src = fs.readFileSync(path.join(__dirname, "track_record_panel.tsx"), "utf8").split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/**"));
    const visible = src.join("\n").match(/>[^<>{}]*</g)?.join(" ") || "";
    for (const jargon of ["ledger", "basis", "run id", "run_id"]) expect(visible.toLowerCase()).not.toContain(jargon);
  });
  it("task kinds read as words; the workflow shows only to tell two apart", () => {
    const record = { by_task_kind: { "visit/entity-visit@1": { runs: 3 } } } as unknown as TrackRecord;
    const rows = kindRows(REPUTATION, record);
    expect(rows.map((r) => [r.label, r.detail, r.runs])).toEqual([
      ["Visits", "entity-visit@1", 3],
      ["Tasks left for it", null, 0],
      ["Visits", "other-flow", 0],
    ]);
  });
  it("acquaintances read by name; the uncounted say why in plain words", () => {
    expect(nameOf("entity:pollux")).toBe("pollux");
    expect(nameOf("person:laurent")).toBe("laurent");
    expect(notCountedText("participant of another kind (not an entity or a human)", 2)).toBe("Not counted: 2 meetings with someone who is neither an entity nor a person (an agent in a shared room).");
    expect(notCountedText("something new", 1)).toBe("Not counted: 1 meeting with something new.");
  });
});

// --------------------------------------------------------------- the visit

describe("the visit is drawn by the identity it names", () => {
  const opened = { of: "entity:castor", rev: 2 };
  it("the newest public update's reference wins, else the one the visit opened with, else none", () => {
    const state = { run_id: "r", public_updates: [{ id: "a", identity_ref: { of: "entity:castor", rev: 2 } }, { id: "b", identity_ref: { of: "entity:castor", rev: 3 } }] };
    expect(visitIdentityRef(state, opened)).toEqual({ of: "entity:castor", rev: 3 });
    expect(visitIdentityRef({ run_id: "r", public_updates: [{ id: "a" }] }, opened)).toEqual(opened);
    expect(visitIdentityRef({ run_id: "r", public_updates: [] }, null)).toBeNull();
    expect(visitIdentityRef(null, null)).toBeNull();
  });
  it("a record gives its design and colour; none gives no look", () => {
    expect(lookOf(rec(1))).toEqual({ style: "watch-lotus", color: "#3366cc" });
    expect(lookOf(null)).toBeNull();
    expect(lookOf({ avatar: { style: "", color: "#3366cc" } })).toBeNull();
  });
  it("the avatar carries the colour to the kit's palette token and draws the design", () => {
    expect(identityAvatarStyle("#3366cc")).toEqual({ "--warning": "#3366cc" });
    const html = renderToStaticMarkup(<IdentityAvatar look={{ style: "watch-lotus", color: "#3366cc" }} size={64} label="Castor" />);
    expect(html).toContain('data-style="watch-lotus"');
    expect(html).toContain("--warning:#3366cc");
    expect(html).toContain('aria-label="Castor"');
  });
  it("the visit view passes the look; the drawer resolves the visit's reference", () => {
    const view = fs.readFileSync(path.join(__dirname, "avatar_visit_view.tsx"), "utf8");
    expect(view).toContain("props.look ? <IdentityAvatar look={props.look}");
    const drawer = fs.readFileSync(path.join(__dirname, "chat_drawer.tsx"), "utf8");
    expect(drawer).toContain("useIdentityLook(baseUrl, entity, avatarMode ? visitRef : null, reportAvatarError)");
    expect(drawer).toContain("setOpenedRef(r.identity_ref ? { runId: r.run_id, ref: r.identity_ref } : null);");
  });
});
