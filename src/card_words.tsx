/**
 * The sleep pass's mechanical world-model card, parsed.
 *
 * The sleep pass writes a mechanical card in one fixed shape
 * (abstractmemory world_model._floor_digest):
 *   What I know of <name>:
 *   [Standing feeling: …]
 *   - <date>: <gist of a source, cut at 150 characters>   (newest first)
 *   (from N lived record(s), <first> to <last>, <kinds>. Threads: …. <reminder>)
 * The world-model view reads a revision through this parser: a card in
 * this shape is the evidence floor (no understanding written yet); any
 * other shape is prose he authored.
 */



export interface MechanicalCard {
  name: string;
  feeling: string | null;
  quotes: Array<{ date: string; text: string; cut: boolean }>;
  footer: { count: number; first: string; last: string; kinds: string; threads: string[]; reminder: string } | null;
  footerRaw: string | null;
}

/** The mechanical card's parts, or null when the text has another shape. */
export function parseMechanicalCard(text: string): MechanicalCard | null {
  const lines = String(text || "").split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  const head = lines[0]?.match(/^What I know of (.+):$/);
  if (!head) return null;
  const card: MechanicalCard = { name: head[1], feeling: null, quotes: [], footer: null, footerRaw: null };
  for (const line of lines.slice(1)) {
    const q = line.match(/^- (\d{4}-\d{2}-\d{2}): (.*)$/);
    if (q) {
      card.quotes.push({ date: q[1], text: q[2].replace(/…$/, ""), cut: q[2].endsWith("…") });
    } else if (/^Standing feeling:/.test(line)) {
      card.feeling = line;
    } else if (/^\(from \d+ lived record/.test(line)) {
      card.footerRaw = line;
      const f = line.match(/^\(from (\d+) lived record\(s\), (\S+) to (\S+), ([^.]*)\.(?: Threads: ([^.]*)\.)? (.*)\)$/);
      if (f) {
        card.footer = {
          count: Number(f[1]),
          first: f[2],
          last: f[3],
          kinds: f[4],
          threads: (f[5] ?? "").split(",").map((t) => t.trim()).filter(Boolean),
          reminder: f[6],
        };
      }
    } else {
      return null; // a shape this reader does not know: show the text as written
    }
  }
  return card;
}
