import { describe, expect, it } from "vitest";

import {
  getColorShortcut,
  isBackgroundImageShortcut,
  isKeyboardShortcutsShortcut,
  isNightModeShortcut,
  isTextShortcut,
  isUndoRedoShortcut,
  isWidthShortcut,
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
