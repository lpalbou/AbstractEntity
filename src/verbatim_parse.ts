/**
 * Verbatim parsing shared by the Detail card and the world-model sources
 * (moved out of inspector.tsx so both can import it without a cycle).
 */

/** One speaker turn inside an exchange verbatim. */
export interface VerbatimTurn {
  speaker: string;
  text: string;
}

/** Parse an exchange verbatim ("person:admin:\n…\n\nEphemeral:\n…") into
 * labeled turns. STRICT speaker recognition (laurent dm#54 pt5: the
 * interlocutor belongs in metadata, not scrolling text): a line is a
 * speaker head only when the WHOLE line is `X:` where X is a namespaced
 * identity (person:/entity:/agent:…), the entity's own name
 * (case-insensitive), or the door — prose headers like "Note:" never
 * split. Returns null when the text doesn't open with a speaker head
 * (diary entries, born-digest words): the caller renders plain text. */
/** The semantics-blessed inner-speech section marker (framework c3313/
 * c3318): runtime appends "(thinking, unspoken)" to the turn verbatim at
 * the three formation sites, byte-identical forever. Split the spoken
 * verbatim from his unspoken reasoning so the render treats them
 * distinctly — say-vs-think honesty: his private reasoning must never read
 * as something he said aloud. Absent marker = no thinking section (pre-ship
 * verbatims and substrates that return no reasoning pass through whole). */
const UNSPOKEN_MARKER = "(thinking, unspoken)";

export function splitUnspokenThinking(raw: string): { spoken: string; thinking: string | null } {
  const text = String(raw || "");
  // The marker sits on its own line (a labeled section head). Match at a
  // line boundary so the literal string inside prose never false-splits.
  const idx = text.search(/(^|\n)\s*\(thinking, unspoken\)\s*(\n|$)/);
  if (idx < 0) return { spoken: text, thinking: null };
  const markerStart = text.indexOf(UNSPOKEN_MARKER, idx);
  const spoken = text.slice(0, markerStart).replace(/\n+$/, "");
  const thinking = text.slice(markerStart + UNSPOKEN_MARKER.length).replace(/^\n+/, "").trim();
  return { spoken, thinking: thinking || null };
}

export function parseVerbatimTurns(raw: string, entityName: string): VerbatimTurn[] | null {
  const lines = String(raw || "").split("\n");
  const name = entityName.trim().toLowerCase();
  const isSpeakerHead = (line: string): string | null => {
    const m = line.match(/^(\S+|\S+ \(while looking things up\)|\(the door\)):\s*$/);
    if (!m) return null;
    const head = m[1];
    const bare = head.replace(/ \(while looking things up\)$/, "");
    if (/^[a-z0-9_-]+:[\w.@-]+$/i.test(bare)) return head; // namespaced identity
    if (bare.toLowerCase() === name) return head; // the entity itself
    if (bare === "(the door)") return head;
    return null;
  };
  const turns: VerbatimTurn[] = [];
  let current: VerbatimTurn | null = null;
  for (let i = 0; i < lines.length; i++) {
    const head = isSpeakerHead(lines[i]);
    // A head mid-text only counts at a paragraph boundary (prev empty).
    if (head && (current === null || i === 0 || lines[i - 1].trim() === "")) {
      if (current) turns.push({ ...current, text: current.text.trim() });
      current = { speaker: head, text: "" };
      continue;
    }
    if (current === null) {
      if (lines[i].trim()) return null; // words before any speaker → not an exchange
      continue;
    }
    current.text += (current.text ? "\n" : "") + lines[i];
  }
  if (current) turns.push({ ...current, text: current.text.trim() });
  return turns.length > 0 ? turns : null;
}

/** One exchange as the runtime writes it (abstractruntime identity/chat.py,
 * turn formation): what was said to him, then his thinking rounds ("<name>
 * (thinking, unspoken):", each optionally followed by "(what the tools
 * returned:)"), then his answer under "<name>:" — always last. Tool results
 * can quote older exchanges with the same heads, so only the order is
 * trusted: the first head opens the cue, the LAST "<name>:" head at a
 * paragraph boundary opens the answer, and everything between is one block
 * of thinking and lookups. Null when the text is not shaped that way. */
export interface Exchange {
  cueSpeaker: string;
  cue: string;
  between: string | null;
  answerSpeaker: string;
  answer: string;
}

export function parseExchange(raw: string, entityName: string): Exchange | null {
  const lines = String(raw || "").split("\n");
  const name = entityName.trim().toLowerCase();
  const first = lines[0]?.match(/^(\S+):\s*$/);
  if (!first || first[1].toLowerCase() === name) return null;
  let answerAt = -1;
  for (let i = lines.length - 1; i > 0; i--) {
    if (lines[i].trim().toLowerCase() === `${name}:` && lines[i - 1].trim() === "") {
      answerAt = i;
      break;
    }
  }
  if (answerAt < 0) return null;
  let betweenAt = -1;
  for (let i = 1; i < answerAt; i++) {
    if (lines[i].trim().toLowerCase() === `${name} (thinking, unspoken):` && lines[i - 1].trim() === "") {
      betweenAt = i;
      break;
    }
  }
  const cueEnd = betweenAt >= 0 ? betweenAt : answerAt;
  return {
    cueSpeaker: first[1],
    cue: lines.slice(1, cueEnd).join("\n").trim(),
    between: betweenAt >= 0 ? lines.slice(betweenAt, answerAt).join("\n").trim() : null,
    answerSpeaker: lines[answerAt].trim().replace(/:$/, ""),
    answer: lines.slice(answerAt + 1).join("\n").trim(),
  };
}
