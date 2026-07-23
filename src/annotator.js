const MIN_POINT_DISTANCE = 0.75;
const ERASER_TOLERANCE = 8;
const TEXT_FONT_SIZE = 24;
const TEXT_LINE_HEIGHT = 28.8;
const TEXT_EDITOR_MIN_WIDTH = 72;
const TEXT_EDITOR_PADDING = 8;

export function createAnnotator({
  getPenSettings,
  annotationStore,
  statusEl,
  onTextDraftChange,
  onTextModeChange,
}) {
  const pages = new Map();
  let isSpaceHeld = false;
  let isEraserHeld = false;
  let isTextModeActive = false;
  let currentStroke = null;
  let lastPointer = null;
  let activeEditor = null;

  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("dblclick", handleDoubleClick);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", cancelStroke);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      cancelStroke();
    }
  });

  function setPages(pageViews) {
    closeEditor({ commit: false });
    pages.clear();

    for (const pageView of pageViews) {
      registerPage(pageView);
    }

    cancelStroke();
    setTextMode(false, { updateStatus: false });
  }

  function registerPage(pageView) {
    pages.set(pageView.pageNumber, pageView);
  }

  function unregisterPage(pageNumber) {
    if (currentStroke?.pageNumber === pageNumber) {
      cancelStroke();
    }

    if (activeEditor?.pageNumber === pageNumber) {
      closeEditor({ commit: false });
    }

    pages.delete(pageNumber);
  }

  function toggleTextMode() {
    if (pages.size === 0 || activeEditor) {
      return false;
    }

    setTextMode(!isTextModeActive);
    return isTextModeActive;
  }

  function cancelTextMode() {
    if (!isTextModeActive || activeEditor) {
      return false;
    }

    setTextMode(false);
    return true;
  }

  function setTextMode(isActive, { updateStatus = true } = {}) {
    isTextModeActive = isActive;
    onTextModeChange?.(isActive);

    if (updateStatus && !activeEditor) {
      statusEl.textContent = isActive ? "click a page to add text" : "ready";
    }
  }

  function handlePointerDown(event) {
    if (
      !isTextModeActive ||
      activeEditor ||
      event.button !== 0 ||
      isEditableTarget(event.target)
    ) {
      return;
    }

    const pointer = getPagePoint(event);
    if (!pointer) return;

    event.preventDefault();
    startTextEditor(pointer);
  }

  function handleDoubleClick(event) {
    if (
      isTextModeActive ||
      activeEditor ||
      event.button !== 0 ||
      isEditableTarget(event.target)
    ) {
      return;
    }

    const pointer = getPagePoint(event);
    if (!pointer) return;

    const annotation = annotationStore.getTextAt(
      pointer.pageNumber,
      pointer.point
    );
    if (!annotation) return;

    event.preventDefault();
    startTextEditor(pointer, annotation);
  }

  function handlePointerMove(event) {
    const pointer = getPagePoint(event);

    if (!pointer) {
      lastPointer = null;

      if (isSpaceHeld && currentStroke) {
        finishStroke();
      }
      return;
    }

    lastPointer = pointer;

    if (activeEditor || isTextModeActive) {
      return;
    }

    if (isEraserHeld) {
      eraseAtPointer(pointer);
      return;
    }

    if (!isSpaceHeld) {
      return;
    }

    if (!currentStroke) {
      startStroke(pointer);
      return;
    }

    if (currentStroke.pageNumber !== pointer.pageNumber) {
      finishStroke();
      startStroke(pointer);
      return;
    }

    addPoint(pointer.point);
  }

  function handleKeyDown(event) {
    if (isEditableTarget(event.target)) {
      return;
    }

    if (event.code === "Space") {
      if (isTextModeActive) {
        setTextMode(false, { updateStatus: false });
      }
      handleSpaceKeyDown(event);
      return;
    }

    if (event.code === "KeyE") {
      if (isTextModeActive) {
        setTextMode(false, { updateStatus: false });
      }
      handleEraserKeyDown(event);
    }
  }

  function handleSpaceKeyDown(event) {
    event.preventDefault();

    if (event.repeat || isEraserHeld) {
      return;
    }

    isSpaceHeld = true;
    statusEl.textContent = "drawing";

    if (lastPointer && !currentStroke) {
      startStroke(lastPointer);
    }
  }

  function handleEraserKeyDown(event) {
    event.preventDefault();

    if (event.repeat) {
      return;
    }

    const hadCurrentStroke = Boolean(currentStroke);

    if (currentStroke) {
      finishStroke();
    }

    isSpaceHeld = false;
    isEraserHeld = true;
    statusEl.textContent = "erasing";

    if (lastPointer && !hadCurrentStroke) {
      eraseAtPointer(lastPointer);
    }
  }

  function handleKeyUp(event) {
    if (event.code === "Space") {
      handleSpaceKeyUp(event);
      return;
    }

    if (event.code === "KeyE") {
      handleEraserKeyUp(event);
    }
  }

  function handleSpaceKeyUp(event) {
    event.preventDefault();
    isSpaceHeld = false;
    finishStroke();

    if (!isEraserHeld) {
      statusEl.textContent = "ready";
    }
  }

  function handleEraserKeyUp(event) {
    if (!isEraserHeld) {
      return;
    }

    event.preventDefault();
    isEraserHeld = false;
    statusEl.textContent = "ready";
  }

  function startStroke(pointer) {
    const penSettings = getPenSettings();

    currentStroke = {
      pageNumber: pointer.pageNumber,
      color: penSettings.color,
      width: penSettings.width,
      points: [pointer.point],
    };
    annotationStore.redrawPage(currentStroke.pageNumber, currentStroke);
  }

  function addPoint(point) {
    const previous = currentStroke.points[currentStroke.points.length - 1];

    if (distance(previous, point) < MIN_POINT_DISTANCE) {
      return;
    }

    currentStroke.points.push(point);
    annotationStore.redrawPage(currentStroke.pageNumber, currentStroke);
  }

  function finishStroke() {
    if (!currentStroke) {
      return;
    }

    if (currentStroke.points.length > 1) {
      annotationStore.addStroke(currentStroke.pageNumber, currentStroke);
    } else {
      annotationStore.redrawPage(currentStroke.pageNumber);
    }

    currentStroke = null;
  }

  function eraseAtPointer(pointer) {
    annotationStore.eraseAnnotationAt(
      pointer.pageNumber,
      pointer.point,
      ERASER_TOLERANCE
    );
  }

  function startTextEditor(pointer, annotation = null) {
    const pageView = pages.get(pointer.pageNumber);
    if (!pageView?.pageShell || !pageView.annotationCanvas) {
      return;
    }

    const editor = document.createElement("textarea");
    const penSettings = getPenSettings();
    const isEditing = Boolean(annotation);

    editor.className = "text-editor";
    editor.setAttribute(
      "aria-label",
      isEditing ? "edit text annotation" : "new text annotation"
    );
    editor.setAttribute("wrap", "off");
    editor.spellcheck = true;
    editor.value = annotation?.text ?? "";
    editor.style.color = annotation?.color ?? penSettings.color;

    activeEditor = {
      element: editor,
      pageNumber: pointer.pageNumber,
      pageView,
      annotation,
      x: annotation?.x ?? pointer.point.x,
      y: annotation?.y ?? pointer.point.y,
      color: annotation?.color ?? penSettings.color,
      fontSize: annotation?.fontSize ?? TEXT_FONT_SIZE,
      lineHeight: annotation?.lineHeight ?? TEXT_LINE_HEIGHT,
      isCommitting: false,
    };

    editor.addEventListener("input", handleEditorInput);
    editor.addEventListener("keydown", handleEditorKeyDown);
    editor.addEventListener("blur", () => closeEditor({ commit: true }));
    pageView.pageShell.append(editor);

    if (annotation) {
      annotationStore.redrawPage(pointer.pageNumber, null, annotation.id);
    }

    resizeTextEditor();
    statusEl.textContent = isEditing ? "editing text" : "adding text";
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
  }

  function handleEditorKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeEditor({ commit: true });
      return;
    }

    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      closeEditor({ commit: true });
    }
  }

  function handleEditorInput() {
    resizeTextEditor();

    if (activeEditor && !activeEditor.annotation) {
      onTextDraftChange?.(activeEditor.element.value.trim().length > 0);
    }
  }

  function resizeTextEditor() {
    if (!activeEditor) return;

    const { element, pageView, fontSize, lineHeight } = activeEditor;
    const canvas = pageView.annotationCanvas;
    const context = canvas.getContext("2d");
    const lines = normalizeText(element.value).split("\n");
    const displayScale = getCanvasDisplayScale(canvas);

    context.save();
    context.font = `${fontSize}px Helvetica, Arial, sans-serif`;
    const measuredWidth = Math.max(
      fontSize * 2,
      ...lines.map((line) => context.measureText(line || " ").width)
    );
    context.restore();

    const measuredHeight = Math.max(lineHeight, lines.length * lineHeight);
    const maxX = Math.max(0, canvas.width - measuredWidth);
    const maxY = Math.max(0, canvas.height - measuredHeight);

    if (!activeEditor.annotation) {
      activeEditor.x = clamp(activeEditor.x, 0, maxX);
      activeEditor.y = clamp(activeEditor.y, 0, maxY);
    } else {
      activeEditor.x = clamp(activeEditor.x, 0, canvas.width);
      activeEditor.y = clamp(activeEditor.y, 0, canvas.height);
    }

    const availableWidth = Math.max(
      fontSize,
      canvas.width - activeEditor.x
    );
    const availableHeight = Math.max(
      lineHeight,
      canvas.height - activeEditor.y
    );
    const editorWidth = Math.min(
      Math.max(measuredWidth + TEXT_EDITOR_PADDING * 2, TEXT_EDITOR_MIN_WIDTH),
      availableWidth
    );
    const editorHeight = Math.min(
      measuredHeight + TEXT_EDITOR_PADDING,
      availableHeight
    );

    activeEditor.width = Math.min(measuredWidth, availableWidth);
    activeEditor.height = Math.min(measuredHeight, availableHeight);

    element.style.left = `${activeEditor.x * displayScale.x}px`;
    element.style.top = `${activeEditor.y * displayScale.y}px`;
    element.style.width = `${editorWidth * displayScale.x}px`;
    element.style.height = `${editorHeight * displayScale.y}px`;
    element.style.fontSize = `${fontSize * displayScale.y}px`;
    element.style.lineHeight = `${lineHeight * displayScale.y}px`;
    element.style.padding = `${(TEXT_EDITOR_PADDING / 2) * displayScale.y}px`;
  }

  function closeEditor({ commit }) {
    if (!activeEditor || activeEditor.isCommitting) {
      return;
    }

    const editorState = activeEditor;
    editorState.isCommitting = true;
    activeEditor = null;
    onTextDraftChange?.(false);
    editorState.element.remove();

    if (commit) {
      const text = normalizeText(editorState.element.value);
      const isBlank = text.trim().length === 0;

      if (editorState.annotation) {
        if (isBlank) {
          annotationStore.removeAnnotation(
            editorState.pageNumber,
            editorState.annotation.id
          );
        } else if (
          text !== editorState.annotation.text ||
          editorState.width !== editorState.annotation.width ||
          editorState.height !== editorState.annotation.height
        ) {
          annotationStore.updateText(
            editorState.pageNumber,
            editorState.annotation.id,
            {
              text,
              width: editorState.width,
              height: editorState.height,
            }
          );
        } else {
          annotationStore.redrawPage(editorState.pageNumber);
        }
      } else if (!isBlank) {
        annotationStore.addText(editorState.pageNumber, {
          text,
          x: editorState.x,
          y: editorState.y,
          width: editorState.width,
          height: editorState.height,
          color: editorState.color,
          fontSize: editorState.fontSize,
          lineHeight: editorState.lineHeight,
        });
      } else {
        annotationStore.redrawPage(editorState.pageNumber);
      }
    } else {
      annotationStore.redrawPage(editorState.pageNumber);
    }

    setTextMode(false);
  }

  function cancelStroke() {
    isSpaceHeld = false;
    isEraserHeld = false;
    currentStroke = null;
    annotationStore.redrawAll();

    if (!activeEditor && !isTextModeActive) {
      statusEl.textContent = "ready";
    }
  }

  function getPagePoint(event) {
    for (const pageView of pages.values()) {
      const point = getCanvasPoint(event, pageView.annotationCanvas);
      if (point) {
        return {
          pageNumber: pageView.pageNumber,
          point,
        };
      }
    }

    return null;
  }

  return {
    cancelTextMode,
    registerPage,
    setPages,
    toggleTextMode,
    unregisterPage,
  };
}

function getCanvasPoint(event, canvas) {
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
    return null;
  }

  return {
    x: x * (canvas.width / rect.width),
    y: y * (canvas.height / rect.height),
  };
}

function getCanvasDisplayScale(canvas) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: rect.width / canvas.width,
    y: rect.height / canvas.height,
  };
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest("input, textarea, select, button, [contenteditable='true']")
  );
}

function normalizeText(text) {
  return text.replace(/\r\n?/g, "\n");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
