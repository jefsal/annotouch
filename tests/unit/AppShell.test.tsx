import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

import { AppShell } from "../../src/components/AppShell";

describe("AppShell", () => {
  it("renders the accessible empty application state", () => {
    render(<AppShell theme="light" showHistoryControls={false} />);

    expect(screen.getByRole("status")).toHaveTextContent("no PDF loaded");
    expect(
      screen.getByRole("region", { name: "pdf annotation workspace" })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("show undo/redo")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "export" })).toBeDisabled();
  });

  it("reflects persisted theme and toolbar preferences", () => {
    render(<AppShell theme="night" showHistoryControls />);

    expect(
      screen.getByRole("button", { name: "toggle night mode" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("show undo/redo")).toBeChecked();
  });
});
