import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getInitialBackgroundImageVisibility,
  getInitialTheme,
  getInitialToolbarSettings,
  persistBackgroundImageVisibility,
  persistTheme,
  persistToolbarSettings,
} from "../../src/app/preferences";

describe("preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });

  it("uses a saved theme before the system preference", () => {
    localStorage.setItem("annotouch-theme", "night");
    expect(getInitialTheme()).toBe("night");
  });

  it("falls back to the system theme", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    expect(getInitialTheme()).toBe("night");
  });

  it("validates stored toolbar settings", () => {
    localStorage.setItem(
      "annotouch-toolbar-settings",
      JSON.stringify({ showHistoryControls: true })
    );
    expect(getInitialToolbarSettings()).toEqual({
      showHistoryControls: true,
    });

    localStorage.setItem("annotouch-toolbar-settings", "{invalid");
    expect(getInitialToolbarSettings()).toEqual({
      showHistoryControls: false,
    });
  });

  it("defaults the background image on and validates its stored visibility", () => {
    expect(getInitialBackgroundImageVisibility()).toBe(true);

    localStorage.setItem("annotouch-background-image", "false");
    expect(getInitialBackgroundImageVisibility()).toBe(false);

    localStorage.setItem("annotouch-background-image", "invalid");
    expect(getInitialBackgroundImageVisibility()).toBe(true);
  });

  it("persists the stable storage contract", () => {
    persistTheme("light");
    persistToolbarSettings({ showHistoryControls: true });
    persistBackgroundImageVisibility(false);

    expect(localStorage.getItem("annotouch-theme")).toBe("light");
    expect(localStorage.getItem("annotouch-toolbar-settings")).toBe(
      '{"showHistoryControls":true}'
    );
    expect(localStorage.getItem("annotouch-background-image")).toBe("false");
  });
});
