import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AppRoot } from './AppRoot'

// 화면 내용이 아니라 루트의 재렌더만 본다 - App은 지금 쿼리만 그리게 갈아끼운다
vi.mock('./App', () => ({ default: () => <p>{window.location.search}</p> }))

afterEach(() => window.history.replaceState(null, '', '/'))

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
