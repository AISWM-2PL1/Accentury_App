import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AppRoot } from './AppRoot'
import { REQUIRED_BRIDGE_VERSION } from './bridge/bridge'

// 기본은 화면 내용이 아니라 루트의 재렌더만 본다 - App은 지금 쿼리만 그리게 갈아끼운다. 재열기 테스트만 실물 App을 쓴다
const mode = vi.hoisted(() => ({ real: false }))
vi.mock('./App', async (importActual) => {
  const actual = await importActual<typeof import('./App')>()
  return {
    default: (props: Parameters<typeof actual.default>[0]) =>
      mode.real ? <actual.default {...props} /> : <p>{window.location.search}</p>,
  }
})

afterEach(() => {
  mode.real = false
  delete window.AccenturyBridge
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

it('pushState 뒤 popstate·accentury:navigate가 오면 새 쿼리로 다시 그린다 (KAN-290)', () => {
  window.history.replaceState(null, '', '/?screen=home')
  render(<AppRoot />)
  expect(screen.getByText('?screen=home')).toBeInTheDocument()

  act(() => {
    window.history.pushState(null, '', '/?screen=translate')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  expect(screen.getByText('?screen=translate')).toBeInTheDocument()

  act(() => {
    window.accenturyNavigate?.('/?screen=words')
  })
  expect(screen.getByText('?screen=words')).toBeInTheDocument()
})

it('설정 행 재열기는 replaceState로 플래그를 걷은 뒤 같은 URL로 다시 와도 시트를 또 연다 (KAN-315 실기기 회귀)', () => {
  mode.real = true
  const onLocationChanged = vi.fn()
  window.AccenturyBridge = {
    requestMicPermission: vi.fn(),
    startVoiceItem: vi.fn(),
    getContractVersion: () => REQUIRED_BRIDGE_VERSION,
    getAccessToken: () => 'acc',
    getAdConsent: () => 'granted',
    setAdConsent: vi.fn(),
    onLocationChanged,
  }
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
  const url = `/?bridge=${REQUIRED_BRIDGE_VERSION}&app=1.0&screen=home&adConsent=open`
  const dialog = () => screen.queryByRole('dialog', { name: '맞춤형 광고 안내' })
  window.history.replaceState(null, '', `/?bridge=${REQUIRED_BRIDGE_VERSION}&app=1.0&screen=home`)
  render(<AppRoot />)
  expect(dialog()).toBeNull()

  act(() => {
    window.accenturyNavigate?.(url)
  })
  expect(dialog()).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '일반 광고만 보기' }))
  expect(dialog()).toBeNull()
  expect(new URLSearchParams(window.location.search).get('adConsent')).toBeNull()
  // 네이티브의 현재 URL 기록도 플래그 없는 값으로 맞춘다
  expect(onLocationChanged).toHaveBeenLastCalledWith(window.location.href)

  act(() => {
    window.accenturyNavigate?.(url)
  })
  expect(dialog()).toBeInTheDocument()
})
