import {
  DEFAULT_PEN_SETTINGS,
  DEFAULT_VIEW_SCALE,
  MAX_VIEW_SCALE,
  MIN_VIEW_SCALE,
  PEN_WIDTHS,
  THEMES,
  VIEW_SCALE_STEP,
} from "./config";
import {
  DEFAULT_BACKGROUND_IMAGE_VISIBILITY,
  DEFAULT_TOOLBAR_SETTINGS,
  type ToolbarSettings,
} from "./preferences";
import type { DocumentState, PenSettings, Theme } from "../domain/types";

export interface StatusState {
  message: string;
  isMuted: boolean;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  annotationCount: number;
}

/**
 * Serializable UI state. PDF bytes, PDF.js objects, canvases, and observers are
 * deliberately kept out of this shape and owned by the document controller.
 */
export interface AppState {
  document: DocumentState;
  status: StatusState;
  isBusy: boolean;
  pen: PenSettings;
  theme: Theme;
  viewScale: number;
  toolbar: ToolbarSettings;
  isBackgroundImageVisible: boolean;
  isSettingsOpen: boolean;
  isShortcutDialogOpen: boolean;
  isTextMode: boolean;
  hasTextDraft: boolean;
  history: HistoryState;
}

export type AppAction =
  | { type: "document/loading"; fileName: string }
  | {
      type: "document/loaded";
      fileName: string;
      totalPageCount: number;
      annotatablePageCount: number;
    }
  | { type: "document/failed"; message: string }
  | { type: "document/closed" }
  | { type: "status/set"; message: string; isMuted?: boolean }
  | { type: "busy/set"; isBusy: boolean }
  | { type: "pen/setColor"; color: string }
  | { type: "pen/cycleWidth" }
  | { type: "theme/set"; theme: Theme }
  | { type: "theme/toggle" }
  | { type: "view/setScale"; scale: number }
  | { type: "view/zoomIn" }
  | { type: "view/zoomOut" }
  | { type: "toolbar/set"; settings: ToolbarSettings }
  | { type: "background/setImageVisible"; isVisible: boolean }
  | { type: "settings/setOpen"; isOpen: boolean }
  | { type: "settings/toggle" }
  | { type: "shortcuts/setOpen"; isOpen: boolean }
  | { type: "text/setMode"; isActive: boolean }
  | { type: "text/setDraft"; hasDraft: boolean }
  | { type: "history/sync"; history: HistoryState };

export const IDLE_STATUS_MESSAGE = "no PDF loaded";
export const LOADING_STATUS_MESSAGE = "loading PDF";
export const READY_STATUS_MESSAGE = "ready";

export const PREPARING_STATUS_PREFIX = "preparing page";

const QUIET_STATUS_MESSAGES: ReadonlySet<string> = new Set([
  IDLE_STATUS_MESSAGE,
  LOADING_STATUS_MESSAGE,
  READY_STATUS_MESSAGE,
]);

/**
 * Whether a message only narrates what the app is doing, as opposed to
 * reporting a problem or asking the reader to act. Quiet messages are
 * announced but never painted, so `isMuted` defaults to true for them and the
 * toolbar keeps a chip for the things worth interrupting someone over.
 *
 * "ready" needs this as much as the idle placeholder does: the annotator emits
 * it whenever an interaction ends, including from its `window` blur handler,
 * which fires when the file picker opens. The annotator outlives any one
 * document, so that arrives even with nothing loaded.
 */
function isQuietStatus(message: string): boolean {
  return (
    QUIET_STATUS_MESSAGES.has(message) ||
    message.startsWith(PREPARING_STATUS_PREFIX)
  );
}

const EMPTY_HISTORY: HistoryState = {
  canUndo: false,
  canRedo: false,
  annotationCount: 0,
};

export interface InitialStateInput {
  theme: Theme;
  toolbar: ToolbarSettings;
  isBackgroundImageVisible: boolean;
}

export function createInitialState(
  { theme, toolbar, isBackgroundImageVisible }: InitialStateInput = {
    theme: THEMES.LIGHT,
    toolbar: DEFAULT_TOOLBAR_SETTINGS,
    isBackgroundImageVisible: DEFAULT_BACKGROUND_IMAGE_VISIBILITY,
  }
): AppState {
  return {
    document: { status: "idle" },
    status: { message: IDLE_STATUS_MESSAGE, isMuted: true },
    isBusy: false,
    pen: { ...DEFAULT_PEN_SETTINGS },
    theme,
    viewScale: DEFAULT_VIEW_SCALE,
    toolbar: { ...toolbar },
    isBackgroundImageVisible,
    isSettingsOpen: false,
    isShortcutDialogOpen: false,
    isTextMode: false,
    hasTextDraft: false,
    history: { ...EMPTY_HISTORY },
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "document/loading":
      return {
        ...closeDocument(state),
        document: { status: "loading", fileName: action.fileName },
        isBusy: true,
        status: { message: LOADING_STATUS_MESSAGE, isMuted: true },
      };

    case "document/loaded": {
      const document: DocumentState = {
        status: "ready",
        fileName: action.fileName,
        totalPageCount: action.totalPageCount,
        annotatablePageCount: action.annotatablePageCount,
      };

      return {
        ...state,
        document,
        status: { message: getReadyStatusMessage(document), isMuted: false },
      };
    }

    case "document/failed":
      return {
        ...closeDocument(state),
        document: { status: "error", message: action.message },
        status: { message: action.message, isMuted: false },
      };

    case "document/closed":
      return {
        ...closeDocument(state),
        status: { message: IDLE_STATUS_MESSAGE, isMuted: true },
      };

    case "status/set":
      return {
        ...state,
        status: {
          message: action.message,
          isMuted: action.isMuted ?? isQuietStatus(action.message),
        },
      };

    case "busy/set":
      return state.isBusy === action.isBusy
        ? state
        : { ...state, isBusy: action.isBusy };

    case "pen/setColor":
      return state.pen.color === action.color
        ? state
        : { ...state, pen: { ...state.pen, color: action.color } };

    case "pen/cycleWidth":
      return {
        ...state,
        pen: { ...state.pen, width: getNextPenWidth(state.pen.width) },
      };

    case "theme/set":
      return state.theme === action.theme
        ? state
        : { ...state, theme: action.theme };

    case "theme/toggle":
      return {
        ...state,
        theme: state.theme === THEMES.NIGHT ? THEMES.LIGHT : THEMES.NIGHT,
      };

    case "view/setScale":
      return setViewScale(state, action.scale);

    case "view/zoomIn":
      return setViewScale(state, state.viewScale + VIEW_SCALE_STEP);

    case "view/zoomOut":
      return setViewScale(state, state.viewScale - VIEW_SCALE_STEP);

    case "toolbar/set":
      return { ...state, toolbar: { ...action.settings } };

    case "background/setImageVisible":
      return state.isBackgroundImageVisible === action.isVisible
        ? state
        : { ...state, isBackgroundImageVisible: action.isVisible };

    case "settings/setOpen":
      return state.isSettingsOpen === action.isOpen
        ? state
        : { ...state, isSettingsOpen: action.isOpen };

    case "settings/toggle":
      return { ...state, isSettingsOpen: !state.isSettingsOpen };

    case "shortcuts/setOpen":
      return {
        ...state,
        isShortcutDialogOpen: action.isOpen,
        // The dialog always replaces the settings popover.
        isSettingsOpen: action.isOpen ? false : state.isSettingsOpen,
      };

    case "text/setMode":
      return state.isTextMode === action.isActive
        ? state
        : { ...state, isTextMode: action.isActive };

    case "text/setDraft":
      return state.hasTextDraft === action.hasDraft
        ? state
        : { ...state, hasTextDraft: action.hasDraft };

    case "history/sync":
      return { ...state, history: { ...action.history } };
  }
}

/**
 * Clears everything tied to the open document while preserving user
 * preferences, pen settings, and panel visibility.
 */
function closeDocument(state: AppState): AppState {
  return {
    ...state,
    document: { status: "idle" },
    viewScale: DEFAULT_VIEW_SCALE,
    isTextMode: false,
    hasTextDraft: false,
    history: { ...EMPTY_HISTORY },
  };
}

function setViewScale(state: AppState, nextScale: number): AppState {
  const scale = roundViewScale(
    clamp(nextScale, MIN_VIEW_SCALE, MAX_VIEW_SCALE)
  );

  return scale === state.viewScale ? state : { ...state, viewScale: scale };
}

function getNextPenWidth(currentWidth: number): number {
  const currentIndex = PEN_WIDTHS.findIndex(
    (width) => width.value === currentWidth
  );
  const nextIndex = (currentIndex + 1) % PEN_WIDTHS.length;

  return PEN_WIDTHS[nextIndex]?.value ?? currentWidth;
}

function getReadyStatusMessage(document: DocumentState): string {
  if (document.status !== "ready") {
    return IDLE_STATUS_MESSAGE;
  }

  const { annotatablePageCount, totalPageCount } = document;

  if (totalPageCount > annotatablePageCount) {
    return `showing first ${annotatablePageCount} of ${totalPageCount} pages`;
  }

  return `${annotatablePageCount} page${
    annotatablePageCount === 1 ? "" : "s"
  } ready`;
}

function roundViewScale(scale: number): number {
  return Math.round(scale * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function hasDocument(state: AppState): boolean {
  return state.document.status === "ready";
}

export function canExport(state: AppState): boolean {
  return hasDocument(state) && !state.isBusy;
}

export function canUndo(state: AppState): boolean {
  return state.history.canUndo && !state.isBusy;
}

export function canRedo(state: AppState): boolean {
  return state.history.canRedo && !state.isBusy;
}

export function canZoomIn(state: AppState): boolean {
  return (
    hasDocument(state) && !state.isBusy && state.viewScale < MAX_VIEW_SCALE
  );
}

export function canZoomOut(state: AppState): boolean {
  return (
    hasDocument(state) && !state.isBusy && state.viewScale > MIN_VIEW_SCALE
  );
}

export function hasUnsavedWork(state: AppState): boolean {
  return state.history.annotationCount > 0 || state.hasTextDraft;
}

export function getDocumentFileName(state: AppState): string | null {
  return state.document.status === "ready" ? state.document.fileName : null;
}
