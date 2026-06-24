import "./style.css";
import { exportAnnotatedPdf } from "./exporter.js";
import { createAnnotator } from "./annotator.js";
import {
  getPdfPageViewport,
  loadPdfDocument,
  renderPdfPage,
} from "./pdfViewer.js";
import { createStrokeStore } from "./strokeStore.js";

const MAX_ANNOTATABLE_PAGES = 200;
const DEFAULT_RENDER_SCALE = 1.5;
const PAGE_RENDER_ROOT_MARGIN = "1200px 0px";
const PEN_COLORS = [
  { label: "Black", value: "#111827" },
  { label: "Red", value: "#e11d48" },
  { label: "Green", value: "#16a34a" },
  { label: "Blue", value: "#2563eb" },
  { label: "White", value: "#ffffff" },
];
const DEFAULT_PEN_SETTINGS = {
  color: "#e11d48",
  width: 2.5,
};

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="app-shell">
    <header class="toolbar">
      <div class="brand">Annotouch</div>
      <label class="file-picker">
        <span>Open PDF</span>
        <input id="pdf-input" type="file" accept="application/pdf" />
      </label>
      <div
        id="color-controls"
        class="pen-color-group"
        role="group"
        aria-label="Pen color"
      ></div>
      <button id="undo-button" type="button" disabled title="Undo">Undo</button>
      <button id="clear-button" type="button" disabled title="Clear">Clear</button>
      <button id="export-button" type="button" disabled title="Export PDF">Export</button>
      <div id="status" class="status" role="status">No PDF loaded</div>
    </header>

    <section class="workspace" aria-label="PDF annotation workspace">
      <div id="empty-state" class="empty-state">Select a PDF</div>
      <div id="pages-container" class="pages-container" hidden></div>
    </section>
  </main>
`;

const pdfInput = document.querySelector("#pdf-input");
const undoButton = document.querySelector("#undo-button");
const clearButton = document.querySelector("#clear-button");
const exportButton = document.querySelector("#export-button");
const statusEl = document.querySelector("#status");
const emptyState = document.querySelector("#empty-state");
const workspace = document.querySelector(".workspace");
const pagesContainer = document.querySelector("#pages-container");
const colorControls = document.querySelector("#color-controls");

let originalPdfBytes = null;
let pdfDocument = null;
let renderScale = DEFAULT_RENDER_SCALE;
let loadedFileName = "annotated.pdf";
let totalPageCount = 0;
let annotatablePageCount = 0;
let pageObserver = null;
let documentVersion = 0;
const pageViewports = new Map();
const pageViews = new Map();
const penSettings = { ...DEFAULT_PEN_SETTINGS };

const strokeStore = createStrokeStore({
  onChange: updateControls,
});

const annotator = createAnnotator({
  getPenSettings,
  strokeStore,
  statusEl,
});

renderColorControls();

pdfInput.addEventListener("change", async () => {
  const file = pdfInput.files?.[0];
  if (!file) return;

  try {
    resetDocumentView();
    setBusy(true, "Loading PDF");

    originalPdfBytes = await file.arrayBuffer();
    loadedFileName = file.name;

    pdfDocument = await loadPdfDocument({
      bytes: originalPdfBytes,
    });

    totalPageCount = pdfDocument.numPages;
    annotatablePageCount = Math.min(totalPageCount, MAX_ANNOTATABLE_PAGES);
    renderScale = DEFAULT_RENDER_SCALE;

    const version = documentVersion;
    const didPrepare = await preparePageViews({
      pdf: pdfDocument,
      pageCount: annotatablePageCount,
      version,
    });
    if (!didPrepare) return;

    emptyState.hidden = true;
    pagesContainer.hidden = false;
    observePageViews(version);
    await renderPageView(pageViews.get(1), version);
    statusEl.textContent = getReadyStatus();
  } catch (error) {
    console.error(error);
    resetDocumentView();
    originalPdfBytes = null;
    loadedFileName = "annotated.pdf";
    statusEl.textContent = "Could not load PDF";
  } finally {
    setBusy(false);
    updateControls();
  }
});

undoButton.addEventListener("click", () => {
  strokeStore.undo();
});

clearButton.addEventListener("click", () => {
  strokeStore.clear();
});

exportButton.addEventListener("click", async () => {
  if (!originalPdfBytes) return;

  setBusy(true, "Exporting");

  try {
    await exportAnnotatedPdf({
      originalBytes: originalPdfBytes,
      strokesByPage: strokeStore.getStrokesByPage(),
      pageViewports,
      scale: renderScale,
      sourceFileName: loadedFileName,
    });
    statusEl.textContent = "Exported";
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Export failed";
  } finally {
    setBusy(false);
    updateControls();
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    strokeStore.undo();
  }
});

async function preparePageViews({ pdf, pageCount, version }) {
  const fragment = document.createDocumentFragment();

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    if (version !== documentVersion) return false;

    statusEl.textContent = `Preparing page ${pageNumber} of ${pageCount}`;

    const result = await getPdfPageViewport({
      pdf,
      pageNumber,
      scale: renderScale,
    });

    if (version !== documentVersion) return false;

    const pageShell = createPageShell({
      pageNumber,
      width: result.width,
      height: result.height,
    });

    pageViewports.set(pageNumber, result.viewport);
    pageViews.set(pageNumber, {
      pageNumber,
      pageShell,
      width: result.width,
      height: result.height,
      isRendered: false,
      isRendering: false,
      pdfCanvas: null,
      annotationCanvas: null,
    });
    fragment.append(pageShell);
  }

  pagesContainer.append(fragment);
  return true;
}

function createPageShell({ pageNumber, width, height }) {
  const pageShell = document.createElement("div");
  const placeholder = document.createElement("div");

  pageShell.className = "page-shell";
  pageShell.style.width = `${width}px`;
  pageShell.style.height = `${height}px`;
  pageShell.dataset.pageNumber = String(pageNumber);
  pageShell.dataset.renderState = "pending";

  placeholder.className = "page-placeholder";
  placeholder.textContent = `Page ${pageNumber}`;

  pageShell.append(placeholder);
  return pageShell;
}

function observePageViews(version) {
  pageObserver?.disconnect();

  pageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const pageNumber = Number(entry.target.dataset.pageNumber);
        const pageView = pageViews.get(pageNumber);
        renderPageView(pageView, version);
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

async function renderPageView(pageView, version) {
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
    `Annotation layer page ${pageView.pageNumber}`
  );

  pageView.pageShell.append(pdfCanvas, annotationCanvas);
  resizeCanvas({
    canvas: annotationCanvas,
    width: pageView.width,
    height: pageView.height,
  });

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

    resizeCanvas({
      canvas: annotationCanvas,
      width: result.width,
      height: result.height,
    });
    pageView.pageShell.style.width = `${result.width}px`;
    pageView.pageShell.style.height = `${result.height}px`;

    pageView.pdfCanvas = pdfCanvas;
    pageView.annotationCanvas = annotationCanvas;
    pageView.width = result.width;
    pageView.height = result.height;
    pageView.isRendered = true;
    pageView.isRendering = false;
    pageView.pageShell.dataset.renderState = "rendered";
    pageView.pageShell.classList.remove("is-loading");
    pageView.pageShell.querySelector(".page-placeholder")?.remove();
    pageObserver?.unobserve(pageView.pageShell);

    pageViewports.set(pageView.pageNumber, result.viewport);
    strokeStore.registerPage({
      pageNumber: pageView.pageNumber,
      canvas: annotationCanvas,
    });
    annotator.registerPage({
      pageNumber: pageView.pageNumber,
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
    statusEl.textContent = `Could not render page ${pageView.pageNumber}`;
  }
}

function resizeCanvas({ canvas, width, height }) {
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function resetDocumentView() {
  documentVersion += 1;
  pageObserver?.disconnect();
  pageObserver = null;
  const destroyPromise = pdfDocument?.destroy?.();
  destroyPromise?.catch?.(() => {});
  pdfDocument = null;
  strokeStore.reset();
  pageViewports.clear();
  pageViews.clear();
  annotator.setPages([]);
  pagesContainer.replaceChildren();
  pagesContainer.hidden = true;
  emptyState.hidden = false;
  totalPageCount = 0;
  annotatablePageCount = 0;
}

function getReadyStatus() {
  if (totalPageCount > annotatablePageCount) {
    return `Showing first ${annotatablePageCount} of ${totalPageCount} pages`;
  }

  return `${annotatablePageCount} page${
    annotatablePageCount === 1 ? "" : "s"
  } ready`;
}

function setBusy(isBusy, message) {
  app.classList.toggle("is-busy", isBusy);
  pdfInput.disabled = isBusy;
  undoButton.disabled = isBusy || !strokeStore.canUndo();
  clearButton.disabled = isBusy || !strokeStore.hasStrokes();
  exportButton.disabled = isBusy || !originalPdfBytes;

  if (message) {
    statusEl.textContent = message;
  }
}

function updateControls() {
  const isBusy = app.classList.contains("is-busy");
  undoButton.disabled = isBusy || !strokeStore.canUndo();
  clearButton.disabled = isBusy || !strokeStore.hasStrokes();
  exportButton.disabled = isBusy || !originalPdfBytes;
}

function getPenSettings() {
  return { ...penSettings };
}

function renderColorControls() {
  for (const color of PEN_COLORS) {
    const button = document.createElement("button");
    const isSelected = color.value === penSettings.color;

    button.type = "button";
    button.className = "color-swatch";
    button.dataset.colorValue = color.value;
    button.title = color.label;
    button.setAttribute("aria-label", `${color.label} pen`);
    button.setAttribute("aria-pressed", String(isSelected));
    button.style.setProperty("--swatch-color", color.value);

    if (color.value === "#ffffff") {
      button.classList.add("color-swatch-white");
    }

    if (isSelected) {
      button.classList.add("is-selected");
    }

    button.addEventListener("click", () => {
      penSettings.color = color.value;
      updateSelectedColor();
      button.blur();
    });

    colorControls.append(button);
  }
}

function updateSelectedColor() {
  for (const button of colorControls.querySelectorAll(".color-swatch")) {
    const isSelected = button.dataset.colorValue === penSettings.color;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  }
}
