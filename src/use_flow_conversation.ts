/**
 * use_flow_conversation — the drawer's FLOW-BRAIN lane as one hook
 * (fable5 consolidation plan B, executed): conversation state (session,
 * per-conversation evidence, poll generation), the summon/turn drive, the
 * goodbye close, and the queue lane (decision:summon-queue-v1) — moved
 * verbatim from chat_drawer.tsx. The drawer owns pixels + the composer;
 * this hook owns the lane's lifecycle. Injected callbacks (push/setBusy/
 * setDraft) keep the ownership boundary explicit.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

import { flowSession, foldFlowAnswer, foldGoodbyeWords, pollRunToTerminal, queueCardLine, screenDiaryFences, type PollOutcome } from "./flow_lane";
import { getRunSummary, leaveQueue, pollQueueEntry, refusalText, summonEntity } from "./stream_source";
import { toolClaimVerdict } from "./tool_claim_guard";
import type { ReplayEnvelope } from "./stream_types";
import type { DrawerMessage } from "./chat_message_list";

export interface FlowConversationApi {
  flowActive: boolean;
  /** Open the conversation view (resuming a stored unclosed session). */
  startConversation(): void;
  sendFlow(text: string, opts?: { queue?: boolean; park?: boolean }): void;
  endFlowConversation(): void;
  /** Stop waiting on the current poll — the run keeps ticking server-side. */
  stopWaiting(): void;
  /** Dedup a one-time warning for this conversation; true = first time. */
  warnOnce(key: string): boolean;
  queueOffer: string | null;
  acceptQueueOffer(park: boolean): void;
  dismissQueueOffer(): void;
  queueState: { queueId: string; line: string } | null;
  stepAway(): void;
}

export function useFlowConversation(io: {
  baseUrl: string;
  entity: string;
  entityName: string;
  token: string | null;
  push(msg: Omit<DrawerMessage, "id">): void;
  setBusy(b: "idle" | "opening" | "turn" | "closing"): void;
  setDraft(updater: (cur: string) => string): void;
  envelopesRef: React.MutableRefObject<ReplayEnvelope[]>;
  turnStartSeqRef: React.MutableRefObject<number>;
}): FlowConversationApi {
  const { baseUrl, entity, entityName, token, push, setBusy, setDraft, envelopesRef, turnStartSeqRef } = io;
  const [flowActive, setFlowActive] = useState(false);
  const flowSessionRef = useRef<string | null>(null);
  const flowWarnedRef = useRef<Set<string>>(new Set());
  /** F2 (app-half adversary): the fabrication accusation unlocks only
   * after this conversation has SEEN one non-empty tools_ran — proof the
   * flow's fold can write names. Until then a served empty array renders
   * nothing and accuses nobody (structurally-zero-gauge class). */
  const flowToolsProvenRef = useRef(false);
  /** Poll GENERATION token (fable5 finding 1): each poll captures
   * `++pollGenRef.current` and checks it — an abort (stop-waiting click,
   * unmount, a newer poll starting) bumps the generation, and the old
   * loop sees itself stale. Replaces the shared boolean whose reset in a
   * later poll's .then could silently RESURRECT an aborted loop. */
  const pollGenRef = useRef(0);
  /** QUEUE OFFER (decision:summon-queue-v1 §1): a held-seat 409 on the flow
   * lane offers the two buttons; the text waits here for the re-send with
   * queue:true. Cleared on enqueue or new typing. */
  const [queueOffer, setQueueOffer] = useState<string | null>(null);
  /** Live queue entry (wait posture): the card + its 15s poll. */
  const [queueState, setQueueState] = useState<{ queueId: string; line: string } | null>(null);

  // F4: a component death must kill the flow poll — a zombie loop polling
  // a discarded state setter for 10 minutes is not a lane. Generation
  // bump: even a poll whose summon is still in flight sees itself stale
  // (fable5 finding 1 — the old shared boolean could be reset AFTER this
  // ran, resurrecting it).
  useEffect(
    () => () => {
      pollGenRef.current += 1;
    },
    [],
  );

  /** Render one summoned turn's terminal outcome — the ONE fold both the
   * direct summon path and the queue's admitted state ride (contract §4).
   * Failure shapes THROW so each caller's catch owns its wording. */
  const renderFlowOutcome = useCallback(
    async (outcome: PollOutcome, runId: string): Promise<void> => {
      if (outcome.kind === "aborted") {
        push({
          role: "system",
          content: `Stopped waiting (run ${runId.slice(0, 8)}, last seen ${outcome.lastStatus}) — the moment keeps ticking server-side and his memory keeps whatever he lives.`,
          level: "info",
        });
        return;
      }
      if (outcome.kind === "deadline")
        throw new Error(`the summoned turn did not finish within 10 minutes (run ${runId.slice(0, 8)}, last seen ${outcome.lastStatus}) — it may still be ticking; his memory keeps whatever it lived`);
      if (outcome.kind === "lost_view")
        throw new Error("the drawer lost its view of the run (5 poll failures) — the turn may have completed; his memory keeps whatever it lived");
      if (outcome.status !== "completed") throw new Error(String(outcome.error || `run ${outcome.status}`));
      // Tolerant answer fold + the DEGRADED CONTRACT (flow 0.0.2+):
      // structured degraded/moment_error distinguish "he said nothing"
      // from "the turn died" — never parsed from brackets.
      const fold = foldFlowAnswer(outcome.output);
      if (fold.answer === null) {
        push({
          role: "system",
          content: fold.degraded
            ? `The moment could not be lived: ${fold.momentError ?? "unnamed effect failure"}`
            : "The turn completed but served no readable answer — he said nothing this moment.",
          level: fold.degraded ? "warn" : "info",
        });
        return;
      }
      // DIARY-FENCE GUARD (c5342 P0 + fable5 findings 2/3): one shared
      // function at EVERY answer fold; unterminated fences withhold to
      // end-of-string. Post-R1 it can only fire on a leak.
      const screened = screenDiaryFences(fold.answer);
      if (screened.leaked) {
        push({
          role: "system",
          content:
            "He elected a diary entry this moment. This lane cannot yet write his book (the capture fix is in flight) — the words were withheld from your screen because a visitor must never read them, and they were NOT saved. His election was lost; the driver lane writes the book today.",
          level: "warn",
        });
      }
      const answer = screened.display;
      // The present-even-when-zero twin: tool_rounds presence proves the
      // fold ran (adversary F2's option b).
      if (fold.toolRoundsPresent) flowToolsProvenRef.current = true;
      if (fold.degraded) {
        push({
          role: "system",
          content: `⚠ The moment could not be fully lived (flow-brain degraded): ${fold.momentError ?? "unnamed effect failure"}`,
          level: "warn",
        });
      }
      // P0-2 (lane adversary): NO detail object — the flow turn serves no
      // probe payload; a cast-through detail made the modal lie.
      push({ role: "assistant", content: answer, title: entityName });
      // TOOL HONESTY (flow c5285 ask1b): a SERVED tools_ran is
      // authoritative; an ABSENT field stays a blind gauge.
      if (fold.toolsRan !== null) {
        if (fold.toolsRan.length > 0) {
          flowToolsProvenRef.current = true;
          // F5: counts, not a Set — multiplicity IS the evidence.
          const counts = new Map<string, number>();
          for (const t of fold.toolsRan) counts.set(t, (counts.get(t) ?? 0) + 1);
          push({
            role: "system",
            content: `🔧 tools this moment: ${[...counts.entries()].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(", ")}`,
            level: "info",
          });
        } else if (flowToolsProvenRef.current) {
          const verdict = toolClaimVerdict(answer, []);
          if (verdict.fabricated) {
            push({
              role: "system",
              content: `⚠ This reply claims a lookup, but no tools ran this moment — the claimed evidence was not fetched. (${verdict.claims[0]?.snippet ?? ""})`,
              level: "warn",
            });
          }
        }
      }
    },
    [push, entityName],
  );
  const renderFlowOutcomeRef = useRef(renderFlowOutcome);
  renderFlowOutcomeRef.current = renderFlowOutcome;

  /** Drive one summoned run to terminal and render its turn — the queue's
   * admitted state rides this (contract §4: the door executed at
   * admission; the client only follows the run). */
  const driveFlowTurn = useCallback(
    async (runId: string, gen: number) => {
      // Fresh pulse boundary at ADMISSION (pulse adversary F2): the enqueue
      // stamped it minutes ago — everything the current seat-holder lived
      // in between would fold into OUR thinking bars as if it were this
      // turn (their shelf, their tokens, their formed count).
      turnStartSeqRef.current = envelopesRef.current.length > 0 ? envelopesRef.current[envelopesRef.current.length - 1].seq : 0;
      setBusy("turn");
      try {
        const outcome = await pollRunToTerminal(() => getRunSummary(baseUrl, runId), {
          deadlineMs: 600_000,
          aborted: () => pollGenRef.current !== gen,
        });
        await renderFlowOutcomeRef.current(outcome, runId);
      } catch (e) {
        push({ role: "system", content: `The admitted turn failed: ${refusalText(e as Error & { status?: number })}`, level: "error" });
      } finally {
        if (pollGenRef.current === gen) setBusy("idle");
      }
    },
    [baseUrl, push],
  );

  // THE QUEUE POLL (contract §3): 15s cadence while a wait-posture entry
  // stands; quiet card updates on movement, loud line on admission, and
  // the own-time race rendered as the design working (room #12).
  useEffect(() => {
    if (!queueState) return;
    let cancelled = false;
    const tick = () => {
      pollQueueEntry(baseUrl, entity, queueState.queueId)
        .then((q) => {
          if (cancelled) return;
          const st = String(q.state || "queued");
          if (st === "admitted" && q.run_id) {
            setQueueState(null);
            push({ role: "system", content: "The seat is yours — the conversation begins.", level: "info" });
            const gen = ++pollGenRef.current;
            void driveFlowTurn(q.run_id, gen);
            return;
          }
          if (st === "queued") {
            setQueueState((cur) => (cur ? { ...cur, line: queueCardLine(q) } : cur));
            return;
          }
          // Terminal without a run: failed/reaped/stepped_away — say it
          // in the card's own words and stand down.
          setQueueState(null);
          push({ role: "system", content: queueCardLine(q), level: st === "failed" ? "error" : "info" });
        })
        .catch(() => {
          // Transient poll failures keep the card; the door's TTL owns
          // real cleanup (contract §6/§19).
        });
    };
    tick();
    const interval = window.setInterval(tick, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [queueState?.queueId, baseUrl, entity, push, driveFlowTurn]);

  const sendFlow = useCallback(
    (text: string, opts: { queue?: boolean; park?: boolean } = {}) => {
      setBusy("turn");
      // envelopesRef, not the envelopes prop (fable5 finding 8): this
      // callback's identity is stable across the conversation, so the
      // prop closure could be hundreds of envelopes stale and misattribute
      // pre-turn activity to this turn.
      turnStartSeqRef.current = envelopesRef.current.length > 0 ? envelopesRef.current[envelopesRef.current.length - 1].seq : 0;
      // This poll's generation: any abort (stop click, unmount, a newer
      // poll) bumps the token and this loop sees itself stale (finding 1).
      const gen = ++pollGenRef.current;
      if (!flowSessionRef.current) flowSessionRef.current = flowSession.mint(entity);
      // NO substrate override (lane adversary P1-5): the summon resolver
      // ranks request > home substrate.yaml, so a mount-time copy pinned
      // here would defeat a Settings change mid-conversation. The gateway
      // resolves the entity's stored mind — one source.
      summonEntity(
        baseUrl,
        entity,
        {
          prompt: text,
          flow_id: "entity-chat",
          bundle_id: "entity-life",
          session_id: flowSessionRef.current,
          // SERIALIZABILITY (operator order 3, c5330): the conversation
          // state lives server-side — each summon seeds the prior turns
          // of THIS session from the run store (durable-sessions v1),
          // so a reload or another client resumes the same thread. Her
          // memory carries the meaning; the session carries the words.
          input_data: { use_session_history: true },
          // Queue opt-in ONLY from the human's buttons (contract §1) —
          // never sent on a plain send.
          ...(opts.queue ? { queue: true } : {}),
          ...(opts.park ? { park: true } : {}),
        },
        token,
      )
        .then(async (r) => {
          const newWarnings = Array.isArray(r.warnings) ? r.warnings.filter((w) => typeof w === "string" && !flowWarnedRef.current.has(w)) : [];
          if (newWarnings.length > 0) {
            for (const w of newWarnings) flowWarnedRef.current.add(w);
            push({ role: "system", content: `Door notes (labeled degradations): ${newWarnings.join(" · ")}`, level: "info" });
          }
          // QUEUED ADMISSION (contract §2): a 202 carries no run — the
          // entry waits at the door. The park posture is the mailbox: say
          // so and stop; the wait posture arms the queue poll.
          if (r.queued && r.queue_id) {
            setQueueOffer(null);
            if (opts.park) {
              push({
                role: "system",
                content: "Left with her — your message waits at her door and she answers when free; the reply lands in this thread (reopen later if you step out).",
                level: "info",
              });
              setBusy("idle");
              return;
            }
            setQueueState({
              queueId: r.queue_id,
              line: queueCardLine({ state: "queued", position: r.position, current_idle_deadline: r.current_idle_deadline }),
            });
            setBusy("idle");
            return;
          }
          // The summoned run executes async in the runner — poll to
          // terminal via the ONE shared loop (flow_lane.pollRunToTerminal).
          // 600s: tool rounds (entity-life 0.0.10, ≤3 bounded) add 2-3
          // provider calls per turn on top of the lived turn (flow c5285
          // ask1); contended-model turns measured 1-8 min BEFORE tools.
          const outcome = await pollRunToTerminal(() => getRunSummary(baseUrl, r.run_id), {
            deadlineMs: 600_000,
            aborted: () => pollGenRef.current !== gen,
          });
          await renderFlowOutcomeRef.current(outcome, r.run_id);
        })
        .catch((e: Error & { status?: number }) => {
          push({
            role: "system",
            content:
              e.status === 409
                ? `He is mid-moment (the door answered busy) — your words are back in the composer; send again shortly, or use the wait buttons below. (door: ${refusalText(e)})`
                : `The flow-brain turn failed: ${refusalText(e)}`,
            level: "error",
          });
          // A held-seat 409 offers the QUEUE (contract §1: opt-in rides a
          // human's deliberate click, never a silent re-send).
          if (e.status === 409 && !opts.queue) setQueueOffer(text);
          // The failed words come back; the flow session survives (a
          // summon error must never reset the conversation — c5330).
          setDraft((cur) => cur || text);
        })
        .finally(() => {
          // Only the CURRENT generation may release the busy state — a
          // stale chain's finally must not re-enable the composer while a
          // newer poll (e.g. the goodbye) still runs (finding 1's stomp).
          if (pollGenRef.current === gen) setBusy("idle");
        });
    },
    [baseUrl, entity, entityName, token, push],
  );

  /** THE GOODBYE SUMMON (flow c5344, entity-life@0.0.14): ending a
   * flow-brain conversation now runs the REAL close — entity-goodbye
   * folds the session history, writes the deterministic diary note,
   * forms the summary with its edges, and answers in words. Failure
   * ends the view anyway with the truth: every lived moment is already
   * in his memory; only the look-back is owed. */
  const endFlowConversation = useCallback(() => {
    const sessionId = flowSessionRef.current;
    const finish = (line: string, level?: "info" | "warn" | "error") => {
      setFlowActive(false);
      flowSessionRef.current = null;
      flowSession.clear(entity);
      // Per-conversation evidence dies with the conversation (fable5
      // finding 9): the next conversation must not inherit this one's
      // tool-fold proof or its warning dedup — a fresh gateway build
      // after a bounce serves fresh facts.
      flowToolsProvenRef.current = false;
      flowWarnedRef.current = new Set();
      push({ role: "system", content: line, level: level ?? "info" });
    };
    if (!sessionId) {
      finish("Flow-brain conversation ended — nothing was said, nothing to close.");
      return;
    }
    // Fresh pulse boundary for the GOODBYE (pulse adversary F2): without it
    // the last turn's recall/tokens replay in the thinking bars as if the
    // close were re-reading them.
    turnStartSeqRef.current = envelopesRef.current.length > 0 ? envelopesRef.current[envelopesRef.current.length - 1].seq : 0;
    setBusy("turn");
    const gen = ++pollGenRef.current;
    summonEntity(
      baseUrl,
      entity,
      {
        prompt: "goodbye",
        flow_id: "entity-goodbye",
        bundle_id: "entity-life",
        session_id: sessionId,
        input_data: { use_session_history: true, reason: "the visitor ended the conversation from the entity app" },
      },
      token,
    )
      .then(async (r) => {
        const outcome = await pollRunToTerminal(() => getRunSummary(baseUrl, r.run_id), {
          deadlineMs: 180_000,
          aborted: () => pollGenRef.current !== gen,
        });
        if (outcome.kind === "aborted") {
          finish(`Stopped waiting on the close (run ${r.run_id.slice(0, 8)}) — it keeps running server-side; his look-back lands regardless.`);
          return;
        }
        if (outcome.kind === "deadline") {
          finish(`The close did not finish within 3 minutes (run ${r.run_id.slice(0, 8)}) — it may still be running server-side; his look-back lands when it completes.`, "warn");
          return;
        }
        if (outcome.kind === "lost_view") {
          finish("The drawer lost its view of the close (5 poll failures) — it may have completed server-side; his look-back lands with it.", "warn");
          return;
        }
        if (outcome.status !== "completed") {
          finish(`The close failed: ${String(outcome.error || `run ${outcome.status}`)} — the conversation ends anyway; every lived moment is already in his memory.`, "warn");
          return;
        }
        // The goodbye turn is precisely the one that runs elections —
        // its words go through the SAME fence guard as every answer fold
        // (fable5 finding 2: guarding one of two surfaces was not
        // defense-in-depth).
        const words = foldGoodbyeWords(outcome.output);
        if (words === null) {
          finish("The session closed.");
          return;
        }
        const screened = screenDiaryFences(words);
        if (screened.leaked) {
          push({
            role: "system",
            content: "His goodbye elected a diary entry — the words were withheld from your screen (a visitor must never read them); the capture fix is in flight.",
            level: "warn",
          });
        }
        finish(screened.display ? `🚪 ${screened.display}` : "The session closed.");
      })
      .catch((e: Error & { status?: number }) => finish(`The close could not start: ${refusalText(e)} — the conversation ends anyway; every lived moment is already in his memory.`, "warn"))
      .finally(() => {
        if (pollGenRef.current === gen) setBusy("idle");
      });
  }, [baseUrl, entity, push, token]);

  const startConversation = useCallback(() => {
    // Resume the stored session when one survives a reload (flow c5350:
    // the words live server-side; the id is all continuity needs). A
    // goodbye clears it, so a resumed session is always UNCLOSED.
    const stored = flowSession.read(entity);
    flowSessionRef.current = stored;
    setFlowActive(true);
    push({
      role: "system",
      content: stored
        ? `Resuming your flow-brain conversation with ${entityName} — the session's earlier words seed each turn server-side (they aren't re-rendered here); ending it runs his real close.`
        : `Flow-brain conversation with ${entityName} — each message is one summoned visit moment (entity-chat); his memory carries the thread, and ending it runs his real close.`,
      level: "info",
    });
  }, [entity, entityName, push]);

  const stopWaiting = useCallback(() => {
    pollGenRef.current += 1;
    setBusy("idle");
  }, [setBusy]);

  const warnOnce = useCallback((key: string) => {
    if (flowWarnedRef.current.has(key)) return false;
    flowWarnedRef.current.add(key);
    return true;
  }, []);

  const acceptQueueOffer = useCallback(
    (park: boolean) => {
      const text = queueOffer;
      if (!text) return;
      setQueueOffer(null);
      setDraft(() => "");
      sendFlow(text, park ? { queue: true, park: true } : { queue: true });
    },
    [queueOffer, sendFlow, setDraft],
  );

  const dismissQueueOffer = useCallback(() => setQueueOffer(null), []);

  const stepAway = useCallback(() => {
    if (!queueState) return;
    const qid = queueState.queueId;
    setQueueState(null);
    leaveQueue(baseUrl, entity, qid, token)
      .then(() => push({ role: "system", content: "You stepped away from the line.", level: "info" }))
      .catch(() => push({ role: "system", content: "The step-away did not reach the door — its idle reaping will release the place.", level: "warn" }));
  }, [queueState, baseUrl, entity, token, push]);

  return { flowActive, startConversation, sendFlow, endFlowConversation, stopWaiting, warnOnce, queueOffer, acceptQueueOffer, dismissQueueOffer, queueState, stepAway };
}
