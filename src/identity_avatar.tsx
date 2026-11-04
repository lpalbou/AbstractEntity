/**
 * An entity drawn by its identity (framework ADR 0052): its AbstractAvatar design and its colour,
 * through the kit's ActivityAvatar (the same renderer the visit view uses).
 *
 * The colour: ActivityAvatar resolves its palette from the theme's CSS tokens around the canvas
 * (ui-kit `avatarPaletteFromCss`: the body is `--warning`, the rest is the theme). Setting that one
 * token on a wrapper paints the body in the entity's colour and keeps the theme's background, eyes
 * and shadows, in light and dark. The palette is read when the renderer is created, so a new colour
 * re-creates it (`key`).
 */
import React from "react";
import { ActivityAvatar, type AvatarPose } from "@abstractframework/ui-kit";

export interface IdentityLook {
  style: string;
  color: string;
}

/** The look of an identity record (`identity.avatar`), or null when the record has none. */
export function lookOf(record: { avatar?: { style?: string; color?: string } | null } | null | undefined): IdentityLook | null {
  const style = String(record?.avatar?.style || "").trim();
  const color = String(record?.avatar?.color || "").trim();
  return style && color ? { style, color } : null;
}

/** The wrapper style carrying the entity's colour to the avatar's palette. */
export function identityAvatarStyle(color: string): React.CSSProperties {
  return { "--warning": color } as React.CSSProperties;
}

export function IdentityAvatar({
  look,
  pose = "ready",
  size,
  animated = true,
  label,
  onError,
}: {
  look: IdentityLook;
  pose?: AvatarPose;
  size: number;
  animated?: boolean;
  label: string;
  onError?: (error: Error) => void;
}): React.ReactElement {
  return (
    <span className="idn_avatar" style={identityAvatarStyle(look.color)} data-testid="identity-avatar" data-style={look.style} data-color={look.color}>
      <ActivityAvatar key={look.color} design={look.style} pose={pose} size={size} active animated={animated} label={label} onError={onError} />
    </span>
  );
}
