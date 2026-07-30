import type { Theme } from "../domain/types";

interface AppShellProps {
  theme: Theme;
  showHistoryControls: boolean;
}

export function AppShell({
  theme,
  showHistoryControls,
}: AppShellProps) {
  return (
    <main class="app-shell">
      <Toolbar theme={theme} />
      <Workspace />
      <Settings showHistoryControls={showHistoryControls} />
      <ShortcutsDialog />
    </main>
  );
}

function Toolbar({ theme }: Pick<AppShellProps, "theme">) {
  return (
    <header class="toolbar">
      <div class="brand-block">
        <div
          id="theme-toggle"
          class="brand"
          role="button"
          tabIndex={0}
          aria-label="toggle night mode"
          aria-keyshortcuts="N"
          aria-pressed={theme === "night"}
          title="toggle night mode (N)"
        >
          annotouch
        </div>
      </div>
      <input
        id="pdf-input"
        class="file-input"
        type="file"
        accept="application/pdf"
      />
      <div class="toolbar-section">
        <div
          id="color-controls"
          class="pen-color-group"
          role="group"
          aria-label="pen color"
        />
      </div>
      <button id="width-button" class="width-button" type="button" />
      <div class="history-controls" role="group" aria-label="history">
        <button id="undo-button" class="history-button" type="button" disabled>
          undo
        </button>
        <button id="redo-button" class="history-button" type="button" disabled>
          redo
        </button>
      </div>
      <div class="zoom-controls" role="group" aria-label="zoom">
        <button
          id="zoom-out-button"
          class="zoom-button"
          type="button"
          disabled
          title="zoom out"
          aria-label="zoom out"
        >
          -
        </button>
        <button
          id="zoom-in-button"
          class="zoom-button"
          type="button"
          disabled
          title="zoom in"
          aria-label="zoom in"
        >
          +
        </button>
      </div>
      <div id="document-summary" class="document-summary" hidden>
        <span id="document-name" class="document-name" />
        <span id="document-count" class="document-count" />
      </div>
      <div
        id="status"
        class="status is-muted"
        role="status"
        aria-live="polite"
      >
        no PDF loaded
      </div>
      <button
        id="export-button"
        class="export-button"
        type="button"
        disabled
        title="export PDF"
      >
        export
      </button>
    </header>
  );
}

function Workspace() {
  return (
    <section class="workspace" aria-label="pdf annotation workspace">
      <label id="empty-state" class="empty-state" for="pdf-input">
        <span class="empty-title">drop a PDF </span>
        <span class="empty-copy">or choose a local file</span>
        <span class="empty-action">choose PDF</span>
      </label>
      <div id="pages-container" class="pages-container" hidden />
    </section>
  );
}

function Settings({
  showHistoryControls,
}: Pick<AppShellProps, "showHistoryControls">) {
  return (
    <>
      <button
        id="settings-button"
        class="settings-button"
        type="button"
        aria-label="settings"
        aria-controls="settings-panel"
        aria-expanded="false"
        title="settings"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2 2 0 1 1-2.82 2.82l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21a2 2 0 1 1-4 0v-.06a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2 2 0 1 1-2.82-2.82l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.08H3a2 2 0 1 1 0-4h.06A1.8 1.8 0 0 0 4.71 8.8a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2 2 0 1 1 2.82-2.82l.04.04a1.8 1.8 0 0 0 1.98.36h.01a1.8 1.8 0 0 0 1.08-1.65V3a2 2 0 1 1 4 0v.06a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2 2 0 1 1 2.82 2.82l-.04.04a1.8 1.8 0 0 0-.36 1.98v.01a1.8 1.8 0 0 0 1.65 1.08H21a2 2 0 1 1 0 4h-.06A1.8 1.8 0 0 0 19.4 15z" />
        </svg>
      </button>
      <div
        id="settings-panel"
        class="settings-panel"
        role="dialog"
        aria-label="settings"
        hidden
      >
        <label class="settings-checkbox">
          <input
            id="show-history-controls"
            type="checkbox"
            checked={showHistoryControls}
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
        >
          view keyboard shortcuts
        </button>
      </div>
    </>
  );
}

function ShortcutsDialog() {
  return (
    <dialog
      id="commands-shortcuts-dialog"
      class="commands-shortcuts-dialog"
      aria-labelledby="commands-shortcuts-title"
    >
      <div class="commands-shortcuts-header">
        <h2 id="commands-shortcuts-title">keyboard shortcuts</h2>
        <button
          id="commands-shortcuts-close"
          class="commands-shortcuts-close"
          type="button"
          aria-label="close keyboard shortcuts"
          autoFocus
        >
          &times;
        </button>
      </div>
      <div
        id="commands-shortcuts-content"
        class="commands-shortcuts-content"
      />
    </dialog>
  );
}
