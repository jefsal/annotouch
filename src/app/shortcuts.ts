import { PEN_COLORS, type PenColor } from "./config";

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
