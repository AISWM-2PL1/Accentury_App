import Foundation

/*
 * 음성 저장 선택 동의 문안 (KAN-270 3단계, 서버 KAN-269). 안드로이드 `auth/VoiceConsentText.kt`와 글자 하나 다르지
 * 않은 같은 문장이다 — 상수 이름은 `privacyPolicyVersion`(안드로이드 `PRIVACY_POLICY_VERSION`)과 같은 규칙으로
 * 낙타 표기로 옮겼다.
 *
 * 정본은 웹 `web/src/legal/voiceConsent.ts`다. 개인정보 담당 검토가 병행 중이라(2026-10-06) 문장을 바꿀 때 SwiftUI
 * 코드를 뒤지지 않고 이 파일만 고친다 — 세 플랫폼을 같은 커밋에서 맞춘다. 빠지면 안 되는 요소는 웹 파일 헤더에 있다
 * (선택 동의, 거부 시 무제한, 보관 항목·기간, 만 14세 확인, 삭제 요청 경로).
 *
 * 웹과 다른 곳: DETAILS 셋째 줄. 웹은 익명 세션이라 "세션 만료 뒤 개별 삭제 요청 불가"를 말하지만, 앱은 계정에
 * 동의가 묶여 설정에서 철회할 수 있다. 버전 상수는 두지 않는다 — 동의(PUT)는 서버가 준 currentVersion을 싣는다.
 */

public let voiceConsentTitle = "음성 저장에 동의하시겠어요? (선택)"

/// ① 목적 + ② 선택 동의이고 거부해도 제한이 없다는 것
public let voiceConsentLead =
    "억양 분석 AI 모델을 학습시키고 개선하는 데 쓰려고, 따로 동의하신 분의 음성 녹음과 분석 정보를 보관해요. " +
    "선택 사항이라 동의하지 않아도 테스트 응시와 결과 확인에 아무 제한이 없어요."

/// 체크박스 문구. ④ 만 14세 이상 확인을 동의와 한 문장에 묶는다
public let voiceConsentCheckboxLabel =
    "음성 녹음과 분석 정보를 AI 모델 학습에 쓰도록 보관하는 데 동의하고, 만 14세 이상임을 확인해요."

/// ③ 보관 항목·보유 기간 + 철회 경로. 방침 링크 줄은 화면이 따로 그린다
public let voiceConsentDetails: [String] = [
    "보관 항목: 문항별 음성 녹음(WAV)과 분석 라벨 정보",
    "보유 기간: 학습 목적 달성 시까지",
    "동의는 설정에서 언제든 철회할 수 있고, 철회한 뒤의 녹음은 저장하지 않아요",
]

public let voiceConsentPolicyLead = "자세한 내용은"
public let voiceConsentPolicyTail = "의 「음성 저장과 AI 모델 학습 활용」 절을 봐 주세요."

/// 버튼 아래 캡션. 미동의의 결과를 한 줄로 — 웹 인트로 고지(`PrivacyNotice`)와 같은 사실이다
public let voiceConsentFootnote = "동의하지 않으면 녹음한 음성은 분석이 끝나면 바로 지워요"

/// 설정 화면 「개인정보」 섹션 (KAN-270)
public let voiceConsentSettingLabel = "음성 저장 동의 (선택)"
public let voiceConsentSettingCaption =
    "켜면 녹음한 음성과 분석 정보를 억양 분석 AI 학습에 보관해요. 끄면 그 뒤의 녹음부터 저장하지 않아요. " +
    "이미 저장된 음성의 처리는 개인정보처리방침 13항의 개인정보 보호책임자에게 요청해 주세요."
