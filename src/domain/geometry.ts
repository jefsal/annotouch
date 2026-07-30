import type {
  Annotation,
  Point,
  StrokeAnnotation,
  TextAnnotation,
} from "./types";

type StrokeGeometry = Pick<StrokeAnnotation, "points" | "width">;
type TextGeometry = Pick<TextAnnotation, "x" | "y" | "width" | "height">;

export function isPointInAnnotation(
  point: Point,
  annotation: Annotation,
  tolerance: number
): boolean {
  if (annotation.type === "text") {
    return isPointInText(point, annotation, Math.min(tolerance, 4));
  }

  return isPointNearStroke(
    point,
    annotation,
    annotation.width / 2 + tolerance
  );
}

export function isPointInText(
  point: Point,
  annotation: TextGeometry,
  tolerance: number
): boolean {
  return (
    point.x >= annotation.x - tolerance &&
    point.x <= annotation.x + annotation.width + tolerance &&
    point.y >= annotation.y - tolerance &&
    point.y <= annotation.y + annotation.height + tolerance
  );
}

export function isPointNearStroke(
  point: Point,
  stroke: StrokeGeometry,
  hitRadius: number
): boolean {
  if (stroke.points.length === 0) {
    return false;
  }

  const firstPoint = stroke.points[0];
  if (!firstPoint) {
    return false;
  }

  if (stroke.points.length === 1) {
    return distance(point, firstPoint) <= hitRadius;
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    const start = stroke.points[index - 1];
    const end = stroke.points[index];

    if (
      start &&
      end &&
      pointToSegmentDistance(point, start, end) <= hitRadius
    ) {
      return true;
    }
  }

  return false;
}

export function pointToSegmentDistance(
  point: Point,
  start: Point,
  end: Point
): number {
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

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
