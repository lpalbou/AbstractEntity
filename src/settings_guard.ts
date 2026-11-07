/**
 * The Settings modal's keyboard, focus and unsaved-draft rules (adversarial review 2026-11-07).
 * Pure, so the tests pin them without a DOM.
 *
 * - Focus: the kit's AfModal pulls back any focus that lands outside the dialog
 *   (af_modal_core `onFocusIn`), and the kit's AfSelect renders its list and search box in
 *   `document.body`. Opening a dropdown therefore sent focus to the first control of the modal
 *   (the "Mind" button), and the next Enter switched sections. The modal stops that pull for a
 *   focus inside a kit dropdown list. (Kit fix wanted: an AfModal option to keep focus in named
 *   outside layers, or an AfSelect portal container inside the dialog.)
 * - Escape: the modal closes itself on Escape only when no inner layer has handled the key (the
 *   kit's own close-on-Escape runs before the dropdown sees the key, so it is turned off).
 * - Unsaved drafts (Identity, Skills, Prompt): kept while moving between sections; closing with an
 *   unsaved Skills or Prompt draft asks first.
 */
import { SETTINGS_SECTIONS, type SettingsSection } from "./settings_sections";

/** The kit's dropdown lists, rendered outside the dialog. */
export const KIT_POPOVER_SELECTOR = ".af-select-popover";

/** True when a focus target sits in a kit dropdown list (the modal must leave that focus alone). */
export function isKitPopoverTarget(target: EventTarget | null): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null;
  return Boolean(el && typeof el.closest === "function" && el.closest(KIT_POPOVER_SELECTOR));
}

/** True when an Escape keypress should ask to close Settings: no inner layer (a dropdown, a dialog
 * inside) has handled it already. */
export function escapeClosesSettings(e: { key: string; defaultPrevented: boolean }): boolean {
  return (e.key === "Escape" || e.key === "Esc") && !e.defaultPrevented;
}

/** Sections that hold a draft: they stay mounted (hidden) once opened, so moving away keeps it. */
export const DRAFT_SECTIONS: readonly SettingsSection[] = ["identity", "skills", "prompt"];

/** Whether a section's panel is in the tree: the open one, and every draft section opened before. */
export function sectionMounted(id: SettingsSection, open: SettingsSection, visited: ReadonlySet<SettingsSection>): boolean {
  return id === open || (DRAFT_SECTIONS.includes(id) && visited.has(id));
}

/** The sections with unsaved changes, in navigation order. */
export function unsavedSections(dirty: Partial<Record<SettingsSection, boolean>>): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((s) => dirty[s.id]).map((s) => s.id);
}

/** "Skills and Prompt have changes that are not saved." */
export function unsavedSentence(ids: SettingsSection[]): string {
  const names = ids.map((id) => SETTINGS_SECTIONS.find((s) => s.id === id)?.label ?? id);
  if (names.length === 0) return "";
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? "has" : "have"} changes that are not saved. Closing now drops them.`;
}
