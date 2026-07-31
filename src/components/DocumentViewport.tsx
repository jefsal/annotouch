import { useState } from "preact/hooks";
import type { Ref } from "preact";
import { isPdfFile } from "../app/documentController";

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
      class={`workspace min-h-0 overflow-auto p-7 transition-[background] duration-150 max-[720px]:p-3.5${
        isDragging ? " is-dragging" : ""
      }`}
      aria-label="pdf annotation workspace"
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <label
        id="empty-state"
        class="empty-state text-text-secondary mx-auto mt-[16vh] grid min-h-[220px] w-[min(520px,100%)] cursor-pointer content-center place-items-center gap-2.5 rounded border border-dashed border-[#b9c2d0] bg-white/70 text-center max-[720px]:mt-[10vh] max-[720px]:min-h-[200px]"
        for="pdf-input"
        hidden={hasDocument}
      >
        <span class="empty-title text-text-strong text-xl font-bold">
          drop a PDF{" "}
        </span>
        <span class="empty-copy text-sm opacity-45">
          or choose a local file
        </span>
        <span class="empty-action text-text-primary border-border-default bg-surface mt-1.5 inline-flex h-9 items-center justify-center whitespace-nowrap rounded border px-3 text-[13px] font-semibold">
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
