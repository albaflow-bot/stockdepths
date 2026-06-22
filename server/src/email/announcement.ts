/**
 * Launch announcement email — content + send helper (SPEC Task 13).
 *
 * Leads with the product's trust angle (honest scorecard + 5-year auto-backtest),
 * states it is free / no-login, and carries the '참고 조언' disclaimer.
 */

import type { EmailMessage, ResendClient, SendResult } from "./resend.js";

const PRODUCT_NAME = "AI 주식 타이밍 알리미";
const DISCLAIMER = "AI는 보장이 아닌 참고 조언입니다. 투자 판단과 책임은 본인에게 있습니다.";

export interface AnnouncementInput {
  /** Install / landing URL included in the CTA. */
  appUrl: string;
  productName?: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

/** Build the launch announcement subject + html + text. */
export function buildLaunchAnnouncement(input: AnnouncementInput): BuiltEmail {
  const product = input.productName ?? PRODUCT_NAME;
  const subject = `${product} 출시 안내 — 정직한 성적표와 5년 백테스트`;

  const text = [
    `${product}가 출시되었습니다.`,
    "",
    "추천만 보여주지 않습니다. 5년 백테스트와 정직한 성적표를 함께 보여줍니다.",
    "매일 한 번 AI가 미국 주식 추천을 고르고, 추천 직전에 같은 전략을 과거 5년에 돌려본 결과와 벤치마크 대비 누적 초과수익을 함께 공개합니다.",
    "",
    "로그인 없이 무료로 시작하며, 모든 개인 데이터는 기기에만 저장됩니다.",
    "",
    `지금 시작하기 ${input.appUrl}`,
    "",
    DISCLAIMER,
  ].join("\n");

  const html = `<!doctype html>
<html lang="ko"><body style="margin:0;background:#f4f6f8;font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <h1 style="font-size:24px;color:#13314f;margin:0 0 16px;">${product} 출시 안내</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 12px;">추천만 보여주지 않습니다. <strong>5년 백테스트</strong>와 <strong>정직한 성적표</strong>를 함께 보여줍니다.</p>
    <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 20px;">매일 한 번 AI가 미국 주식 추천을 고르고, 추천 직전에 같은 전략을 과거 5년에 돌려본 결과와 벤치마크 대비 누적 초과수익을 함께 공개합니다.</p>
    <p style="font-size:14px;color:#64748b;margin:0 0 24px;">로그인 없이 무료로 시작하며, 모든 개인 데이터는 기기에만 저장됩니다.</p>
    <p style="margin:0 0 28px;"><a href="${input.appUrl}" style="display:inline-block;background:#13314f;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px;">지금 시작하기</a></p>
    <p style="font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px;margin:0;">${DISCLAIMER}</p>
  </div>
</body></html>`;

  return { subject, html, text };
}

export interface SendAnnouncementInput extends AnnouncementInput {
  to: string | string[];
  from: string;
}

/** Build + send the launch announcement via a Resend client. */
export async function sendLaunchAnnouncement(
  client: ResendClient,
  input: SendAnnouncementInput,
): Promise<SendResult> {
  const built = buildLaunchAnnouncement(input);
  const message: EmailMessage = {
    from: input.from,
    to: input.to,
    subject: built.subject,
    html: built.html,
    text: built.text,
  };
  return client.sendEmail(message);
}

export { DISCLAIMER as ANNOUNCEMENT_DISCLAIMER };
