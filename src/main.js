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
const DEFAULT_VIEW_SCALE = 1;
const MIN_VIEW_SCALE = 0.1;
const MAX_VIEW_SCALE = 2;
const VIEW_SCALE_STEP = 0.1;
const PAGE_RENDER_ROOT_MARGIN = "1200px 0px";
const PEN_COLORS = [
  { label: "black", value: "#111827" },
  { label: "red", value: "#e11d48" },
  { label: "green", value: "#16a34a" },
  { label: "blue", value: "#2563eb" },
  { label: "white", value: "#ffffff" },
];
const PEN_WIDTHS = [
  { label: "small", value: 2 },
  { label: "med", value: 5 },
  { label: "large", value: 10 },
];
const DEFAULT_PEN_SETTINGS = {
  color: "#e11d48",
  width: PEN_WIDTHS[0].value,
};
const THEME_STORAGE_KEY = "annotouch-theme";
const TOOLBAR_SETTINGS_STORAGE_KEY = "annotouch-toolbar-settings";
const DEFAULT_TOOLBAR_SETTINGS = {
  showHistoryControls: false,
};
const THEMES = {
  LIGHT: "light",
  NIGHT: "night",
};
const NIGHT_FILTER = "invert(1) hue-rotate(180deg)";
const NIGHT_BODY_BACKGROUND = "#111827";
const NIGHT_FILTER_SOURCE_BACKGROUND = "#eef1f5";
const DISCARD_ANNOTATIONS_MESSAGE =
  "discard unsaved annotations and open another PDF?";

const app = document.querySelector("#app");
let theme = getInitialTheme();
let toolbarSettings = getInitialToolbarSettings();

applyTheme(theme);
applyToolbarSettings(toolbarSettings);

app.innerHTML = `
  <main class="app-shell">
    <header class="toolbar">
      <div class="brand-block">
        <div
          id="theme-toggle"
          class="brand"
          role="button"
          tabindex="0"
          aria-label="toggle night mode"
          aria-pressed="${theme === THEMES.NIGHT}"
          title="toggle night mode"
        >annotouch</div>
      </div>
      <input id="pdf-input" class="file-input" type="file" accept="application/pdf" />

<!--
      <label class="file-picker" for="pdf-input">

      </label>
-->
      <div class="toolbar-section">
        <div
          id="color-controls"
          class="pen-color-group"
          role="group"
          aria-label="pen color"
        ></div>
      </div>
        <select id="width-select" class="width-select" aria-label="stroke width"></select>

        <div class="history-controls" role="group" aria-label="history">
          <button id="undo-button" class="history-button" type="button" disabled title="undo">undo</button>
          <button id="redo-button" class="history-button" type="button" disabled title="redo">redo</button>
        </div>
      <div class="zoom-controls" role="group" aria-label="zoom">
        <button id="zoom-out-button" class="zoom-button" type="button" disabled title="zoom out" aria-label="zoom out">-</button>
        <button id="zoom-in-button" class="zoom-button" type="button" disabled title="zoom in" aria-label="zoom in">+</button>
      </div>
      <div id="document-summary" class="document-summary" hidden>
        <span id="document-name" class="document-name"></span>
        <span id="document-count" class="document-count"></span>
      </div>
      <div id="status" class="status is-muted" role="status" aria-live="polite">no PDF loaded</div>
 
      <button id="export-button" class="export-button" type="button" disabled title="export PDF">export</button>
    </header>

    <section class="workspace" aria-label="pdf annotation workspace">
      <label id="empty-state" class="empty-state" for="pdf-input">
        <span class="empty-title">drop a PDF </span>
        <span class="empty-copy">or choose a local file</span>
        <span class="empty-action">choose PDF</span>
      </label>
      <div id="pages-container" class="pages-container" hidden></div>
    </section>
    <button
      id="settings-button"
      class="settings-button"
      type="button"
      aria-label="settings"
      aria-controls="settings-panel"
      aria-expanded="false"
      title="settings"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2 2 0 1 1-2.82 2.82l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21a2 2 0 1 1-4 0v-.06a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2 2 0 1 1-2.82-2.82l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.08H3a2 2 0 1 1 0-4h.06A1.8 1.8 0 0 0 4.71 8.8a1.8 1.8 0 0 0-.36-1.98l-.04-.04a2 2 0 1 1 2.82-2.82l.04.04a1.8 1.8 0 0 0 1.98.36h.01a1.8 1.8 0 0 0 1.08-1.65V3a2 2 0 1 1 4 0v.06a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2 2 0 1 1 2.82 2.82l-.04.04a1.8 1.8 0 0 0-.36 1.98v.01a1.8 1.8 0 0 0 1.65 1.08H21a2 2 0 1 1 0 4h-.06A1.8 1.8 0 0 0 19.4 15z"></path>
      </svg>
    </button>
    <div
      id="settings-panel"
      class="settings-panel"
      role="dialog"
      aria-label="settings"
      hidden
    >
      <label class="settings-checkbox">
        <input
          id="show-history-controls"
          type="checkbox"
          ${toolbarSettings.showHistoryControls ? "checked" : ""}
        />
        <span>show undo/redo</span>
      </label>
    </div>
  </main>
`;

const pdfInput = document.querySelector("#pdf-input");
const undoButton = document.querySelector("#undo-button");
const redoButton = document.querySelector("#redo-button");
const zoomOutButton = document.querySelector("#zoom-out-button");
const zoomInButton = document.querySelector("#zoom-in-button");
const exportButton = document.querySelector("#export-button");
const statusEl = document.querySelector("#status");
const emptyState = document.querySelector("#empty-state");
const workspace = document.querySelector(".workspace");
const pagesContainer = document.querySelector("#pages-container");
const colorControls = document.querySelector("#color-controls");
const widthSelect = document.querySelector("#width-select");
const documentSummary = document.querySelector("#document-summary");
const documentNameEl = document.querySelector("#document-name");
const documentCountEl = document.querySelector("#document-count");
const themeToggle = document.querySelector("#theme-toggle");
const settingsButton = document.querySelector("#settings-button");
const settingsPanel = document.querySelector("#settings-panel");
const showHistoryControlsInput = document.querySelector(
  "#show-history-controls"
);

let originalPdfBytes = null;
let pdfDocument = null;
let renderScale = DEFAULT_RENDER_SCALE;
let viewScale = DEFAULT_VIEW_SCALE;
let loadedFileName = "annotated.pdf";
let totalPageCount = 0;
let annotatablePageCount = 0;
let pageObserver = null;
let documentVersion = 0;
let hasBeforeUnloadHandler = false;
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
renderWidthControls();
updateThemeToggle();
updateNightCompensation();

themeToggle.addEventListener("click", () => {
  toggleTheme();
});

themeToggle.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;

  event.preventDefault();
  toggleTheme();
});

settingsButton.addEventListener("click", () => {
  setSettingsPanelOpen(settingsPanel.hidden);
});

showHistoryControlsInput.addEventListener("change", () => {
  toolbarSettings = {
    ...toolbarSettings,
    showHistoryControls: showHistoryControlsInput.checked,
  };
  applyToolbarSettings(toolbarSettings);
  persistToolbarSettings(toolbarSettings);
});

pdfInput.addEventListener("click", () => {
  pdfInput.value = "";
});

pdfInput.addEventListener("change", () => {
  const file = pdfInput.files?.[0];
  if (!file) return;

  requestOpenPdfFile(file);
});

workspace.addEventListener("dragenter", handleFileDrag);
workspace.addEventListener("dragover", handleFileDrag);
workspace.addEventListener("dragleave", (event) => {
  if (!workspace.contains(event.relatedTarget)) {
    workspace.classList.remove("is-dragging");
  }
});
workspace.addEventListener("drop", (event) => {
  event.preventDefault();
  workspace.classList.remove("is-dragging");

  const file = [...event.dataTransfer.files].find((item) =>
    isPdfFile(item)
  );

  if (file) {
    requestOpenPdfFile(file);
  } else {
    setStatus("drop a PDF file");
  }
});

function requestOpenPdfFile(file) {
  if (!isPdfFile(file)) {
    setStatus("choose a PDF file");
    return;
  }

  if (
    hasAnnotationsToDiscard() &&
    !window.confirm(DISCARD_ANNOTATIONS_MESSAGE)
  ) {
    return;
  }

  openPdfFile(file);
}

async function openPdfFile(file) {
  try {
    resetDocumentView();
    setBusy(true, "loading PDF");

    originalPdfBytes = await file.arrayBuffer();
    loadedFileName = file.name;

    pdfDocument = await loadPdfDocument({
      bytes: originalPdfBytes,
    });

    totalPageCount = pdfDocument.numPages;
    annotatablePageCount = Math.min(totalPageCount, MAX_ANNOTATABLE_PAGES);
    renderScale = DEFAULT_RENDER_SCALE;
    viewScale = DEFAULT_VIEW_SCALE;

    const version = documentVersion;
    const didPrepare = await preparePageViews({
      pdf: pdfDocument,
      pageCount: annotatablePageCount,
      version,
    });
    if (!didPrepare) return;

    emptyState.hidden = true;
    pagesContainer.hidden = false;
    updateDocumentSummary();
    app.classList.add("has-document");
    observePageViews(version);
    await renderPageView(pageViews.get(1), version);
    setStatus(getReadyStatus());
  } catch (error) {
    console.error(error);
    resetDocumentView();
    originalPdfBytes = null;
    loadedFileName = "annotated.pdf";
    setStatus("could not load PDF");
  } finally {
    setBusy(false);
    updateControls();
  }
}

undoButton?.addEventListener("click", () => {
  strokeStore.undo();
});

redoButton?.addEventListener("click", () => {
  strokeStore.redo();
});

zoomOutButton.addEventListener("click", () => {
  zoomOut();
  zoomOutButton.blur();
});

zoomInButton.addEventListener("click", () => {
  zoomIn();
  zoomInButton.blur();
});

exportButton.addEventListener("click", async () => {
  if (!originalPdfBytes) return;

  setBusy(true, "exporting");

  try {
    await exportAnnotatedPdf({
      originalBytes: originalPdfBytes,
      strokesByPage: strokeStore.getStrokesByPage(),
      pageViewports,
      scale: renderScale,
      sourceFileName: loadedFileName,
    });
    setStatus("exported");
  } catch (error) {
    console.error(error);
    setStatus("export failed");
  } finally {
    setBusy(false);
    updateControls();
  }
});

document.addEventListener("keydown", (event) => {
  if (!isUndoRedoShortcut(event)) return;

  event.preventDefault();

  if (event.shiftKey) {
    strokeStore.redo();
  } else {
    strokeStore.undo();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || settingsPanel.hidden) return;

  setSettingsPanelOpen(false);
  settingsButton.focus();
});

document.addEventListener("pointerdown", (event) => {
  if (settingsPanel.hidden || !isSettingsOutsideTarget(event.target)) return;

  setSettingsPanelOpen(false);
});

async function preparePageViews({ pdf, pageCount, version }) {
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

    const pageShell = createPageShell({ pageNumber });
    const pageView = {
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

function createPageShell({ pageNumber }) {
  const pageShell = document.createElement("div");
  const placeholder = document.createElement("div");

  pageShell.className = "page-shell";
  pageShell.dataset.pageNumber = String(pageNumber);
  pageShell.dataset.renderState = "pending";

  placeholder.className = "page-placeholder";
  placeholder.textContent = `page ${pageNumber}`;

  pageShell.append(placeholder);
  applyNightCompensation(pageShell);
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
    `annotation layer page ${pageView.pageNumber}`
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
    setStatus(`could not render page ${pageView.pageNumber}`);
  }
}

function resizeCanvas({ canvas, width, height }) {
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}

function applyViewScaleToPage(pageView) {
  pageView.pageShell.style.width = `${Math.max(
    1,
    pageView.width * viewScale
  )}px`;
  pageView.pageShell.style.height = `${Math.max(
    1,
    pageView.height * viewScale
  )}px`;
}

function applyViewScaleToPages() {
  for (const pageView of pageViews.values()) {
    applyViewScaleToPage(pageView);
  }
}

function setViewScale(
  nextScale,
  { min = MIN_VIEW_SCALE, max = MAX_VIEW_SCALE } = {}
) {
  const clampedScale = clamp(nextScale, min, max);

  if (Math.abs(clampedScale - viewScale) < Number.EPSILON) {
    return;
  }

  viewScale = clampedScale;
  applyViewScaleToPages();
  updateControls();
}

function zoomIn() {
  setViewScale(roundViewScale(viewScale + VIEW_SCALE_STEP));
}

function zoomOut() {
  setViewScale(roundViewScale(viewScale - VIEW_SCALE_STEP));
}

function roundViewScale(nextScale) {
  return Math.round(nextScale * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function resetDocumentView() {
  documentVersion += 1;
  pageObserver?.disconnect();
  pageObserver = null;
  const destroyPromise = pdfDocument?.destroy?.();
  destroyPromise?.catch?.(() => {});
  pdfDocument = null;
  strokeStore.reset();
  viewScale = DEFAULT_VIEW_SCALE;
  pageViewports.clear();
  pageViews.clear();
  annotator.setPages([]);
  pagesContainer.replaceChildren();
  pagesContainer.hidden = true;
  emptyState.hidden = false;
  app.classList.remove("has-document");
  documentSummary.hidden = true;
  documentNameEl.textContent = "";
  documentCountEl.textContent = "";
  totalPageCount = 0;
  annotatablePageCount = 0;
}

function getReadyStatus() {
  if (totalPageCount > annotatablePageCount) {
    return `showing first ${annotatablePageCount} of ${totalPageCount} pages`;
  }

  return `${annotatablePageCount} page${
    annotatablePageCount === 1 ? "" : "s"
  } ready`;
}

function setBusy(isBusy, message) {
  app.classList.toggle("is-busy", isBusy);
  pdfInput.disabled = isBusy;
  setControlDisabled(undoButton, isBusy || !strokeStore.canUndo());
  setControlDisabled(redoButton, isBusy || !strokeStore.canRedo());
  updateZoomControls(isBusy);
  exportButton.disabled = isBusy || !originalPdfBytes;

  if (message) {
    setStatus(message);
  }
}

function updateControls() {
  const isBusy = app.classList.contains("is-busy");
  setControlDisabled(undoButton, isBusy || !strokeStore.canUndo());
  setControlDisabled(redoButton, isBusy || !strokeStore.canRedo());
  updateZoomControls(isBusy);
  exportButton.disabled = isBusy || !originalPdfBytes;
  updateDocumentSummary();
  updateBeforeUnloadHandler();
}

function hasAnnotationsToDiscard() {
  return strokeStore.getStrokeCount() > 0;
}

function updateBeforeUnloadHandler() {
  const shouldWarn = hasAnnotationsToDiscard();

  if (shouldWarn === hasBeforeUnloadHandler) {
    return;
  }

  const method = shouldWarn ? "addEventListener" : "removeEventListener";
  window[method]("beforeunload", handleBeforeUnload);
  hasBeforeUnloadHandler = shouldWarn;
}

function handleBeforeUnload(event) {
  event.preventDefault();
  event.returnValue = "";
}

function updateZoomControls(isBusy) {
  const hasDocument = Boolean(originalPdfBytes);

  zoomOutButton.disabled =
    isBusy || !hasDocument || viewScale <= MIN_VIEW_SCALE;
  zoomInButton.disabled = isBusy || !hasDocument || viewScale >= MAX_VIEW_SCALE;
}

function setControlDisabled(control, isDisabled) {
  if (control) {
    control.disabled = isDisabled;
  }
}

function setStatus(message, { muted = false } = {}) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-muted", muted);
}

function setSettingsPanelOpen(isOpen) {
  settingsPanel.hidden = !isOpen;
  settingsButton.setAttribute("aria-expanded", String(isOpen));
}

function isSettingsOutsideTarget(target) {
  if (!(target instanceof Node)) {
    return true;
  }

  return !settingsButton.contains(target) && !settingsPanel.contains(target);
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

function renderWidthControls() {
  for (const width of PEN_WIDTHS) {
    const option = document.createElement("option");

    option.value = String(width.value);
    option.textContent = width.label;
    widthSelect.append(option);
  }

  widthSelect.value = String(penSettings.width);
  widthSelect.addEventListener("change", () => {
    penSettings.width = Number(widthSelect.value);
    widthSelect.blur();
  });
}

function handleFileDrag(event) {
  event.preventDefault();

  if (app.classList.contains("is-busy")) {
    return;
  }

  workspace.classList.add("is-dragging");
  event.dataTransfer.dropEffect = "copy";
}

function isPdfFile(file) {
  return file?.type === "application/pdf" || /\.pdf$/i.test(file?.name ?? "");
}

function updateDocumentSummary() {
  if (!originalPdfBytes) {
    documentSummary.hidden = true;
    return;
  }

  const strokeCount = strokeStore.getStrokeCount();

  documentNameEl.textContent = loadedFileName;
  documentNameEl.title = loadedFileName;
  documentCountEl.textContent = `${annotatablePageCount}/${totalPageCount} pages | ${strokeCount} stroke${
    strokeCount === 1 ? "" : "s"
  }`;
  documentSummary.hidden = false;
}

function isUndoRedoShortcut(event) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    event.key.toLowerCase() === "z" &&
    !isEditableTarget(event.target)
  );
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']")
  );
}

function getInitialTheme() {
  const savedTheme = readStoredTheme();

  if (savedTheme) {
    return savedTheme;
  }

  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return THEMES.NIGHT;
  }

  return THEMES.LIGHT;
}

function readStoredTheme() {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (storedTheme === THEMES.LIGHT || storedTheme === THEMES.NIGHT) {
      return storedTheme;
    }
  } catch {
    return null;
  }

  return null;
}

function persistTheme(nextTheme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // The selected theme still applies for this page load if storage is blocked.
  }
}

function getInitialToolbarSettings() {
  try {
    const storedSettings = window.localStorage.getItem(
      TOOLBAR_SETTINGS_STORAGE_KEY
    );

    if (!storedSettings) {
      return { ...DEFAULT_TOOLBAR_SETTINGS };
    }

    const parsedSettings = JSON.parse(storedSettings);

    if (typeof parsedSettings?.showHistoryControls === "boolean") {
      return {
        showHistoryControls: parsedSettings.showHistoryControls,
      };
    }
  } catch {
    return { ...DEFAULT_TOOLBAR_SETTINGS };
  }

  return { ...DEFAULT_TOOLBAR_SETTINGS };
}

function persistToolbarSettings(nextSettings) {
  try {
    window.localStorage.setItem(
      TOOLBAR_SETTINGS_STORAGE_KEY,
      JSON.stringify(nextSettings)
    );
  } catch {
    // The selected setting still applies for this page load if storage is blocked.
  }
}

function applyToolbarSettings(nextSettings) {
  app.classList.toggle(
    "hide-history-controls",
    !nextSettings.showHistoryControls
  );
}

function applyTheme(nextTheme) {
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme =
    nextTheme === THEMES.NIGHT ? "dark" : "light";
  document.body.style.background =
    nextTheme === THEMES.NIGHT ? NIGHT_BODY_BACKGROUND : "";
  app.style.background =
    nextTheme === THEMES.NIGHT ? NIGHT_FILTER_SOURCE_BACKGROUND : "";
  app.style.filter = nextTheme === THEMES.NIGHT ? NIGHT_FILTER : "";
  updateNightCompensation();
}

function updateThemeToggle() {
  const isNight = theme === THEMES.NIGHT;

  themeToggle.setAttribute("aria-pressed", String(isNight));
  themeToggle.title = isNight ? "switch to light mode" : "toggle night mode";
}

function toggleTheme() {
  theme = theme === THEMES.NIGHT ? THEMES.LIGHT : THEMES.NIGHT;
  applyTheme(theme);
  persistTheme(theme);
  updateThemeToggle();
}

function updateNightCompensation() {
  document
    .querySelectorAll(".page-shell, .color-swatch")
    .forEach(applyNightCompensation);
}

function applyNightCompensation(element) {
  element.style.filter = theme === THEMES.NIGHT ? NIGHT_FILTER : "";
}
