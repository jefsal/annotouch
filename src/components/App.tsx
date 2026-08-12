import { useLayoutEffect, useReducer, useRef } from "preact/hooks";
import { DISCARD_ANNOTATIONS_MESSAGE, THEMES } from "../app/config";
import {
  createDocumentController,
  isPdfFile,
  type DocumentController,
} from "../app/documentController";
import {
  getInitialTheme,
  getInitialToolbarSettings,
  persistTheme,
  persistToolbarSettings,
} from "../app/preferences";
import {
  appReducer,
  createInitialState,
  hasDocument,
  hasUnsavedWork,
  type AppState,
} from "../app/state";
import type { Theme } from "../domain/types";
import { useKeyboardShortcuts } from "../app/useKeyboardShortcuts";
import { AppShell } from "./AppShell";

interface AppProps {
  /** The mount container that owns theme filters and application-wide classes. */
  root: HTMLElement;
}

/**
 * Every side effect here uses `useLayoutEffect` on purpose. Preact defers
 * passive effects to an animation frame, which is too late for work the next
 * user action or a page unload can observe: the unsaved-work `beforeunload`
 * guard, page scaling, and the theme/state classes on the mount container.
 */
export function App({ root }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, null, () =>
    createInitialState({
      theme: getInitialTheme(),
      toolbar: getInitialToolbarSettings(),
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

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    applyTheme(state.theme);
  }, [state.theme]);

  useLayoutEffect(() => {
    controllerRef.current?.setViewScale(state.viewScale);
  }, [state.viewScale]);

  useLayoutEffect(() => {
    // The only state the component tree cannot express: the annotation canvases
    // are created by the document controller, so their text-mode cursor has to
    // be reached through a class on the mount container.
    root.classList.toggle("is-text-mode", state.isTextMode);
  });

  const hasUnsavedAnnotations = hasUnsavedWork(state);

  useLayoutEffect(() => {
    if (!hasUnsavedAnnotations) return;

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [hasUnsavedAnnotations]);

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
    persistTheme(nextTheme);
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
    onSelectColor: (color) => dispatch({ type: "pen/setColor", color }),
    onCycleWidth: () => dispatch({ type: "pen/cycleWidth" }),
    onToggleTheme: toggleTheme,
    onOpenShortcuts: openShortcuts,
    onEscape: () => {
      const didCancelTextMode = Boolean(
        controllerRef.current?.cancelTextMode()
      );

      if (stateRef.current.isSettingsOpen) {
        dispatch({ type: "settings/setOpen", isOpen: false });
        settingsButtonRef.current?.focus();
      }

      return didCancelTextMode;
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
        persistToolbarSettings(settings);
      }}
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

function warnBeforeUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = "";
}
