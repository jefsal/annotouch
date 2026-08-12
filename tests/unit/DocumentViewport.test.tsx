import { fireEvent, render, screen } from "@testing-library/preact";
import { createRef } from "preact";
import { describe, expect, it, vi } from "vitest";

import { DocumentViewport } from "../../src/components/DocumentViewport";

type DocumentViewportProps = Parameters<typeof DocumentViewport>[0];

function renderViewport(
  overrides: Partial<DocumentViewportProps> = {}
): DocumentViewportProps {
  const props: DocumentViewportProps = {
    workspaceRef: createRef<HTMLElement>(),
    pagesRef: createRef<HTMLDivElement>(),
    hasDocument: false,
    isBusy: false,
    onDropFile: vi.fn(),
    ...overrides,
  };

  render(<DocumentViewport {...props} />);
  return props;
}

function getWorkspace(): HTMLElement {
  return screen.getByRole("region", { name: "pdf annotation workspace" });
}

function getPagesContainer(): HTMLElement {
  const container = document.querySelector<HTMLElement>("#pages-container");

  if (!container) {
    throw new Error("pages container was not rendered");
  }

  return container;
}

function pdfFile(name = "notes.pdf"): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

/**
 * jsdom implements neither `DragEvent` nor `DataTransfer`, so drag interaction
 * is driven with plain events carrying the only two members the component
 * reads: `dataTransfer` and `relatedTarget`.
 */
function fireDrag(
  target: Element,
  type: "dragenter" | "dragover" | "dragleave" | "drop",
  {
    files = [],
    relatedTarget = null,
  }: { files?: File[]; relatedTarget?: Node | null } = {}
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });

  Object.defineProperty(event, "dataTransfer", {
    value: { files, dropEffect: "none" },
  });
  Object.defineProperty(event, "relatedTarget", { value: relatedTarget });

  fireEvent(target, event);
  return event;
}

describe("DocumentViewport", () => {
  it("offers the empty state and hides the pages container with no document", () => {
    renderViewport({ hasDocument: false });

    const emptyState = screen.getByText("choose PDF").closest("label");

    expect(emptyState).toBeVisible();
    expect(emptyState).toHaveAttribute("for", "pdf-input");
    expect(getPagesContainer()).not.toBeVisible();
  });

  it("hides the empty state and reveals the pages container with a document", () => {
    renderViewport({ hasDocument: true });

    expect(screen.getByText("choose PDF").closest("label")).not.toBeVisible();
    expect(getPagesContainer()).toBeVisible();
  });

  it("assigns the refs the document controller mounts into", () => {
    const workspaceRef = createRef<HTMLElement>();
    const pagesRef = createRef<HTMLDivElement>();

    renderViewport({ workspaceRef, pagesRef });

    expect(workspaceRef.current).toBe(getWorkspace());
    expect(pagesRef.current).toBe(getPagesContainer());
  });

  it("highlights the workspace while a file is dragged over it", () => {
    renderViewport();

    const workspace = getWorkspace();

    expect(workspace).not.toHaveClass("is-dragging");

    fireDrag(workspace, "dragenter");

    expect(workspace).toHaveClass("is-dragging");
  });

  it("claims the drag as a copy so the browser does not navigate", () => {
    renderViewport();

    const event = fireDrag(getWorkspace(), "dragover");

    expect(event.defaultPrevented).toBe(true);
    expect((event as DragEvent).dataTransfer?.dropEffect).toBe("copy");
  });

  it("does not highlight the workspace while busy", () => {
    renderViewport({ isBusy: true });

    const workspace = getWorkspace();

    fireDrag(workspace, "dragenter");

    expect(workspace).not.toHaveClass("is-dragging");
  });

  it("keeps the highlight when the pointer moves between descendants", () => {
    renderViewport();

    const workspace = getWorkspace();

    fireDrag(workspace, "dragenter");
    fireDrag(workspace, "dragleave", { relatedTarget: getPagesContainer() });

    expect(workspace).toHaveClass("is-dragging");
  });

  it("drops the highlight when the pointer leaves the workspace", () => {
    renderViewport();

    const workspace = getWorkspace();

    fireDrag(workspace, "dragenter");
    fireDrag(workspace, "dragleave", { relatedTarget: document.body });

    expect(workspace).not.toHaveClass("is-dragging");
  });

  it("reports the dropped PDF and clears the highlight", () => {
    const props = renderViewport();
    const workspace = getWorkspace();
    const file = pdfFile();

    fireDrag(workspace, "dragenter");
    const event = fireDrag(workspace, "drop", { files: [file] });

    expect(event.defaultPrevented).toBe(true);
    expect(props.onDropFile).toHaveBeenCalledWith(file);
    expect(workspace).not.toHaveClass("is-dragging");
  });

  it("picks the PDF out of a mixed drop", () => {
    const props = renderViewport();
    const file = pdfFile();

    fireDrag(getWorkspace(), "drop", {
      files: [new File(["x"], "notes.txt", { type: "text/plain" }), file],
    });

    expect(props.onDropFile).toHaveBeenCalledWith(file);
  });

  it("reports nothing usable when the drop holds no PDF", () => {
    const props = renderViewport();

    fireDrag(getWorkspace(), "drop", {
      files: [new File(["x"], "notes.txt", { type: "text/plain" })],
    });

    expect(props.onDropFile).toHaveBeenCalledWith(undefined);
  });

  it("accepts a PDF identified only by its extension", () => {
    const props = renderViewport();
    const file = new File(["%PDF-1.4"], "scan.PDF", { type: "" });

    fireDrag(getWorkspace(), "drop", { files: [file] });

    expect(props.onDropFile).toHaveBeenCalledWith(file);
  });
});
