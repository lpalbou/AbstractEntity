// Responsive capture screens for AbstractEntity (harness: untracked/responsive/harness/capture.mjs).
//
// Drives every main surface against the isolated fixture gateway (abstractcode/web/e2e/gateway_fixture.py,
// no model). The fixture has no entities and its test user may not create one, so the screens module
// serves a small, deterministic entity roster and the bundled demo life (public/demo/castor.ndjson) as
// Castor's replay through page.route — everything else (auth, session proxy, the other entity reads) is
// the real app talking to the real fixture through the app's own /api session proxy.
//
//   connect   → the shared sign-in dialog (signed out)
//   list      → the entities roster (signed in)
//   create    → the create-entity form
//   blueprint → the memory blueprint page (the wide cognition SVG)
//   detail    → one entity: memory graph + side panel (Detail tab), replay at the end
//   talk      → the Chat tab (conversation + composer)
//   cognition → the Wave tab (cognition wave panel)
//   settings  → the entity Settings panel
//   about     → the About dialog
//
//   node harness/capture.mjs --app entity --url http://127.0.0.1:18790 \
//        --screens scripts/responsive.screens.mjs --out <dir> --sweep
//
// Env overrides: ENTITY_E2E_GATEWAY_URL / _USER / _TOKEN (fixture defaults below).
import fs from "node:fs";
import path from "node:path";

const GATEWAY = process.env.ENTITY_E2E_GATEWAY_URL || "http://127.0.0.1:18789";
const USER = process.env.ENTITY_E2E_USER || "web-tester";
const TOKEN = process.env.ENTITY_E2E_TOKEN || "abstractcode-e2e-only";
const HERE = path.dirname(new URL(import.meta.url).pathname);
const DEMO_LIFE = fs.readFileSync(path.join(HERE, "..", "public", "demo", "castor.ndjson"), "utf8");
const ROSTER = {
  entities: [
    { name: "castor", slug: "castor", entity_id: "ent-castor", handle: "castor@local" },
    { name: "pollux", slug: "pollux", entity_id: "ent-pollux", handle: "pollux@local" },
    { name: "flowling-with-a-rather-long-name", slug: "flowling-with-a-rather-long-name", entity_id: "ent-flowling" },
  ],
};

async function installRoutes(page, baseUrl) {
  const origin = new URL(baseUrl).origin;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    // Hermetic: nothing leaves the app origin (the app also probes :8080 as a gateway candidate).
    if (url.origin !== origin) return route.abort("blockedbyclient");
    const p = url.pathname;
    if (p === "/api/gateway/entities" && route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ROSTER) });
    }
    const replay = p.match(/^\/api\/gateway\/entities\/([^/]+)\/replay$/);
    if (replay) {
      const since = Number(url.searchParams.get("since_seq") || "0");
      const body = replay[1] === "castor" && since === 0 ? DEMO_LIFE : "";
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body });
    }
    return route.continue();
  });
}

async function closeOverlays(page) {
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(80);
  }
}

async function signIn(page) {
  const dialog = page.getByRole("dialog", { name: "Gateway connection" });
  const connected = page.locator(".af-topbar__pill--connected");
  // The sign-in dialog opens by itself once the app's auth probe answers 401; a stored session
  // answers "connected" instead. Wait for whichever comes first.
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await dialog.isVisible().catch(() => false)) break;
    if (await connected.isVisible().catch(() => false)) return;
    await page.waitForTimeout(150);
  }
  if (!(await dialog.isVisible().catch(() => false))) {
    await page.locator(".af-topbar__pill").click();
    await dialog.waitFor({ state: "visible", timeout: 15000 });
  }
  await page.locator("#gateway-session-url").fill(GATEWAY);
  await page.locator("#gateway-session-user").fill(USER);
  await page.locator("#gateway-session-token").fill(TOKEN);
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await dialog.waitFor({ state: "hidden", timeout: 15000 });
  await page.locator(".af-topbar__pill--connected").waitFor({ state: "visible", timeout: 15000 });
}

async function gotoRoster(page, baseUrl) {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  await signIn(page);
  await page.locator(".eix_card_head").first().waitFor({ state: "visible", timeout: 15000 });
}

/** Opens a side-panel tab by its title (the rail is the vertical tab strip). */
async function openTab(page, title) {
  const tab = page.locator(".st_tab", { hasText: title }).first();
  // A narrow layout may render the rail behind a toggle; the tab button is the contract either way.
  await tab.waitFor({ state: "attached", timeout: 10000 });
  const cls = (await tab.getAttribute("class")) || "";
  if (!cls.includes("st_tab_active")) await tab.dispatchEvent("click");
  await page.waitForTimeout(400);
}

async function openCastor(page, baseUrl) {
  await page.goto(`${baseUrl}/?entity=castor`, { waitUntil: "domcontentloaded" });
  await signIn(page);
  await page.locator(".entity_canvas_wrap").waitFor({ state: "visible", timeout: 30000 });
  // Land on the latest state of the life, paused (the replay otherwise keeps moving between shots).
  await page.waitForTimeout(1200);
  const end = page.locator(".et_btn", { hasText: "⏭" });
  if (await end.isVisible().catch(() => false)) await end.click().catch(() => {});
  await page.waitForTimeout(600);
}

export default {
  async setup(page, info) {
    await installRoutes(page, info.baseUrl);
  },
  screens: [
    {
      name: "connect",
      async run(page, info) {
        await page.goto(`${info.baseUrl}/`, { waitUntil: "domcontentloaded" });
        await page.getByRole("dialog", { name: "Gateway connection" }).waitFor({ state: "visible", timeout: 15000 });
      },
    },
    {
      name: "list",
      async run(page, info) {
        await gotoRoster(page, info.baseUrl);
      },
      settle: 900,
    },
    {
      name: "create",
      async run(page, info) {
        await gotoRoster(page, info.baseUrl);
        await page.locator(".eix_create_btn", { hasText: /new entity|create/i }).first().click();
        await page.locator("#ce_name").waitFor({ state: "visible", timeout: 10000 });
        await page.locator(".ce_spark_toggle").click().catch(() => {});
      },
    },
    {
      name: "blueprint",
      async run(page, info) {
        await page.goto(`${info.baseUrl}/?page=blueprint`, { waitUntil: "domcontentloaded" });
        await signIn(page);
        if (!(await page.locator(".bp_page").isVisible().catch(() => false))) {
          await page.locator(".eix_create_btn", { hasText: "blueprint" }).first().click();
        }
        await page.locator(".bp_page").waitFor({ state: "visible", timeout: 15000 });
      },
      settle: 1200,
    },
    {
      name: "detail",
      async run(page, info) {
        await openCastor(page, info.baseUrl);
        await openTab(page, "Detail");
      },
      settle: 1500,
    },
    {
      name: "talk",
      async run(page) {
        await closeOverlays(page);
        await openTab(page, "Chat");
      },
      settle: 1200,
    },
    {
      name: "cognition",
      async run(page) {
        await closeOverlays(page);
        await openTab(page, "Wave");
      },
      settle: 1200,
    },
    {
      name: "settings",
      async run(page) {
        await closeOverlays(page);
        await page.locator(".ec_settings_btn").click();
        await page.waitForTimeout(600);
      },
      settle: 1200,
    },
    {
      name: "about",
      async run(page) {
        await closeOverlays(page);
        await page.locator(".af-topbar__btn--about").click();
        await page.getByRole("dialog").first().waitFor({ state: "visible", timeout: 10000 });
      },
    },
  ],
  sweepScreen: "detail",
};
