export function createStrokeStore({ canvas, onChange }) {
  const strokes = [];
  const context = canvas.getContext("2d");

  return {
    addStroke(stroke) {
      strokes.push(cloneStroke(stroke));
      this.redraw();
      onChange?.();
    },

    undo() {
      if (strokes.length === 0) return;
      strokes.pop();
      this.redraw();
      onChange?.();
    },

    clear() {
      strokes.length = 0;
      this.redraw();
      onChange?.();
    },

    redraw(draftStroke = null) {
      context.clearRect(0, 0, canvas.width, canvas.height);

      for (const stroke of strokes) {
        drawStroke(context, stroke);
      }

      if (draftStroke) {
        drawStroke(context, draftStroke);
      }
    },

    getStrokes() {
      return strokes.map(cloneStroke);
    },

    canUndo() {
      return strokes.length > 0;
    },

    hasStrokes() {
      return strokes.length > 0;
    },
  };
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
