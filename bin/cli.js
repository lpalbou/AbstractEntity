#!/usr/bin/env node

/**
 * CLI entry point for AbstractEntity — serves the built entity app
 * (create/list summoned entities, watch a mind's memory graph live, talk
 * with it) plus the app-origin gateway session proxy.
 *
 * This server hosts ONE app. The old two-apps-one-dist landing knob
 * (ABSTRACTOBSERVER_LANDING) died with the 2026-07-12 repo split: the
 * observer serves the observer, this serves the entity app.
 */

import * as http from 'http';
import * as os from 'os';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createGatewaySessionProxy } from '@abstractframework/app-server';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
// 3007 = the summoned-entity app's port across the workspace launchers
// (scripts/lib/apps_common.sh ENTITY_PORT default).
const PORT = process.env.PORT || 3007;
// Default to loopback (SSRF belt, entity c1768): the shared session proxy's
// socket-peer gate is the real containment, but a loopback default shrinks
// the precondition (a non-loopback bind) on the operator's box, which runs
// local anyway. HOST=0.0.0.0 stays the explicit opt-in for a wider bind.
const HOST = process.env.HOST || '127.0.0.1';
const DEFAULT_GATEWAY_URL = String(process.env.ABSTRACTENTITY_GATEWAY_URL || process.env.ABSTRACTGATEWAY_URL || 'http://127.0.0.1:8080').trim().replace(/\/+$/, '') || 'http://127.0.0.1:8080';
// Where the OBSERVER app (runs/board/runtime) lives — the header backlink.
const OBSERVER_URL = String(process.env.ABSTRACTENTITY_OBSERVER_URL || '').trim().replace(/\/+$/, '');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ndjson': 'application/x-ndjson',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function inject_config_html(html) {
  const ui_config = {};
  // THIS deployment's gateway — the sign-in surfaces default to it instead
  // of any hardcoded historical port (maintainer incident 2026-07-09).
  if (DEFAULT_GATEWAY_URL) ui_config.gateway_url = DEFAULT_GATEWAY_URL;
  if (OBSERVER_URL) ui_config.observer_url = OBSERVER_URL;
  if (!Object.keys(ui_config).length) return html;
  const marker = "window.__ABSTRACT_UI_CONFIG__";
  if (html.includes(marker)) return html;
  const snippet = `<script>${marker}=Object.assign(${marker}||{}, ${JSON.stringify(ui_config)});</script>`;
  if (html.includes("</head>")) return html.replace("</head>", `${snippet}\n</head>`);
  if (html.includes("</body>")) return html.replace("</body>", `${snippet}\n</body>`);
  return `${html}\n${snippet}\n`;
}

function serveFile(res, filePath) {
  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return false;
    }
    const mimeType = getMimeType(filePath);

    if (mimeType === "text/html") {
      const html = readFileSync(filePath, "utf8");
      const content = inject_config_html(html);
      res.writeHead(200, {
        "Content-Type": `${mimeType}; charset=utf-8`,
        "Cache-Control": "no-cache",
      });
      res.end(content);
      return true;
    }

    const content = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache',
    });
    res.end(content);
    return true;
  } catch (err) {
    return false;
  }
}

// APP-ORIGIN GATEWAY SESSION PROXY — the shared @abstractframework/app-server
// module (one source across observer/flow/abstractcode/entity). Cookie names
// (abstractentity_gateway_*), the CSRF header, and the ABSTRACTENTITY_* /
// ABSTRACTGATEWAY_* env gates all derive from appId.
const gatewaySessionProxy = createGatewaySessionProxy({
  appId: 'abstractentity',
  defaultGatewayUrl: DEFAULT_GATEWAY_URL,
});

const server = http.createServer((req, res) => {
  // A malformed Host header (spaces are legal in header VALUES) makes
  // new URL throw — an uncaught exception here killed the whole server
  // (code adversary F10). Answer 400, keep serving.
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad request');
    return;
  }
  let pathname = url.pathname;

  // Connection endpoint + everything under /api/ (proxied to the gateway
  // with session cookies swapped for gateway headers).
  if (gatewaySessionProxy.handle(req, res, pathname)) {
    return;
  }

  // Host identity for the entity HANDLE (operator 2026-07-15: display
  // "ephemeral@192.168.1.146", never "@ this gateway"). The browser cannot
  // see the machine's LAN address; this server can. First non-internal
  // IPv4, honestly null when none (offline box). Public IPs would need an
  // external lookup — deliberately not done here (no silent egress).
  if (pathname === '/app/host') {
    let lanIp = null;
    try {
      const nets = os.networkInterfaces();
      outer: for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net.family === 'IPv4' && !net.internal) {
            lanIp = net.address;
            break outer;
          }
        }
      }
    } catch {
      lanIp = null;
    }
    // lan_ip only — the hostname was a gratuitous identity byte the client
    // never read (round-3 review: it would leak the origin box's name
    // through a future tunnel/reverse-proxy posture).
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ lan_ip: lanIp }));
    return;
  }

  // Security: prevent directory traversal
  if (pathname.includes('..')) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  let filePath = join(DIST_DIR, pathname);

  if (serveFile(res, filePath)) {
    return;
  }

  // An EXPLICIT .html request that misses must fail loudly, never fall
  // through to the SPA fallback (maintainer incident 2026-07-09: the wrong
  // app wearing the right URL is worse than a 404). /entity.html from the
  // pre-split days lands here — redirect it home instead of 404ing a
  // bookmark.
  if (pathname.endsWith('.html')) {
    if (pathname === '/entity.html') {
      res.writeHead(302, { Location: `/${url.search || ''}` });
      res.end();
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`${pathname} is not in this build (dist/). This server hosts the AbstractEntity app only.`);
    return;
  }

  if (serveFile(res, filePath + '.html')) {
    return;
  }

  if (serveFile(res, join(filePath, 'index.html'))) {
    return;
  }

  // SPA fallback
  if (serveFile(res, join(DIST_DIR, 'index.html'))) {
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║          AbstractEntity is running!                ║
╚════════════════════════════════════════════════════╝

  🌐 Local:   http://localhost:${PORT}
  🌐 Network: http://${HOST}:${PORT}

  🧠 Create, watch and talk with summoned entities
  📡 Gateway: ${DEFAULT_GATEWAY_URL}

  Press Ctrl+C to stop
`);
});

process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down AbstractEntity...\n');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down AbstractEntity...\n');
  process.exit(0);
});
