/**
 * 음성 저장 선택 동의 화면 (KAN-270 1단계, 서버 KAN-269).
 *
 * 웹 단독 실행 시작 게이트의 한 칸이다: 인트로 [내 억양 테스트하기] → 마이크 권한 → **여기** →
 * 출신 지역(체크 여부와 무관, KAN-274) → 목소리 점검 → 세션 생성(`startStandaloneTest`). 동의하면 세션 생성 본문에
 * `voiceConsentVersion`이 실리고, 서버는 그 세션의 음성만 AI 학습용으로 보관한다.
 *
 * ## 선택 동의라서 지키는 것 (팀 결정 2026-10-06)
 *
 * - **기본은 미동의다.** 체크박스를 미리 채워 두지 않는다 — 그냥 [다음]을 누른 사람의 음성이
 *   동의한 것으로 쌓이면 동의가 아니다.
 * - **[다음]은 체크와 무관하게 늘 눌린다.** 건너뛰기 버튼을 따로 두지 않고, 체크하지 않은 채
 *   [다음]이 곧 거부다. 거부해도 응시·결과에 제한이 없으므로 화면이 길을 막을 이유가 없다
 *   (출신 지역 화면은 라벨을 받으려고 있는 화면이라 반대로 잠근다 — `RegionSelectScreen`).
 * - **세션마다 묻는다.** 웹은 익명이라 앞 응시의 동의를 이어 줄 사람이 없다. 값은 `micGranted`처럼
 *   `App`의 문서 상태로만 살고, 재응시는 문서를 다시 로드하므로(`goToIntro`) 매번 미동의로 시작한다.
 *
 * ## 왜 점검 앞인가
 *
 * 지역 화면과 같은 근거다 — 네트워크를 쓰지 않는 화면을 세션 생성 앞에 모아 두면, 어디서
 * 멈추든 서버에 아무도 응시하지 않을 세션이 남지 않는다.
 *
 * 문안은 전부 `voiceConsent.ts`에 있다 (개인정보 담당 검토 뒤 그 파일만 고친다).
 */

import { useState } from 'react'
import { haptic } from '../bridge/bridge'
import { Button } from '../ui'
import { PrivacyPolicyLink } from './PrivacyPolicyLink'
import {
  VOICE_CONSENT_CHECKBOX_LABEL,
  VOICE_CONSENT_DETAILS,
  VOICE_CONSENT_FOOTNOTE,
  VOICE_CONSENT_LEAD,
  VOICE_CONSENT_POLICY_LEAD,
  VOICE_CONSENT_POLICY_TAIL,
  VOICE_CONSENT_TITLE,
} from './voiceConsent'

export interface VoiceConsentScreenProps {
  /** 체크 여부를 호출자에게 넘긴다 — true면 세션 생성 본문에 `voiceConsentVersion`이 실린다 */
  onDone: (consented: boolean) => void
}

export function VoiceConsentScreen({ onDone }: VoiceConsentScreenProps) {
  const [checked, setChecked] = useState(false)

  return (
    <main className="item-screen" aria-labelledby="voice-consent-title">
      <div>
        <h1 id="voice-consent-title" className="type-title-sm">
          {VOICE_CONSENT_TITLE}
        </h1>
        <p
          className="type-body-sm"
          style={{ color: 'var(--color-muted-foreground)', marginTop: 'var(--space-2)' }}
        >
          {VOICE_CONSENT_LEAD}
        </p>
      </div>

      <div className="item-screen__body">
        {/*
          지역 화면의 선택지 카드(`.choice`)를 그대로 쓰되, 표식은 숨기지 않는다. 라디오 카드는
          고르면 ✓가 생기지만, 체크박스를 숨기면 비어 있는 카드가 "누를 수 있는 것"으로 읽히지
          않는다 — 동의 여부가 화면에서 바로 보여야 한다.
        */}
        <label className={checked ? 'choice choice--check choice--selected' : 'choice choice--check'}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => {
              // 객관식 선택과 같은 탭 햅틱 (KAN-258). 웹 단독 실행에는 브리지가 없어 지금은 지나간다
              haptic('tap')
              setChecked(event.target.checked)
            }}
          />
          <span className="type-body-sm">{VOICE_CONSENT_CHECKBOX_LABEL}</span>
        </label>

        <ul className="type-caption voice-consent__details">
          {VOICE_CONSENT_DETAILS.map((line) => (
            <li key={line}>{line}</li>
          ))}
          <li>
            {VOICE_CONSENT_POLICY_LEAD} <PrivacyPolicyLink />
            {VOICE_CONSENT_POLICY_TAIL}
          </li>
        </ul>
      </div>

      <div className="item-screen__footer">
        {/* 체크와 무관하게 늘 눌린다 — 체크하지 않은 [다음]이 곧 거부다 (헤더 참고) */}
        <Button onClick={() => onDone(checked)} style={{ width: '100%' }}>
          다음
        </Button>
        <p
          className="type-caption"
          style={{ color: 'var(--color-muted-foreground)', textAlign: 'center', marginTop: 'var(--space-4)' }}
        >
          {VOICE_CONSENT_FOOTNOTE}
        </p>
      </div>
    </main>
  )
}
