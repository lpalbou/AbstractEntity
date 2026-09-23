/**
 * Book reader ordering + redaction honesty (mission item 0059).
 *
 * The reader derives its list purely from the fold's diary nodes. These
 * pin the two properties that matter: chronological order (the self-story
 * as written), and that a REDACTED entry with no readable door is shown as
 * sealed — never reconstructed from another field.
 */
import { describe, expect, it } from "vitest";

import { foldEnvelopes } from "./stream_fold";
import { selectDiaryEntries } from "./book_reader_select";
import type { ReplayEnvelope } from "./stream_types";

let autoSeq = 0;
function env(partial: Partial<ReplayEnvelope> & { family: ReplayEnvelope["family"]; payload: Record<string, unknown> }): ReplayEnvelope {
  autoSeq += 1;
  return {
    stream: "abstractmemory.replay",
    stream_version: 1,
    seq: partial.seq ?? autoSeq,
    observed_at: "2026-07-07T00:00:00+00:00",
    scope: "life",
    owner_id: "entity:test",
    trace_id: null,
    turn_id: null,
    run_id: null,
    ...partial,
  } as ReplayEnvelope;
}

/** A diary binding: gist-visible (entry_id present, not redacted) unless
 * `sealed` is set (redaction mark, no entry_id → words stay sealed). */
function diaryEnv(recordId: string, seq: number, bornAt: string, opts: { title?: string; entryId?: string; sealed?: boolean } = {}): ReplayEnvelope {
  const display: Record<string, unknown> = opts.sealed
    ? { record_id: recordId, kind: "diary", redacted: "diary" }
    : { record_id: recordId, kind: "diary", diary: true, entry_id: opts.entryId ?? `diary_${recordId}`, title: opts.title ?? "an entry" };
  return env({
    family: "binding",
    seq,
    payload: {
      record_id: recordId,
      scope: "life",
      owner_id: "entity:test",
      search_state: "indexed",
      prompt_state: "active",
      lifecycle: "formed",
      source: "election",
      reason: null,
      observed_at: bornAt,
      binding_id: `b-${recordId}`,
      seq,
    },
    observed_at: bornAt,
    display,
  });
}

describe("book reader diary selection", () => {
  it("lists diary entries oldest → newest by born_at", () => {
    const fold = foldEnvelopes([
      diaryEnv("ex:d-b", 1, "2026-07-08T10:00:00+00:00", { title: "second" }),
      diaryEnv("ex:d-a", 2, "2026-07-07T09:00:00+00:00", { title: "first" }),
      diaryEnv("ex:d-c", 3, "2026-07-09T11:00:00+00:00", { title: "third" }),
    ]);
    const entries = selectDiaryEntries(fold);
    expect(entries.map((e) => e.node.title)).toEqual(["first", "second", "third"]);
  });

  it("marks a redacted entry with no readable door as sealed", () => {
    const fold = foldEnvelopes([
      diaryEnv("ex:d-open", 1, "2026-07-07T09:00:00+00:00", { title: "readable" }),
      diaryEnv("ex:d-seal", 2, "2026-07-08T09:00:00+00:00", { sealed: true }),
    ]);
    const entries = selectDiaryEntries(fold);
    const sealed = entries.find((e) => e.sealed);
    const open = entries.find((e) => !e.sealed);
    expect(sealed).toBeTruthy();
    expect(open?.node.title).toBe("readable");
    // The sealed one carries no entry_id, so the reader cannot open it.
    expect(sealed?.node.entry_id ?? null).toBeNull();
  });

  it("excludes non-diary nodes entirely", () => {
    const fold = foldEnvelopes([
      diaryEnv("ex:d-1", 1, "2026-07-07T09:00:00+00:00", { title: "kept" }),
      env({
        family: "binding",
        seq: 2,
        payload: { record_id: "ex:m-1", scope: "life", owner_id: "e", search_state: "indexed", prompt_state: "active", lifecycle: "formed", source: "remember", reason: null, binding_id: "b2", seq: 2 },
        display: { record_id: "ex:m-1", kind: "memory", title: "a memory" },
      }),
    ]);
    const entries = selectDiaryEntries(fold);
    expect(entries.length).toBe(1);
    expect(entries[0].node.title).toBe("kept");
  });
});
