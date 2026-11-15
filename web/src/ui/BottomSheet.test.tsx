import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'

describe('BottomSheet', () => {
  it('막 안의 종이 한 장이 제목으로 이름 붙은 모달 대화상자다', () => {
    const { container } = render(
      <BottomSheet labelledBy="t" overlayClassName="ad-consent-sheet" className="ad-consent-panel">
        <h2 id="t">맞춤형 광고 안내</h2>
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog', { name: '맞춤형 광고 안내' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // 시트마다 붙여 온 이름(스모크 구동기·E2E 헬퍼가 본다)이 공용 이름과 함께 남는다
    expect(dialog).toHaveClass('sheet__panel', 'ad-consent-panel')
    expect(container.firstElementChild).toHaveClass('sheet', 'ad-consent-sheet')
  })

  it('as="form"이면 패널이 폼이고 제출을 받는다', () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    render(
      <BottomSheet as="form" labelledBy="t" noValidate onSubmit={onSubmit}>
        <h2 id="t">후기</h2>
        <button type="submit">보내기</button>
      </BottomSheet>,
    )
    const dialog = screen.getByRole('dialog', { name: '후기' })
    expect(dialog.tagName).toBe('FORM')
    expect(dialog).toHaveAttribute('novalidate')
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('막의 click·keydown을 부르는 쪽에 넘긴다 — 닫는 길은 시트마다 다르다', () => {
    const onOverlayClick = vi.fn()
    const onOverlayKeyDown = vi.fn()
    const { container } = render(
      <BottomSheet labelledBy="t" onOverlayClick={onOverlayClick} onOverlayKeyDown={onOverlayKeyDown}>
        <h2 id="t">제목</h2>
      </BottomSheet>,
    )
    fireEvent.click(container.firstElementChild!)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onOverlayClick).toHaveBeenCalledTimes(1)
    expect(onOverlayKeyDown).toHaveBeenCalledTimes(1)
  })
})
