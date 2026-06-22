import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PersonaSetupScreen } from "../PersonaSetupScreen";
import type { PersonaConfig } from "../../persona/types";

const now = () => "2026-06-21T00:00:00Z";

describe("PersonaSetupScreen (first-run)", () => {
  it("offers the three presets + custom and has NO skip control", () => {
    render(<PersonaSetupScreen onSave={vi.fn()} now={now} />);
    expect(screen.getByTestId("persona-option-conservative")).toBeInTheDocument();
    expect(screen.getByTestId("persona-option-neutral")).toBeInTheDocument();
    expect(screen.getByTestId("persona-option-aggressive")).toBeInTheDocument();
    expect(screen.getByTestId("persona-option-custom")).toBeInTheDocument();
    expect(screen.queryByText(/건너뛰기|나중에|skip/i)).toBeNull(); // no-skip gate
    expect(screen.getByText(/건너뛸 수 없습니다/)).toBeInTheDocument();
  });

  it("requires a selection before saving", () => {
    const onSave = vi.fn();
    render(<PersonaSetupScreen onSave={onSave} now={now} />);
    fireEvent.click(screen.getByTestId("persona-save-button"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("투자 성향을 선택해 주세요.")).toBeInTheDocument();
  });

  it("saves the chosen preset", async () => {
    const onSave = vi.fn();
    render(<PersonaSetupScreen onSave={onSave} now={now} />);
    fireEvent.click(screen.getByTestId("persona-option-conservative"));
    fireEvent.click(screen.getByTestId("persona-save-button"));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        mode: "preset",
        profile: "conservative",
        targetReturnPct: 10,
        stopLossPct: 5,
        setAt: "2026-06-21T00:00:00Z",
      } satisfies PersonaConfig),
    );
  });

  it("toggles a selection off when tapped again (no separate clear button)", () => {
    const onSave = vi.fn();
    render(<PersonaSetupScreen onSave={onSave} now={now} />);
    const neutral = screen.getByTestId("persona-option-neutral");
    fireEvent.click(neutral); // select
    fireEvent.click(neutral); // tap again → deselect
    fireEvent.click(screen.getByTestId("persona-save-button"));
    expect(onSave).not.toHaveBeenCalled(); // nothing selected after the toggle-off
    expect(screen.getByText("투자 성향을 선택해 주세요.")).toBeInTheDocument();
  });

  it("reveals custom inputs only when 직접 설정 is selected and saves valid values", async () => {
    const onSave = vi.fn();
    render(<PersonaSetupScreen onSave={onSave} now={now} />);
    expect(screen.queryByTestId("persona-target-input")).toBeNull();

    fireEvent.click(screen.getByTestId("persona-option-custom"));
    fireEvent.change(screen.getByTestId("persona-target-input"), { target: { value: "30" } });
    fireEvent.change(screen.getByTestId("persona-stop-input"), { target: { value: "12" } });
    fireEvent.click(screen.getByTestId("persona-save-button"));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "custom", targetReturnPct: 30, stopLossPct: 12 }),
      ),
    );
  });

  it("shows a validation error for invalid custom values", () => {
    const onSave = vi.fn();
    render(<PersonaSetupScreen onSave={onSave} now={now} />);
    fireEvent.click(screen.getByTestId("persona-option-custom"));
    fireEvent.change(screen.getByTestId("persona-target-input"), { target: { value: "0" } });
    fireEvent.change(screen.getByTestId("persona-stop-input"), { target: { value: "10" } });
    fireEvent.click(screen.getByTestId("persona-save-button"));
    expect(screen.getByText(/목표 수익률은 0보다 큰/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("PersonaSetupScreen (edit)", () => {
  it("prefills the current persona and saves with the edit label", async () => {
    const onSave = vi.fn();
    const initial: PersonaConfig = {
      mode: "preset",
      profile: "aggressive",
      targetReturnPct: 40,
      stopLossPct: 20,
      setAt: "t",
    };
    render(<PersonaSetupScreen mode="edit" initial={initial} onSave={onSave} now={now} />);
    expect(screen.getByText("성향 저장")).toBeInTheDocument();
    // Already selected → can save immediately.
    fireEvent.click(screen.getByTestId("persona-save-button"));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ profile: "aggressive" })));
  });
});
