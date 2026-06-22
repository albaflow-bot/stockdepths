import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LegalScreen } from "../LegalScreen";

describe("LegalScreen", () => {
  it("shows the 참고 조언 disclaimer by default", () => {
    render(<LegalScreen />);
    expect(screen.getByTestId("legal-doc-disclaimer")).toBeInTheDocument();
    expect(screen.getByText("투자 참고 조언 안내")).toBeInTheDocument();
    expect(screen.getByText(/특정 종목의 매수나 매도를 권유하는 투자 자문이 아닙니다/)).toBeInTheDocument();
  });

  it("switches to the privacy policy (on-device storage, no account)", () => {
    render(<LegalScreen />);
    fireEvent.click(screen.getByTestId("legal-tab-privacy"));
    expect(screen.getByTestId("legal-doc-privacy")).toBeInTheDocument();
    expect(screen.getByText(/기기 내부 저장소에만 보관됩니다/)).toBeInTheDocument();
    expect(screen.getByText(/회원 가입이 없으므로/)).toBeInTheDocument();
    // disclaimer no longer shown
    expect(screen.queryByTestId("legal-doc-disclaimer")).toBeNull();
  });

  it("switches to the terms (no-login, on-device only)", () => {
    render(<LegalScreen />);
    fireEvent.click(screen.getByTestId("legal-tab-terms"));
    expect(screen.getByTestId("legal-doc-terms")).toBeInTheDocument();
    expect(screen.getByText(/회원 가입이나 로그인 없이 이용할 수 있습니다/)).toBeInTheDocument();
    expect(screen.getByText(/사용자의 기기에만 저장됩니다/)).toBeInTheDocument();
  });

  it("can start on a specific document", () => {
    render(<LegalScreen initialDocId="terms" />);
    expect(screen.getByTestId("legal-doc-terms")).toBeInTheDocument();
  });
});
