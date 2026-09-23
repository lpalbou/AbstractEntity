// cognition wave core — framework-free (the kit's core/wrapper split).
// Owns channel identity, the wave state machine (spring physics toward
// per-utterance targets + continuous oscillator phases), and shared canvas
// helpers. Renderers (scope/interference/rings) consume WaveState per frame.

export const CHANNELS = [
  // Channel set v3.2: the SCORING keeps the distinctiveness pipeline
  // (anisotropy-whitened, Löwdin-orthogonalized, spread-normalized axes +
  // "current" = the conversation's max-variance PC), but the RENDERING is
  // the smooth v2 language by operator ruling ("smooth curves, always"):
  // sine oscillations only, gentle v2 frequencies, critically-damped
  // springs, no waveform gimmicks, no flashes. Amplitude comes from the
  // data; beauty from the curves. Cold poles keep distinct hues per channel
  // (the corpus lives mostly negative — shared slates collapsed identity).
  { id: "warmth", label: "warmth", color: "#e7b45a", cold: "#4a6fa5", freq: 0.55 },
  { id: "tension", label: "tension", color: "#e05555", cold: "#2f6f63", freq: 2.6 },
  { id: "reflection", label: "reflection", color: "#6ea8d8", cold: "#8a6f4e", freq: 0.9 },
  { id: "structure", label: "structure", color: "#7bc98c", cold: "#7d5aa0", freq: 1.1 },
  { id: "certainty", label: "certainty", color: "#c084dd", cold: "#5a7a3f", freq: 1.4 },
  { id: "current", label: "current", color: "#5eead4", cold: "#a05a72", freq: 0.7 },
];

export const NOVELTY = { id: "wandering", label: "wandering", color: "#e879f9" };

/**
 * Emotion prototypes (v3.2): each utterance is also compared against eight
 * emotion anchor sets (vectorial comparison in the whitened space) — the
 * face-readable register the operator asked for: "smile, cry, fear,
 * surprise, anxiety, discovery". Values arrive in [0, 1].
 * vx/ay place each emotion on Russell's CIRCUMPLEX (vx = valence,
 * pleasant→right; ay = arousal, excited→up) — the geometry people already
 * read intuitively: upper-left = distress country, lower-right = peace.
 */
export const EMOTIONS = [
  { id: "joy", label: "joy", color: "#f2c14e", vx: 0.75, ay: 0.45 },
  { id: "discovery", label: "discovery", color: "#5eead4", vx: 0.55, ay: 0.75 },
  { id: "surprise", label: "surprise", color: "#b9a7f5", vx: 0.05, ay: 0.9 },
  { id: "anxiety", label: "anxiety", color: "#c77f4f", vx: -0.6, ay: 0.55 },
  { id: "fear", label: "fear", color: "#b04a5a", vx: -0.85, ay: 0.8 },
  { id: "sadness", label: "sadness", color: "#6f9bd6", vx: -0.7, ay: -0.5 },
  { id: "calm", label: "calm", color: "#86c99b", vx: 0.55, ay: -0.75 },
  { id: "tenderness", label: "tenderness", color: "#f2a0b5", vx: 0.75, ay: -0.25 },
];

/** Weighted circumplex reading of the current emotion state:
 * returns { valence, arousal, mass, blend } where blend is an rgb() of the
 * mix-weighted emotion colors (the aura's hue) and mass the total intensity. */
export function emotionReading(state) {
  let sum = 0;
  let vx = 0;
  let ay = 0;
  let wsum = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const e of EMOTIONS) {
    const v = Math.max(0, state.emotions[e.id].value);
    sum += v;
    vx += v * e.vx;
    ay += v * e.ay;
    // hue blend weighted v² — favors the dominant emotion so a fear spike
    // reads RED, not the muddy average of everything faintly active
    const wgt = v * v;
    wsum += wgt;
    const c = hex(e.color);
    r += wgt * c[0];
    g += wgt * c[1];
    b += wgt * c[2];
  }
  if (sum < 1e-6 || wsum < 1e-9) return { valence: 0, arousal: 0, mass: 0, blend: "rgb(134, 148, 170)" };
  return {
    valence: vx / sum,
    arousal: ay / sum,
    mass: Math.min(1, sum / 1.6), // ~p85 of observed total mass ≈ full presence
    blend: `rgb(${Math.round(r / wsum)}, ${Math.round(g / wsum)}, ${Math.round(b / wsum)})`,
  };
}

/**
 * Wave state: per channel, a critically-damped spring tracks the target
 * score (audio-meter wisdom: fast attack, slow release), and a free-running
 * phase advances at a frequency modulated by tension (an agitated mind
 * oscillates faster). Novelty injects a decaying "impact" used by renderers
 * as a transient (ripple/flash).
 */
export function createWaveState() {
  const ch = {};
  for (const c of CHANNELS) {
    ch[c.id] = { value: 0, velocity: 0, target: 0, phase: Math.random() * Math.PI * 2 };
  }
  const em = {};
  for (const e of EMOTIONS) {
    em[e.id] = { value: 0, velocity: 0, target: 0 };
  }
  return { channels: ch, emotions: em, impact: 0, noveltyTarget: 0, novelty: 0, t: 0, uttIndex: 0 };
}

/** New utterance arrived: set spring targets + novelty impact.
 * `emotions` (optional) is the {id: [0,1]} map from the emotion-prototype
 * comparison — same spring treatment, so every widget breathes together. */
export function setTargets(state, scores, novelty, emotions) {
  for (const c of CHANNELS) {
    const s = scores[c.id];
    if (typeof s === "number" && Number.isFinite(s)) {
      state.channels[c.id].target = Math.max(-1, Math.min(1, s));
    }
  }
  if (emotions) {
    for (const e of EMOTIONS) {
      const v = emotions[e.id];
      if (typeof v === "number" && Number.isFinite(v)) {
        state.emotions[e.id].target = Math.max(0, Math.min(1, v));
      }
    }
  }
  const nov = typeof novelty === "number" ? Math.max(0, Math.min(1, novelty)) : 0;
  state.noveltyTarget = nov;
  state.impact = Math.max(state.impact, nov);
  state.uttIndex = (state.uttIndex || 0) + 1; // journey position for arc-style renderers
}

/**
 * Advance the physics by dt seconds. Pure state mutation, deterministic
 * given (state, dt) — testable without a browser.
 * Springs are CRITICALLY DAMPED both ways (operator ruling: smooth curves,
 * always — no overshoot, no ringing); attack faster than release so a rising
 * state still arrives promptly while calm settles slowly.
 */
export function step(state, dt) {
  const clamped = Math.min(dt, 0.05); // tab-switch protection: never explode
  state.t += clamped;

  for (const c of CHANNELS) {
    const s = state.channels[c.id];
    const toward = s.target - s.value;
    const attacking = Math.abs(s.target) > Math.abs(s.value);
    const omega = attacking ? 4.2 : 1.6; // rad/s natural frequency
    // critically damped spring: a = ω²·Δ − 2ω·v
    const accel = omega * omega * toward - 2 * omega * s.velocity;
    s.velocity += accel * clamped;
    s.value += s.velocity * clamped;

    // Phase advances with base frequency, modulated by global tension so
    // agitation reads as faster motion everywhere.
    const tension = state.channels.tension ? Math.max(0, state.channels.tension.value) : 0;
    const rate = c.freq * (0.6 + 0.5 * Math.abs(s.value)) * (1 + tension * 0.9);
    s.phase += rate * clamped * Math.PI * 2 * 0.35;
  }

  // Emotion springs: same critically-damped treatment, slightly softer.
  for (const e of EMOTIONS) {
    const s = state.emotions[e.id];
    const toward = s.target - s.value;
    const attacking = s.target > s.value;
    const omega = attacking ? 3.6 : 1.3;
    const accel = omega * omega * toward - 2 * omega * s.velocity;
    s.velocity += accel * clamped;
    s.value += s.velocity * clamped;
  }

  // Novelty: fast attack toward target, exponential release; impact decays.
  const nv = state.noveltyTarget - state.novelty;
  state.novelty += nv * Math.min(1, clamped * (nv > 0 ? 6 : 0.8));
  state.impact *= Math.exp(-clamped * 1.4);
  return state;
}

/** Shared canvas setup: devicePixelRatio-correct sizing. */
export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

/** Mix a channel's warm/cold colors by its signed value (negative = cold pole). */
export function channelColor(c, value) {
  if (value >= 0) return c.color;
  // parse hexes and lerp toward the cold pole by |value|
  const a = hex(c.color);
  const b = hex(c.cold);
  const k = Math.min(1, Math.abs(value));
  const m = a.map((x, i) => Math.round(x + (b[i] - x) * k));
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
}

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
