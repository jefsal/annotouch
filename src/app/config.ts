import type { PenSettings, Theme } from "../domain/types";

export const MAX_ANNOTATABLE_PAGES = 200;
export const DEFAULT_RENDER_SCALE = 1.5;
export const DEFAULT_VIEW_SCALE = 1;
export const MIN_VIEW_SCALE = 0.1;
export const MAX_VIEW_SCALE = 2;
export const VIEW_SCALE_STEP = 0.1;
export const PAGE_RENDER_ROOT_MARGIN = "1200px 0px";

export const PEN_COLORS = [
  { label: "black", value: "#111827" },
  { label: "red", value: "#e11d48" },
  { label: "green", value: "#16a34a" },
  { label: "blue", value: "#2563eb" },
  { label: "white", value: "#ffffff" },
] as const;

export type PenColor = (typeof PEN_COLORS)[number];

export const PEN_WIDTHS = [
  { label: "small", value: 2 },
  { label: "med", value: 5 },
  { label: "large", value: 10 },
] as const;

export const DEFAULT_PEN_SETTINGS: PenSettings = {
  color: "#e11d48",
  width: PEN_WIDTHS[0].value,
};

export const THEMES = {
  LIGHT: "light",
  NIGHT: "night",
} as const satisfies Record<string, Theme>;

export const DISCARD_ANNOTATIONS_MESSAGE =
  "discard unsaved annotations and open another PDF?";
