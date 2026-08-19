import { useState } from "preact/hooks";
import type { Ref } from "preact";
import { isPdfFile } from "../app/documentController";
import { cx } from "./classNames";

interface DocumentViewportProps {
  workspaceRef: Ref<HTMLElement>;
  pagesRef: Ref<HTMLDivElement>;
  hasDocument: boolean;
  isBusy: boolean;
  onDropFile: (file: File | undefined) => void;
}

export function DocumentViewport({
  workspaceRef,
  pagesRef,
  hasDocument,
  isBusy,
  onDropFile,
}: DocumentViewportProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();

    if (isBusy) return;

    setIsDragging(true);

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDragLeave = (event: DragEvent) => {
    const workspace = event.currentTarget as HTMLElement;

    if (!workspace.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    onDropFile([...(event.dataTransfer?.files ?? [])].find(isPdfFile));
  };

  return (
    <section
      ref={workspaceRef}
      class={cx(
        "workspace min-h-0 overflow-auto p-7 motion-safe:transition-[background]",
        "motion-safe:duration-[160ms] motion-safe:ease-[ease] max-compact:p-3.5",
        isDragging && "is-dragging bg-surface-drop"
      )}
      aria-label="pdf annotation workspace"
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <label
        id="empty-state"
        class={cx(
          "empty-state text-text-secondary mx-auto mt-[16vh] min-h-[220px] w-[min(520px,100%)] cursor-pointer content-center place-items-center gap-2.5 rounded-control border border-dashed border-border-dropzone bg-(--color-empty-surface) text-center max-compact:mt-[10vh] max-compact:min-h-[200px]",
          // Utilities outrank the layered stylesheet, so [hidden] cannot win
          // against a display utility; drive display from state instead.
          hasDocument ? "hidden" : "grid"
        )}
        for="pdf-input"
        hidden={hasDocument}
      >
        <span class="empty-title text-text-strong text-[20px] font-bold">
          open a PDF to start
        </span>
        <span class="empty-copy max-w-[34ch] text-[14px]/[1.5] text-pretty">
          drop one here or choose a file from this device
        </span>
        <span class="empty-action text-text-primary border-border-default bg-surface mt-1.5 inline-flex h-9 items-center justify-center whitespace-nowrap rounded-control border px-3 text-[13px] font-[650]">
          choose PDF
        </span>
      </label>
      <div
        ref={pagesRef}
        id="pages-container"
        class="pages-container"
        hidden={!hasDocument}
      />
    </section>
  );
}
