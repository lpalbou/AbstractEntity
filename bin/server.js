/**
 * The AbstractEntity HTTP server — the built entity app (create/list
 * summoned entities, watch a mind's memory graph live, talk with it) plus
 * the app-origin gateway session proxy.
 *
 * This server hosts ONE app. The old two-apps-one-dist landing knob
 * (ABSTRACTOBSERVER_LANDING) died with the 2026-07-12 repo split: the
 * observer serves the observer, this serves the entity app.
 *
 * Mountable under the gateway at /apps/entity/ (the
 * @abstractframework/app-server mount contract): every response announces
 * `X-AbstractFramework-App: entity; mount=1`, the page gets
 * `<base href="<base path>/">` and `base_path`, the session cookies carry
 * `Path=<base path>/`, and redirects are relative. Served at `/` on its own
 * port it works exactly as before.
 */

import * as http from 'http';
import * as os from 'os';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { createGatewaySessionProxy, createMountedHandler, injectShell } from '@abstractframework/app-server';

/** The gateway catalog id this server announces (`/apps/entity/`). */
export const APP_ID = 'entity';

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

/**
 * options:
 *   distDir     the built app
 *   gatewayUrl  THIS deployment's gateway: a URL string (a flag or the
 *               legacy environment chose it) or the kit's resolver
 *               (createGatewayUrlResolver: the local gateway pointer, which
 *               the session proxy re-reads when the gateway refuses a
 *               connection)
 */
export function createEntityServer({ distDir, gatewayUrl }) {
  // APP-ORIGIN GATEWAY SESSION PROXY — the shared @abstractframework/app-server
  // module (one source across observer/flow/abstractcode/entity). Cookie names
  // (abstractentity_gateway_*), the CSRF header, and the ABSTRACTENTITY_* /
  // ABSTRACTGATEWAY_* env gates all derive from appId.
  const gatewaySessionProxy = createGatewaySessionProxy({
    appId: 'abstractentity',
    defaultGatewayUrl: gatewayUrl,
  });

  function serveFile(res, filePath, ctx) {
    try {
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        return false;
      }
      const mimeType = getMimeType(filePath);
      if (mimeType === 'text/html') {
        // <base href="<base path>/"> + window.__ABSTRACT_UI_CONFIG__: THIS
        // deployment's gateway (the sign-in surfaces default to it instead
        // of any hardcoded historical port, maintainer incident 2026-07-09)
        // and the base path.
        const html = injectShell(readFileSync(filePath, 'utf8'), {
          basePath: ctx.basePath,
          config: { gateway_url: gatewaySessionProxy.defaultGatewayUrl },
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(html);
        return true;
      }
      res.writeHead(200, { 'Content-Type': mimeType, 'Cache-Control': 'no-cache' });
      res.end(readFileSync(filePath));
      return true;
    } catch {
      return false;
    }
  }

  return http.createServer(createMountedHandler({ appId: APP_ID }, (req, res, ctx) => {
    // Parse against a FIXED base: a malformed Host header (spaces are legal
    // in header VALUES) made new URL throw — an uncaught exception here
    // killed the whole server (code adversary F10). Only the path and query
    // matter for routing.
    let url;
    try {
      url = new URL(req.url, 'http://app.invalid');
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

    const filePath = join(distDir, pathname);

    if (serveFile(res, filePath, ctx)) {
      return;
    }

    // An EXPLICIT .html request that misses must fail loudly, never fall
    // through to the SPA fallback (maintainer incident 2026-07-09: the wrong
    // app wearing the right URL is worse than a 404). /entity.html from the
    // pre-split days lands here — redirect it home instead of 404ing a
    // bookmark. RELATIVE ("./"): home is the app's base, `/` on its own port
    // and `/apps/entity/` behind the gateway.
    if (pathname.endsWith('.html')) {
      if (pathname === '/entity.html') {
        res.writeHead(302, { Location: `./${url.search || ''}` });
        res.end();
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`${pathname} is not in this build (dist/). This server hosts the AbstractEntity app only.`);
      return;
    }

    if (serveFile(res, filePath + '.html', ctx)) {
      return;
    }

    if (serveFile(res, join(filePath, 'index.html'), ctx)) {
      return;
    }

    // SPA fallback
    if (serveFile(res, join(distDir, 'index.html'), ctx)) {
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  }));
}
