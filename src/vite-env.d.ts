/// <reference types="vite/client" />

declare global {
  interface Window {
    __ABSTRACT_UI_CONFIG__?: {
      /** THIS deployment's gateway (bin/cli.js injection) — a DISPLAY
       * default for direct-posture connect surfaces; through the app-origin
       * proxy the browser never dials it directly. */
      gateway_url?: string;
    };
  }
}

export {};
