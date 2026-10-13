import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LearningKindScreen } from './LearningKindScreen'

describe('LearningKindScreen — 학습 종류 선택 L-1 (KAN-252)', () => {
  it('억양 학습이 강조 행, 단어 학습이 보통 행이고 뒤로 버튼은 없다', () => {
    render(<LearningKindScreen onIntonation={vi.fn()} onWords={vi.fn()} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2) // 뒤로는 네이티브 몫이다
    expect(buttons[0]).toHaveAccessibleName(/^억양 학습/)
    expect(buttons[0]).toHaveClass('word-set-row--recommended')
    expect(buttons[1]).toHaveAccessibleName(/^단어 학습/)
    expect(buttons[1]).not.toHaveClass('word-set-row--recommended')
  })

  it('각 행이 자기 콜백만 부른다', () => {
    const onIntonation = vi.fn()
    const onWords = vi.fn()
    render(<LearningKindScreen onIntonation={onIntonation} onWords={onWords} />)

    fireEvent.click(screen.getByRole('button', { name: /^억양 학습/ }))
    expect(onIntonation).toHaveBeenCalledTimes(1)
    expect(onWords).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^단어 학습/ }))
    expect(onWords).toHaveBeenCalledTimes(1)
    expect(onIntonation).toHaveBeenCalledTimes(1)
  })
})
