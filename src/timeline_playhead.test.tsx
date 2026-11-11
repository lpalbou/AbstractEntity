/** The time panel draws the play head while playing, the committed
 * position otherwise, and offers the speeds up to 1000x. */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createPlayhead } from "./replay_clock";
import type { ReplayEnvelope } from "./stream_types";
import { Timeline, type TimelineProps } from "./timeline";

const envelopes = Array.from({ length: 50 }, (_, i) => ({ seq: i + 1, family: "event", observed_at: "2026-11-07T16:08:00+00:00", payload: {}, display: {} }) as unknown as ReplayEnvelope);

function render(over: Partial<TimelineProps>): string {
  const props: TimelineProps = {
    envelopes,
    scrubIndex: 9,
    playing: false,
    speed: 5,
    live: false,
    liveAvailable: true,
    inferredSessionSeqs: [],
    onScrub: () => undefined,
    onTogglePlay: () => undefined,
    onSpeed: () => undefined,
    onToggleLive: () => undefined,
    monitor: null,
    ...over,
  };
  return renderToStaticMarkup(<Timeline {...props} />);
}

const position = (html: string) => html.match(/(\d+)\/50</)?.[1];
const slider = (html: string) => html.match(/class="et_track"[^>]*value="(-?\d+)"/)?.[1] ?? html.match(/value="(-?\d+)"[^>]*class="et_track"/)?.[1];

describe("time panel position", () => {
  it("while playing it shows the head, ahead of the committed position", () => {
    const head = createPlayhead();
    head.set(30);
    const html = render({ playing: true, playhead: head });
    expect(position(html)).toBe("31");
    expect(slider(html)).toBe("30");
  });

  it("paused, it shows the committed position whatever the store holds", () => {
    const head = createPlayhead();
    head.set(30);
    const html = render({ playing: false, playhead: head });
    expect(position(html)).toBe("10");
    expect(slider(html)).toBe("9");
  });

  it("with no head yet (the first frame) it shows the committed position", () => {
    expect(position(render({ playing: true, playhead: createPlayhead() }))).toBe("10");
    expect(position(render({ playing: true }))).toBe("10");
  });

  it("the monitor is handed the seq of the position drawn: the head while playing (every frame it moves), the committed one paused", () => {
    const seen: number[] = [];
    const monitor = (seq: number) => (seen.push(seq), <span className="probe">{seq}</span>);
    const head = createPlayhead();
    head.set(30);
    expect(render({ playing: true, playhead: head, monitor })).toContain('<span class="probe">31</span>');
    head.set(31);
    expect(render({ playing: true, playhead: head, monitor })).toContain('<span class="probe">32</span>');
    expect(render({ playing: false, playhead: head, monitor })).toContain('<span class="probe">10</span>');
    // Before the first event: 0, as the page's own position seq.
    expect(render({ scrubIndex: -1, monitor })).toContain('<span class="probe">0</span>');
    expect(seen).toEqual([31, 32, 10, 0]);
  });

  it("live rides the end, never a stale head", () => {
    const head = createPlayhead();
    head.set(3);
    const html = render({ live: true, playing: true, scrubIndex: 49, playhead: head });
    expect(position(html)).toBe("50");
  });
});

describe("speed control", () => {
  it("shows the chosen speed up to 1000x, in the kit's select, named for screen readers", () => {
    const html = render({ speed: 1000 });
    expect(html).toContain("af-select");
    expect(html).toContain('aria-label="Playback speed"');
    expect(html).toMatch(/>1000x</);
    expect(render({ speed: 200 })).toMatch(/>200x</);
  });

  it("is disabled while following live", () => {
    const html = render({ live: true });
    expect(html).toMatch(/<button[^>]*aria-label="Playback speed"[^>]*disabled|<button[^>]*disabled[^>]*aria-label="Playback speed"/);
  });
});

describe("speed list styling", () => {
  it("the stylesheet scopes the list by the same accessible name the control renders", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const css = readFileSync(resolve(__dirname, "timeline_speed.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const label = render({}).match(/aria-label="([^"]*speed[^"]*)"/i)?.[1];
    expect(label).toBe("Playback speed");
    expect(css).toContain(`.af-select-options[aria-label="${label}"] .af-select-option`);
  });
});
