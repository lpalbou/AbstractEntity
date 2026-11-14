/** Confirmed diary elections are separate from belief closures. Pure stream read. */
import type { FoldState, NodeState } from './stream_fold';

export function resolvedDiaryTargets(fold: FoldState): Map<string, NodeState> {
  // Book ids belong to an owner. Legacy projections can live in diary/life/self;
  // an ambiguous alias stays unresolved until an explicit graph id disambiguates it.
  const graph = new Map<string, Set<NodeState>>(), book = new Map<string, Set<NodeState>>();
  const key = (owner:string, id:string) => JSON.stringify([owner,id]);
  const add = (index:Map<string,Set<NodeState>>, owner:string, id:string|null|undefined, node:NodeState) => {
    if (!id) return;
    const alias=key(owner,id), candidates=index.get(alias) || new Set<NodeState>();
    candidates.add(node); index.set(alias,candidates);
  };
  for (const node of fold.nodes.values()) {
    if (!node.owner_id || !node.diary || !['question','problem'].includes(node.diary_type || '')) continue;
    add(graph,node.owner_id,node.id,node); add(graph,node.owner_id,node.graph_id,node);
    add(book,node.owner_id,node.entry_id,node);
  }
  const resolved = new Map<string, NodeState>();
  for (const answer of fold.nodes.values()) {
    if (!answer.owner_id || !answer.diary || !['resolved_open_question','repaired_open_problem'].includes(answer.resolves_status || '')) continue;
    const alias = key(answer.owner_id, answer.resolves || '');
    const fallback = new Set([...(graph.get(alias) || []), ...(book.get(alias) || [])]);
    const candidates = answer.resolved_record_id ? graph.get(key(answer.owner_id, answer.resolved_record_id)) : fallback;
    if (!candidates || candidates.size !== 1) continue;
    const question = candidates.values().next().value as NodeState;
    if (question.id === answer.id) continue;
    if ((question.diary_type === 'question') !== (answer.resolves_status === 'resolved_open_question')) continue;
    if (!resolved.has(question.id)) resolved.set(question.id, answer);
  }
  return resolved;
}
