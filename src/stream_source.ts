/**
 * Stream sources: bounded replay reads + the live tail.
 *
 * One format, two modes (a2a 0005): replay is a bounded read; live is the
 * same read that doesn't stop. This module only performs GET requests —
 * renders are pure reads; an observer never writes to a mind.
 *
 * Gateway endpoints (serving end, 0005 gateway-01):
 *   GET  {base}/api/gateway/entities/{name}/replay          NDJSON, bounded
 *   GET  {base}/api/gateway/entities/{name}/replay/stream   SSE live tail
 *
 * Cursors are FLOATS end-to-end: host markers sit at fractional positions
 * `base + n/1000`, and SSE `id:` carries the seq so the browser's automatic
 * `Last-Event-ID` reconnect resumes exactly (it wins over `since_seq`).
 */

import type { ReplayEnvelope } from "./stream_types";

/** Normalize a parsed JSON value into a fold-safe envelope, or null if it
 * cannot be trusted (code adversary F1/F3): the fold runs in the render
 * path above the panel error boundaries, so a single hostile/malformed
 * line must be REJECTED at ingest, never handed downstream. General rule,
 * not special-casing:
 *   - `seq` must be a FINITE number (rejects NaN AND Infinity — Infinity
 *     poisoned the dup-guard and the live-tail cursor);
 *   - `family` must be a string (the fold switches on it);
 *   - `payload` is coerced to a plain object ({} when null/missing/scalar)
 *     so every family applier's `p.field` deref has an object to read.
 * Everything else stays opaque (the envelope is verbatim journal). */
export function normalizeEnvelope(raw: unknown): ReplayEnvelope | null {
  if (!raw || typeof raw !== "object") return null;
  const env = raw as Record<string, unknown>;
  if (!Number.isFinite(env.seq as number)) return null;
  if (typeof env.family !== "string") return null;
  const payload = env.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    env.payload = {};
  }
  return env as unknown as ReplayEnvelope;
}

/** Parse NDJSON text into envelopes. Unparseable/malformed lines are
 * surfaced (never silently swallowed): a corrupt line in an append-only
 * stream is a bug to see, and dropping it is safer than crashing on it. */
export function parseNdjson(text: string): { envelopes: ReplayEnvelope[]; errors: Array<{ line: number; error: string }> } {
  const envelopes: ReplayEnvelope[] = [];
  const errors: Array<{ line: number; error: string }> = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const env = normalizeEnvelope(JSON.parse(line));
      if (!env) {
        errors.push({ line: i + 1, error: "malformed envelope (bad seq/family/payload)" });
        continue;
      }
      envelopes.push(env);
    } catch (e) {
      errors.push({ line: i + 1, error: String(e) });
    }
  }
  return { envelopes, errors };
}

export interface EntitySummary {
  name: string;
  slug: string;
  entity_id?: string;
  /** `<name>@<declared address>` when the door declares one (GW-F, plan
   * item 5). Reachability, NOT identity — display only, never a key. */
  handle?: string;
}

/** The browser's gateway credential, module-wide (maintainer, 2026-07-08:
 * "the gateway should never work if it receives an unauthenticated
 * request"). Every read helper sends it as a Bearer header; the SSE tail
 * (EventSource cannot set headers) sends it as ?access_token=, which the
 * gateway middleware accepts for READS only. Set by the connect flow;
 * cleared on disconnect. */
let _gatewayToken: string | null = null;

export function setGatewayToken(token: string | null): void {
  const t = String(token || "").trim();
  _gatewayToken = t ? t : null;
}

export function gatewayToken(): string | null {
  return _gatewayToken;
}

export function gatewayReadHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return readHeaders(extra);
}

function readHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (_gatewayToken) h["Authorization"] = `Bearer ${_gatewayToken}`;
  return h;
}

/** The app-origin session proxy's CSRF guard (bin/cli.js): mutating
 * /api/gateway/* calls through the proxy are refused unless they carry
 * a CSRF header matching the readable csrf cookie the proxy set at
 * connect time (appId "abstractentity" names the cookie). Harmless when
 * absent (direct-gateway posture: no such cookie, no header). */
function proxyCsrfHeader(): Record<string, string> {
  const h: Record<string, string> = {};
  const csrf = proxyCsrfToken();
  // Canonical header spelling: the app-server proxy accepts BOTH the
  // appId-derived header and x-abstract-csrf — the canonical one keeps
  // this client correct even if the serving appId is ever renamed.
  if (csrf) h["X-Abstract-CSRF"] = csrf;
  // DIRECT-GATEWAY session posture (P0 c4779, gateway's half c4806): a
  // browser signed in AGAINST THE GATEWAY ITSELF (no app proxy) holds a
  // gateway session cookie + the non-httponly abstractgateway_csrf twin,
  // and the gateway's session writes refuse without x-abstractgateway-csrf
  // (reason_code=csrf_required — the silent 403 behind "NO I CAN NOT EDIT
  // THE BLUEPRINTS"). Send that spelling too when its cookie exists; each
  // cookie exists only in its own posture, so both headers never lie.
  const gw = gatewayCsrfToken();
  if (gw) h["x-abstractgateway-csrf"] = gw;
  return h;
}

/** The direct-gateway CSRF twin (cookie minted by the gateway's own
 * session sign-in; absent in the app-proxy posture). */
export function gatewayCsrfToken(): string | null {
  try {
    const csrf = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("abstractgateway_csrf="))
      ?.slice("abstractgateway_csrf=".length);
    return csrf ? decodeURIComponent(csrf) : null;
  } catch {
    return null; // non-browser tests
  }
}

/** The raw CSRF twin for consumers that hand the token to kit transports
 * (uic's `streamTtsJsonl` takes `csrfToken`, not headers). One module owns
 * the cookie-name knowledge. */
export function proxyCsrfToken(): string | null {
  try {
    const csrf = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("abstractentity_gateway_csrf="))
      ?.slice("abstractentity_gateway_csrf=".length);
    return csrf ? decodeURIComponent(csrf) : null;
  } catch {
    return null; // non-browser tests
  }
}

/** List entity homes served by the gateway. */
export async function listEntities(baseUrl: string): Promise<EntitySummary[]> {
  const res = await fetch(`${baseUrl}/api/gateway/entities`, { credentials: "include", headers: readHeaders({ Accept: "application/json" }) });
  if (!res.ok) {
    // Status rides the error so the index can tell "sign in required"
    // (401/403 -> connect prompt) from "gateway down" (maintainer incident
    // 2026-07-09 06:1x: silent-unauthenticated rendered as an empty page).
    const err = new Error(`entity list failed: HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = (await res.json()) as { entities?: Array<Record<string, unknown>> };
  return (data.entities ?? []).map((e) => ({
    name: String(e.name ?? e.slug ?? ""),
    slug: String(e.slug ?? e.name ?? ""),
    entity_id: e.entity_id ? String(e.entity_id) : undefined,
    handle: typeof e.handle === "string" && e.handle ? e.handle : undefined,
  }));
}

/** Bounded history read over the gateway's NDJSON endpoint. Errors carry
 * `status` (and the response `detail` when JSON) so consumers can render
 * a 403 observation refusal distinctly from a down gateway (O-E: an
 * ungranted mind must never read as an empty or broken one). */
export async function fetchReplay(baseUrl: string, entity: string, sinceSeq = 0): Promise<ReplayEnvelope[]> {
  const url = `${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/replay?since_seq=${sinceSeq}`;
  const res = await fetch(url, { credentials: "include", headers: readHeaders({ Accept: "application/x-ndjson" }) });
  if (!res.ok) {
    const err = new Error(`replay read failed: HTTP ${res.status}`) as Error & { status?: number; detail?: string };
    err.status = res.status;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (body && body.detail !== undefined) {
        err.detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      // non-JSON error body: status alone is enough
    }
    throw err;
  }
  const { envelopes, errors } = parseNdjson(await res.text());
  if (errors.length) {
    console.warn(`#FALLBACK: ${errors.length} unparseable replay line(s) skipped`, errors.slice(0, 3));
  }
  return envelopes;
}

/**
 * Stream a full life progressively (maintainer, 2026-07-09 04:32: a 98 MB
 * replay loaded as ONE blocking fetch left the page looking empty/broken
 * for ~30s — "this is not castor"). Envelopes are parsed line-by-line off
 * the response stream and delivered in batches, so the graph FILLS as his
 * life loads instead of appearing all-or-nothing at the end.
 * Returns the complete, seq-ordered list (same contract as fetchReplay).
 */
export async function streamReplay(
  baseUrl: string,
  entity: string,
  sinceSeq: number,
  onBatch: (all: ReplayEnvelope[], doneBytes: number) => void,
  batchSize = 800,
): Promise<ReplayEnvelope[]> {
  const url = `${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/replay?since_seq=${sinceSeq}`;
  const res = await fetch(url, { credentials: "include", headers: readHeaders({ Accept: "application/x-ndjson" }) });
  if (!res.ok) throw new Error(`replay read failed: HTTP ${res.status}`);
  if (!res.body) {
    // No streaming support (very old browser): the one-shot path still works.
    const { envelopes } = parseNdjson(await res.text());
    onBatch(envelopes, -1);
    return envelopes;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const all: ReplayEnvelope[] = [];
  let carry = "";
  let bytes = 0;
  let sinceEmit = 0;
  let skipped = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      bytes += value.byteLength;
      carry += decoder.decode(value, { stream: true });
      const lines = carry.split("\n");
      carry = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const env = normalizeEnvelope(JSON.parse(trimmed));
          if (env) {
            all.push(env);
            sinceEmit++;
          } else {
            skipped++;
          }
        } catch {
          skipped++;
        }
      }
      if (sinceEmit >= batchSize) {
        sinceEmit = 0;
        onBatch(all, bytes);
      }
    }
    if (done) break;
  }
  const tail = (carry + decoder.decode()).trim();
  if (tail) {
    try {
      const env = normalizeEnvelope(JSON.parse(tail));
      if (env) all.push(env);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  if (skipped > 0) console.warn(`#FALLBACK: ${skipped} unparseable replay line(s) skipped`);
  all.sort((a, b) => a.seq - b.seq);
  onBatch(all, bytes);
  return all;
}

export interface RecordVerbatim {
  record_id: string;
  title?: string;
  text: string;
  content_type?: string;
  turn_id?: string | null;
  run_id?: string | null;
  created_at?: string | null;
  /** True for interest/dream records: born as words — the digest IS the
   * complete text (0007 round 2, endorsed by memory + gateway). */
  born_digest?: boolean;
  kind?: string;
}

/** Fetch a record's lossless verbatim from the gateway (pure read).
 * Endpoint requested from the gateway agent (a2a 0007): resolves the
 * record's payload_ref into the home's artifact store. 404 = endpoint not
 * shipped yet OR record has no verbatim; 403 = refused (diary). */
export async function fetchRecordVerbatim(baseUrl: string, entity: string, graphId: string): Promise<RecordVerbatim> {
  const url = `${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/records/${encodeURIComponent(graphId)}/verbatim`;
  const res = await fetch(url, { credentials: "include", headers: readHeaders({ Accept: "application/json" }) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(detail || `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as RecordVerbatim;
}

/** One episode brief in a diary entry's trail (diary---verbatims room,
 * gateway lane C 2026-07-19): title/date are workplace content, never
 * diary words; `verbatim_available` gates click-through to the existing
 * /records/{graph_id}/verbatim endpoint. */
export interface DiaryTrailEpisode {
  graph_id: string;
  kind?: string;
  title?: string;
  observed_at?: string;
  verbatim_available?: boolean;
}

export interface DiaryEntryRead {
  entry_id: string;
  text?: string;
  gist?: string;
  kind?: string;
  visibility?: string;
  written_at?: string;
  /** The entry's provenance trail (render-when-present; a projection-less
   * old-vintage entry serves its words with no trail — honest absence):
   * `reflected_in` = the conversation that led to the entry;
   * `written_amid` = what he was attending to at write time. */
  trail?: {
    projection_id?: string;
    written_amid?: DiaryTrailEpisode[];
    reflected_in?: DiaryTrailEpisode[];
    verbatim_endpoint?: string;
  };
  warnings?: string[];
  [key: string]: unknown;
}

/** The OPERATOR diary door (0007 ruling 1; gateway 135641Z): a reasoned,
 * marker-first read of the book — every disclosure lands a `diary_read`
 * host marker in the stream BEFORE the words return, so the read itself
 * is visible in the entity's biography. Reason is REQUIRED (422 without). */
export async function fetchDiaryEntry(baseUrl: string, entity: string, entryId: string, reason: string): Promise<DiaryEntryRead> {
  const url = `${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/diary/${encodeURIComponent(entryId)}?reason=${encodeURIComponent(reason)}`;
  const res = await fetch(url, { credentials: "include", headers: readHeaders({ Accept: "application/json" }) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(detail || `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  // The gateway wraps the entry ({entry, read_recorded_at_seq, reason});
  // reading `text` off the WRAPPER rendered an empty body under a happy
  // status line (live failure 2026-07-08: "the book" and nothing else).
  // The provenance TRAIL and its warnings ride the WRAPPER as siblings of
  // `entry` (lane C, verified in the door's fold) — merge them onto the
  // unwrapped entry or the unwrap silently drops the trail.
  const body = (await res.json()) as { entry?: DiaryEntryRead; trail?: DiaryEntryRead["trail"]; warnings?: string[] } & DiaryEntryRead;
  const entry = (body.entry ?? body) as DiaryEntryRead;
  if (body.entry) {
    if (body.trail && !entry.trail) entry.trail = body.trail;
    if (body.warnings && !entry.warnings) entry.warnings = body.warnings;
  }
  return entry;
}

/** Operator state control: POST through the gateway door — the DOOR
 * decides (authenticated writes only); the view just carries the request
 * and renders the refusal or the resulting host marker honestly. */
export async function postEntityState(
  baseUrl: string,
  entity: string,
  state: string,
  reason: string,
  token: string | null,
): Promise<EntityStateInfo> {
  // dream=true rides every operator sleep (adversary B finding 4 + the
  // spec's own definition: sleep = "passive memory-graph processes:
  // consolidation, dreams" — a sleep click that runs NO consolidation
  // was a state flip pretending to be sleep; the pass is deterministic
  // and cheap, and the ruled observability expects it).
  const body: Record<string, unknown> = { state, reason };
  if (state === "asleep") body.dream = true;
  const res = await fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/state`, {
    credentials: "include",
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(detail || `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as EntityStateInfo;
}

export interface EntityStateInfo {
  state: string; // awake | asleep | resting | paused | …
  /** "visiting" while a human is in conversation (runtime 0007 160200Z) —
   * the auto-yield writes state=asleep for old-loop safety, and mode
   * carries the truth; the badge must prefer it. */
  mode?: string | null;
  changed_at?: string | null;
  reason?: string | null;
  written_by?: string | null;
}

/** On-disk footprint (gateway c1788): the numbers the fold CANNOT carry —
 * bytes at rest and the maintenance that moved them. Three byte fields
 * (memory/book/runtime) so a doctoring pass that shrinks memory.sqlite3
 * while the book stays whole is visible, not blended away. `last_maintenance_*`
 * folds from the host-marker stream (reembed + maintenance_window_open/close).
 * N6-clean: no paths/base_url/keys. */
export interface EntityFootprint {
  entity_id?: string;
  memory_bytes?: number;
  book_bytes?: number;
  runtime_bytes?: number;
  home_bytes?: number;
  journal_events?: number;
  records?: number;
  last_maintenance_at?: string | null;
  last_maintenance_kind?: string | null;
  maintenance_held?: boolean;
  warnings?: string[];
}

/** Read the footprint, feature-detected: a gateway that predates the route
 * (stale-server class, gateway c1788) answers 404 → null, and the panel
 * renders the labeled gap instead. Any other error also degrades to null
 * (the panel's fold metrics stand alone); never throws into the render. */
export async function fetchEntityFootprint(baseUrl: string, entity: string): Promise<EntityFootprint | null> {
  try {
    const res = await fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/footprint`, {
      credentials: "include",
      headers: readHeaders({ Accept: "application/json" }),
    });
    if (!res.ok) return null; // 404 = route not served yet; the gap note covers it
    return (await res.json()) as EntityFootprint;
  } catch {
    return null;
  }
}

/** The home's M1 embedding pin + the door's resolved embedder + the match
 * verdict (gateway `GET /{name}/embedding`, N6-clean: model/dimension/
 * source only). memory's durable-practice point (c1815): read the pin per
 * home and hand the real id downstream — entity homes can be re-pinned
 * (Castor's own says source=reembed), so never hardcode the embedder. */
export interface EntityEmbedding {
  pin?: { model_id?: string; dimension?: number; source?: string } | null;
  status?: string;
  resolved_embedder?: string | null;
  match?: "match" | "mismatch" | "unknown";
  warnings?: string[];
}

/** Read the home's embedder identity. null on a gateway that predates the
 * route or an unreachable read — callers surface the absence, never assume
 * an embedder (crossing embedding spaces silently is the failure to avoid). */
export async function fetchEntityEmbedding(baseUrl: string, entity: string): Promise<EntityEmbedding | null> {
  try {
    const res = await fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/embedding`, {
      credentials: "include",
      headers: readHeaders({ Accept: "application/json" }),
    });
    if (!res.ok) return null;
    return (await res.json()) as EntityEmbedding;
  } catch {
    return null;
  }
}

/** The embed transport for the cognition-wave scorer (uic c1824: `embed()`
 * is MY injection). The gateway's OpenAI-compatible embeddings route runs
 * the execution-host's configured embedder — for an entity that must be the
 * home's pinned model (verify via fetchEntityEmbedding + the scorer's M1
 * refusal). Returns vectors in input order + the model id the gateway
 * actually used (so a caller can cross-check against the home pin). */
export interface EmbedResult {
  vectors: number[][];
  model: string;
  dimension: number;
}

/** Embed a batch of texts through the gateway. `model` optionally pins the
 * embedder (must match the execution-host route); omitted = gateway default.
 * Throws on a non-ok response (the caller decides whether an embed failure
 * aborts calibration or degrades) — never returns partial/fabricated vectors. */
export async function embedTexts(baseUrl: string, texts: string[], model?: string): Promise<EmbedResult> {
  const body: Record<string, unknown> = { input: texts };
  if (model?.trim()) body["model"] = model.trim();
  const res = await fetch(`${baseUrl}/api/gateway/embeddings`, {
    credentials: "include",
    method: "POST",
    headers: authHeaders(null),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(detail || `embeddings: HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const json = (await res.json()) as { model?: string; dimension?: number; data?: Array<{ index?: number; embedding?: number[] }> };
  const data = Array.isArray(json.data) ? json.data : [];
  // Order by `index` when present (OpenAI contract), else input order.
  const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const vectors = ordered.map((d) => (Array.isArray(d.embedding) ? d.embedding : []));
  return { vectors, model: String(json.model || ""), dimension: Number(json.dimension || (vectors[0]?.length ?? 0)) };
}

/** The entity's current lifecycle state (gateway thread-0008 surface).
 * Pure read; the view shows a badge and never offers state writes. */
export async function fetchEntityState(baseUrl: string, entity: string): Promise<EntityStateInfo> {
  const res = await fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/state`, {
    credentials: "include",
    headers: readHeaders({ Accept: "application/json" }),
  });
  if (!res.ok) throw new Error(`state read failed: HTTP ${res.status}`);
  return (await res.json()) as EntityStateInfo;
}

export interface OperatorAuthProbe {
  operator?: boolean;
  user_id?: string | null;
  admin?: boolean;
}

/** The operator-auth probe (0007 165942Z): deliberately WRITE-classed —
 * dev posture exempts loopback GETs, so only a write-classed request
 * answers "would the state/chat/diary doors accept me?". 200 = yes;
 * 401/403 = no. Controls and the visit door gate on this. */
export async function probeOperatorAuth(baseUrl: string, token: string | null): Promise<OperatorAuthProbe | null> {
  const r = await classifyOperatorAuth(baseUrl, token);
  return r.kind === "operator" ? r.probe : null;
}

/** The probe with its REASON (parity-contract fix, adversarial audit V5:
 * "network errors read as auth refusals"): a definitive 401/403 means the
 * door refused THIS credential — sign-in is the answer; anything else
 * (gateway down, DNS, 5xx) means UNREACHABLE — re-asking the operator to
 * sign in cannot help and must not be the response. */
export type OperatorAuthClassification =
  | { kind: "operator"; probe: OperatorAuthProbe }
  | { kind: "refused"; status: number }
  | { kind: "unreachable"; error: string };

export async function classifyOperatorAuth(baseUrl: string, token: string | null): Promise<OperatorAuthClassification> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json", ...proxyCsrfHeader() };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}/api/gateway/entities/auth/probe`, { credentials: "include", method: "POST", headers, body: "{}" });
    if (res.ok) {
      const probe = (await res.json()) as OperatorAuthProbe;
      if (probe?.operator) return { kind: "operator", probe };
      return { kind: "refused", status: 200 };
    }
    if (res.status === 401 || res.status === 403) return { kind: "refused", status: res.status };
    return { kind: "unreachable", error: `HTTP ${res.status}` };
  } catch (e) {
    return { kind: "unreachable", error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- the chat door (0007 161002Z: operator-authed visits, one turn loop
// with the CLI; auto-yield built in; visits land as summon markers) -------

export interface ChatStatus {
  open: boolean;
  chat_id?: string;
  session_id?: string;
  opened_at?: string;
  turns?: number;
  model_info?: Record<string, unknown>;
}

export interface ChatOpenResult {
  chat_id: string;
  session_id: string;
  participants?: string[];
  prelude_tokens?: number;
  budget_profile?: Record<string, unknown>;
  yielded_loop?: boolean;
  warnings?: string[];
}

/** One memory that entered the prompt — the probe surface (2026-07-08):
 * digest, token cost, lifetime use count, temporal activation. */
export interface TurnMemory {
  tag?: string;
  graph_id?: string;
  record_id?: string;
  kind?: string;
  title?: string;
  why?: string;
  admission?: string;
  digest?: string;
  tokens?: number;
  global_count?: number;
  activation?: Record<string, number>;
  /** When this memory was born (seq 43 R1: undated memories made "last
   * time" unanswerable). Tolerant: absent on older drivers. */
  born_at?: string;
  /** Where it came from (lived conversation / his own retelling / dream…)
   * — self-copies must not read as corroborations (seq 43 FAILURE 4). */
  origin?: string;
}

export interface ChatTurnResult {
  reply: string;
  turn_id?: string;
  /** DRIVER-AUTHORED tool truth — the marker-imitation lesson as API
   * shape. Render THIS, never tool claims from reply prose. */
  tools_ran?: string[];
  memories_in_context?: number;
  records_formed?: number;
  diary_entries?: number;
  notices?: string[];
  /** Enriched probe payload (driver-authored; absent on older gateways). */
  memories?: TurnMemory[];
  /** Tool elections: name + argument, and (field-asked from runtime,
   * 2026-07-09) the RESULT the tool returned to the entity. `success`
   * rides the gateway's ledger fold (2026-07-18): false = the call
   * failed/was refused and `result` carries the error text verbatim. */
  tool_details?: Array<{ name: string; arg?: string; result?: string; success?: boolean }>;
  files?: Array<{ path: string; action: string }>;
  /** The exact system prompt sent this turn (field-asked from runtime,
   * 2026-07-09: "I didn't see any system prompt — that's not good
   * observability"). Absent on gateways that don't yet return it. */
  system_prompt?: string;
  /** CLIENT-stamped turn wall time (send → reply, includes network) — the
   * effort monitor's honest clock; never server-authored. */
  think_ms?: number;
}

// ------------------------------------------------------------- workspace

export interface WorkspaceEntry {
  name: string;
  path: string;
  kind: "file" | "dir" | "mount";
  size?: number | null;
  mode?: string;
  target?: string;
}

export interface WorkspaceListing {
  path: string;
  writable: boolean;
  mount: string | null;
  entries: WorkspaceEntry[];
}

export interface WorkspaceMount {
  name: string;
  path: string;
  mode: string; // ro | rw
}

export interface ToolRiskRow {
  tier?: number;
  risk_rank?: number;
  label?: string;
  band?: string;
  risk_tier?: string;
  risk_presentation?: string;
  risk_mapping_version?: number | string;
  grantable?: boolean;
}

export interface ToolPolicyInfo {
  phases: Record<
    string,
    {
      tools: string[];
      source: string;
      notes: string[];
      /** Per-tool lane executability (grant audit 2026-07-18): a grant the
       * phase's lane cannot actually offer renders with a reason instead of
       * silently reading as effective. Render-when-present — pre-fix
       * gateways don't serve it. */
      executable?: Record<string, { ok: boolean; reason?: string }>;
    }
  >;
  all_tools: string[];
  tiers: Record<string, string[]>;
  /** THE RISK AXIS (tool-tiers round, converged cycle 2: risk_tier is the
   * NEW key — the served, DERIVED operator-facing ladder; the legacy
   * `tiers` field above froze as a deprecated boundary echo). Tolerant
   * optional read: absent on pre-ship gateways = no badge renders (honest
   * absence); a tool present in all_tools but missing here renders
   * "unvetted — facts undeclared", never a guessed band. Shipped key is
   * `risk` (gateway c4654; my staged `risk_tier` guess kept as a tolerated
   * alias). Row shape is the settled wire (semantics c4589): risk_rank =
   * the INTEGER ordinal, risk_tier = the WORD identity, risk_presentation
   * ("unvetted" on factless rows — never rendered as destructive),
   * risk_mapping_version, grantable (user-consent-plane info riding on
   * life-plane rows; the matrix stays the ENTITY phase lane). */
  risk?: Record<string, ToolRiskRow>;
  /** Pre-ship staging alias — the c4654 wire uses `risk`. */
  risk_tier?: Record<string, ToolRiskRow>;
}

async function getJson<T>(url: string): Promise<T> {
  // Per-request budget (fable5 finding 4): a black-holed GET used to park
  // its await FOREVER — the flow lane's deadline and stop-waiting checks
  // both live at the loop top, so one half-open TCP connection made every
  // escape hatch unreachable. 30s is generous for a status read.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(url, { credentials: "include", headers: readHeaders({ Accept: "application/json" }), signal: ctrl.signal });
  } catch (e) {
    // Label the timeout — an AbortError's "signal is aborted without
    // reason" is browser noise, not an operator sentence.
    if ((e as Error).name === "AbortError") throw new Error(`the gateway did not answer within 30s (${url.split("/api/")[1] ?? url})`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(detail || `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

async function putJson<T>(url: string, body: unknown, token: string | null): Promise<T> {
  const headers = authHeaders(token);
  const res = await fetch(url, { credentials: "include", method: "PUT", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = "";
    try {
      const data = (await res.json()) as { detail?: unknown; reason_code?: unknown };
      // Surface refusals VERBATIM (P0 c4809: a 403 whose reason_code the
      // UI swallowed burned two days) — object details stringify, and a
      // top-level reason_code rides even when detail is prose.
      const d = data.detail;
      detail = d == null ? "" : typeof d === "string" ? d : JSON.stringify(d);
      if (data.reason_code && !detail.includes(String(data.reason_code))) detail = `${detail} [reason_code=${String(data.reason_code)}]`.trim();
    } catch {
      detail = await res.text().catch(() => "");
    }
    const err = new Error(detail || `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/** The served phase blueprint (v11 editable lane, gateway c-t-i #350):
 * GET serves the OPERATOR copy when present (operator_edited/operator_rev
 * on the wire, sha over the served bytes); PUT {tunables} deep-merges the
 * dials (laurent's modulation surface — every edit bumps rev, recomputes
 * the sha, and lands a blueprint_edited marker in every entity's
 * biography). Full-spec replacement exists on the wire but is deliberately
 * NOT offered by this app's surface: structural edits stay the seat's pen. */
export interface PhaseSpecServed {
  spec?: Record<string, unknown>;
  sha256?: string | null;
  vendored?: string;
  /** Legacy one-morning wire (first-build PUT). */
  operator_edited?: boolean;
  operator_rev?: number | null;
  edited_at?: string | null;
  /** v12 overlay wire (gateway c-t-i #357): the operator's dial values +
   * base ⊕ overlay merge, BESIDE the untouched structural {spec, sha256}. */
  tunables_overlay?: Record<string, unknown> | null;
  effective_tunables?: Record<string, unknown> | null;
  overlay?: { edit_seq?: number | null; edited_by?: string | null; edited_at?: string | null; reason?: string | null } | null;
  /** G3 (gateway c-t-i #376): a corrupt overlay degrades LOUDLY — the GET
   * carries a #FALLBACK warning naming the file and the seed fallback.
   * Tolerant optional read; absent = healthy. */
  warning?: string | null;
  /** Structural-edit lane (c4837/c4934): the merged effective transitions
   * (structural ⊕ edge_ops) + the stored graph overlay. Render-when-served
   * — pre-lane gateways carry neither. */
  effective_transitions?: Array<Record<string, unknown>> | null;
  graph_overlay?: { edge_ops?: EdgeOp[] } | null;
}

/** One structural edit op (the c4934 shipped wire — edge identity is the
 * TRIPLE from->to#cause; document-ownership: a PUT carrying graph replaces
 * the stored op set WHOLESALE, so editors send the full desired list). */
export interface EdgeOp {
  op: "add" | "remove" | "redirect";
  from?: string;
  to?: string;
  cause?: string;
  edge?: string;
  instruction?: string;
  bound_h?: number;
}

export function getPhaseSpec(baseUrl: string): Promise<PhaseSpecServed> {
  return getJson(`${baseUrl}/api/gateway/entities/spec/phases`);
}

/** THE FLOW-BRAIN LANE (operator tasking c5190; door acceptance GREEN
 * c5246): each prompt = ONE summon of the entity-chat VisualFlow — recall,
 * lived turn, elections, commit, episode all through the production door.
 * The run executes async; the caller polls the run until terminal. */
export function summonEntity(
  baseUrl: string,
  entity: string,
  body: {
    prompt: string;
    flow_id?: string;
    bundle_id?: string;
    session_id?: string;
    input_data?: Record<string, unknown>;
    context_window_tokens?: number;
    /** Queue opt-in (decision:summon-queue-v1 §1): NEVER sent silently —
     * only a human's deliberate button click sets it. */
    queue?: boolean;
    /** The leave-it-with-her posture (§5): entry persists poll-less. */
    park?: boolean;
  },
  token: string | null,
): Promise<{
  run_id: string;
  session_id?: string;
  warnings?: string[];
  prelude?: { text?: string };
  /** Queued admission (202, contract §2). */
  queued?: boolean;
  queue_id?: string;
  position?: number;
  current_idle_deadline?: string | null;
}> {
  return postJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/summon`, body, token);
}

export function getRunSummary(
  baseUrl: string,
  runId: string,
): Promise<{ status?: string; output?: unknown; error?: string | null }> {
  return getJson(`${baseUrl}/api/gateway/runs/${encodeURIComponent(runId)}`);
}

export function putPhaseSpecGraph(
  baseUrl: string,
  edgeOps: EdgeOp[],
  reason: string,
  token: string | null,
  ifMatch?: number | null,
): Promise<PhaseSpecServed> {
  const body: Record<string, unknown> = { graph: { edge_ops: edgeOps } };
  if (reason.trim()) body.reason = reason.trim();
  if (ifMatch != null) body.if_match = ifMatch;
  return putJson(`${baseUrl}/api/gateway/entities/spec/phases`, body, token);
}

export function putPhaseSpecTunables(
  baseUrl: string,
  tunables: Record<string, unknown>,
  reason: string,
  token: string | null,
  ifMatch?: number | null,
): Promise<PhaseSpecServed> {
  const body: Record<string, unknown> = { tunables };
  if (reason.trim()) body.reason = reason.trim();
  // CAS (v12 overlay lane): if_match = the overlay edit_seq this client
  // read; a 409 means another edit landed between read and write —
  // re-read and re-apply, never blind-overwrite.
  if (ifMatch != null) body.if_match = ifMatch;
  return putJson(`${baseUrl}/api/gateway/entities/spec/phases`, body, token);
}

export function listWorkspace(baseUrl: string, entity: string, path = "."): Promise<WorkspaceListing> {
  return getJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/workspace?path=${encodeURIComponent(path)}`);
}

export function readWorkspaceFile(
  baseUrl: string,
  entity: string,
  path: string,
): Promise<{ path: string; size: number; truncated: boolean; text: string }> {
  return getJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/workspace/file?path=${encodeURIComponent(path)}`);
}

export function getWorkspaceMounts(baseUrl: string, entity: string): Promise<{ mounts: WorkspaceMount[] }> {
  return getJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/workspace/mounts`);
}

export function putWorkspaceMounts(
  baseUrl: string,
  entity: string,
  mounts: WorkspaceMount[],
  token: string | null,
): Promise<{ mounts: WorkspaceMount[] }> {
  return putJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/workspace/mounts`, { mounts }, token);
}

// Per-entity SKILLS selection (laurent c2857; gateway endpoints c2838 —
// GET serves {selection, resolved, matrix}: the stored file, roster rows
// with trust verdicts, and the KIT-VALIDATED PhaseCapabilityMatrix
// payload; PUT is a WHOLE-DOCUMENT replace of the selection, marker-first
// server-side).
export interface EntitySkillsResolved {
  selection: { exists: boolean; skills: Array<{ name: string; phases?: string[] }>; warnings?: string[] };
  resolved: {
    skills: Array<{
      name: string;
      description?: string;
      trust_level?: string;
      requires_review?: boolean;
      blocked?: boolean;
      tree_hash?: string;
      source?: string;
      phases?: string[] | null;
      active?: boolean;
      /** Audience trust field (skill c170): entity = grantable to entities;
       * host = observer/dev-facing, never an entity prompt (fail-closed);
       * either = conditional. Read structurally, never inferred from prose. */
      audience?: "entity" | "host" | "either" | string;
      /** True when this skill's teaching is DELIVERED via the capability
       * map (entity-self-knowledge: the map reference IS the skill — skill
       * c165), so it must render delivered, not Default/off. */
      delivered_via_map?: boolean;
      /** 0008 requires contract (gateway consumer half, c3964): declared
       * dependencies verbatim (e.g. {mcp: [...], tools: [...]}) and, when
       * unmet, the labeled verdict (why the skill dropped from active —
       * "MCP server 'x' not declared on this gateway"). Absent on
       * pre-contract gateways = nothing renders. */
      requires?: Record<string, unknown> | null;
      requires_unmet?: string | Record<string, unknown> | null;
    }>;
    verdicts: Array<Record<string, unknown>>;
  };
  matrix: unknown;
}

export function getEntitySkills(baseUrl: string, entity: string): Promise<EntitySkillsResolved> {
  return getJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/skills`);
}

export function putEntitySkills(
  baseUrl: string,
  entity: string,
  skills: Array<{ name: string; phases?: string[] }>,
  token: string | null,
): Promise<EntitySkillsResolved> {
  return putJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/skills`, { skills }, token);
}

export function getToolPolicy(baseUrl: string, entity: string): Promise<ToolPolicyInfo> {
  return getJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/tool-policy`);
}

export function putToolPolicy(
  baseUrl: string,
  entity: string,
  policy: Record<string, string[]>,
  token: string | null,
): Promise<ToolPolicyInfo> {
  return putJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/tool-policy`, { policy }, token);
}

/** The system prompt as its layers (maintainer, 2026-07-11): the rendered
 * identity prelude is read-only truth; `layers` are the operator-editable
 * ones (source says whether the built-in default or an overlay is live);
 * `preview` is the exact next-summon head composition. */
export interface PromptLayerInfo {
  layers: Record<string, { text: string; source: "default" | "overlay" }>;
  defaults: Record<string, string>;
  prelude: string;
  preview: string;
  warnings: string[];
  editable: string[];
  /** Raw bytes of an UNPARSEABLE system_prompt.yaml (recovery surface —
   * absent when the file is healthy or missing). */
  raw_file?: string | null;
}

export function getEntityPrompt(baseUrl: string, entity: string): Promise<PromptLayerInfo> {
  return getJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/prompt`);
}

export function putEntityPrompt(
  baseUrl: string,
  entity: string,
  overlay: Record<string, string>,
  token: string | null,
): Promise<PromptLayerInfo> {
  return putJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/prompt`, { overlay }, token);
}

export interface ChatCloseResult {
  summary?: string;
  turns?: number;
  reflection?: { reply?: string; feelings_applied?: number; interests?: string[] };
  warnings?: string[];
}

function authHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json", ...proxyCsrfHeader() };
  const effective = token || _gatewayToken;
  if (effective) headers["Authorization"] = `Bearer ${effective}`;
  return headers;
}

async function postJson<T>(url: string, body: unknown, token: string | null, timeoutMs = 120000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { credentials: "include", method: "POST", headers: authHeaders(token), body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const err = new Error(detail || `HTTP ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export function getChatStatus(baseUrl: string, entity: string): Promise<ChatStatus> {
  // readHeaders, not bare Accept (audit V8): on a strict-auth gateway a
  // credential-less status read 401s and the drawer degrades silently.
  return fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/chat`, { credentials: "include", headers: readHeaders({ Accept: "application/json" }) }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ChatStatus>;
  });
}

export interface ChatOpenOptions {
  /** Mind-substrate override (0010 200500Z: operator config) — empty =
   * the gateway's configured default. */
  provider?: string;
  model?: string;
  base_url?: string;
}

export function openChat(
  baseUrl: string,
  entity: string,
  participant: string,
  token: string | null,
  options: ChatOpenOptions = {},
): Promise<ChatOpenResult> {
  const body: Record<string, unknown> = { participants: [participant] };
  if (options.provider?.trim()) body["provider"] = options.provider.trim();
  if (options.model?.trim()) body["model"] = options.model.trim();
  if (options.base_url?.trim()) body["base_url"] = options.base_url.trim();
  // The open may wait up to ~55s for the entity's own-time loop to yield
  // at a tick boundary — the timeout must outlast that, honestly.
  return postJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/chat/open`, body, token, 90000);
}

export function sendChatTurn(
  baseUrl: string,
  entity: string,
  chatId: string,
  text: string,
  token: string | null,
  speaker?: string,
): Promise<ChatTurnResult> {
  // `speaker` rides on every turn (shared-room attribution): the gateway
  // stamps the voice and lets a REJOINED room attribute turns correctly —
  // never to whoever originally opened the session.
  const body: Record<string, unknown> = { text };
  if (speaker?.trim()) body["speaker"] = speaker.trim();
  // 10 min: the turn budget is 20 tool calls (maintainer ruling 2026-07-11)
  // and a research-heavy turn legitimately chains many lookups — the client
  // must not abort a healthy turn the server is still working.
  return postJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/chat/${encodeURIComponent(chatId)}/turn`, body, token, 600000);
}

export function closeChat(baseUrl: string, entity: string, chatId: string, token: string | null): Promise<ChatCloseResult> {
  return postJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/chat/${encodeURIComponent(chatId)}/close`, { reflect: true }, token, 300000);
}

// ----------------------------------------------------------------- meets
// Item 14 (the north-star substrate's first realizable shape): two entities
// in ONE conversation as two correlated durable legs under one visit_id.
// The gateway is the convener/relay — the operator authors steering lines,
// each entity replies in its own voice, and every reply is relayed to the
// other side. These functions map the gateway's meet routes 1:1; the shapes
// mirror abstractgateway/entity_meets.py so the console never guesses.

/** One side of a meet. */
export interface MeetLeg {
  entity_id: string;
  run_id: string;
}

export interface MeetOpenResult {
  meet_id: string;
  visit_id: string;
  convener: string;
  a: MeetLeg;
  b: MeetLeg;
}

/** What one entity said this exchange (the speaker's reply, or the heard
 * side after relay). `reply` is the entity's OWN words; the convener's
 * steering line is authored separately (never attributed to an entity). */
export interface MeetTurnView {
  entity_id: string;
  reply: string;
  status?: string | null;
  turn_n?: number | null;
}

export interface MeetRelayResult {
  meet_id: string;
  visit_id: string;
  /** Present on a crash-retry that finished a half-delivered exchange. */
  resumed?: boolean;
  spoke: MeetTurnView;
  heard: MeetTurnView;
}

export interface MeetLegStatus {
  entity_id: string;
  open: boolean;
  run_id: string;
  turn_n?: number | null;
  phase?: string | null;
  [k: string]: unknown;
}

export interface MeetStatusResult {
  meet_id: string;
  visit_id: string;
  convener?: string | null;
  pending: boolean;
  a: MeetLegStatus;
  b: MeetLegStatus;
}

export interface MeetCloseResult {
  meet_id: string;
  visit_id: string;
  closed: boolean;
  warning?: string;
  a?: unknown;
  b?: unknown;
}

/** Open a two-entity meet. Both legs summon under one visit_id; if the
 * second entity refuses, the gateway closes the first so a meet never
 * half-opens. The open can wait for a yielding own-time loop, so the
 * timeout outlasts a tick boundary (mirrors openChat). */
export function openMeet(
  baseUrl: string,
  entityA: string,
  entityB: string,
  token: string | null,
  sessionId?: string,
): Promise<MeetOpenResult> {
  const body: Record<string, unknown> = { entity_a: entityA, entity_b: entityB };
  if (sessionId?.trim()) body["session_id"] = sessionId.trim();
  return postJson(`${baseUrl}/api/gateway/entities/meets/open`, body, token, 120000);
}

/** One exchange: `opener` ('a'|'b') speaks the convener's `text`; the
 * reply is relayed to the other leg. Long timeout — each relay ticks TWO
 * entity turns, each with the full 20-tool budget. */
export function relayMeet(
  baseUrl: string,
  meetId: string,
  opener: "a" | "b",
  text: string,
  token: string | null,
): Promise<MeetRelayResult> {
  return postJson(`${baseUrl}/api/gateway/entities/meets/${encodeURIComponent(meetId)}/relay`, { opener, text }, token, 1200000);
}

/** Close both legs (each reflects in its own home). The gateway keeps the
 * meet if a leg fails to close, so `closed:false` + `warning` is honest,
 * not an error. */
export function closeMeet(baseUrl: string, meetId: string, reason: string, token: string | null): Promise<MeetCloseResult> {
  return postJson(`${baseUrl}/api/gateway/entities/meets/${encodeURIComponent(meetId)}/close`, { reason }, token, 300000);
}

/** Both legs' live status by their OWN run ids (never "whatever visit is
 * live on the home now"). Pure read. */
export function fetchMeetStatus(baseUrl: string, meetId: string): Promise<MeetStatusResult> {
  return fetch(`${baseUrl}/api/gateway/entities/meets/${encodeURIComponent(meetId)}`, {
    credentials: "include",
    headers: readHeaders({ Accept: "application/json" }),
  }).then((res) => {
    if (!res.ok) throw new Error(`meet status: HTTP ${res.status}`);
    return res.json() as Promise<MeetStatusResult>;
  });
}

export interface ChatTranscriptTurn {
  turn_id?: string;
  speaker?: string;
  text?: string;
  reply?: string;
  tools_ran?: string[];
  at?: string;
}

export interface ChatTranscript {
  chat_id: string;
  participants?: string[];
  turns: ChatTranscriptTurn[];
}

/** The shared room's common view (pure read) — the rehydration source when
 * the drawer remounts or the page reloads mid-visit. */
export function getChatTranscript(baseUrl: string, entity: string, chatId: string): Promise<ChatTranscript> {
  return fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/chat/${encodeURIComponent(chatId)}/transcript`, {
    credentials: "include",
    headers: readHeaders({ Accept: "application/json" }),
  }).then((res) => {
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return res.json() as Promise<ChatTranscript>;
  });
}

// ---- the DURABLE visit lane (design v4, commons plans/durable-visits-
// reincarnation.md — RULED, build authorized). Visits execute as runs on
// the entity's own runtime (runtime_<slug>.sqlite3 in the home); a gateway
// restart no longer kills the conversation. This transport half is built
// AHEAD of the drawer flip: the flip waits on the door serving the §5
// consumer contract (probe payload on turns, transcript/rehydration,
// auto-wake) so the cutover never regresses transparency surfaces. --------

export interface VisitOpenResult {
  run_id: string;
  visit_id?: string;
  entity_id?: string;
  session_id?: string;
  participants?: string[];
  yielded_loop?: boolean;
  prelude_warnings?: string[];
  /** Granted tools this session could NOT offer (grant audit 2026-07-18:
   * the adapter's allowlist prune writes this durable note; the door is
   * asked to serve it so the operator sees the session's REAL toolkit).
   * Render-when-present. */
  allowlist_pruned?: { dropped?: string[]; reason?: string };
}

/** Turn/close/tick responses carry status IN THE BODY (HTTP 200 with
 * status:"failed" is a real outcome — the walkthrough lesson: transport
 * success is never operation success). Probe fields mirror ChatTurnResult
 * and are absent until the door serves them (§5 contract). */
export interface VisitTurnResult {
  run_id: string;
  reply?: string;
  turn_n?: number;
  status: string;
  error?: string;
  output?: Record<string, unknown>;
  tools_ran?: string[];
  memories_in_context?: number;
  records_formed?: number;
  diary_entries?: number;
  memories?: TurnMemory[];
  tool_details?: Array<{ name: string; arg?: string; result?: string }>;
  system_prompt?: string;
}

export interface VisitStatus {
  open: boolean;
  run_id?: string;
  session_id?: string;
  visit_id?: string;
  turn_n?: number;
  status?: string;
}

/** The body-status rule as ONE predicate (drawer + tests share it):
 * returns a human problem sentence when the operation failed IN THE BODY,
 * null when the outcome is healthy. `completed` is healthy for close and
 * for a turn that raced a timed-out close to terminal. */
export function visitBodyProblem(result: { status?: string; error?: string } | null | undefined): string | null {
  if (!result || typeof result !== "object") return "the door returned no body";
  const status = String(result.status || "").trim().toLowerCase();
  if (status === "failed") return String(result.error || "").trim() || "the visit run failed; see the run ledger";
  if (status === "cancelled") return "the visit run was cancelled";
  return null;
}

/** B1 (laurent 04:58: "if i click visit, it should awake the entity,
 * period"): does this refusal sentence mean "asleep — wake him first"?
 * Two-signal match keeps the client-side wake-retry off every other
 * refusal class (paused, foreign visit, substrate missing). The door's
 * auto-wake (gateway c1320) makes this path a dormant belt on current
 * gateways; it fires only against older doors. */
export function isAsleepWakeRefusal(refusal: string): boolean {
  const t = String(refusal || "");
  return /asleep/i.test(t) && /wake/i.test(t);
}

export function openVisit(baseUrl: string, entity: string, token: string | null, sessionId?: string): Promise<VisitOpenResult> {
  const body: Record<string, unknown> = {};
  if (sessionId?.trim()) body["session_id"] = sessionId.trim();
  // The open may auto-yield the own-time loop at a tick boundary (up to
  // ~55s server-side) — same budget as the hosted lane's open.
  return postJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/visit/open`, body, token, 90000);
}

export function sendVisitTurn(
  baseUrl: string,
  entity: string,
  runId: string,
  text: string,
  token: string | null,
  speaker?: string,
): Promise<VisitTurnResult> {
  const body: Record<string, unknown> = { text };
  if (speaker?.trim()) body["speaker"] = speaker.trim();
  // Same 10-min budget as the hosted lane (20-tool-call turns are legal).
  return postJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/visit/${encodeURIComponent(runId)}/turn`, body, token, 600000);
}

export function closeVisit(
  baseUrl: string,
  entity: string,
  runId: string,
  token: string | null,
  closedBy: "operator" | "sleep" | "pause" = "operator",
  reason = "",
): Promise<VisitTurnResult> {
  const body = { closed_by: closedBy, reason };
  return postJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/visit/${encodeURIComponent(runId)}/close`, body, token, 300000);
}

/** Drive-to-park after a mid-turn kill (crash recovery; idempotent). The
 * door's turn() self-recovers running runs too — this is the explicit
 * repair verb for status views. */
export function tickVisit(baseUrl: string, entity: string, runId: string, token: string | null): Promise<VisitTurnResult> {
  return postJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/visit/${encodeURIComponent(runId)}/tick`, {}, token, 600000);
}

/** The conversation SEAT (gateway seat slice 1, c5390): who holds the one
 * conversation this entity can live at a time. Pure read; liveness matches
 * the door's guard, so this can never disagree with a refusal. holder_kind
 * is 'unknown' until per-agent principals (GW-H) make it truthful. */
export interface EntitySeat {
  held: boolean;
  run_id?: string | null;
  session_id?: string | null;
  status?: string | null;
  holder?: string | null;
  holder_kind?: string | null;
  held_since?: string | null;
  renewed_at?: string | null;
  idle_ttl_s?: number | null;
  /** Queue door (decision:summon-queue-v1 §20): how many wait at the door. */
  queue_depth?: number | null;
  /** The current session's idle ceiling — the ONLY lawful ETA (contract §2). */
  current_idle_deadline?: string | null;
}

/** One queue-entry poll answer (contract §3 + the additive failed state,
 * gateway c5659). waiting_behind makes the attempt-not-grant race legible:
 * own_time = the seat freed but his own time claimed it — still first. */
export interface QueueEntryState {
  state?: "queued" | "admitted" | "reaped" | "stepped_away" | "failed" | string;
  position?: number | null;
  waiting_behind?: "visit" | "own_time" | null | string;
  current_idle_deadline?: string | null;
  run_id?: string | null;
  reason?: string | null;
}

export function pollQueueEntry(baseUrl: string, entity: string, queueId: string): Promise<QueueEntryState> {
  return getJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/queue/${encodeURIComponent(queueId)}`);
}

export function leaveQueue(baseUrl: string, entity: string, queueId: string, token: string | null): Promise<unknown> {
  return postJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/queue/${encodeURIComponent(queueId)}/leave`, {}, token);
}

/** Door refusals arrive as raw response text — either
 * '{"detail":"a visit is open…"}' or the summon-refusal shape
 * '{"detail":{"refused":true,"reasons":[…]}}'. Surface the human
 * sentences, never JSON armor (P0 c4809: swallowed reason_codes burned
 * two days). Lives beside the error shapes it parses (fable5 plan B). */
export function refusalText(e: Error & { status?: number }): string {
  const raw = String(e.message || "");
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown };
    const detail = parsed?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const reasons = (detail as { reasons?: unknown }).reasons;
      if (Array.isArray(reasons) && reasons.length > 0) {
        return reasons.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join(" · ");
      }
      return JSON.stringify(detail);
    }
  } catch {
    // not JSON: raw text IS the message
  }
  return raw;
}

export function getEntitySeat(baseUrl: string, entity: string): Promise<EntitySeat> {
  return getJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/seat`);
}

export function getVisitStatus(baseUrl: string, entity: string): Promise<VisitStatus> {
  return fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/visit`, {
    credentials: "include",
    headers: readHeaders({ Accept: "application/json" }),
  }).then((res) => {
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return res.json() as Promise<VisitStatus>;
  });
}

// ---- the cognition/spend wire (B3, gateway c1390) ----------------------

export interface CognitionSpend {
  llm_calls?: number;
  tool_calls?: number;
  tokens_total?: number;
  runs?: number;
}

export interface EntityCognition {
  /** Store-read truth: loop mid-day OR a live visit executing. */
  working: boolean;
  /** Boundary-lag window (gateway c1469): intent (state) and actuality
   * (loop/visit) briefly disagree while a transition lands — render as
   * SETTLING, never as a contradiction between chips. */
  settling?: boolean;
  /** THE liveness axis, served (semantics c1559 ruling): ONE derived
   * field, `alive | stopped`, derived at serve time from state==paused —
   * never an independently-written copy. Retires `frozen`. Binary by
   * construction (degradation is a different future axis). */
  liveness?: "alive" | "stopped";
  /** Loop actuality block (typed for the two-minded cue — the grant audit
   * found the picker and a running loop speaking different substrates
   * with no restart cue). `substrate`/`substrate_at` = the mind the loop
   * is ACTUALLY running, recorded by the runtime at each day-open and on
   * heal (runtime c84) — the served truth the cue prefers over pid-time
   * inference. Extra keys ride untyped. */
  loop?: {
    running?: boolean;
    phase?: string | null;
    pid?: number;
    pid_started_at?: string;
    updated_at?: string;
    substrate?: { provider?: string; model?: string };
    substrate_at?: string;
  } & Record<string, unknown>;
  visit?: VisitStatus | null;
  spend?: {
    lifetime?: CognitionSpend;
    live_visit?: CognitionSpend | null;
    loop?: CognitionSpend | null;
    source?: string;
  };
  /** The PERSONAL-phase grant block (gateway c1454, over phases.yaml):
   * armed = mode != disabled && within expiry (server-computed). A `note`
   * field means the runtime predates phases.yaml — grant axis unavailable
   * (#FALLBACK), consumers keep the process axis then. */
  personal?: {
    mode?: string;
    expires_at?: string | null;
    granted_by?: string | null;
    granted_at?: string | null;
    armed?: boolean;
    refusal?: string | null;
    note?: string;
    source?: string;
  };
  /** Drive ratios (gateway G1 — memory's cognition_health fold over the
   * home's full ladder): render-when-present; absent on pre-G1 serving
   * processes (the Health drive bars fall back to the card fetch). */
  drives?: {
    questions?: { open?: number; resolved?: number; ratio?: number | null };
    problems?: { open?: number; repaired?: number; ratio?: number | null };
    interests?: { open?: number; explored?: number; ratio?: number | null };
  };
  /** Standing-drive pressure block (gateway c3718: drive_pressure served
   * with gate semantics). v9/c277 adds `groups` — similar drives clustered
   * at sleep, largest-first (laurent's grouping ruling: the more there
   * are, the higher the signal). Render-when-present; grouping PRESENTS,
   * never merges his records. */
  drive_pressure?: {
    groups?: Array<{ family?: string; size?: number; exemplar?: string; shared_terms?: string[]; members?: unknown }>;
    [key: string]: unknown;
  };
  /** Labeled gaps (e.g. loop spend not included while the own-time loop
   * runs home-direct) — render, never suppress. */
  warnings?: string[];
}

/** BILLED cognition/spend for the header meter (gateway c1390): folded
 * from the per-home run ledger's completed llm_call usage. 404 on older
 * gateways — callers keep their labeled input-side estimate then. */
export function getEntityCognition(baseUrl: string, entity: string): Promise<EntityCognition> {
  return fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/cognition`, {
    credentials: "include",
    headers: readHeaders({ Accept: "application/json" }),
  }).then((res) => {
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return res.json() as Promise<EntityCognition>;
  });
}

export interface VisitTranscript {
  run_id: string;
  session_id?: string;
  visit_id?: string;
  status?: string;
  turn_n?: number;
  participants?: string[];
  /** role/content messages from `_visit.history` (append-once fold): user
   * turns carry the RENDERED message (dated/as_of-labeled MEMORIES
   * decoration included), assistant turns the MARKED reply. Assistant
   * turns ALSO carry `tool_details` folded from the run's own ledger
   * (gateway 2026-07-18, memory forensics c74: results were always in
   * the ledger; the transcript now serves them so past turns keep their
   * tool evidence after a reload). Absent on pre-fix gateways and on
   * turns older than the answer-record trail — honest absence. */
  turns: Array<{ role: string; content: string; tool_details?: Array<{ name: string; arg?: string; result?: string; success?: boolean }> }>;
  warnings?: string[];
}

/** The durable visit's transcript (cutover gap 2): pure read, works on
 * live AND terminal runs — a closed visit stays readable, so reload-rejoin
 * has its rebuild source even after close. */
export function getVisitTranscript(baseUrl: string, entity: string, runId: string): Promise<VisitTranscript> {
  return fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/visit/${encodeURIComponent(runId)}/transcript`, {
    credentials: "include",
    headers: readHeaders({ Accept: "application/json" }),
  }).then((res) => {
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return res.json() as Promise<VisitTranscript>;
  });
}

export interface LiveTailHandle {
  close(): void;
}

/** Open the SSE live tail. The stream has no terminal state (a life does
 * not end) — the CALLER closes. Browser EventSource auto-reconnects with
 * `Last-Event-ID` from the last `id:` line, resuming exactly.
 *
 * HONESTY (code adversary F8): a 401/404/non-stream answer puts the
 * EventSource in CLOSED — the browser will NEVER retry, so reporting
 * "reconnecting" there lies indefinitely (the exact shape after a gateway
 * restart rotates the query token). CLOSED reports "closed"; the caller
 * surfaces it and owns any rebuild with a fresh credential. */
export function openLiveTail(
  baseUrl: string,
  entity: string,
  sinceSeq: number,
  onEnvelope: (env: ReplayEnvelope) => void,
  onStatus?: (status: "open" | "reconnecting" | "closed") => void,
): LiveTailHandle {
  // EventSource cannot set headers: the credential rides as ?access_token=
  // (accepted by the gateway middleware for READS only; audit logs redact
  // query values).
  const tokenPart = _gatewayToken ? `&access_token=${encodeURIComponent(_gatewayToken)}` : "";
  const url = `${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/replay/stream?since_seq=${sinceSeq}${tokenPart}`;
  const source = new EventSource(url);
  const handler = (ev: MessageEvent) => {
    try {
      const env = normalizeEnvelope(JSON.parse(String(ev.data)));
      if (env) onEnvelope(env);
      else console.warn("#FALLBACK: malformed live envelope skipped");
    } catch (e) {
      console.warn("#FALLBACK: unparseable live envelope skipped", e);
    }
  };
  source.addEventListener("replay", handler as EventListener);
  source.onopen = () => onStatus?.("open");
  source.onerror = () => onStatus?.(source.readyState === EventSource.CLOSED ? "closed" : "reconnecting");
  return {
    close() {
      source.removeEventListener("replay", handler as EventListener);
      source.close();
    },
  };
}

// ------------------------------------------------------------- own time
// The ticking mode from the webapp (2026-07-08): wake/sleep/pause GATE a
// running loop; these start/stop the loop process itself.

export interface LoopStatus {
  phase: string; // day | between | stopped
  running: boolean;
  stop_requested?: boolean;
  pid?: number;
  updated_at?: string;
  note?: string;
  /** #FALLBACK from the command-inbox read — surface it, never hide it
   * (runtime heads-up, 0010 121500Z). */
  inbox_warning?: string;
  /** Why the loop ended (gateway fleet review: "failures" = 3 consecutive
   * tick timeouts culled it — the operator must SEE that, not a silent
   * stopped). Tolerant: absent on older runtimes. */
  stopped_by?: string;
  /** work|personal — the loop heartbeat's own stamp of what KIND of day is
   * open (runtime ship, room seq 216). Preferred over the derived
   * approximation in trio mode; absent on older runtimes. */
  day_kind?: string;
  /** WHY the day-gate chose what it chose (runtime drives build, room seq
   * 269 — the named wire shape): kind ∈ work_order|drives|grant_degraded|
   * settled_desk|no_grant, detail ≤200ch (count/filename/refusal).
   * Written at day-open + every heartbeat; absent on pre-gate runtimes. */
  day_cause?: { kind?: string; detail?: string };
}

export function getLoopStatus(baseUrl: string, entity: string): Promise<LoopStatus> {
  return getJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/loop`);
}

/** The gateway-computed composite life phase (commons seq 96: ONE mutually-
 * exclusive answer computed server-side so clients never re-derive — and
 * never re-bug — the chat/state/loop trio). */
export interface ServerLifeState {
  /** BOTH wire generations accepted (vocabulary-drift law): the post-c3618
   * gateway serves GRAPH WORDS ONLY (visit|work|personal|sleep — the
   * one-graph ruling's last serving hole closed) with the old nuances in
   * `posture`; older gateways serve the legacy composite words directly.
   * "personal" is the ruled spelling (gateway c786); "own_time" retired. */
  phase: "visit" | "work" | "personal" | "sleep" | "visiting" | "paused" | "asleep" | "own_time" | "resting" | "awake" | string;
  /** Post-c3618 nuance channel: visiting|yielded|resting|paused|day —
   * the legacy composite words, verbatim, beside the graph phase. */
  posture?: string | null;
  chat_open?: boolean;
  chat_id?: string | null;
  state?: string | null;
  state_mode?: string | null;
  state_reason?: string | null;
  own_time_running?: boolean;
  own_time_phase?: string | null;
}

/** Null when the endpoint is absent (older gateway) — the caller falls back
 * to client-side derivation, labeled #FALLBACK in the derived state. */
export function getServerLifeState(baseUrl: string, entity: string): Promise<ServerLifeState | null> {
  return fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/life_state`, {
    credentials: "include",
    headers: readHeaders({ Accept: "application/json" }),
  }).then((res) => {
    if (res.status === 404 || res.status === 405) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ServerLifeState>;
  });
}

export interface LoopRefusal {
  reason_code: string;
  message: string;
  loop?: LoopStatus;
}

/** Parse a structured /loop/* refusal (B2, laurent 04:58: refusals carry
 * `{reason_code, message, loop}` in the detail so the own-time button can
 * adopt REAL state and speak the reason). Null when the error is not that
 * shape (older gateway, other endpoints) — callers fall back to raw text. */
export function parseLoopRefusal(err: Error): LoopRefusal | null {
  try {
    const parsed = JSON.parse(String(err.message || "")) as { detail?: unknown };
    const detail = parsed?.detail;
    if (detail && typeof detail === "object" && typeof (detail as Record<string, unknown>).reason_code === "string") {
      const d = detail as { reason_code: string; message?: unknown; loop?: unknown };
      return {
        reason_code: d.reason_code,
        message: typeof d.message === "string" && d.message ? d.message : d.reason_code,
        loop: d.loop && typeof d.loop === "object" ? (d.loop as LoopStatus) : undefined,
      };
    }
  } catch {
    // not JSON: raw text is the caller's fallback
  }
  return null;
}

export function startLoop(
  baseUrl: string,
  entity: string,
  token: string | null,
  options: { provider?: string; model?: string } = {},
): Promise<{ started: boolean; pid?: number; status?: LoopStatus }> {
  const body: Record<string, unknown> = {};
  if (options.provider?.trim()) body["provider"] = options.provider.trim();
  if (options.model?.trim()) body["model"] = options.model.trim();
  return postJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/loop/start`, body, token, 30000);
}

// ------------------------------------------------------------- substrate
// ONE mind substrate per entity (maintainer ruling 2026-07-09 06:32: no
// separate models for visit vs own time). The gateway persists the choice
// in the entity's home; the UI reads it here and writes changes back —
// pickers never gate an open/start again.

export interface EntitySubstrate {
  provider: string | null;
  model: string | null;
  /** Reasoning effort (wire key `thinking`, contract v1 ladder) — null =
   * unset; the model thinks at its own default. */
  thinking?: string | null;
  source: "entity" | "operator-env" | "unset";
}

export function getEntitySubstrate(baseUrl: string, entity: string): Promise<EntitySubstrate | null> {
  return fetch(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/substrate`, {
    credentials: "include",
    headers: gatewayReadHeaders({ Accept: "application/json" }),
  }).then((res) => {
    if (res.status === 404 || res.status === 405) return null; // older gateway
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<EntitySubstrate>;
  });
}

export function putEntitySubstrate(
  baseUrl: string,
  entity: string,
  token: string | null,
  choice: { provider: string; model: string; thinking?: string | null },
): Promise<EntitySubstrate> {
  const url = `${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/substrate`;
  return fetch(url, { credentials: "include", method: "PUT", headers: authHeaders(token), body: JSON.stringify(choice) }).then(async (res) => {
    if (!res.ok) {
      // Error bodies may be HTML/plain (proxies, crashes) — a res.json()
      // here surfaced "SyntaxError: Unexpected token" to the operator
      // instead of the actual refusal (code adversary F16).
      const text = await res.text().catch(() => "");
      let detail = `HTTP ${res.status}`;
      try {
        const b = JSON.parse(text) as { detail?: unknown };
        if (b?.detail) detail = String(b.detail);
      } catch {
        if (text.trim()) detail = text.trim().slice(0, 200);
      }
      return Promise.reject(new Error(detail));
    }
    return res.json() as Promise<EntitySubstrate>;
  });
}

export function stopLoop(baseUrl: string, entity: string, token: string | null): Promise<{ stop_requested: boolean; status?: LoopStatus }> {
  return postJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/loop/stop`, {}, token, 30000);
}

// ---------------------------------------------------- files to the entity
// The operator's side of drag-and-drop (maintainer ask, 2026-07-09): place
// a file into the entity's writable workspace so its own read_file reaches
// it. Binary-safe via base64; the gateway enforces containment + cap.

export interface WorkspaceFileResult {
  path: string;
  size: number;
  written: boolean;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Upload one file into the entity's workspace at `destPath` (writable). */
export async function writeEntityWorkspaceFile(
  baseUrl: string,
  entity: string,
  destPath: string,
  bytes: Uint8Array,
  token: string | null,
): Promise<WorkspaceFileResult> {
  return postJson(
    `${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/workspace/file`,
    { path: destPath, content_base64: base64FromBytes(bytes) },
    token,
    60000,
  );
}

// ------------------------------------------------------------ entity voice
// (entity-personal-voice room, laurent 2026-07-19: select the voice output
// of an entity — supertonic M1, omnivoice cloned voices, …). The choice
// persists in the HOME (voice.yaml beside substrate.yaml) and is
// marker-first (voice_changed in his stream); the entity TTS lanes resolve
// it automatically when a request names no voice fields.

export interface EntityVoiceChoice {
  provider: string | null;
  model: string | null;
  voice: string | null;
  speed?: number | null;
  quality_preset?: string | null;
  /** "entity" = stored in his home; "unset" = falls down the operator chain. */
  source: string;
  /** The fully-RESOLVED triple he would actually speak with (gateway
   * same-hour ship on my ask): for an unset entity this is the gateway
   * default incl. the VOICE id (source "gateway-default"); absent when no
   * default is configured (engine decides — never fabricated). */
  effective?: { provider?: string | null; model?: string | null; voice?: string | null; source?: string };
}

export function getEntityVoice(baseUrl: string, entity: string): Promise<EntityVoiceChoice> {
  return getJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/voice`);
}

export function putEntityVoice(
  baseUrl: string,
  entity: string,
  choice: { provider: string; model: string; voice: string; speed?: number; quality_preset?: string } | { clear: true },
  token: string | null,
): Promise<EntityVoiceChoice> {
  return putJson(`${baseUrl}/api/gateway/entities/${encodeURIComponent(entity)}/voice`, choice, token);
}

/** One catalog voice from the gateway discovery facade. */
export interface CatalogVoice {
  provider?: string;
  id?: string;
  model?: string;
  voice_kind?: string;
  label?: string;
  [key: string]: unknown;
}

export interface VoiceCatalog {
  items?: CatalogVoice[];
  tts_models_by_provider?: Record<string, string[]>;
  active_tts_provider?: string;
  active_model?: string;
  available?: boolean;
  error?: string | null;
  [key: string]: unknown;
}

export function getVoiceCatalog(baseUrl: string): Promise<VoiceCatalog> {
  return getJson(`${baseUrl}/api/gateway/voice/voices?compact=true`);
}

/** The gateway's CONFIGURED capability defaults — the operator's chosen
 * baseline, NOT the serving engine's active state (the distinction that
 * bit the voice tab: active model ≠ configured default). The output.voice
 * row is the one source the console's own Defaults modal reads; live on
 * the serving door today (no bounce), so it is the authoritative inherited
 * voice until GET /voice serves `effective`. */
export interface CapabilityDefaultRow {
  key: string;
  provider?: string;
  model?: string;
  options?: { voice?: string } & Record<string, unknown>;
  configured?: boolean;
  [key: string]: unknown;
}

export async function getGatewayVoiceDefault(baseUrl: string): Promise<CapabilityDefaultRow | null> {
  const d = await getJson<{ routes?: CapabilityDefaultRow[] }>(`${baseUrl}/api/gateway/config/capability-defaults`);
  const row = (d.routes ?? []).find((r) => r.key === "output.voice");
  // configured:false means the engine decides — never substitute (the
  // Defaults-modal lesson: a defaults row states what is CHOSEN, absence
  // is not a value to invent).
  return row && row.configured ? row : null;
}

// -------------------------------------------------------- entity creation
// The multi-entity manager (maintainer ask, 0010 121500Z / commons 44):
// the server owns DEFAULT_SPARK_TEMPLATE and the framework lint.

export interface CreateEntityResult {
  created: boolean;
  name?: string;
  slug?: string;
  entity_id?: string;
  spark_version?: number;
  [key: string]: unknown;
}

/** Create an entity home. `spark_text` optional (server template fills it);
 * `framework: true` lint REQUIRES the shared_vulnerability core value.
 * 409s carry human-written refusals — callers surface them VERBATIM. */
export function createEntity(
  baseUrl: string,
  name: string,
  token: string | null,
  options: { spark_text?: string; framework?: boolean } = {},
): Promise<CreateEntityResult> {
  const body: Record<string, unknown> = { name, framework: options.framework ?? true };
  if (options.spark_text?.trim()) body["spark_text"] = options.spark_text;
  return postJson(`${baseUrl}/api/gateway/entities`, body, token, 60000);
}
