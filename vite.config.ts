import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { readFileSync } from "fs";
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

// The app's version, shown in the About dialog (src/app_about.ts). Read from
// package.json so a version bump is the only edit a release needs.
const APP_VERSION = String(JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")).version || "");
if (!APP_VERSION) throw new Error("abstractentity: package.json has no version");

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [gatewaySessionDevProxy(), react()],
  // The kit (@abstractframework/ui-kit, panel-chat) resolves from node_modules
  // like any dependency: the installed package is the contract (no alias to a
  // sibling abstractuic checkout, which tested whatever that tree held).
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    strictPort: false,
    cors: true,
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
  // Relative asset URLs ("./assets/…"): the same build serves at `/` on
  // the app's own port and at `/apps/entity/` through the gateway
  // (bin/cli.js injects the matching <base href>).
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
