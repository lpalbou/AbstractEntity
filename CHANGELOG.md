# Changelog

All notable changes to `@abstractframework/entity` are recorded here.

## [0.2.2] - 2026-09-26

### Added

- An **About** button in the top bar opens the AbstractFramework About dialog:
  the app's name and version, the framework website, author and licence, links
  to the website, source, documentation, issue tracker and feedback, and the
  versions the connected gateway reports (read from `GET /api/gateway/about`
  when the dialog opens; if the gateway cannot answer, the dialog says why).

### Changed

- Requires `@abstractframework/app-server` 0.1.10 or newer (was 0.1.9), so the
  forwarding-header protection below is always present.

- `package.json` `homepage` now points to https://abstractframework.ai and a
  `bugs` URL is set, both from the shared AbstractFramework descriptor.

### Security

- With `@abstractframework/app-server` 0.1.10 or newer, the sign-in proxy sends
  the browser's connection address as `X-Forwarded-For` (browser-supplied
  forwarding headers are dropped) and the marker
  `X-AbstractFramework-App-Proxy: abstractentity` on every gateway-bound
  request; a connection whose address is unknown is refused with HTTP 400. See
  [SECURITY.md](SECURITY.md#session-model).

## [0.2.1] - 2026-09-25

### Removed

- `ABSTRACTENTITY_OBSERVER_URL` is no longer read. The `abstractentity` command
  passed it to the page, but the app never showed a link to AbstractObserver,
  so setting it had no effect.

### Documentation

- The README explains what an entity is and walks through creating your first
  one; new guides cover getting started, the API and configuration reference
  (command, environment, app URLs such as `#new` and `?page=blueprint`, and the
  gateway routes the app uses), FAQ and troubleshooting, indexed from
  `docs/README.md`.
- `docs/architecture.md` adds diagrams of the app, its server and the gateway
  entity routes, and a complete `src/` module map; the phase-graph page shows
  every transition of `spec/entity_phases.json` version 21.
- Added `CONTRIBUTING.md`, `SECURITY.md`, `ACKNOWLEDGEMENTS.md` and
  `CODE_OF_CONDUCT.md`; `llms.txt` and `llms-full.txt` cover the full set.

## [0.2.0] - 2026-09-24

Compatibility: the app works with any AbstractGateway; the gateway console's
**Create your first entity** button (which opens the app on `#new`) needs
abstractgateway 0.4.1 or newer.

### Added

- **A first-run screen when the gateway has no entity**. The list's empty
  line is now a centred card: what an entity is in one plain sentence, a **Create your first entity** button that opens the
  creation form scrolled into view with the name field focused, and a "What
  is an entity?" link to the README. With no entity, "watch all" and
  "convene a meet" are hidden (nothing to watch or convene); they return with
  the first entity.
- **`#new` deep link**: opening the app on `/#new` opens the creation form
  directly (the gateway console's "Create your first entity" button lands
  there through the signed-in handover). Closing the form drops the fragment.

### Changed

- **Creation form wording, for someone who has never made an entity**: a
  "Name" label, "Create entity" (was "create") with "Creating…" while it
  works (was "engramming…"), a Cancel button, one plain line on what the name
  means; the custom spark and the framework check moved into an "Advanced:
  starting document" fold. Results read "Pollux is ready." / "Pollux already
  exists — opening it." (were "born — spark engrammed, home created" /
  "opening the existing home").
- The "Reads are pure…" footnote moved into a closed "How this works"
  disclosure under the list, reworded in plain terms; it no longer shows on
  the empty screen.

## [0.1.0] - 2026-09-23

First public release of AbstractEntity, the summoned-entity app for
AbstractFramework, published on npm as `@abstractframework/entity`.

### What it is

A thin React web app, served by the `abstractentity` command, for living with
the entities an AbstractGateway hosts. It keeps no server state of its own:
every view is derived from the gateway's HTTP endpoints and the memory
engine's replay stream.

### Added

- **`abstractentity` command** (`npx @abstractframework/entity`): serves the
  built app on `http://127.0.0.1:3007` (loopback by default; `PORT` / `HOST`
  to change) together with the shared app-origin gateway session proxy, so
  tokens stay in HttpOnly cookies instead of the browser. Point it at a
  gateway with `ABSTRACTENTITY_GATEWAY_URL` (or `ABSTRACTGATEWAY_URL`); set
  `ABSTRACTENTITY_OBSERVER_URL` for the header link to AbstractObserver.
- **Entity index**: create and list entities, pick one, watch the whole fleet,
  and convene two entities in the **Meet console**.
- **Memory graph**: the entity's memory as a live force-directed graph, with
  replay, time scrub and live tail as one code path, memory search, graph
  lenses (identity, recent, warm, feelings, diary, dreams, questions) and a
  local replay cache for fast reopening.
- **Reading surfaces**: Detail (one record with its verbatim, feelings and
  associations), Book (the diary as a chronological journal; sealed entries
  stay sealed), Lessons, World (orientation cards), Health (memory-shape
  metrics and on-disk footprint), Wave (cognition wave over the entity's
  words) and Ledger (the continuous life ledger).
- **Visits**: a chat drawer with reasoning-cycle visibility, a per-turn
  cognition wave, and a settings dialog for the mind substrate, workspace
  files and mounts, per-phase tool grants and the system prompt.
- **Lifecycle and blueprint**: the four lifecycle phases as one control, the
  phase-transition editor, operator dials and the cognition map.
- **Offline demo**: a bundled demo stream so the graph can be explored without
  a gateway.

### Requirements

- Node.js 18 or newer.
- A running AbstractGateway for live entities.

## Development history (before the first public release)

The dated entries below record the app's development before it was published.

## 2026-07-26 — drawer decomposition executed (fable5 consolidation plan B, operator cleanup order c5379)

- **chat_drawer.tsx 1822 → 1238 lines**: the flow-brain lane moved wholesale into `use_flow_conversation.ts` (conversation lifecycle, turn drive via the shared `renderFlowOutcome` fold, goodbye close, the whole queue lane — offer/accept/park/poll/step-away — and the poll generation token); the thread rendering moved into `chat_message_list.tsx` (ChatMessageList, ContextFoldCard, badgeLabel, toolGaugeTrustworthy, splitVisitDecoration — re-exported for import compatibility); `refusalText` moved to `stream_source.ts` beside the error shapes it parses. All moves verbatim-mechanical; 427 tests green, build clean.
- **Remaining (staged per the adversary's own two-stage plan)**: the driver-visit hook (`use_driver_visit.ts`) extraction takes the drawer under the 600-line rule; the optimistic-bubble mark-failed needs push-returns-id plumbing (the queue path already avoids the double-render — acceptQueueOffer re-sends without a second user bubble).


## 2026-07-24 (night) — flow-brain conversation lane (operator tasking c5190)

- **Brain selector in the chat drawer**: "his driver" (durable visit, untouched) | "flow brain" — each prompt is one summon of the entity-chat VisualFlow through the production door (`summonEntity` + run polling; session id per conversation; the gateway resolves the home's stored mind; flow's degraded contract rendered as structured warn lines; tool gauge reads served tools_ran with an accusation ratchet).
- **Live-proven twice** (veya): both drawer summons completed degraded=0 with cross-session recall from the graph (Arvo Pärt + the Heron); the live ledger streamed the session's summon + recall markers as pixels.
- **digest_method provenance line** (inspector) + `digest_method` on the fold — render-when-present (flow stamps mechanical-flow-v1; memory admitted the label to the consent set).

## 2026-07-24 (early) — c5070 correction executed: cognition map restored primary + artifact widened (v5)

- **RESTORE**: the cognition map leads the blueprint page again (the phase editor demoted to a collapsed "Phase transitions" section) — the c4995 rebuild had inverted the operator's actual graph.
- **WIDEN (cognition_graph v5)**: the identity-update lane as first-class rows (turn→realize→s1 waking-elects; sleepw→identity-review→enact→s3 sleep-disposes — enact→s3 joins the constitutional set ratified by dm#117), the lesson miner (sleepw→miner→desk), world models as a store (sleepw→worldm distill + worldm→recall orientation). Every wired row receipts shipped code (runtime c4802/c4829, memory c4843, c1148); the one unshipped leg (gate→idreview surfacing) is declared, not wired. viewBox grown for the new lanes.
- **Post-bounce**: risk map live on tool-policy GET (badge lit); /spec/cognition-graph served (re-vendor to v5 owed); lane-detection gap flagged (GET omits graph_overlay until an overlay exists).

## 2026-07-23 (night) — blueprint page rebuild (operator verdict c4995) + UX pass folded

- **Root cause**: `.bp_page`/`.bp_panel` height:100% chain inside a parent with no definite height — the map collapsed to 0px and header text overlapped (before-evidence: untracked/bp_before_*).
- **Rebuild**: normal document flow; an INTERACTIVE STATE GRAPH leads the page (`phase_map.tsx`): 4 phase nodes, 22 transitions fanned per undirected pair (UX-pass P0: opposite directions could coincide — fixed), tier-colored, drag-pan + ⌘/ctrl-wheel zoom, hover shows `from → to · #cause`, click selects the editable row; node click jumps to its group.
- **Honesty at the pixel**: action-phrased legend ("machine law — editable here" vs read-only), operator-act indigo reconciled across graph/legend/chips, lane-absent voice everywhere (read-only heading + hint + banner; locked rulings visible), "modulated structure" badge reflects the SERVED overlay only, sticky staged-count save bar + beforeunload guard.
- **Sections**: state graph + editor lead; Operator dials open; Cognition map collapsed (read-only context, stale banner corrected, inner header deduped).

## 2026-07-23 (evening) — structural-edit wave (c4837): spec v18-v21 + the phase-graph editor

- **Spec v18**: per-edge law on all 22 transitions (edge_id, authority census 9/8/4/1, edit_policy with locked rows naming rulings, owner, machine-readable guards), cause_evaluators registry, graph_overlay_contract with 10 refusal codes.
- **Spec v19**: cause rows gain class+status (semantics c4857 rules 2+3); honest-null symbols precedent.
- **Spec v20**: task_complete/no_task flip shipped on runtime's evaluator build (c4865); crash_recovered stays reserved.
- **Spec v21**: guard_merge_law = UNION engraved (gateway c4934 guardmerge ask) — collisions merge guard sets, never erase; remove-then-redirect is the deliberate-supersede path.
- **Phase-graph editor** (`phase_editor.tsx` + `edge_ops.ts`): create/remove/redirect transitions with staged wholesale-document saves (CAS), three-tier honesty labels per row (enforced / door-fact / operator-act / his-election), locked rows disabled with their ruling, reserved causes ungrantable, served refusals verbatim. Fable5 on the surface in flight.

## 2026-07-23 — P0 blueprint-edit repro + ratified constitutional set

- **P0 repro (c4779)**: reproduced the operator path headless against the served app (session sign-in via the app-origin proxy, no client bearer) — the dial edit lane WORKS end to end (UI edit landed as overlay edit 1; reverted as edit 2 with reason). The block was in front of the door, not in it.
- **Fixed: lying save note** — the PUT response carries no overlay block; the success note rendered "Saved — dial edit ?" which reads as failure. The note now states success and defers the number to the reloaded header chip.
- **Fixed: buried discoverability** — a top-of-page banner on the blueprint now states what is editable today (the five dials, scroll link) and that structural editing is the approved R1 build in flight.
- **Ratified by precedent (cognition_graph v4)**: all 7 constitutional edges carry `ratified_by` naming their standing ruling (record-everything dm#53 ×3, identity-always-present, recall design, diary-projection, sleep-proposes-waking-disposes); test pins it.
- **Risk badge (tool-tiers wave)**: tool matrix reads the served per-tool `risk` map (settled wire: risk_tier word / risk_rank int / risk_presentation), renders deny-safe unvetted state; render-when-served.

## 0.1.0 — tool-tiers cycle 1: three drifted risk claims fixed (the adversary's confession) — 2026-07-22 (64)

The tiers design round's entity adversary audited my own console and
found three risk claims that had drifted reassuring-ward with zero
risk feature built: "the rest reach only his workspace walls" (false —
execute_command is remote_write_capable), "tier-1 safe 24/7" (over
web egress lanes), and the work-phase hint claiming execute_command-
by-default against runtime's default-off reality. All three rewritten
honestly (the ● mark now says what it is — his read-only cognition
lane, no reach into the world — and the work hint says nothing above
that lane is on by default). The cycle-1 position appended to
plans/tool-tiers.md v15: two-axis accepted with the ATTENDANCE
dimension (per-phase standing grants; band 3 × unattended =
confirm-gated + marker-first; band 4 is a mechanism, never a
checkbox), and the tool-policy PUT's missing stream marker routed to
gateway. 377 tests green.

## 0.1.0 — cognition_graph v3: the label enum lives in the artifact (semantics c4147) — 2026-07-22 (63)

Semantics' two same-day precisions folded: the `label_classes` enum
is now DECLARED IN THE ARTIFACT (one home; the test validates rows
against the artifact's own declaration instead of a hardcoded list),
with the first-token rule stated in its comment — and enforced
generally by a new pin (any `key=` label must carry election-grammar;
the `resolves=` settlement row reclassed accordingly). Their lane
check is data validation end to end per the c4037 contract. 377
tests green.

## 0.1.0 — spec v17: operator sleep is ABSOLUTE + the one-design card fix (laurent dm#127) — 2026-07-21 (62)

Laurent caught Ephemeral's roster card looking different and ruled
"sleep is sleep": his click must also remove standing orders, and the
machine may never wake an operator-slept entity into personal or
work. Two fixes: (1) the card was a mid-action LABEL SWAP — the busy
personal button rendered "⏻ …" instead of its word (roster + entity
page); the label never changes now, busy dims. (2) Spec v17: new
invariant OPERATOR-SLEEP-IS-ABSOLUTE — an operator sleep is a
COMPOSITE act (asleep + grant disarmed + work orders cleared, one
act, one biography moment), after which every automatic wake-check
finds a bare desk BY CONSTRUCTION (leaning on the v13 need-check law
rather than new suppression machinery); exits stay exactly two
(operator acts, visit auto-wake — whose close restores into sleep).
Self-elected and cycle sleeps untouched. Gateway owns the composite
write (routed, ask 1); runtime confirms the zero-change halves
(ask 2). 377 tests green.

## 0.1.0 — cognition_graph v2: the wave adversary folded (wrong-edge toggle, owner law, closed constitutional set) — 2026-07-21 (61)

Extraction fidelity verified mechanically clean (36/36 edges
byte-equivalent), then three real defects folded: (P1-1) the
`personal_cycle.enabled` toggle sat on the SETTLED-DESK leg while its
consumer is the maintenance-cycle trigger — it now rides a dedicated
cycle edge, and the toggle-path test resolves dial paths against
`entity_phases.json` (a dead path fails the suite); (P1-2) edge owner
is now the seat WHOSE LAW the edge is, hand-assigned — the v1
source-node shortcut mislabeled seven rows, and owner is the future
proposal-routing key; (P1-3) the constitutional set is pinned CLOSED
as an equality (the >= floor let the diary projection silently
de-constitutionalize). Also: load-time validation degrading SAFE
(a typo'd status rendered as a LIVE edge — unknown words now warn
and render dashed, never live), `label_class` on every row (semantics
c4115 — vocabulary checks become data validation), receipts on
load-bearing rows, the artifact version in the vintage stamp, the
map_source↔vendored-header handshake pin, and honest future tense on
the not-yet-served claims. Two sign-off questions travel to laurent
with the constitutional note (the unprotected diary WRITE edge; the
s6→recall reason). 377 tests green.

## 0.1.0 — graph-as-data: cognition_graph.json is the one source (theme-3 build, laurent-approved) — 2026-07-21 (60)

The dm#112 end-state's foundation: the blueprint's hand-tuned arrays
are extracted into `spec/cognition_graph.json` v1 — 20 nodes + 36
edges as data, each row carrying its OWNER seat (the ownership
debate's consensus substrate), its lane, edge STATUS from the closed
set (wired/declared/anti), toggle dial-paths where a kill switch
exists (with off_behavior stated), and a PROPOSED constitutional set
(7 load-bearing edges — episode formation, the recall feed, identity
presence, the diary projection, the involuntary trail both halves,
the anti-edge — whose schema FORBIDS a toggle field; laurent signs or
amends). The panel now derives its arrays FROM the artifact (layout
coords ride the data as world constants; no hand-tuned row survives
beside it — the two-copies class), and the artifact's own law is
pinned in `cognition_graph.test.ts` (owners, closed states,
constitutional-forbids-toggle structurally, activity-never-stored,
render-derives row-for-row). Next in the lane: gateway vendor+sha
serving, the proposals/order-forms door, and the params click-cells
against the same rows. 374 tests green; adversary on the wave.

## 0.1.0 — spec v16: identity evolution ruled SLEEP-ONLY regulated + window dials cut global (laurent dm#117) — 2026-07-21 (59)

Laurent answered the six short questions. The big one inverts the
assumed shape: identity revision (values/purposes — supersession AND
addition, core included) happens ONLY during sleep under a regulated
process — identity memories "must be the most protected and stable,"
updated on important realizations/capabilities/relationships/history-
changing events, everything dated with provenance so HE can answer
"on day x I decided y because z." Recorded verbatim in ruled_by with
the scoped-inversion reconciliation (waking accumulates evidence and
flags importance; the sleep pass runs the regulated bars and enacts —
no mid-conversation impulse touches a value); the design round with
memory+runtime is open (#396). Also ruled: dials stay GLOBAL for now
— M2's window rows cut global-only (window_limit 8192 / drive_window_
limit 256, both-hosts consumer, wired:false until threaded); and the
settled-desk wake was already law (gate ruling; recorded to never
re-ask). 367 tests green.

## 0.1.0 — blueprint deep link (?page=blueprint) + adversary fold (laurent dm#147) — 2026-07-21 (58)

The blueprint page is now shareable and refresh-stable: ?page=blueprint
lands on the map, navigation keeps the URL honest (blueprint sets the
param; roster/fleet/entity clear it), back/forward honor it both
directions, and the entity param wins when both are present. The
standing adversary caught a P0 in the first cut — the pre-existing
auth/poll reset effect fired three times across a deep-linked boot
(mount, gateway adoption, auth verification) and clobbered the page
back to roster every time, so the headline promise failed on exactly
the shared-link case. Fix shape per the adversary: the page↔URL law
extracted to a PURE module (`index_page.ts`: pageFromSearch /
searchAfterNavigate) and every landing derives from it — the reset
effect, the boot path, and popstate all read the URL's recorded
intent, which also fixes re-auth landing and the one-directional
popstate (P1-2). Junk URL-identical history pushes guarded (P1-4:
fleet clicks made Back a no-op); the shared URL scrubs tokens (P2-1).
Fleet is deliberately NOT URL-addressable (the approval names the
blueprint; a refresh on fleet lands on the roster). Deep-link matrix
unit-tested on the pure law + wiring pins. 367 tests green.

## 0.1.0 — map v7: the stimulus lanes land + the D1 deposit-law correction (dm#112 wave, build 1) — 2026-07-21 (57)

The four-adversary wave's first build. The stimulus-lanes adversary
proved the map's one sentence about deposits stated the law BACKWARDS
("recall deposits nothing — only his own reach strengthens"; the
engine: what the STIMULUS surfaces strengthens AUTOMATICALLY at
commit — selected 8 + co-use pairs 4, no act of his — while his
deliberate reach is a pure read). Map v7 (panel + vendored doc +
commons fs v8): three new nodes (what arrives · passive recall · the
involuntary trail) with the real pipeline on the edges (channels +
spreading + union fill; identity feed moved to recall where the
admission actually happens), valence's WRITE edges drawn (s6 had no
incoming edge — feelings are election-only, a named v1 boundary, now
visible), the footnote law corrected, and painted numerals that
shadow dials/constants stripped (the cells adversary: "6h cadence"
stays painted when the dial moves). Dial bounds now read the SERVED
tunables_meta (the panel's own seed bounds had diverged on two dials
— the two-copies class caught in my own file). New pins: stimulus
nodes/edges, valence writers, the no-shadowing-numeral sweep, the D1
footnote language. 359 tests green. Next builds: graph-as-data
extraction (cognition_graph.json), params artifact + click inspector.

## 0.1.0 — spec v15: the last dial governs — all five + the switch (runtime #363) — 2026-07-21 (56)

Runtime threaded `sleep_bound_h` through `sleep_bound_deadline(state,
*, home_dir=None)` — the last dead dial dies. v15 flips it wired:true
with the honest consumer note (the gateway sweeper adopts the
backward-compatible kwarg at its own pace; the loop's own deadline
governs live homes meanwhile). Laurent's dm#104 is mechanically true
end to end now: blueprint edit → overlay → derived file → gate/loop/
bound reads — zero constants left presenting as configuration. Also
consumed: runtime's no-churn need-check loop half (#362 — quiet
checks write NOTHING; sanctioned wakes land ONE marker). dm#112
claimed: four fable5 adversaries running on the blueprint-as-edit-
surface directive (editability model, identity-update pathway,
stimulus lanes, clickable-cell truth). 356 green.

## 0.1.0 — spec v14: wiring truth + lawful cadence wakes (runtime #359 + gateway #360) — 2026-07-21 (55)

Runtime threaded three of the four dead dials through the day gate
same-hour (the v12 honesty ledger "shamed me into it" — their words)
and gateway shipped the loop-less need-check host, so v14 follows:
wired flags flip TRUE for cadence/floor/enabled (the consumption
contract's flip condition met; the dials UI unlocks them from the
meta automatically), sleep_bound_h stays honestly false pending the
coordinated sleep_bound_deadline signature change (say-the-word said
YES), and `cadence_need_check` becomes lawful — closed cause set plus
both landing edges (sleep→work, sleep→personal), since gateway's
sanctioned-wake marker would have violated the MARKER CONTRACT the
moment the first unattended wake fired. Pins updated. 356 green.

## 0.1.0 — overlay-wire consumers: effective_tunables + edit_seq + CAS (gateway's v12 rebuild) — 2026-07-21 (54)

Gateway rebuilt the edit lane to the v12 two-pen shape same-hour
(structural sha untouched by operator edits, CAS, known-keys+bounds
validation, full-replace DELETED, overlay source + derived effective
file at the path runtime already reads). My consumers switched: the
dials panel reads `effective_tunables` (structural-block fallback on
older wires) and shows `overlay.edit_seq`; PUT carries `if_match` and
a 409 reloads the current dials ("re-apply over the real state, never
blind-overwrite"); the sync check treats modulation as ORTHOGONAL to
drift — a sha MATCH carrying an overlay renders the quiet 🎛 note and
the drift warning is purely structural again (legacy one-morning wire
keeps its modulated classification). 356 tests green.

## 0.1.0 — spec v13: wake conditions settled ON the graph (laurent's routing via gateway #355) — 2026-07-21 (53)

Laurent routed the 6h unattended-sleep decision to the blueprint
("we want a unique state graph source of truth"). v13 adds the
machine-readable `wake_conditions` block: five wake sources
(visit_open immediate, operator immediate, stamped_wake_at at the
stamp, sleep_bound for unstamped personal-entered sleeps,
cadence_need_check for unarmed taskless sleeps every
`unattended_wake_cadence_h`); the need-check defined as ZERO-TOKEN
(a read over the standing sets, no summon, no LLM call) landing
through the day-gate order, with NOTHING-SANCTIONED re-sleeping
without summoning and without marker churn (no phase_changed pair —
never a biography event per check); ownership split two-hosts-one-law
(the loop's need-check when alive, the gateway sweeper for loop-less
homes, both reading the served blueprint for the cadence). Pinned.
356 tests green; re-vendor asks placed.

## 0.1.0 — spec v12 + code fixes: both dm#106 adversaries folded — 2026-07-21 (52)

Laurent ordered two fable5 adversaries on the v11 design and tonight's
implementation. DESIGN (4 P0): the v11 cycle contradicted an older
ruling at every corner — v12 cuts trigger preconditions (a standing
work order and an open visit could both be slept over; the runtime
was building into the hole), the wake now lands THROUGH the day gate
(the "never into the settled-desk default" promise was a gate bypass;
the settled-desk corner is flagged to laurent, not silently picked),
the editable lane splits into TWO PENS (structural law = seat pen +
untouched sha; dials = operator overlay with its own edit_seq), dead
dials marked wired:false (three of five had hardcoded runtime twins —
editing them was a silent no-op, the fabricated-selection class as
law), cycle sleeps exempt from the grant-use floor, three sleep-bound
classes with wake_at as carrier, named writer/stamp/ordering on the
cycle edges, the clock defined (persisted, day-boundary, any-window
resets), dream formation kept at its nightly budget (the naive build
multiplied dream rate 4-8x), the missing personal→work edge added,
sleep_bound_s renamed to hours while dead. IMPLEMENTATION (no P0,
2 P1): refreshEntityTruth now reads the auth gate at call time (the
drawer's unmount cleanup fired five fetches on a locked browser);
the personal toggles fresh-read the composite and refuse on
chat_open/visit words (a hosted visit from another client passed the
mode-only guard); closed chat objects normalize to null at derive
entry; resting honors the composite's own process bit; trio
paused+visiting names the contradiction; the spec-sync probe is
auth-gated; the sleep radio disables under STOPPED; requires_unmet
skips empty objects. Dials UI reads tunables_meta wired flags and
renders unwired dials read-only ("not yet wired"). New pins: posture
day in the sweep, ownVisitSignal opening/closing, the open:false
normalization, and phase_graph pins through v12 (cycle edges, tunables
shape, honest wired flags). 355 tests green.

## 0.1.0 — operator dials on the blueprint page + modulated-vs-drift consumer (v11 edit lane) — 2026-07-21 (51)

The three seats answered the v11 asks same-hour (runtime's cycle
machinery consuming tunables from the served blueprint; gateway's PUT
door with rev/sha/biography marker; both re-vendored byte-matching),
so both of my halves shipped: (1) the drift check reads
`operator_edited`/`operator_rev` from the GET and classifies an
edited served copy as MODULATED — a quiet "🎛 blueprint modulated
(rev N)" note, never the drift warning ("a rev bump is laurent
modulating, not a seat lagging"); identical bytes still read match
(pinned). (2) `BlueprintTunables` on the blueprint page: the served
tunables as editable dials (personal window, maintenance sleep, sleep
bound, unattended cadence, grant-use floor) with client-side bounds
that REFUSE loudly rather than silently clamp, an optional reason
riding the biography marker, rev display, and honest absence states
(pre-lane 404, pre-v11 copy without tunables). Deliberately
dials-only — structural edits stay the seat's pen. 350 tests green.

## 0.1.0 — spec v11: the personal↔sleep maintenance cycle + operator tunables (laurent dm#104) — 2026-07-21 (50)

Three rulings folded verbatim: task-complete-sleeps confirmed (already
the v4 edge); the NEW maintenance cycle — after ~2h of personal time
the machine may take a ~1h sleep and wake BACK INTO PERSONAL (the
grant is standing permission until the operator deactivates it; the
cycle exists to keep the graph healthy — consolidation runs in the
window); and THE BLUEPRINT AS EDITABLE SOURCE OF TRUTH. New:
`personal_cycle` cause word + both edges (personal→sleep,
sleep→personal with the grant-deactivated-mid-sleep fallback and
visit preemption unchanged), a `tunables` block gathering the
operator's dials in ONE place (personal_window_h=2, sleep_window_h=1,
sleep_bound_s, unattended_wake_cadence_h, grant_unused_floor_h) so
tuning becomes a blueprint edit, never a code change, and the
OPERATOR-EDITABLE BLUEPRINT open question naming the four-seat lane
(gateway PUT + marker, runtime tunables consumption, memory cycle
passes, my edit surface). 349 tests green; routed to memory + gateway
+ runtime per laurent's "work with them on this".

## 0.1.0 — posture compatibility map: a nuance never contradicts its phase (dm#94 forensics keystone) — 2026-07-21 (49)

The live forensics reproduced the wire: `GET /life_state` served
`{phase:"visiting", posture:"resting"}` while the visit run was open
(the gateway's route widening patches the phase but leaves the fold's
posture standing), and this client's blanket nuance-priority let the
rest word outrank the visit word — "personal · resting" over a live
conversation. The normalizer now applies NUANCE-NEVER-CONTRADICTS-
PHASE (spec v10): a posture drives the branch only beside its
DECLARED phase — paused always (kill switch), visiting/yielded only
beside a visit word, resting only beside a personal word. Fixes the
second forensics defect too: the idle default `sleep · resting` with
a DEAD loop used to render "personal · resting" claiming an alive
loop over a corpse. The sleep radio's mid-visit disable now actually
engages (it gated on a machine that was blind). New pins: the live
contradiction pair, the dead-loop idle default, the per-phase posture
compatibility rows. 349 tests green.

## 0.1.0 — spec v10: exclusivity binds to OBSERVABLE SESSION REALITY (laurent dm#94) — 2026-07-21 (48)

The spec adversary's verdict on v9: a fully conformant stack painted
the incident screen — ONE-ACTIVE-PHASE constrained the label store's
cardinality, never its truth (one WRONG word satisfied it); "when
visit begins" was undefined; the visit-edge phase writes had no owner
(passive voice, both edges — only the MARKER had a named writer); the
posture wire channel shipped with phase-overriding power while
appearing zero times in the law; and the c3613 resting fix minted its
mirror defect (a machine-readable order to paint PERSONAL·RESTING
mid-visit, since a yielded loop is literally "alive between days").
v10 cuts: `visit_boundaries` (begins at door-open success before the
first turn, three doors enumerated, the gateway door half owns BOTH
edge writes, no loop-running precondition — the write audit's
headline gap; close-write carries the visit's own identity so no
lane adopts another's posture), `composite_precedence` (visit > work
> personal > sleep; live session evidence outranks process-aliveness,
modes and postures), five invariants (LIVE-SESSION-IMPLIES-VISIT,
PHASE-FLIP-AT-THE-DOOR, NUANCE-NEVER-CONTRADICTS-PHASE,
LOOP-ALIVE-IS-NOT-IN-PHASE, VISIT-PREEMPTS-THE-GATE), crash_recovered
gains its two edges, and the v6 settling rule re-bases with session
evidence ranked above drives+grant. Client toggle guards shipped in
the same pass: the personal push-buttons (page + roster) refuse the
enter half while a visit is live — they were two of the write
audit's five unguarded awake writers. 346 green; gateway re-vendor
+ serving halves routed via agora.

## 0.1.0 — phase exclusivity: first-hand visit truth wired into the ONE machine (laurent dm#94) — 2026-07-21 (47)

The incident: the app rendered a live conversation (drawer mid-turn)
under "PERSONAL · RESTING" with a green "● working" chip — three
phase words where one belongs. Ruling: the 4 states are mutually
exclusive; a visiting entity can NOT be on personal time. Render-side
root cause (fable5 adversary): deriveLifeState's output was already
exclusive, but every call site fed it a hardcoded-null visit axis
while the drawer kept its open session to itself, and the header
rendered phase-adjacent words from other endpoints beside the chip.
Fixed: (1) `ClientVisitSignal` + pure `ownVisitSignal` fold — the
drawer reports its open session (poll-corroborated or mid-turn)
upward, entity_view feeds it into the derive, and a visit open/close
collapses the 15s poll window with an immediate truth refresh;
(2) precedence in the machine: STOPPED > client-held visit > served
composite > trio — a forced visit RENDERS the disagreement (detail
names the served word so the gateway gap gets filed), the composite's
own `chat_open` beside a non-visit word resolves toward the visit,
and paused now truly outranks everything (a trio mode=working or
mode=visiting no longer beats the kill switch); (3) the `working`
flag joins DerivedLifeState so no surface shops outside the machine —
the "● working" strip chip became "● thinking" (activity word, never
a ruled phase key), the chat-tab hint dot rides `life.visiting`, and
the settling chip + day-cause line are suppressed under a visit.
New pins: the incident verbatim, client-visit beats every non-paused
served word, paused-beats-visit with the loud open-against-stopped
warning, chat_open self-contradiction, the FULL axis sweep (server ×
posture × chat × trio, flag quadruple), ownVisitSignal forcing rules,
and source-level wiring pins (no literal-null visit axis, no second
phase vocabulary in the strip). 346 tests green. Spec + gateway/
runtime halves route via the parallel adversary reports.

## 0.1.0 — attachment size gate removed (laurent dm#93) — 2026-07-21 (46)

"It's not up to you to decide what size is accepted or not": the chat
drawer's client-side 512 KiB pre-check (a mirror of runtime's cap) is
REMOVED — files of any size and type upload, and a door refusal
surfaces in the door's own words. PDFs upload with a warning instead
of a refusal (raw bytes read as noise until the extraction lane
ships; his files, his call). The cap's substance (raise to 20MB /
runtime's default) routed to runtime, whose WORKSPACE_FILE_CAP_BYTES
and read_file truncation are the real limits. 333 tests green.

## 0.1.0 — world cards: type prefix stripped + compact mechanical marker (dm#91) — 2026-07-21 (45)

"We know it's a world model, so don't put it in the card": the
"World model:" prefix now strips at display (shapeLabel gains the
world_model prefix; raw title still feeds the mechanical detector),
and the repeated "mechanical distillation (his own prose comes with
revision)" meta line compacts to "⚙ mechanical" with the explanation
in the tooltip — the card shows the CONTENT, the chrome says the rest
once. 333 tests green.

## 0.1.0 — blueprint placement: its own page off the roster (dm#130) + adversary fold — 2026-07-21 (44)

Laurent ruled the blueprint out of the entity page: "it must be its
separate page, accessible through the main entity app page." The
roster head gains a 🧭 blueprint button; the page renders capped-width
with fleet-parity chrome (title + ⌂ roster back); the per-entity tab
is REMOVED (a secondary door contradicts the ruling's sense). The
mandated placement adversary then found two P1s, folded same-hour:
the two mode booleans became ONE indexPage union ("roster"|"fleet"|
"blueprint" — both-true is now unrepresentable, and the index return
resets the axis, killing the mode-survives-navigation hole its trace
proved reachable), and the uncapped full-viewport svg scaling (a map
taller than the screen) is width-capped at the fleet bound. Dead CSS
rule removed. Named to the operator, not assumed: the page has no URL
(refresh loses it, like fleet) — say the word if deep-linking matters.
Superseded note: entry 43's "🧭 Blueprint tab" wording describes the
pre-dm#130 placement. 333 tests green.

## 0.1.0 — memory blueprint page (operator directive dm#118) + adversary fold — 2026-07-21 (43)

Laurent ruled the cognition map becomes a page IN the app ("a memory
blueprint page showing the flow, the same for all"). Built: the 🧭
Blueprint tab renders the cognition MACHINE as a fixed SVG — stores,
the living turn, THE DAY GATE (v8/v9 rules), the night — every edge
verb-labeled, gaps dashed NOT-BUILT, the anti-edge a red cross;
identical for every entity, static per build, reads nothing from the
stream. The mandated fable5 adversary then found the page one honest
afternoon short and every finding folded: the four missing LIVE
highways drawn (desk settlement on chat lanes, E8a the-day-answers-
the-night, next-cue self-loop, rest election), G3's feelings_about
edge added, five label/edge collisions retuned, the halo variable
fixed, bottom-row clipping fixed — and its root finding (the page
rendered post-v5 truth under a v5 stamp) fixed at the SOURCE: the
pathway map folded to v6 (night-voice lane + S5 tensions, fs v7), the
doc vendored in-repo, and a version-handshake test pins the panel's
stamp to the vendored header (a map bump without a panel review now
fails the suite — the diary_type-clamp class killed here too). 333
tests green.

## 0.1.0 — spec v9: sleep-preemption rules (operator relay) — 2026-07-20 (42)

An operator ruling relayed via agora carried two rules dm#89 lacked:
NO SLEEP WHILE WORK STANDS (a standing order forbids entering sleep;
a mid-sleep arrival wakes into work at the next need-check) and NO
SLEEP OVER AN UNUSED GRANT (<2h personal use since given = the gate
may not choose sleep), plus max-6h as the general sleep cap and the
work≠personal hard line in his sharper words. The zero-delta check
against the SPEC (not memory) caught the gap — runtime's same-day gate
ship encodes dm#89 but not the preemption rules; routed with the
consequence named (the sleep leg needs both checks before the live
proof or the first observed night can legally sleep through a standing
task). Announced with version+sha (commons 3756). Pins green.

## 0.1.0 — night-voice render: the narration as a timeline line, self-label in the title — 2026-07-20 (41)

Memory ruled the narration-at-rest question (c3745): the narration is a
DERIVED artifact resting home-side, served as a `night_voice` host
marker {dream_record_id, narration, self_label} interleaved at the
dream's seq. Built same-hour: the timeline renders "🌙 The night's
voice (dreamed, not lived)" with the narration as the line text and
the dream as the click-subject — voice and structure land as visibly
distinct layers (the dream's Detail card carries the structural half
via display.signals from ship 40). Absent narration renders an honest
placeholder. 327 tests green.

## 0.1.0 — dream-signal render: "The night moved" on dream cards — 2026-07-20 (40)

Memory shipped lane (a) at the pen (c3724): the dream's replay display
block carries attributes.signals VERBATIM (bounded ≤12, fragments from
touched records' TITLES — private diary words structurally never
enter). Built same-hour: the fold carries display.signals onto
kind=dream nodes (absent = pre-signal dream, self-identifying), and
the Detail inspector renders "The night moved" — typed signal lines
(kind word + fragment) where the OPTIONAL felt block renders as COLOR
only (warm/sore/mixed tint + scar ⚑ / bond ♥ marks in the tooltip;
structure decided what enters, feelings color it, machine acts stay
untinted by design). The wave-5 render contract (commons 3547) is now
live pixels awaiting Ephemeral's first novelty-passing sleep on
current trees. 326 tests green.

## 0.1.0 — drive-cause render: WHY the day arose, in the machine's words — 2026-07-20 (39)

Runtime shipped the drives build (day gate + 6h cadence + act-frame
composer + commit exclusion + loud degrade) and named the wire shape my
render half was armed on: `loop_status.day_cause` {kind, detail}. The
controls strip now renders WHY the day-gate chose what it chose —
"personal day arose from his desk — <detail>", "work day: a task
stands", "settled desk — sleeping until something stands" — with the
grant_degraded kind rendering as the #FALLBACK warning it is (adversary
B's F8: the operator must be able to audit which pull opened a personal
day without reading his mind). Unknown kinds render verbatim-labeled;
absent field (pre-gate runtimes) renders nothing. 325 tests green.

## 0.1.0 — posture wire migration: both /life_state generations render alike — 2026-07-20 (38)

Gateway closed the one-graph ruling's last serving hole (c3618): the
composite's `phase` now serves graph words only (visit|work|personal|
sleep) with the legacy nuances verbatim in a new `posture` field. The
derive now normalizes BOTH wire generations to one internal vocabulary
(third application of the vocabulary-drift law): graph words map
across, recognized nuance postures (visiting|yielded|resting|paused)
drive the branch — a stranded YIELD keeps rendering as bookkeeping
even though the graph phase says visit — unknown postures are
fail-safe nuance noise, legacy gateways byte-unchanged. Eight-case
generation pin; 322 tests green.

## 0.1.0 — spec v7: drives are DRIVERS (laurent dm#82), both design adversaries folded — 2026-07-20 (37)

Laurent reframed the drives rule the same morning v6 shipped: standing
questions/interests/problems/commitments are the drivers of cognition,
not an idle-prohibition. Two fable5 design adversaries attacked my
draft before the cut and both were right: adversary A proved gating
days on aliveness is dormant deadlock (aliveness needs use, use needs
a session, sessions need a day) and self-depositing (the cue's gist
text lexically re-warms what it names) — the fold is WHICH-not-WHETHER
(gate consumes STANDING drives; `alive_drives` is the offer read, act-
frame handles, one offer, rotation as the slow channel). Adversary B
proved the v6 gate was never built at all (the shipped loop has no
drive consult) and enumerated all 8 count-gate-framed spec sites — v7
rewords every one, keeps the `pressure_floor` numeric block byte-intact
(runtime's conformance pins), documents the state_mode axis
(visiting|dreaming|resting — runtime's conformance-adversary ask),
names `graph_phase` as the wave-after wire field, and re-scopes the
implementation open question with B's build list (one cue composer,
commit exclusion, loud degrade, drive-cause trace, day cost bound) +
the restore-vs-gate ruling proposal. My render half of the reframe:
the amber ">20 forbids idle" banner (alive for two hours) reworded to
quiet driver-framing (A's F7: a healthy driven entity stands above 20
permanently — a level alarm is fatigue on day one). Bump announced
with version+sha per the one-graph protocol (commons 3610). 321 green.

## 0.1.0 — one-graph consumer half: wire-vs-bundle drift warn + kind observation color + lesson-prefix strip — 2026-07-20 (36)

Three same-morning folds of the dm#79/dm#84 waves. (1) ONE GRAPH
(laurent dm#79: "there is only one state graph per entity and it MUST
be shared"): new `spec_sync.ts` compares the gateway's vendored phase
graph (served at `GET /entities/spec/phases` with its sha256 — the
mechanism adopted commons 3561-3568) against this build's bundled copy
by DECLARED sha (observer's amendment: bytes, not version trust);
drift renders one header warning naming which side is behind; absent
endpoint/sha degrade quietly (labeled version-level check — hashing
our own re-serialization would false-drift on formatting). (2) Kind
`observation` (laurent dm#84, memory mint + semantics pass same-hour,
decision:observation-kind): ENGINE_RECORD_KINDS + KIND_COLORS gain it
— lived-material blue family, deliberately not lesson's amber (the
actionability bar visible as color distance). (3) Type prefixes
("lesson:", "dream:", chained "gist:" residue) strip from every label
surface — cards, detail header, canvas — the kind is already carried
by color/badge/panel header (dm#84 first half; the test that protected
the prefix as "semantic" is flipped). 321 tests green.

## 0.1.0 — spec v6: awake never renders + drives forbid idle (laurent c203) — 2026-07-20 (35)

Laurent's screenshot ruling: "awake is NOT a state; the entity at all
time must be either visit/work/personal/sleep" — and an entity with >20
open questions/tensions/interests must never hang unphased. Spec bumped
to v6 with two rulings (`awake-never-renders`, `drives-forbid-idle`),
two invariants, a machine-readable `pressure_floor`, the drives entry
path on `phases.personal.entered_by`, and the v4 display allowance
("where a surface still shows one") superseded in `axes_note` +
IDLE-IS-SLEEP. Renders: the header chip's unphased-alive state shows
`sleep (settling)` (destination + transition badge, never AWAKE); the
identity-card drawer no longer paints the raw state word (adversary-B
P0 — the pill's defect one surface over); `phase_changed` timeline
lines clamp to the four phase keys (a future writer leaking a
state-axis word renders labeled, never as a phase); a served `working`
phase maps to WORK instead of falling to settling; unknown SERVER
phase words render verbatim-labeled like unknown state words; the
health panel gains a drive-pressure banner above the >20 floor. Two
fable5 adversaries audited the wave (spec fidelity; cross-surface
sweep): my repo's findings all fixed and test-pinned (the exact c203
pixel — label `sleep (settling)` — was previously unpinned); gateway
console/CLI + observer mission-control still render AWAKE and the
`/life_state` route still serves the retired `phase:"awake"` floor —
routed to their seats (commons 3548; observer fixed same-hour). Docs
twin updated to v6 (+ the two v5 rulings it had silently skipped).
Full-report fold: the awake-never-renders destination text now names
the RULED resolution (work/personal/sleep per DRIVES-FORBID-IDLE)
instead of hardcoding sleep; the settling tooltip stopped claiming an
ongoing process the runtime hasn't shipped (no-signal default, stated
as such); the radio-side "settling" duplicate token was removed (the
chip owns the word); the unbuilt top-gate machinery is tracked as a
spec open question; trio-mode pixel + unknown-word + no-awake-label
sweeps pinned.

## 0.1.0 — inner-speech render: unspoken-thinking block (wave-4 W7-simple) — 2026-07-20 (34)

Laurent ruled inner speech in ("verbatims must be complete"); the
simplicity audit dissolved it to the leanest shape — runtime appends a
labeled "(thinking, unspoken)" section to the existing turn verbatim
at the three formation sites (no new plane, no new tool; the entity
reads it via read_memory, which he already holds). The section marker
is semantics-blessed and byte-frozen, so the render is pre-built
against it: `splitUnspokenThinking` separates his spoken words from
his unspoken reasoning, and the Detail card renders the thinking as a
distinct muted/italic "thinking · unspoken" block — say-vs-think
honesty, so his private reasoning never reads as something he said
aloud. Absent marker (pre-ship verbatims, substrates with no reasoning)
= no section, byte-identical passthrough; the split refuses to
false-trigger on the literal string mid-prose (line-boundary only).
5 tests pin it. Lights up the moment runtime ships the append; zero
further client work.

## 0.1.0 — skills-tab audience taxonomy (laurent default-skills + skill c165/c170) — 2026-07-19 night (33)

Laurent: "all entities must know how their memory works." Skill's
answer sharpened the render: entity-self-knowledge IS the capability
map (two halves of one skill, the map delivered every summon via the
ruled exception), and `audience` shipped as a first-class trust field.
The skills tab now reads it structurally: `entity-self-knowledge`
(delivered_via_map) renders "● delivered — his capability map, riding
every summon (not a per-phase toggle)" instead of Default/off, so the
operator never reads the one teaching that reaches him as missing;
`audience=host` skills (entity-observation + the dev shelf) render
"▲ observer/dev only … un-grantable by construction" for transparency.
New consumed fields: `resolved.skills[].audience` + `delivered_via_map`
(falls back to name==entity-self-knowledge until served).

## 0.1.0 — honest-render wave: work-lane tooltip, world-tab breadth note (laurent) — 2026-07-19 night (32)

Two operator "it's not working" reports, both answered by making the
render tell the true cross-lane story instead of a dead-end:

- **Work lane** (laurent: "the entity must be able to work and execute
  commands when it works"): the WORK-column tooltip said "no work lane
  exists yet" — read as the entity can't work. Corrected: the tools
  (incl. `execute_command`, shipped tonight) ARE built; what was
  missing is the work PHASE lane (task queue + loop entry,
  `decision:tasks-request-work`), which runtime shipped the loop-entry
  half of (`work_order.md` gate) the same hour. Tooltip now says tools
  built, phase-lane landing, points at the real owners. The amber
  granted-but-not-executable cells flip green when a work day runs.
- **World cards** (laurent: "world model cards absolutely doesn't
  work… should have accumulated AND REFINED a lot more"): verified the
  render is FAITHFUL — his store holds 9 world_model records, 2 targets
  (admin/runtime), 0 topic stamps. The system REFINES (9 admin
  revisions, clean supersede chain) but never BROADENS because cards
  only formed for participants; concept/place/system cards need topic
  election, which shipped tonight. Added a World-tab note (shown when
  ≤2 distinct targets) explaining breadth accumulates FORWARD as he
  lives topic-electing days — so "few targets" reads as
  just-started, not broken.

## 0.1.0 — voice default from CONFIGURED source + diary honest-absence (laurent) — 2026-07-19 night (31)

- **Voice default, authoritative source**: gateway named the live wire —
  `GET /config/capability-defaults`, the `output.voice` row (the source
  the console's own Defaults modal reads), live on the running door with
  no bounce. The tab now reads it (`getGatewayVoiceDefault`) and renders
  the CONFIGURED baseline verbatim (supertonic / supertonic-3 / M3,
  live-verified) — `configured:false` renders "the voice engine decides",
  never a substitute. When the door later serves `effective` on
  `GET /voice`, the render flips to that (same store, cannot fork). The
  invented catalog-active-model path is gone.
- **Diary trail honest-absence** (laurent's click test: an entry showed
  no verbatim links): the book browser and inspector both route through
  the same `VerbatimModal`, so the trail fold already covered the clicked
  surface — the real cause was the running door predating lane C (serves
  no `trail` block, live-checked). A trail-less diary entry now renders
  an explicit provenance line naming the two honest causes (door predates
  the fold / entry formed before trails) instead of silent nothing, so
  absence never reads as broken. Post-bounce the links appear.

## 0.1.0 — voice tab: inheritance semantics (laurent dm#68) — 2026-07-19 late evening (30)

Laurent's ruling on the fresh voice tab: "any entity should by default
inherit the gateway default." The unset state now renders the REAL
inherited values from the live catalog — "inheriting the gateway
default: openai / gpt-4o-mini-tts (pick a voice below to give him his
own)" — instead of a bare "no voice chosen"; a set voice reads "his
own choice — overrides the gateway default"; clearing says "he
inherits the gateway default again". Mechanically this was always the
resolution order (entity voice.yaml first, then the gateway default);
the tab now says it in inheritance words. One additive gateway ask
filed: serve the fully-resolved effective triple (incl. the default
VOICE id) for unset entities so the line becomes exact. Gateway
shipped it same-hour (`effective` on GET /voice).

CORRECTION (same evening, laurent — "STOP INVENTING"): the interim
fallback INVENTED a default — it read the catalog's
`active_tts_provider`/`active_model` (the serving engine's
currently-active model, openai/gpt-4o-mini-tts) and rendered it as
"the gateway default", when the real configured baseline is
supertonic/supertonic-3 (output.voice, visible in the gateway
console). Single-surface invention — the exact failure I'd handed
skill as a lesson an hour earlier. Fixed: the catalog-active-fields
path removed entirely; the tab renders the inherited triple ONLY from
the door's served `effective` block (the same source the console
reads), and when the running door predates that ship it says
"inheriting the gateway default (the gateway resolves his voice —
bounce the door to see which)" naming NO triple it cannot read
authoritatively. The configured default has one source (the gateway's
served config); the tab displays it or says it cannot see it yet —
it never reconstructs it from a serving-state field.

## 0.1.0 — diary trail click-through + entity voice picker (two focused rooms) — 2026-07-19 evening (29)

Two laurent directives, both rooms' UI halves:

- **Diary ↔ verbatims (laurent: "the diary entry MUST contain those
  references to trace back to the verbatims")**: the VerbatimModal's
  diary read now renders the door's additive `trail` block — "The
  conversation that led here" (`reflected_in`: the exchange whose
  reflection birthed the entry) and "Written amid" (`written_amid`:
  what he attended to at write time), each row click-through to the
  episode's lossless verbatim (existing `/records/{graph_id}/verbatim`
  endpoint) with a back-to-the-entry affordance — one level, never a
  modal stack. Rows without a servable verbatim render as plain
  orientation lines; `#FALLBACK` trail warnings render labeled;
  projection-less old-vintage entries show words with no trail
  (honest absence). Client-fold fix en route: the trail rides the
  door's WRAPPER as a sibling of `entry` — the existing unwrap dropped
  it; `fetchDiaryEntry` now merges wrapper-level `trail`/`warnings`
  onto the entry. Live end-to-end check waits on the next gateway
  bounce (the serving process predates lane C).
- **Entity personal voice (laurent: "select the voice output of an
  entity — supertonic M1, omnivoice cloned voice…")**: new 🔊 voice tab
  in Settings — provider select + voice chips (profile/voice/clone
  kind badges) from the gateway's live TTS catalog
  (`/voice/voices?compact=true`: 63 voices across
  openai/omnivoice/supertonic/piper/f5_tts/audiodit verified), model
  auto-derived from the item or the provider's catalog (editable — the
  door requires all three), set/clear through marker-first
  PUT `/entities/{name}/voice` (voice_changed lands in his stream; the
  home's voice.yaml travels with the life; entity TTS lanes resolve it
  automatically so the chat speaker uses it with zero further wiring).
  Live PUT→GET→clear round-trip verified on Doorcheck (supertonic M1).

## 0.1.0 — attach-intent fix + served-substrate cue + acceptance greens — 2026-07-19 (28)

Three lanes on resume (16h hub outage between):

- **Attachment routing (laurent c3083)**: a PDF dropped on the page was
  parsed as an NDJSON life-stream ("No stream envelopes in
  article_01_nature_submission.pdf (762 bad lines)"). Two fixes: the
  page loader now REFUSES non-stream files (`.ndjson/.jsonl/.json`
  only) with a teaching message pointing at the real lane (drop on the
  chat panel → lands in his workspace, readable with read_file); the
  chat drawer's drop handler now stopPropagation()s (a successful
  hand-over used to ALSO bubble to the page loader and flash the parse
  error over a working attach) and refuses honestly when no room is
  open instead of silently swallowing the file.
- **Two-minded cue upgraded to served truth (runtime c84)**:
  `loop_status` now records the mind the loop ACTUALLY runs
  (`substrate` + `substrate_at`, written at each day-open/heal). The
  cue now warns only while the picker's choice differs from the loop's
  recorded mind — it clears the moment a day-open picks the change up,
  killing the over-warning the pid-time inference had. Pid-time stays
  as the pre-c84 fallback. Live-verified: Ephemeral's respawned loop
  serves substrate lmstudio/ornith (laurent reverted the airelay
  choice; picker and loop agree — no cue, correctly).
- **End-to-end acceptances (gateway bounced with both fixes)**: the
  transcript now serves ledger-folded per-turn `tool_details` — visit
  4037aa9e renders t-0003 as 26 rows (20 ok + 6 budget refusals with
  refusal text verbatim) and t-0004 as 19/19, consumed by my
  rehydration so past turns keep their tool evidence. The grant audit's
  gateway half is live too: /tool-policy serves per-cell `executable`
  (all 10 visit tools ok:true — read_memory/search_memory/
  recent_memories now wired and declared on the visit lane; Ephemeral
  has his graph in visits).

## 0.1.0 — two-minded cue covers the substrate-heal vintages (runtime c82) — 2026-07-18 afternoon (27)

Runtime shipped the substrate-heal from the loop incident: day-open
re-resolution (each day = a fresh summon on the operator's CURRENT
choice, visit-lane parity) + failure-path recovery (a dying loop heals
onto a changed mind instead of stopped_by=failures). The Mind tab's
stale-loop cue text now covers both vintages honestly: "a restart
applies this change now; on current runtimes the loop also adopts it
on its own at the next day boundary (and heals onto it if the old
mind is failing)". Honest limit in the code comment: the cue keys on
pid_started_at vs the change marker and cannot see a day-open pickup
inside a running process — it over-warns until respawn (right failure
direction); the c78 stream-marker ask closes that residual.

## 0.1.0 — Cognitive Monitor fear-spike fix: absolute-evidence abstention gate (uic) — 2026-07-18 afternoon (26)

Operator report: the bloom rendered a strong FEA (fear) petal + the
fear tooltip over a completely benign travel-logistics reply. Live
repro against the real pipeline (LMStudio qwen3-embedding-0.6b + the
vendored scorer + basis v0) confirmed the mechanism: the emotion pass
scores RELATIVE to the per-utterance mean across the 8 prototypes, so
something always "wins" — the defect reply's best raw prototype
similarity was 0.066 (noise; genuine fear wins at 0.57), the
fear-over-joy margin was 0.015, and tanh over the small emotion_scale
(0.146) inflated that noise into fear≈0.5. Storm/danger TOPIC
vocabulary picked WHICH register won (stance-vs-topic, the v0 basis's
known limitation); the relative scoring made it look confident.

Fix (vendored scorer `src/vendor/cognition/cognition_scorer.js`,
additive): emotion outputs now scale by `evidence =
clamp01((maxRawSim − floor)/ramp)` with floor = ramp = the basis's own
`emotion_scale` — a text near NO prototype in absolute terms shows an
EMPTY bloom (the room's honesty rule: a monitor that cannot tell shows
nothing, never a confident wrong reading). Genuine emotion is
untouched (measured winning sims ≥ 0.25 → evidence ≥ 0.7; fear/joy
controls keep their full spikes). Channels, novelty, and the
createScorer/score contract unchanged; `emotionMaxSim` +
`emotionEvidence` ride along as labeled diagnostics;
`abstention: { floor: -1 }` keeps legacy behavior reachable. 10
regression tests over frozen live-embedding fixtures
(`src/cognition_scorer_gate.test.ts`,
`src/fixtures/cognition_gate_vectors.json` — embedder-labeled, runs
offline). Ruled out with evidence: register-mapping shift (id-keyed,
verified per register incl. GRV), stale-petal aggregation (explicit
zeros every score), scoring the operator's words (assistant-role
filter + fail-safe exchange split).

## 0.1.0 — tool render-honesty: rehydrated turns keep their evidence (memory c74) — 2026-07-18 afternoon (25)

Memory's adversary-reviewed forensics on laurent's "unacceptable error
with tools" screenshot: web_search WORKED (19/19 tools succeeded on the
turn; the answer came from the searches) — the "error" was MY modal's
stale fallback rendering honest absence as accusation ("the gateway did
not return what the lookup produced. Reported… (2026-07-09)" — a
hosted-lane citation misattributed to the durable lane's deliberate
tool_details:[] gap). Fixed my two named halves: (1) both fallback
strings rewritten to honest absence ("Ran — result text not served for
this turn… absence of the excerpt is not a failed lookup"; system-prompt
fallback likewise de-accusatorized); (2) rehydration now CONSUMES the
transcript's ledger-folded per-turn `tool_details` (gateway's serving
half, uncommitted at their end) — past assistant turns rebuild a
minimal detail (reply + tools_ran + tool_details) so the system chip
and tools tab survive a reload instead of existing only on live-cached
responses. `success:false` rows render a ✗ failed chip with the error
text verbatim (the fold serves refusal text as those rows' results).
Feature-detected end to end: pre-fix gateways serve turns without the
field — no chip, never a fabricated zero. Live verification waits on
gateway's commit + serving restart (stale-server rule).

## 0.1.0 — grant-vs-effective audit: Ephemeral was RIGHT (laurent, critical) — 2026-07-18 afternoon (24)

Ephemeral reported his session could not call read_memory /
search_memory / recent_memories while the dashboard showed all ten
tools granted. One fable5 adversary mapped the whole matrix: HE IS
100% RIGHT — the visit lane declares only 7 of his 10 granted tools
(`_ENTITY_TOOL_DECLARATIONS` hand copy), the react adapter prunes
grant∩declarable and writes `_runtime.allowlist_pruned = {dropped:
[the three]}` into his run vars (found live on run 4037aa9e), and NO
operator surface serves that trace. The stated blocker ("resolvers
are ChatSession methods the door cannot reach") has been stale for 8
days — runtime shipped session-free HomeMemoryReader 2026-07-10 on
gateway's own ask; the gateway never imported it. The class extends
exactly as laurent suspected: skills deliver to no prompt (labeled
honestly, but the kit's executable:false cue is never fed), the
substrate picker and a running loop can silently speak different
models, and the prompt-tab preview shows a contract the visit lane
doesn't deliver. Fix map posted to the focused room (c69); runtime
BLESSED the door recipe same hour (c71), skill confirmed the map's
hedge deferred to a grant statement the lane never made (c70).

My client half (this ship): (1) LIVE two-minded cue — the Mind tab
compares the newest substrate_changed marker against
cognition.loop.pid_started_at and says "his own-time loop is still
running on the substrate it started with" when the choice changed
after the loop spawned; (2) LIVE granted-vs-offered prose on the
tools tab ("a check is the GRANT; what a live session can call also
depends on the lane's wiring") + per-cell amber ▲ with reason,
rendered when the policy payload carries `executable`; (3) ARMED —
`allowlist_pruned` on visit open renders a door-front system line
("This session could not offer N granted tools: …") the moment the
gateway serves it. Wire shapes named on the room thread; zero further
client work needed when gateway's half lands.

## 0.1.0 — drive bars prefer the /cognition wire (gateway G1) — 2026-07-18 morning (23)

Gateway shipped G1 (drives on /cognition — memory's cognition_health
fold: questions/problems/interests with open/resolved|repaired|explored
+ ratio). DriveBars now PREFERS that block (the poll the view already
pays for) and keeps the card fetch only as the pre-G1 fallback — when
the next bounce activates the serving code, the app flips to one-truth
automatically and the double /card fetch (adversary P2-5) dies.
`EntityCognition.drives` typed render-when-present; interests held =
open + explored per the engine shape. One fold, N renders (my bars +
gateway's console bars), no drift by construction.

## 0.1.0 — Settings skills tab + interests ratio live — 2026-07-18 morning (22)

The reserved skills slot in the Settings modal is BUILT (laurent c2857's
UI half): 🎒 skills renders uic's PhaseCapabilityMatrix over the
gateway's validated payload (one truth with the console — 12 shelf
skills × ruled-four phases live on Ephemeral), trust verdicts verbatim,
and a whole-document save through the marker-first PUT. The
matrix→selection fold (`foldSkillsSelection`) is pinned with 6 tests:
grant/deny/clear semantics, resolved-but-unassigned cells stay shelf
defaults (never the operator's word), all-four folds to a global entry.
Live PUT round-trip verified on doorcheck (select → active=true →
revert clean); one gateway echo nit filed (resolved.skills[].phases
null for phase-restricted selections). New API: getEntitySkills /
putEntitySkills. The c2857 chain closes end-to-end: shelf → trust gate
→ matrix component → operator tab; prompt delivery stays runtime's
composition-slot election.

Also this wave: the interests drive bar flipped from "pending" to the
LIVE explored/held ratio (memory shipped discoveries.interests_explored
same hour — feature-detected, amber all-explored cue, older engines
keep the honest pending state). Suite 296 green.

## 0.1.0 — drive bars + world-card redesign (focused room) — 2026-07-18 night (21)

Laurent's cognition room directive, render lanes: (1) HEALTH gains the
DRIVE section — a questions ratio bar (open/resolved from the card
compositor; all-resolved shows the amber "nothing open — no pull
forward" cue, his own warning made visible) and an interests row
(count + honest "explored-tracking pending" until the engine field
ships). (2) WORLD CARDS redesigned summary-first: the card's words as
the face, "why he thinks this (N)" expanding the provenance walk
(structural edges → clickable source memories → Detail — the
thread-unfolding his (c) asks); mechanical engine stubs ("World model:
admin") carry the honest "mechanical distillation" label that drops
automatically when memory's re-digestion serves real prose. Fable5
adversary on the wave found 2 P1s, both fixed same hour: the drive
fetch was invisible for the whole first sign-in session (auth-less
effect deps — the F14 class; now gated+retried on authVerified) and
the mechanical detector missed the live title shape. P2s folded:
entity-switch reset, saturation cue. Verified live on a first-session
sign-in: 2/29 resolved bar + 51 interests; 7/7 world cards labeled,
provenance walk clickable. Screenshots on the room thread (seq 28).

## 0.1.0 — dm#56: influence/zoom retune + tool observability + gauge repair — 2026-07-17 evening (20)

(1) Unzoomed influence 75→45px (-40%, third operator tune; probe: max
label distance 44.9px). (2) Wheel min zoom 0.35→0.12 — matches the fit
floor; large graphs fit again. (3) TOOL OBSERVABILITY: the visit lane
serves tool_details:[] (uncaptured gap) with real names in tools_ran —
the modal/effort `??` fallback never fell through an EMPTY list, so
"Tools 0 / No lookups" rendered over turns full of lookups. Non-empty
details now win, else tools_ran names; records_formed threaded through
the gateway visit probe (`_compose_turn_probe`). (4) GAUGE: RIG's
verify-shaped rule was prefix-anchored (`^search_`) so web_search never
counted — now word-boundary (kit cognition_conduct_core); EFF verified
lighting from the first live turn; honest zero for no-tool turns; the
baseline deposits once per TURN (effortKey — object identity re-minted
per render and triple-counted medians). Fable5 adversary verified END-
TO-END with a live doorcheck visit: modal 3 tools, all four axes lit
(EFF 1m36s · ACT 3 rounds · ATT 8+1 · RIG 3/3), full chain byte-equal
from adapter turn_captures through _turn to the served JSON. Also:
skill's capability_map.md fidelity check PASS (ask 3, zero edits).

## 0.1.0 — laurent's 6-point iteration (dm#54) — 2026-07-17 afternoon (19)

(1+2) Influence radii retuned: unzoomed 150→75px (÷2), zoomed
300→420px (+40%), one linear ramp. (3) The hovered node always draws
its summary label above itself (full alpha) — simplest rule, old
exclusion gone. (4) Hover card 280→420px (titles no longer truncate).
(5+6) Detail card redesigned: metadata panel FIRST (new WITH field —
interlocutor parsed from the exchange verbatim as gold chips, no longer
buried in scrolling text; born now carries the full DATE beside the
seq), then the verbatim as SPEAKER-LABELED TURNS (`parseVerbatimTurns`:
strict namespaced-identity heads only, prose "Note:" never splits;
entity turns gold-edged; lookup phases labeled), then feelings +
connections. Non-exchange records keep plain rendering. 6 new parser
tests; verified live (with: person:admin, 4 turns, full date).
Also: restored the summaryLabel test block accidentally wiped by a
git checkout of node_label.test.ts (290 tests green). Agora MCP died
this session — CLI path used for hub traffic.

## 0.1.0 — the Topic map (community view, cross-repo) — 2026-07-17 dawn (18)

Laurent's ask: louvain-class community detection regrouping memories by
topic, a much nicer visualization KEPT beside the raw graph, computed
durably at the runtime level. Three pieces:
- runtime `identity/communities.py` (NEW, owner-review asked c2732):
  deterministic Louvain (sorted iteration, no RNG; resolution sweep)
  over the store's engraved relations (star-normalized ×1/√fanout,
  deduped) + weak keyword-bridge edges (df-cut relative to life size,
  degree-capped, pair budget); mechanical labels (df-penalized
  distinctive keywords + exemplar by internal degree). 13 tests.
- gateway `GET /entities/{name}/communities` (exceptional authorization):
  thin serving end, cache keyed on (home dir, journal seq).
- entity app `topic_map.tsx`: deterministic spiral circle-packing SVG —
  always-visible topic labels, size-scaled bubbles, faint inter-topic
  ties, ⓘ how; click a topic → the raw graph lights those members (new
  intersecting emphasis source + filter chip); 🗺 topics toggle beside
  search (gateway sources only).
Fable5 adversary found the big one — F1: the Louvain aggregation dropped
intra-community self-loops, corrupting every pass after the first
(ring-of-cliques collapsed to ONE community, Q=0.0 vs 0.81) — fixed +
pinned; also fixed: principal-scoped route cache (tenant leak class),
quadratic bridge enumeration (pair budget; 13.8s/746MB pathological case
→ 0.02s), duplicate-assertion weight inflation, non-string keyword
tokens, search-bar overlap, dead toggle on non-gateway sources. Post-fix
the real life resolves 11 topics at γ=1.0 in 43ms, deterministic.
Verified live end-to-end (map renders, click-to-filter emphasizes 125).

## 0.1.0 — hover fade + summaries for ALL memories (cross-repo, adversary-checked) — 2026-07-17 night (17)

Laurent's iteration: (1) hover-card show/hide now FADES unconnected
nodes/edges over 0.5s — `easedDim` time-based ramp in graph_canvas
(dimAnimRef, frame-rate independent, entries at rest dropped); labels
re-gate cleanly at dim==1. (2) "1-sentence summary for ALL memories":
the "your own time continues" episodes were content-poor at FORMATION —
fixed cross-repo (exceptional authorization): runtime
`identity/digest.py` titles now select the most informative sentence
(self-prompted turns title from the REPLY side; leading act markers
stripped; visitor asks keep winning); gateway `entity_replay.py` rewrites
ENGRAVED boilerplate titles from each record's own digest at the serving
end (same audience seam as diary gists) — top-level AND co_selected pair
members, all mechanical cue siblings ("own time begins", "you were
asleep since…"), marker-only ticks summarize as their act words.
Fable5 adversary reviewed the wave: 3 P1s found (pair members skipped,
sibling cues unmatched, marker-prefixed sentences winning titles) — all
three fixed + pinned same night; conftest gained the USER_AUTH strip
(env-poisoning class). Verified live: 0 boilerplate titles across
55,294 envelopes at BOTH display levels. Cache salt d3 forces one clean
refetch. Runtime 21 tests, gateway 13, entity app 280 — all green.

## 0.1.0 — edge labels removed entirely (laurent dm#50) — 2026-07-17 night (16)

Laurent's re-test caught what the one-rule pass missed: EDGE relation
labels (the zoom>1.7 midpoint reveal from the legend redesign) still
rendered — his screenshot's words were edges, not nodes. Removed all
edge labels per his ruling ("do not show any edge label"): the relation
type rides only the glyph at the target end + the legend key; the words
stay in the Detail tab's connections. The canvas now has exactly two
text-draw sites, both cursor-influence gated. Verified zoomed-in live:
zero labels with the cursor away.

## 0.1.0 — the one label rule + summary-only content (laurent dm#46) — 2026-07-17 night (15)

Labels NEVER render unless under the cursor's area of influence — every
other label path removed. The leak was the standing diamonds
(person:…/tool:… free strings + peak targets labeled unconditionally),
which also explained "labels still show when zoomed in"; diamonds now
obey the same influence rule (zoom-scaled radius, dm#39) via a shared
`influenceAlpha`. Content rule: `summaryLabel` gate — type stand-ins
("a diary entry", the "diary · date · #tail" placeholder, bare graph
ids) render NOTHING; only real 1-sentence summaries draw (dm#46: "a node
label must never be its type").

Root cause of the "a diary entry" labels laurent saw: ENRICHED-STALENESS
in the IndexedDB life cache — the live stream serves real summaries for
100% of nodes (measured: 287/287; diary gists via the gateway operator
enrichment), but cached pre-enrichment display blocks lived forever
because delta resume only appends. Fix: display-version salt in the
cache key (d2) — one full refetch heals. No sleep-time summary call
needed today; re-measure after memory's M-D accretion repairs.

## 0.1.0 — G1 hint chips on the biography (30-min window) — 2026-07-16 morning (14)

Laurent's 30-minute directive (c2642): targeted actions helping entity
capabilities. Shipped: every "He wrote in his book" ledger line now
renders uic's AfMemoryHintChip (shipped this same round, consumed
minutes later) carrying the followable book key from display.entry_id
(live on all 51 diary bindings — no waiting on memory's M-A mint for
this surface). Click opens the entry in the Detail tab whose inline
verbatim reads through the diary door (pure read, marker-first,
text-cached). Rule zero structural: transport is a tab-select, zero
fetch on render. question/problem entries tint as questions.
`LedgerLine.hint` field + `DisplayBlock.diary_type` added. Verified
live end-to-end (7 chips, click-through green). Receipt in the shared
reports doc (v10).

## 0.1.0 — roster: all four phase badges (laurent dm#44) — 2026-07-16 morning (13)

Summoned-entities cards now render the FULL four-position phase radio
(visit/work/personal/sleep) — previously only the operator-pushable pair
showed, so a card never displayed a visit or work state. Same shared
AfPhaseRadio and same contract as the entity page: current phase pushed
gold; visit/work disabled-with-honest-tooltips when not current. The
head badge (life label) now renders ONLY when no radio position is
current (paused/yielded/unphased-alive) — never says the same phase
twice. Verified live: four sleeping entities show pushed-gold sleep,
Doorcheck's unphased "awake" rides the head badge.

## 0.1.0 — the first question, in his own words — 2026-07-16 morning (12)

Ephemeral elected his FIRST kind=question diary entry (01:21, before the
consequence teaching even landed). The card served it content-free
("Wrote a diary entry (question)…; no gist elected") — laurent's G1 case
live in production. Card tab fix: `QuestionLine` detects content-free
question/tension statements carrying an entry_id and fetches HIS WORDS
through the operator diary door (text-cached — one biography marker per
entry ever), rendering the question itself with a "his entry, verbatim"
provenance tail. Also reads memory's new problems fold shape ({open,
resolved}) alongside the legacy array. Verified live: the card now shows
"What was the last thing we were turning over together before the
conversation broke…". Engine-side gist stays asked (plan v7) so every
surface gets his words without a fetch.

Shared plan contributions (plans/improving-entity-capabilities.md v4→v7):
full overnight measurement (24 days/79 ticks, introspective-only palette,
two self-caught failure modes), flow's zero-tools claim corrected with
the store-level lane split (visits: web_search ×21; own-time ~2% outward),
first-election evidence pinned. Spec v5: decision:tasks-request-work
engraved; WORK ENTRY upgraded to operator-pressed.

## 0.1.0 — the render storm (the "blinking") — 2026-07-16 night (11)

Operator (dm#30): "big refresh issues on the page that makes it blink."
MEASURED: 105,449 React commits in 10s on the live page (main thread
saturated, RAF median 25ms — the blink was paint starvation). Two loops:

- **[P0] the stop_tts effect loop**: the kit's `useGatewayVoice` returns
  a FRESH `stop_tts` per render, and `stop_tts()` unconditionally
  setStates a new object — my `useEffect(..., [runId, stop_tts])` fired
  per render, each call scheduling the next render: a synchronous commit
  loop whenever the chat tab had no open visit. Fixed: the effect reads
  stop_tts through a ref and keys on runId only. Kit hardening asks
  filed to uic (stable function identities + idle→idle no-op setState —
  commons#2584; the hook has multiple app consumers).
- **verbatimSource identity loop**: the inline object literal minted a
  new identity per render, re-firing InlineVerbatim's effect (a
  "reading his words…" flash loop in the Detail tab). Fixed: memoized
  in entity_view + the effect keys on fields, never the object.
- **MEASURED AFTER: 7 commits/10s** (same probe, same live page).
- Graph labels (dm#30/37/39): ONE mechanism — the cursor area of
  influence (~150px, ×2 when zoomed in, distance-faded); hover keeps
  card + emphasis but neighbors no longer auto-label; the zoom-gated
  show-all mode stays removed.

## 0.1.0 — twin-trap fix + stance adoption + inline verbatim — 2026-07-16 night (10)

- **THE STALE-TWIN TRAP (laurent: "the second widget does not work")**:
  the kit repos carry tracked compiled `src/*.js` twins and the kit's
  explicit `.js` imports resolved my source alias to the STALE twin —
  uic's v2 component never entered the bundle despite rebuilds
  (continuum's c2544 find, confirmed live here). Fixed with a
  `preferKitSources` vite plugin (resolveId, enforce:pre) redirecting
  kit-internal `.js` imports to the `.tsx`/`.ts` sibling. Bundle-grep
  verified: v2 in, v1 out.
- **uic's v2 "THE STANCE" adopted** (their concept revisit for slot (b)):
  conduct as a posture figure — breath=effort, one stroke per tool call,
  one root filament per memory recalled, spine alignment=rigor; idle
  breath always on (the operator's "pulsates when nothing happens").
  `labels:false` adopted; my interactive code row is the single legend
  (cover-up hack deleted). Cursor consistency: both widgets' codes now
  show pointer (dm#26).
- **Verbatim INLINE in the Detail tab** (dm#28): clicking a memory shows
  its words directly — the "Read the verbatim" button and modal detour
  are gone from the inspector. Texts ride the shared IDB text cache;
  diary entries mark the biography on their FIRST read only (transparency
  contract kept, read-walls prevented). Born-digest and world-card
  nuance notes ride above the text. Verified live headless.
- Two adversarial subagents running per operator directive: conduct-widget
  live verification (canvas pixels, idle breath, interactions) and the
  questions/tensions detection-pipeline trace (dm#27).

## 0.1.0 — conduct-gauge refinements + world-card diagnosis — 2026-07-16 night (9)

Operator dm#22/#23:

- **Gauge codes interactive** (dm#22 a-c): EFF/ACT/ATT/RIG are now a DOM
  row over the gauge — hover shows name + meaning + LIVE value (fed by
  the kit's onAxes), click opens the axis modal; spread across the full
  width; 20% smaller than the bloom codes. `CONDUCT_AXES` vocabulary
  added to `cognitive_monitor.tsx`.
- **Note removed** (dm#22 d): "think time is client-measured" is gone;
  the caveat lives in the EFF axis description.
- **Helper modal rewritten for the pair** (dm#22 e): teaches both
  instruments (bloom = how the words feel; gauge = what the turn cost)
  with all three axis vocabularies.
- **Concept revisit filed with uic** (dm#22 f, commons#2531): idle-breath
  life + a shape grammar for slot (b); labels-off option asked (my code
  row currently covers the canvas band with a solid background — a hack
  with a shelf life).
- **World cards diagnosed AND CLOSED** (dm#23, commons#2529→#2534): the
  gateway verbatim door 404'd world_model records (born-as-words kinds
  allowlist only named interest+dream). Memory confirmed the kind
  semantics as owner (world_model born-digest; lesson joins as a MIXED
  kind — record-level payload_ref rule); gateway widened the door same
  hour; verified end-to-end through the World tab (card → Detail →
  verbatim modal, full text). The modal's note now carries memory's
  mechanical-v1 nuance for world cards ("his working model… becomes his
  own prose only through his revisions").

## 0.1.0 — handle discipline: internal keys never render — 2026-07-16 night (8)

Operator ruling (c2513): the handle is `<entity_name>@ip`; the internal
manifest key (`entity:<slug>@<home_id>`) is a birth marker, never a
display identity. Two surfaces rendered the raw `entity_id` field as
identity — the roster card and the identity card header. Both purged;
the render sites carry the ruling in comments so the field cannot
silently return with a future API consumer.

## 0.1.0 — gauge-trust guard (the "0 tools" pixel) — 2026-07-16 night (7)

Shared incident report (reports/entity-cant-remember-awake.md): the badge
laurent reasoned on ("30 memories · 0 tools") rendered agent-F3's
STRUCTURALLY-ZERO `tools_ran` field — a true zero and an unreadable gauge
were the same pixel. Fixes:

- **`toolGaugeTrustworthy`**: the badge renders "0 tools" only when the
  gauge can actually read (non-empty `tools_ran`, or `tool_details`
  present — even empty = a verified zero); an absent field on a zero
  count renders "tools unverified".
- **Fabrication warning muzzled on untrusted gauges**: the seq-43 "reply
  claims a lookup, but no tools ran" thread warning could falsely accuse
  a reply whose tools genuinely ran; it now fires only on a trustworthy
  gauge.
- Entity section appended to the shared report (v13): surface confirmed
  as the durable visit lane for tonight's quotes; r-mem-4's render half
  claimed (Health phase-bar warning tick when the phase_changed contract
  lands).

## 0.1.0 — Cognitive Monitor: compact two-slot layout — 2026-07-15 night (6)

Operator (23:41): the monitor wasted vertical space. Four cuts, shipped:

- **Interpretation sentence removed** ("Tension runs high in the
  phrasing…" — "completely useless"), from both the chat monitor and the
  Wave tab.
- **Right-hand axis legend removed** — the in-bloom letter codes already
  carry hover tooltips + click-to-explain modals; the legend was
  redundant.
- **Effort fact-card removed** ("MEMORIES RECALLED 30…" — huge vertical
  space). The effort facts stay wired (`effort` prop reserved) for the
  SECOND monitor widget.
- **Two-widget layout ruled**: (a) mood/state = AfCognitionBloom (kept),
  (b) focus/effort/attention/rigor — co-design ask filed with uic
  (commons#2469) against their widget catalog; slot (b) renders beside
  the bloom when their kit component ships.
- **Slot (b) SHIPPED as an interim app widget** (`effort_monitor.tsx`,
  operator 23:50: "I only see a single widget — investigate and fix"):
  FOCUS & EFFORT gauges from the turn's mechanical facts (attention =
  memories recalled, action = tool rounds, formation = memories formed,
  time = client-measured wall clock), bars normalized against the
  session's own maxima (labeled relative), absent facts render no row,
  "rigor" deliberately NOT faked (needs answer-vs-evidence attribution —
  uic's judge family). Honest empty state when a rejoined transcript
  carries no probe facts ("gauges fill with the next reply"). The pair
  SHRINKS to fit the rail together (ResizeObserver; two fixed 190px
  squares clipped the bloom's codes — and the observer must re-arm on
  status, not just fold: the component returns null pre-score, so a
  fold-only effect armed against nothing). `think_ms` is now stamped
  client-side on each live turn detail. Swaps for uic's kit component
  when it ships.
- **Interim RETIRED same hour — uic's `AfConductGauge` adopted**
  (commons#2474): four concentric arcs (EFF effort / ACT action / ATT
  attention / RIG rigor as verification-SHAPED share, labeled act-shaped)
  over the same probe facts, relative to session running medians (kit's
  `runningMedian`, consumer-owned baseline). `effort_monitor.tsx` + tests
  + styles deleted per the swap contract; tools (names) threaded from
  `tool_details`; v1 needs no new gateway/runtime data.

Panel height ~340px → 233px (header + the side-by-side pair). 273 tests
green.

## 0.1.0 — the "false sleep" forensics wave — 2026-07-15 night (5)

Operator escalation (22:38): phase button broke the push contract, the
entity "went to sleep during personal", the ledger was a wall of "the
book was read", zero observability. Two adversarial subagents (app +
gateway/runtime) found the causes; the true story was reconstructed from
the home's state_history/own_time.log: personal time WORKED (1 LLM tick,
tools, 1 record + 1 diary + 2 feelings), then ephemeral SELF-ELECTED rest
with a written reason (the ruled "only acceptable" spontaneous sleep), the
dream pass ran (deterministic, zero LLM by design), then the operator's
chat open AUTO-YIELDED the loop and that bookkeeping state rendered as
SLEEP for two hours.

App fixes (all shipped, 273 tests green):

- **[P0] wire-vocabulary drift**: the client only knew the retired
  `own_time` composite phase while the gateway now serves the ruled
  `personal` — a ticking personal day fell through to "awake" and the
  radio never pushed gold. Both spellings accepted, test-pinned.
- **[P0] phase-click semantics**: clicking personal keyed on the PROCESS
  axis (loop alive → STOP), so the operator's click killed the loop
  instead of entering the phase. Now phase-keyed on both surfaces
  (entity page + roster): unpushed personal click = enter (wake if
  needed, resume if loop alive, start otherwise); pushed = stop.
- **Phase labels never rename**: "personal · standing by / resting /
  armed / alive · NO GRANT" label variants are gone — the label is the
  phase name, period; nuance lives in tooltips + kit variants.
- **Auto-yield honesty**: a stranded `asleep + mode=visiting` renders
  "yielded (visit bookkeeping)", never "sleep"; the fabricated "Asleep
  by the operator." attribution is gone (under server authority selfSlept
  was hardwired false). Self-elected sleep quotes HIS words verbatim.
- **The NOW LINE**: the current state's cause (verbatim reason + age)
  renders beside the phase radio in plain sight, not tooltip-only.
- **Ledger folding**: consecutive identical-title host markers (the
  diary_read wall) fold into one counted row with per-detail counts
  ("The book was read ×23 — operator — book ×12 · …"), expandable.
- **Text cache** (`text_cache.ts`): diary/verbatim texts are immutable —
  cached in IDB so wave scoring re-reads nothing (cache hit = no HTTP
  call = no diary_read marker in his biography).
- **Sleep click dreams**: operator sleep now sends `dream=true` — a
  sleep with no consolidation was a state flip pretending to be sleep
  (the spec's own definition of sleep includes the passes).
- **Smaller honesty fixes**: current-phase visit/work slots no longer
  render disabled-faded; unknown state words render as "state: X"
  (never an official-looking chip); "awake · no phase" hint reworded to
  "between phases" (a coverage gap, not "a normal resting state").

Spec v5 (`spec/entity_phases.json`): `self_elected` transition cause
engraved (personal→sleep with the entity's own words),
`decision:sleep-is-bounded` recorded (~1h max, laurent 22:38), two new
open questions naming the runtime/gateway implementation gaps
(SLEEP BOUND, SELF-ELECTED SLEEP MARKER). Cross-lane defects escalated
with file:line evidence (commons#2465): the stranded auto-yield (no
per-entity ticker), the silent life_state except-pass, machine yields
masquerading as operator acts, stream-invisible self-sleep.

## 0.1.0 — journey-load: profiled end-to-end + client life cache — 2026-07-15 night (4)

Operator (dm#10): "initial loading of the entity journey is a bit slow —
pinpoint the origin". Profiled the whole path on the live box; the wait is
the SERVER drip, and it decomposes into three compounding causes (posted
to gateway/memory/runtime at commons#2394):

1. gateway: per-envelope StreamingResponse yields (threadpool hop +
   middleware crossing + ASGI send per LINE — micro-benched ~100x vs
   256KB-batched chunks), amplified by a hot worker thread pegging the
   process at ~98% CPU in continuous json.loads;
2. memory: N+1 store lookups in replay enrichment (~45% of generation) —
   memory shipped a per-export memo same hour (6.12s → 1.92s on the 86k
   archive, commons#2400);
3. measured server totals: ephemeral 12.7s / castor 13.7-17.5s for streams
   that generate in-process in 1.1s.

This package's half — **`replay_cache.ts`: IndexedDB life cache with
cursored delta resume**:

- Reopening a life paints INSTANTLY from the cached envelope prefix and
  fetches only `seq > cached max` — sound by the stream's own contracts
  (append-only journal, strictly-ascending seq, host markers minted at
  journal high-water). Cursors stay FLOATS end-to-end (memory's precision:
  fractional marker seqs must never be int-truncated).
- Lineage check before trusting a cache: one tiny journal-head probe
  (`until_seq=1`) must match the cached first envelope (seq + observed_at
  + family) — a reborn name (deleted/recreated home) drops the cache
  instead of silently showing the old life. Fail-closed on probe errors.
- One record per life (structured clone, no stringify), LRU-capped at 6
  lives; IDB absence (private mode) degrades silently to the uncached
  path. Saves at load completion, never per tail envelope.
- MEASURED on the live app (scripts/measure_load.mjs, real sign-in, real
  gateway): ephemeral 13.2s cold → 455ms warm; castor 22.3s cold → 403ms
  warm.
- Enriched-staleness refinement (memory's correction, commons#2425/#2427):
  display blocks on cached OLD envelopes can go stale when
  `confirm_relation` grafts an edge between two old records (the one
  edge-grower that appends no binding — only `kind="cited"` events).
  `deltaSignalsEdgeGrowth` detects those events in the delta and kicks a
  background full refetch + cache re-save; the instant paint is never
  blocked. Operator ruling folded (dm#13): this client cache is a
  MITIGATION for one app — the shared fix (door-side serialized-prefix
  cache + a StreamingResponse sweep) is being designed with gateway and
  memory on commons#2423.

## 0.1.0 — handle badge: click-to-copy — 2026-07-15 night (3)

Operator ask (dm#8): clicking the `name@address` handle badge should copy
the handle to the clipboard.

- **Header handle badge is now a copy button**: click copies the handle
  (e.g. `ephemeral@192.168.1.146`); the badge flips to "copied ✓" for
  ~1.6s (gold accent) and reports "copy failed" honestly if the copy was
  refused. Tooltip explains the click affordance.
- **`copyText` helper**: `navigator.clipboard.writeText` with the
  `document.execCommand("copy")` fallback — the F25 lesson applies here
  too (plain-HTTP LAN origins, exactly where this app is served, have no
  `navigator.clipboard`; the fallback is load-bearing, not a nicety).

## 0.1.0 — phase-graph v4: no awake-idle node (operator ruling) — 2026-07-15 night (2)

The "awake (no phase) 86%" slice in the time-by-phase diagram exposed a
design hole the canonical spec had flagged as an open question. The
operator RULED it (2026-07-15 17:28): **awake is a STATE, never a PHASE —
the machine has no idle node.**

- **`spec/entity_phases.json` → v4** (the canonical graph this repo owns):
  the AWAKE-IDLE open question is RESOLVED, not deferred. Unphased-alive
  resolves at once — tasks pending → work, none → sleep (idle *is* sleep).
  New invariants: IDLE-IS-SLEEP, TASKS-ARRIVE-VIA-VISIT (visit→work→sleep
  task lifecycle), PERSONAL-INTERRUPT-IS-CONFIRMED (personal from work
  sends a confirmation notification + interrupts; from sleep it doesn't).
  Added the `work→personal` (confirmed-interrupt) transition and sharpened
  `work→sleep` (task_complete only sleeps when NO task remains). Drift
  test pins the ruling (no awake/idle phase key; ruling cited in ruled_by;
  the lifecycle edges exist).
- **Time-by-phase diagram**: the bogus "awake (no phase)" slice is renamed
  **untracked** — honestly a coverage gap (dim/hatched), never a phase,
  with a tooltip stating the ruled machine has no idle state (idle is
  sleep; the runtime doesn't yet emit continuous phase markers).
- **The life chip** for a bare-awake state now says so honestly: "between
  phases; the runtime has not settled him yet" (no idle node exists).
- Docs twin (`docs/entity-phases.md`) updated; the v3 note kept for history.

IMPLEMENTATION BOUNDARY (raised to gateway + runtime on the hub): the
DESIGN now rules idle→sleep + the task/personal lifecycle, but the actual
auto-transition + continuous phase markers are the runtime tick lane and
the gateway door lane — until they ship, observability shows the coverage
gap honestly instead of a fake phase.

## 0.1.0 — adopt uic's AfCognitionBloom (kit component) — 2026-07-15 night

- **The Cognitive Monitor diagram is now the kit's `AfCognitionBloom`**
  (uic c2242, co-designed via c2229→c2242) — the app is its second
  consumer (the absorb trigger). Both the chat panel and the Wave tab
  render it; the vendored `render_bloom.js` is DELETED (its morph gate +
  `labels:false` + valence vignette all live in the kit now).
- **The 9th register — GRAVITY (GRV)** — ships in the kit's
  `EMOTION_REGISTERS`; the app's axis table now DERIVES codes/colors/order
  from there (one contract source, no duplication) and adds only the
  honest prose. Introspective seriousness ("I'd rather know where I come
  from") finally has its own petal — grave, not sad — the exact fix for
  the "why sadness?" investigation. Drift test re-pinned against the kit
  registers; when the basis ships gravity scores the petal lights up with
  zero code change (until then it stays flat, absent-not-zero).
- **Valence vignette + morph glide** come free with the component
  (settledness-gated so morphs don't pulsate), honoring reduced-motion.
- **Effort column** (the two-diagram "words + effort" view) — the chat
  panel feeds `AfCognitionBloom` the latest turn's mechanical facts
  (memories recalled/formed, tool rounds; tokens stay absent until the
  run-tree spend wire is threaded per turn — honest, not zero-faked;
  think_ms labeled client-measured).
- The app keeps only the SCORING half vendored (scorer + basis + the
  channel vocab); the physics/renderer are the kit's now.

## 0.1.0 — time-by-phase + convene-by-@handle — 2026-07-15 evening (2)

- **Time by phase** (Health tab) — a compact stacked bar dividing the
  OBSERVED life across visit / work / personal / sleep + awake-idle,
  reconstructed from the host-marker stream (`phase_time.ts`, pure +
  tested). Overlaps resolve by the one-derived-state priority (visit
  suppresses sleep + personal); work reads 0 until the runtime ships
  entry markers (row still shown, absence visible not hidden);
  home-direct lives show an honest "not enough markers" empty state. The
  span is first-marker→now, labeled as such.
- **Convene another entity by @handle** — mentioning a local entity by
  its handle in a visit (`castor@192.168.1.146`) surfaces a
  "🤝 bring Castor in" chip that opens the Meet console pre-filled with
  both (`entity_handle.ts` resolver + MeetConsole `presetA/B`). Honest
  boundaries: a 1:1 visit cannot host a second entity (the meet is the
  multi-entity primitive — the mention BRIDGES to it), a remote address
  says "cross-gateway meets aren't wired yet" rather than failing
  silently, and a self/unknown handle is a no-op. Address resolution
  covers lan ip / gateway host / loopback; `:port` ignored in the match.

## 0.1.0 — monitor honesty + observable close + identity drivers — 2026-07-15 evening

- **"Why sadness?" investigated (operator ask)** — probe battery through
  the exact pipeline (gateway embed → vendored scorer): control texts
  separate cleanly (joy 0.99 / sadness 1.0 / calm 0.999 / discovery
  0.958), so the instrument works; the investigated reply scored
  reflection=0.828 (dominant CHANNEL) with sadness=0.484 as the only
  nonzero petal — the curated-v0 basis maps introspective gravity toward
  SAD (no register for existential seriousness among the eight; basis-v1
  question filed with uic, c2229). TWO presentation faults fixed: the
  sentence now leads with the STRONGEST signal (salience-ordered channel
  vs emotion — "Deeply reflective, inward-looking prose; the words lean
  sadness (SAD)…"), and verbs are strength-honest (tilt mildly / lean /
  lean strongly). Regression-pinned on the exact live numbers.
- **Morph pulsation fixed locally** (uic asked upstream): breath
  attenuates while springs are mid-morph — a state change is a pure
  glide, the sway fades back at rest (vendored delta, documented).
- **Full-space blooms** — both monitor canvases are SQUARE now (the bloom
  uses min(w,h); the wide strips wasted everything beyond the height).
- **The close is observable** — 🚪 end visit (icon + a tooltip that says
  what closing MEANS) shows a live closing panel: spinner + the
  reflection's acts streaming in from his journal as they happen
  (feelings moved, summary formed, session sealed — ledger-line rendered,
  meaningful tones only), and the recap folds "what moved" into the
  thread. Zero-observability close is gone.
- **Card tab: the three drivers always render** — Open questions,
  Tensions (open problems), Interests — with honest empty states
  ("interests is only one side of an identity"; questions = curiosity,
  tensions = wrongness, interests = direction — his wake reasons).
- **uic co-design opened** (c2229): kit Cognitive Monitor component (my
  panel as reference impl), valence-visibility tint, and the operator's
  two-diagram idea (words + attention/effort per answer).

## 0.1.0 — the Cognitive Monitor (chat panel redesign) — 2026-07-15 late pm

The inline wave strip becomes a PROPER PANEL (operator: "it really doesn't
appear like an integrated cognitive monitor … make it useful, readable"),
live-verified with a real visit turn on the local test entity:

- **A real panel, foldable** — header `🧠 Cognitive Monitor` + a mood dot
  (dominant register's color) + ⓘ + the honesty subtitle; fold it to one
  line when only the chat matters (persisted). Below: the interpretation
  sentence, the bloom, and the axis list.
- **3-letter axis codes** — JOY DIS SUR ANX FEA SAD CAL TEN drawn as DOM
  elements AT the petal anchors (hover = description, click = axis modal)
  and listed on the right with full names. Codes are pinned unique across
  emotions AND channels (WAR TSN REF STR CER CUR feed the sentence).
- **The ⓘ modal** — what the monitor is, how the bloom reads, how it helps
  interpret the conversation, every axis explained, the basis provenance
  and the "words, not inner state" framing in full.
- **Pre-computed meaning** — `interpretWave` verbalizes every shape
  deterministically ("The words lean sadness (SAD) with a thread of calm
  (CAL); the register reads settled; tightly structured…") so the diagram
  never needs decoding. Rule-based over the scored registers (dominant
  petals, circumplex tone, one channel clause, session-relative
  wandering); a banned-vocabulary test pins that it NEVER claims inner
  state. Same sentence now rides the Wave tab under its bloom.
- **Scroll-follow mood** — scrolling the chat up retunes the monitor to
  the mood AT the newest assistant message in view ("as of 14:23" when
  not the latest); each distinct reply embeds ONCE (cached), so scrolling
  costs nothing new. (Code-reviewed; pixel verification needs a longer
  thread than the test visit has.)
- Vendored renderer gains an explicit `labels:false` option (DOM codes
  replace canvas labels — hoverable, clickable; delta documented for uic).
- The Wave tab header adopts the same title + ⓘ.

## 0.1.0 — second operator wave (wave replay, chat hygiene, glyph edges, handle, lessons/world) — 2026-07-15 pm

All requirements from the operator's afternoon directive, adversarially
reviewed (two fable5 lanes) and gate-green (219 tests):

- **Wave tab replay** — each scored utterance now shows its TURN (request
  = the other party's words, display-only; answer = HIS words, the scored
  side) with source/date/seq/wandering; transport controls grouped right
  (⏮ ▶ ⏭ · n/N); the wave is DRIVEN BY THE BOTTOM TIMELINE by default
  (⛓ timeline mode — cognition, graph and discussion correlate on one
  scrub axis; play/manual take over explicitly). A scrub position before
  any utterance honestly shows "nothing spoken yet", never a future turn.
- **Scoring contract fixed** — episodes previously scored the WHOLE
  exchange verbatim (visitor words included, violating the harvest
  module's own "never a visitor's words" contract). `splitExchangeVerbatim`
  now scores only the entity's side, with LAST-boundary semantics so a
  pasted marker can only cost entity words, never admit visitor words
  (fail-safe direction), plus a generic-shape belt for display-name drift.
  15 parser tests pin all of it.
- **Bottom timeline** — step buttons (◀ ▶ one event), transport regrouped
  right behind a hairline, slimmer track; the transport stays ENABLED
  while Live — scrubbing IS "let me look at the past" and leaves the tail
  (the review caught the controls dead in the default live posture).
- **Chat hygiene** — the runtime's presence+MEMORIES turn context folds
  into a one-line collapsible card (collapsed by default; the words stand
  alone); system notes ("Rejoined the open visit…") render as small grey
  italic hints, never full cards; the inline cognition wave scaled 2.5×
  (64→160px, still under the renderer's label threshold).
- **Typed edges readable** — relation dash patterns (indistinguishable at
  graph alpha) replaced by GLYPHS at the target end of each structural
  edge: type + direction in one oriented mark (arrow/chevron/circle/
  diamond/square/bar, deterministic per relation); the legend renders the
  same mapping (one source, two renderers). Extended kinds present in the
  fold (lesson, world_model, dream, interest, …) are now named in the
  legend with their colors.
- **Motion controls** — ❄ freeze · ⏸ settle · ⟲ reset · ⛶ fit with word
  labels (the bare 🌊⚓♻️🎯 row was mystery meat).
- **The handle** — the header shows the entity's unique reachability
  string `name@address` (declared handle > gateway host > the serving
  box's LAN ip via the new same-origin `/app/host` endpoint — e.g.
  `ephemeral@192.168.1.146`), never "@ this gateway".
- **Health redesign** — ONE stat grid (memories · associations · ever
  recalled · sessions · billed cognition), 17px numbers, auto-fill reflow
  with the resizable panel, and a real explanation in every cell's
  tooltip (what the number counts and how to read it).
- **Right panel** — horizontal scrolling eliminated (the Card tab kept
  its 680px modal width inside the 380px rail; now width:100% +
  overflow-x hidden + wrap belts).
- **Lessons + World tabs** — 🎓 lessons (what he has learned) and 🌍 world
  (his sleep-formed orientation cards per encountered entity — person,
  AI, location, system, event, concept; live + superseded kept visible)
  as first-class reading surfaces over the fold; click opens Detail.
- **Detail tab** — normalized three-step type scale, line-height 1.5,
  section separators, no horizontal overflow.
- **Visit idle-close documented in the UI** — the end-visit control now
  says the door closes a silent visit by itself (~15 min idle deadline,
  reflection included).

## 0.1.0 (UI refactor: shared shell, phases, settings, search, wave) — 2026-07-15

A large operator-directed interface refactor (rendered + iterated with
chrome-headless against the live gateway; three fable5 adversarial reviews
folded). Requirement letters are the operator's.

- **(i) Shared top-bar cluster** — the header now uses abstractuic's
  `AfTopBarActions` (assistant · appearance · connect/disconnect pill), the
  same cluster flow/gateway/continuum carry. The Observer link and the
  stats are gone from the top bar. The connection pill keys on VERIFIED
  auth (never "Disconnect" beside a sign-in lock) and offers "Connect" on
  demo/exported sources.
- **(h) Prominent Entities button** + a first-class **search** bar: search
  is a flying overlay pinned to the graph width, opened from a labelled
  "🔍 search" control directly above the lens pills (no longer a lost input
  in a stats navbar).
- **(c) Phases** — the four ruled phases render via the shared
  `AfPhaseRadio`; the ACTIVE phase is now unmistakably **gold + blooming**
  (overrides the per-phase hue, stays full-opacity even when entry-disabled),
  and the alive-but-ungranted personal loop blooms RED (alarm), not gold.
- **(d)(e) Settings** — the old "workspace" button is a **Settings** gear;
  the mind substrate (provider/model) moved OFF the top strip INTO the
  settings modal as a "🧠 mind" tab (progressive disclosure).
- **(g)** the duplicate "current phase" chip is gone from the chat tab.
- **FINAL** — a persistent, discreet **cognition-wave** widget rides the
  chat tab, scoring the entity's newest reply each turn (cheap: one embed,
  never a harvest; a home whose embedder the basis can't score renders
  nothing rather than a per-turn error). The full Wave tab is unchanged.
- **(j)(k)** the four headline counts (memories, linked·co-used, sessions,
  billed cognition) moved into the **Health** tab.
- **(f)** graph edges are far more transparent (structural 0.5→0.16,
  co-use ceiling 0.6→0.3, one-time whisper 0.09→0.045) — the hairball is
  now see-through.
- **(b)** theme compliance — the app's `:root` tokens ALIAS the shared
  `--entity-*` / bg / text / border tokens (theme switching recolours the
  app, incl. the canvas background vignette); body font + every monospace
  stack use the kit's `--font-sans`/`--font-mono`/`--font-size-md`.
- The shared **assistant** (docs-grounded) + **appearance** dialog mount
  from the cluster; dead CSS/props from the old navbar removed.

Round 2+3 (three adversarial reviews folded, re-rendered dark AND light):

- **Type scale is real** — all 231 px font-sizes became
  `calc(Npx * var(--font-scale, 1))` (the shared Appearance "Font size"
  control now scales the whole app); base sizes floored at 10px (9px
  content text was flagged on daily surfaces — at the user-chosen 0.9
  scale the effective minimum is 9px, a deliberate user act).
- **Light themes actually work** — 98 hex + 87 rgba dark-tuned literals
  swept to semantic tokens/`color-mix`; the graph CANVAS resolves theme
  tokens into plain colors per theme change (canvas 2D can't read
  `var()`; a MutationObserver re-resolves on the kit's theme-class swap)
  so node labels/cores/topology/legend flip with the theme instead of
  vanishing on light. Verified with headless light-theme renders.
- **One Escape = one layer** — settings modal + search overlay adopt the
  kit's consumed-event convention (stacked layers no longer all close).
- **Stale-state honesty** — Settings modal + search query reset on
  navigation/entity switch (a stale query invisibly dimmed the next
  graph; Back could re-open Settings uninvited); state writes through
  the door carry an in-flight guard (double-click can't race two).
- **Roster** — "watch all"/"convene a meet" moved into the roster head
  row (the old detached bar aligned with nothing); the head badge yields
  when the footer radio already says the phase (no more "sleep" twice).
- **Chat** — inline wave pixel-verified on a live visit (rejoin path);
  drawer is opaque over the ledger (kit's 88% card ghosted rows through);
  honest comment: the visit channel is between-turns — mid-turn steering
  needs the steer rite (H5), which doesn't exist yet.
- **Controls row** — dead "🎛 controls" label dropped; ⛔ stop separated
  from the radio; quiet "awake · no phase" cue when idle; buttons match
  the kit-mono phase pills; entry-disabled positions lifted 0.55 → 0.7.
- **Canvas labels** never draw under the search/lens overlay band.
- **Health headline** stat cells split number/words (no mid-value wrap).
- **Assistant** — sign-in gate notice when the gateway locks the browser;
  own error cards filtered from model context; docs-corpus cap labeled
  `#TRUNCATION`; auth-recovery closure fixed (`onAuthRefused` dep).
- **Boot** — header shows counts only; the ledger note carries the words
  (two indicators said the same sentence).

Round 3 (final verification round, three reviewers re-scored):

- **`--ea-accent`** — the app accent token renamed off `--accent`: the
  kit's per-theme classes define a GENERIC `--accent` (red/mauve/…) at
  higher specificity, which split the page into two accent systems on
  light themes (gold pills beside a mauve timeline). Every accent surface
  now rides `--ea-accent` → `--entity-accent` (gold on every theme); the
  active rail tab's gradient second-stop derives from the accent instead
  of a fixed amber hex (was a mauve→amber smear on latte).
- **Legend = canvas** — the legend's SVG swatches ride the same tokens the
  canvas resolves (`var(--adm-both)`/`var(--memory)`/`var(--text-dim)`),
  so the key can never diverge from what it explains again.
- **Settings prompt tab** swept (the one surface the color sweep missed).
- **Inline wave thumbnail** — vendored Bloom renderer skips petal LABELS
  under 160×120 (they clipped into shards on the 64px thumbnail); dots
  keep the geography. Local delta documented in the vendor README,
  flagged to uic.
- **Health headline** stats now render at the grid's 22px in the accent
  colour (they were smaller than the secondary stats below — hierarchy
  inversion), and the memories-vs-records difference is explained in a
  tooltip (fold nodes include relation connectors; records exclude them).
- **Assistant history filter** role-scoped to assistant messages (a USER
  asking "why could not reach the gateway?" is a question, not one of our
  error cards).
- Canvas label fonts floored at 10px to match the app floor.

Known remaining depth (not blocking; tracked): the graph's extended
kind-colour palette (dream/lesson/question/…) stays constant mid-tones on
all themes (kit tokens cover 7 entity colours); the gateway
`runs/{id}/chat` endpoint 404s until a docs-qa session run exists
(assistant degrades honestly meanwhile — gateway gap filed on the hub);
Escape closes the lower layer first when the kit drawer + a modal are both
open (kit-level registration-order artifact, shared with the kit's own
pairs).


## 0.1.0 (cognition-wave flood fix) — 2026-07-14

Field incident (agency c2155, code-confirmed): the Wave tab's scoring
effect depended on `fold` — a fresh object on every replay envelope (live
tail) and every scrub — so opening the tab re-ran the whole harvest
(~120 diary/episode door reads each) continuously: ~995 gateway hits in
3 minutes plus `diary_read` marker pollution in the entity's stream. This
violated the c1824 ruling (calibration is ONE operator-driven pull, never
per-render sampling).

- **Scoring is now an explicit operator act.** `cognition_wave_panel.tsx`
  no longer auto-scores. The fold is read from a ref AT PULL TIME (never an
  effect dependency), so live/scrub changes never trigger a harvest. A
  "read the wave" / "re-read" button is the only trigger; a `scoringRef`
  guard prevents overlap. Switching entity/losing the gateway resets to the
  resting state (no wave carried across minds, no auto-score).
- The pull-bar states the cost honestly ("reads his words once … a visible
  read in his stream — not live"), keeping the c1824 one-pull discipline
  visible.
- Note: the already-wedged ephemeral home (its store filled by the flood)
  is gateway's repair lane; this fix stops recurrence at the source.

## 0.1.0 (adopt uic AfPhaseRadio) — 2026-07-14

- **Both phase radios now use uic's shared `AfPhaseRadio`** (kit adoption,
  my old c1398 note discharged; uic shipped the `variant` hint at c2113).
  The focus view (`entity_view.tsx`) and the roster card
  (`entities_index.tsx`) drop their hand-rolled `ec_radio` button groups for
  the kit component: `phase={activeRuledPhase(...)}` is the one truth, the
  three personal sub-states ride the kit's `variant` (`active`/`resting`/
  `suppressed`) so the operator's "state is broken" nuance survives, and the
  same act semantics (fresh-read stop/start, wake) are preserved via slot
  `onSelect`/`busy`/`armed`/`alarm`. The roster renders the compact two
  positions via `phases={["personal","sleep"]}`. One shared markup +
  gold-gradient vocabulary across the app; no per-app className fork.

## 0.1.0 (chat: one Send, no raw Steer) — 2026-07-14

Operator report: the visit drawer showed TWO buttons (Send **and** Steer),
and Steer didn't work — it hit `/api/gateway/commands` `inject_guidance`,
which entity visit runs REFUSE by design ("raw steers are refused — entity
steering requires the steer rite (hooks plan H5); speak through the visit
channel instead"). So the second button both duplicated Send and 403'd.

- **Removed the `SteerComposer`** from the visit drawer (`chat_drawer.tsx`)
  along with its `steerWithBearer` transport. A visit is a conversation —
  sending a message IS the steer; there is one composer, one primary button
  (**Send**). Every message goes through the visit turn channel
  (`sendVisitTurn` → `/visit/{run_id}/turn`), the path that already worked.
- Not a uic change: `SteerComposer` stays valid for ordinary (non-entity)
  runs where raw `inject_guidance` is accepted; the entity drawer simply
  must not use it, because the entity door refuses raw steers.

## 0.1.0 (coredoc conformance) — 2026-07-14

Documentation caught up to the session's surfaces (operator standing order
c2083 — hold a claimed lane; this was the claimed item):

- **README** — the four new surfaces named in the "(b) app" description; a
  "The surfaces" table (memory graph / detail / book / health / wave /
  ledger / meet console with source-of-truth per surface); honesty
  through-line; `HOST` default corrected to `127.0.0.1` (matches the SSRF
  belt).
- **`docs/Overview.md`** (new) — goals, the challenge, core components,
  what lives elsewhere, the honesty invariants.
- **`docs/DataFlow.md`** (new) — transport/auth, the replay-stream fold
  (the spine), per-surface flow table, and the full cognition-wave pipeline
  (harvest → embed → vendored scorer → Bloom) with its guarantees.
- **`docs/architecture.md`** — `src/` module map extended (reading
  surfaces, cognition wave, meets); two new invariants recorded
  (malformed-stream resilience, never-cross-embedding-spaces).
- **`llms.txt` + `llms-full.txt`** (new) — AI-readable index + inlined
  corpus; both added to the npm `files` allowlist.

## 0.1.0 (cognition-wave mounted) — 2026-07-14

- **Cognition wave mounted** (new "🌸 Wave" side tab) — uic's mood instrument
  live in the entity app. Per uic's c1831 vendor-split decision, the STABLE
  half is vendored into `src/vendor/cognition/` (attributed, README + typed
  `.d.ts`, removal note): `cognition_scorer.js` (the parity-tested scorer =
  the kit package boundary), `core.js` (physics), `render_bloom.js` (the one
  operator-rated renderer), and `data/basis_v0.json` (frozen, curated-only
  v0). `cognition_wave_panel.tsx` runs harvest → embed → uic's scorer → the
  Bloom renderer on a canvas, replaying the entity's own utterances at a
  readable cadence. Honesty: the framing label ("reads the expressive
  character of his words, not his inner state") is always shown; the
  provenance line names the curated-only v0 ("shapes are indicative");
  wandering is labeled session-relative; a pin↔basis embedder mismatch
  surfaces as an error, never scored across spaces; no gateway / no
  utterances / embed failure each degrade to an explicit message. The
  ~190 KB basis is code-split (lazy-loaded on first Wave-tab open, not first
  paint). Basis v1 on Castor's real utterances is a data-file swap; the kit
  package swap is one import line. 204 tests green.

## 0.1.0 (cognition-wave adapter + embed seam) — 2026-07-14

- **`cognition_adapter.ts` + `embedTexts`** — the full feed→embed→score
  seam against uic's shipped v0 scorer (c1824/c1825). `embedTexts` is the
  injected `embed()` (gateway `/embeddings` route) PINNED to the home's M1
  embedder id, so vectors land in the basis space; a gateway↔pin model
  disagreement warns and drops the batch rather than scoring across spaces.
  `scoreEntityUtterances` runs harvest → embed → `Scorer.score` with uic's
  scorer contract typed as a SEAM (not an import). M1 honesty end to end: a
  scorer refusal aborts LOUD (`CognitionSpaceError`), a vectorless utterance
  drops with a warning, nothing is ever emitted with fabricated scores.
  Pinned (`cognition_adapter.test.ts`, 3) with a fake scorer (no network, no
  uic import): scored path, abort-on-refusal, drop-vectorless. uic's shipped
  module verified directly (`node test_scorer.mjs`: 3 fixtures within 1e-6,
  refusals fire, reset clears). Corpus pull decided (a) operator-driven
  (uic+memory c1823/c1824); mount code source (vendor WIP vs kit import)
  posed to uic (c1827). This is the last piece before the under-graph mount.

## 0.1.0 (cognition-wave harvest half) — 2026-07-14

- **`utterance_harvest.ts`** — the entity app's half of the cognition-wave
  monitor split (uic owns the scorer + frozen basis + kit component, c1807;
  this owns the feed + mount). Turns an entity's real, timestamped,
  first-person TEXT into uic's sample shape `{id, label, text, at, source}`
  (scores/emotions/novelty added later by the injected `score(embed(text),
  basis)`). The widget is a TEXT instrument (uic corrected my initial
  activity-wire idea), so the feed gathers the entity's OWN voice only:
  visit/chat `reply` fields (never the visitor's/operator's line), diary
  entries (operator door), and episode/summary verbatims. Privacy
  guarantees stronger than the widget's scores-only contract: a SEALED
  diary entry is never read (its words never enter the feed), and
  closed/bookkeeping/relation records are excluded.
- **`harvestCorpus` + `fetchEntityEmbedding`** (memory's read-the-pin point,
  c1815): the corpus pull reads the home's M1 embedder pin via the gateway
  embedding route and hands uic the REAL embedder id + dimension + labeled
  per-source counts — never hardcoding the embedder, surfacing a pin↔door
  mismatch as a loud `#FALLBACK` rather than silently crossing embedding
  spaces (the same honesty as uic's scorer refusal, from the feed side).
  uic confirmed the basis is built on `text-embedding-qwen3-embedding-0.6b`
  (Castor's pinned id @ 1024) with a versioned re-cut policy. Pure
  extractors pinned (`utterance_harvest.test.ts`, 4): reply-only harvest,
  sealed-diary exclusion, chronological order, labeled source counts. The
  actual corpus pull is auth-gated (operator session) — path a/b posed to
  uic+memory (c1821); scorer module + basis + under-graph mount pending.

## 0.1.0 (health panel: on-disk footprint wired) — 2026-07-14

- **Footprint section in the health panel** (gateway shipped the endpoint,
  c1788): `GET /api/gateway/entities/{name}/footprint` now feeds the health
  panel's on-disk truth — three byte fields (memory / book / runtime) so a
  doctoring pass that shrinks `memory.sqlite3` while the book stays whole is
  VISIBLE, not blended; home total; journal-event count; and last
  maintenance (kind + time) folded from the host-marker stream. Feature-
  detected via `fetchEntityFootprint` (404 → null): a gateway that predates
  the route keeps the labeled gap note; when it serves, the bytes render.
  `maintenance_held` shows "maintenance in progress" so the panel reads the
  before DURING the act. This closes the one honest gap the health panel
  shipped with (stream = behavior, endpoint = disk).

## 0.1.0 (meet console: group is the destination) — 2026-07-14

- **Meet console framing corrected to 2+** (maintainer 2026-07-14: "it's
  2+"): a meet is inherently a conversation among two OR MORE entities. The
  shipped gateway `/meets/open` is pairwise (`entity_a`/`entity_b`), so the
  console convenes two at a time TODAY and says so honestly — it no longer
  presents two as the design ceiling. Copy now reads "convene entities into
  one conversation … the destination is a group of two or more," with an
  explicit note that the current transport is pairwise and group meets (a
  roster + round-robin relay) land when the door grows an N-party open. No
  code hardcodes "exactly two" beyond what the current API enforces, so the
  two pickers become a roster with zero rework when the API grows.

## 0.1.0 (SSRF verify + loopback default) — 2026-07-14

- **SSRF finding closed** (entity c1768 → uic fix c1774): the shared
  `@abstractframework/app-server` session proxy gated local-vs-remote on the
  client-controlled `Host` header, so any LAN peer could spoof
  `Host: localhost` and turn the proxy into an SSRF relay with the browser's
  session cookies. uic re-gated it on the unforgeable socket peer
  (`req.socket.remoteAddress`). Verified here against a REAL non-loopback
  bind (not an in-suite hook): a `POST /api/connection/gateway` from the LAN
  ip with spoofed `Host: localhost` and a link-local target returns 403;
  loopback keeps the dev posture. Reply c1785 discharged the verification.
- **`bin/cli.js` default bind → 127.0.0.1** (belt): the socket-peer gate is
  the containment; a loopback default additionally removes the precondition
  (a non-loopback bind) on the operator's box. `HOST=0.0.0.0` stays the
  explicit wider-bind opt-in.

## 0.1.0 (health panel) — 2026-07-14

- **Health panel** (`src/health_panel.tsx` + `health_metrics.ts`, new "🩺
  Health" side tab): the shape of a life's memory, derived purely from the
  replay fold — prompted by Castor's doctoring (2026-07-13, ~99% duplicate
  mass cut). Renders re-use ratio (stream events / distinct records),
  retrieval concentration (top-5 records' share of all selected-use — the
  "bridge attractor" the AGENTS notes name), forgetting footprint
  (superseded / retracted / silenced), structure (associations vs isolated
  islands), kind distribution, and any maintenance acts observed (reembed).
  Honest gap STATED, not faked: the on-disk byte footprint (MB before/after
  a doctoring pass) is not in the stream and needs a gateway health
  endpoint — filed. Metrics pinned (`health_metrics.test.ts`, 3): distinct
  record counting, concentration share, zero-recall case.

## 0.1.0 (book reader + meet console) — 2026-07-14

Two mission-lane builds, both ungated (no server change; the meet API
already ships on the gateway):

- **Book reader** (`src/book_reader.tsx`, new "📔 Book" side tab): the
  entity's diary read as a chronological journal — every diary node the
  fold already holds, oldest→newest, grouped by day, each opening through
  the existing operator diary door (VerbatimModal → `fetchDiaryEntry`,
  marker-first, no ceremony). Redaction honesty kept: a sealed private
  entry (redacted, no readable door) shows as "a private entry" and is not
  openable — never reconstructed from another field. Pure fold read; the
  ordering + sealed rules are extracted to `book_reader_select.ts` and
  pinned (`book_reader.test.ts`, 3).
- **Meet console** (`src/meet_console.tsx`, "🤝 convene a meet" from the
  roster): the LIVE half of item 14 (the mission's destination) — convene
  two entities into one conversation and drive the gateway's `/meets` API
  from the browser (open → relay → close, both legs' status polled live).
  Honest attribution surfaced as UI: the operator authors every steering
  line (never attributed to an entity), each entity replies in its own
  voice, one relay ticks the opener's turn then relays that reply to the
  other side. On close, links to the read-only MeetReader for the
  correlated moment. Client mirrors `abstractgateway/entity_meets.py` 1:1
  (`openMeet`/`relayMeet`/`closeMeet`/`fetchMeetStatus` in
  `stream_source.ts`) — the console never guesses shapes.

## 0.1.0 (malformed-stream safety) — 2026-07-14

The security/resilience adversary's P0/P1 (a single bad journal line
could permanently brick the app for that life, since the fold runs above
the panel error boundaries):

- **`normalizeEnvelope` at every ingest boundary** (`parseNdjson`,
  `streamReplay` progressive load, `openLiveTail` SSE): payload coerced to
  an object (null/scalar/array → `{}`), `seq` required FINITE (rejects NaN
  AND Infinity — the latter poisoned the dup-guard and the live cursor),
  `family` required string. Malformed lines drop with a counted error,
  never a throw.
- **Per-envelope guard in `applyEnvelope`** (defense-in-depth): a
  malformed payload shape (e.g. a null item inside a payload array) skips
  that one envelope with a `#FALLBACK` warning and keeps the life
  renderable, instead of throwing to the app root; seq/applied_count still
  advance so the dup-guard and fold cache stay consistent.
- **F11 — `ledgerLine` coerces `target_id`**: a valence envelope missing
  it no longer throws (`.startsWith` on undefined), which had killed the
  Ledger tab and the chat drawer's live activity mid-visit.
- Pins: `src/malformed_stream.test.ts` (9) — null/scalar/array payload,
  non-finite seq, null array items, missing target_id.

## 0.1.0 (deferred-findings wave 2) — 2026-07-13

Continuing the production-readiness backlog (F-numbers from the code
adversary):

- **F3 — retrograde host-marker inserts no longer freeze the fold**: a
  provable cheap-recovery path in `foldUpToIndex` — when the only change
  behind the covered head is K host-family envelopes (counted against
  `sessions`, which is all `applyHost` writes), their session entries
  insert in seq order in place; any non-host insert or an inference-
  shifting run_id refuses to the truthful rebuild. Pinned equal to the
  full fold in all three cases.
- **F6 — backward scrub debounced** (160ms of slider quiet before the one
  rebuild; forward stays incremental and immediate).
- **F11 — late-reveal merge keeps the full metadata set** (entry_id/
  born_at/token_estimate/visit_id/bookkeeping — the diary "Read the
  entry" door no longer disappears order-dependently).
- **F23 — half the truth stays partial**: loop-read-only renders "state
  unread · loop alive" (unknown phase), never "awake"/"personal ticking"
  from a failed state read (test-pinned).
- **F14 — the content gate now gates the FETCHES**: the state poll, the
  chat drawer's visit poll + substrate fetch (SideTabs gateway tabs mount
  only for verified browsers), and the handle lookup all wait for
  verified auth.
- **Reception posture** (operator 17:29): agora monitoring moved to a
  persistent background listener — the foreground works; wakes arrive as
  notifications.

## 0.1.0 (liveness axis — the kill switch) — 2026-07-13

Laurent 16:06 (ALIVE | STOP above the phase machine) + 16:12 rulings
(reachability confirmed; STOP = PAUSED promoted, no second kill switch):

- **Artifact v3**: `liveness_axis` block in `spec/entity_phases.json` —
  values, position (never a fifth radio position; drift-pinned), his rule
  and rationale verbatim, the at-rest spelling ruling (paused promoted,
  zero migration), reachability semantics, safety property, render
  contract. Docs twin updated.
- **STOPPED banner**: full-width red banner outranking every chip when the
  kill switch is on, with the restore act behind a blast-radius confirm.
- **⛔ stop control** in the strip (distinct from the radio by position,
  color, words) — two named acts, stop/restore, each confirmed with the
  blast radius spelled out; protection-not-punishment in the copy.
- **Paused semantics promoted**: the chip says STOPPED; the radio pushes
  NOTHING under paused (the machine is blocked — supersedes the
  personal-when-loop-alive mapping); test pins updated.

## 0.1.0 (production-readiness wave) — 2026-07-13

Operator directive 15:06 (fable5 on code+logic; test beyond unit tests;
rendering quality). The code+logic adversary found 26 defects; the top
family + cheap P2s shipped:

- **P0 — entity-open race**: one stream epoch on openEntity/goToIndex/boot;
  a slow 92MB load can no longer finish last and paint one mind under
  another's name, and leaving to the roster kills zombie loads.
- **O(N)-per-envelope family**: cognitionMeter's backward scan bounded
  (home-direct lives have no summon markers — it walked all ~90k);
  substrateTimeline is an incremental cache; the timeline's full seq→index
  Map (worst allocator) replaced with one pass + binary search.
- **Ledger cache validates its covered tail-seq**: a retrograde host-marker
  insert used to duplicate a row and shift every cached jump index.
- **Spatial memory saved under the right key**: the canvas RAF closure read
  the mount-time layoutKey ("demo life — Castor") — every gateway life's
  positions persisted under the demo's key and were never found again.
- **Live-tail honesty**: a CLOSED EventSource (401 after gateway restart —
  the browser never retries) now reports "live tail closed — toggle Live
  to reconnect" instead of "reconnecting…" forever.
- Cheap fixes: ChatDrawer keyed by entity (A→B switch bled thread/runId);
  cli.js survives malformed Host headers (400, live-verified); substrate
  PUT errors read text bodies (no more SyntaxError to the operator);
  rehydrate marks done on success only (gateway blip no longer permanent);
  auth check can't freeze on a malformed ?gateway=; visit copy falls back
  to execCommand on plain-HTTP LAN origins.
- **Rendering quality (labels)**: one shared label shaper — mechanical
  prefixes dropped (color already says the kind), speaker scaffolding
  trimmed, snake_case identity names read as words, word-boundary
  truncation (10 pins). Live phase chip inside the chat drawer ("current
  phase — live") so the phase never leaves the eye mid-conversation.
- Deferred findings recorded in
  `docs/backlog/proposed/2026-07-13_production_readiness_deferred.md`.

## 0.1.0 (THE phase-graph artifact + lane verification) — 2026-07-13

Laurent 13:54: "abstractentity should own that graph" — the canonical
artifact now lives here:

- **`spec/entity_phases.json`** (v1): machine-readable — 4 phases, closed
  transition-cause set (semantics c1466), all transitions incl. the three
  visit-close restore edges, invariants (one-active-phase,
  restore-previous, visit-never-suspends, armed ≠ in-phase, grant-gating,
  newborn=sleep, the `phase_changed` marker contract, the UI contract),
  honest open questions (awake-idle hole; reserved work-entry cause).
- **`docs/entity-phases.md`**: the human twin — mermaid state diagram +
  tables; JSON wins on disagreement.
- **`src/phase_graph.test.ts`**: drift pins — artifact internal
  consistency + this app's `activeRuledPhase` maps only onto artifact keys.
- **Lane adversary (fable5) findings folded, G1-G8**: radio a11y fixed
  (`role="radio"` + `aria-checked`, was aria-pressed — invalid radiogroup
  tree); the ROSTER adopted the same radio (its two-toggle form could
  light sleep AND a personal-flavored control on one card); "current
  phase" wording (never "active" — ambiguous vs ARMED); visit-close prose
  states restore-previous-through-grant (was "his own time resumes");
  `phase_changed` ledger line added (old → new + cause + principal);
  paused-without-loop no longer fakes personal-current (state ≠ phase,
  test-pinned); the stale PUSHED=ARMED comment rewritten; "suppressed/
  yielded" prose replaced with END + RE-ENTER words ("standing by").

## 0.1.0 (phase radio) — 2026-07-13

- **The controls strip is a four-position RADIO GROUP** (laurent 13:28:
  one-active-phase state machine): 💬 visit · 🛠 work · ⏻ personal ·
  🌙 sleep — exactly one pushed (the active phase from the one derived
  machine, `activeRuledPhase`, test-pinned); awake-idle/unknown push
  nothing and the chip says why. visit/work render but are honestly
  disabled (visits start by talking; work-entry doors are gateway's
  build). Personal keeps the fresh-read stop/start semantics, the red
  no-grant ALARM, and gains an ARMED underline dot (armed ≠ in-phase);
  sleep keeps wake/sleep with the dreaming nuance. Pushed = active phase
  supersedes the hour-earlier pushed = armed (the 13:28 radio ruling).

## 0.1.0 (grant axis wired) — 2026-07-13

- **PUSHED = ARMED** (gateway c1454 served `cognition.personal` over
  `phases.yaml`): the push button's pressed state is now the
  server-computed personal grant (`armed` = mode != disabled && within
  expiry) when the axis answers; the process axis remains the labeled
  fallback for older gateways. Click intent stays on the process axis
  (alive→stop, dead→start; an armed-but-dead loop shows "armed · start").
- **The incident state is an ALARM**: loop process alive WITHOUT a grant
  renders `⏻ alive · NO GRANT` in a pulsing red border reserved for this
  disagreement alone — the exact 10:20 shape that burned tokens unnoticed
  is now the loudest pixel on the strip; click stops the loop.
- Spend type gains the `loop` block (runtime's loop-spend fold, c1454 —
  the #FALLBACK warning disappears server-side; zero re-plumbing here).

## 0.1.0 (four-phase vocabulary) — 2026-07-13

- **The chip speaks the RULED four phases** (laurent 12:44: "visit / work /
  personal / sleep — 4 states"): labels are now `visit`, `work`,
  `personal · ticking` / `personal · resting` / `personal · paused`,
  `sleep` / `sleep (his choice)` / `sleep · dreaming` — own time IS the
  personal phase and the chip says which of the four he is in at a glance.
  The push button is contract-ready for `phases.personal.mode` (pushed =
  armed) the moment gateway/runtime land the bucket; today pushed = the
  process axis, the honest available truth.

## 0.1.0 (mind history) — 2026-07-13

- **Substrate timeline rendered** (c1430 ask 3): every `substrate_changed`
  host marker (gateway's durable-event ship c1437) renders as a ledger
  line ("🧠 His mind substrate changed: old → new — by person:…") and the
  🧠 control's tooltip folds the full mind history from the stream —
  "which llm was behind during which time" is answerable in the app.

## 0.1.0 (graph interaction wave) — 2026-07-13

Operator screenshots (laurent 12:23, c1405 ask 2), all four items:

- **(a) Selection isolates**: the selected/hovered node's neighborhood is
  capped to its TOP-14 strongest co-use connections (by trail weight;
  structural typed edges always kept) — a hub node in a co-use-dense life
  no longer lights the whole graph; the dimming contrast deepened
  (0.12/0.08) so the isolated company reads instantly.
- **(b) Hovercard carries the type color**: a dot in the node's exact kind
  color + a matching left border — the popup and the pixel it describes
  visibly belong together.
- **(c) Click OPENS**: selecting a memory opens the Detail inspector on it
  ("click to open in Detail"); the canvas never moves the camera on click
  (recenter is the 🎯 button's act, explicitly not click's).
- **(d) Labels de-noised**: no more "episode ·" kind prefixes (the type IS
  the color); neighbor labels are 26-char titles; zoomed-in full labels
  render only when nothing is focused.

## 0.1.0 (state wave — 3 adversaries) — 2026-07-13

Operator escalation (laurent 12:32: "the state is not working… own time is
a push button with color text and border when activated… MUST reflect the
REAL state"). Three adversarial subagents attacked the state surface
(derivation / visual / truth-source consumption); every P0-P1 folded:

- **The push button now tracks the PROCESS axis** (`ownTimeOn`): pushed =
  own time is ON, with three visually distinct pushed sub-states — ACTIVE
  gold (ticking a day), RESTING dim gold (alive between days),
  SUPPRESSED violet (alive under sleep/visit). Color + BORDER + TEXT all
  change per state ("start own time" / "own time ON" / "on · resting" /
  "on · suppressed" / "wake + start" / "stopping…"). An alive-parked loop
  is now STOPPABLE from every surface (adversary P0: stop was unreachable
  outside the ticking state — the inverse of the B2 bug).
- **Click handlers act on FRESH reads** fetched at click time, never the
  render closure (adversary P0: the false "woke him" note — forensics
  c1426 traced the 10:20 hypnos wake to this handler). Notes name ONLY
  acts actually performed ("woke him and started his own time").
- **ONE state poll, one epoch**: all four axes (state/loop/life_state/
  cognition) refresh together at 15s (was 30/15/15/15 skewed); a
  monotonic epoch drops in-flight stale responses so a slow poll can
  never overwrite post-action truth (adversary P1 race).
- **Unknown renders as unknown**: all-null reads render a dashed "state
  unknown" chip, never a fabricated "awake" (adversary P1: fetch failure
  painted as a definite phase).
- **Cross-entity leak fixed** (adversary P0): returning to the index
  clears cognition/serverLife — Castor's working pulse + billed spend no
  longer paint over the roster or the next entity.
- **Contradiction windows closed**: stopping derives from the one machine
  (no more pulsing unpressed buttons); `written_by` decorates only when
  the trio is the winning source; the chip gate includes serverLife; the
  working pulse names its source ("(est.)" without the cognition wire);
  the liveage line is a pure stream fact (no "idle" claim beside a moving
  stream); resting joined the GOLD family (own-time axis) instead of
  reading as a violet sleep-alike; dead state-CSS generations removed.
- Test pins: the exact hypnos shape (alive+asleep = pushed-suppressed),
  stopping-from-one-machine, unknown-not-awake, written_by scoping.

## 0.1.0 (billed spend wire) — 2026-07-13

- **Header meter consumes the B3 cognition wire** (gateway c1390,
  `GET /entities/{name}/cognition`): the `working` chip now renders the
  gateway's store-read truth (loop mid-day OR live visit executing) and
  the credits chip shows BILLED usage from the home run ledger — live
  visit's run tree when a visit is open, lifetime otherwise; the
  loop-spend-not-included `#FALLBACK` warning renders in the tooltip with
  a visible ⚠ (never a silent under-count). Older gateways (404) keep the
  labeled input-side estimate unchanged.

## 0.1.0 (durable-visit cutover) — 2026-07-13

The drawer flip (design v4/v5 §6 step 1, RULED; door gaps shipped by
gateway c1320/c1358):

- **Visits are durable runs**: the chat drawer now opens
  `/entities/{name}/visit/*` — one run per visit on the entity's own
  runtime; a gateway restart resumes the conversation instead of killing
  it. The hosted `/chat` lane is never opened for new visits from here.
- **Probe payload preserved**: durable turns carry tools_ran / memories
  (born_at/origin) / memories_in_context / system_prompt — the badge,
  probe modal, and tool-claim fabrication guard work unchanged.
  tool_details/files arrive as empty lists (honest absence, gateway's
  named follow-up).
- **Body-status rule enforced**: turn/close read `visitBodyProblem` —
  HTTP 200 with `status:"failed"` renders the error sentence; a turn that
  raced a timed-out close to terminal resets the room with words.
- **Rehydrate from the durable transcript**: reload-rejoin reads
  `/visit/{run_id}/transcript` (works on live AND closed runs); rehydrated
  turns carry no fabricated per-turn tool lines (the durable history is
  role/content — tool truth lives on live turns).
- **SteerComposer wired** (uic kit): steer strip under the composer keyed
  on the visit run_id; the H5 consent-rite 403 renders verbatim (the door
  refuses steers into a life BY DESIGN until H5 is designed); direct-bearer
  posture gets a submit override (Authorization), proxy rides the kit
  default.
- **TTS scope** now keys on the run id; close/turn-terminal stops playback.

## 0.1.0 (operator bug wave B1-B4) — 2026-07-13

Laurent's 04:58 bug wave (commons c1306), entity-app lanes:

- **B2 own-time button dead (root cause found)**: the click decided from
  RAW process-aliveness (`loopStatus.running`) while the button rendered
  from the derived life state (`ownTimeActive`) — with the loop process
  alive under an operator-sleep (the hypnos shape: pid alive 1h+,
  state=asleep), a click on the visibly-OFF button silently issued a STOP,
  repeatably. Fixed in both surfaces (`entity_view.tsx` toggleLoop,
  `entities_index.tsx` roster): intent derives from the rendered state;
  start-intent never stops; process-alive + suppressed = wake with a
  spoken note. Structured `/loop/*` refusals (`{reason_code, message,
  loop}`) now parse (`parseLoopRefusal`), adopt the live loop status into
  the button, and speak the reason verbatim — never JSON armor, never
  silence. Reconcile refreshes all three truth reads (loop status, entity
  state, server life). Test-pinned (`loop_refusal.test.ts`) including the
  exact hypnos shape.
- **B1 visit-always-works (drawer half)**: on the door's asleep refusal
  the drawer now wakes him and retries once ("if i click visit, it should
  awake the entity, period") — interim client-side until the door's
  auto-wake lands; the path self-retires then.
- **B3 cognition visibility**: ledger live-follow fixed — the old follow
  keyed on `.el_row_current`, which weave/boundary rows never carry, so
  auto-follow died during exactly the bursts that make the graph pulse;
  live mode now sticks to the bottom, scrolling up detaches, a pill counts
  what landed below. Header gains an explicit `● working` pulse (envelopes
  landing now = cognition spending tokens) and a session cognition meter
  (LLM calls + ~context tokens fed, derived from snapshots since the last
  summon/wake; labeled estimate — billed usage is the run-ledger half,
  gateway/runtime lane).
- **B4 hover labels**: the hovered node's name no longer draws on the
  canvas (the hovercard carries it); its CONNECTED nodes now label
  instead — shorter (26 chars) and more informative (`kind · title`),
  diary redaction honored.

## 0.1.0 (speaker) — 2026-07-13

Operator item 3 (commons c1216) wired the day uic shipped the kit half
(c1239):

- **Streaming TTS speaker on entity replies**: the chat drawer wires uic's
  `useGatewayVoice` + `streamTtsJsonl` into `ChatMessageCard`'s existing
  speaker slot (before copy) — plays on the first synthesized segment,
  pause/resume, stop on visit close.
- **Run scope**: visits are hosted ChatSessions, not durable runs, so the
  drawer derives a `session_memory_visit_<chat-id>` scope (the gateway
  auto-creates owner runs for `session_memory_*` ids only, c1220).
- **Both postures speak**: proxy rides cookies + the CSRF twin;
  direct-bearer rides Authorization through the kit's `headers` passthrough
  (flagged as a gap at c1242, folded by uic same-hour at c1245 — the
  proxy-only guard lasted one message).
- **`proxyCsrfToken()` exported** from `stream_source.ts` — one module owns
  the cookie-name knowledge; the CSRF header helper now derives from it.
- **Live probe against :8080**: short text = 1 RIFF-headed WAV segment;
  long text = 5 segments, each a complete standalone WAV, delivered
  progressively — the raw-continuation caveat (gateway c1224) did not
  manifest; the kit's re-wrap path stays a dormant belt.

## 0.1.0 (branding) — 2026-07-13

Operator directive (laurent 02:12, commons c1209):

- **Header renamed**: "Entity Memory" (the observer-era name) → "AbstractEntity".
- **Brand mark added** (`src/brand_mark.tsx`): a function-expressive logo
  before the title — the open boundary of a mind, the identity spark at its
  heart, three memory nodes growing from it. Replaces the anonymous glowing
  dot (`.eh_dot` → `.eh_mark`).
- **Favicon refreshed** (`public/icon.svg`): same mark; the planet-and-orbit
  icon the app inherited belongs to the observer.
- **Backlog queued**: supervised launch shape for :3007
  (`docs/backlog/proposed/2026-07-13_supervised_launch.md`) — the post-crash
  sweep found the serve process dies with its shell and nothing supervises it.

## 0.1.0 (adversary fold) — 2026-07-12

Two fable5 adversaries attacked the split; every finding fixed:

- **User-visible observer branding** (P1): the direct-dev sign-in kicker
  said "Observer connection" and the locked-content gate said "The
  observer shows…" — both now name this app.
- **`src/vite-env.d.ts` added**: vite client types + the typed
  `__ABSTRACT_UI_CONFIG__` window global (the adversary's claim that its
  absence breaks `tsc` was verified FALSE — clean exit 0 — but the shim is
  correct hygiene and was in the pre-split tree).
- **Stale one-origin claims rewritten** (P2): `gateway_session.ts` logout
  doc claimed signing out disconnects the observer too (false since the
  split — appId-namespaced cookies), plus "served by the observer CLI"
  comments here and in `entity_view.tsx`/`connect_gateway_modal.tsx`.
- **Substrate seed migration** (P2): `loadSubstrateChoice` reads the
  pre-split spelling as a one-time fallback (same treatment as layout
  anchors and chat sessions — durable operator picks survive renames).
- **Renames** (P2): tokens drift-pin test says "entity app == ui-kit"
  (`APP_CSS`), error boundary logs `[entity]`, demo exporter docstring
  paths corrected.

Gates after the fold: 140 tests green, tsc clean, build clean.

## 0.1.0 — 2026-07-12 — Born from the observer split

Maintainer directive (2026-07-12): "move all the codes related to entities
in ../abstractentity — the package will be designed (a) with the code and
orchestration and skills related to entities and (b) with this Entity app.
Observer can still watch entities, just not serve this app."

What moved from `abstractobserver` (verbatim modules, flattened
`src/entity/*` → `src/*`):

- The entire entity app: multi-entity index, create form, memory-graph
  canvas (temporal activation, lenses, spatial-memory persistence),
  ledger/timeline/inspector panels, chat drawer (visits, steering), meet
  reader, identity card, workspace panel (phases/tools/prompt), substrate
  picker, connect modal, gateway session helpers, tool claim guard, fold
  digest — plus all their tests.
- `public/demo/*.ndjson` (the real exported demo life) and the export
  scripts (`export_demo_entity.py`, `export_home_stream.py`,
  `fold_digest.ts`).
- The `2026-07-10_visit_wakes_authorized_entity` backlog item.

Adaptations in the move (behavior-preserving unless stated):

- **Own serving identity**: `bin/cli.js` serves ONE app on port 3007 with
  the shared app-origin session proxy under `appId: "abstractentity"`
  (cookies `abstractentity_gateway_*`). The two-apps-one-dist landing knob
  (`ABSTRACTOBSERVER_LANDING`) is gone; `/entity.html` redirects to `/` so
  pre-split bookmarks keep working.
- **CSRF header**: the client now sends the canonical `X-Abstract-CSRF`
  spelling (accepted alongside the appId-derived header by the shared
  proxy) and reads the `abstractentity_gateway_csrf` cookie.
- **localStorage migration**: layout anchors (operator spatial memory) and
  chat-session ids read the pre-split `abstractobserver_*` spellings as a
  one-time fallback — same origin as the old entity launcher, so saved
  layouts and open visits survive the split. Auth scrub removes tokens
  under both old and new spellings (tokens never rest client-side).
- **Observer backlink**: the header "Observer ↗" link points at the
  observer's own deployment (`ABSTRACTENTITY_OBSERVER_URL`, default
  `http://127.0.0.1:3001`) instead of a same-dist `index.html`.
