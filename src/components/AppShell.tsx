import type { ComponentChildren, Ref } from "preact";
import { PEN_COLORS, PEN_WIDTHS, THEMES } from "../app/config";
import {
  canExport,
  canRedo,
  canUndo,
  canZoomIn,
  canZoomOut,
  hasDocument,
  type AppState,
} from "../app/state";
import { cx } from "./classNames";
import { ColorSwatch } from "./ColorSwatch";
import { ControlButton } from "./ControlButton";
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
    <header
      class="toolbar border-border-toolbar bg-surface/94 shadow-toolbar sticky
        top-0 z-10 flex min-h-16 items-center gap-2.5 border-b px-4 py-2.5
        backdrop-blur-[16px]"
    >
      <div class="brand-block mr-1 grid min-w-[118px] gap-px">
        <div
          id="theme-toggle"
          class="brand cursor-pointer text-base leading-[1.1] font-bold"
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
        class="file-input pointer-events-none fixed size-px opacity-0"
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
      <div
        class="toolbar-section border-border-section bg-surface-raised inline-flex
          h-11 flex-none items-center gap-2 rounded-control border px-[5px]
          py-[3px]"
      >
        <div
          id="color-controls"
          class="pen-color-group inline-flex items-center gap-2"
          role="group"
          aria-label="pen color"
        >
          {PEN_COLORS.map((color, index) => (
            <ColorSwatch
              key={color.value}
              color={color}
              shortcut={index + 1}
              isSelected={color.value === state.pen.color}
              isNight={isNight}
              onSelect={onSelectColor}
            />
          ))}
        </div>
      </div>
      <ControlButton
        id="width-button"
        class="width-button w-16 min-w-16 px-3 text-[12px]"
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
      </ControlButton>
      <div
        class="history-controls inline-flex w-22 items-stretch"
        role="group"
        aria-label="history"
      >
        <ControlButton
          id="undo-button"
          class="history-button min-w-0 flex-1 rounded-tl-[4px] rounded-tr-none
            rounded-br-none rounded-bl-[6px] p-0.5 text-[13px] hover:z-1
            focus-visible:z-1"
          disabled={!canUndo(state)}
          onClick={onUndo}
        >
          undo
        </ControlButton>
        <ControlButton
          id="redo-button"
          class="history-button -ml-px min-w-0 flex-1 rounded-tl-none rounded-tr-[4px]
            rounded-br-[6px] rounded-bl-none p-0.5 text-[13px] hover:z-1
            focus-visible:z-1"
          disabled={!canRedo(state)}
          onClick={onRedo}
        >
          redo
        </ControlButton>
      </div>
      <div
        class="zoom-controls border-border-default bg-surface shadow-control
          inline-flex h-9 w-8 flex-none items-stretch overflow-hidden
          rounded-control border"
        role="group"
        aria-label="zoom"
      >
        <ZoomButton
          id="zoom-out-button"
          label="zoom out"
          disabled={!canZoomOut(state)}
          onActivate={onZoomOut}
        >
          -
        </ZoomButton>
        <ZoomButton
          id="zoom-in-button"
          label="zoom in"
          disabled={!canZoomIn(state)}
          onActivate={onZoomIn}
        >
          +
        </ZoomButton>
      </div>
      <DocumentSummary state={state} />
      <StatusMessage state={state} />
      <ControlButton
        id="export-button"
        class="export-button ml-auto min-w-23 flex-none px-3"
        variant="accent"
        disabled={!canExport(state)}
        title="export PDF"
        onClick={onExport}
      >
        export
      </ControlButton>
    </header>
  );
}

interface ZoomButtonProps {
  id: string;
  label: string;
  disabled: boolean;
  onActivate: () => void;
  children: ComponentChildren;
}

function ZoomButton({
  id,
  label,
  disabled,
  onActivate,
  children,
}: ZoomButtonProps) {
  return (
    <ControlButton
      id={id}
      class="zoom-button h-[34px] w-4 min-w-0 rounded-none border-0 p-0
        text-[13px] shadow-none not-first:border-l not-first:border-l-border-default
        hover:z-1 focus-visible:z-1"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        onActivate();
        event.currentTarget.blur();
      }}
    >
      {children}
    </ControlButton>
  );
}

function StatusMessage({ state }: Pick<AppShellProps, "state">) {
  const isDocumentOpen = hasDocument(state);

  return (
    <div
      id="status"
      class={cx(
        "status",
        isDocumentOpen
          ? "sr-only"
          : "border-border-status bg-surface-muted text-text-muted rounded-control border px-[9px] py-[7px] text-xs leading-none whitespace-nowrap",
        !isDocumentOpen && state.status.isMuted && "opacity-36"
      )}
      role="status"
      aria-live="polite"
    >
      {state.status.message}
    </div>
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
    <div
      class="document-summary ml-auto grid min-w-0 max-w-[min(320px,24vw)] gap-0.5
        leading-[1.2]"
      id="document-summary"
    >
      <span
        id="document-name"
        class="document-name text-text-primary block overflow-hidden text-[13px]
          font-[650] whitespace-nowrap
          [mask-image:linear-gradient(90deg,#000_calc(100%-44px),transparent)]"
        title={document.fileName}
      >
        {document.fileName}
      </span>
      <span
        id="document-count"
        class="document-count text-text-secondary block overflow-hidden
          text-[12px]/[1.2] text-ellipsis whitespace-nowrap opacity-50"
      >
        {countLabel}
      </span>
    </div>
  );
}
