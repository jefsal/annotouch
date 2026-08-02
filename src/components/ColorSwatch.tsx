import { NIGHT_FILTER, type PenColor } from "../app/config";
import { cx } from "./classNames";

interface ColorSwatchProps {
  color: PenColor;
  shortcut: number;
  isSelected: boolean;
  isNight: boolean;
  onSelect: (color: string) => void;
}

export function ColorSwatch({
  color,
  shortcut,
  isSelected,
  isNight,
  onSelect,
}: ColorSwatchProps) {
  return (
    <button
      type="button"
      class={cx(
        "color-swatch text-text-primary size-[26px] cursor-pointer",
        "max-compact:size-6 max-tight:size-5",
        "rounded-pill border p-0 bg-(--swatch-color) shadow-swatch",
        "enabled:hover:border-border-strong",
        "focus-visible:outline-3 focus-visible:outline-offset-2",
        "focus-visible:outline-action-ring",
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
      style={{
        "--swatch-color": color.value,
        // Counter-inverts the night filter so pen colors stay true.
        filter: isNight ? NIGHT_FILTER : "",
      }}
      onClick={(event) => {
        onSelect(color.value);
        event.currentTarget.blur();
      }}
    />
  );
}
