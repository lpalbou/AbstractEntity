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
import { VOICE_SAMPLE_TEXT, entityIdentityClient, noVoiceText } from "./identity_settings";
import { IdentityRefusal, getEntityIdentity, identityRefusalOf, putEntityIdentity, startOfferedDownload, type IdentityRecord, type Reputation, type TrackRecord } from "./stream_source";
import { basisText, kindRows, nameOf, notCountedText, trustGloss, trustText } from "./track_record_panel";

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

  it("the panel's save rejects with the refusal itself: its own words and its download (the kit shows both)", async () => {
    const body = { detail: MISSING, error: { reason_code: "model_not_downloaded", size_mb: 330, download: { method: "POST", path: "/api/gateway/models/download", body: { provider: "kokoro", artifact: "kokoro-big" } } } };
    answer(409, body);
    const client = entityIdentityClient("http://gw.test", "castor", "castor", "tok");
    const err = await client.save({ avatar: { style: "watch-halo", color: "#3366cc" }, voice: { provider: "kokoro", model: "kokoro-big", voice: "af" } }).catch((e) => e);
    expect(err).toBeInstanceOf(IdentityRefusal);
    expect(err.message).toBe(MISSING);
    expect(err.download).toEqual({ method: "POST", path: "/api/gateway/models/download", body: { provider: "kokoro", artifact: "kokoro-big" }, size_mb: 330 });
    expect(calls).toHaveLength(1);
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

// --------------------------------------------------------------- the kit panel's gateway

describe("Settings → identity is the kit's IdentityPanel, wired to this gateway", () => {
  let calls: { url: string; init?: RequestInit }[] = [];
  beforeEach(() => {
    calls = [];
    (globalThis as { window?: unknown }).window = globalThis;
  });
  afterEach(() => vi.unstubAllGlobals());
  const route = (answers: Record<string, unknown>) =>
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const key = Object.keys(answers).find((k) => url.includes(k));
      return new Response(key ? (typeof answers[key] === "string" ? (answers[key] as string) : JSON.stringify(answers[key])) : "{}", { status: 200 });
    });

  it("the page mounts the kit panel with the entity's name, its client and who may change it", () => {
    const src = fs.readFileSync(path.join(__dirname, "identity_settings.tsx"), "utf8");
    expect(src).toContain("<IdentityPanel key={`${baseUrl}|${entity}`} name={entityName} client={client} refusal={refusal} />");
    expect(src).not.toContain("<VoiceSettings");
  });

  it("read: the current record and revision N (GET /identity[?rev=N] → its identity)", async () => {
    route({ "/identity": { entity_id: "entity:castor", identity: rec(2), identity_ref: { of: "entity:castor", rev: 2 } } });
    const client = entityIdentityClient("http://gw.test", "castor", "Castor", null);
    expect(await client.read()).toEqual(rec(2));
    await client.read(1);
    expect(calls.map((c) => c.url)).toEqual(["http://gw.test/api/gateway/entities/castor/identity", "http://gw.test/api/gateway/entities/castor/identity?rev=1"]);
  });

  it("save: one PUT of the panel's body, the new record back", async () => {
    route({ "/identity": { entity_id: "entity:castor", identity: rec(4), identity_ref: { of: "entity:castor", rev: 4 } } });
    const body = { avatar: { style: "watch-halo", color: "#aa33cc" }, voice: { provider: "openai", model: "tts-1", voice: "nova" } };
    const saved = await entityIdentityClient("http://gw.test", "castor", "Castor", "tok").save(body);
    expect(saved.rev).toBe(4);
    expect(calls).toHaveLength(1);
    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(body);
  });

  it("a record without a voice: the gateway's note from GET /voice, as it is", async () => {
    const SENTENCE = "Castor has no voice yet: choose one in its Identity settings or set the Gateway default voice";
    expect(noVoiceText({ note: SENTENCE }, "Castor")).toBe(SENTENCE);
    expect(noVoiceText({}, "Castor")).toBe("The gateway did not say why Castor has no voice.");
    route({ "/castor/voice": { provider: null, model: null, voice: null, source: "identity", note: SENTENCE } });
    expect(await entityIdentityClient("http://gw.test", "castor", "Castor", null).noVoiceNote!()).toBe(SENTENCE);
    expect(calls[0].url).toBe("http://gw.test/api/gateway/entities/castor/voice");
  });

  it("the voices: the gateway's catalog for an engine and model", async () => {
    route({ "/voice/voices": { tts_providers: ["openai"] } });
    await entityIdentityClient("http://gw.test", "castor", "Castor", null).voiceCatalog("openai", "tts-1");
    expect(calls[0].url).toContain("/api/gateway/voice/voices");
    expect(calls[0].url).toContain("provider=openai");
    expect(calls[0].url).toContain("model=tts-1");
  });

  it("a sample: the entity's own lane with the chosen voice, the first segment, nothing saved", async () => {
    const wav = new Uint8Array(48);
    wav.set([82, 73, 70, 70], 0);
    wav.set([87, 65, 86, 69], 8);
    const seg = JSON.stringify({ type: "segment", index: 0, audio_b64: Buffer.from(wav).toString("base64") });
    route({ "/voice/tts/stream": [JSON.stringify({ type: "start" }), seg, JSON.stringify({ type: "done" })].join("\n") + "\n" });
    const bytes = await entityIdentityClient("http://gw.test", "castor", "Castor", "tok").previewVoice!({ provider: "qwen3-tts", model: "", voice: "vivian" });
    expect(bytes.byteLength).toBe(48);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://gw.test/api/gateway/entities/castor/voice/tts/stream");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ text: VOICE_SAMPLE_TEXT, format: "wav", provider: "qwen3-tts", voice: "vivian" });
  });

  it("Download: the action the refusal offered, posted to its path", async () => {
    route({ "/models/download": { ok: true } });
    await entityIdentityClient("http://gw.test", "castor", "Castor", null).startDownload!({ method: "POST", path: "/api/gateway/models/download", body: { provider: "kokoro", artifact: "kokoro-big" }, size_mb: 330 });
    expect(calls[0].url).toBe("http://gw.test/api/gateway/models/download");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ provider: "kokoro", artifact: "kokoro-big" });
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
  it("each trust number carries a plain gloss: how many finished, how the number moves", () => {
    expect(trustGloss({ trust: 0.75, support: 2, successes: 2, failures: 0, last_outcome_at: null })).toBe("2 of 2 finished; trust starts in the middle and moves with each outcome");
    expect(trustGloss({ trust: 0.75, support: 6, successes: 5, failures: 1, last_outcome_at: null })).toBe("5 of 6 finished; trust starts in the middle and moves with each outcome");
    expect(trustGloss({ trust: 0.5, support: 0, successes: 0, failures: 0, last_outcome_at: null })).toBe("");
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
