import type { Ref } from "preact";

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
        class="settings-button"
        type="button"
        aria-label="settings"
        aria-controls="settings-panel"
        aria-expanded={isOpen}
        title="settings"
        onClick={onToggle}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2 2 0 1 1-2.82 2.82l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21a2 2 0 1 1-4 0v-.06a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2 2 0 1 1-2.82-2.82l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.08H3a2 2 0 1 1 0-4h.06A1.8 1.8 0 0 0 4.71 8.8a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2 2 0 1 1 2.82-2.82l.04.04a1.8 1.8 0 0 0 1.98.36h.01a1.8 1.8 0 0 0 1.08-1.65V3a2 2 0 1 1 4 0v.06a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2 2 0 1 1 2.82 2.82l-.04.04a1.8 1.8 0 0 0-.36 1.98v.01a1.8 1.8 0 0 0 1.65 1.08H21a2 2 0 1 1 0 4h-.06A1.8 1.8 0 0 0 19.4 15z" />
        </svg>
      </button>
      <div
        ref={panelRef}
        id="settings-panel"
        class="settings-panel"
        role="dialog"
        aria-label="settings"
        hidden={!isOpen}
      >
        <label class="settings-checkbox">
          <input
            id="show-history-controls"
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
          class="settings-reference-button"
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
