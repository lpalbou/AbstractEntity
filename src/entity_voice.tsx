/**
 * Voice in a visit (round 7 R7.1): talk with an entity through the SAME
 * gateway voice routes and the SAME kit components as Code web.
 *
 * - Speak: the kit's `useGatewayVoice` + `streamTtsJsonl` against the
 *   entity-owned lane `POST /entities/{name}/voice/tts/stream`. That lane
 *   delegates to the gateway's generic streaming TTS (sentence-chunked, the
 *   first segment plays while the next is synthesised) and resolves HIS
 *   voice server-side — his own choice (Settings → voice), else the
 *   gateway's output.voice default. The request therefore never names a
 *   provider, model or voice: a voice field in the request would replace
 *   his (the lane's anti-mixing rule). Only the listener's latency choice
 *   rides along.
 * - Dictate: the recording is uploaded into the entity's voice scope
 *   (session `entity_voice_<slug>`, the owner run the TTS lane already uses)
 *   and transcribed by `POST /runs/{run}/audio/transcribe` with the kit's
 *   `voiceSttRequest` — the gateway default STT route unless the listener
 *   picked another. The status line is the kit's `transcribingLine`.
 * - Listener settings: the kit's `AfVoiceSection` (devices, microphone test,
 *   transcription route, read aloud, latency) fed by `GET voice/defaults`,
 *   kept per browser. Its text→speech override row is not offered here:
 *   in Entity the voice that speaks is the entity's own.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AfVoiceSection,
  Icon,
  elapsedSeconds,
  joinBaseUrl,
  streamTtsJsonl,
  transcribingLine,
  useGatewayVoice,
  voiceSttRequest,
  type VoiceClientPreferences,
  type VoiceDefaults,
} from "@abstractframework/ui-kit";

import { MEDIA_NEEDS_HTTPS, mediaAvailable } from "./lib/secure-context";
import { getVoiceCatalog, getVoiceDefaults, proxyCsrfToken, transcribeAudio, uploadSessionAudio } from "./stream_source";

/** How long a transcription may take before it is reported as failed (Code web's limit). */
export const TRANSCRIBE_TIMEOUT_MS = 180_000;

/** The session scope a visit's recordings are uploaded into (its owner run is the entity TTS lane's). */
export function entityVoiceSessionId(entity: string): string {
  return `entity_voice_${entity}`;
}

/** The body of a spoken reply: the text plus the listener's latency — never a voice field (his voice speaks). */
export function entityTtsBody(text: string, prefs: VoiceClientPreferences): Record<string, unknown> {
  const body: Record<string, unknown> = { text, format: "wav" };
  if (prefs.quality_preset) body.quality_preset = prefs.quality_preset;
  return body;
}

/** The file name a recording is uploaded under (by its recorded mime). */
export function recordingFileName(mime: string): string {
  const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
  return `recording.${ext}`;
}

const PREFS_KEY = "abstractentity.voice";

/** Listener voice preferences (devices, read aloud, transcription route), kept in this browser. */
export function useVoicePreferences(): [VoiceClientPreferences, (next: VoiceClientPreferences) => void] {
  const [prefs, setPrefs] = useState<VoiceClientPreferences>(() => {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") as VoiceClientPreferences;
    } catch {
      return {};
    }
  });
  const change = useCallback((next: VoiceClientPreferences) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* in-memory preferences still work */
    }
  }, []);
  // Another tab (or the Settings panel) changed them.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PREFS_KEY) return;
      try {
        setPrefs(JSON.parse(e.newValue || "{}") as VoiceClientPreferences);
      } catch {
        /* keep the current ones */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return [prefs, change];
}

/** The gateway's default voice routes, read once per gateway (`failed` when it could not answer). */
export function useVoiceDefaults(baseUrl: string): { value: VoiceDefaults | null; failed: boolean } {
  const [state, setState] = useState<{ value: VoiceDefaults | null; failed: boolean }>({ value: null, failed: false });
  useEffect(() => {
    let alive = true;
    getVoiceDefaults(baseUrl)
      .then((value) => alive && setState({ value: value || {}, failed: false }))
      .catch(() => alive && setState({ value: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [baseUrl]);
  return state;
}

type VoiceRoute = { baseUrl: string; entity: string; token: string | null; prefs: () => VoiceClientPreferences };

/** The kit's `tts_stream` for a visit: the entity-owned streaming lane (his voice, sentence by sentence; `signal` = Stop). */
export function entityTtsStream(r: VoiceRoute): (text: string, signal?: AbortSignal) => AsyncGenerator<ArrayBuffer> {
  return (text, signal) =>
    streamTtsJsonl({
      path: joinBaseUrl(r.baseUrl, `api/gateway/entities/${encodeURIComponent(r.entity)}/voice/tts/stream`),
      body: entityTtsBody(text, r.prefs()),
      csrfToken: proxyCsrfToken() ?? undefined,
      headers: r.token ? { Authorization: `Bearer ${r.token}` } : undefined,
      signal,
    });
}

/** The kit's `transcribe` for a visit: upload into his voice scope, then the gateway STT route (default unless overridden). */
export function entityTranscriber(r: VoiceRoute): (blob: Blob, mime: string) => Promise<{ text: string; provider: string | null; model: string | null }> {
  return async (blob, mime) => {
    const file = new File([blob], recordingFileName(mime), { type: mime || "audio/webm" });
    const stored = await uploadSessionAudio(r.baseUrl, entityVoiceSessionId(r.entity), file, r.token);
    const res = await transcribeAudio(
      r.baseUrl,
      stored.run_id,
      { audio_artifact: stored.attachment, ...voiceSttRequest(r.prefs()) },
      r.token,
      TRANSCRIBE_TIMEOUT_MS,
    );
    return { text: String(res.text || ""), provider: res.provider ?? null, model: res.model ?? null };
  };
}

/** Speak and dictate in a visit with `entity` — the kit hook, wired to the gateway routes. */
export function useEntityVoice(opts: {
  baseUrl: string;
  entity: string;
  token: string | null;
  /** Speaking is offered while a visit is open. */
  active: boolean;
  prefs: VoiceClientPreferences;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}) {
  const { baseUrl, entity, token, active, prefs } = opts;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const ttsStream = useMemo(
    () => (active ? entityTtsStream({ baseUrl, entity, token, prefs: () => prefsRef.current }) : undefined),
    [active, baseUrl, entity, token],
  );
  const transcribe = useMemo(
    () => (active ? entityTranscriber({ baseUrl, entity, token, prefs: () => prefsRef.current }) : undefined),
    [active, baseUrl, entity, token],
  );
  const onTranscript = useRef(opts.onTranscript);
  onTranscript.current = opts.onTranscript;
  const onError = useRef(opts.onError);
  onError.current = opts.onError;
  return useGatewayVoice({
    output_device_id: prefs.output_device || "",
    input_device_id: prefs.input_device || "",
    input_gain: prefs.input_gain,
    volume: prefs.reply_volume,
    // Tap to start / tap to stop, or hold: the button stops the recording itself.
    stop_on_pointerup: false,
    tts_stream: ttsStream,
    transcribe,
    on_transcript: (text) => onTranscript.current(text),
    on_error: (message) => onError.current(message),
  });
}

/** A press shorter than this is a tap: recording keeps going until the next tap (Code web's rule). */
export const TAP_MS = 350;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** The composer microphone (hold to dictate, or tap to start and tap again to stop) + Stop for a spoken reply. */
export function VisitVoiceButtons({
  voice,
  route,
  disabled,
}: {
  voice: ReturnType<typeof useEntityVoice>;
  /** The transcription route ("faster-whisper / large-v3": the override, else the gateway default). */
  route: string;
  disabled?: boolean;
}): React.ReactElement | null {
  const held = useRef(false);
  const latched = useRef(false);
  const pressedAt = useRef(0);
  const begin = () => {
    if (latched.current) {
      latched.current = false;
      voice.stop_voice_ptt_recording();
      return;
    }
    held.current = true;
    pressedAt.current = Date.now();
    void voice.start_voice_ptt_recording().then(() => {
      // A permission prompt may outlive the press; never leave the mic open.
      if (!held.current && !latched.current) voice.stop_voice_ptt_recording();
    });
  };
  const release = () => {
    if (!held.current) return;
    held.current = false;
    if (Date.now() - pressedAt.current < TAP_MS) {
      latched.current = true;
      return;
    }
    voice.stop_voice_ptt_recording();
  };
  useEffect(() => {
    const stopAll = () => {
      held.current = false;
      latched.current = false;
      voice.stop_voice_ptt_recording();
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", stopAll);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", stopAll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.stop_voice_ptt_recording]);
  useEffect(() => {
    if (!voice.voice_ptt_recording) latched.current = false;
  }, [voice.voice_ptt_recording]);
  const since = voice.voice_ptt_since || 0;
  const now = useNow(Boolean(since));
  const status = voice.voice_ptt_recording
    ? `Recording… ${since ? elapsedSeconds(since, now) : ""}`.trim()
    : voice.voice_ptt_busy
      ? transcribingLine(since || now, now, route)
      : "";
  const micBlocked = !mediaAvailable();
  return (
    <>
      {micBlocked ? (
        <button className="cd_attach_btn" aria-label="Dictation unavailable" title={MEDIA_NEEDS_HTTPS} disabled>
          <Icon name="mic" size={15} />
        </button>
      ) : (
        <button
          className="cd_attach_btn cd_mic_btn"
          data-voice="dictate"
          aria-label={voice.voice_ptt_recording ? "Recording — tap or release to transcribe" : "Hold to dictate"}
          title="Hold to dictate, or tap to start and tap again to stop (Space or Enter on keyboard)"
          aria-pressed={voice.voice_ptt_recording}
          disabled={disabled || !voice.voice_ptt_supported || voice.voice_ptt_busy}
          onPointerDown={(e) => {
            if (e.button === 0) begin();
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={(e) => {
            if ([" ", "Enter"].includes(e.key) && !e.repeat) {
              e.preventDefault();
              begin();
            }
          }}
          onKeyUp={(e) => {
            if ([" ", "Enter"].includes(e.key)) {
              e.preventDefault();
              release();
            }
          }}
        >
          <Icon name={voice.voice_ptt_busy ? "loader" : "mic"} size={15} />
        </button>
      )}
      {voice.tts_playback.status !== "idle" ? (
        <button className="cd_attach_btn" data-voice="stop" aria-label="Stop spoken reply" title="Stop spoken reply" onClick={voice.stop_tts}>
          <Icon name="x" size={14} />
        </button>
      ) : null}
      {status ? (
        <span role="status" className="cd_voice_status" data-voice-status>
          {status}
        </span>
      ) : null}
    </>
  );
}

/** Settings → voice, listener half: the kit's shared section (the entity's own voice sits above it). */
export function ListenerVoiceSettings({ baseUrl }: { baseUrl: string }): React.ReactElement {
  const [prefs, setPrefs] = useVoicePreferences();
  return (
    <section className="ent_listener_voice" data-testid="listener-voice-settings" aria-label="Listening and playback">
      <h3 className="wsp_listener_head">Listening and playback</h3>
      <p className="wsp_note">How you hear him and how your voice reaches him, in this browser. He always speaks with the voice chosen above.</p>
      <AfVoiceSection
        value={prefs}
        onChange={setPrefs}
        fetchCatalog={(provider, model) => getVoiceCatalog(baseUrl, provider, model)}
        fetchDefaults={() => getVoiceDefaults(baseUrl)}
        overrideOwner="this browser"
        nested
      />
    </section>
  );
}
