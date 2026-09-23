import { describe, expect, it, vi } from "vitest";

import { createAnnotationStore } from "../../src/annotationStore";
import type {
  HighlightDraft,
  StrokeDraft,
  TextAnnotationDraft,
} from "../../src/domain/types";

describe("annotation store", () => {
  const stroke: StrokeDraft = {
    color: "#e11d48",
    width: 5,
    points: [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
    ],
  };

  const text: TextAnnotationDraft = {
    text: "hello",
    x: 40,
    y: 50,
    width: 60,
    height: 24,
    color: "#111827",
    fontSize: 20,
    lineHeight: 24,
  };

  it("assigns IDs and returns immutable snapshots", () => {
    const store = createAnnotationStore();
    const added = store.addStroke(1, stroke);

    expect(added.id).toBe("annotation-1");
    expect(store.getAnnotationCount()).toBe(1);

    const snapshot = store.getAnnotationsByPage();
    const savedStroke = snapshot.get(1)?.[0];
    expect(savedStroke).toEqual(added);

    if (savedStroke?.type === "stroke") {
      savedStroke.points[0] = { x: 999, y: 999 };
    }

    expect(store.getAnnotationsByPage().get(1)?.[0]).toEqual(added);
  });

  it("maintains chronological history across annotation types", () => {
    const onChange = vi.fn();
    const store = createAnnotationStore({ onChange });
    const addedStroke = store.addStroke(1, stroke);
    const addedText = store.addText(1, text);

    expect(store.canUndo()).toBe(true);
    expect(store.getAnnotationCount()).toBe(2);

    store.undo();
    expect(store.getAnnotationsByPage().get(1)).toEqual([addedStroke]);
    expect(store.canRedo()).toBe(true);

    store.undo();
    expect(store.getAnnotationCount()).toBe(0);

    store.redo();
    store.redo();
    expect(store.getAnnotationsByPage().get(1)).toEqual([
      addedStroke,
      addedText,
    ]);
    expect(onChange).toHaveBeenCalledTimes(6);
  });

  it("undoes, redoes, and erases highlights in order with other types", () => {
    const highlight: HighlightDraft = {
      type: "highlight",
      color: "#facc15",
      rects: [{ x: 100, y: 100, width: 80, height: 12 }],
      text: "highlighted",
    };
    const store = createAnnotationStore();
    const addedStroke = store.addStroke(1, stroke);
    const addedHighlight = store.addHighlight(1, highlight);

    expect(addedHighlight).toMatchObject({ id: "annotation-2", ...highlight });

    store.undo();
    expect(store.getAnnotationsByPage().get(1)).toEqual([addedStroke]);
    store.redo();
    expect(store.getAnnotationsByPage().get(1)).toEqual([
      addedStroke,
      addedHighlight,
    ]);

    expect(store.eraseAnnotationAt(1, { x: 140, y: 106 })).toBe(true);
    expect(store.getAnnotationsByPage().get(1)).toEqual([addedStroke]);
    store.undo();
    expect(store.getAnnotationsByPage().get(1)).toEqual([
      addedStroke,
      addedHighlight,
    ]);
  });

  it("tracks text edits through undo and redo", () => {
    const store = createAnnotationStore();
    const added = store.addText(2, text);

    expect(store.updateText(2, added.id, { text: "updated" })?.text).toBe(
      "updated"
    );

    store.undo();
    expect(store.getTextAt(2, { x: 45, y: 55 })?.text).toBe("hello");

    store.redo();
    expect(store.getTextAt(2, { x: 45, y: 55 })?.text).toBe("updated");
  });

  it("erases the topmost matching annotation and can restore it", () => {
    const store = createAnnotationStore();
    const first = store.addStroke(1, stroke);
    const second = store.addStroke(1, {
      ...stroke,
      color: "#2563eb",
    });

    expect(store.eraseAnnotationAt(1, { x: 20, y: 10 })).toBe(true);
    expect(store.getAnnotationsByPage().get(1)).toEqual([first]);

    store.undo();
    expect(store.getAnnotationsByPage().get(1)).toEqual([first, second]);
  });

  it("resets history and ID generation with the document", () => {
    const store = createAnnotationStore();
    store.addStroke(1, stroke);

    store.reset();

    expect(store.getAnnotationCount()).toBe(0);
    expect(store.canUndo()).toBe(false);
    expect(store.addText(1, text).id).toBe("annotation-1");
  });
});
