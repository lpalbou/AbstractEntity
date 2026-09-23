/**
 * Type declarations for the VENDORED uic cognition-monitor core (c1831:
 * vendor the stable half pending the `monitor-cognition` kit package). The
 * `.js` is uic's framework-free physics core, copied verbatim; these types
 * describe its surface for our TS mount. Delete with the vendored files when
 * the kit package ships.
 */

export interface WaveChannel {
  id: string;
  label: string;
  color: string;
  cold: string;
  freq: number;
}
export interface WaveEmotion {
  id: string;
  label: string;
  color: string;
  vx: number;
  ay: number;
}

export const CHANNELS: WaveChannel[];
export const EMOTIONS: WaveEmotion[];
export const NOVELTY: { id: string; label: string; color: string };

export interface WaveState {
  channels: Record<string, { value: number; velocity: number; target: number; phase: number }>;
  emotions: Record<string, { value: number; velocity: number; target: number }>;
  impact: number;
  noveltyTarget: number;
  novelty: number;
  t: number;
  uttIndex: number;
}

export function createWaveState(): WaveState;
export function setTargets(
  state: WaveState,
  scores: Record<string, number>,
  novelty?: number,
  emotions?: Record<string, number>,
): void;
export function step(state: WaveState, dt: number): WaveState;
export function fitCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number };
export function emotionReading(state: WaveState): { valence: number; arousal: number; mass: number; blend: string };
export function channelColor(c: WaveChannel, value: number): string;
