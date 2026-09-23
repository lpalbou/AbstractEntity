/// <reference types="vite/client" />

declare global {
  interface Window {
    __ABSTRACT_UI_CONFIG__?: {
      /** THIS deployment's gateway (bin/cli.js injection) — a DISPLAY
       * default for direct-posture connect surfaces; through the app-origin
       * proxy the browser never dials it directly. */
      gateway_url?: string;
      /** Where the observer app lives (bin/cli.js injects it from
       * ABSTRACTENTITY_OBSERVER_URL) — drives the header backlink. */
      observer_url?: string;
    };
  }
}

export {};
