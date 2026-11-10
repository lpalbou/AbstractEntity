/**
 * THE CAMERA GLIDE (operator 2026-11-10, Entity backlog 0003: "make the
 * move/zoom an animated transition, never a teleport"). A programmatic
 * camera move — a topic framed, Fit view, a lens or search framing what it
 * lights — glides from where the camera is to its target over
 * CAMERA_GLIDE_MS (longer for a long move, at most CAMERA_GLIDE_MAX_MS: glideMs), eased in and out, by the clock (frame-rate independent);
 * under prefers-reduced-motion it is one step. The centre moves linearly and
 * the zoom geometrically (a zoom of 0.5 -> 2 passes 1 at half time: equal
 * steps read as equal). A pan or a wheel by the viewer cancels it (the
 * canvas drops the glide). Pure; graph_canvas steps it in its frame.
 */

export interface CameraPose {
  x: number;
  y: number;
  zoom: number;
}

export const CAMERA_GLIDE_MS = 300;
/** A long move takes longer, up to this (review 2026-11-10: ~2000 px in
 * 300 ms read as a flash). */
export const CAMERA_GLIDE_MAX_MS = 600;

/** How long a glide takes: CAMERA_GLIDE_MS, plus 1 ms per 8 screen px the
 * view travels (the centre's move at the closer zoom, and the zoom change),
 * at most CAMERA_GLIDE_MAX_MS. */
export function glideMs(from: CameraPose, to: CameraPose): number {
  const travel = Math.hypot(to.x - from.x, to.y - from.y) * Math.max(from.zoom, to.zoom) + Math.abs(Math.log(to.zoom / from.zoom)) * 150;
  return Math.min(CAMERA_GLIDE_MAX_MS, CAMERA_GLIDE_MS + travel / 8);
}

export interface Glide {
  from: CameraPose;
  to: CameraPose;
  start: number;
  ms: number;
}

/** Ease in and out (cubic): 0 -> 0, 1 -> 1, monotone, symmetric. */
export function easeInOut(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

/** The pose `p` (0..1, already eased) of the way from `from` to `to`. */
export function poseAt(from: CameraPose, to: CameraPose, p: number): CameraPose {
  if (p <= 0) return { ...from };
  if (p >= 1) return { ...to };
  return {
    x: from.x + (to.x - from.x) * p,
    y: from.y + (to.y - from.y) * p,
    zoom: from.zoom * (to.zoom / from.zoom) ** p,
  };
}

/** A glide from `from` to `to` starting `now`, or null for one step (reduced
 * motion, a zero duration, or nothing to move). */
export function startGlide(from: CameraPose, to: CameraPose, now: number, reducedMotion: boolean, ms: number = glideMs(from, to)): Glide | null {
  if (reducedMotion || ms <= 0) return null;
  if (from.x === to.x && from.y === to.y && from.zoom === to.zoom) return null;
  return { from: { ...from }, to: { ...to }, start: now, ms };
}

/** The camera at `now` and whether the glide is over (then it is exactly
 * the target). */
export function glideAt(g: Glide, now: number): { pose: CameraPose; done: boolean } {
  const t = (now - g.start) / g.ms;
  if (t >= 1) return { pose: { ...g.to }, done: true };
  return { pose: poseAt(g.from, g.to, easeInOut(t)), done: false };
}
