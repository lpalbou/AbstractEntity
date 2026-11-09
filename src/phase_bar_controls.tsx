/**
 * The phase bar (operator ruling 2026-11-08; pure rules in phase_bar.ts): four kit chips and one
 * power button. `visit` and `sleep` are indicators (lit when current); `work` and `personal` are
 * toggles (pressed = allowed, a ring filled when pressed) that light as well when current. The
 * labels are the phase words in every state. "Stop" and "sleep now" confirm inline, in the bar.
 */
import React from "react";
import { AfChipButton } from "@abstractframework/ui-kit";

import type { PhaseBarAct, PhaseBarUi, PhaseBarView } from "./phase_bar";

export interface PhaseBarControlsProps {
  view: PhaseBarView;
  ui: PhaseBarUi;
  /** The entity's display name (the confirmation's words). */
  entityName: string;
  /** The last act's sentence (a refusal, or the gateway's word about a change). */
  note: string | null;
  onAct(act: PhaseBarAct): void;
  onConfirm(): void;
  onCancel(): void;
  /** The power button (the entity page has it; a roster tile does not). */
  showPower?: boolean;
  /** The status sentence in the bar (the entity page shows it in the stopped banner instead while
   * stopped). */
  showSentence?: boolean;
  className?: string;
}

export function confirmSentence(kind: "stop" | "sleep", name: string): string {
  return kind === "stop"
    ? `Stop ${name} now? Everything he is doing ends at once.`
    : `Put ${name} to sleep now? He wakes by himself when his maintenance is done.`;
}

export function PhaseBarControls(props: PhaseBarControlsProps): React.ReactElement {
  const { view, ui, entityName, note, onAct, onConfirm, onCancel } = props;
  const showPower = props.showPower !== false;
  const showSentence = props.showSentence !== false && Boolean(view.sentence);
  // "Stop now" never waits for a write in flight (the kill switch); "Sleep now" does.
  const confirmHeld = ui.confirm === "sleep" && (ui.busy !== null || ui.stopping === true);
  return (
    <div className={`ec_phase_bar${props.className ? ` ${props.className}` : ""}`} data-live={view.live ? "true" : "false"}>
      <span className="ec_pb_pills" role="group" aria-label="Phases">
        {view.slots.map((s) => (
          <AfChipButton
            key={s.key}
            tone="custom"
            hue="var(--ea-accent)"
            className={`ec_pb_pill ec_pb_${s.key}${s.lit ? " ec_pb_lit" : ""}${s.pressed !== undefined ? " ec_pb_toggle" : ""}${ui.busy === s.key ? " ec_pb_busy" : ""}`}
            pressed={s.pressed}
            disabled={s.disabled}
            title={s.title}
            onClick={() => onAct(s.key)}
          >
            {s.pressed !== undefined ? <i className="ec_pb_ring" aria-hidden="true" /> : null}
            <span className="ec_pb_glyph" aria-hidden="true">
              {s.glyph}{" "}
            </span>
            {s.label}
          </AfChipButton>
        ))}
      </span>
      {showPower ? (
        <AfChipButton
          tone={view.power.danger ? "error" : "success"}
          className={`ec_pb_power${view.power.danger ? " ec_pb_power_stop" : " ec_pb_power_resume"}${ui.stopping ? " ec_pb_busy" : ""}`}
          disabled={view.power.disabled || ui.confirm === "stop"}
          title={view.power.title}
          onClick={() => onAct(view.power.label === "Stop" ? "stop" : "resume")}
        >
          {view.power.label}
        </AfChipButton>
      ) : null}
      {ui.confirm ? (
        <span className="ec_pb_confirm" role="group" aria-label={ui.confirm === "stop" ? "Confirm stop" : "Confirm sleep"}>
          <span className="ec_pb_confirm_text">{confirmSentence(ui.confirm, entityName)}</span>
          <AfChipButton tone={ui.confirm === "stop" ? "error" : "accent"} className="ec_pb_confirm_yes" disabled={confirmHeld} onClick={onConfirm}>
            {ui.confirm === "stop" ? "Stop now" : "Sleep now"}
          </AfChipButton>
          <AfChipButton tone="muted" className="ec_pb_confirm_no" disabled={confirmHeld} onClick={onCancel}>
            Cancel
          </AfChipButton>
        </span>
      ) : null}
      {showSentence ? (
        <span className="ec_pb_sentence" role="status" title={view.sentenceTitle || undefined}>
          {view.sentence}
        </span>
      ) : null}
      {view.blocked ? <span className="ec_pb_blocked">{view.blocked}</span> : null}
      {note ? (
        <span className="ec_pb_note" role="status">
          {note}
        </span>
      ) : null}
    </div>
  );
}
