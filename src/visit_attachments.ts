/**
 * Files handed to him in a visit turn (2026-11-08, "entities must see attached
 * images like every other client"; the gateway/runtime design is
 * untracked/release-2026-11-07/entity-images/DESIGN.md in the framework root).
 *
 * The contract: a dropped file is written into his workspace first (the
 * workspace write returns its workspace-relative path), then the turn POST
 * carries `attachments: [{path}]` with exactly that path. The door records
 * {path, bytes, sha256, content_type} per attachment; the runtime shows the
 * images to the model with the message and writes one line per attachment
 * into his context, so the app adds no text for images. Other files are
 * recorded and reached by path with read_file; the app keeps one plain line
 * naming them in the words sent.
 *
 * The user turn shows each attachment as a kit chip (name, kind, size). No
 * thumbnail: the chat never loads an image (verbatim_view.tsx NO_IMAGE and
 * words_line.test.tsx), and the gateway serves workspace files as text.
 */
import { formatBytes, type ChatAttachment } from "@abstractframework/panel-chat";

/** One attachment as the door records it (and as the app knows it before the
 * door does: the workspace write's path and size, the browser's type). */
export interface AttachmentRecord {
  path: string;
  bytes?: number;
  sha256?: string;
  content_type?: string;
}

/** A file waiting in the composer: its record plus the name it was dropped
 * with. */
export type PendingFile = AttachmentRecord & { name: string };

/** The door's records as served (the visit history entry's `attachments`,
 * or a stored message's `metadata.attachments`). Entries without a path are
 * not attachments. */
export function attachmentRecords(value: unknown): AttachmentRecord[] {
  if (!Array.isArray(value)) return [];
  const out: AttachmentRecord[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.path !== "string" || !r.path.trim()) continue;
    out.push({
      path: r.path,
      ...(typeof r.bytes === "number" && Number.isFinite(r.bytes) ? { bytes: r.bytes } : {}),
      ...(typeof r.sha256 === "string" && r.sha256 ? { sha256: r.sha256 } : {}),
      ...(typeof r.content_type === "string" && r.content_type ? { content_type: r.content_type } : {}),
    });
  }
  return out;
}

/** An image is shown to him with the message (the door's content type). */
export function isImageAttachment(r: AttachmentRecord): boolean {
  return /^image\//i.test(r.content_type || "");
}

/** The kind a chip names: image, PDF or file. */
export function attachmentKind(r: AttachmentRecord): "image" | "pdf" | "file" {
  if (isImageAttachment(r)) return "image";
  if (/^application\/pdf$/i.test(r.content_type || "")) return "pdf";
  return "file";
}

function leaf(path: string): string {
  return path.split("/").filter(Boolean).pop() || path;
}

/** The user turn's chips: its kind as the chip's tag, then size and name (the
 * size first, so a long name cut at the chip's edge never hides it), the
 * workspace path and exact byte count on hover. */
export function attachmentChips(records: AttachmentRecord[]): ChatAttachment[] {
  return records.map((r) => {
    const size = typeof r.bytes === "number" ? formatBytes(r.bytes) : "";
    const kind = attachmentKind(r);
    const what = kind === "image" ? "an image, shown to him with this message" : kind === "pdf" ? "a PDF, which he opens with read_file" : "a file, which he opens with read_file";
    const exact = typeof r.bytes === "number" ? `, ${r.bytes.toLocaleString("en-US")} bytes` : "";
    return {
      id: r.path,
      target: kind,
      label: size ? `${size} · ${leaf(r.path)}` : leaf(r.path),
      title: `${r.path} in his workspace: ${what}${exact}`,
    };
  });
}

/** The one line naming the files that are not images (the runtime labels
 * images itself); null when every file is an image. */
export function nonImageMention(files: AttachmentRecord[]): string | null {
  const paths = files.filter((f) => !isImageAttachment(f)).map((f) => f.path);
  if (paths.length === 0) return null;
  return paths.length === 1
    ? `I've placed ${paths[0]} in your workspace (read it with read_file).`
    : `I've placed ${paths.length} files in your workspace (read them with read_file): ${paths.join(", ")}`;
}

/** What one visit turn sends: the words (with the non-image line ahead of
 * them) and every file as `{path}`. A turn of images with no words is not
 * sent: the runtime parks a turn whose text is empty
 * (visit_workflow.py route_node), so the image would never reach him. */
export function visitTurnPayload(
  words: string,
  files: PendingFile[],
): { text: string; attachments: Array<{ path: string }> } | { refusal: string } {
  const said = words.trim();
  const mention = nonImageMention(files);
  const text = [mention, said].filter(Boolean).join("\n\n");
  if (!text) {
    return { refusal: files.length > 0 ? "Add a few words with the image. A message with no words is not sent, so the image would not reach him." : "There is nothing to send." };
  }
  return { text, attachments: files.map((f) => ({ path: f.path })) };
}

/** The door refused the turn before it ran (an attachment it cannot take:
 * 404 unknown path, 403 outside the workspace, 400 a directory, 413 over the
 * cap). Returns the gateway's sentence; null for every other failure. */
export function turnRefusal(e: Error & { status?: number }, sentence: (e: Error & { status?: number }) => string): string | null {
  return e.status === 400 || e.status === 403 || e.status === 404 || e.status === 413 ? sentence(e) : null;
}
