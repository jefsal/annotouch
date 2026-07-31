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
      class="commands-shortcuts-dialog"
      aria-labelledby="commands-shortcuts-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div class="commands-shortcuts-header">
        <h2 id="commands-shortcuts-title">keyboard shortcuts</h2>
        <button
          id="commands-shortcuts-close"
          class="commands-shortcuts-close"
          type="button"
          aria-label="close keyboard shortcuts"
          autoFocus
          onClick={onClose}
        >
          &times;
        </button>
      </div>
      <div id="commands-shortcuts-content" class="commands-shortcuts-content">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.label} class="commands-shortcuts-group">
            <h3>{group.label}</h3>
            <dl class="commands-shortcuts-list">
              {group.commands.map((command) => (
                <div key={command.label} class="commands-shortcuts-row">
                  <dt>{command.label}</dt>
                  <dd>
                    <ShortcutKeys keys={command.keys} />
                    {command.alternateKeys ? (
                      <>
                        <span class="shortcut-separator" aria-hidden="true">
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
            <span class="key-separator" aria-hidden="true">
              +
            </span>
          ) : null}
          <kbd>{key}</kbd>
        </Fragment>
      ))}
    </>
  );
}
