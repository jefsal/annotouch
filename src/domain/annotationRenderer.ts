import type {
  Annotation,
  StrokeAnnotation,
  StrokeDraft,
  TextAnnotation,
} from "./types";

export function drawAnnotation(
  context: CanvasRenderingContext2D,
  annotation: Annotation
): void {
  if (annotation.type === "text") {
    drawText(context, annotation);
    return;
  }

  drawStroke(context, annotation);
}

export function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: StrokeAnnotation | StrokeDraft
): void {
  const firstPoint = stroke.points[0];
  if (!firstPoint || stroke.points.length < 2) return;

  context.save();
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";

  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);

  // Indexed rather than `points.slice(1)`: this runs for every annotation on
  // the page on every pointer move while drawing, and the copy was pure waste.
  for (let index = 1; index < stroke.points.length; index += 1) {
    const point = stroke.points[index];
    if (point) {
      context.lineTo(point.x, point.y);
    }
  }

  context.stroke();
  context.restore();
}

export function drawText(
  context: CanvasRenderingContext2D,
  annotation: TextAnnotation
): void {
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
