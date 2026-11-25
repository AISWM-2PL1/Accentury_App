import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRIVACY_POLICY_URL } from './privacyPolicy'
import { VOICE_CONSENT_AGE_LABEL, VOICE_CONSENT_CHECKBOX_LABEL, VOICE_CONSENT_TITLE } from './voiceConsent'
import { VoiceConsentScreen } from './VoiceConsentScreen'

function renderScreen() {
  const onDone = vi.fn<(consented: boolean) => void>()
  render(<VoiceConsentScreen onDone={onDone} />)
  return { onDone }
}

function checkbox() {
  return screen.getByRole('checkbox', { name: VOICE_CONSENT_CHECKBOX_LABEL })
}

function ageCheckbox() {
  return screen.getByRole('checkbox', { name: VOICE_CONSENT_AGE_LABEL })
}

function next() {
  fireEvent.click(screen.getByRole('button', { name: '다음' }))
}

describe('VoiceConsentScreen — 선택 동의 (KAN-270)', () => {
  it('처음에는 동의 칸만 체크돼 있고 만 14세 확인 칸은 비어 있다 — KAN-367 PR #89 리뷰 G', () => {
    renderScreen()

    expect(checkbox()).toBeChecked()
    expect(ageCheckbox()).not.toBeChecked()
  })

  it('선택 동의임과 만 14세 확인을 밝히고, 방침의 해당 절로 가는 링크를 건다', () => {
    renderScreen()

    expect(screen.getByRole('heading', { level: 1, name: VOICE_CONSENT_TITLE })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('선택')
    expect(screen.getByText(/동의하지 않아도 테스트 응시와 결과 확인에 아무 제한이 없어요/)).toBeInTheDocument()
    expect(ageCheckbox()).toHaveAccessibleName('만 14세 이상이에요.')
    expect(screen.getByRole('link', { name: '개인정보처리방침' })).toHaveAttribute(
      'href',
      DEFAULT_PRIVACY_POLICY_URL,
    )
    // 미동의의 결과를 버튼 아래에서 한 번 더 — 인트로 고지와 같은 사실이다
    expect(screen.getByText('동의하지 않으면 녹음한 음성은 분석이 끝나면 바로 지워요')).toBeInTheDocument()
  })

  it('동의 전에 음성의 수신처를 밝힌다 — 자체 서버, 외부 AI 회사 미전송 (KAN-366, App Store 5.1.1(i))', () => {
    renderScreen()

    expect(
      screen.getByText(/녹음은 Accentury가 직접 운영하는 서버\(AWS 서울\)로 보내 분석해요\. 외부 AI 회사에는 보내지 않아요\./),
    ).toBeInTheDocument()
  })
})

describe('VoiceConsentScreen — 서식 (KAN-347 7단계, 시안 s-03-voice-consent-web)', () => {
  it('제목은 동의 화면 제목 크기 26(.type-headline)이고 [다음]에 화살표 아이콘이 붙는다', () => {
    renderScreen()

    expect(screen.getByRole('heading', { level: 1, name: VOICE_CONSENT_TITLE })).toHaveClass('type-headline')
    const next = screen.getByRole('button', { name: '다음' })
    expect(next.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    // 항목 목록: 보관 항목·보유 기간·웹 익명 세션 삭제 한계·방침 링크
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })
})

describe('VoiceConsentScreen — [다음]', () => {
  it('그대로 누르면 미동의로 한 번 알린다 — 나이 칸은 직접 체크해야 하고, [다음]은 늘 열려 있다', () => {
    const { onDone } = renderScreen()

    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled()
    next()

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(false)
  })

  it('나이를 체크하고 누르면 동의로 알린다 — 두 칸이 다 체크돼야 동의다', () => {
    const { onDone } = renderScreen()

    fireEvent.click(ageCheckbox())
    expect(ageCheckbox()).toBeChecked()
    next()

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(true)
  })

  it('나이를 체크해도 동의를 풀고 누르면 미동의로 알린다 — 동의 칸을 풀고 [다음]이 곧 거부다', () => {
    const { onDone } = renderScreen()

    fireEvent.click(ageCheckbox())
    fireEvent.click(checkbox())
    expect(checkbox()).not.toBeChecked()
    next()

    expect(onDone).toHaveBeenCalledWith(false)
  })
})
