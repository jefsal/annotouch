const MIN_POINT_DISTANCE = 0.75;
const ERASER_TOLERANCE = 8;

export function createAnnotator({ getPenSettings, strokeStore, statusEl }) {
  const pages = new Map();
  let isSpaceHeld = false;
  let isEraserHeld = false;
  let currentStroke = null;
  let lastPointer = null;

  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", cancelStroke);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      cancelStroke();
    }
  });

  function setPages(pageViews) {
    pages.clear();

    for (const pageView of pageViews) {
      registerPage(pageView);
    }

    cancelStroke();
  }

  function registerPage(pageView) {
    pages.set(pageView.pageNumber, pageView);
  }

  function unregisterPage(pageNumber) {
    if (currentStroke?.pageNumber === pageNumber) {
      cancelStroke();
    }

    pages.delete(pageNumber);
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
      handleSpaceKeyDown(event);
      return;
    }

    if (event.code === "KeyE") {
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
    strokeStore.redrawPage(currentStroke.pageNumber, currentStroke);
  }

  function addPoint(point) {
    const previous = currentStroke.points[currentStroke.points.length - 1];

    if (distance(previous, point) < MIN_POINT_DISTANCE) {
      return;
    }

    currentStroke.points.push(point);
    strokeStore.redrawPage(currentStroke.pageNumber, currentStroke);
  }

  function finishStroke() {
    if (!currentStroke) {
      return;
    }

    if (currentStroke.points.length > 1) {
      strokeStore.addStroke(currentStroke.pageNumber, currentStroke);
    } else {
      strokeStore.redrawPage(currentStroke.pageNumber);
    }

    currentStroke = null;
  }

  function eraseAtPointer(pointer) {
    strokeStore.eraseStrokeAt(
      pointer.pageNumber,
      pointer.point,
      ERASER_TOLERANCE
    );
  }

  function cancelStroke() {
    isSpaceHeld = false;
    isEraserHeld = false;
    currentStroke = null;
    strokeStore.redrawAll();
    statusEl.textContent = "ready";
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

  function getCanvasPoint(event, canvas) {
    if (canvas.width === 0 || canvas.height === 0) {
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

  return {
    registerPage,
    setPages,
    unregisterPage,
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

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
