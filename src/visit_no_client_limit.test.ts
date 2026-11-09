import { afterEach, describe, expect, it, vi } from "vitest";
import { answerVisit, closeChat, closeVisit, decideVisit, guideVisit, openChat, openMeet, openVisit, postMention, sendChatTurn, sendVisitTurn, setGatewayToken, tickVisit } from "./stream_source";

/** A visit request never fails (operator 2026-11-09, root ADR-0027): the visit lane's calls carry
 * no client limit. The gateway's answer arrives three hours later and is still taken. */
describe("the visit lane has no client time limit", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setGatewayToken(null);
  });

  const calls: Array<[string, () => Promise<unknown>]> = [
    ["visit open", () => openVisit("http://gw", "aletheia", "t")],
    ["visit turn", () => sendVisitTurn("http://gw", "aletheia", "run-1", "hello", "t")],
    ["visit close", () => closeVisit("http://gw", "aletheia", "run-1", "t")],
    ["visit tick", () => tickVisit("http://gw", "aletheia", "run-1", "t")],
    ["chat open", () => openChat("http://gw", "aletheia", "person:admin", "t")],
    ["chat turn", () => sendChatTurn("http://gw", "aletheia", "chat-1", "hello", "t")],
    ["chat close", () => closeChat("http://gw", "aletheia", "chat-1", "t")],
    ["guidance", () => guideVisit("http://gw", "aletheia", "run-1", "look here", "look here", "t")],
    ["answer", () => answerVisit("http://gw", "aletheia", "run-1", { run_id: "run-1", wait_key: "w-1" }, "yes", "t")],
    ["decision", () => decideVisit("http://gw", "aletheia", "run-1", { run_id: "run-1", wait_key: "w-1" }, true, "t")],
    ["mention", () => postMention("http://gw", "s-1", { entity: "aletheia", text: "hi", mention_index: 0 }, "t")],
    ["meet open", () => openMeet("http://gw", "aletheia", "castor", "t")],
  ];

  for (const [label, call] of calls) {
    it(`${label}: waits for the gateway, however long`, async () => {
      vi.useFakeTimers();
      vi.stubGlobal("window", globalThis);
      let signal: AbortSignal | undefined;
      let answer: (r: Response) => void = () => undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn((_url: string, options: RequestInit) => {
          signal = options.signal ?? undefined;
          return new Promise<Response>((resolve) => {
            answer = resolve;
          });
        }),
      );
      const pending = call();
      await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
      expect(signal?.aborted).toBe(false);
      answer(new Response(JSON.stringify({ run_id: "run-1", chat_id: "chat-1" }), { status: 200 }));
      await expect(pending).resolves.toBeTruthy();
    });
  }
});
