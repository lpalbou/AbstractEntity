# Durable-visit cutover + reincarnation surfaces (design v5 — cutover SHIPPED)

Status: step 1 (cutover) SHIPPED 2026-07-13 ~12:00; steps 2-3 (R4 labels,
R3 summon-at-T timeline affordance) remain, building per the doc order.

Shipped:

- **Transport half** (`stream_source.ts`): `openVisit` / `sendVisitTurn` /
  `closeVisit` / `tickVisit` / `getVisitStatus` / `getVisitTranscript` +
  `visitBodyProblem` + `isAsleepWakeRefusal` (test-pinned).
- **Drawer flip** (`chat_drawer.tsx`): all door calls on `/visit/*`; probe
  payload renders (gap 1, gateway c1358); rehydrate reads the durable
  transcript (gap 2); body-status rule on turn+close; SteerComposer wired
  on the run_id (H5 403 renders verbatim); TTS scope keys on run id.
- Ship message named `skill` (re-teach obligation) — see c-thread.

Remaining in this repo:

- **R4 re-explore labels** (step 2): historical labeling from structural
  wire flags (session + per-turn context_anchor); memories panel splits
  present-recall from historical-situate.
- **R3 summon-at-T** (step 3 addendum c1282): timeline "visit him as he
  was here" riding the console's server-declared moments +
  CriticalActionDialog contract.

## This app's lanes (build order from the doc §6)

1. **Cutover surgery (step 1)**: `stream_source.ts` + `chat_drawer.tsx`
   swap `/entities/{name}/chat/*` (hosted ChatSession) for `/visit/*`
   (durable run on `runtime_<slug>.sqlite3` in the home). Consumer contract
   carried in doc §5: `run_id` in open/status; probe payload preserved
   (tools_ran, memories born_at/origin, tool_details, system_prompt);
   transcript = run ledger (documented mapping or `/transcript` endpoint);
   body-status rule (HTTP 200 + body `status:failed` renders honestly);
   rejoin flow. The day this lands, the SteerComposer backlog item
   (2026-07-13_steer_composer_on_durable_visits.md) unblocks — run_id
   exists; the H5 consent rite 403 still renders verbatim until H5 is
   designed.
2. **R4 re-explore labels (step 2)**: historical labeling from STRUCTURAL
   WIRE DATA (session + per-turn context_anchor flag) — never prose/client
   inference. Memories panel splits present-recall from historical-situate
   blocks.
3. **R3 summon-at-T from the timeline (step 3 addendum, c1282)**: the app
   offers "visit him as he was here" from the timeline scrub/moments,
   riding the SAME server-declared moments + CriticalActionDialog contract
   as the console picker. One endpoint, two doors. Anchored sessions render
   HISTORICAL in every pixel path from door-authored data; naming law:
   `as_of` = home-journal integer seq + act word, `attributes.anchor_seq`
   + `attributes.anchor_moment` on formed records (R4 only — R3 is
   read-only toward the home).

## Ship-message obligations

- Name `skill` in the flip's ship message (their c1338 ask-free note): the
  curated `abstractframework-gateway` SKILL.md teaches the /chat door and
  must re-teach /visit the day the flip lands — same-day, with fresh byte
  pins. They deliberately do not re-teach before (unshipped-feature rule).

## Held facts

- R3 = READ-ONLY anchored summon (converged c1266/c1267): no writer lease,
  N concurrent anchored summons beside a live present visit (the
  meet-your-past-self room). Transcript persists as an OPERATOR ARTIFACT;
  the present entity's reading of it deposits normally.
- Hosted /chat demotes to labeled legacy at cutover; drawer must stop
  opening it for NEW visits; open hosted sessions close cleanly first.
- Zero migration for living entities; first durable visit mints
  `runtime_<slug>`; 0-byte `runtime.sqlite3` orphans untouched.
