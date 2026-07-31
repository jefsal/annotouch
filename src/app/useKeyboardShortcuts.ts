import { useLayoutEffect, useRef } from "preact/hooks";
import {
  getColorShortcut,
  isKeyboardShortcutsShortcut,
  isNightModeShortcut,
  isTextShortcut,
  isUndoRedoShortcut,
  isWidthShortcut,
} from "./shortcuts";

export interface KeyboardShortcutHandlers {
  isShortcutDialogOpen: boolean;
  hasDocument: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleTextMode: () => void;
  onSelectColor: (color: string) => void;
  onCycleWidth: () => void;
  onToggleTheme: () => void;
  onOpenShortcuts: () => void;
  /** Returns true when Escape was consumed by the application. */
  onEscape: () => boolean;
}

/**
 * Owns every document-level application shortcut. Listeners are attached once
 * and read the latest handlers through a ref so they never go stale.
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useLayoutEffect(() => {
    const suppressWhileDialogOpen = (event: KeyboardEvent): void => {
      if (!handlersRef.current.isShortcutDialogOpen || event.key === "Escape") {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      const current = handlersRef.current;

      if (isUndoRedoShortcut(event)) {
        event.preventDefault();

        if (event.shiftKey) {
          current.onRedo();
        } else {
          current.onUndo();
        }
        return;
      }

      if (isTextShortcut(event) && current.hasDocument) {
        event.preventDefault();
        current.onToggleTextMode();
        return;
      }

      const color = getColorShortcut(event);
      if (color) {
        event.preventDefault();
        current.onSelectColor(color.value);
        return;
      }

      if (isWidthShortcut(event)) {
        event.preventDefault();
        current.onCycleWidth();
        return;
      }

      if (isNightModeShortcut(event)) {
        event.preventDefault();
        current.onToggleTheme();
        return;
      }

      if (isKeyboardShortcutsShortcut(event)) {
        event.preventDefault();
        current.onOpenShortcuts();
        return;
      }

      if (event.key === "Escape" && current.onEscape()) {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", suppressWhileDialogOpen, true);
    document.addEventListener("keyup", suppressWhileDialogOpen, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", suppressWhileDialogOpen, true);
      document.removeEventListener("keyup", suppressWhileDialogOpen, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
