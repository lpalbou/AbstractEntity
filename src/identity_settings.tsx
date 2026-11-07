/**
 * Settings → Identity (framework ADR 0052 §12, backlog 1119): the entity's look (an AbstractAvatar
 * design and a colour) and its voice, ONE record kept in its home, changed with one Save by an
 * admin or its creator (`PUT /entities/{name}/identity`).
 *
 * The page is the kit's shared `IdentityPanel` (ui-kit, operator 2026-11-07: "confusing and should
 * anyhow be a shared component"): look, then voice (engine, voice with a sample, Create a new voice),
 * history, and one Save at the bottom. This file only wires it to this gateway:
 * - read / save: `GET/PUT /entities/{name}/identity` (a refusal is the gateway's sentence with its
 *   download action, `IdentityRefusal`; nothing is retried);
 * - the voices: `GET voice/voices`; the reason a record has no voice: `GET /entities/{name}/voice`;
 * - the sample: the entity's own speaking lane with the chosen voice (`entityVoicePreview`);
 * - Create a new voice: the gateway's voice library; Download: the action the refusal offered;
 * - who may change it: `GET /entities/{name}/access` (else the panel is read-only with the sentence).
 */
import React, { useMemo } from "react";
import { IdentityPanel, joinBaseUrl, streamTtsJsonl, voiceTtsRequest, type IdentityClient, type VoicePreferences } from "@abstractframework/ui-kit";

import { accessRefusal, entityVoiceCreation, useEntityAccess } from "./mind_voice_settings";
import { getEntityIdentity, getEntityVoice, getVoiceCatalog, proxyCsrfToken, putEntityIdentity, startOfferedDownload, type DownloadAction } from "./stream_source";

/** What the page says for a record without a voice: the gateway's own sentence (`GET /voice`
 * `note`), as it is. Its absence is said too, never covered by a voice. */
export function noVoiceText(answer: { note?: string | null }, entityName: string): string {
  return answer.note || `The gateway did not say why ${entityName} has no voice.`;
}

/** The sentence a voice sample speaks. */
export const VOICE_SAMPLE_TEXT = "Hello, this is how I sound.";

/**
 * A short sample in a chosen voice, spoken on the entity's own lane (`POST /entities/{name}/voice/tts/stream`
 * with the voice fields: the request's voice wins over the recorded one, nothing is saved). The sample
 * is one sentence, so one segment: the first is played and the stream is closed.
 */
export function entityVoicePreview(baseUrl: string, entity: string, token: string | null) {
  return async (prefs: VoicePreferences, text?: string, opts?: { signal?: AbortSignal }): Promise<ArrayBuffer> => {
    const stream = streamTtsJsonl({
      path: joinBaseUrl(baseUrl, `api/gateway/entities/${encodeURIComponent(entity)}/voice/tts/stream`),
      body: { text: text || VOICE_SAMPLE_TEXT, format: "wav", ...voiceTtsRequest(prefs) },
      csrfToken: proxyCsrfToken() ?? undefined,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: opts?.signal,
    });
    for await (const segment of stream) return segment;
    throw new Error("The gateway returned no audio.");
  };
}

/** The panel's gateway for one entity. */
export function entityIdentityClient(baseUrl: string, entity: string, entityName: string, token: string | null): IdentityClient {
  return {
    read: (rev) => getEntityIdentity(baseUrl, entity, rev).then((answer) => answer.identity),
    save: (body) => putEntityIdentity(baseUrl, entity, body, token).then((answer) => answer.identity),
    voiceCatalog: (provider, model) => getVoiceCatalog(baseUrl, provider, model),
    noVoiceNote: () => getEntityVoice(baseUrl, entity).then((answer) => noVoiceText(answer, entityName)),
    previewVoice: entityVoicePreview(baseUrl, entity, token),
    createVoice: entityVoiceCreation(baseUrl, token),
    startDownload: (action) => startOfferedDownload(baseUrl, action as unknown as DownloadAction, token),
  };
}

export function IdentitySettings({ baseUrl, entity, entityName, token }: { baseUrl: string; entity: string; entityName: string; token: string | null }): React.ReactElement {
  const { access, error: accessError } = useEntityAccess(baseUrl, entity);
  const refusal = accessRefusal(access) || accessError;
  const client = useMemo(() => entityIdentityClient(baseUrl, entity, entityName, token), [baseUrl, entity, entityName, token]);
  return (
    <div className="idn" data-testid="identity-settings">
      <IdentityPanel key={`${baseUrl}|${entity}`} name={entityName} client={client} refusal={refusal} />
    </div>
  );
}
