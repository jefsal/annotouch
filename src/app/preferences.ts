import { THEMES } from "./config";
import type { Theme } from "../domain/types";

const THEME_STORAGE_KEY = "annotouch-theme";
const TOOLBAR_SETTINGS_STORAGE_KEY = "annotouch-toolbar-settings";
const BACKGROUND_IMAGE_STORAGE_KEY = "annotouch-background-image";

export interface ToolbarSettings {
  showHistoryControls: boolean;
}

export const DEFAULT_TOOLBAR_SETTINGS: ToolbarSettings = {
  showHistoryControls: false,
};

export const DEFAULT_BACKGROUND_IMAGE_VISIBILITY = true;

export function getInitialTheme(): Theme {
  const savedTheme = readStoredTheme();

  if (savedTheme) {
    return savedTheme;
  }

  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return THEMES.NIGHT;
  }

  return THEMES.LIGHT;
}

export function readStoredTheme(): Theme | null {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (storedTheme === THEMES.LIGHT || storedTheme === THEMES.NIGHT) {
      return storedTheme;
    }
  } catch {
    return null;
  }

  return null;
}

export function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The selected theme still applies for this page load if storage is blocked.
  }
}

export function getInitialBackgroundImageVisibility(): boolean {
  try {
    const storedVisibility = window.localStorage.getItem(
      BACKGROUND_IMAGE_STORAGE_KEY
    );

    if (storedVisibility === "true" || storedVisibility === "false") {
      return storedVisibility === "true";
    }
  } catch {
    return DEFAULT_BACKGROUND_IMAGE_VISIBILITY;
  }

  return DEFAULT_BACKGROUND_IMAGE_VISIBILITY;
}

export function persistBackgroundImageVisibility(isVisible: boolean): void {
  try {
    window.localStorage.setItem(
      BACKGROUND_IMAGE_STORAGE_KEY,
      String(isVisible)
    );
  } catch {
    // The selected setting still applies for this page load if storage is blocked.
  }
}

export function getInitialToolbarSettings(): ToolbarSettings {
  try {
    const storedSettings = window.localStorage.getItem(
      TOOLBAR_SETTINGS_STORAGE_KEY
    );

    if (!storedSettings) {
      return { ...DEFAULT_TOOLBAR_SETTINGS };
    }

    const parsedSettings: unknown = JSON.parse(storedSettings);

    if (
      typeof parsedSettings === "object" &&
      parsedSettings !== null &&
      "showHistoryControls" in parsedSettings &&
      typeof parsedSettings.showHistoryControls === "boolean"
    ) {
      return {
        showHistoryControls: parsedSettings.showHistoryControls,
      };
    }
  } catch {
    return { ...DEFAULT_TOOLBAR_SETTINGS };
  }

  return { ...DEFAULT_TOOLBAR_SETTINGS };
}

export function persistToolbarSettings(settings: ToolbarSettings): void {
  try {
    window.localStorage.setItem(
      TOOLBAR_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch {
    // The selected setting still applies for this page load if storage is blocked.
  }
}
