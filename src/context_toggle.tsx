/**
 * The graph toolbar's "Context" toggle (operator 2026-11-08): shows or
 * hides the memories he brought to mind for his last answer. A kit toggle
 * chip labelled by what it shows; pressed = the highlight is on the graph
 * (toggles show state, never verbs). Disabled with a hint when there is
 * nothing to light (recall_emphasis.contextToggleView).
 */
import React from "react";
import { AfChipButton } from "@abstractframework/ui-kit";

import { CONTEXT_LABEL, type ContextToggleView } from "./recall_emphasis";

export function ContextToggle({ view, onToggle }: { view: ContextToggleView; onToggle(): void }): React.ReactElement {
  return (
    <AfChipButton
      tone="custom"
      hue="var(--ea-accent)"
      className="lens_context_toggle"
      pressed={view.pressed}
      disabled={view.disabled}
      title={view.title}
      onClick={onToggle}
    >
      <i className="lens_context_ring" aria-hidden="true" />
      {CONTEXT_LABEL}
    </AfChipButton>
  );
}
