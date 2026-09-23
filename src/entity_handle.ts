/**
 * Entity-handle parsing (operator 2026-07-15): while visiting one entity,
 * mentioning another by its handle — `castor@192.168.1.146` — offers to
 * bring it into a meet. Cross-gateway (`name@another_remote_gateway`) is
 * explicitly NOT handled yet ("one day"); a remote address resolves to an
 * honest "not supported" rather than a silent miss.
 *
 * PURE + testable — no I/O. The chat drawer runs `resolveMentions` over the
 * draft against the roster + this gateway's known local addresses.
 */

export interface ParsedHandle {
  /** The raw match, e.g. "castor@192.168.1.146". */
  raw: string;
  /** The entity name/slug part (before @), lowercased for matching. */
  name: string;
  /** The address part (after @). */
  address: string;
}

/** A handle resolved against the roster + local addresses. */
export interface ResolvedMention {
  raw: string;
  name: string;
  address: string;
  /** "local" = this gateway, an existing OTHER entity → summonable now.
   *  "remote" = a different gateway → not supported yet (honest).
   *  "self" = the entity currently being visited (no-op).
   *  "unknown" = local address but no such entity here. */
  kind: "local" | "remote" | "self" | "unknown";
  /** The resolved entity slug (kind === "local"). */
  slug?: string;
  /** Display name for the affordance (kind === "local"). */
  display?: string;
}

// A handle is `<name>@<address>`; name is a slug-ish token, address is a
// host or ipv4[:port] (no spaces). Deliberately conservative — this fires
// inside a live composer, so it must not match prose "you@home" casually:
// the address must look like a host (dotted or an ip) or a bare hostname
// of ≥2 chars. Matches are lowercased for comparison.
const HANDLE_RE = /\b([a-z][a-z0-9_-]{1,63})@((?:\d{1,3}\.){3}\d{1,3}(?::\d+)?|[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+(?::\d+)?|localhost(?::\d+)?)\b/gi;

/** PURE: every handle-shaped token in a text (deduped by raw, order kept). */
export function parseEntityHandles(text: string): ParsedHandle[] {
  const out: ParsedHandle[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(HANDLE_RE.source, "gi");
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    if (seen.has(raw.toLowerCase())) continue;
    seen.add(raw.toLowerCase());
    out.push({ raw, name: m[1].toLowerCase(), address: m[2].toLowerCase() });
  }
  return out;
}

function hostOf(address: string): string {
  // strip a :port for the address comparison.
  return address.replace(/:\d+$/, "").toLowerCase();
}

/**
 * PURE: resolve parsed handles against the roster + this gateway's local
 * addresses. `localAddresses` = every host that means "this gateway"
 * (lan ip, gateway URL host, 127.0.0.1, localhost, 0.0.0.0). `currentSlug`
 * = the entity being visited (a self-mention is a no-op).
 */
export function resolveMentions(
  text: string,
  roster: Array<{ slug: string; name: string }>,
  localAddresses: string[],
  currentSlug: string,
): ResolvedMention[] {
  const local = new Set(localAddresses.map((a) => hostOf(a)).filter(Boolean));
  const bySlug = new Map(roster.map((e) => [e.slug.toLowerCase(), e] as const));
  const byName = new Map(roster.map((e) => [e.name.toLowerCase(), e] as const));

  return parseEntityHandles(text).map((h): ResolvedMention => {
    const isLocal = local.has(hostOf(h.address));
    const base: ResolvedMention = { raw: h.raw, name: h.name, address: h.address, kind: "unknown" };
    if (!isLocal) return { ...base, kind: "remote" };
    const entity = bySlug.get(h.name) ?? byName.get(h.name);
    if (!entity) return base; // local address, no such entity here
    if (entity.slug.toLowerCase() === currentSlug.toLowerCase()) return { ...base, kind: "self", slug: entity.slug, display: entity.name };
    return { ...base, kind: "local", slug: entity.slug, display: entity.name };
  });
}
