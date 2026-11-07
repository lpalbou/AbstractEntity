/**
 * Surfaces that read the gateway instead of the stream (the card, the
 * header state) follow the live stream (operator 2026-11-07: "I could only
 * see the new information after a refresh").
 */

import { describe, expect, it } from "vitest";

import { cardNeedsRead } from "./identity_card";
import { lastLifeChangeSeq } from "./stream_fold";
import type { ReplayEnvelope } from "./stream_types";

const env = (seq: number, family: string) => ({ seq, family, payload: {} }) as unknown as ReplayEnvelope;

describe("the newest change to the entity", () => {
  it("is the newest memory, feeling, closure or lifecycle marker", () => {
    expect(lastLifeChangeSeq([env(1, "binding"), env(2, "event"), env(3, "valence"), env(4, "trace"), env(5, "snapshot")])).toBe(3);
    expect(lastLifeChangeSeq([env(1, "binding"), env(1.0001, "host"), env(2, "event")])).toBe(1.0001);
    expect(lastLifeChangeSeq([env(7, "closure")])).toBe(7);
  });

  it("recall bookkeeping alone changes nothing", () => {
    expect(lastLifeChangeSeq([env(1, "event"), env(2, "trace"), env(3, "snapshot")])).toBeNull();
    expect(lastLifeChangeSeq([])).toBeNull();
  });
});

describe("the card reads", () => {
  const key = "http://gw|nerin";
  it("on first show, and again when the life moved while shown", () => {
    expect(cardNeedsRead(null, key, null, true)).toBe(true);
    expect(cardNeedsRead({ key, revision: 10 }, key, 10, true)).toBe(false);
    expect(cardNeedsRead({ key, revision: 10 }, key, 12, true)).toBe(true);
  });

  it("never while hidden; catches up once shown", () => {
    expect(cardNeedsRead({ key, revision: 10 }, key, 12, false)).toBe(false);
    expect(cardNeedsRead(null, key, null, false)).toBe(false);
  });

  it("another entity is read afresh", () => {
    expect(cardNeedsRead({ key, revision: 10 }, "http://gw|castor", 10, true)).toBe(true);
  });
});
