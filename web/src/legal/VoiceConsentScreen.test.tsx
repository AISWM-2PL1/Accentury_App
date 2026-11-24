import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRIVACY_POLICY_URL } from './privacyPolicy'
import { VOICE_CONSENT_CHECKBOX_LABEL, VOICE_CONSENT_TITLE } from './voiceConsent'
import { VoiceConsentScreen } from './VoiceConsentScreen'

function renderScreen() {
  const onDone = vi.fn<(consented: boolean) => void>()
  render(<VoiceConsentScreen onDone={onDone} />)
  return { onDone }
}

function checkbox() {
  return screen.getByRole('checkbox', { name: VOICE_CONSENT_CHECKBOX_LABEL })
}

describe('VoiceConsentScreen — 선택 동의 (KAN-270)', () => {
  it('처음부터 체크되어 있다 — 2026-11-24 사용자 결정(KAN-367)으로 기본 체크', () => {
    renderScreen()

    expect(checkbox()).toBeChecked()
  })

  it('선택 동의임과 만 14세 확인을 밝히고, 방침의 해당 절로 가는 링크를 건다', () => {
    renderScreen()

    expect(screen.getByRole('heading', { level: 1, name: VOICE_CONSENT_TITLE })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('선택')
    expect(screen.getByText(/동의하지 않아도 테스트 응시와 결과 확인에 아무 제한이 없어요/)).toBeInTheDocument()
    expect(checkbox()).toHaveAccessibleName(expect.stringContaining('만 14세'))
    expect(screen.getByRole('link', { name: '개인정보처리방침' })).toHaveAttribute(
      'href',
      DEFAULT_PRIVACY_POLICY_URL,
    )
    // 미동의의 결과를 버튼 아래에서 한 번 더 — 인트로 고지와 같은 사실이다
    expect(screen.getByText('동의하지 않으면 녹음한 음성은 분석이 끝나면 바로 지워요')).toBeInTheDocument()
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
  it('체크를 풀어도 열려 있고, 누르면 미동의로 한 번 알린다 — 체크를 풀고 [다음]이 곧 거부다', () => {
    const { onDone } = renderScreen()

    fireEvent.click(checkbox())
    expect(checkbox()).not.toBeChecked()
    const next = screen.getByRole('button', { name: '다음' })
    expect(next).toBeEnabled()
    fireEvent.click(next)

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(false)
  })

  it('그대로 누르면 동의로 알린다 — 기본 체크라 [다음]만 눌러도 동의다', () => {
    const { onDone } = renderScreen()

    expect(checkbox()).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '다음' }))

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith(true)
  })

  it('풀었다 다시 체크하면 동의로 알린다 — 마지막 상태가 확정이다', () => {
    const { onDone } = renderScreen()

    fireEvent.click(checkbox())
    fireEvent.click(checkbox())
    fireEvent.click(screen.getByRole('button', { name: '다음' }))

    expect(onDone).toHaveBeenCalledWith(true)
  })
})
