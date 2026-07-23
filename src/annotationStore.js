export function createAnnotationStore({ onChange }) {
  const pages = new Map();
  const undoStack = [];
  const redoStack = [];
  let nextAnnotationId = 1;

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
      nextAnnotationId = 1;
      onChange?.();
    },

    addStroke(pageNumber, stroke) {
      const pageState = getOrCreatePageState(pages, pageNumber);
      const annotation = {
        ...cloneStroke(stroke),
        id: stroke.id ?? `annotation-${nextAnnotationId++}`,
        type: "stroke",
      };
      const index = pageState.annotations.length;

      pageState.annotations.push(annotation);
      undoStack.push({
        type: "add",
        pageNumber,
        annotation,
        index,
      });
      redoStack.length = 0;
      this.redrawPage(pageNumber);
      onChange?.();
      return cloneAnnotation(annotation);
    },

    addText(pageNumber, textAnnotation) {
      const pageState = getOrCreatePageState(pages, pageNumber);
      const annotation = {
        ...cloneText(textAnnotation),
        id: textAnnotation.id ?? `annotation-${nextAnnotationId++}`,
        type: "text",
      };
      const index = pageState.annotations.length;

      pageState.annotations.push(annotation);
      undoStack.push({
        type: "add",
        pageNumber,
        annotation,
        index,
      });
      redoStack.length = 0;
      this.redrawPage(pageNumber);
      onChange?.();
      return cloneAnnotation(annotation);
    },

    updateText(pageNumber, annotationId, updates) {
      const pageState = pages.get(pageNumber);
      if (!pageState) return null;

      const index = pageState.annotations.findIndex(
        (annotation) =>
          annotation.id === annotationId && annotation.type === "text"
      );
      if (index === -1) return null;

      const before = pageState.annotations[index];
      const after = {
        ...before,
        ...cloneText({ ...before, ...updates }),
        id: before.id,
        type: "text",
      };

      pageState.annotations[index] = after;
      undoStack.push({
        type: "update",
        pageNumber,
        before,
        after,
        index,
      });
      redoStack.length = 0;
      this.redrawPage(pageNumber);
      onChange?.();
      return cloneAnnotation(after);
    },

    eraseAnnotationAt(pageNumber, point, tolerance = 8) {
      const pageState = pages.get(pageNumber);
      if (!pageState?.annotations.length) return false;

      for (
        let index = pageState.annotations.length - 1;
        index >= 0;
        index -= 1
      ) {
        const annotation = pageState.annotations[index];

        if (!isPointInAnnotation(point, annotation, tolerance)) {
          continue;
        }

        pageState.annotations.splice(index, 1);
        undoStack.push({
          type: "remove",
          pageNumber,
          annotation,
          index,
        });
        redoStack.length = 0;
        this.redrawPage(pageNumber);
        onChange?.();
        return true;
      }

      return false;
    },

    getTextAt(pageNumber, point, tolerance = 3) {
      const pageState = pages.get(pageNumber);
      if (!pageState) return null;

      for (
        let index = pageState.annotations.length - 1;
        index >= 0;
        index -= 1
      ) {
        const annotation = pageState.annotations[index];

        if (
          annotation.type === "text" &&
          isPointInText(point, annotation, tolerance)
        ) {
          return cloneAnnotation(annotation);
        }
      }

      return null;
    },

    removeAnnotation(pageNumber, annotationId) {
      const pageState = pages.get(pageNumber);
      if (!pageState) return false;

      const index = pageState.annotations.findIndex(
        (annotation) => annotation.id === annotationId
      );
      if (index === -1) return false;

      const [annotation] = pageState.annotations.splice(index, 1);
      undoStack.push({
        type: "remove",
        pageNumber,
        annotation,
        index,
      });
      redoStack.length = 0;
      this.redrawPage(pageNumber);
      onChange?.();
      return true;
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

    redrawPage(
      pageNumber,
      draftStroke = null,
      excludedAnnotationId = null
    ) {
      const pageState = pages.get(pageNumber);
      if (!pageState?.canvas || !pageState.context) return;

      const { canvas, context, annotations } = pageState;
      context.clearRect(0, 0, canvas.width, canvas.height);

      for (const annotation of annotations) {
        if (annotation.id === excludedAnnotationId) {
          continue;
        }

        drawAnnotation(context, annotation);
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

    getAnnotationsByPage() {
      const annotationsByPage = new Map();

      for (const [pageNumber, pageState] of pages) {
        if (pageState.annotations.length > 0) {
          annotationsByPage.set(
            pageNumber,
            pageState.annotations.map(cloneAnnotation)
          );
        }
      }

      return annotationsByPage;
    },

    canUndo() {
      return undoStack.length > 0;
    },

    canRedo() {
      return redoStack.length > 0;
    },

    getAnnotationCount() {
      let count = 0;

      for (const pageState of pages.values()) {
        count += pageState.annotations.length;
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
      annotations: [],
    });
  }

  return pages.get(pageNumber);
}

function undoAction(pages, action) {
  if (action.type === "add") {
    return removeAnnotation(pages, action.pageNumber, action.annotation);
  }

  if (action.type === "remove") {
    return insertAnnotation(
      pages,
      action.pageNumber,
      action.annotation,
      action.index
    );
  }

  if (action.type === "update") {
    return replaceAnnotation(
      pages,
      action.pageNumber,
      action.after,
      action.before,
      action.index
    );
  }

  return false;
}

function redoAction(pages, action) {
  if (action.type === "add") {
    return insertAnnotation(
      pages,
      action.pageNumber,
      action.annotation,
      action.index
    );
  }

  if (action.type === "remove") {
    return removeAnnotation(pages, action.pageNumber, action.annotation);
  }

  if (action.type === "update") {
    return replaceAnnotation(
      pages,
      action.pageNumber,
      action.before,
      action.after,
      action.index
    );
  }

  return false;
}

function insertAnnotation(pages, pageNumber, annotation, index) {
  const pageState = getOrCreatePageState(pages, pageNumber);
  const insertionIndex = Math.min(
    Math.max(index, 0),
    pageState.annotations.length
  );

  pageState.annotations.splice(insertionIndex, 0, annotation);
  return true;
}

function removeAnnotation(pages, pageNumber, annotation) {
  const pageState = pages.get(pageNumber);
  if (!pageState) return false;

  const index = pageState.annotations.findIndex(
    (candidate) => candidate.id === annotation.id
  );
  if (index === -1) return false;

  pageState.annotations.splice(index, 1);
  return true;
}

function replaceAnnotation(
  pages,
  pageNumber,
  expected,
  replacement,
  fallbackIndex
) {
  const pageState = pages.get(pageNumber);
  if (!pageState) return false;

  const index = pageState.annotations.findIndex(
    (candidate) => candidate.id === expected.id
  );
  const replacementIndex = index === -1 ? fallbackIndex : index;

  if (
    replacementIndex < 0 ||
    replacementIndex >= pageState.annotations.length
  ) {
    return false;
  }

  pageState.annotations[replacementIndex] = replacement;
  return true;
}

function drawAnnotation(context, annotation) {
  if (annotation.type === "text") {
    drawText(context, annotation);
    return;
  }

  drawStroke(context, annotation);
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

function drawText(context, annotation) {
  const lines = annotation.text.split("\n");

  context.save();
  context.fillStyle = annotation.color;
  context.font = `${annotation.fontSize}px Helvetica, Arial, sans-serif`;
  context.textBaseline = "top";

  lines.forEach((line, index) => {
    context.fillText(
      line,
      annotation.x,
      annotation.y + index * annotation.lineHeight
    );
  });

  context.restore();
}

function cloneStroke(stroke) {
  return {
    id: stroke.id,
    type: "stroke",
    color: stroke.color,
    width: stroke.width,
    points: stroke.points.map((point) => ({ ...point })),
  };
}

function cloneText(annotation) {
  return {
    id: annotation.id,
    type: "text",
    text: annotation.text,
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
    color: annotation.color,
    fontSize: annotation.fontSize,
    lineHeight: annotation.lineHeight,
  };
}

function cloneAnnotation(annotation) {
  return annotation.type === "text"
    ? cloneText(annotation)
    : cloneStroke(annotation);
}

function isPointInAnnotation(point, annotation, tolerance) {
  if (annotation.type === "text") {
    return isPointInText(point, annotation, Math.min(tolerance, 4));
  }

  const hitRadius = annotation.width / 2 + tolerance;
  return isPointNearStroke(point, annotation, hitRadius);
}

function isPointInText(point, annotation, tolerance) {
  return (
    point.x >= annotation.x - tolerance &&
    point.x <= annotation.x + annotation.width + tolerance &&
    point.y >= annotation.y - tolerance &&
    point.y <= annotation.y + annotation.height + tolerance
  );
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
