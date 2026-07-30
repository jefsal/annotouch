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

  for (const point of stroke.points.slice(1)) {
    context.lineTo(point.x, point.y);
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
