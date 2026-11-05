import { describe, expect, it, vi } from "vitest";
import { ScoringReads } from "./cognition_reads";
import { CognitionWaveInline } from "./cognition_wave_inline";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe("cognitive monitor reads follow the displayed reply", () => {
  it("A → B → A reattaches to the pending A read without stranding the monitor or accepting B", async () => {
    const reads = new ScoringReads<number>();
    const a = deferred<number>(), b = deferred<number>();
    const loadA = vi.fn(() => a.promise), loadB = vi.fn(() => b.promise);
    const show = vi.fn(), failed = vi.fn();
    const leaveA = reads.subscribe("A", loadA, show, failed);
    leaveA();
    const leaveB = reads.subscribe("B", loadB, show, failed);
    leaveB();
    reads.subscribe("A", loadA, show, failed);
    await settle();
    expect(loadA).toHaveBeenCalledTimes(1);
    b.resolve(20); a.resolve(10); await settle();
    expect(show.mock.calls).toEqual([[10]]);
    expect(failed).not.toHaveBeenCalled();
    expect(reads.get("B")).toBe(20);
    const reload = vi.fn(async () => 99);
    reads.subscribe("B", reload, show, failed); await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(show.mock.calls.at(-1)).toEqual([20]);
  });

  it("a detached error cannot overwrite the displayed read, and a failed read can retry", async () => {
    const reads = new ScoringReads<number>(), first = deferred<number>();
    const receive = vi.fn(), failed = vi.fn();
    const leave = reads.subscribe("reply", () => first.promise, receive, failed);
    await settle(); leave(); first.reject(new Error("temporarily unavailable")); await settle();
    expect(failed).not.toHaveBeenCalled();
    reads.subscribe("reply", async () => 2, receive, failed); await settle();
    expect(receive).toHaveBeenCalledWith(2);
  });

  it("a gateway or entity switch remounts all pin, score and conduct state", () => {
    const props = { baseUrl: "gateway-a", entity: "castor", latestReply: "same words" };
    const first = CognitionWaveInline(props);
    expect(CognitionWaveInline({ ...props, latestReply: "new words" }).key).toBe(first.key);
    expect(CognitionWaveInline({ ...props, entity: "other" }).key).not.toBe(first.key);
    expect(CognitionWaveInline({ ...props, baseUrl: "gateway-b" }).key).not.toBe(first.key);
  });
});
