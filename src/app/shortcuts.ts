import { PEN_COLORS, type PenColor } from "./config";

export interface ShortcutCommand {
  label: string;
  keys: string[];
  alternateKeys?: string[];
  /** Extra search terms for the shortcut dialog; never displayed. */
  aliases?: string[];
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
      { label: "draw", keys: ["space"], aliases: ["pen", "stroke"] },
      { label: "erase", keys: ["e"], aliases: ["delete", "remove"] },
      { label: "text", keys: ["t"] },
      { label: "highlight text", keys: ["h"] },
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
      {
        label: "toggle night mode",
        keys: ["n"],
        aliases: ["dark", "theme"],
      },
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

/**
 * Group names only match once the query is this long, so that a letter or two
 * does not pull in whole groups that merely contain it.
 */
export const MIN_GROUP_QUERY_LENGTH = 3;

export const SHORTCUT_SEARCH_ID = "commands-shortcuts-search";

const KEY_TOKEN_ALIASES = new Map([
  ["cmd", "⌘"],
  ["command", "⌘"],
  ["meta", "⌘"],
  ["control", "ctrl"],
]);

/**
 * Narrows the shortcut list for the dialog's search field, keeping group and
 * command order. Labels, aliases, and group names match by substring; keys
 * only match whole tokens, so `shift+i` finds a chord but `e` does not match
 * every key that contains an e.
 */
export function filterShortcutGroups(
  groups: ShortcutGroup[],
  query: string
): ShortcutGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return groups;
  }

  const keyTokens = normalizedQuery
    .split(/[\s+]+/)
    .filter(Boolean)
    .map((token) => KEY_TOKEN_ALIASES.get(token) ?? token);

  return groups.flatMap((group) => {
    if (
      normalizedQuery.length >= MIN_GROUP_QUERY_LENGTH &&
      group.label.toLowerCase().includes(normalizedQuery)
    ) {
      return [group];
    }

    const commands = group.commands.filter((command) =>
      commandMatches(command, normalizedQuery, keyTokens)
    );

    return commands.length > 0 ? [{ ...group, commands }] : [];
  });
}

function commandMatches(
  command: ShortcutCommand,
  normalizedQuery: string,
  keyTokens: string[]
): boolean {
  const terms = [command.label, ...(command.aliases ?? [])];
  if (terms.some((term) => term.toLowerCase().includes(normalizedQuery))) {
    return true;
  }

  // Every token must belong to the same chord; a query never mixes a
  // command's keys with its alternate keys.
  return (
    keyTokens.length > 0 &&
    [command.keys, command.alternateKeys ?? []].some((chord) =>
      keyTokens.every((token) => chord.includes(token))
    )
  );
}

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

export function isHighlightShortcut(event: KeyboardEvent): boolean {
  return isUnmodifiedKey(event, "h");
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
    // The dialog's own search field is the one editable control that may
    // still toggle the dialog; every other shortcut stays off while typing.
    (isShortcutSearchTarget(event.target) || !isEditableTarget(event.target))
  );
}

export function isShortcutSearchTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.id === SHORTCUT_SEARCH_ID;
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
