/**
 * THE CAMERA GLIDE (operator 2026-11-10, Entity backlog 0003: a topic click
 * zooms and pans "as an animated transition, never a teleport"). The pure
 * tween (graph_canvas_camera.ts), then the canvas held to it on its source.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CAMERA_GLIDE_MAX_MS, CAMERA_GLIDE_MS, easeInOut, glideAt, glideMs, poseAt, startGlide } from "./graph_canvas_camera";

const CANVAS = fs.readFileSync(path.resolve(__dirname, "graph_canvas.tsx"), "utf8");
const A = { x: 0, y: 0, zoom: 0.5 };
const B = { x: 400, y: -200, zoom: 2 };

describe("easeInOut", () => {
  it("runs 0 -> 1, monotone, symmetric, clamped", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = easeInOut(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
      expect(easeInOut(1 - i / 20)).toBeCloseTo(1 - v);
    }
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(3)).toBe(1);
    // Eased: slow at both ends.
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
  });
});

describe("poseAt", () => {
  it("is exact at both ends", () => {
    expect(poseAt(A, B, 0)).toEqual(A);
    expect(poseAt(A, B, 1)).toEqual(B);
  });

  it("moves the centre linearly and the zoom geometrically (0.5 -> 2 passes 1 at half way)", () => {
    const mid = poseAt(A, B, 0.5);
    expect(mid.x).toBeCloseTo(200);
    expect(mid.y).toBeCloseTo(-100);
    expect(mid.zoom).toBeCloseTo(1);
  });
});

describe("startGlide / glideAt", () => {
  it("lasts ~300 ms for a short move, longer for a long one, never past CAMERA_GLIDE_MAX_MS", () => {
    expect(CAMERA_GLIDE_MS).toBeGreaterThanOrEqual(250);
    expect(CAMERA_GLIDE_MS).toBeLessThanOrEqual(450);
    expect(CAMERA_GLIDE_MAX_MS).toBeLessThanOrEqual(650);
    const at = (x: number, zoom = 1) => ({ x, y: 0, zoom });
    expect(glideMs(at(0), at(0))).toBe(CAMERA_GLIDE_MS);
    expect(glideMs(at(0), at(80))).toBe(CAMERA_GLIDE_MS + 10);
    // ~2000 screen px (the review's far topic at zoom 3.6): 552 ms, not 300; ~3000 px: the cap.
    expect(glideMs(at(0, 3.6), at(560, 3.6))).toBeCloseTo(552);
    expect(glideMs(at(0, 3.6), at(840, 3.6))).toBe(CAMERA_GLIDE_MAX_MS);
    expect(glideMs(at(0), at(400))).toBeGreaterThan(glideMs(at(0), at(100)));
    // A zoom change alone takes a little longer too, the same either way.
    expect(glideMs(at(0, 0.5), at(0, 2))).toBeGreaterThan(CAMERA_GLIDE_MS);
    expect(glideMs(at(0, 2), at(0, 0.5))).toBeCloseTo(glideMs(at(0, 0.5), at(0, 2)));
    expect(startGlide(at(0), at(80), 0, false)!.ms).toBe(CAMERA_GLIDE_MS + 10);
  });

  it("glides by the clock, monotone, and ends exactly on the target", () => {
    const g = startGlide(A, B, 1000, false)!;
    expect(g).not.toBeNull();
    expect(g.ms).toBe(glideMs(A, B));
    expect(glideAt(g, 1000)).toEqual({ pose: A, done: false });
    let prev = A;
    for (let t = 1000; t < 1000 + g.ms; t += 16) {
      const { pose, done } = glideAt(g, t);
      expect(done).toBe(false);
      expect(pose.x).toBeGreaterThanOrEqual(prev.x);
      expect(pose.zoom).toBeGreaterThanOrEqual(prev.zoom);
      prev = pose;
    }
    const mid = glideAt(g, 1000 + g.ms / 2).pose;
    expect(mid.x).toBeGreaterThan(A.x);
    expect(mid.x).toBeLessThan(B.x);
    expect(glideAt(g, 1000 + g.ms)).toEqual({ pose: B, done: true });
    expect(glideAt(g, 99999)).toEqual({ pose: B, done: true });
  });

  it("is frame-rate independent: the pose depends on the clock only", () => {
    const g = startGlide(A, B, 0, false)!;
    expect(glideAt(g, 120)).toEqual(glideAt(g, 120));
    expect(glideAt(g, 120).pose).toEqual(poseAt(A, B, easeInOut(120 / g.ms)));
  });

  it("under reduced motion, a zero duration or nothing to move: one step (null)", () => {
    expect(startGlide(A, B, 0, true)).toBeNull();
    expect(startGlide(A, B, 0, false, 0)).toBeNull();
    expect(startGlide(A, { ...A }, 0, false)).toBeNull();
  });

  it("copies its ends (moving the live camera object never bends the glide)", () => {
    const live = { ...A };
    const g = startGlide(live, B, 0, false)!;
    live.x = 999;
    expect(glideAt(g, 0).pose.x).toBe(0);
  });
});

describe("the canvas glides", () => {
  it("steps the glide in its frame, before the camera is read", () => {
    const at = CANVAS.indexOf("// A glide in progress places the camera for this frame (by the clock).");
    expect(at).toBeGreaterThan(0);
    const block = CANVAS.slice(at, at + 400);
    expect(block).toContain("const step = glideAt(glide, performance.now());");
    expect(block).toContain("Object.assign(cameraRef.current, step.pose);");
    expect(block).toContain("if (step.done) glideRef.current = null;");
    expect(block).toMatch(/glideRef\.current = null;\n\s+\}\n\s+const cam = cameraRef\.current;/);
  });

  it("moves through moveCamera (reduced motion: one step)", () => {
    expect(CANVAS).toContain("const glide = startGlide(cam, to, performance.now(), reducedMotionRef.current);");
  });

  it("a topic click, Fit view and a lens framing glide; none assigns the camera directly", () => {
    const frame = CANVAS.slice(CANVAS.indexOf("  const frameTopic = (key: string) => {"), CANVAS.indexOf("  const focusTopicRef = useRef(focusTopic);"));
    expect(frame).toContain("moveCamera({ x: circle.x + (rect.width / 2 - free.x) / zoom, y: circle.y + (rect.height / 2 - free.y) / zoom, zoom });");
    expect(frame).not.toMatch(/cam\.(x|y|zoom) =/);
    const fit = CANVAS.slice(CANVAS.indexOf('title="Fit view'), CANVAS.indexOf("⛶ <span"));
    expect(fit).toContain("moveCamera({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom:");
    expect(fit).not.toMatch(/cam\.(x|y|zoom) =/);
    const lens = CANVAS.slice(CANVAS.indexOf("const try_fit = () => {"), CANVAS.indexOf("try_fit();\n"));
    expect(lens).toContain("moveCamera({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom: Math.min(4,");
    expect(lens).not.toMatch(/cam\.(x|y|zoom) =/);
  });

  it("a selection (a member opened from the panel) glides to it at the viewer's zoom (review 2026-11-10: it teleported)", () => {
    const eff = CANVAS.slice(CANVAS.indexOf("  // Center the camera on selection changes"), CANVAS.indexOf("}, [selectedRow]);"));
    expect(eff).toContain("if (ln) moveCamera({ x: ln.x, y: ln.y, zoom: cameraRef.current.zoom });");
    expect(eff).not.toMatch(/cameraRef\.current\.(x|y|zoom) =/);
  });

  it("reduced motion is kept current (a change listener), not read once", () => {
    expect(CANVAS).toContain('mq.addEventListener?.("change", read);');
    expect(CANVAS).toContain('return () => mq.removeEventListener?.("change", read);');
  });

  it("the viewer's wheel and pan drop a glide (a drag during it wins)", () => {
    expect(CANVAS).toContain("glideRef.current = null; // the viewer's zoom wins over a glide");
    expect(CANVAS).toContain("if (drag.moved) glideRef.current = null; // the viewer's pan wins over a glide");
  });
});
