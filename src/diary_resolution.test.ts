import { describe, expect, it } from 'vitest';
import { foldEnvelopes, type NodeState } from './stream_fold';
import { lensIds } from './graph_lenses';
import { resolvedDiaryTargets } from './diary_resolution';
import type { ReplayEnvelope } from './stream_types';

function binding(seq:number, id:string, display:object): ReplayEnvelope {
  return {stream:'abstractmemory.replay',stream_version:1,seq,family:'binding',observed_at:'2026-11-14T00:00:00Z',scope:'diary',owner_id:'entity:a',trace_id:null,turn_id:null,run_id:null,
    payload:{record_id:id,scope:'diary',owner_id:'entity:a',search_state:'indexed',prompt_state:'inactive',lifecycle:'none',source:'remember'},
    display:{kind:'diary',diary:true,...display}} as ReplayEnvelope;
}
const temporal = {records:new Map(),pairs:new Map(),config:{}} as any;

describe('confirmed diary resolution',()=>{
  for (const targetFirst of [true,false]) it(`folds either arrival order (${targetFirst}) without fabricating a closure`,()=>{
    const q=binding(targetFirst?1:2,'ex:q',{entry_id:'diary_q',diary_type:'question',title:'Question'});
    const a=binding(targetFirst?2:1,'ex:a',{entry_id:'diary_a',diary_type:'note',resolves:'diary_q',resolves_status:'resolved_open_question',resolved_record_id:'ex:q'});
    const stream=[q,a].sort((l,r)=>l.seq-r.seq);
    const fold=foldEnvelopes(stream);
    expect(lensIds(fold,temporal,'questions')).toEqual(new Set());
    expect(resolvedDiaryTargets(fold).get('ex:q')?.id).toBe('ex:a');
    expect(fold.nodes.get('ex:q')?.closed).toBeNull();
    expect(foldEnvelopes([stream[0],stream[0],stream[1]]).nodes.size).toBe(2);
    const prefix=foldEnvelopes(stream,1);
    if(targetFirst) expect(lensIds(prefix,temporal,'questions')).toEqual(new Set(['ex:q']));
  });
  it('does not hide refused or unverified claims and matches book ids when graph projection is absent',()=>{
    const q=binding(1,'ex:q',{entry_id:'diary_q',diary_type:'question'});
    const refused=binding(2,'ex:a',{entry_id:'diary_a',resolves:'diary_q',resolves_status:'target_not_found',resolved_record_id:'ex:q'});
    expect(lensIds(foldEnvelopes([q,refused]),temporal,'questions')).toEqual(new Set(['ex:q']));
    const confirmed=binding(3,'ex:a',{entry_id:'diary_a',resolves:'diary_q',resolves_status:'resolved_open_question'});
    expect(lensIds(foldEnvelopes([q,confirmed]),temporal,'questions')).toEqual(new Set());
  });
  it('keeps typed redacted replay content-free and does not treat another owner as its resolver',()=>{
    // Redacted exports of typed public/legacy entries. Actual private projections
    // omit their type and remain generic notes, outside the Questions lens.
    const q=binding(1,'ex:q',{entry_id:'diary_q',diary_type:'question',redacted:'diary'});
    const a=binding(2,'ex:a',{entry_id:'diary_a',resolves:'diary_q',resolves_status:'resolved_open_question',redacted:'diary'});
    const fold=foldEnvelopes([q,a]);
    expect(resolvedDiaryTargets(fold).get('ex:q')?.id).toBe('ex:a');
    expect(fold.nodes.get('ex:q')?.title).not.toContain('private');
    (fold.nodes.get('ex:a') as NodeState).owner_id='entity:other';
    expect(resolvedDiaryTargets(fold).size).toBe(0);
  });
});

it('retains resolution metadata when a usage row and binding graph node merge late',()=>{
  const question=binding(1,'ex:q',{entry_id:'diary_q',diary_type:'question'});
  const answer=binding(2,'ex:a',{entry_id:'diary_a',diary_type:'note',resolves:'diary_q',resolves_status:'resolved_open_question'});
  const event=(seq:number,display:object): ReplayEnvelope=>({...question,seq,family:'event',payload:{kind:'selected',record_id:'row-a',scope:'diary',owner_id:'entity:a'},display} as ReplayEnvelope);
  const folded=foldEnvelopes([question,answer,event(3,{}),event(4,{graph_id:'ex:a'})]);
  expect(folded.nodes.get('row-a')?.resolves_status).toBe('resolved_open_question');
  expect(resolvedDiaryTargets(folded).get('ex:q')?.id).toBe('row-a');
  expect(lensIds(folded,temporal,'questions')).toEqual(new Set());
});

it('partitions book aliases by known owner, refusing unknown and ambiguous identity',()=>{
  const q=binding(1,'ex:q',{entry_id:'same-book-id',diary_type:'question'});
  const other=binding(2,'ex:other',{entry_id:'same-book-id',diary_type:'question'});
  (other.payload as any).owner_id='entity:b';
  const a=binding(3,'ex:a',{entry_id:'answer',resolves:'same-book-id',resolves_status:'resolved_open_question'});
  const folded=foldEnvelopes([q,other,a]);
  expect(resolvedDiaryTargets(folded).get('ex:q')?.id).toBe('ex:a');
  expect(resolvedDiaryTargets(folded).has('ex:other')).toBe(false);
  folded.nodes.get('ex:a')!.owner_id=''; folded.nodes.get('ex:q')!.owner_id='';
  expect(resolvedDiaryTargets(folded).size).toBe(0);
  const duplicate=binding(2,'ex:duplicate',{entry_id:'same-book-id',diary_type:'question'});
  (duplicate.payload as any).scope='self';
  const ambiguous=foldEnvelopes([q,duplicate,a]);
  expect(resolvedDiaryTargets(ambiguous).size).toBe(0);
  ambiguous.nodes.get('ex:a')!.resolved_record_id='ex:q';
  expect(resolvedDiaryTargets(ambiguous).get('ex:q')?.id).toBe('ex:a');
});

it('keeps historical scope joins through graph identity, with confirmed problem types only',()=>{
  const problem=binding(1,'ex:p',{entry_id:'problem',diary_type:'problem'});
  (problem.payload as any).scope='life';
  const a=binding(2,'ex:a',{resolves:'problem',resolves_status:'repaired_open_problem',resolved_record_id:'ex:p'});
  const fold=foldEnvelopes([problem,a]);
  expect(resolvedDiaryTargets(fold).get('ex:p')?.id).toBe('ex:a');
  fold.nodes.get('ex:a')!.resolves_status='resolved_open_question';
  expect(resolvedDiaryTargets(fold).size).toBe(0);
});
