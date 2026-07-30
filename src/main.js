import "./styles/tailwind.css";
import "./style.css";
import { h, render } from "preact";
import {
  DEFAULT_PEN_SETTINGS,
  DEFAULT_RENDER_SCALE,
  DEFAULT_VIEW_SCALE,
  DISCARD_ANNOTATIONS_MESSAGE,
  MAX_ANNOTATABLE_PAGES,
  MAX_VIEW_SCALE,
  MIN_VIEW_SCALE,
  NIGHT_BODY_BACKGROUND,
  NIGHT_FILTER,
  NIGHT_FILTER_SOURCE_BACKGROUND,
  PAGE_RENDER_ROOT_MARGIN,
  PEN_COLORS,
  PEN_WIDTHS,
  THEMES,
  VIEW_SCALE_STEP,
} from "./app/config";
import {
  getInitialTheme,
  getInitialToolbarSettings,
  persistTheme,
  persistToolbarSettings,
} from "./app/preferences";
import {
  getColorShortcut,
  isKeyboardShortcutsShortcut,
  isNightModeShortcut,
  isTextShortcut,
  isUndoRedoShortcut,
  isWidthShortcut,
} from "./app/shortcuts";
import { AppShell } from "./components/AppShell";
import {
  exportAnnotatedPdf,
  UnsupportedTextCharacterError,
} from "./exporter";
import { createAnnotator } from "./annotator.js";
import {
  getPdfPageViewport,
  loadPdfDocument,
  renderPdfPage,
} from "./pdfViewer";
import { createAnnotationStore } from "./annotationStore";

const app = document.querySelector("#app");
let theme = getInitialTheme();
let toolbarSettings = getInitialToolbarSettings();

applyTheme(theme);
applyToolbarSettings(toolbarSettings);

render(
  h(AppShell, {
    theme,
    showHistoryControls: toolbarSettings.showHistoryControls,
  }),
  app
);

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
const widthButton = document.querySelector("#width-button");
const documentSummary = document.querySelector("#document-summary");
const documentNameEl = document.querySelector("#document-name");
const documentCountEl = document.querySelector("#document-count");
const themeToggle = document.querySelector("#theme-toggle");
const settingsButton = document.querySelector("#settings-button");
const settingsPanel = document.querySelector("#settings-panel");
const showHistoryControlsInput = document.querySelector(
  "#show-history-controls"
);
const commandsShortcutsButton = document.querySelector(
  "#commands-shortcuts-button"
);
const commandsShortcutsDialog = document.querySelector(
  "#commands-shortcuts-dialog"
);
const commandsShortcutsClose = document.querySelector(
  "#commands-shortcuts-close"
);
const commandsShortcutsContent = document.querySelector(
  "#commands-shortcuts-content"
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
let hasTextDraft = false;
const pageViewports = new Map();
const pageViews = new Map();
const penSettings = { ...DEFAULT_PEN_SETTINGS };

const annotationStore = createAnnotationStore({
  onChange: updateControls,
});

const annotator = createAnnotator({
  getPenSettings,
  annotationStore,
  statusEl,
  onTextDraftChange: updateTextDraftState,
  onTextModeChange: updateTextModeControl,
});

renderColorControls();
renderWidthControl();
renderCommandsShortcuts();
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

commandsShortcutsButton.addEventListener("click", () => {
  openKeyboardShortcutsDialog();
});

function openKeyboardShortcutsDialog() {
  setSettingsPanelOpen(false);
  commandsShortcutsDialog.showModal();
}

commandsShortcutsClose.addEventListener("click", () => {
  commandsShortcutsDialog.close();
});

commandsShortcutsDialog.addEventListener("click", (event) => {
  if (event.target === commandsShortcutsDialog) {
    commandsShortcutsDialog.close();
  }
});

commandsShortcutsDialog.addEventListener("close", () => {
  settingsButton.focus();
});

document.addEventListener("keydown", suppressShortcutsWhileDialogOpen, true);
document.addEventListener("keyup", suppressShortcutsWhileDialogOpen, true);

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
  annotationStore.undo();
});

redoButton?.addEventListener("click", () => {
  annotationStore.redo();
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
    setBusy(false);
    updateControls();
  }
});

document.addEventListener("keydown", (event) => {
  if (!isUndoRedoShortcut(event)) return;

  event.preventDefault();

  if (event.shiftKey) {
    annotationStore.redo();
  } else {
    annotationStore.undo();
  }
});

document.addEventListener("keydown", (event) => {
  if (!isTextShortcut(event) || !originalPdfBytes) return;

  event.preventDefault();
  annotator.toggleTextMode();
});

document.addEventListener("keydown", (event) => {
  const color = getColorShortcut(event);
  if (!color) return;

  event.preventDefault();
  penSettings.color = color.value;
  updateSelectedColor();
});

document.addEventListener("keydown", (event) => {
  if (!isWidthShortcut(event)) return;

  event.preventDefault();
  cyclePenWidth();
});

document.addEventListener("keydown", (event) => {
  if (!isNightModeShortcut(event)) return;

  event.preventDefault();
  toggleTheme();
});

document.addEventListener("keydown", (event) => {
  if (!isKeyboardShortcutsShortcut(event)) return;

  event.preventDefault();
  openKeyboardShortcutsDialog();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !annotator.cancelTextMode()) return;

  event.preventDefault();
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
  annotationStore.reset();
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
  setControlDisabled(undoButton, isBusy || !annotationStore.canUndo());
  setControlDisabled(redoButton, isBusy || !annotationStore.canRedo());
  updateZoomControls(isBusy);
  exportButton.disabled = isBusy || !originalPdfBytes;

  if (message) {
    setStatus(message);
  }
}

function updateControls() {
  const isBusy = app.classList.contains("is-busy");
  setControlDisabled(undoButton, isBusy || !annotationStore.canUndo());
  setControlDisabled(redoButton, isBusy || !annotationStore.canRedo());
  updateZoomControls(isBusy);
  exportButton.disabled = isBusy || !originalPdfBytes;
  updateDocumentSummary();
  updateBeforeUnloadHandler();
}

function updateTextModeControl(isActive) {
  app.classList.toggle("is-text-mode", isActive);
}

function updateTextDraftState(hasDraft) {
  hasTextDraft = hasDraft;
  updateBeforeUnloadHandler();
}

function hasAnnotationsToDiscard() {
  return annotationStore.getAnnotationCount() > 0 || hasTextDraft;
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

function suppressShortcutsWhileDialogOpen(event) {
  if (!commandsShortcutsDialog.open || event.key === "Escape") return;

  event.preventDefault();
  event.stopImmediatePropagation();
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
  PEN_COLORS.forEach((color, index) => {
    const button = document.createElement("button");
    const isSelected = color.value === penSettings.color;
    const shortcut = index + 1;

    button.type = "button";
    button.className = "color-swatch";
    button.dataset.colorValue = color.value;
    button.title = `${color.label} (${shortcut})`;
    button.setAttribute("aria-label", `${color.label} pen`);
    button.setAttribute("aria-keyshortcuts", String(shortcut));
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
  });
}

function renderCommandsShortcuts() {
  const groups = [
    {
      label: "general",
      commands: [{ label: "view keyboard shortcuts", keys: ["⌘", "k"] }],
    },
    {
      label: "tools",
      commands: [
        { label: "draw", keys: ["space"] },
        { label: "erase", keys: ["e"] },
        { label: "text", keys: ["t"] },
        { label: "stroke width", keys: ["w"] },
      ],
    },
    {
      label: "colors",
      commands: PEN_COLORS.map((color, index) => ({
        label: color.label,
        keys: [String(index + 1)],
      })),
    },
    {
      label: "appearance",
      commands: [{ label: "toggle night mode", keys: ["n"] }],
    },
    {
      label: "history",
      commands: [
        { label: "undo", keys: ["⌘", "z"], alternateKeys: ["ctrl", "z"] },
        {
          label: "redo",
          keys: ["⌘", "shift", "z"],
          alternateKeys: ["ctrl", "shift", "z"],
        },
      ],
    },
  ];

  const fragment = document.createDocumentFragment();

  for (const group of groups) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    const list = document.createElement("dl");

    section.className = "commands-shortcuts-group";
    heading.textContent = group.label;
    list.className = "commands-shortcuts-list";

    for (const command of group.commands) {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const details = document.createElement("dd");

      row.className = "commands-shortcuts-row";
      term.textContent = command.label;
      appendShortcutKeys(details, command.keys);

      if (command.alternateKeys) {
        const separator = document.createElement("span");
        separator.className = "shortcut-separator";
        separator.textContent = "/";
        separator.setAttribute("aria-hidden", "true");
        details.append(separator);
        appendShortcutKeys(details, command.alternateKeys);
      }

      row.append(term, details);
      list.append(row);
    }

    section.append(heading, list);
    fragment.append(section);
  }

  commandsShortcutsContent.append(fragment);
}

function appendShortcutKeys(container, keys) {
  keys.forEach((key, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "key-separator";
      separator.textContent = "+";
      separator.setAttribute("aria-hidden", "true");
      container.append(separator);
    }

    const keyElement = document.createElement("kbd");
    keyElement.textContent = key;
    container.append(keyElement);
  });
}

function updateSelectedColor() {
  for (const button of colorControls.querySelectorAll(".color-swatch")) {
    const isSelected = button.dataset.colorValue === penSettings.color;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  }
}

function renderWidthControl() {
  updateWidthButton();
  widthButton.setAttribute("aria-keyshortcuts", "W");
  widthButton.addEventListener("click", cyclePenWidth);
}

function cyclePenWidth() {
  const currentIndex = PEN_WIDTHS.findIndex(
    (width) => width.value === penSettings.width
  );
  const nextIndex = (currentIndex + 1) % PEN_WIDTHS.length;

  penSettings.width = PEN_WIDTHS[nextIndex].value;
  updateWidthButton();
  widthButton.blur();
}

function updateWidthButton() {
  const currentWidth =
    PEN_WIDTHS.find((width) => width.value === penSettings.width) ??
    PEN_WIDTHS[0];
  const currentIndex = PEN_WIDTHS.indexOf(currentWidth);
  const nextWidth = PEN_WIDTHS[(currentIndex + 1) % PEN_WIDTHS.length];

  widthButton.textContent = currentWidth.label;
  widthButton.dataset.widthValue = String(currentWidth.value);
  widthButton.setAttribute("aria-label", `stroke width: ${currentWidth.label}`);
  widthButton.title = `stroke width: ${currentWidth.label}; click or press W for ${nextWidth.label}`;
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

  const annotationCount = annotationStore.getAnnotationCount();

  documentNameEl.textContent = loadedFileName;
  documentNameEl.title = loadedFileName;
  documentCountEl.textContent = `${annotatablePageCount}/${totalPageCount} pages | ${annotationCount} annotation${
    annotationCount === 1 ? "" : "s"
  }`;
  documentSummary.hidden = false;
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
  themeToggle.title = isNight
    ? "switch to light mode (N)"
    : "toggle night mode (N)";
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
