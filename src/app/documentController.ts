import {
  DEFAULT_RENDER_SCALE,
  DEFAULT_VIEW_SCALE,
  MAX_ANNOTATABLE_PAGES,
  NIGHT_FILTER,
  PAGE_RENDER_ROOT_MARGIN,
  THEMES,
} from "./config";
import type { AppAction } from "./state";
import { createAnnotationStore } from "../annotationStore";
import { createAnnotator } from "../annotator.js";
import { UnsupportedTextCharacterError } from "../domain/errors";
import type { PenSettings, Theme } from "../domain/types";
import {
  getPdfPageViewport,
  loadPdfDocument,
  renderPdfPage,
} from "../pdfViewer";
import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist";

const DEFAULT_EXPORT_FILE_NAME = "annotated.pdf";

interface PageView {
  pageNumber: number;
  pageShell: HTMLDivElement;
  width: number;
  height: number;
  isRendered: boolean;
  isRendering: boolean;
  pdfCanvas: HTMLCanvasElement | null;
  annotationCanvas: HTMLCanvasElement | null;
}

export interface DocumentControllerOptions {
  workspace: HTMLElement;
  pagesContainer: HTMLElement;
  dispatch: (action: AppAction) => void;
  getPenSettings: () => PenSettings;
  getTheme: () => Theme;
}

export interface DocumentController {
  open(file: File): Promise<void>;
  close(): void;
  exportPdf(): Promise<void>;
  setViewScale(scale: number): void;
  applyTheme(theme: Theme): void;
  toggleTextMode(): void;
  cancelTextMode(): boolean;
  undo(): void;
  redo(): void;
  destroy(): void;
}

export function isPdfFile(file: File | null | undefined): boolean {
  return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name ?? "");
}

/**
 * Owns everything that cannot live in serializable UI state: the original PDF
 * bytes, PDF.js objects, page canvases, and the lazy-render observer. All UI
 * updates leave through `dispatch`.
 */
export function createDocumentController({
  workspace,
  pagesContainer,
  dispatch,
  getPenSettings,
  getTheme,
}: DocumentControllerOptions): DocumentController {
  const pageViewports = new Map<number, PageViewport>();
  const pageViews = new Map<number, PageView>();

  let originalPdfBytes: ArrayBuffer | null = null;
  let pdfDocument: PDFDocumentProxy | null = null;
  let renderScale = DEFAULT_RENDER_SCALE;
  let viewScale = DEFAULT_VIEW_SCALE;
  let loadedFileName = DEFAULT_EXPORT_FILE_NAME;
  let totalPageCount = 0;
  let annotatablePageCount = 0;
  let pageObserver: IntersectionObserver | null = null;
  let documentVersion = 0;

  const annotationStore = createAnnotationStore({ onChange: syncHistory });
  const annotator = createAnnotator({
    getPenSettings,
    annotationStore,
    onStatusChange: setStatus,
    onTextDraftChange: (hasDraft: boolean) => {
      dispatch({ type: "text/setDraft", hasDraft });
    },
    onTextModeChange: (isActive: boolean) => {
      dispatch({ type: "text/setMode", isActive });
    },
  });

  function setStatus(message: string): void {
    dispatch({ type: "status/set", message });
  }

  function syncHistory(): void {
    dispatch({
      type: "history/sync",
      history: {
        canUndo: annotationStore.canUndo(),
        canRedo: annotationStore.canRedo(),
        annotationCount: annotationStore.getAnnotationCount(),
      },
    });
  }

  function close(): void {
    documentVersion += 1;
    pageObserver?.disconnect();
    pageObserver = null;
    pdfDocument?.destroy().catch(() => {});
    pdfDocument = null;
    annotationStore.reset();
    viewScale = DEFAULT_VIEW_SCALE;
    pageViewports.clear();
    pageViews.clear();
    annotator.setPages([]);
    pagesContainer.replaceChildren();
    totalPageCount = 0;
    annotatablePageCount = 0;
  }

  async function open(file: File): Promise<void> {
    close();

    // Every await below can resolve after another document replaced this one,
    // so nothing may be published without re-checking the version token.
    const version = documentVersion;

    dispatch({ type: "document/loading", fileName: file.name });

    try {
      const bytes = await file.arrayBuffer();
      if (version !== documentVersion) return;

      const pdf = await loadPdfDocument({ bytes });
      if (version !== documentVersion) {
        pdf.destroy().catch(() => {});
        return;
      }

      originalPdfBytes = bytes;
      loadedFileName = file.name;
      pdfDocument = pdf;
      totalPageCount = pdf.numPages;
      annotatablePageCount = Math.min(totalPageCount, MAX_ANNOTATABLE_PAGES);
      renderScale = DEFAULT_RENDER_SCALE;
      viewScale = DEFAULT_VIEW_SCALE;

      const didPrepare = await preparePageViews({
        pdf,
        pageCount: annotatablePageCount,
        version,
      });
      if (!didPrepare) return;

      dispatch({
        type: "document/loaded",
        fileName: loadedFileName,
        totalPageCount,
        annotatablePageCount,
      });
      observePageViews(version);
      await renderPageView(pageViews.get(1), version);
    } catch (error) {
      if (version !== documentVersion) return;

      console.error(error);
      close();
      originalPdfBytes = null;
      loadedFileName = DEFAULT_EXPORT_FILE_NAME;
      dispatch({ type: "document/failed", message: "could not load PDF" });
    } finally {
      if (version === documentVersion) {
        dispatch({ type: "busy/set", isBusy: false });
        syncHistory();
      }
    }
  }

  async function exportPdf(): Promise<void> {
    if (!originalPdfBytes) return;

    dispatch({ type: "busy/set", isBusy: true });
    setStatus("exporting");

    try {
      const { exportAnnotatedPdf } = await import("../exporter");
      await exportAnnotatedPdf({
        originalBytes: originalPdfBytes,
        annotationsByPage: annotationStore.getAnnotationsByPage(),
        pageViewports,
        scale: renderScale,
        sourceFileName: loadedFileName,
      });
      setStatus("exported");
    } catch (error) {
      if (error instanceof UnsupportedTextCharacterError) {
        setStatus(error.message);
      } else {
        console.error(error);
        setStatus("export failed");
      }
    } finally {
      dispatch({ type: "busy/set", isBusy: false });
      syncHistory();
    }
  }

  async function preparePageViews({
    pdf,
    pageCount,
    version,
  }: {
    pdf: PDFDocumentProxy;
    pageCount: number;
    version: number;
  }): Promise<boolean> {
    const fragment = document.createDocumentFragment();

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      if (version !== documentVersion) return false;

      setStatus(`preparing page ${pageNumber} of ${pageCount}`);

      const result = await getPdfPageViewport({
        pdf,
        pageNumber,
        scale: renderScale,
      });

      if (version !== documentVersion) return false;

      const pageShell = createPageShell(pageNumber);
      const pageView: PageView = {
        pageNumber,
        pageShell,
        width: result.width,
        height: result.height,
        isRendered: false,
        isRendering: false,
        pdfCanvas: null,
        annotationCanvas: null,
      };

      applyViewScaleToPage(pageView);

      pageViewports.set(pageNumber, result.viewport);
      pageViews.set(pageNumber, pageView);
      fragment.append(pageShell);
    }

    pagesContainer.append(fragment);
    return true;
  }

  function createPageShell(pageNumber: number): HTMLDivElement {
    const pageShell = document.createElement("div");
    const placeholder = document.createElement("div");

    pageShell.className = "page-shell";
    pageShell.dataset.pageNumber = String(pageNumber);
    pageShell.dataset.renderState = "pending";

    placeholder.className = "page-placeholder";
    placeholder.textContent = `page ${pageNumber}`;

    pageShell.append(placeholder);
    applyNightCompensation(pageShell, getTheme());
    return pageShell;
  }

  function observePageViews(version: number): void {
    pageObserver?.disconnect();

    pageObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const pageNumber = Number(
            (entry.target as HTMLElement).dataset.pageNumber
          );
          void renderPageView(pageViews.get(pageNumber), version);
        }
      },
      {
        root: workspace,
        rootMargin: PAGE_RENDER_ROOT_MARGIN,
        threshold: 0,
      }
    );

    for (const pageView of pageViews.values()) {
      pageObserver.observe(pageView.pageShell);
    }
  }

  async function renderPageView(
    pageView: PageView | undefined,
    version: number
  ): Promise<void> {
    if (
      !pageView ||
      !pdfDocument ||
      pageView.isRendered ||
      pageView.isRendering ||
      version !== documentVersion
    ) {
      return;
    }

    const pdf = pdfDocument;
    pageView.isRendering = true;
    pageView.pageShell.dataset.renderState = "rendering";
    pageView.pageShell.classList.add("is-loading");

    const pdfCanvas = document.createElement("canvas");
    const annotationCanvas = document.createElement("canvas");

    pdfCanvas.className = "pdf-canvas";
    annotationCanvas.className = "annotation-canvas";
    annotationCanvas.setAttribute(
      "aria-label",
      `annotation layer page ${pageView.pageNumber}`
    );

    pageView.pageShell.append(pdfCanvas, annotationCanvas);
    resizeCanvas(annotationCanvas, pageView.width, pageView.height);

    try {
      const result = await renderPdfPage({
        pdf,
        pageNumber: pageView.pageNumber,
        canvas: pdfCanvas,
        scale: renderScale,
      });

      if (version !== documentVersion) {
        return;
      }

      resizeCanvas(annotationCanvas, result.width, result.height);

      pageView.pdfCanvas = pdfCanvas;
      pageView.annotationCanvas = annotationCanvas;
      pageView.width = result.width;
      pageView.height = result.height;
      applyViewScaleToPage(pageView);
      pageView.isRendered = true;
      pageView.isRendering = false;
      pageView.pageShell.dataset.renderState = "rendered";
      pageView.pageShell.classList.remove("is-loading");
      pageView.pageShell.querySelector(".page-placeholder")?.remove();
      pageObserver?.unobserve(pageView.pageShell);

      pageViewports.set(pageView.pageNumber, result.viewport);
      annotationStore.registerPage({
        pageNumber: pageView.pageNumber,
        canvas: annotationCanvas,
      });
      annotator.registerPage({
        pageNumber: pageView.pageNumber,
        pageShell: pageView.pageShell,
        annotationCanvas,
      });
    } catch (error) {
      if (version !== documentVersion) {
        return;
      }

      console.error(error);
      pageView.isRendering = false;
      pageView.pageShell.dataset.renderState = "error";
      pageView.pageShell.classList.remove("is-loading");
      setStatus(`could not render page ${pageView.pageNumber}`);
    }
  }

  function resizeCanvas(
    canvas: HTMLCanvasElement,
    width: number,
    height: number
  ): void {
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  }

  function applyViewScaleToPage(pageView: PageView): void {
    pageView.pageShell.style.width = `${Math.max(1, pageView.width * viewScale)}px`;
    pageView.pageShell.style.height = `${Math.max(1, pageView.height * viewScale)}px`;
  }

  return {
    open,
    close,
    exportPdf,

    setViewScale(scale) {
      viewScale = scale;

      for (const pageView of pageViews.values()) {
        applyViewScaleToPage(pageView);
      }
    },

    applyTheme(theme) {
      for (const pageView of pageViews.values()) {
        applyNightCompensation(pageView.pageShell, theme);
      }
    },

    toggleTextMode() {
      annotator.toggleTextMode();
    },

    cancelTextMode() {
      return Boolean(annotator.cancelTextMode());
    },

    undo() {
      annotationStore.undo();
    },

    redo() {
      annotationStore.redo();
    },

    destroy() {
      close();
      originalPdfBytes = null;
      loadedFileName = DEFAULT_EXPORT_FILE_NAME;
    },
  };
}

function applyNightCompensation(element: HTMLElement, theme: Theme): void {
  element.style.filter = theme === THEMES.NIGHT ? NIGHT_FILTER : "";
}
