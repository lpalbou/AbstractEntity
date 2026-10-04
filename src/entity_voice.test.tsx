// Voice in a visit (R7.1): the kit hook's two gateway calls, wired to the
// entity-owned TTS lane and the gateway STT route, plus the composer
// controls' wording and the listener settings mount.
import React from "react";
import { readFileSync } from "fs";
import { resolve } from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ListenerVoiceSettings,
  TRANSCRIBE_TIMEOUT_MS,
  VisitVoiceButtons,
  entityTranscriber,
  entityTtsBody,
  entityTtsStream,
  entityVoiceSessionId,
  recordingFileName,
} from "./entity_voice";
import { refusalDetail, transcribeAudio } from "./stream_source";

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function wavBytes(): Uint8Array {
  const b = new Uint8Array(48);
  b.set([82, 73, 70, 70], 0); // RIFF
  b.set([87, 65, 86, 69], 8); // WAVE
  return b;
}
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

beforeEach(() => {
  calls = [];
  (globalThis as { window?: unknown }).window = globalThis;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("speaking: the entity's own voice through the streaming lane", () => {
  it("posts to /entities/{name}/voice/tts/stream with no voice field, and yields each WAV segment", async () => {
    const lines = [
      JSON.stringify({ type: "start", child_run_id: "c1" }),
      JSON.stringify({ type: "segment", index: 0, audio_b64: b64(wavBytes()) }),
      JSON.stringify({ type: "segment", index: 1, audio_b64: b64(wavBytes()) }),
      JSON.stringify({ type: "done", metrics: { ttfb_s: 0.4, device: "mps" } }),
    ].join("\n");
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(lines + "\n", { status: 200 });
    });
    const speak = entityTtsStream({
      baseUrl: "http://gw.test/",
      entity: "castor",
      token: "tok",
      // A listener TTS override must NOT replace his voice; latency rides along.
      prefs: () => ({ provider: "openai", model: "tts-1", voice: "alloy", quality_preset: "low" }),
    });
    const segments: ArrayBuffer[] = [];
    for await (const seg of speak("Hello there. How are you?")) segments.push(seg);
    expect(segments).toHaveLength(2);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://gw.test/api/gateway/entities/castor/voice/tts/stream");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toEqual({ text: "Hello there. How are you?", format: "wav", quality_preset: "low" });
    expect(body).not.toHaveProperty("provider");
    expect(body).not.toHaveProperty("voice");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("Stop aborts the HTTP request while synthesis is still running (the signal reaches fetch)", async () => {
    let seen: AbortSignal | undefined;
    // A gateway still synthesising: the request only ends when it is aborted.
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      seen = init.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        seen!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    });
    const ctrl = new AbortController();
    const speak = entityTtsStream({ baseUrl: "", entity: "castor", token: null, prefs: () => ({}) });
    const first = speak("Hi.", ctrl.signal).next();
    await new Promise((r) => setTimeout(r, 5));
    ctrl.abort();
    const outcome = await Promise.race([first.then(() => "ended", () => "aborted"), new Promise((r) => setTimeout(() => r("still running"), 200))]);
    expect(outcome).toBe("aborted");
    expect(seen?.aborted).toBe(true);
  });

  it("entityTtsBody keeps only the text, wav and the latency choice", () => {
    expect(entityTtsBody("x", { voice: "M3", profile: "p", provider: "supertonic" })).toEqual({ text: "x", format: "wav" });
  });
});

describe("dictation: upload into his voice scope, then the gateway STT route", () => {
  function stubGateway(transcript: Record<string, unknown> | { status: number; body: string }) {
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/attachments/upload"))
        return new Response(JSON.stringify({ ok: true, run_id: "session_memory_entity_voice_castor", attachment: { $artifact: "a1" } }), { status: 200 });
      if ("status" in transcript && typeof transcript.status === "number" && "body" in transcript)
        return new Response(String(transcript.body), { status: transcript.status });
      return new Response(JSON.stringify(transcript), { status: 200 });
    });
  }

  it("uploads to session entity_voice_<slug>, transcribes on the run the upload names, gateway default when no override", async () => {
    stubGateway({ text: "bonjour", provider: "faster-whisper", model: "large-v3", duration_ms: 900 });
    const tr = entityTranscriber({ baseUrl: "http://gw.test", entity: "castor", token: null, prefs: () => ({}) });
    const out = await tr(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), "audio/webm;codecs=opus");
    expect(out).toEqual({ text: "bonjour", provider: "faster-whisper", model: "large-v3" });
    expect(calls.map((c) => c.url)).toEqual([
      "http://gw.test/api/gateway/attachments/upload",
      "http://gw.test/api/gateway/runs/session_memory_entity_voice_castor/audio/transcribe",
    ]);
    const form = calls[0].init.body as FormData;
    expect(form.get("session_id")).toBe("entity_voice_castor");
    expect(entityVoiceSessionId("castor")).toBe("entity_voice_castor");
    expect((form.get("file") as File).name).toBe("recording.webm");
    const body = JSON.parse(String(calls[1].init.body));
    expect(body).toEqual({ audio_artifact: { $artifact: "a1" } }); // no provider/model: the gateway default route runs
  });

  it("a listener override and spoken language reach the transcription request", async () => {
    stubGateway({ text: "hi", provider: "openai-compatible", model: "whisper-1" });
    const tr = entityTranscriber({
      baseUrl: "",
      entity: "castor",
      token: null,
      prefs: () => ({ stt_provider: "openai-compatible", stt_model: "whisper-1", stt_language: "en" }),
    });
    await tr(new Blob([new Uint8Array([1])]), "audio/mp4");
    expect(JSON.parse(String(calls[1].init.body))).toMatchObject({ provider: "openai-compatible", model: "whisper-1", language: "en" });
    expect((calls[0].init.body as FormData).get("file") instanceof File).toBe(true);
    expect(recordingFileName("audio/mp4")).toBe("recording.m4a");
  });

  it("a refusal reaches the user as its detail sentence, a silent gateway as a timeout sentence", async () => {
    stubGateway({ status: 500, body: JSON.stringify({ detail: "STT failed: engine missing" }) });
    const tr = entityTranscriber({ baseUrl: "", entity: "castor", token: null, prefs: () => ({}) });
    await expect(tr(new Blob([new Uint8Array([1])]), "audio/webm")).rejects.toThrow("STT failed: engine missing");
    expect(refusalDetail("plain words")).toBe("plain words");

    vi.stubGlobal("fetch", (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        (init.signal as AbortSignal).addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }),
    );
    await expect(transcribeAudio("", "r1", {}, null, 20)).rejects.toThrow("the gateway did not answer within 0 s");
    expect(TRANSCRIBE_TIMEOUT_MS).toBe(180_000);
  });
});

describe("composer controls and settings", () => {
  const idle = {
    tts_supported: true,
    tts_playback: { key: "", status: "idle" as const },
    toggle_tts: async () => {},
    stop_tts: () => {},
    voice_ptt_supported: true,
    voice_ptt_recording: false,
    voice_ptt_busy: false,
    start_voice_ptt_recording: async () => {},
    stop_voice_ptt_recording: () => {},
    cancel_voice_ptt_recording: () => {},
    voice_ptt_since: 0,
  };
  beforeEach(() => {
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => undefined } });
  });

  it("transcribing shows the kit line with elapsed time and the route", () => {
    const html = renderToStaticMarkup(
      <VisitVoiceButtons voice={{ ...idle, voice_ptt_busy: true, voice_ptt_since: Date.now() - 12_400 }} route="faster-whisper / large-v3" />,
    );
    expect(html).toMatch(/Transcribing… 1[23] s · faster-whisper \/ large-v3/);
    expect(html).toContain('data-voice="dictate"');
  });

  it("recording says so; a playing reply offers Stop", () => {
    const rec = renderToStaticMarkup(<VisitVoiceButtons voice={{ ...idle, voice_ptt_recording: true, voice_ptt_since: Date.now() }} route="" />);
    expect(rec).toContain("Recording… 0 s");
    expect(rec).toContain('aria-pressed="true"');
    const playing = renderToStaticMarkup(<VisitVoiceButtons voice={{ ...idle, tts_playback: { key: "m1", status: "playing" } }} route="" />);
    expect(playing).toContain("Stop spoken reply");
    expect(renderToStaticMarkup(<VisitVoiceButtons voice={idle} route="" />)).not.toContain("Stop spoken reply");
  });

  it("without the microphone API the control says why", () => {
    vi.stubGlobal("navigator", {});
    const html = renderToStaticMarkup(<VisitVoiceButtons voice={idle} route="" />);
    expect(html).toContain("Dictation unavailable");
  });

  it("Settings → voice mounts the kit's AfVoiceSection; its text→speech row is not offered (he speaks with his own voice)", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    const html = renderToStaticMarkup(<ListenerVoiceSettings baseUrl="" />);
    expect(html).toContain('data-testid="listener-voice-settings"');
    expect(html).toContain("af-voice-section");
    expect(html).toContain("Speech → text");
    expect(html).toContain("Output device");
    const css = readFileSync(resolve(__dirname, "entity.css"), "utf8");
    expect(css).toMatch(/\.ent_listener_voice \.af-override\[data-setting="tts"\]\s*\{\s*display:\s*none;/);
  });
});
