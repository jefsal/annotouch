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

      pageState.strokes.push(savedStroke);
      undoStack.push({ pageNumber, stroke: savedStroke });
      redoStack.length = 0;
      this.redrawPage(pageNumber);
      onChange?.();
    },

    undo() {
      const item = undoStack.pop();
      if (!item) return;

      const pageState = pages.get(item.pageNumber);
      if (pageState) {
        pageState.strokes.pop();
        this.redrawPage(item.pageNumber);
      }

      redoStack.push(item);
      onChange?.();
    },

    redo() {
      const item = redoStack.pop();
      if (!item) return;

      const pageState = getOrCreatePageState(pages, item.pageNumber);
      pageState.strokes.push(item.stroke);
      undoStack.push(item);
      this.redrawPage(item.pageNumber);
      onChange?.();
    },

    clear() {
      for (const pageNumber of pages.keys()) {
        const pageState = pages.get(pageNumber);
        pageState.strokes.length = 0;
        this.redrawPage(pageNumber);
      }

      undoStack.length = 0;
      redoStack.length = 0;
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

    hasStrokes() {
      for (const pageState of pages.values()) {
        if (pageState.strokes.length > 0) {
          return true;
        }
      }

      return false;
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
