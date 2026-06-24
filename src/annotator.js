const MIN_POINT_DISTANCE = 0.75;

export function createAnnotator({ canvas, strokeStore, statusEl }) {
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

  function handlePointerMove(event) {
    const point = getCanvasPoint(event);

    if (!point) {
      lastPointer = null;

      if (isSpaceHeld && currentStroke) {
        finishStroke();
      }
      return;
    }

    lastPointer = point;

    if (!isSpaceHeld) {
      return;
    }

    if (!currentStroke) {
      startStroke(point);
      return;
    }

    addPoint(point);
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

  function startStroke(point) {
    currentStroke = {
      color: "#e11d48",
      width: 2.5,
      points: [point],
    };
    strokeStore.redraw(currentStroke);
  }

  function addPoint(point) {
    const previous = currentStroke.points[currentStroke.points.length - 1];

    if (distance(previous, point) < MIN_POINT_DISTANCE) {
      return;
    }

    currentStroke.points.push(point);
    strokeStore.redraw(currentStroke);
  }

  function finishStroke() {
    if (!currentStroke) {
      return;
    }

    if (currentStroke.points.length > 1) {
      strokeStore.addStroke(currentStroke);
    } else {
      strokeStore.redraw();
    }

    currentStroke = null;
  }

  function cancelStroke() {
    isSpaceHeld = false;
    currentStroke = null;
    strokeStore.redraw();
    statusEl.textContent = "Ready";
  }

  function getCanvasPoint(event) {
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
