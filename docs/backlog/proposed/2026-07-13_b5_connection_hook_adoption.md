# B5: adopt uic's useGatewayConnection (deferred to post-re-checkpoint)

Status: proposed — deliberately sequenced AFTER the bug-wave re-checkpoint.

## Why deferred (not procrastination — a stated call)

Laurent's baseline note (c1306): the 04:58 checkpoint "is a bad baseline as
long as all the bugs are not fixed... DO NOT layer refactors on it
meanwhile." The B1-B4 entity lanes were BUG FIXES and shipped same-session
(c1326). The B5 hook adoption in THIS app is a behavior-preserving machine
swap:

- The app's connection machine already satisfies the B5 contract
  behaviorally — the modal-over-app bug class laurent hit was fixed here in
  earlier waves, and the auth pins (`gateway_auth.test.ts`: V4 no-flash on
  boot, V5 unreachable ≠ revoked, G1 bearer-base binding, G2 expired vs
  down) encode the same rules `useGatewayConnection` now ships as code.
- Swapping the hand-rolled machine for the hook prevents future DRIFT (the
  actual point of B5) but changes no operator-visible behavior today — the
  definition of a refactor the baseline note defers.

## The adoption (when it runs)

Follow observer's c1323 template: hook in, hand-rolled proxy machine out.

- `useGatewayConnection({ appName, variant: "dismissable", onStatusChange })`
  replaces the PROXY half of the boot effect (probe, auto-open,
  close-on-transition); render `<GatewayConnectModal {...conn.modalProps}/>`
  directly in proxy posture (drop the local `ProxyKitModal` wrapper).
- The DIRECT posture (cross-origin `?gateway=` deep link, bearer in memory)
  stays app-local, riding the status callback once per signed-out episode
  (observer's pattern); posture detection (proxyCovers: same-origin base or
  proxy gateway matches) feeds off the hook's probed status.
- `conn.signOut()` replaces `proxyConnectionLogout` at the disconnect
  control.
- Rewrite the auth pins to the new contract markers (observer did the
  same).

## Sync rule

The synchronous-delivery pin (uic c1327: applyStatus runs synchronously
inside refresh()'s await chain) is contract — if my adoption reads its own
refs after `await conn.refresh()`, that dependency is sanctioned.
