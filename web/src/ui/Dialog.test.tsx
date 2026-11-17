import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('제목으로 이름 붙고 설명으로 서술되는 모달 대화상자다', () => {
    render(
      <Dialog
        title="번역하지 못했어요"
        description="잠시 뒤 다시 시도해 주세요"
        actions={<Button variant="secondary">닫기</Button>}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: '번역하지 못했어요' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('잠시 뒤 다시 시도해 주세요')
    expect(screen.getByRole('heading', { level: 2, name: '번역하지 못했어요' })).toHaveClass('dialog__title')
    expect(screen.getByRole('button', { name: '닫기' }).parentElement).toHaveClass('dialog__actions')
  })

  it('설명이 없으면 describedby를 달지 않는다', () => {
    render(<Dialog title="제목" actions={<Button>확인</Button>} />)
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby')
  })

  it('keydown을 부르는 쪽에 넘긴다 — Escape로 닫을지는 그쪽이 정한다', () => {
    const onKeyDown = vi.fn()
    render(<Dialog title="제목" actions={<Button>확인</Button>} onKeyDown={onKeyDown} />)
    fireEvent.keyDown(screen.getByRole('button', { name: '확인' }), { key: 'Escape' })
    expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }))
  })
})
