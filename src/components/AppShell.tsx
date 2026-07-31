import type { Ref } from "preact";
import { NIGHT_FILTER, PEN_COLORS, PEN_WIDTHS, THEMES } from "../app/config";
import {
  canExport,
  canRedo,
  canUndo,
  canZoomIn,
  canZoomOut,
  hasDocument,
  type AppState,
} from "../app/state";
import { DocumentViewport } from "./DocumentViewport";
import { SettingsPanel } from "./SettingsPanel";
import { ShortcutDialog } from "./ShortcutDialog";

export interface AppShellProps {
  state: AppState;
  workspaceRef: Ref<HTMLElement>;
  pagesRef: Ref<HTMLDivElement>;
  settingsButtonRef: Ref<HTMLButtonElement>;
  settingsPanelRef: Ref<HTMLDivElement>;
  onOpenFile: (file: File | undefined) => void;
  onDropFile: (file: File | undefined) => void;
  onToggleTheme: () => void;
  onSelectColor: (color: string) => void;
  onCycleWidth: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onExport: () => void;
  onToggleSettings: () => void;
  onShowHistoryControlsChange: (showHistoryControls: boolean) => void;
  onOpenShortcuts: () => void;
  onCloseShortcuts: () => void;
}

export function AppShell(props: AppShellProps) {
  const { state } = props;

  return (
    <main class="app-shell grid h-screen min-h-screen grid-rows-[auto_1fr]">
      <Toolbar {...props} />
      <DocumentViewport
        workspaceRef={props.workspaceRef}
        pagesRef={props.pagesRef}
        hasDocument={hasDocument(state)}
        isBusy={state.isBusy}
        onDropFile={props.onDropFile}
      />
      <SettingsPanel
        buttonRef={props.settingsButtonRef}
        panelRef={props.settingsPanelRef}
        isOpen={state.isSettingsOpen}
        showHistoryControls={state.toolbar.showHistoryControls}
        onToggle={props.onToggleSettings}
        onShowHistoryControlsChange={props.onShowHistoryControlsChange}
        onOpenShortcuts={props.onOpenShortcuts}
      />
      <ShortcutDialog
        isOpen={state.isShortcutDialogOpen}
        onClose={props.onCloseShortcuts}
      />
    </main>
  );
}

function Toolbar({
  state,
  onOpenFile,
  onToggleTheme,
  onSelectColor,
  onCycleWidth,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onExport,
}: AppShellProps) {
  const isNight = state.theme === THEMES.NIGHT;
  const currentWidth =
    PEN_WIDTHS.find((width) => width.value === state.pen.width) ??
    PEN_WIDTHS[0];
  const nextWidth =
    PEN_WIDTHS[(PEN_WIDTHS.indexOf(currentWidth) + 1) % PEN_WIDTHS.length] ??
    currentWidth;

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
          aria-pressed={isNight}
          title={isNight ? "switch to light mode (N)" : "toggle night mode (N)"}
          onClick={onToggleTheme}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;

            event.preventDefault();
            onToggleTheme();
          }}
        >
          annotouch
        </div>
      </div>
      <input
        id="pdf-input"
        class="file-input"
        type="file"
        accept="application/pdf"
        disabled={state.isBusy}
        onClick={(event) => {
          event.currentTarget.value = "";
        }}
        onChange={(event) => {
          onOpenFile(event.currentTarget.files?.[0]);
        }}
      />
      <div class="toolbar-section">
        <div
          id="color-controls"
          class="pen-color-group"
          role="group"
          aria-label="pen color"
        >
          {PEN_COLORS.map((color, index) => {
            const isSelected = color.value === state.pen.color;

            return (
              <button
                key={color.value}
                type="button"
                class={`color-swatch${
                  color.value === "#ffffff" ? " color-swatch-white" : ""
                }${isSelected ? " is-selected" : ""}`}
                data-color-value={color.value}
                title={`${color.label} (${index + 1})`}
                aria-label={`${color.label} pen`}
                aria-keyshortcuts={String(index + 1)}
                aria-pressed={isSelected}
                style={{
                  "--swatch-color": color.value,
                  filter: isNight ? NIGHT_FILTER : "",
                }}
                onClick={(event) => {
                  onSelectColor(color.value);
                  event.currentTarget.blur();
                }}
              />
            );
          })}
        </div>
      </div>
      <button
        id="width-button"
        class="width-button"
        type="button"
        data-width-value={String(currentWidth.value)}
        aria-label={`stroke width: ${currentWidth.label}`}
        aria-keyshortcuts="W"
        title={`stroke width: ${currentWidth.label}; click or press W for ${nextWidth.label}`}
        onClick={(event) => {
          onCycleWidth();
          event.currentTarget.blur();
        }}
      >
        {currentWidth.label}
      </button>
      <div class="history-controls" role="group" aria-label="history">
        <button
          id="undo-button"
          class="history-button"
          type="button"
          disabled={!canUndo(state)}
          onClick={onUndo}
        >
          undo
        </button>
        <button
          id="redo-button"
          class="history-button"
          type="button"
          disabled={!canRedo(state)}
          onClick={onRedo}
        >
          redo
        </button>
      </div>
      <div class="zoom-controls" role="group" aria-label="zoom">
        <button
          id="zoom-out-button"
          class="zoom-button"
          type="button"
          disabled={!canZoomOut(state)}
          title="zoom out"
          aria-label="zoom out"
          onClick={(event) => {
            onZoomOut();
            event.currentTarget.blur();
          }}
        >
          -
        </button>
        <button
          id="zoom-in-button"
          class="zoom-button"
          type="button"
          disabled={!canZoomIn(state)}
          title="zoom in"
          aria-label="zoom in"
          onClick={(event) => {
            onZoomIn();
            event.currentTarget.blur();
          }}
        >
          +
        </button>
      </div>
      <DocumentSummary state={state} />
      <div
        id="status"
        class={`status${state.status.isMuted ? " is-muted" : ""}`}
        role="status"
        aria-live="polite"
      >
        {state.status.message}
      </div>
      <button
        id="export-button"
        class="export-button"
        type="button"
        disabled={!canExport(state)}
        title="export PDF"
        onClick={onExport}
      >
        export
      </button>
    </header>
  );
}

function DocumentSummary({ state }: Pick<AppShellProps, "state">) {
  const { document } = state;

  if (document.status !== "ready") {
    return <div id="document-summary" class="document-summary" hidden />;
  }

  const { annotationCount } = state.history;
  const countLabel = `${document.annotatablePageCount}/${document.totalPageCount} pages | ${annotationCount} annotation${
    annotationCount === 1 ? "" : "s"
  }`;

  return (
    <div id="document-summary" class="document-summary">
      <span id="document-name" class="document-name" title={document.fileName}>
        {document.fileName}
      </span>
      <span id="document-count" class="document-count">
        {countLabel}
      </span>
    </div>
  );
}
