import type { Ref } from "preact";
import { cx } from "./classNames";

interface SettingsPanelProps {
  buttonRef: Ref<HTMLButtonElement>;
  panelRef: Ref<HTMLDivElement>;
  isOpen: boolean;
  showHistoryControls: boolean;
  onToggle: () => void;
  onShowHistoryControlsChange: (showHistoryControls: boolean) => void;
  onOpenShortcuts: () => void;
}

export function SettingsPanel({
  buttonRef,
  panelRef,
  isOpen,
  showHistoryControls,
  onToggle,
  onShowHistoryControlsChange,
  onOpenShortcuts,
}: SettingsPanelProps) {
  return (
    <>
      <button
        ref={buttonRef}
        id="settings-button"
        class="fixed right-3.5 bottom-3.5 z-30 grid size-8 cursor-pointer
          place-items-center rounded-pill border border-[rgba(104,115,134,0.35)]
          bg-[rgba(255,255,255,0.72)] p-0 text-text-muted opacity-[0.42] shadow-floating
          transition-[background,border-color,color,opacity] duration-[140ms] ease-[ease]
          hover:border-border-strong hover:bg-[rgba(255,255,255,0.96)] hover:text-text-primary
          hover:opacity-100 focus-visible:border-border-strong
          focus-visible:bg-[rgba(255,255,255,0.96)] focus-visible:text-text-primary
          focus-visible:opacity-100 aria-expanded:border-border-strong
          aria-expanded:bg-[rgba(255,255,255,0.96)] aria-expanded:text-text-primary
          aria-expanded:opacity-100 max-[480px]:right-4 max-[480px]:bottom-2.5
          max-[480px]:size-[30px]"
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
          "border border-border-subtle bg-[rgba(255,255,255,0.96)] px-3 py-2.5 shadow-panel",
          "backdrop-blur-[12px] max-[480px]:right-4 max-[480px]:bottom-12",
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
        <button
          id="commands-shortcuts-button"
          class="text-text-muted mt-2.5 h-auto w-full cursor-pointer rounded-none
            border-none bg-transparent p-0 text-left text-[13px]/[1.3] shadow-none
            hover:text-text-primary"
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
