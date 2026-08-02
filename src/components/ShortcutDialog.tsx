import { Fragment } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { SHORTCUT_GROUPS } from "../app/shortcuts";

interface ShortcutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutDialog({ isOpen, onClose }: ShortcutDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      id="commands-shortcuts-dialog"
      class="commands-shortcuts-dialog m-auto max-h-[min(680px,calc(100dvh-32px))]
        w-[min(460px,calc(100vw-32px))] overflow-hidden rounded-dialog border
        border-border-subtle bg-white p-0 text-text-primary shadow-dialog
        in-data-[theme=night]:border-[#343b49] in-data-[theme=night]:bg-[#171923]
        in-data-[theme=night]:text-[#f3f4f6] max-tight:max-h-[calc(100dvh-20px)]
        max-tight:w-[calc(100vw-20px)]"
      aria-labelledby="commands-shortcuts-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div
        class="commands-shortcuts-header flex items-center justify-between gap-4
          border-b border-border-section px-[18px] py-4
          in-data-[theme=night]:border-[#343b49] max-tight:px-3.5
          max-tight:py-[13px]"
      >
        <h2 id="commands-shortcuts-title" class="m-0 text-lg/[1.25]">
          keyboard shortcuts
        </h2>
        <button
          id="commands-shortcuts-close"
          class="commands-shortcuts-close text-text-secondary size-8 flex-none
            cursor-pointer rounded-pill border-none bg-transparent p-0 text-2xl/none
            shadow-none in-data-[theme=night]:text-[#aab2c0]
            in-data-[theme=night]:hover:bg-[#242936]
            in-data-[theme=night]:hover:text-[#f3f4f6]"
          type="button"
          aria-label="close keyboard shortcuts"
          autoFocus
          onClick={onClose}
        >
          &times;
        </button>
      </div>
      <div
        id="commands-shortcuts-content"
        class="commands-shortcuts-content max-h-[min(583px,calc(100dvh-97px))]
          overflow-y-auto overscroll-contain px-[18px] pt-1 pb-[18px]
          max-tight:max-h-[calc(100dvh-79px)] max-tight:px-3.5
          max-tight:pt-0.5 max-tight:pb-3.5"
      >
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.label} class="commands-shortcuts-group">
            <h3
              class="text-text-secondary mt-4 mb-[7px] text-[11px]/[1.2] font-bold
                tracking-[0.08em] in-data-[theme=night]:text-text-faint"
            >
              {group.label}
            </h3>
            <dl class="commands-shortcuts-list m-0">
              {group.commands.map((command) => (
                <div
                  key={command.label}
                  class="commands-shortcuts-row grid grid-cols-[minmax(0,42%)_minmax(0,1fr)]
                    border-b border-[#eef1f5] in-data-[theme=night]:border-[#2d3340]
                    max-tight:grid-cols-[minmax(0,38%)_minmax(0,1fr)]"
                >
                  <dt
                    class="text-text-strong m-0 flex min-h-[37px] items-center py-[7px]
                      pr-2 text-[13px] in-data-[theme=night]:text-[#e5e7eb]
                      max-tight:pr-1"
                  >
                    {command.label}
                  </dt>
                  <dd
                    class="m-0 flex min-h-[37px] items-center justify-end gap-1 py-1.5
                      pl-2 max-tight:gap-[3px]"
                  >
                    <ShortcutKeys keys={command.keys} />
                    {command.alternateKeys ? (
                      <>
                        <span
                          class="shortcut-separator text-text-faint mx-[3px] text-[11px]
                            in-data-[theme=night]:text-text-faint"
                          aria-hidden="true"
                        >
                          /
                        </span>
                        <ShortcutKeys keys={command.alternateKeys} />
                      </>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}

function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((key, index) => (
        <Fragment key={`${index}-${key}`}>
          {index > 0 ? (
            <span
              class="key-separator text-text-faint text-[11px]
                in-data-[theme=night]:text-text-faint"
              aria-hidden="true"
            >
              +
            </span>
          ) : null}
          <kbd
            class="text-text-faint inline-flex h-[25px] min-w-[26px] items-center
              justify-center rounded-control border-none bg-surface-muted px-[7px]
              text-[11px] font-[650] whitespace-nowrap [font-family:inherit]
              in-data-[theme=night]:bg-[#242936] in-data-[theme=night]:text-[#aab2c0]
              max-tight:min-w-[23px] max-tight:px-[5px]
              max-tight:text-[10px]"
          >
            {key}
          </kbd>
        </Fragment>
      ))}
    </>
  );
}
