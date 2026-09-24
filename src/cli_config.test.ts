import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

// bin/cli.js only injects settings the app reads. ABSTRACTENTITY_OBSERVER_URL
// was injected as `observer_url`, which nothing in the app consumed.
const root = resolve(__dirname, "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf-8");

describe("abstractentity command configuration", () => {
  it("does not read or inject an observer URL", () => {
    const cli = read("bin/cli.js");
    expect(cli).not.toMatch(/ABSTRACTENTITY_OBSERVER_URL|observer_url/);
    expect(cli).toMatch(/ui_config\.gateway_url = DEFAULT_GATEWAY_URL/);
  });

  it("documents no observer URL setting", () => {
    expect(read("docs/api.md")).not.toMatch(/ABSTRACTENTITY_OBSERVER_URL/);
    expect(read("src/vite-env.d.ts")).not.toMatch(/observer_url/);
  });
});
