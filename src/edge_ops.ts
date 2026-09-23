/**
 * THE EDGE-OPS EDITING LOGIC (structural-edit build c4837, editor half).
 *
 * Pure module: the component stays thin over tested logic. Three jobs:
 *
 * 1. LABELS — every edge renders one of the three-tier honesty labels
 *    (B's census, mandatory per the build order): a LOOP edge with a live
 *    consult is ENFORCED law; instruction prose is STEERING (offered,
 *    never guaranteed); DOOR/OPERATOR rows are FACTS/ACTS ("editing this
 *    changes nothing — proposal routed to the owner"); overlay additions
 *    with unshipped machinery render PROPOSED. Labels derive from the
 *    ARTIFACT's per-edge law (edit_policy/authority), never a client
 *    table (the fabricated-selection boundary, honored at the pixel).
 *
 * 2. OPS-SET COMPOSITION — the shipped wire is document-ownership: a PUT
 *    carrying `graph` replaces the stored op set WHOLESALE (empty list
 *    clears). So the editor edits the FULL DESIRED SET: stored ops load
 *    from the GET, staged changes fold in, and save sends the whole list.
 *    A delta-shaped save would silently drop every stored op (the exact
 *    class gateway's document-ownership note warns about).
 *
 * 3. CLIENT-SIDE PREVIEW REFUSALS — courtesy only: the artifact's
 *    edit_policy refuses locked targets before a round-trip. The DOOR is
 *    the law (server refusals render verbatim, code + message); a client
 *    check may under-refuse, never over-allow silently.
 */
import type { EdgeOp } from "./stream_source";

export interface SpecTransition {
  from: string;
  to: string;
  cause: string;
  edge_id?: string;
  authority?: string; // loop | door | operator | entity
  edit_policy?: string; // locked | locked-absolute | consultable | consultable-redirect | dial
  edit_policy_reason?: string;
  owner?: string;
  guards?: string[];
  semantics?: string;
}

export function edgeId(t: { from: string; to: string; cause: string }): string {
  return `${t.from}->${t.to}#${t.cause}`;
}

/** The three-tier honesty label for a BASE edge (the build order's
 * mandatory per-element vocabulary; PROPOSED is the overlay-add state and
 * comes from rowState, not from here). */
export function honestyLabel(t: SpecTransition): { tier: "enforced" | "fact" | "act" | "election" | "proposed"; text: string } {
  const auth = String(t.authority ?? "");
  const policy = String(t.edit_policy ?? "");
  if (auth === "door") {
    // P0-2 (editor adversary): edit_policy OUTRANKS authority — the two
    // visit_close restore rows are door-owned AND consultable-redirect
    // (the one legal structural edit both reports converged on). Saying
    // "changes nothing" beside a real redirect lever is the fabricated-
    // selection defect INVERTED.
    if (policy === "consultable-redirect")
      return { tier: "fact", text: "door-owned — the restore-target ORDERING is the one legal consult here: a redirect is real; removal refused (a visit must end somewhere)." };
    return { tier: "fact", text: "door fact — editing this changes nothing; the door writes it. Structural wishes route to the owner as proposals." };
  }
  if (auth === "operator") return { tier: "act", text: "operator act — your click executes above the graph; the edge is its biography vocabulary." };
  if (auth === "entity") return { tier: "election", text: "the entity's own election — a ruled right; removal refused." };
  if (!auth) return { tier: "proposed", text: "your addition — DECLARED law; it fires only where a machine consult reads this cause (the registry names each cause's boundary)." };
  if (policy === "dial") return { tier: "enforced", text: "already operative as a dial — toggle it in the Operator dials section on this page." };
  return { tier: "enforced", text: "loop-consulted law — the machine reads this edge at its decision boundary (runtime interpreter, obedience-pinned)." };
}

export type RowState =
  | { kind: "base" }
  | { kind: "removed" }
  | { kind: "redirected"; to: string; instruction?: string; bound_h?: number }
  | { kind: "added"; instruction?: string; bound_h?: number };

/** Fold the current op set over the structural transitions into render
 * rows. Ops that name unknown edges surface as orphans (the server would
 * refuse them; render honesty demands they be visible, never dropped). */
export function foldRows(
  structural: SpecTransition[],
  ops: EdgeOp[],
): { rows: Array<{ t: SpecTransition; state: RowState }>; orphans: EdgeOp[] } {
  const byId = new Map(structural.map((t) => [edgeId(t), t]));
  const state = new Map<string, RowState>();
  const added: Array<{ t: SpecTransition; state: RowState }> = [];
  const orphans: EdgeOp[] = [];
  for (const op of ops) {
    if (op.op === "remove" && op.edge) {
      if (byId.has(op.edge)) state.set(op.edge, { kind: "removed" });
      else orphans.push(op);
    } else if (op.op === "redirect" && op.edge) {
      const t = byId.get(op.edge);
      if (t && op.to) state.set(op.edge, { kind: "redirected", to: op.to, instruction: op.instruction, bound_h: op.bound_h });
      else orphans.push(op);
    } else if (op.op === "add" && op.from && op.to && op.cause) {
      added.push({
        t: { from: op.from, to: op.to, cause: op.cause, edge_id: edgeId(op as { from: string; to: string; cause: string }) },
        state: { kind: "added", instruction: op.instruction, bound_h: op.bound_h },
      });
    } else {
      orphans.push(op);
    }
  }
  const rows = structural.map((t) => ({ t, state: state.get(edgeId(t)) ?? ({ kind: "base" } as RowState) }));
  return { rows: [...rows, ...added], orphans };
}

/** Compose the FULL desired op list from render-row states (the wholesale
 * document the PUT wants). Base rows contribute nothing. */
export function composeOps(rows: Array<{ t: SpecTransition; state: RowState }>): EdgeOp[] {
  const ops: EdgeOp[] = [];
  for (const { t, state } of rows) {
    const id = t.edge_id ?? edgeId(t);
    if (state.kind === "removed") ops.push({ op: "remove", edge: id });
    else if (state.kind === "redirected") {
      const op: EdgeOp = { op: "redirect", edge: id, to: state.to };
      if (state.instruction) op.instruction = state.instruction;
      if (state.bound_h != null) op.bound_h = state.bound_h;
      ops.push(op);
    } else if (state.kind === "added") {
      const op: EdgeOp = { op: "add", from: t.from, to: t.to, cause: t.cause };
      if (state.instruction) op.instruction = state.instruction;
      if (state.bound_h != null) op.bound_h = state.bound_h;
      ops.push(op);
    }
  }
  return ops;
}

/** Client-side courtesy refusal for an op TARGET (the door is the law;
 * this only saves a round-trip and must never over-allow: unknown
 * policies fall through to the server). Returns null when no local rule
 * refuses. */
export function localRefusal(
  t: SpecTransition | undefined,
  op: "remove" | "redirect",
): string | null {
  if (!t) return null;
  const policy = String(t.edit_policy ?? "");
  if (policy === "locked" || policy === "locked-absolute") {
    return `locked — ${t.edit_policy_reason ?? "this edge's ruling forbids structural edits"}`;
  }
  if (policy === "dial") {
    // P1-5: two levers for one law refuse — the dial owns this edge's
    // activity; a structural removal beside an enabled dial is
    // contradictory law.
    return "this edge's activity is a DIAL (personal_cycle.enabled, in the Operator dials section on this page) — toggle it there; structural removal would mint two levers for one law";
  }
  if (op === "redirect" && policy !== "consultable-redirect" && policy !== "consultable") {
    return `redirect is gated to consultable edges (this row is ${policy || "unclassified"})`;
  }
  return null;
}

/** Add-op preview validation from the artifact's own vocabularies:
 * phases from the closed set, cause must be SHIPPED in the registry
 * (reserved blocks NEW edges — semantics c4857 rule 3), landing in visit
 * refused (derivation supremacy), duplicate identity refused (the c4934
 * add-onto-existing P0). */
export function addPreviewRefusal(
  phases: string[],
  registry: Record<string, { status?: string; class?: string }>,
  existingIds: Set<string>,
  draft: { from: string; to: string; cause: string; instruction?: string; bound_h?: number },
): string | null {
  if (!phases.includes(draft.from) || !phases.includes(draft.to)) return "phases are a closed set — pick from the four";
  if (draft.to === "visit") return "edges may not land in visit — visits are evidence, not elective landings (derivation supremacy)";
  const row = registry[draft.cause];
  if (!row) return `unknown cause — the vocabulary is code; legal causes: ${Object.keys(registry).join(", ")}`;
  if (row.status === "reserved") return `cause '${draft.cause}' is declared but its evaluator is not built (reserved blocks NEW edges — the seat-request path applies)`;
  if (row.class && row.class !== "evaluated_predicate") {
    // P1-4 (editor adversary): a door fact / operator act / entity act is
    // not a machine trigger — an add on it is dead law rendered as
    // it-will-fire. Refuse honestly at the preview.
    return `cause '${draft.cause}' is a ${String(row.class).replace("_", " ")} — no machine consult evaluates it as a new-edge trigger; a new edge on it would be declared-inert`;
  }
  if (existingIds.has(edgeId(draft))) return "an edge with this exact identity exists (even staged-removed — remove+add of one identity is the policy-downgrade class the door refuses); use redirect instead";
  if (draft.instruction && draft.instruction.length > 400) return "instruction exceeds 400 chars (steering is bounded — recall-cue dilution law)";
  if (draft.bound_h != null && (!Number.isFinite(draft.bound_h) || draft.bound_h < 0.01)) return "bound_h must be a finite number ≥ 0.01h (sub-tick promises refuse; transitions land at tick boundaries)";
  return null;
}
