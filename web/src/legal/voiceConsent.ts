/**
 * 음성 저장 선택 동의의 버전과 문안 (KAN-270, 서버 KAN-269).
 *
 * 서버는 세션 생성 본문의 `voiceConsentVersion`이 게시 버전과 같은 세션의 음성만 AI 학습용으로
 * 보관한다. 동의를 받는 화면이 없으면 보관되는 음성이 0건이라, 웹은 인트로 다음에 이 문안을
 * 띄우는 화면(`VoiceConsentScreen`)을 하나 둔다.
 *
 * ## 문안을 한 파일에 모으는 이유
 *
 * 아래 문안은 개인정보처리방침(`privacy.html`) 「음성 저장과 AI 모델 학습 활용 (선택 동의)」 절의
 * 축약 초안이고, 개인정보 담당 검토가 병행 중이다 (2026-10-06). 검토 뒤 문장을 바꿀 때 JSX를
 * 뒤지지 않고 이 파일만 고치면 되도록 상수로 뺀다 — `ads/adConsentText.ts`와 같은 판단이다.
 * 화면과 테스트가 같은 값을 보는 것도 같은 이유다.
 *
 * 문장을 다듬더라도 빠지면 안 되는 요소: ① 선택 동의라는 것 ② 거부해도 응시·결과에 제한이
 * 없다는 것 ③ 보관 항목·보유 기간 ④ 만 14세 이상 확인 ⑤ 웹 익명 세션의 삭제 요청 한계.
 *
 * 네이티브(Android·iOS, KAN-270 2·3단계)가 같은 문안을 옮길 때 이 파일이 정본이다.
 */

/**
 * 게시된 동의 문안 버전.
 *
 * **서버 `AccenturyProperties.VOICE_CONSENT_VERSION`과 같아야 한다** — 다르면 서버가 400
 * `VALIDATION_FAILED`로 세션 생성을 거절한다 (그때 `startStandaloneTest`가 동의 없이 한 번 더
 * 만들어 응시는 막히지 않는다). 문안을 바꾸면 `privacy.html`의 `accentury-policy-version`과 이
 * 값, 서버 값을 함께 올린다 (KAN-269/KAN-270).
 */
export const VOICE_CONSENT_VERSION = '2026-10-04'

export const VOICE_CONSENT_TITLE = '음성 저장에 동의하시겠어요? (선택)'

/** ① 목적 + ② 선택 동의이고 거부해도 제한이 없다는 것 */
export const VOICE_CONSENT_LEAD =
  '억양 분석 AI 모델을 학습시키고 개선하는 데 쓰려고, 따로 동의하신 분의 음성 녹음과 분석 정보를 보관해요. 선택 사항이라 동의하지 않아도 테스트 응시와 결과 확인에 아무 제한이 없어요.'

/** 체크박스 문구. ④ 만 14세 이상 확인을 동의와 한 문장에 묶는다 */
export const VOICE_CONSENT_CHECKBOX_LABEL =
  '음성 녹음과 분석 정보를 AI 모델 학습에 쓰도록 보관하는 데 동의하고, 만 14세 이상임을 확인해요.'

/** ③ 보관 항목·보유 기간 + ⑤ 웹 익명 세션의 삭제 요청 한계. 방침 링크 줄은 화면이 따로 그린다 */
export const VOICE_CONSENT_DETAILS: readonly string[] = [
  '보관 항목: 문항별 음성 녹음(WAV)과 분석 라벨 정보',
  '보유 기간: 학습 목적 달성 시까지',
  '웹은 익명 세션이라 세션이 만료되면 어느 분의 음성인지 알 수 없어, 그 뒤에는 개별 삭제 요청을 처리할 수 없어요',
]

/**
 * 방침 링크 앞뒤의 말. 링크 자체(글자 「개인정보처리방침」)는 `PrivacyPolicyLink`가 그린다 —
 * 앱 WebView에서는 네이티브가 여는 갈래가 그 컴포넌트에만 있다.
 */
export const VOICE_CONSENT_POLICY_LEAD = '자세한 내용은'
export const VOICE_CONSENT_POLICY_TAIL = '의 「음성 저장과 AI 모델 학습 활용」 절을 봐 주세요.'

/** [다음] 아래 캡션. 미동의의 결과를 한 줄로 — 인트로 고지(`PrivacyNotice`)와 같은 사실이다 */
export const VOICE_CONSENT_FOOTNOTE = '동의하지 않으면 녹음한 음성은 분석이 끝나면 바로 지워요'
