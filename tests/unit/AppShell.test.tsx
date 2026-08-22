import { render, screen } from "@testing-library/preact";
import userEvent from "@testing-library/user-event";
import { createRef } from "preact";
import { describe, expect, it, vi } from "vitest";

import { appReducer, createInitialState } from "../../src/app/state";
import type { AppAction, AppState } from "../../src/app/state";
import { AppShell, type AppShellProps } from "../../src/components/AppShell";

function renderShell(
  state: AppState,
  overrides: Partial<AppShellProps> = {}
): AppShellProps {
  const props: AppShellProps = {
    state,
    workspaceRef: createRef<HTMLElement>(),
    pagesRef: createRef<HTMLDivElement>(),
    settingsButtonRef: createRef<HTMLButtonElement>(),
    settingsPanelRef: createRef<HTMLDivElement>(),
    onOpenFile: vi.fn(),
    onDropFile: vi.fn(),
    onToggleTheme: vi.fn(),
    onSelectColor: vi.fn(),
    onCycleWidth: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onExport: vi.fn(),
    onToggleSettings: vi.fn(),
    onShowHistoryControlsChange: vi.fn(),
    onBackgroundImageVisibilityChange: vi.fn(),
    onOpenShortcuts: vi.fn(),
    onCloseShortcuts: vi.fn(),
    ...overrides,
  };

  render(<AppShell {...props} />);
  return props;
}

function reduce(state: AppState, ...actions: AppAction[]): AppState {
  return actions.reduce(appReducer, state);
}

describe("AppShell", () => {
  it("renders the accessible empty application state", () => {
    renderShell(createInitialState());

    expect(screen.getByRole("status")).toHaveTextContent("no PDF loaded");
    expect(
      screen.getByRole("region", { name: "pdf annotation workspace" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("show undo/redo")).not.toBeChecked();
    expect(screen.getByLabelText("show background image")).toBeChecked();
    expect(screen.getByLabelText("open PDF")).toHaveAttribute(
      "accept",
      "application/pdf"
    );
    expect(screen.getByRole("button", { name: "export" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "zoom in" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "undo" })).toBeDisabled();
  });

  it("reflects persisted theme and toolbar preferences", () => {
    renderShell(
      createInitialState({
        theme: "night",
        toolbar: { showHistoryControls: true },
        isBackgroundImageVisible: false,
      })
    );

    expect(screen.getByRole("button", { name: "night mode" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByLabelText("show undo/redo")).toBeChecked();
    expect(screen.getByLabelText("show background image")).not.toBeChecked();
  });

  it("enables document controls and summarizes the open document", () => {
    const state = reduce(
      createInitialState(),
      { type: "document/loading", fileName: "notes.pdf" },
      {
        type: "document/loaded",
        fileName: "notes.pdf",
        totalPageCount: 4,
        annotatablePageCount: 4,
      },
      { type: "busy/set", isBusy: false },
      {
        type: "history/sync",
        history: { canUndo: true, canRedo: false, annotationCount: 1 },
      }
    );

    renderShell(state);

    expect(screen.getByRole("status")).toHaveTextContent("4 pages ready");
    expect(screen.getByText("notes.pdf")).toBeInTheDocument();
    expect(screen.getByText("4/4 pages | 1 annotation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "export" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "undo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "redo" })).toBeDisabled();
  });

  it("marks the selected pen color and current stroke width", () => {
    const state = reduce(createInitialState(), {
      type: "pen/setColor",
      color: "#16a34a",
    });

    renderShell(state);

    expect(screen.getByRole("button", { name: "green pen" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "red pen" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(
      screen.getByRole("button", { name: "stroke width: small" })
    ).toHaveTextContent("small");
  });

  it("reports toolbar intent through its callbacks", async () => {
    const user = userEvent.setup();
    const props = renderShell(createInitialState());

    await user.click(screen.getByRole("button", { name: "blue pen" }));
    await user.click(
      screen.getByRole("button", { name: "stroke width: small" })
    );
    await user.click(screen.getByRole("button", { name: "night mode" }));
    await user.click(screen.getByRole("button", { name: "settings" }));

    expect(props.onSelectColor).toHaveBeenCalledWith("#2563eb");
    expect(props.onCycleWidth).toHaveBeenCalledTimes(1);
    expect(props.onToggleTheme).toHaveBeenCalledTimes(1);
    expect(props.onToggleSettings).toHaveBeenCalledTimes(1);
  });

  it("reports a PDF chosen from the visible file control", async () => {
    const user = userEvent.setup();
    const props = renderShell(createInitialState());
    const file = new File(["%PDF-1.4"], "notes.pdf", {
      type: "application/pdf",
    });

    await user.upload(screen.getByLabelText("open PDF"), file);

    expect(props.onOpenFile).toHaveBeenCalledWith(file);
  });

  it("keeps the shortcut dialog closed until it is opened", () => {
    renderShell(createInitialState());

    const dialog = document.querySelector("#commands-shortcuts-dialog");

    expect(dialog).not.toBeNull();
    expect(dialog).not.toHaveAttribute("open");
    expect(dialog?.querySelectorAll(".commands-shortcuts-row")).toHaveLength(
      14
    );
  });
});
