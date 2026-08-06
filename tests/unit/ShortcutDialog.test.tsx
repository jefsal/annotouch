import { fireEvent, render, screen } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SHORTCUT_GROUPS } from "../../src/app/shortcuts";
import { ShortcutDialog } from "../../src/components/ShortcutDialog";

function getDialog(): HTMLDialogElement {
  const dialog = document.querySelector<HTMLDialogElement>(
    "#commands-shortcuts-dialog"
  );

  if (!dialog) {
    throw new Error("shortcut dialog was not rendered");
  }

  return dialog;
}

describe("ShortcutDialog", () => {
  it("stays closed until it is opened", () => {
    render(<ShortcutDialog isOpen={false} onClose={vi.fn()} />);

    expect(getDialog().open).toBe(false);
  });

  it("opens as a modal when asked", () => {
    const { rerender } = render(
      <ShortcutDialog isOpen={false} onClose={vi.fn()} />
    );

    rerender(<ShortcutDialog isOpen onClose={vi.fn()} />);

    expect(getDialog().open).toBe(true);
  });

  it("closes when the open flag is withdrawn", () => {
    const onClose = vi.fn();
    const { rerender } = render(<ShortcutDialog isOpen onClose={onClose} />);

    expect(getDialog().open).toBe(true);

    rerender(<ShortcutDialog isOpen={false} onClose={onClose} />);

    expect(getDialog().open).toBe(false);
  });

  it("reports a close request from the close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ShortcutDialog isOpen onClose={onClose} />);

    await user.click(
      screen.getByRole("button", { name: "close keyboard shortcuts" })
    );

    expect(onClose).toHaveBeenCalled();
  });

  it("reports a close request when the native close event fires", () => {
    const onClose = vi.fn();

    render(<ShortcutDialog isOpen onClose={onClose} />);
    onClose.mockClear();

    // What Escape produces in a real browser: the dialog closes itself and the
    // component only ever sees the resulting `close` event.
    getDialog().close();

    expect(onClose).toHaveBeenCalled();
  });

  it("closes on a click landing on the backdrop", () => {
    const onClose = vi.fn();

    render(<ShortcutDialog isOpen onClose={onClose} />);
    onClose.mockClear();

    // A backdrop click targets the dialog element itself.
    fireEvent.click(getDialog());

    expect(onClose).toHaveBeenCalled();
  });

  it("ignores clicks inside the dialog content", () => {
    const onClose = vi.fn();

    render(<ShortcutDialog isOpen onClose={onClose} />);
    onClose.mockClear();

    fireEvent.click(
      screen.getByRole("heading", { name: "keyboard shortcuts" })
    );

    expect(onClose).not.toHaveBeenCalled();
  });

  it("labels itself with its own heading", () => {
    render(<ShortcutDialog isOpen onClose={vi.fn()} />);

    expect(getDialog()).toHaveAttribute(
      "aria-labelledby",
      "commands-shortcuts-title"
    );
    expect(
      screen.getByRole("heading", { name: "keyboard shortcuts" })
    ).toHaveAttribute("id", "commands-shortcuts-title");
  });

  it("renders every configured shortcut group and command", () => {
    render(<ShortcutDialog isOpen onClose={vi.fn()} />);

    const dialog = getDialog();
    const expectedCommandCount = SHORTCUT_GROUPS.reduce(
      (total, group) => total + group.commands.length,
      0
    );

    expect(dialog.querySelectorAll(".commands-shortcuts-row")).toHaveLength(
      expectedCommandCount
    );

    for (const group of SHORTCUT_GROUPS) {
      expect(
        screen.getByRole("heading", { name: group.label })
      ).toBeInTheDocument();

      for (const command of group.commands) {
        expect(screen.getByText(command.label)).toBeInTheDocument();
      }
    }
  });

  it("renders each key of a chord as its own kbd element", () => {
    render(<ShortcutDialog isOpen onClose={vi.fn()} />);

    const chord = SHORTCUT_GROUPS.flatMap((group) => group.commands).find(
      (command) => command.keys.length > 1
    );

    if (!chord) {
      throw new Error("expected at least one multi-key shortcut");
    }

    const row = screen
      .getByText(chord.label)
      .closest(".commands-shortcuts-row");

    expect(row).not.toBeNull();

    const renderedKeys = [...(row?.querySelectorAll("kbd") ?? [])].map(
      (key) => key.textContent
    );

    expect(renderedKeys).toEqual(expect.arrayContaining([...chord.keys]));
  });
});
