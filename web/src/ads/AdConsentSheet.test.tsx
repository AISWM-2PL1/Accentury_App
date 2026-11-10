import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REQUIRED_BRIDGE_VERSION, type AccenturyBridge } from '../bridge/bridge'
import { DEFAULT_PRIVACY_POLICY_URL } from '../legal/privacyPolicy'
import { AdConsentSheet } from './AdConsentSheet'
import {
  AD_CONSENT_ALLOW,
  AD_CONSENT_CHANGE_HINT_IOS,
  AD_CONSENT_CONTINUE,
  AD_CONSENT_CURRENT,
  AD_CONSENT_DENY,
  AD_CONSENT_IOS_ATT_NOTE,
  AD_CONSENT_TITLE,
} from './adConsentText'

afterEach(() => {
  delete window.AccenturyBridge
})

function fakeBridge(overrides: Partial<AccenturyBridge> = {}): AccenturyBridge {
  return {
    requestMicPermission: vi.fn(),
    startVoiceItem: vi.fn(),
    getContractVersion: () => REQUIRED_BRIDGE_VERSION,
    ...overrides,
  }
}

describe('AdConsentSheet — 맞춤형 광고 동의 시트 (KAN-196)', () => {
  it('제목이 달린 모달 대화상자다', () => {
    render(<AdConsentSheet current="unknown" onChoose={vi.fn()} />)

    const dialog = screen.getByRole('dialog', { name: AD_CONSENT_TITLE })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // 인트로의 h1을 빼앗지 않는다 — 시트는 화면 위에 덮인 것이지 화면이 아니다
    expect(screen.getByRole('heading', { level: 2, name: AD_CONSENT_TITLE })).toBeInTheDocument()
  })

  it('고지 4요소를 말한다 — 사업자·수집 항목·목적·거부 시 영향', () => {
    render(<AdConsentSheet current="unknown" onChoose={vi.fn()} />)

    expect(screen.getByText(/Google AdMob/)).toBeInTheDocument() // 사업자
    expect(screen.getByText(/광고 식별자/)).toBeInTheDocument() // 수집 항목
    expect(screen.getByText(/관심사에 맞는 광고/)).toBeInTheDocument() // 목적
    expect(screen.getByText(/일반 광고만 나와요/)).toBeInTheDocument() // 거부 시 영향
    // 되돌릴 길도 알린다 — 링크 이름 그대로
    expect(screen.getByText(/「맞춤형 광고 설정」/)).toBeInTheDocument()
  })

  // 사업자가 앱(AdMob)과 브라우저 웹(AdSense)으로 갈렸다 (KAN-197). 고지 4요소 중 ①사업자와
  // ②수집 항목이 함께 갈리므로, 한쪽 문안이 다른 쪽에 새는 것까지 본다 — 브라우저로 오신 분에게
  // 「기기의 광고 식별자」라고 말하면 쓰지 않는 것을 수집한다고 고지하는 셈이다.
  it('기본값은 앱 문안이다 — Google AdMob과 기기 광고 식별자 (KAN-197)', () => {
    render(<AdConsentSheet current="unknown" onChoose={vi.fn()} />)

    expect(screen.getByText(/Google AdMob/)).toBeInTheDocument()
    expect(screen.getByText(/기기의 광고 식별자/)).toBeInTheDocument()
    expect(screen.queryByText(/Google AdSense/)).not.toBeInTheDocument()
  })

  it('vendor="adsense"면 웹 문안이다 — Google AdSense와 브라우저 쿠키 (KAN-197)', () => {
    render(<AdConsentSheet current="unknown" onChoose={vi.fn()} vendor="adsense" />)

    expect(screen.getByText(/Google AdSense/)).toBeInTheDocument()
    expect(screen.getByText(/브라우저 쿠키/)).toBeInTheDocument()
    expect(screen.queryByText(/Google AdMob/)).not.toBeInTheDocument()
    expect(screen.queryByText(/광고 식별자/)).not.toBeInTheDocument()
  })

  it('[맞춤형 광고 받기]은 granted를 고른다', () => {
    const onChoose = vi.fn()
    render(<AdConsentSheet current="unknown" onChoose={onChoose} />)

    fireEvent.click(screen.getByRole('button', { name: AD_CONSENT_ALLOW }))

    expect(onChoose).toHaveBeenCalledWith('granted')
    expect(onChoose).toHaveBeenCalledTimes(1)
  })

  it('[일반 광고만 보기]는 denied를 고른다', () => {
    const onChoose = vi.fn()
    render(<AdConsentSheet current="unknown" onChoose={onChoose} />)

    fireEvent.click(screen.getByRole('button', { name: AD_CONSENT_DENY }))

    expect(onChoose).toHaveBeenCalledWith('denied')
  })

  it('첫 실행에는 선택 없이 닫는 길이 없다 — 버튼은 두 개뿐이고 배경을 눌러도 아무 일 없다', () => {
    const onChoose = vi.fn()
    const { container } = render(<AdConsentSheet current="unknown" onChoose={onChoose} />)

    expect(screen.getAllByRole('button')).toHaveLength(2)
    fireEvent.click(container.querySelector('.ad-consent-sheet')!)
    expect(onChoose).not.toHaveBeenCalled()
  })

  it('시트가 뜨면 초점이 시트 안(위 버튼)에 있다', () => {
    render(<AdConsentSheet current="unknown" onChoose={vi.fn()} />)

    expect(screen.getByRole('button', { name: AD_CONSENT_ALLOW })).toHaveFocus()
  })

  it('첫 실행(unknown)에는 지금 상태 줄이 없다', () => {
    render(<AdConsentSheet current="unknown" onChoose={vi.fn()} />)

    expect(screen.queryByText(AD_CONSENT_CURRENT.granted)).not.toBeInTheDocument()
    expect(screen.queryByText(AD_CONSENT_CURRENT.denied)).not.toBeInTheDocument()
  })

  it.each([
    ['granted', AD_CONSENT_CURRENT.granted],
    ['denied', AD_CONSENT_CURRENT.denied],
  ] as const)('다시 열면(%s) 지금 상태를 한 줄 알린다', (current, line) => {
    render(<AdConsentSheet current={current} onChoose={vi.fn()} />)

    expect(screen.getByText(line)).toBeInTheDocument()
  })

  it('방침 링크는 PrivacyNotice와 같은 길로 간다 — 앱 안에서는 네이티브가 연다', () => {
    const open = vi.fn()
    window.AccenturyBridge = fakeBridge({ openExternalUrl: open })
    render(<AdConsentSheet current="unknown" onChoose={vi.fn()} />)

    const link = screen.getByRole('link', { name: '개인정보처리방침' })
    expect(link).toHaveAttribute('href', DEFAULT_PRIVACY_POLICY_URL)
    const prevented = !fireEvent.click(link)

    expect(open).toHaveBeenCalledWith(DEFAULT_PRIVACY_POLICY_URL)
    expect(prevented).toBe(true)
  })

  it('두 버튼은 같은 보조 버튼이다 — 한쪽으로 기울이지 않는다 (KAN-288 HIG-A)', () => {
    render(<AdConsentSheet current="unknown" onChoose={vi.fn()} />)

    for (const name of [AD_CONSENT_ALLOW, AD_CONSENT_DENY]) {
      expect(screen.getByRole('button', { name })).toHaveClass('btn--secondary')
    }
  })

  it.each([
    ['admob', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', true],
    ['admob', 'Mozilla/5.0 (Linux; Android 15)', false],
    ['adsense', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', false],
  ] as const)('ATT 예고는 앱(%s)·iOS에서만 붙는다 (%s)', (vendor, userAgent, shown) => {
    const spy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
    render(<AdConsentSheet current="unknown" onChoose={vi.fn()} vendor={vendor} />)
    spy.mockRestore()

    expect(screen.queryByText(AD_CONSENT_IOS_ATT_NOTE) !== null).toBe(shown)
  })

  // App Store 5.1.1(iv) 재거절(빌드 15, 2026-11-09): ATT 앞 사전 안내에 「미리 거절」 선택지가 있으면 안 된다 (KAN-330·KAN-344)
  describe('iOS 앱은 설명 + [계속] 하나다', () => {
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'

    it('[계속] 하나뿐이고 누르면 granted를 보낸다 — 네이티브가 ATT로 맞춤형을 정한다', () => {
      const spy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
      const onChoose = vi.fn()
      render(<AdConsentSheet current="unknown" onChoose={onChoose} />)
      spy.mockRestore()

      expect(screen.getAllByRole('button')).toHaveLength(1)
      expect(screen.queryByRole('button', { name: AD_CONSENT_DENY })).toBeNull()
      const next = screen.getByRole('button', { name: AD_CONSENT_CONTINUE })
      expect(next).toHaveFocus()
      fireEvent.click(next)
      expect(onChoose).toHaveBeenCalledWith('granted')
      // 고지 4요소는 그대로 — 사업자·식별자·목적·거부 시 영향, 바꾸는 길은 iOS 추적 설정
      expect(screen.getByText(/Google AdMob/)).toBeInTheDocument()
      expect(screen.getByText(/추적 허용 창에서 허용하시면 기기의 광고 식별자/)).toBeInTheDocument()
      expect(screen.getByText(/일반 광고만 나와요/)).toBeInTheDocument()
      expect(screen.getByText(new RegExp(AD_CONSENT_CHANGE_HINT_IOS))).toBeInTheDocument()
    })

    it('다시 열어도 지금 상태 줄이 없다 — 맞춤형 여부는 ATT가 정한다', () => {
      const spy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
      render(<AdConsentSheet current="denied" onChoose={vi.fn()} />)
      spy.mockRestore()

      expect(screen.queryByText(AD_CONSENT_CURRENT.denied)).toBeNull()
      expect(screen.getAllByRole('button')).toHaveLength(1)
    })

    it.each([
      ['admob', 'Mozilla/5.0 (Linux; Android 15)'],
      ['adsense', IPHONE],
    ] as const)('%s · %s는 두 선택지 그대로다', (vendor, userAgent) => {
      const spy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
      render(<AdConsentSheet current="unknown" onChoose={vi.fn()} vendor={vendor} />)
      spy.mockRestore()

      expect(screen.getByRole('button', { name: AD_CONSENT_ALLOW })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: AD_CONSENT_DENY })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: AD_CONSENT_CONTINUE })).toBeNull()
    })
  })
})
