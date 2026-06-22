import { describe, it, expect, vi } from "vitest";
import { buildLaunchAnnouncement, sendLaunchAnnouncement, ANNOUNCEMENT_DISCLAIMER } from "../announcement.js";
import { ResendClient, type JsonFetcher } from "../resend.js";

describe("buildLaunchAnnouncement", () => {
  it("leads with the trust angle and includes CTA + disclaimer", () => {
    const b = buildLaunchAnnouncement({ appUrl: "https://stock.app/install" });
    expect(b.subject).toContain("정직한 성적표");
    expect(b.subject).toContain("5년 백테스트");
    expect(b.text).toContain("5년 백테스트와 정직한 성적표");
    expect(b.text).toContain("로그인 없이 무료로 시작");
    expect(b.text).toContain("https://stock.app/install");
    expect(b.text).toContain(ANNOUNCEMENT_DISCLAIMER);
    // html carries the CTA link + disclaimer
    expect(b.html).toContain('href="https://stock.app/install"');
    expect(b.html).toContain(ANNOUNCEMENT_DISCLAIMER);
  });

  it("respects a custom product name", () => {
    const b = buildLaunchAnnouncement({ appUrl: "https://x", productName: "테스트앱" });
    expect(b.subject).toContain("테스트앱");
  });
});

describe("sendLaunchAnnouncement", () => {
  it("sends the built announcement via the client", async () => {
    const fetcher: JsonFetcher = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{"id":"e1"}' }));
    const client = new ResendClient({ apiKey: "re_1", fetcher });
    const spy = vi.spyOn(client, "sendEmail");

    const res = await sendLaunchAnnouncement(client, {
      to: "user@example.com",
      from: "launch@stock.app",
      appUrl: "https://stock.app",
    });

    expect(res.id).toBe("e1");
    expect(spy).toHaveBeenCalledOnce();
    const sent = spy.mock.calls[0]![0];
    expect(sent.to).toBe("user@example.com");
    expect(sent.subject).toContain("출시 안내");
    expect(sent.html).toBeTruthy();
    expect(sent.text).toBeTruthy();
  });
});
