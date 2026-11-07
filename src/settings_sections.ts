/**
 * The Settings modal's map (operator 2026-11-07: "completely remodel the settings modal … better
 * organize"): nine sections in four groups, each with a title and one line saying what it is for.
 * The side list (desktop) and the section select (phone) both read this one table, so the two
 * navigations can never disagree. Pure: the tests pin the order and the select options.
 */
import type { IconName } from "@abstractframework/ui-kit";

export type SettingsSection = "mind" | "voice" | "identity" | "record" | "files" | "mounts" | "tools" | "skills" | "prompt";

export interface SettingsSectionMeta {
  id: SettingsSection;
  /** The word in the navigation and the page title. */
  label: string;
  icon: IconName;
  /** One line under the page title: what the section is for. */
  lede: (entityName: string) => string;
}

export interface SettingsGroupMeta {
  id: string;
  label: string;
  sections: SettingsSectionMeta[];
}

export const SETTINGS_GROUPS: SettingsGroupMeta[] = [
  {
    id: "mind",
    label: "Mind & voice",
    sections: [
      { id: "mind", label: "Mind", icon: "sparkle", lede: (n) => `The model ${n} thinks with, in visits and in his own time.` },
      { id: "voice", label: "Voice", icon: "speaker", lede: (n) => `How you hear ${n} and how your voice reaches him, in this browser.` },
    ],
  },
  {
    id: "identity",
    label: "Identity & record",
    sections: [
      { id: "identity", label: "Identity", icon: "user", lede: (n) => `How ${n} looks and the voice he speaks with, saved together.` },
      { id: "record", label: "Track record", icon: "activity", lede: (n) => `What ${n} has done, how far he is trusted for each kind of task, and whom he has met.` },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    sections: [
      { id: "files", label: "Files", icon: "folder", lede: (n) => `Browse ${n}'s home workspace and read his files.` },
      { id: "mounts", label: "Mounts", icon: "database", lede: (n) => `Extra folders ${n} may reach beside his home, read-only or read and write.` },
      { id: "tools", label: "Tools", icon: "wrench", lede: (n) => `Which tools ${n} holds in each phase of his life. Each switch applies at once.` },
      { id: "skills", label: "Skills", icon: "book", lede: (n) => `What ${n} is taught beyond his capability map, phase by phase.` },
    ],
  },
  {
    id: "prompt",
    label: "Prompt",
    sections: [{ id: "prompt", label: "Prompt", icon: "compose", lede: (n) => `${n}'s system prompt, layer by layer: the layers you may rewrite.` }],
  },
];

/** Every section in navigation order. */
export const SETTINGS_SECTIONS: SettingsSectionMeta[] = SETTINGS_GROUPS.flatMap((g) => g.sections);

/** A section's metadata and the group it belongs to. */
export function settingsSection(id: SettingsSection): { section: SettingsSectionMeta; group: SettingsGroupMeta } {
  for (const group of SETTINGS_GROUPS) {
    const section = group.sections.find((s) => s.id === id);
    if (section) return { section, group };
  }
  throw new Error(`Unknown settings section: ${id}`);
}

/** The phone's section select (the kit's AfSelect): one option per section, grouped like the side list. */
export function settingsSectionOptions(): Array<{ value: SettingsSection; label: string; group: string }> {
  return SETTINGS_GROUPS.flatMap((g) => g.sections.map((s) => ({ value: s.id, label: s.label, group: g.label })));
}
