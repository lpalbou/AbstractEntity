/**
 * The phase bar (operator ruling 2026-11-08, contract v2 + v3 deltas; pure rules in phase_bar.ts):
 * four kit chips and one power button. `visit`, `work` and `sleep` are indicators (lit when
 * current; work has no click, v3: no work switch); `personal` is the one toggle (pressed = allowed,
 * a ring filled when pressed) that lights as well when current. The labels are the phase words in
 * every state; a short state word may sit beside one ("waiting"). "Stop", "sleep now" and "Resume
 * and visit" confirm inline, in the bar; Stop's confirmation says it cancels his own time.
 */
import React from "react";
import { AfChipButton } from "@abstractframework/ui-kit";

import { STOP_CONSEQUENCE, type PhaseBarAct, type PhaseBarUi, type PhaseBarView, type PhaseConfirm } from "./phase_bar";

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
  /** The power button and Retry (the entity page has them; a roster tile does not). */
  showPower?: boolean;
  /** The status sentence in the bar (the entity page shows it in the stopped banner instead while
   * stopped). */
  showSentence?: boolean;
  className?: string;
}

export function confirmSentence(kind: PhaseConfirm, name: string): string {
  if (kind === "stop") return `Stop ${name}? ${STOP_CONSEQUENCE}`;
  if (kind === "resume_visit") return `${name} is stopped. Resume him and visit? He comes back idle, then the conversation opens.`;
  return `Put ${name} to sleep now? He wakes by himself when his maintenance is done.`;
}

const CONFIRM_YES: Record<PhaseConfirm, string> = { stop: "Stop now", sleep: "Sleep now", resume_visit: "Resume and visit" };
const CONFIRM_LABEL: Record<PhaseConfirm, string> = { stop: "Confirm stop", sleep: "Confirm sleep", resume_visit: "Confirm resume and visit" };

export function PhaseBarControls(props: PhaseBarControlsProps): React.ReactElement {
  const { view, ui, entityName, note, onAct, onConfirm, onCancel } = props;
  const showPower = props.showPower !== false;
  const showSentence = props.showSentence !== false && Boolean(view.sentence);
  // "Stop now" never waits for a write in flight (the kill switch); the others do.
  const confirmHeld = ui.confirm !== null && ui.confirm !== "stop" && (ui.busy !== null || ui.stopping === true);
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
            {s.badge ? <span className="ec_pb_badge">{s.badge}</span> : null}
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
      {showPower && view.stopAgain ? (
        <AfChipButton tone="error" className={`ec_pb_stop_again${ui.stopping ? " ec_pb_busy" : ""}`} disabled={view.stopAgain.disabled} title={view.stopAgain.title} onClick={() => onAct("stop")}>
          {view.stopAgain.label}
        </AfChipButton>
      ) : null}
      {ui.confirm ? (
        <span className="ec_pb_confirm" role="group" aria-label={CONFIRM_LABEL[ui.confirm]}>
          <span className="ec_pb_confirm_text">{confirmSentence(ui.confirm, entityName)}</span>
          <AfChipButton tone={ui.confirm === "stop" ? "error" : "accent"} className="ec_pb_confirm_yes" disabled={confirmHeld} onClick={onConfirm}>
            {CONFIRM_YES[ui.confirm]}
          </AfChipButton>
          <AfChipButton tone="muted" className="ec_pb_confirm_no" disabled={confirmHeld} onClick={onCancel}>
            Cancel
          </AfChipButton>
        </span>
      ) : null}
      {showSentence ? (
        <span className="ec_pb_sentence" role="status" title={view.sentenceTitle || undefined}>
          {view.sentence}
          {view.since ? <span className="ec_pb_since"> · {view.since}</span> : null}
          {view.reason ? <span className="ec_pb_reason"> · {view.reason}</span> : null}
          {view.queue ? <span className="ec_pb_queue"> · {view.queue}</span> : null}
          {view.then ? <span className="ec_pb_then"> · {view.then}</span> : null}
        </span>
      ) : null}
      {view.blocked ? <span className="ec_pb_blocked">{view.blocked}</span> : null}
      {showPower && view.retry ? (
        <AfChipButton tone="accent" className={`ec_pb_retry${ui.busy === "retry" ? " ec_pb_busy" : ""}`} disabled={view.retry.disabled} title={view.retry.title} onClick={() => onAct("retry")}>
          Retry
        </AfChipButton>
      ) : null}
      {note ? (
        <span className="ec_pb_note" role="status">
          {note}
        </span>
      ) : null}
    </div>
  );
}
