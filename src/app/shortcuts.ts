import { PEN_COLORS, type PenColor } from "./config";

export interface ShortcutCommand {
  label: string;
  keys: string[];
  alternateKeys?: string[];
}

export interface ShortcutGroup {
  label: string;
  commands: ShortcutCommand[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "general",
    commands: [{ label: "view keyboard shortcuts", keys: ["⌘", "k"] }],
  },
  {
    label: "tools",
    commands: [
      { label: "draw", keys: ["space"] },
      { label: "erase", keys: ["e"] },
      { label: "text", keys: ["t"] },
      { label: "stroke width", keys: ["w"] },
    ],
  },
  {
    label: "colors",
    commands: PEN_COLORS.map((color, index) => ({
      label: color.label,
      keys: [String(index + 1)],
    })),
  },
  {
    label: "appearance",
    commands: [
      { label: "toggle night mode", keys: ["n"] },
      { label: "toggle background image", keys: ["shift", "i"] },
    ],
  },
  {
    label: "history",
    commands: [
      { label: "undo", keys: ["⌘", "z"], alternateKeys: ["ctrl", "z"] },
      {
        label: "redo",
        keys: ["⌘", "shift", "z"],
        alternateKeys: ["ctrl", "shift", "z"],
      },
    ],
  },
];

export function isUndoRedoShortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    event.key.toLowerCase() === "z" &&
    !isEditableTarget(event.target)
  );
}

export function isTextShortcut(event: KeyboardEvent): boolean {
  return isUnmodifiedKey(event, "t");
}

export function getColorShortcut(event: KeyboardEvent): PenColor | null {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    event.repeat ||
    isEditableTarget(event.target)
  ) {
    return null;
  }

  const shortcutIndex = Number(event.key) - 1;
  if (!Number.isInteger(shortcutIndex)) {
    return null;
  }

  return PEN_COLORS[shortcutIndex] ?? null;
}

export function isNightModeShortcut(event: KeyboardEvent): boolean {
  return isUnmodifiedKey(event, "n");
}

export function isBackgroundImageShortcut(event: KeyboardEvent): boolean {
  return (
    event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.repeat &&
    event.key.toLowerCase() === "i" &&
    !isEditableTarget(event.target)
  );
}

/**
 * Deliberately looser than the other single-key shortcuts: shift is allowed so
 * that a capital W cycles the width too, which `isUnmodifiedKey` would reject.
 */
export function isWidthShortcut(event: KeyboardEvent): boolean {
  return (
    !event.metaKey &&
    event.key.toLowerCase() === "w" &&
    !isEditableTarget(event.target)
  );
}

export function isKeyboardShortcutsShortcut(event: KeyboardEvent): boolean {
  return (
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !event.repeat &&
    event.key.toLowerCase() === "k" &&
    !isEditableTarget(event.target)
  );
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']")
  );
}

function isUnmodifiedKey(event: KeyboardEvent, key: string): boolean {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !event.repeat &&
    event.key.toLowerCase() === key &&
    !isEditableTarget(event.target)
  );
}
