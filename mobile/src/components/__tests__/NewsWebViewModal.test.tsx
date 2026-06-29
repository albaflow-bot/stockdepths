import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewsWebViewModal } from "../NewsWebViewModal";

describe("NewsWebViewModal", () => {
  it("url 이 있으면 상단 '뒤로' + 웹뷰를 렌더", () => {
    render(<NewsWebViewModal visible url="https://n.example/1" title="연합뉴스" onClose={() => {}} />);
    expect(screen.getByTestId("news-webview-back")).toBeInTheDocument();
    expect(screen.getByTestId("news-webview-web")).toBeInTheDocument();
    expect(screen.getByText("연합뉴스")).toBeInTheDocument();
  });

  it("웹뷰 히스토리 없을 때 '뒤로' → onClose(원래 화면 복귀)", () => {
    const onClose = vi.fn();
    render(<NewsWebViewModal visible url="https://n.example/1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("news-webview-back"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("url 이 null 이면 아무것도 렌더하지 않음", () => {
    const { container } = render(<NewsWebViewModal visible url={null} onClose={() => {}} />);
    expect(container.textContent).toBe("");
  });
});
