import { useLayoutEffect, useReducer, useRef } from "preact/hooks";
import { DISCARD_ANNOTATIONS_MESSAGE, THEMES } from "../app/config";
import {
  createDocumentController,
  isPdfFile,
  type DocumentController,
} from "../app/documentController";
import {
  DEMO_SAMPLE_FILE_NAME,
  fetchDemoDocument,
  getFitWidthScale,
} from "../app/demo";
import {
  getInitialBackgroundImageVisibility,
  getInitialTheme,
  getInitialToolbarSettings,
  persistBackgroundImageVisibility,
  persistTheme,
  persistToolbarSettings,
} from "../app/preferences";
import {
  appReducer,
  createInitialState,
  hasDocument,
  hasUnsavedWork,
  type AppAction,
  type AppState,
} from "../app/state";
import type { Theme } from "../domain/types";
import { useKeyboardShortcuts } from "../app/useKeyboardShortcuts";
import { AppShell } from "./AppShell";

interface AppProps {
  /** The mount container that owns theme filters and application-wide classes. */
  root: HTMLElement;
  /**
   * The landing-page embed: opens the sample PDF in light mode and neither
   * reads nor writes the visitor's saved preferences.
   */
  demo?: boolean;
}

/**
 * Every side effect here uses `useLayoutEffect` on purpose. Preact defers
 * passive effects to an animation frame, which is too late for work the next
 * user action or a page unload can observe: the unsaved-work `beforeunload`
 * guard, page scaling, and the theme/state classes on the mount container.
 */
export function App({ root, demo = false }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, null, () =>
    demo
      ? createInitialState()
      : createInitialState({
          theme: getInitialTheme(),
          toolbar: getInitialToolbarSettings(),
          isBackgroundImageVisible: getInitialBackgroundImageVisibility(),
        })
  );

  const stateRef = useRef<AppState>(state);
  stateRef.current = state;

  const controllerRef = useRef<DocumentController | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    const pagesContainer = pagesRef.current;
    if (!workspace || !pagesContainer) return;

    const controller = createDocumentController({
      workspace,
      pagesContainer,
      dispatch,
      getPenSettings: () => ({ ...stateRef.current.pen }),
    });

    controllerRef.current = controller;

    let isMounted = true;

    if (demo) {
      void openDemoDocument({
        controller,
        workspace,
        pagesContainer,
        dispatch,
        isMounted: () => isMounted,
        isUntouched: () => stateRef.current.document.status === "idle",
        isSampleOpen: () =>
          isMounted &&
          stateRef.current.document.status === "ready" &&
          stateRef.current.document.fileName === DEMO_SAMPLE_FILE_NAME,
      });
    }

    return () => {
      isMounted = false;
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    applyTheme(state.theme);
  }, [state.theme]);

  useLayoutEffect(() => {
    document.documentElement.dataset.backgroundImage =
      state.isBackgroundImageVisible ? "visible" : "hidden";
  }, [state.isBackgroundImageVisible]);

  useLayoutEffect(() => {
    controllerRef.current?.setViewScale(state.viewScale);
  }, [state.viewScale]);

  useLayoutEffect(() => {
    // The only state the component tree cannot express: the annotation canvases
    // are created by the document controller, so their tool cursors have to be
    // reached through classes on the mount container.
    root.classList.toggle("is-text-mode", state.isTextMode);
    root.classList.toggle("is-highlight-mode", state.isHighlightMode);
  });

  const hasUnsavedAnnotations = hasUnsavedWork(state);

  useLayoutEffect(() => {
    // The embed is a scratch pad: leaving the landing page must not prompt.
    if (!hasUnsavedAnnotations || demo) return;

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [hasUnsavedAnnotations, demo]);

  useLayoutEffect(() => {
    const closeSettingsOnOutsidePointer = (event: PointerEvent): void => {
      if (!stateRef.current.isSettingsOpen) return;

      const target = event.target;
      const isInside =
        target instanceof Node &&
        (settingsButtonRef.current?.contains(target) ||
          settingsPanelRef.current?.contains(target));

      if (!isInside) {
        dispatch({ type: "settings/setOpen", isOpen: false });
      }
    };

    document.addEventListener("pointerdown", closeSettingsOnOutsidePointer);
    return () => {
      document.removeEventListener(
        "pointerdown",
        closeSettingsOnOutsidePointer
      );
    };
  }, []);

  const openShortcuts = (): void => {
    dispatch({ type: "shortcuts/setOpen", isOpen: true });
  };

  const closeShortcuts = (): void => {
    dispatch({ type: "shortcuts/setOpen", isOpen: false });
    settingsButtonRef.current?.focus();
  };

  const toggleTheme = (): void => {
    const nextTheme =
      stateRef.current.theme === THEMES.NIGHT ? THEMES.LIGHT : THEMES.NIGHT;

    dispatch({ type: "theme/set", theme: nextTheme });
    if (!demo) persistTheme(nextTheme);
  };

  const setBackgroundImageVisibility = (isVisible: boolean): void => {
    dispatch({ type: "background/setImageVisible", isVisible });
    if (!demo) persistBackgroundImageVisibility(isVisible);
  };

  const toggleBackgroundImage = (): void => {
    setBackgroundImageVisibility(!stateRef.current.isBackgroundImageVisible);
  };

  const openFile = (file: File | undefined): void => {
    if (!file) return;

    if (!isPdfFile(file)) {
      dispatch({ type: "status/set", message: "choose a PDF file" });
      return;
    }

    if (
      hasUnsavedWork(stateRef.current) &&
      !window.confirm(DISCARD_ANNOTATIONS_MESSAGE)
    ) {
      return;
    }

    void controllerRef.current?.open(file);
  };

  useKeyboardShortcuts({
    isShortcutDialogOpen: state.isShortcutDialogOpen,
    hasDocument: hasDocument(state),
    onUndo: () => controllerRef.current?.undo(),
    onRedo: () => controllerRef.current?.redo(),
    onToggleTextMode: () => controllerRef.current?.toggleTextMode(),
    onToggleHighlightMode: () => controllerRef.current?.toggleHighlightMode(),
    onSelectColor: (color) => dispatch({ type: "pen/setColor", color }),
    onCycleWidth: () => dispatch({ type: "pen/cycleWidth" }),
    onToggleTheme: toggleTheme,
    onToggleBackgroundImage: toggleBackgroundImage,
    onOpenShortcuts: openShortcuts,
    onEscape: () => {
      const didCancelToolMode = Boolean(
        controllerRef.current?.cancelTextMode() ||
        controllerRef.current?.cancelHighlightMode()
      );

      if (stateRef.current.isSettingsOpen) {
        dispatch({ type: "settings/setOpen", isOpen: false });
        settingsButtonRef.current?.focus();
      }

      return didCancelToolMode;
    },
  });

  return (
    <AppShell
      state={state}
      workspaceRef={workspaceRef}
      pagesRef={pagesRef}
      settingsButtonRef={settingsButtonRef}
      settingsPanelRef={settingsPanelRef}
      onOpenFile={openFile}
      onDropFile={(file) => {
        if (!file) {
          dispatch({ type: "status/set", message: "drop a PDF file" });
          return;
        }

        openFile(file);
      }}
      onToggleTheme={toggleTheme}
      onSelectColor={(color) => dispatch({ type: "pen/setColor", color })}
      onCycleWidth={() => dispatch({ type: "pen/cycleWidth" })}
      onUndo={() => controllerRef.current?.undo()}
      onRedo={() => controllerRef.current?.redo()}
      onZoomIn={() => dispatch({ type: "view/zoomIn" })}
      onZoomOut={() => dispatch({ type: "view/zoomOut" })}
      onExport={() => void controllerRef.current?.exportPdf()}
      onToggleSettings={() => dispatch({ type: "settings/toggle" })}
      onShowHistoryControlsChange={(showHistoryControls) => {
        const settings = { showHistoryControls };

        dispatch({ type: "toolbar/set", settings });
        if (!demo) persistToolbarSettings(settings);
      }}
      onBackgroundImageVisibilityChange={setBackgroundImageVisibility}
      onOpenShortcuts={openShortcuts}
      onCloseShortcuts={closeShortcuts}
    />
  );
}

/**
 * The whole theme boundary: one attribute, which the token layer keys off.
 */
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme =
    theme === THEMES.NIGHT ? "dark" : "light";
}

interface DemoDocumentOptions {
  controller: DocumentController;
  workspace: HTMLElement;
  pagesContainer: HTMLElement;
  dispatch: (action: AppAction) => void;
  /** False once the app unmounts. */
  isMounted: () => boolean;
  /** True while nothing but the sample has been opened. */
  isUntouched: () => boolean;
  /** True while the sample is the document on screen. */
  isSampleOpen: () => boolean;
}

/**
 * Loads the sample worksheet, then zooms so its page fits the embed's width.
 * A PDF the visitor opens meanwhile wins: the sample is skipped if it arrives
 * late, and the zoom only applies while the sample is still on screen.
 */
async function openDemoDocument({
  controller,
  workspace,
  pagesContainer,
  dispatch,
  isMounted,
  isUntouched,
  isSampleOpen,
}: DemoDocumentOptions): Promise<void> {
  let file: File;

  try {
    file = await fetchDemoDocument();
  } catch (error) {
    if (!isMounted()) return;
    console.error(error);
    dispatch({ type: "status/set", message: "could not load the sample PDF" });
    return;
  }

  if (!isMounted() || !isUntouched()) return;

  await controller.open(file);

  const pageShell = pagesContainer.querySelector<HTMLElement>(".page-shell");
  if (!pageShell || !isSampleOpen()) return;

  const style = getComputedStyle(workspace);
  const availableWidth =
    workspace.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight);

  dispatch({
    type: "view/setScale",
    scale: getFitWidthScale(availableWidth, pageShell.offsetWidth),
  });
}

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = "";
}
