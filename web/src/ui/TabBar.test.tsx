import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TabBar } from './TabBar'

afterEach(() => {
  delete window.AccenturyBridge
})

function withBridge(openSettings?: () => void) {
  window.AccenturyBridge = {
    requestMicPermission: vi.fn(),
    startVoiceItem: vi.fn(),
    getContractVersion: () => 2,
    ...(openSettings ? { openSettings } : {}),
  }
}

const tabNames = () =>
  within(screen.getByRole('navigation', { name: '주 메뉴' }))
    .getAllByRole('button')
    .map((b) => b.textContent)

describe('TabBar — 하단 탭 바 (KAN-252)', () => {
  it('순서는 홈 · 억양 학습 · 단어 학습 · 사투리 번역기 · 설정이고, 지금 탭만 aria-current="page"다', () => {
    withBridge(vi.fn())
    render(<TabBar current="words" onSelect={vi.fn()} />)
    expect(tabNames()).toEqual(['홈', '억양 학습', '단어 학습', '사투리 번역기', '설정'])
    expect(screen.getByRole('button', { name: '단어 학습' })).toHaveAttribute('aria-current', 'page')
    for (const name of ['홈', '억양 학습', '사투리 번역기', '설정']) {
      expect(screen.getByRole('button', { name })).not.toHaveAttribute('aria-current')
    }
  })

  it('current가 없으면(결과 화면) 아무 탭도 강조하지 않는다', () => {
    render(<TabBar onSelect={vi.fn()} />)
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(0)
  })

  it('탭을 누르면 그 탭 id로 onSelect, 설정은 onSelect가 아니라 브리지 openSettings다', () => {
    const openSettings = vi.fn()
    withBridge(openSettings)
    const onSelect = vi.fn()
    render(<TabBar current="home" onSelect={onSelect} />)
    for (const name of ['홈', '억양 학습', '단어 학습', '사투리 번역기']) fireEvent.click(screen.getByRole('button', { name }))
    expect(onSelect.mock.calls).toEqual([['home'], ['intonation'], ['words'], ['translate']])

    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledTimes(4)
  })

  it('canOpenSettings가 false면(메서드를 모르는 앱) 설정 탭을 그리지 않는다', () => {
    withBridge()
    render(<TabBar current="home" onSelect={vi.fn()} />)
    expect(tabNames()).toEqual(['홈', '억양 학습', '단어 학습', '사투리 번역기'])
  })
})
