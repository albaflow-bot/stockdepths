# 배포 체크리스트 (주식알리미)

> 비밀 키는 이 파일이나 코드에 적지 마세요. 아래 "넣는 곳"(수파베이스/버셀/GitHub
> 대시보드의 비밀값 칸)에만 입력합니다. 채팅에도 붙여넣지 마세요.

## 1) 수파베이스 (저장소)
1. supabase.com → 새 프로젝트 생성(무료).
2. 좌측 **SQL Editor** → `server/supabase/schema.sql` 내용을 붙여넣고 **Run**
   → 표 3개(추천/성적표/기기토큰)가 만들어집니다.
3. **Settings → API** 에서 두 값을 복사해 둡니다(아래 2·3단계에서 사용):
   - **Project URL** (`https://○○○.supabase.co`)
   - **service_role key** (비밀 — 서버 전용)

## 2) 버셀 (서버 올리기)
1. vercel.com → 이 저장소를 Import.
2. **Root Directory = `server`** 로 설정 (중요 — 서버 폴더가 루트).
3. **Environment Variables** 에 아래를 추가:
   | 이름 | 값 | 비고 |
   |---|---|---|
   | `SUPABASE_URL` | 1단계의 Project URL | |
   | `SUPABASE_SERVICE_ROLE_KEY` | 1단계의 service_role key | 비밀 |
   | `GEMINI_API_KEY` | 제미나이 무료 키 | 비밀 |
   | `PICKS_PRIMARY` | `gemini` | 무료(제미나이) 우선 |
4. Deploy → 배포 주소(`https://○○○.vercel.app`)를 받습니다.

## 3) GitHub (매일 자동 추천 + 푸시)
저장소 **Settings → Secrets and variables → Actions** 에 등록:
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
  (푸시 사용 시) `FCM_SERVICE_ACCOUNT_JSON`
- Variables: `PICKS_PRIMARY` = `gemini`

→ 평일 자동 예약(`.github/workflows/daily-batch.yml`)이 미국·한국 추천을 만들어
수파베이스에 저장하고, 등록된 기기에 푸시를 보냅니다.

## 4) 앱(APK) 받기
- 앱은 **서버 주소를 빌드 시점에 박아 넣습니다.** 그래서 **2단계의 버셀 주소가 나온 뒤**
  빌드해야 합니다. 빌드 설정의 `EXPO_PUBLIC_API_BASE_URL` 에 그 주소를 넣고,
  화면의 **📱 결과물 빌드해서 받기** 로 APK를 받으세요.

## 5) (선택) 푸시 알림 켜기
- Firebase 무료 프로젝트 → 안드로이드 앱 등록(패키지명 `com.bindesk.stocktiming`)
  → 서비스 계정 JSON을 위 `FCM_SERVICE_ACCOUNT_JSON` 에 넣으면 자동 푸시가 발송됩니다.
- 없어도 앱·추천은 정상 동작하며, 자동 푸시만 비활성화됩니다.
