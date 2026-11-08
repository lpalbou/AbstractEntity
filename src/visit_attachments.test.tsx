/** Files handed to him in a visit turn (2026-11-08): the turn POST carries
 * `attachments: [{path}]` with the workspace write's path, images get no text
 * preface (the runtime labels them), files that are not images keep one
 * plain line, the user turn shows a kit chip per attachment (no thumbnail,
 * no image loaded), and a door refusal is the gateway's sentence. */
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { avatarVisitHistory } from "./avatar_visit";
import { ChatMessageList } from "./chat_message_list";
import { RefusalLine } from "./mind_voice_settings";
import { refusalText, sendVisitTurn, setGatewayToken } from "./stream_source";
import { attachmentChips, attachmentRecords, nonImageMention, turnRefusal, visitTurnPayload, type PendingFile } from "./visit_attachments";

afterEach(() => {
  vi.unstubAllGlobals();
  setGatewayToken(null);
});

const PNG: PendingFile = { name: "Screenshot 2026-11-08 at 2.48.18 AM.png", path: "shared/Screenshot_2026-11-08_at_2.48.18_AM.png", bytes: 1204113, content_type: "image/png" };
const PDF: PendingFile = { name: "notes.pdf", path: "shared/notes.pdf", bytes: 88201, content_type: "application/pdf" };
const CSV: PendingFile = { name: "data.csv", path: "mounts/lab/data.csv", bytes: 412, content_type: "text/csv" };

/** Record every POST the client makes and answer with `answer`. */
function stubFetch(answer: () => Response): Array<{ url: string; body: Record<string, unknown> }> {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, options: { body: string }) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      return answer();
    }),
  );
  return requests;
}

describe("the visit turn POST", () => {
  it("carries every file as {path} and no text preface for an image", async () => {
    const requests = stubFetch(() => new Response(JSON.stringify({ run_id: "visit-1", status: "waiting", reply: "I see a graph." }), { status: 200 }));
    const payload = visitTurnPayload("what do you see?", [PNG]);
    if ("refusal" in payload) throw new Error(payload.refusal);
    await sendVisitTurn("", "nerin", "visit-1", payload.text, null, "person:laurent", payload.attachments);
    expect(requests).toEqual([
      {
        url: "api/gateway/entities/nerin/visit/visit-1/turn",
        body: { text: "what do you see?", speaker: "person:laurent", attachments: [{ path: "shared/Screenshot_2026-11-08_at_2.48.18_AM.png" }] },
      },
    ]);
  });

  it("keeps one plain line naming the files that are not images, and none for the image", () => {
    const payload = visitTurnPayload("compare these", [PNG, PDF, CSV]);
    if ("refusal" in payload) throw new Error(payload.refusal);
    expect(payload.attachments).toEqual([{ path: PNG.path }, { path: PDF.path }, { path: CSV.path }]);
    expect(payload.text).toBe("I've placed 2 files in your workspace (read them with read_file): shared/notes.pdf, mounts/lab/data.csv\n\ncompare these");
    expect(payload.text).not.toContain(PNG.path);
    expect(payload.text.split("\n\n")[0]).not.toContain("\n");
    expect(nonImageMention([PDF])).toBe("I've placed shared/notes.pdf in your workspace (read it with read_file).");
    expect(nonImageMention([PNG])).toBeNull();
  });

  it("a file alone is a turn (an image with empty text); nothing at all is not", () => {
    expect(visitTurnPayload("", [PDF])).toEqual({ text: "I've placed shared/notes.pdf in your workspace (read it with read_file).", attachments: [{ path: PDF.path }] });
    expect(visitTurnPayload("  ", [PNG])).toEqual({ text: "", attachments: [{ path: PNG.path }] });
    expect(visitTurnPayload("  ", [])).toEqual({ refusal: "There is nothing to send." });
  });

  it("a turn without files sends no attachments field", async () => {
    const requests = stubFetch(() => new Response(JSON.stringify({ run_id: "visit-1", status: "waiting" }), { status: 200 }));
    const payload = visitTurnPayload("hello", []);
    if ("refusal" in payload) throw new Error(payload.refusal);
    await sendVisitTurn("", "nerin", "visit-1", payload.text, null, undefined, payload.attachments);
    expect(requests[0].body).toEqual({ text: "hello" });
  });
});

describe("the attachment chip on a user turn", () => {
  // The visit history entry's attachments as the door records them.
  const stored = {
    role: "user",
    content: "what do you see?",
    metadata: {
      attachments: [
        { path: "shared/Screenshot_2026-11-08_at_2.48.18_AM.png", bytes: 1204113, sha256: "ab12", content_type: "image/png" },
        { path: "shared/notes.pdf", bytes: 88201, sha256: "cd34", content_type: "application/pdf" },
        { bytes: 3 },
      ],
    },
  };

  it("reads the door's records (a record without a path is not an attachment)", () => {
    expect(attachmentRecords(stored.metadata.attachments).map((r) => r.path)).toEqual(["shared/Screenshot_2026-11-08_at_2.48.18_AM.png", "shared/notes.pdf"]);
    expect(attachmentRecords(undefined)).toEqual([]);
  });

  it("shows name, kind and size through the kit card, and loads no image", () => {
    const chips = attachmentChips(attachmentRecords(stored.metadata.attachments));
    const html = renderToStaticMarkup(<ChatMessageList messages={[{ id: "u1", role: "user", content: stored.content, attachments: chips }]} onDetail={() => undefined} />);
    expect(html).toContain('aria-label="Attachments"');
    expect(html).toContain("1.1 MiB · Screenshot_2026-11-08_at_2.48.18_AM.png");
    expect(html).toContain("pc-chat-attachment-target--image");
    expect(html).toContain("86 KiB · notes.pdf");
    expect(html).toContain("pc-chat-attachment-target--pdf");
    expect(html).toContain("shared/Screenshot_2026-11-08_at_2.48.18_AM.png in his workspace: an image, shown to him with this message, 1,204,113 bytes");
    expect(html).not.toContain("<img");
  });

  it("rides into the avatar conversation on the user turn", () => {
    const chips = attachmentChips([PNG]);
    const rows = avatarVisitHistory([{ id: "u1", role: "user", content: "look", attachments: chips }, { id: "a1", role: "assistant", content: "I see it." }], [], "visit-1");
    expect(rows.find((r) => r.role === "user")?.attachments).toEqual(chips);
    expect(rows.find((r) => r.role === "assistant")?.attachments).toBeUndefined();
  });
});

describe("a door refusal", () => {
  it.each([
    [413, "file is 31457280 bytes, over the 20971520-byte workspace cap"],
    [403, "shared/../../secret.png is outside the workspace"],
    [404, "no file at 'shared/gone.png' in the workspace"],
    [400, "'shared' is a directory, not a file"],
  ])("%i is the gateway's own sentence", async (status, sentence) => {
    stubFetch(() => new Response(JSON.stringify({ detail: sentence }), { status }));
    const error = await sendVisitTurn("", "nerin", "visit-1", "look", null, undefined, [{ path: "shared/x.png" }]).then(
      () => null,
      (e: Error & { status?: number }) => e,
    );
    expect(error?.status).toBe(status);
    const refused = turnRefusal(error!, refusalText);
    expect(refused).toBe(sentence);
    const html = renderToStaticMarkup(<RefusalLine text={refused!} tone="error" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(sentence.replace(/'/g, "&#x27;"));
  });

  it("other failures are not refusals (busy seat, gateway error)", () => {
    expect(turnRefusal(Object.assign(new Error("busy"), { status: 409 }), refusalText)).toBeNull();
    expect(turnRefusal(Object.assign(new Error("boom"), { status: 500 }), refusalText)).toBeNull();
    expect(turnRefusal(new Error("network"), refusalText)).toBeNull();
  });
});

describe("the drawer's wiring", () => {
  // The drawer is not rendered in tests (static markup only); its seams are
  // pinned on its source: the turn sends the payload's attachments, no image
  // preface is composed there, and a rejoin reads the door's records.
  const src = readFileSync(resolve(__dirname, "chat_drawer.tsx"), "utf8");
  it("sends the payload's attachments and composes no file preface of its own", () => {
    expect(src).toMatch(/const payload = visitTurnPayload\(words, pendingFiles\);/);
    expect(src).toMatch(/sendVisitTurn\(baseUrl, entity, runId, text, token, speaker, attachments\)/);
    expect(src).not.toMatch(/I've placed/);
  });
  it("names a file by the path the workspace write returned, and rebuilds chips on a rejoin", () => {
    expect(src).toMatch(/path: written\.path/);
    expect(src).toMatch(/attachmentChips\(attachmentRecords\(msg\.attachments\)\)/);
    expect(src).toMatch(/turnRefusal\(e, refusalText\)/);
  });
});
