import { describe, expect, it } from "vitest";

import {
  filterShortcutGroups,
  getColorShortcut,
  isBackgroundImageShortcut,
  isHighlightShortcut,
  isKeyboardShortcutsShortcut,
  isNightModeShortcut,
  isShortcutSearchTarget,
  isTextShortcut,
  isUndoRedoShortcut,
  isWidthShortcut,
  MIN_GROUP_QUERY_LENGTH,
  SHORTCUT_GROUPS,
  SHORTCUT_SEARCH_ID,
  type ShortcutGroup,
} from "../../src/app/shortcuts";

function keyboardEvent(
  key: string,
  init: KeyboardEventInit = {},
  target?: Element
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, ...init });
  if (target) {
    Object.defineProperty(event, "target", { value: target });
  }
  return event;
}

describe("keyboard shortcuts", () => {
  it("recognizes application commands", () => {
    expect(isUndoRedoShortcut(keyboardEvent("z", { ctrlKey: true }))).toBe(
      true
    );
    expect(isTextShortcut(keyboardEvent("t"))).toBe(true);
    expect(isNightModeShortcut(keyboardEvent("N"))).toBe(true);
    expect(
      isBackgroundImageShortcut(keyboardEvent("I", { shiftKey: true }))
    ).toBe(true);
    expect(isWidthShortcut(keyboardEvent("w"))).toBe(true);
    expect(
      isKeyboardShortcutsShortcut(keyboardEvent("k", { metaKey: true }))
    ).toBe(true);
  });

  it("maps unmodified number keys to toolbar colors", () => {
    expect(getColorShortcut(keyboardEvent("2"))).toEqual({
      label: "red",
      value: "#e11d48",
    });
    expect(getColorShortcut(keyboardEvent("9"))).toBeNull();
    expect(getColorShortcut(keyboardEvent("2", { shiftKey: true }))).toBeNull();
  });

  it("suppresses commands in editable controls", () => {
    const input = document.createElement("input");

    expect(isTextShortcut(keyboardEvent("t", {}, input))).toBe(false);
    expect(
      isUndoRedoShortcut(keyboardEvent("z", { metaKey: true }, input))
    ).toBe(false);
    expect(getColorShortcut(keyboardEvent("1", {}, input))).toBeNull();
    expect(
      isBackgroundImageShortcut(keyboardEvent("I", { shiftKey: true }, input))
    ).toBe(false);
  });

  it("requires shift for the background image shortcut", () => {
    expect(isBackgroundImageShortcut(keyboardEvent("i"))).toBe(false);
    expect(
      isBackgroundImageShortcut(
        keyboardEvent("I", { shiftKey: true, metaKey: true })
      )
    ).toBe(false);
  });
});

describe("highlight shortcut", () => {
  it("toggles on an unmodified h outside editable controls", () => {
    const input = document.createElement("input");

    expect(isHighlightShortcut(keyboardEvent("h"))).toBe(true);
    expect(isHighlightShortcut(keyboardEvent("h", { metaKey: true }))).toBe(
      false
    );
    expect(isHighlightShortcut(keyboardEvent("h", {}, input))).toBe(false);
  });
});

describe("shortcut search target", () => {
  it("lets command k through only from the dialog's search field", () => {
    const search = document.createElement("input");
    search.id = SHORTCUT_SEARCH_ID;
    const otherInput = document.createElement("input");

    expect(isShortcutSearchTarget(search)).toBe(true);
    expect(isShortcutSearchTarget(otherInput)).toBe(false);
    expect(
      isKeyboardShortcutsShortcut(keyboardEvent("k", { metaKey: true }, search))
    ).toBe(true);
    expect(
      isKeyboardShortcutsShortcut(
        keyboardEvent("k", { metaKey: true }, otherInput)
      )
    ).toBe(false);
  });

  it("keeps every other shortcut off inside the search field", () => {
    const search = document.createElement("input");
    search.id = SHORTCUT_SEARCH_ID;

    expect(isTextShortcut(keyboardEvent("t", {}, search))).toBe(false);
    expect(isNightModeShortcut(keyboardEvent("n", {}, search))).toBe(false);
    expect(getColorShortcut(keyboardEvent("1", {}, search))).toBeNull();
    expect(
      isUndoRedoShortcut(keyboardEvent("z", { metaKey: true }, search))
    ).toBe(false);
  });
});

describe("filterShortcutGroups", () => {
  function search(query: string): Record<string, string[]> {
    return Object.fromEntries(
      filterShortcutGroups(SHORTCUT_GROUPS, query).map((group) => [
        group.label,
        group.commands.map((command) => command.label),
      ])
    );
  }

  it("returns every group unchanged for a blank query", () => {
    expect(filterShortcutGroups(SHORTCUT_GROUPS, "")).toBe(SHORTCUT_GROUPS);
    expect(filterShortcutGroups(SHORTCUT_GROUPS, "   ")).toBe(SHORTCUT_GROUPS);
  });

  it("matches command labels by substring, ignoring case and whitespace", () => {
    expect(search("  NIGHT ")).toEqual({
      appearance: ["toggle night mode"],
    });
    expect(search("highl")).toEqual({ tools: ["highlight text"] });
  });

  it("matches aliases without displaying them", () => {
    expect(search("dark")).toEqual({ appearance: ["toggle night mode"] });
    expect(search("pen")).toMatchObject({ tools: ["draw"] });
    expect(search("delete")).toEqual({ tools: ["erase"] });
  });

  it("shows a whole group once the query is long enough", () => {
    expect(MIN_GROUP_QUERY_LENGTH).toBe(3);
    expect(search("colors").colors).toEqual(
      SHORTCUT_GROUPS.find((group) => group.label === "colors")?.commands.map(
        (command) => command.label
      )
    );
    expect(search("his")).toEqual({ history: ["undo", "redo"] });
    expect(search("ory")).toEqual({ history: ["undo", "redo"] });
  });

  it("does not match group names with shorter queries", () => {
    // Both "tools" and "history" contain "to"; only labels match here.
    expect(search("to")).toEqual({
      appearance: ["toggle night mode", "toggle background image"],
    });
  });

  it("matches keys only as whole tokens", () => {
    expect(search("z")).toEqual({ history: ["undo", "redo"] });
    expect(search("shift")).toEqual({
      appearance: ["toggle background image"],
      history: ["redo"],
    });
    expect(search("space")).toMatchObject({ tools: ["draw"] });
    expect(search("2")).toEqual({ colors: [expect.any(String)] });
  });

  it("maps typed modifier words to their key symbols", () => {
    for (const word of ["cmd", "command", "meta", "⌘", "CMD"]) {
      expect(search(word)).toEqual({
        general: ["view keyboard shortcuts"],
        history: ["undo", "redo"],
      });
    }

    for (const word of ["ctrl", "control"]) {
      expect(search(word)).toEqual({ history: ["undo", "redo"] });
    }
  });

  it("matches chords split on spaces and plus signs", () => {
    expect(search("shift+i")).toEqual({
      appearance: ["toggle background image"],
    });
    expect(search("cmd z")).toEqual({ history: ["undo", "redo"] });
    expect(search("ctrl + shift + z")).toEqual({ history: ["redo"] });
    expect(search("i shift")).toEqual({
      appearance: ["toggle background image"],
    });
  });

  it("never mixes a command's keys with its alternate keys", () => {
    expect(search("cmd ctrl z")).toEqual({});
  });

  it("returns nothing when no command matches", () => {
    expect(search("xyzzy")).toEqual({});
    expect(search("+")).toEqual({});
  });

  it("keeps group and command order and leaves the input untouched", () => {
    const groups: ShortcutGroup[] = [
      {
        label: "first",
        commands: [
          { label: "beta", keys: ["b"] },
          { label: "alpha", keys: ["a"] },
        ],
      },
      { label: "second", commands: [{ label: "alphabet", keys: ["c"] }] },
    ];

    expect(filterShortcutGroups(groups, "alpha")).toEqual([
      { label: "first", commands: [{ label: "alpha", keys: ["a"] }] },
      { label: "second", commands: [{ label: "alphabet", keys: ["c"] }] },
    ]);
    expect(groups[0]?.commands).toHaveLength(2);
  });
});
