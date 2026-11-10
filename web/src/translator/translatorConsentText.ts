/**
 * 사투리 번역기 Google Gemini 전송 동의의 문안 (KAN-304). `ads/adConsentText.ts`처럼 상수로 뺀다 —
 * 화면과 테스트가 같은 값을 보게 하고, 문구를 고치는 사람이 JSX를 뒤지지 않게 하기 위해서다.
 *
 * App Store 심사(1.0 빌드 13)가 5.1.1(i)·5.1.2(i)로 거절했다(2026-10-30). 입력 문장이 서버를 거쳐
 * Google LLC의 Gemini API로 가는데, 무엇을 누구에게 보내는지 보내기 전에 밝히고 허락받지 않았다는
 * 것이다. 애플 요건은 ① 무슨 데이터를 ② 누구에게 보내는지 ③ 보내기 전 사용자 허락 ④ 방침이고,
 * ④는 개인정보처리방침(2026-10-20판) 「사투리 번역기 (앱)」 절이 이미 맡는다. 이 파일이 ①②와
 * ③의 문구를 맡는다.
 *
 * 문장을 다듬더라도 빠지면 안 되는 요소: ① 보내는 데이터(입력 문장) ② 받는 곳(Google LLC,
 * Gemini API) ③ 목적(표준어 ↔ 경남 사투리 번역) ④ 구글이 제품 개선에 쓸 수 있음(무료 등급) ⑤ 개인정보·
 * 민감 정보 입력 금지 ⑥ 방침 링크 ⑦ 보내지 않는 것(계정 정보·음성, KAN-331 — 빌드 15 재거절 2026-11-09에 맞춰
 * 받는 곳·보내는 것·안 보내는 것을 한 시트에서 다 말한다).
 *
 * ③은 양방향으로 적는다. KAN-317에서 사투리 → 표준어 방향이 생겨 「경남 사투리로 바꾸려면」 같은 한 방향
 * 문구는 첫 [바꾸기]가 표준어로 바꾸기인 사용자에게 목적을 틀리게 말한다(PR #64 리뷰 2026-11-04).
 * 서버 방침도 KAN-316에서 목적을 「번역 결과(사투리 또는 표준어) 생성」으로 넓혔다.
 *
 * 「저희 서버는 문장을 저장하지 않아요」 같은 말은 쓰지 않는다. 서버는 prod에서 번역 기록(입력·결과)을
 * 대체 ID로 S3에 남긴다(방침 같은 절, KAN-266 §6). 그래서 보관은 방침을 가리키는 말로만 적는다.
 */

export const TRANSLATOR_CONSENT_TITLE = '문장을 Google Gemini로 보내도 될까요?'

/** ① 입력 문장 + ② Google LLC의 Gemini API + ③ 번역 목적(양방향, KAN-317). 보관은 방침으로 넘긴다 */
export const TRANSLATOR_CONSENT_LEAD =
  '표준어와 경남 사투리 사이를 바꾸려면 입력하신 문장을 Google LLC의 Gemini API로 보내요. 문장은 번역에만 쓰고, 번역 기록은 개인정보처리방침에 적은 대로 보관해요.'

/** ⑦ 보내지 않는 것. 서버는 입력 문장만 Gemini로 넘기고 계정 식별자는 싣지 않으며, 번역기에는 녹음이 없다 (KAN-331) */
export const TRANSLATOR_CONSENT_NOT_SENT = '계정 정보·음성은 보내지 않아요.'

/** ④ 구글의 제품 개선 활용 + ⑤ 개인정보·민감 정보 입력 금지 */
export const TRANSLATOR_CONSENT_GOOGLE_NOTE =
  'Google은 받은 문장을 자사 제품 개선에 쓸 수 있어요. 이름, 연락처, 주소 같은 개인정보나 건강, 금융 정보 같은 민감한 내용은 넣지 마세요.'

/** ⑥ 방침 링크 앞뒤의 말. 링크 자체는 `legal/PrivacyPolicyLink`가 그린다 */
export const TRANSLATOR_CONSENT_DETAIL_LEAD = '자세한 내용은 '
export const TRANSLATOR_CONSENT_DETAIL_TAIL = '의 「사투리 번역기」 절에 있어요.'

export const TRANSLATOR_CONSENT_AGREE = '동의하고 보내기'
export const TRANSLATOR_CONSENT_CANCEL = '취소'

/**
 * 입력창 아래 상시 고지. 뒤에 방침 링크가 붙는다. 동의한 뒤에도 무엇이 어디로 가는지는 화면에 남아
 * 있어야 한다 — 시트는 기기마다 한 번만 뜬다. 예전 「개인정보나 민감한 내용은 넣지 마세요」는 시트의
 * [TRANSLATOR_CONSENT_GOOGLE_NOTE]로 옮겼고, 여기는 한 줄을 지키려고 받는 곳만 말한다.
 */
export const TRANSLATOR_NOTICE = '입력한 문장은 번역을 위해 Google Gemini API로 보내요 · '
