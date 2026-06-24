import "./style.css";
import { exportAnnotatedPdf } from "./exporter.js";
import { createAnnotator } from "./annotator.js";
import { loadPdfDocument, renderPdfPage } from "./pdfViewer.js";
import { createStrokeStore } from "./strokeStore.js";

const MAX_RENDERED_PAGES = 25;
const DEFAULT_RENDER_SCALE = 1.5;

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="app-shell">
    <header class="toolbar">
      <div class="brand">Annotouch</div>
      <label class="file-picker">
        <span>Open PDF</span>
        <input id="pdf-input" type="file" accept="application/pdf" />
      </label>
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
const pagesContainer = document.querySelector("#pages-container");

let originalPdfBytes = null;
let renderScale = DEFAULT_RENDER_SCALE;
let loadedFileName = "annotated.pdf";
let totalPageCount = 0;
let renderedPageCount = 0;
const pageViewports = new Map();
const pageViews = [];

const strokeStore = createStrokeStore({
  onChange: updateControls,
});

const annotator = createAnnotator({
  strokeStore,
  statusEl,
});

pdfInput.addEventListener("change", async () => {
  const file = pdfInput.files?.[0];
  if (!file) return;

  setBusy(true, "Loading PDF");

  try {
    resetDocumentView();
    originalPdfBytes = await file.arrayBuffer();
    loadedFileName = file.name;

    const pdf = await loadPdfDocument({
      bytes: originalPdfBytes,
    });

    totalPageCount = pdf.numPages;
    renderedPageCount = Math.min(totalPageCount, MAX_RENDERED_PAGES);
    renderScale = DEFAULT_RENDER_SCALE;

    for (let pageNumber = 1; pageNumber <= renderedPageCount; pageNumber += 1) {
      statusEl.textContent = `Rendering page ${pageNumber} of ${renderedPageCount}`;
      await renderPageView({ pdf, pageNumber });
    }

    emptyState.hidden = true;
    pagesContainer.hidden = false;
    annotator.setPages(pageViews);
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

async function renderPageView({ pdf, pageNumber }) {
  const pageShell = document.createElement("div");
  const pdfCanvas = document.createElement("canvas");
  const annotationCanvas = document.createElement("canvas");

  pageShell.className = "page-shell";
  pageShell.dataset.pageNumber = String(pageNumber);
  pdfCanvas.className = "pdf-canvas";
  annotationCanvas.className = "annotation-canvas";
  annotationCanvas.setAttribute("aria-label", `Annotation layer page ${pageNumber}`);

  pageShell.append(pdfCanvas, annotationCanvas);
  pagesContainer.append(pageShell);

  const result = await renderPdfPage({
    pdf,
    pageNumber,
    canvas: pdfCanvas,
    scale: renderScale,
  });

  resizeAnnotationCanvas({
    pageShell,
    annotationCanvas,
    width: result.width,
    height: result.height,
  });

  pageViewports.set(pageNumber, result.viewport);
  strokeStore.registerPage({ pageNumber, canvas: annotationCanvas });
  pageViews.push({ pageNumber, annotationCanvas });
}

function resizeAnnotationCanvas({ pageShell, annotationCanvas, width, height }) {
  annotationCanvas.width = width;
  annotationCanvas.height = height;
  annotationCanvas.style.width = `${width}px`;
  annotationCanvas.style.height = `${height}px`;

  pageShell.style.width = `${width}px`;
  pageShell.style.height = `${height}px`;
}

function resetDocumentView() {
  strokeStore.unregisterAllPages();
  pageViewports.clear();
  pageViews.length = 0;
  annotator.setPages([]);
  pagesContainer.replaceChildren();
  pagesContainer.hidden = true;
  emptyState.hidden = false;
  totalPageCount = 0;
  renderedPageCount = 0;
}

function getReadyStatus() {
  if (totalPageCount > renderedPageCount) {
    return `Showing first ${renderedPageCount} of ${totalPageCount} pages`;
  }

  return `${renderedPageCount} page${renderedPageCount === 1 ? "" : "s"} ready`;
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
