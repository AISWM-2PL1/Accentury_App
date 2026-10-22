import { afterEach, describe, expect, it, vi } from 'vitest'
import { installAccenturyNavigate, spaNavigate } from './spaNavigate'

const BRIDGE_BASE = { requestMicPermission: vi.fn(), startVoiceItem: vi.fn(), getContractVersion: () => 2 }

function stubLocation() {
  const replace = vi.fn()
  const location = { ...window.location, replace, href: window.location.href }
  vi.stubGlobal('location', location)
  return location
}

describe('spaNavigate (KAN-290)', () => {
  afterEach(() => {
    delete window.AccenturyBridge
    delete window.accenturyNavigate
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('브리지에 onLocationChanged가 있으면 pushState로 옮기고 새 href를 통지한다 - 문서는 옮기지 않는다', () => {
    const onLocationChanged = vi.fn()
    window.AccenturyBridge = { ...BRIDGE_BASE, onLocationChanged }
    const push = vi.spyOn(window.history, 'pushState')
    const navigated = vi.fn()
    window.addEventListener('accentury:navigate', navigated)

    spaNavigate('/?screen=home')

    expect(push).toHaveBeenCalledWith(null, '', '/?screen=home')
    expect(window.location.search).toBe('?screen=home')
    expect(onLocationChanged).toHaveBeenCalledWith(window.location.href)
    expect(navigated).toHaveBeenCalledTimes(1)
    window.removeEventListener('accentury:navigate', navigated)
  })

  it('브리지가 onLocationChanged를 모르면(구버전 앱) 문서를 옮긴다', () => {
    window.AccenturyBridge = { ...BRIDGE_BASE }
    const location = stubLocation()
    const push = vi.spyOn(window.history, 'pushState')

    spaNavigate('/?screen=home')
    expect(location.href).toBe('/?screen=home')
    spaNavigate('/?screen=result', { replace: true })
    expect(location.replace).toHaveBeenCalledWith('/?screen=result')
    expect(push).not.toHaveBeenCalled()
  })

  it('브리지가 없으면(브라우저 단독) pushState로 옮긴다', () => {
    const push = vi.spyOn(window.history, 'pushState')
    spaNavigate('/?screen=translate')
    expect(push).toHaveBeenCalledWith(null, '', '/?screen=translate')
    expect(window.location.search).toBe('?screen=translate')
  })

  it('replace면 replaceState로 지금 항목을 덮어쓴다', () => {
    window.AccenturyBridge = { ...BRIDGE_BASE, onLocationChanged: vi.fn() }
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')
    spaNavigate('/?screen=result', { replace: true })
    expect(replace).toHaveBeenCalledWith(null, '', '/?screen=result')
    expect(push).not.toHaveBeenCalled()
  })

  it('window.accenturyNavigate는 받은 URL로 옮기고 true를 돌려준다', () => {
    installAccenturyNavigate(spaNavigate)
    expect(window.accenturyNavigate?.('/?screen=words')).toBe(true)
    expect(window.location.search).toBe('?screen=words')
  })
})
