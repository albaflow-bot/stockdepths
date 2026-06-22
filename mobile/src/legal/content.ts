/**
 * Legal pages content (SPEC Task 11 — Launch Pack).
 *
 * Single source of truth for the three documents — the investment '참고 조언'
 * disclaimer (not financial advice), the 이용약관 (terms), and the
 * 개인정보처리방침 (privacy policy). The same content renders in-app (LegalScreen)
 * and can be reused by the web landing (Task 12).
 *
 * Copy rule (SPEC): Korean user-facing sentences end with a proper terminator
 * (마침표 등) and never with a trailing colon. This is enforced by
 * `legal/__tests__/content.test.ts`.
 */

export type LegalDocumentId = "disclaimer" | "terms" | "privacy";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  id: LegalDocumentId;
  /** Full document title. */
  title: string;
  /** Short label for the in-app selector. */
  shortLabel: string;
  /** Last revision date (YYYY-MM-DD). */
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
}

const LAST_UPDATED = "2026-06-21";

export const ADVICE_DISCLAIMER_DOC: LegalDocument = {
  id: "disclaimer",
  title: "투자 참고 조언 안내",
  shortLabel: "참고 조언",
  lastUpdated: LAST_UPDATED,
  intro:
    "이 앱이 제공하는 모든 추천과 분석은 투자 참고용 정보이며, 투자 자문이나 수익 보장이 아닙니다.",
  sections: [
    {
      heading: "참고용 정보입니다",
      paragraphs: [
        "이 앱의 '오늘의 추천', 백테스트 결과, 성적표는 모두 참고용으로 제공됩니다.",
        "어떤 화면의 내용도 특정 종목의 매수나 매도를 권유하는 투자 자문이 아닙니다.",
      ],
    },
    {
      heading: "수익을 보장하지 않습니다",
      paragraphs: [
        "AI 분석과 과거 백테스트 결과는 미래의 수익을 보장하지 않습니다.",
        "과거의 성과가 좋았더라도 앞으로의 결과는 다를 수 있습니다.",
      ],
    },
    {
      heading: "데이터는 지연될 수 있습니다",
      paragraphs: [
        "무료 시세 데이터는 실시간이 아니며 보통 15분에서 20분가량 지연될 수 있습니다.",
        "이 앱은 분 단위 매매가 아닌 일봉과 종가 기준의 장기 타이밍 관점을 따릅니다.",
      ],
    },
    {
      heading: "최종 판단과 책임은 본인에게 있습니다",
      paragraphs: [
        "모든 투자 결정의 최종 판단과 그에 따른 책임은 사용자 본인에게 있습니다.",
        "투자에는 원금 손실의 위험이 있으므로 신중하게 결정하시기 바랍니다.",
      ],
    },
  ],
};

export const TERMS_DOC: LegalDocument = {
  id: "terms",
  title: "이용약관",
  shortLabel: "이용약관",
  lastUpdated: LAST_UPDATED,
  intro: "본 약관은 'AI 주식 타이밍 알리미'(이하 '앱')의 이용 조건과 절차를 규정합니다.",
  sections: [
    {
      heading: "제1조 (목적)",
      paragraphs: [
        "본 약관은 앱이 제공하는 서비스의 이용과 관련해 앱과 사용자 간의 권리와 의무를 정하는 것을 목적으로 합니다.",
      ],
    },
    {
      heading: "제2조 (서비스의 내용)",
      paragraphs: [
        "앱은 미국 주식 시장을 대상으로 매일 한 번 참고용 추천 정보와 백테스트, 성적표를 제공합니다.",
        "앱은 사용자가 입력한 관심종목과 보유 정보를 바탕으로 수익률과 알림을 계산합니다.",
      ],
    },
    {
      heading: "제3조 (계정 없는 이용)",
      paragraphs: [
        "앱은 회원 가입이나 로그인 없이 이용할 수 있습니다.",
        "앱은 사용자를 식별하기 위한 계정이나 비밀번호를 요구하지 않습니다.",
      ],
    },
    {
      heading: "제4조 (데이터의 저장)",
      paragraphs: [
        "사용자가 입력한 관심종목, 보유 종목, 투자 성향, 알림 이력 등 개인 데이터는 사용자의 기기에만 저장됩니다.",
        "앱은 이러한 개인 데이터를 외부 서버에 보관하지 않습니다.",
      ],
    },
    {
      heading: "제5조 (투자 책임)",
      paragraphs: [
        "앱이 제공하는 정보는 투자 참고용이며 투자 자문이 아닙니다.",
        "투자 결정과 그 결과에 대한 책임은 전적으로 사용자 본인에게 있습니다.",
      ],
    },
    {
      heading: "제6조 (금지 행위)",
      paragraphs: [
        "사용자는 앱을 역설계하거나 정상적인 서비스 운영을 방해하는 행위를 해서는 안 됩니다.",
      ],
    },
    {
      heading: "제7조 (약관의 변경)",
      paragraphs: [
        "앱은 필요한 경우 본 약관을 변경할 수 있으며, 변경된 약관은 앱 내에 게시한 시점부터 적용됩니다.",
      ],
    },
    {
      heading: "제8조 (문의)",
      paragraphs: ["본 약관에 관한 문의는 앱에 안내된 연락처를 통해 접수할 수 있습니다."],
    },
  ],
};

export const PRIVACY_DOC: LegalDocument = {
  id: "privacy",
  title: "개인정보처리방침",
  shortLabel: "개인정보",
  lastUpdated: LAST_UPDATED,
  intro: "본 방침은 'AI 주식 타이밍 알리미'가 사용자의 개인정보를 어떻게 다루는지 설명합니다.",
  sections: [
    {
      heading: "수집하는 개인정보",
      paragraphs: [
        "앱은 회원 가입이 없으므로 이름, 이메일, 전화번호와 같은 계정 정보를 수집하지 않습니다.",
      ],
    },
    {
      heading: "기기에 저장되는 정보",
      paragraphs: [
        "관심종목, 보유 종목과 매수가, 투자 성향, 알림 이력은 사용자의 기기 내부 저장소에만 보관됩니다.",
        "이 정보는 외부로 전송되지 않으며 사용자 본인만 접근할 수 있습니다.",
      ],
    },
    {
      heading: "외부로 전송되는 정보",
      paragraphs: [
        "앱은 시세와 추천 정보를 받아오기 위해 서버에 종목 코드와 같은 최소한의 조회 요청만 전송합니다.",
        "이러한 조회 요청에는 사용자를 식별할 수 있는 개인정보가 포함되지 않습니다.",
        "푸시 알림을 사용하는 경우 알림 전송을 위해 기기의 푸시 토큰이 서버에 등록될 수 있으며, 이 토큰은 알림 전송 목적으로만 사용됩니다.",
      ],
    },
    {
      heading: "제3자 제공",
      paragraphs: ["앱은 사용자의 개인 데이터를 제3자에게 판매하거나 제공하지 않습니다."],
    },
    {
      heading: "보관과 삭제",
      paragraphs: [
        "기기에 저장된 데이터는 사용자가 앱에서 삭제하거나 앱을 제거하면 함께 삭제됩니다.",
      ],
    },
    {
      heading: "이용자의 권리",
      paragraphs: [
        "사용자는 언제든지 앱 안에서 자신의 관심종목과 보유 정보를 수정하거나 삭제할 수 있습니다.",
      ],
    },
    {
      heading: "문의",
      paragraphs: ["개인정보 처리에 관한 문의는 앱에 안내된 연락처를 통해 접수할 수 있습니다."],
    },
  ],
};

/** All legal documents, in display order (참고 조언 first). */
export const LEGAL_DOCUMENTS: LegalDocument[] = [ADVICE_DISCLAIMER_DOC, TERMS_DOC, PRIVACY_DOC];
