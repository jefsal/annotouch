export function createStrokeStore({ onChange }) {
  const pages = new Map();
  const undoStack = [];
  const redoStack = [];

  return {
    registerPage({ pageNumber, canvas }) {
      const pageState = getOrCreatePageState(pages, pageNumber);

      pageState.canvas = canvas;
      pageState.context = canvas.getContext("2d");
      this.redrawPage(pageNumber);
      onChange?.();
    },

    unregisterPage(pageNumber) {
      const pageState = pages.get(pageNumber);
      if (!pageState) return;

      pageState.canvas = null;
      pageState.context = null;
      onChange?.();
    },

    unregisterAllPages() {
      pages.clear();
      undoStack.length = 0;
      redoStack.length = 0;
      onChange?.();
    },

    reset() {
      pages.clear();
      undoStack.length = 0;
      redoStack.length = 0;
      onChange?.();
    },

    addStroke(pageNumber, stroke) {
      const pageState = getOrCreatePageState(pages, pageNumber);
      const savedStroke = cloneStroke(stroke);
      const index = pageState.strokes.length;

      pageState.strokes.push(savedStroke);
      undoStack.push({
        type: "add",
        pageNumber,
        stroke: savedStroke,
        index,
      });
      redoStack.length = 0;
      this.redrawPage(pageNumber);
      onChange?.();
    },

    eraseStrokeAt(pageNumber, point, tolerance = 8) {
      const pageState = pages.get(pageNumber);
      if (!pageState?.strokes.length) return false;

      for (let index = pageState.strokes.length - 1; index >= 0; index -= 1) {
        const stroke = pageState.strokes[index];
        const hitRadius = stroke.width / 2 + tolerance;

        if (!isPointNearStroke(point, stroke, hitRadius)) {
          continue;
        }

        pageState.strokes.splice(index, 1);
        undoStack.push({
          type: "erase",
          pageNumber,
          stroke,
          index,
        });
        redoStack.length = 0;
        this.redrawPage(pageNumber);
        onChange?.();
        return true;
      }

      return false;
    },

    undo() {
      const action = undoStack.pop();
      if (!action) return;

      if (undoAction(pages, action)) {
        this.redrawPage(action.pageNumber);
      }

      redoStack.push(action);
      onChange?.();
    },

    redo() {
      const action = redoStack.pop();
      if (!action) return;

      if (redoAction(pages, action)) {
        this.redrawPage(action.pageNumber);
      }

      undoStack.push(action);
      onChange?.();
    },

    redrawPage(pageNumber, draftStroke = null) {
      const pageState = pages.get(pageNumber);
      if (!pageState?.canvas || !pageState.context) return;

      const { canvas, context, strokes } = pageState;
      context.clearRect(0, 0, canvas.width, canvas.height);

      for (const stroke of strokes) {
        drawStroke(context, stroke);
      }

      if (draftStroke) {
        drawStroke(context, draftStroke);
      }
    },

    redrawAll() {
      for (const pageNumber of pages.keys()) {
        this.redrawPage(pageNumber);
      }
    },

    getStrokesByPage() {
      const strokesByPage = new Map();

      for (const [pageNumber, pageState] of pages) {
        if (pageState.strokes.length > 0) {
          strokesByPage.set(pageNumber, pageState.strokes.map(cloneStroke));
        }
      }

      return strokesByPage;
    },

    canUndo() {
      return undoStack.length > 0;
    },

    canRedo() {
      return redoStack.length > 0;
    },

    getStrokeCount() {
      let count = 0;

      for (const pageState of pages.values()) {
        count += pageState.strokes.length;
      }

      return count;
    },
  };
}

function getOrCreatePageState(pages, pageNumber) {
  if (!pages.has(pageNumber)) {
    pages.set(pageNumber, {
      canvas: null,
      context: null,
      strokes: [],
    });
  }

  return pages.get(pageNumber);
}

function undoAction(pages, action) {
  if (action.type === "add") {
    return removeStroke(pages, action.pageNumber, action.stroke);
  }

  if (action.type === "erase") {
    return insertStroke(pages, action.pageNumber, action.stroke, action.index);
  }

  return false;
}

function redoAction(pages, action) {
  if (action.type === "add") {
    return insertStroke(pages, action.pageNumber, action.stroke, action.index);
  }

  if (action.type === "erase") {
    return removeStroke(pages, action.pageNumber, action.stroke);
  }

  return false;
}

function insertStroke(pages, pageNumber, stroke, index) {
  const pageState = getOrCreatePageState(pages, pageNumber);
  const insertionIndex = Math.min(Math.max(index, 0), pageState.strokes.length);

  pageState.strokes.splice(insertionIndex, 0, stroke);
  return true;
}

function removeStroke(pages, pageNumber, stroke) {
  const pageState = pages.get(pageNumber);
  if (!pageState) return false;

  const index = pageState.strokes.indexOf(stroke);
  if (index === -1) return false;

  pageState.strokes.splice(index, 1);
  return true;
}

function drawStroke(context, stroke) {
  if (stroke.points.length < 2) return;

  context.save();
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";

  context.beginPath();
  context.moveTo(stroke.points[0].x, stroke.points[0].y);

  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x, point.y);
  }

  context.stroke();
  context.restore();
}

function cloneStroke(stroke) {
  return {
    color: stroke.color,
    width: stroke.width,
    points: stroke.points.map((point) => ({ ...point })),
  };
}

function isPointNearStroke(point, stroke, hitRadius) {
  if (stroke.points.length === 0) {
    return false;
  }

  if (stroke.points.length === 1) {
    return distance(point, stroke.points[0]) <= hitRadius;
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    const start = stroke.points[index - 1];
    const end = stroke.points[index];

    if (pointToSegmentDistance(point, start, end) <= hitRadius) {
      return true;
    }
  }

  return false;
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return distance(point, start);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
    )
  );
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };

  return distance(point, projection);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
