# Production-readiness wave — deferred findings (code+logic adversary)

The 15:06 wave's fable5 code+logic adversary reported 26 findings. The
top-5 family + six cheap P2s shipped same-session (see CHANGELOG). These
remain, in priority order, each with the adversary's fix direction:

- **F3 (P1) — retrograde insert = full O(N) refold.** A host marker landing
  behind the journal head rebuilds the fold from zero (~seconds at 90k).
  Direction: cheap apply path for host-family retrogrades (they only touch
  `sessions`), keep the rebuild for true reorders.
- **F6 (P1) — backward scrub refolds per slider step.** Debounce
  scrub-driven folds and/or sparse checkpoint folds (every ~5k envelopes).
- **F4 remainder — ledger triple pass per envelope** (visible filter,
  groupPairRuns, windowed anchor scan). Incremental like the line cache.
- **F11 (P2) — late-reveal node merge drops entry_id/born_at/token_estimate/
  visit_id/bookkeeping** (one merge direction copies less than the other;
  diary "Read the entry" disappears order-dependently).
- **F12 (P2) — fleet tiles drop retrograde host markers** (seq guard
  discards them; tile session counts undercount).
- **F13 (P2) — sleep toggles act on render-time snapshots** (apply the
  fresh-read-at-click pattern the own-time toggles got).
- **F14 (P2) — content gate does not gate the polls** (state poll, drawer
  visit poll, substrate fetch, listEntities fire from unverified browsers).
- **F19 (P2) — multi-tab, one visit**: storage-event listener to drop a
  runId closed by another tab; surface "another tab holds this visit".
- **F20 (P2) — no resume for the 92MB progressive load; Live toggle during
  boot can drop envelopes** (disable Live while bootProgress; since_seq
  resume on failure).
- **F22 (P2) — turnStartSeqRef stale envelopes closure** in the drawer send.
- **F23 (P2) — partial poll failure paints a definite life state** (carry
  per-axis nullness into the derivation; qualifier when entityState null).
- **F24 (P2) — AbortError surfaces raw; tickVisit (crash-repair verb) has
  no UI surface** — add a "resume the visit" affordance when a turn probe
  says running-not-parked.
- **F26 (P2) — per-frame edges array rebuild in the canvas RAF** (rebuild
  on fold identity change only).

Also standing: the supervised-launch item (2026-07-13) — the dev server
restart used a session-bound shell; production serving belongs under
launchd/supervisor per the launcher scripts pattern.
