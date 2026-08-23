import type { Ref } from "preact";
import { cx, FOCUS_RING } from "./classNames";

interface SettingsPanelProps {
  buttonRef: Ref<HTMLButtonElement>;
  panelRef: Ref<HTMLDivElement>;
  isOpen: boolean;
  showHistoryControls: boolean;
  isBackgroundImageVisible: boolean;
  onToggle: () => void;
  onShowHistoryControlsChange: (showHistoryControls: boolean) => void;
  onBackgroundImageVisibilityChange: (isVisible: boolean) => void;
  onOpenShortcuts: () => void;
}

export function SettingsPanel({
  buttonRef,
  panelRef,
  isOpen,
  showHistoryControls,
  isBackgroundImageVisible,
  onToggle,
  onShowHistoryControlsChange,
  onBackgroundImageVisibilityChange,
  onOpenShortcuts,
}: SettingsPanelProps) {
  return (
    <>
      <button
        ref={buttonRef}
        id="settings-button"
        class={cx(
          "fixed right-3.5 bottom-3.5 z-30 grid size-9 cursor-pointer",
          "place-items-center rounded-pill border border-border-default",
          "bg-(--color-overlay-surface) p-0 text-text-secondary",
          "shadow-floating motion-safe:transition-[background,border-color,color]",
          "motion-safe:duration-[140ms] motion-safe:ease-[ease] hover:border-border-strong",
          "hover:bg-(--color-overlay-surface-strong) hover:text-text-primary",
          "focus-visible:border-border-strong",
          "focus-visible:bg-(--color-overlay-surface-strong)",
          "focus-visible:text-text-primary",
          "aria-expanded:border-border-strong aria-expanded:text-text-primary",
          "aria-expanded:bg-(--color-overlay-surface-strong)",
          "max-tight:right-4 max-tight:bottom-2.5 max-tight:size-10",
          FOCUS_RING
        )}
        type="button"
        aria-label="settings"
        aria-controls="settings-panel"
        aria-expanded={isOpen}
        title="settings"
        onClick={onToggle}
      >
        {/*
          Stroke styling goes through utilities, not JSX props: Preact emits
          camelCase SVG attributes verbatim, so `strokeWidth` lands in the DOM
          as an attribute SVG ignores.
        */}
        <svg
          class="size-4 fill-none stroke-current stroke-[1.8]
            [stroke-linecap:round] [stroke-linejoin:round]"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2 2 0 1 1-2.82 2.82l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21a2 2 0 1 1-4 0v-.06a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2 2 0 1 1-2.82-2.82l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.08H3a2 2 0 1 1 0-4h.06A1.8 1.8 0 0 0 4.71 8.8a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2 2 0 1 1 2.82-2.82l.04.04a1.8 1.8 0 0 0 1.98.36h.01a1.8 1.8 0 0 0 1.08-1.65V3a2 2 0 1 1 4 0v.06a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2 2 0 1 1 2.82 2.82l-.04.04a1.8 1.8 0 0 0-.36 1.98v.01a1.8 1.8 0 0 0 1.65 1.08H21a2 2 0 1 1 0 4h-.06A1.8 1.8 0 0 0 19.4 15z" />
        </svg>
      </button>
      <div
        ref={panelRef}
        id="settings-panel"
        class={cx(
          "fixed right-3.5 bottom-[54px] z-31 min-w-[164px] rounded-panel",
          "border border-border-subtle bg-(--color-overlay-surface-strong) px-3 py-2.5 shadow-panel",
          "backdrop-blur-[12px] max-tight:right-4 max-tight:bottom-12",
          !isOpen && "hidden"
        )}
        role="dialog"
        aria-label="settings"
        hidden={!isOpen}
      >
        <label
          class="text-text-strong flex cursor-pointer items-center gap-2 text-[13px]/[1.2]
            whitespace-nowrap"
        >
          <input
            id="show-history-controls"
            class="m-0 size-3.5 accent-action"
            type="checkbox"
            checked={showHistoryControls}
            onChange={(event) => {
              onShowHistoryControlsChange(event.currentTarget.checked);
            }}
          />
          <span>show undo/redo</span>
        </label>
        <label
          class="text-text-strong mt-2 flex cursor-pointer items-center gap-2 text-[13px]/[1.2]
            whitespace-nowrap"
        >
          <input
            id="show-background-image"
            class="m-0 size-3.5 accent-action"
            type="checkbox"
            checked={isBackgroundImageVisible}
            aria-keyshortcuts="Shift+I"
            onChange={(event) => {
              onBackgroundImageVisibilityChange(event.currentTarget.checked);
            }}
          />
          <span>show background image</span>
        </label>
        <button
          id="commands-shortcuts-button"
          class={cx(
            "text-text-muted mt-2.5 h-auto w-full cursor-pointer rounded-none",
            "border-none bg-transparent p-0 text-left text-[13px]/[1.3]",
            "shadow-none hover:text-text-primary",
            FOCUS_RING
          )}
          type="button"
          aria-haspopup="dialog"
          aria-controls="commands-shortcuts-dialog"
          aria-keyshortcuts="Meta+K"
          title="view keyboard shortcuts (⌘ k)"
          onClick={onOpenShortcuts}
        >
          view keyboard shortcuts
        </button>
      </div>
    </>
  );
}
