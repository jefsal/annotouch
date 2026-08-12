import { render, screen } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { createRef } from "preact";
import { describe, expect, it, vi } from "vitest";

import { SettingsPanel } from "../../src/components/SettingsPanel";

type SettingsPanelProps = Parameters<typeof SettingsPanel>[0];

function renderPanel(
  overrides: Partial<SettingsPanelProps> = {}
): SettingsPanelProps {
  const props: SettingsPanelProps = {
    buttonRef: createRef<HTMLButtonElement>(),
    panelRef: createRef<HTMLDivElement>(),
    isOpen: false,
    showHistoryControls: false,
    onToggle: vi.fn(),
    onShowHistoryControlsChange: vi.fn(),
    onOpenShortcuts: vi.fn(),
    ...overrides,
  };

  render(<SettingsPanel {...props} />);
  return props;
}

describe("SettingsPanel", () => {
  it("hides the panel and reports a collapsed button while closed", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "settings" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByRole("dialog", { name: "settings" })).toBeNull();
  });

  it("exposes the panel and marks the button expanded while open", () => {
    renderPanel({ isOpen: true });

    expect(screen.getByRole("button", { name: "settings" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(
      screen.getByRole("dialog", { name: "settings" })
    ).toBeInTheDocument();
  });

  it("wires the button to the panel it controls", () => {
    renderPanel({ isOpen: true });

    const button = screen.getByRole("button", { name: "settings" });
    const panel = screen.getByRole("dialog", { name: "settings" });

    expect(button).toHaveAttribute("aria-controls", "settings-panel");
    expect(panel).toHaveAttribute("id", "settings-panel");
  });

  it("assigns both refs so the outside-pointer guard can reach them", () => {
    const buttonRef = createRef<HTMLButtonElement>();
    const panelRef = createRef<HTMLDivElement>();

    renderPanel({ isOpen: true, buttonRef, panelRef });

    expect(buttonRef.current).toBe(
      screen.getByRole("button", { name: "settings" })
    );
    expect(panelRef.current).toBe(
      screen.getByRole("dialog", { name: "settings" })
    );
  });

  it("reports a toggle request", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByRole("button", { name: "settings" }));

    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it("reflects the persisted undo/redo preference", () => {
    renderPanel({ isOpen: true, showHistoryControls: true });

    expect(screen.getByLabelText("show undo/redo")).toBeChecked();
  });

  it("reports enabling the undo/redo preference", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ isOpen: true, showHistoryControls: false });

    await user.click(screen.getByLabelText("show undo/redo"));

    expect(props.onShowHistoryControlsChange).toHaveBeenCalledWith(true);
  });

  it("reports disabling the undo/redo preference", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ isOpen: true, showHistoryControls: true });

    await user.click(screen.getByLabelText("show undo/redo"));

    expect(props.onShowHistoryControlsChange).toHaveBeenCalledWith(false);
  });

  it("reports a request to open the shortcut dialog", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ isOpen: true });

    const shortcutsButton = screen.getByRole("button", {
      name: "view keyboard shortcuts",
    });

    expect(shortcutsButton).toHaveAttribute("aria-haspopup", "dialog");
    expect(shortcutsButton).toHaveAttribute(
      "aria-controls",
      "commands-shortcuts-dialog"
    );
    expect(shortcutsButton).toHaveAttribute("aria-keyshortcuts", "Meta+K");

    await user.click(shortcutsButton);

    expect(props.onOpenShortcuts).toHaveBeenCalledTimes(1);
  });
});
