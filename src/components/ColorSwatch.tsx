import type { PenColor } from "../app/config";
import { cx, FOCUS_RING } from "./classNames";

interface ColorSwatchProps {
  color: PenColor;
  shortcut: number;
  isSelected: boolean;
  onSelect: (color: string) => void;
}

export function ColorSwatch({
  color,
  shortcut,
  isSelected,
  onSelect,
}: ColorSwatchProps) {
  return (
    <button
      type="button"
      class={cx(
        "color-swatch text-text-primary size-[26px] cursor-pointer",
        "max-compact:size-6",
        "rounded-pill border p-0 bg-(--swatch-color) shadow-swatch",
        "enabled:hover:border-border-strong",
        FOCUS_RING,
        // One border-color class only: competing arbitrary values in the same
        // utility family resolve by Tailwind's sort order, not by class order.
        color.value === "#ffffff"
          ? "border-[#c6ccd6]"
          : "border-[rgba(17,24,39,0.12)]",
        isSelected &&
          "is-selected outline-2 outline-offset-2 outline-selection-ring max-compact:outline-offset-1"
      )}
      data-color-value={color.value}
      title={`${color.label} (${shortcut})`}
      aria-label={`${color.label} pen`}
      aria-keyshortcuts={String(shortcut)}
      aria-pressed={isSelected}
      style={{ "--swatch-color": color.value }}
      onClick={(event) => {
        onSelect(color.value);
        event.currentTarget.blur();
      }}
    />
  );
}
