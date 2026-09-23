import React from "react";

/**
 * The AbstractEntity brand mark (operator directive 2026-07-13, commons
 * c1209): a small logo expressing the app's FUNCTION — a living mind, not a
 * generic graph glyph. Composition: the mind's soft boundary (open circle),
 * the identity SPARK at its heart (the birth document every entity carries),
 * and three memory nodes growing from it (the usage-weighted graph a life
 * accumulates). Palette echoes the family icon set (blue/violet/amber/rose)
 * while staying distinct from the observer's planet-and-orbit mark.
 *
 * Inline SVG on purpose: uic offered a shared mark component (c1209); until
 * a kit-level brand set exists, the app owns its own mark — same posture as
 * the other app headers today.
 */
export function EntityMark({ size = 18 }: { size?: number }): React.ReactElement {
  return (
    <svg
      className="eh_mark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {/* the mind's boundary — open, not sealed (a life keeps growing) */}
      <circle
        cx="12"
        cy="12"
        r="8.6"
        fill="none"
        stroke="var(--ea-accent, #e8a54a)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeDasharray="40 14"
        strokeDashoffset="-6"
        opacity="0.55"
      />
      {/* memory edges from the spark */}
      <g stroke="var(--ea-accent, #e8a54a)" strokeWidth="1" opacity="0.6">
        <line x1="12" y1="12" x2="8.2" y2="8.6" />
        <line x1="12" y1="12" x2="16.4" y2="9.6" />
        <line x1="12" y1="12" x2="10.4" y2="16.4" />
      </g>
      {/* memory nodes */}
      <circle cx="8.2" cy="8.6" r="1.7" fill="#60a5fa" />
      <circle cx="16.4" cy="9.6" r="1.7" fill="#a78bfa" />
      <circle cx="10.4" cy="16.4" r="1.7" fill="#f59e0b" />
      {/* the identity spark at the heart */}
      <path
        d="M12 8.9 L13.1 11 L15.2 12 L13.1 13 L12 15.1 L10.9 13 L8.8 12 L10.9 11 Z"
        fill="#e94560"
      />
    </svg>
  );
}
