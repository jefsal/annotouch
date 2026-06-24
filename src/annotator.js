const MIN_POINT_DISTANCE = 0.75;

export function createAnnotator({ strokeStore, statusEl }) {
  const pages = new Map();
  let isSpaceHeld = false;
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
      pages.set(pageView.pageNumber, pageView);
    }

    cancelStroke();
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
    if (event.code !== "Space" || isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();

    if (event.repeat) {
      return;
    }

    isSpaceHeld = true;
    statusEl.textContent = "Drawing";

    if (lastPointer && !currentStroke) {
      startStroke(lastPointer);
    }
  }

  function handleKeyUp(event) {
    if (event.code !== "Space") {
      return;
    }

    event.preventDefault();
    isSpaceHeld = false;
    finishStroke();
    statusEl.textContent = "Ready";
  }

  function startStroke(pointer) {
    currentStroke = {
      pageNumber: pointer.pageNumber,
      color: "#e11d48",
      width: 2.5,
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

  function cancelStroke() {
    isSpaceHeld = false;
    currentStroke = null;
    strokeStore.redrawAll();
    statusEl.textContent = "Ready";
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
    setPages,
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
