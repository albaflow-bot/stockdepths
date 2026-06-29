import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewsSection, relativeTime } from "../NewsSection";
import type { NewsArticle } from "../../types/news";

const SAMPLE: NewsArticle[] = [
  { title: "삼성전자 신고가 경신", source: "연합뉴스", publishedAt: "2026-06-29T01:00:00.000Z", link: "https://n.example/1" },
  { title: "2분기 실적 전망 상향", source: "한국경제", publishedAt: "2026-06-29T00:00:00.000Z", link: "https://n.example/2" },
];

describe("relativeTime", () => {
  const now = new Date("2026-06-29T03:00:00.000Z");
  it("분/시간/어제/날짜로 환원", () => {
    expect(relativeTime("2026-06-29T02:59:30.000Z", now)).toBe("방금");
    expect(relativeTime("2026-06-29T02:30:00.000Z", now)).toBe("30분 전");
    expect(relativeTime("2026-06-29T00:00:00.000Z", now)).toBe("3시간 전");
    expect(relativeTime("2026-06-28T01:00:00.000Z", now)).toBe("어제");
    expect(relativeTime("", now)).toBe("");
    expect(relativeTime("쓰레기", now)).toBe("");
  });
});

describe("NewsSection", () => {
  it("로드되면 헤드라인+출처를 보여주고, 탭하면 원문 링크를 연다", async () => {
    const onOpen = vi.fn();
    const loader = vi.fn(async () => SAMPLE);
    render(<NewsSection q="삼성전자" market="KR" title="관련 뉴스" loader={loader} onOpen={onOpen} />);

    await waitFor(() => expect(screen.getByText("삼성전자 신고가 경신")).toBeInTheDocument());
    expect(screen.getByText(/연합뉴스/)).toBeInTheDocument();
    expect(loader).toHaveBeenCalledWith(expect.objectContaining({ q: "삼성전자", market: "KR" }));

    fireEvent.click(screen.getByTestId("news-section-item-0"));
    expect(onOpen).toHaveBeenCalledWith("https://n.example/1");
  });

  it("onOpen 미주입 시 탭하면 앱 내부 웹뷰가 열린다(외부 브라우저 ✗)", async () => {
    render(<NewsSection q="삼성전자" market="KR" title="관련 뉴스" loader={async () => SAMPLE} />);
    await waitFor(() => expect(screen.getByTestId("news-section-item-0")).toBeInTheDocument());
    expect(screen.queryByTestId("news-section-webview")).toBeNull();
    fireEvent.click(screen.getByTestId("news-section-item-0"));
    expect(screen.getByTestId("news-section-webview")).toBeInTheDocument();
  });

  it("결과 0건 → 한 줄 안내(검증 출처 기준)", async () => {
    render(<NewsSection q="없는종목" market="KR" title="관련 뉴스" loader={async () => []} />);
    await waitFor(() => expect(screen.getByTestId("news-section-empty")).toBeInTheDocument());
  });

  it("로더 실패도 화면 안 막고 빈 상태로 degrade", async () => {
    render(<NewsSection q="삼성" market="KR" title="관련 뉴스" loader={async () => { throw new Error("boom"); }} />);
    await waitFor(() => expect(screen.getByTestId("news-section-empty")).toBeInTheDocument());
  });

  it("q 가 비면 섹션 자체를 렌더하지 않음", () => {
    const { container } = render(<NewsSection q="   " market="US" title="관련 뉴스" loader={async () => SAMPLE} />);
    expect(container.textContent).toBe("");
  });
});
