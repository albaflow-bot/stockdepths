import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddHoldingForm } from "../AddHoldingForm";
import type { HoldingInput } from "../../portfolio/types";

function fill(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

describe("AddHoldingForm", () => {
  it("submits a valid holding and clears the inputs", async () => {
    const onAdd = vi.fn(async (_i: HoldingInput) => null);
    render(<AddHoldingForm onAdd={onAdd} />);

    fill("holding-symbol-input", "AAPL");
    fill("holding-cost-input", "150.25");
    fill("holding-qty-input", "10");
    fireEvent.click(screen.getByTestId("holding-add-button"));

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ symbol: "AAPL", costBasis: 150.25, quantity: 10 }));
    // Inputs cleared after success.
    await waitFor(() => expect(screen.getByTestId("holding-cost-input")).toHaveValue(""));
  });

  it("submits without a quantity (optional)", async () => {
    const onAdd = vi.fn(async () => null);
    render(<AddHoldingForm onAdd={onAdd} />);
    fill("holding-symbol-input", "MSFT");
    fill("holding-cost-input", "400");
    fireEvent.click(screen.getByTestId("holding-add-button"));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith({ symbol: "MSFT", costBasis: 400, quantity: undefined }),
    );
  });

  it("blocks an invalid cost basis with an inline error and does not call onAdd", async () => {
    const onAdd = vi.fn(async () => null);
    render(<AddHoldingForm onAdd={onAdd} />);
    fill("holding-symbol-input", "AAPL");
    fill("holding-cost-input", "0");
    fireEvent.click(screen.getByTestId("holding-add-button"));
    expect(await screen.findByText(/매수가를 0보다 큰/)).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("surfaces a repository validation error returned from onAdd", async () => {
    const onAdd = vi.fn(async () => "종목 코드를 올바르게 입력해 주세요 (예: AAPL).");
    render(<AddHoldingForm onAdd={onAdd} />);
    fill("holding-symbol-input", "$$$");
    fill("holding-cost-input", "100");
    fireEvent.click(screen.getByTestId("holding-add-button"));
    expect(await screen.findByText(/종목 코드를 올바르게/)).toBeInTheDocument();
  });
});
