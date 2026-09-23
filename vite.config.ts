import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { existsSync } from "fs";
import { createGatewaySessionProxy } from "@abstractframework/app-server";

// Dev-server twin of bin/cli.js: mount the SAME app-origin gateway session
// proxy so sign-in works identically in dev and prod. Without this,
// POST /api/connection/gateway would fall through Vite's raw /api proxy to
// the gateway, which has no such route -> 404 at the shared sign-in dialog.
//
// Fall-through contract: the connection endpoint is always ours; other
// /api/* requests ride the session proxy ONLY when a browser session
// exists (prod parity). With no session they fall through to Vite's raw
// /api proxy below, so no-auth dev gateways keep working unauthenticated.
function gatewaySessionDevProxy(): Plugin {
  const proxy = createGatewaySessionProxy({
    appId: "abstractentity",
    defaultGatewayUrl:
      String(process.env.ABSTRACTENTITY_GATEWAY_URL || process.env.ABSTRACTGATEWAY_URL || "").trim() || "http://127.0.0.1:8080",
  });
  return {
    name: "abstractentity-gateway-session-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let pathname = "/";
        try {
          pathname = new URL(req.url || "/", "http://local").pathname;
        } catch {
          next();
          return;
        }
        if (pathname === proxy.connectionPath) {
          proxy.handle(req, res, pathname);
          return;
        }
        if (pathname.startsWith("/api/") && proxy.browserSession(req).sessionId) {
          proxy.handle(req, res, pathname);
          return;
        }
        next();
      });
    },
  };
}

// THE JS-TWIN TRAP (continuum c2544, bit this app live — laurent's "the
// second widget does not work"): the kit's index.ts uses NodeNext explicit
// .js imports (`from "./af_conduct_gauge.js"`) and the kit repos carry
// TRACKED compiled twins beside the .tsx sources. A source alias resolves
// the explicit .js to the STALE twin — the fresh component never enters
// this bundle. Redirect kit-internal .js imports to the .ts/.tsx sibling
// when one exists (twin-proof by construction).
function preferKitSources(): Plugin {
  return {
    name: "abstractentity-prefer-kit-sources",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !importer.includes("/abstractuic/")) return null;
      if (!source.startsWith(".") || !source.endsWith(".js")) return null;
      const base = resolve(importer, "..", source.slice(0, -3));
      for (const ext of [".tsx", ".ts"]) {
        if (existsSync(base + ext)) return base + ext;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [preferKitSources(), gatewaySessionDevProxy(), react()],
  resolve: {
    alias: [
      // Workspace imports (AbstractUIC packages) resolve to their sources so
      // the kit theme + components build without a publish step.
      { find: "@abstractframework/panel-chat", replacement: resolve(__dirname, "../abstractuic/panel-chat/src") },
      { find: "@abstractframework/ui-kit", replacement: resolve(__dirname, "../abstractuic/ui-kit/src") },
    ],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    strictPort: false,
    cors: true,
    fs: {
      // Vite blocks serving files outside an allowlist. Including the shared
      // workspace packages (AbstractUIC) requires re-including this app's own
      // root or Vite 403s on /index.html.
      allow: [resolve(__dirname), resolve(__dirname, "../abstractuic")],
    },
    // In dev, sessionless /api requests fall through to a local gateway.
    proxy: {
      "/api": {
        target: process.env.ABSTRACTENTITY_GATEWAY_URL || process.env.ABSTRACTGATEWAY_URL || "http://127.0.0.1:8080",
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
