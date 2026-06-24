import "./style.css";
import { exportAnnotatedPdf } from "./exporter.js";
import { createAnnotator } from "./annotator.js";
import { renderPdfPage } from "./pdfViewer.js";
import { createStrokeStore } from "./strokeStore.js";

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
      <div id="page-shell" class="page-shell" hidden>
        <canvas id="pdf-canvas"></canvas>
        <canvas id="annotation-canvas" aria-label="Annotation layer"></canvas>
      </div>
    </section>
  </main>
`;

const pdfInput = document.querySelector("#pdf-input");
const undoButton = document.querySelector("#undo-button");
const clearButton = document.querySelector("#clear-button");
const exportButton = document.querySelector("#export-button");
const statusEl = document.querySelector("#status");
const emptyState = document.querySelector("#empty-state");
const pageShell = document.querySelector("#page-shell");
const pdfCanvas = document.querySelector("#pdf-canvas");
const annotationCanvas = document.querySelector("#annotation-canvas");

let originalPdfBytes = null;
let pdfViewport = null;
let renderScale = 1.5;
let loadedFileName = "annotated.pdf";

const strokeStore = createStrokeStore({
  canvas: annotationCanvas,
  onChange: updateControls,
});

createAnnotator({
  canvas: annotationCanvas,
  strokeStore,
  statusEl,
});

pdfInput.addEventListener("change", async () => {
  const file = pdfInput.files?.[0];
  if (!file) return;

  setBusy(true, "Loading PDF");

  try {
    originalPdfBytes = await file.arrayBuffer();
    loadedFileName = file.name;

    const result = await renderPdfPage({
      bytes: originalPdfBytes,
      canvas: pdfCanvas,
      scale: renderScale,
    });

    pdfViewport = result.viewport;
    renderScale = result.scale;

    resizeAnnotationCanvas(result.width, result.height);
    strokeStore.clear();

    emptyState.hidden = true;
    pageShell.hidden = false;
    statusEl.textContent = "Ready";
  } catch (error) {
    console.error(error);
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
  if (!originalPdfBytes || !pdfViewport) return;

  setBusy(true, "Exporting");

  try {
    await exportAnnotatedPdf({
      originalBytes: originalPdfBytes,
      strokes: strokeStore.getStrokes(),
      viewport: pdfViewport,
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

function resizeAnnotationCanvas(width, height) {
  annotationCanvas.width = width;
  annotationCanvas.height = height;
  annotationCanvas.style.width = `${width}px`;
  annotationCanvas.style.height = `${height}px`;

  pageShell.style.width = `${width}px`;
  pageShell.style.height = `${height}px`;
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
