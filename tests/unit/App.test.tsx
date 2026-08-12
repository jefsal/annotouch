import { act, fireEvent, render, screen } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import type {
  DocumentController,
  DocumentControllerOptions,
} from "../../src/app/documentController";
import type { AppAction } from "../../src/app/state";
import { App } from "../../src/components/App";

/** The controller as `App` sees it, with every method inspectable. */
type FakeDocumentController = {
  [Method in keyof DocumentController]: Mock<DocumentController[Method]>;
} & { options: DocumentControllerOptions };

/**
 * The real controller pulls in PDF.js and paints canvases, neither of which
 * jsdom can do. Replacing only `createDocumentController` keeps `isPdfFile`
 * real, since `App` and `DocumentViewport` both route file selection through it.
 */
const { controllers, createDocumentController } = vi.hoisted(() => {
  const controllers: FakeDocumentController[] = [];

  const createDocumentController = vi.fn(
    (options: DocumentControllerOptions): FakeDocumentController => {
      const controller: FakeDocumentController = {
        options,
        open: vi.fn<DocumentController["open"]>(() => Promise.resolve()),
        close: vi.fn<DocumentController["close"]>(),
        exportPdf: vi.fn<DocumentController["exportPdf"]>(() =>
          Promise.resolve()
        ),
        setViewScale: vi.fn<DocumentController["setViewScale"]>(),
        toggleTextMode: vi.fn<DocumentController["toggleTextMode"]>(),
        cancelTextMode: vi.fn<DocumentController["cancelTextMode"]>(
          () => false
        ),
        undo: vi.fn<DocumentController["undo"]>(),
        redo: vi.fn<DocumentController["redo"]>(),
        destroy: vi.fn<DocumentController["destroy"]>(),
      };

      controllers.push(controller);
      return controller;
    }
  );

  return { controllers, createDocumentController };
});

vi.mock("../../src/app/documentController", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/app/documentController")
  >()),
  createDocumentController,
}));

function renderApp(): { root: HTMLDivElement; unmount: () => void } {
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);

  const { unmount } = render(<App root={root} />, { container: root });

  return { root, unmount };
}

function getController(): FakeDocumentController {
  const controller = controllers.at(-1);

  if (!controller) {
    throw new Error("no document controller was created");
  }

  return controller;
}

/** Drives state the controller would normally report back through dispatch. */
function dispatchFromController(...actions: AppAction[]): void {
  act(() => {
    for (const action of actions) {
      getController().options.dispatch(action);
    }
  });
}

function loadDocument(pageCount = 3): void {
  dispatchFromController(
    { type: "document/loading", fileName: "notes.pdf" },
    {
      type: "document/loaded",
      fileName: "notes.pdf",
      totalPageCount: pageCount,
      annotatablePageCount: pageCount,
    },
    { type: "busy/set", isBusy: false }
  );
}

function annotate(annotationCount = 1): void {
  dispatchFromController({
    type: "history/sync",
    history: { canUndo: true, canRedo: false, annotationCount },
  });
}

function getFileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>("#pdf-input");

  if (!input) {
    throw new Error("file input was not rendered");
  }

  return input;
}

function pdfFile(name = "notes.pdf"): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

beforeEach(() => {
  controllers.length = 0;
  createDocumentController.mockClear();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.querySelectorAll("#app").forEach((node) => {
    node.remove();
  });
});

describe("App", () => {
  describe("document controller lifecycle", () => {
    it("creates one controller wired to the workspace and pages container", () => {
      renderApp();

      expect(createDocumentController).toHaveBeenCalledTimes(1);

      const { options } = getController();

      expect(options.workspace).toBe(
        screen.getByRole("region", { name: "pdf annotation workspace" })
      );
      expect(options.pagesContainer).toBe(
        document.querySelector("#pages-container")
      );
    });

    it("hands the controller the current pen settings on demand", async () => {
      const user = userEvent.setup();

      renderApp();

      expect(getController().options.getPenSettings()).toMatchObject({
        color: "#e11d48",
        width: 2,
      });

      await user.click(screen.getByRole("button", { name: "green pen" }));

      expect(getController().options.getPenSettings()).toMatchObject({
        color: "#16a34a",
      });
    });

    it("destroys the controller on unmount", () => {
      const { unmount } = renderApp();
      const controller = getController();

      unmount();

      expect(controller.destroy).toHaveBeenCalledTimes(1);
    });
  });

  describe("theme", () => {
    it("applies the stored theme to the document element", () => {
      window.localStorage.setItem("annotouch-theme", "night");

      renderApp();

      expect(document.documentElement.dataset.theme).toBe("night");
      expect(document.documentElement.style.colorScheme).toBe("dark");
    });

    it("persists the theme when toggled", async () => {
      const user = userEvent.setup();

      renderApp();

      expect(document.documentElement.dataset.theme).toBe("light");

      await user.click(
        screen.getByRole("button", { name: "toggle night mode" })
      );

      expect(document.documentElement.dataset.theme).toBe("night");
      expect(document.documentElement.style.colorScheme).toBe("dark");
      expect(window.localStorage.getItem("annotouch-theme")).toBe("night");
    });
  });

  describe("opening files", () => {
    it("opens a chosen PDF through the controller", async () => {
      const user = userEvent.setup();

      renderApp();

      const file = pdfFile();
      await user.upload(getFileInput(), file);

      expect(getController().open).toHaveBeenCalledWith(file);
    });

    it("rejects a non-PDF without touching the controller", async () => {
      // The input's `accept` filter normally stops this, so it is disabled to
      // reach the guard covering the paths `accept` does not (an OS picker set
      // to "all files").
      const user = userEvent.setup({ applyAccept: false });

      renderApp();

      await user.upload(
        getFileInput(),
        new File(["x"], "notes.txt", { type: "text/plain" })
      );

      expect(getController().open).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent("choose a PDF file");
    });

    it("reports an unusable drop without touching the controller", () => {
      renderApp();

      const workspace = screen.getByRole("region", {
        name: "pdf annotation workspace",
      });
      const event = new Event("drop", { bubbles: true, cancelable: true });

      Object.defineProperty(event, "dataTransfer", {
        value: { files: [new File(["x"], "notes.txt")], dropEffect: "none" },
      });
      fireEvent(workspace, event);

      expect(getController().open).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent("drop a PDF file");
    });

    it("confirms before replacing unsaved annotations", async () => {
      const user = userEvent.setup();
      const confirm = vi.fn(() => false);
      vi.stubGlobal("confirm", confirm);

      renderApp();
      loadDocument();
      annotate();

      await user.upload(getFileInput(), pdfFile("other.pdf"));

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(getController().open).not.toHaveBeenCalled();
    });

    it("replaces the document once the discard is confirmed", async () => {
      const user = userEvent.setup();
      vi.stubGlobal(
        "confirm",
        vi.fn(() => true)
      );

      renderApp();
      loadDocument();
      annotate();

      const replacement = pdfFile("other.pdf");
      await user.upload(getFileInput(), replacement);

      expect(getController().open).toHaveBeenCalledWith(replacement);
    });

    it("does not confirm when there is nothing to discard", async () => {
      const user = userEvent.setup();
      const confirm = vi.fn(() => true);
      vi.stubGlobal("confirm", confirm);

      renderApp();
      loadDocument();

      await user.upload(getFileInput(), pdfFile("other.pdf"));

      expect(confirm).not.toHaveBeenCalled();
      expect(getController().open).toHaveBeenCalled();
    });
  });

  describe("toolbar commands", () => {
    it("routes export, undo, and redo to the controller", async () => {
      const user = userEvent.setup();

      renderApp();
      loadDocument();
      dispatchFromController(
        { type: "toolbar/set", settings: { showHistoryControls: true } },
        {
          type: "history/sync",
          history: { canUndo: true, canRedo: true, annotationCount: 2 },
        }
      );

      const controller = getController();

      await user.click(screen.getByRole("button", { name: "export" }));
      await user.click(screen.getByRole("button", { name: "undo" }));
      await user.click(screen.getByRole("button", { name: "redo" }));

      expect(controller.exportPdf).toHaveBeenCalledTimes(1);
      expect(controller.undo).toHaveBeenCalledTimes(1);
      expect(controller.redo).toHaveBeenCalledTimes(1);
    });

    it("pushes zoom changes to the controller", async () => {
      const user = userEvent.setup();

      renderApp();
      loadDocument();

      const controller = getController();
      controller.setViewScale.mockClear();

      await user.click(screen.getByRole("button", { name: "zoom in" }));

      expect(controller.setViewScale).toHaveBeenLastCalledWith(1.1);

      await user.click(screen.getByRole("button", { name: "zoom out" }));

      expect(controller.setViewScale).toHaveBeenLastCalledWith(1);
    });

    it("persists the undo/redo toolbar preference", async () => {
      const user = userEvent.setup();

      renderApp();

      await user.click(screen.getByRole("button", { name: "settings" }));
      await user.click(screen.getByLabelText("show undo/redo"));

      expect(window.localStorage.getItem("annotouch-toolbar-settings")).toBe(
        JSON.stringify({ showHistoryControls: true })
      );
    });
  });

  describe("mount container state", () => {
    it("mirrors text mode onto the mount container", () => {
      const { root } = renderApp();

      expect(root).not.toHaveClass("is-text-mode");

      dispatchFromController({ type: "text/setMode", isActive: true });
      expect(root).toHaveClass("is-text-mode");

      dispatchFromController({ type: "text/setMode", isActive: false });
      expect(root).not.toHaveClass("is-text-mode");
    });
  });

  describe("unsaved work guard", () => {
    function dispatchBeforeUnload(): Event {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event;
    }

    it("does not block unload with nothing to lose", () => {
      renderApp();
      loadDocument();

      expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
    });

    it("blocks unload while annotations are unsaved", () => {
      renderApp();
      loadDocument();
      annotate();

      expect(dispatchBeforeUnload().defaultPrevented).toBe(true);
    });

    it("blocks unload while a text draft is open", () => {
      renderApp();
      loadDocument();
      dispatchFromController({ type: "text/setDraft", hasDraft: true });

      expect(dispatchBeforeUnload().defaultPrevented).toBe(true);
    });

    it("releases the guard once the work is gone", () => {
      renderApp();
      loadDocument();
      annotate();
      dispatchFromController({
        type: "history/sync",
        history: { canUndo: false, canRedo: true, annotationCount: 0 },
      });

      expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
    });

    it("releases the guard on unmount", () => {
      const { unmount } = renderApp();

      loadDocument();
      annotate();
      unmount();

      expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
    });
  });

  describe("settings panel dismissal", () => {
    it("closes on a pointer press outside the panel", async () => {
      const user = userEvent.setup();

      renderApp();

      await user.click(screen.getByRole("button", { name: "settings" }));
      expect(
        screen.getByRole("dialog", { name: "settings" })
      ).toBeInTheDocument();

      act(() => {
        fireEvent.pointerDown(document.body);
      });

      expect(screen.queryByRole("dialog", { name: "settings" })).toBeNull();
    });

    it("stays open for a pointer press inside the panel", async () => {
      const user = userEvent.setup();

      renderApp();

      await user.click(screen.getByRole("button", { name: "settings" }));

      act(() => {
        fireEvent.pointerDown(screen.getByLabelText("show undo/redo"));
      });

      expect(
        screen.getByRole("dialog", { name: "settings" })
      ).toBeInTheDocument();
    });

    it("stops listening after unmount", () => {
      const { unmount } = renderApp();

      unmount();

      expect(() => {
        fireEvent.pointerDown(document.body);
      }).not.toThrow();
    });
  });

  describe("shortcut dialog", () => {
    it("replaces the settings panel when opened", async () => {
      const user = userEvent.setup();

      renderApp();

      await user.click(screen.getByRole("button", { name: "settings" }));
      await user.click(
        screen.getByRole("button", { name: "view keyboard shortcuts" })
      );

      expect(
        document.querySelector<HTMLDialogElement>("#commands-shortcuts-dialog")
          ?.open
      ).toBe(true);
      expect(screen.queryByRole("dialog", { name: "settings" })).toBeNull();
    });

    it("restores focus to the settings button when closed", async () => {
      const user = userEvent.setup();

      renderApp();

      const settingsButton = screen.getByRole("button", { name: "settings" });

      await user.click(settingsButton);
      await user.click(
        screen.getByRole("button", { name: "view keyboard shortcuts" })
      );
      await user.click(
        screen.getByRole("button", { name: "close keyboard shortcuts" })
      );

      expect(document.activeElement).toBe(settingsButton);
    });
  });

  describe("keyboard shortcuts", () => {
    it("routes text mode and history keys to the controller", async () => {
      const user = userEvent.setup();

      renderApp();
      loadDocument();

      const controller = getController();

      await user.keyboard("t");
      expect(controller.toggleTextMode).toHaveBeenCalledTimes(1);

      await user.keyboard("{Control>}z{/Control}");
      expect(controller.undo).toHaveBeenCalledTimes(1);
    });

    it("selects a pen color by number", async () => {
      const user = userEvent.setup();

      renderApp();
      loadDocument();

      await user.keyboard("2");

      expect(screen.getByRole("button", { name: "red pen" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });

    it("closes the settings panel on Escape and returns focus", async () => {
      const user = userEvent.setup();

      renderApp();

      const settingsButton = screen.getByRole("button", { name: "settings" });

      await user.click(settingsButton);
      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog", { name: "settings" })).toBeNull();
      expect(document.activeElement).toBe(settingsButton);
    });
  });
});
