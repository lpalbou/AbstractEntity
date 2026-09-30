// Phone-space capture screens for AbstractEntity (DESIGN §12: list + detail screens; harness space metrics
// text% / scroll / pad). Same fixture, roster and demo-life routes as responsive.screens.mjs; every
// screen here shows a list or a detail with an item selected.
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


// Fixture payloads for the gateway reads the fixture does not serve (shapes from src/stream_source.ts and
// src/identity_card.tsx): the identity card, the tool policy, the skills roster, the prompt layers, and an
// open visit with its transcript (the drawer rehydrates its own run id from localStorage).
const LONG = "I spent the afternoon tracing why the media server kept dropping behind the reverse proxy; the cause was a header the proxy rewrote, and the fix was one line in the site block.";
const MOCKS = {
  card: {
    name: "castor", entity_id: "ent-castor", born: "2026-07-01T09:00:00Z", age_days: 91,
    mind_substrate: { provider: "lmstudio", model: "qwen3.6-27b" },
    identity: {
      values: [{ name: "intellectual_honesty", statement: "Say what I know, what I guess, and what I do not know, in that order.", value_class: "core" }],
      purposes: [{ name: "purpose-0", statement: "Help the people I work with keep their machines understandable to themselves." }],
      traits: [{ name: "trait-0", statement: "Patient with long investigations; impatient with hand-waving." }],
      limits: [{ name: "limit-0", statement: "Never act on a machine I was not invited onto." }],
    },
    likes_dislikes: { likes: [{ target: "concept:reverse_proxy", net: 3, positive: 4, negative: 1 }], dislikes: [], targets_total: 1 },
  },
  toolPolicy: {
    phases: {
      visit: { tools: ["recall_memory", "read_file", "list_files"], source: "phases.yaml", notes: [] },
      work: { tools: ["recall_memory", "read_file", "list_files", "write_file", "execute_command"], source: "phases.yaml", notes: [] },
      personal: { tools: ["recall_memory", "read_book"], source: "default", notes: [] },
      sleep: { tools: ["recall_memory"], source: "default", notes: [] },
    },
    all_tools: ["recall_memory", "read_book", "read_file", "list_files", "write_file", "execute_command"],
    tiers: {},
  },
  skills: {
    selection: { exists: true, skills: [{ name: "reverse-proxy-debugging", phases: ["work"] }], warnings: [] },
    resolved: {
      skills: [
        { name: "reverse-proxy-debugging", description: "Trace a request through a reverse proxy: headers, upstream, TLS, and the site block that rewrote them.", trust_level: "trusted", audience: "entity", phases: ["work"], active: true },
        { name: "entity-self-knowledge", description: "How his own memory, phases and tools work, delivered through the capability map.", trust_level: "trusted", audience: "entity", delivered_via_map: true, active: true },
      ],
      verdicts: [],
    },
    matrix: null,
  },
  prompt: {
    layers: { visit: { text: "You are in a visit. " + LONG, source: "default" }, own_time: { text: "This is your own time. Read, reflect, and write in your diary.", source: "overlay" } },
    defaults: { visit: "You are in a visit.", own_time: "This is your own time." },
    prelude: "You are Castor. Your values: intellectual honesty. Your purpose: help the people you work with keep their machines understandable to themselves.",
    preview: "You are Castor. " + LONG,
    warnings: [],
    editable: ["visit", "own_time"],
  },
  visit: { open: true, run_id: "run-space-demo", session_id: "sess-space", visit_id: "visit-space", turn_n: 2, status: "waiting" },
  transcript: {
    run_id: "run-space-demo", visit_id: "visit-space", status: "waiting", turn_n: 2, participants: ["web-tester", "castor"],
    turns: [
      { role: "user", content: "Why does jellyfin keep dropping behind caddy? It worked last week and I changed nothing on purpose." },
      { role: "assistant", content: LONG + " Next time, check the proxy's access log first: it shows the rewritten header before anything else does." },
      { role: "user", content: "Can you write down the one-line fix so I remember it?" },
      { role: "assistant", content: "Here it is, with the path it lives in: /etc/caddy/sites/jellyfin.caddy — `header_up X-Forwarded-Proto {scheme}`. I also added it to my notes on reverse proxies so I can find it again when this comes back." },
    ],
  },
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
    const ent = p.match(/^\/api\/gateway\/entities\/castor\/(card|tool-policy|skills|prompt|visit|visit\/run-space-demo\/transcript)$/);
    if (ent && route.request().method() === "GET") {
      const key = { card: "card", "tool-policy": "toolPolicy", skills: "skills", prompt: "prompt", visit: "visit" }[ent[1]] || "transcript";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCKS[key]) });
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


async function lessonsThenDetail(page) {
  // Select a memory through the Lessons list (its onSelect opens the Detail tab with that node).
  await openTab(page, "Lessons");
  const card = page.locator(".st_panel:visible .lw_card").first();
  if (await card.isVisible().catch(() => false)) await card.click();
  await page.waitForTimeout(500);
  await openTab(page, "Detail");
}

const tab = (name, title) => ({
  name,
  async run(page) {
    await closeOverlays(page);
    await openTab(page, title);
  },
  settle: 1000,
});

export default {
  async setup(page, info) {
    await installRoutes(page, info.baseUrl);
    await page.addInitScript(() => {
      try {
        localStorage.setItem("abstractentity_chat_session:castor", "run-space-demo");
      } catch {
        /* storage blocked */
      }
    });
  },
  // The memory graph canvas is the documented exception (DESIGN §12: "one page scroll except the graph").
  spaceIgnore: [".entity_canvas_wrap"],
  screens: [
    { name: "list", async run(page, info) { await gotoRoster(page, info.baseUrl); }, settle: 900 },
    {
      name: "detail",
      async run(page, info) {
        await openCastor(page, info.baseUrl);
        await lessonsThenDetail(page);
      },
      settle: 1200,
    },
    tab("lessons", "Lessons"),
    tab("world", "World"),
    tab("book", "Book"),
    tab("ledger", "Ledger"),
    tab("health", "Health"),
    tab("wave", "Wave"),
    tab("card", "Card"),
    tab("talk", "Chat"),
    ...["tools", "skills", "prompt"].map((t) => ({
      name: `settings-${t}`,
      async run(page) {
        await closeOverlays(page);
        await page.locator(".ec_settings_btn").click();
        await page.locator(".wsp_tab", { hasText: new RegExp(t, "i") }).first().click();
        await page.waitForTimeout(500);
      },
      settle: 1000,
    })),
  ],
  sweepScreen: "detail",
};
