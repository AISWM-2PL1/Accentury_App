/**
 * 객관식 선택지 목록 (KAN-255에서 VocabularyItemScreen으로부터 꺼냄).
 * 화면 단위 동작(제출·잠금 수명)은 VocabularyItemScreen.test.tsx가 계속 본다 — 여기는 목록 계약만.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChoiceList } from './index'

const choices = [
  { choiceId: 'c', text: '쑥갓' },
  { choiceId: 'a', text: '부추' },
  { choiceId: 'b', text: '미나리' },
]

function renderList(props: { selected?: string | null; locked?: boolean; marks?: Record<string, 'correct' | 'wrong'> } = {}) {
  const onSelect = vi.fn<(choiceId: string) => void>()
  render(
    <>
      <h1 id="q">문제</h1>
      <ChoiceList
        name="n"
        labelledBy="q"
        choices={choices}
        selected={props.selected ?? null}
        locked={props.locked ?? false}
        onSelect={onSelect}
        marks={props.marks}
      />
    </>,
  )
  return onSelect
}

describe('ChoiceList', () => {
  it('labelledBy 요소를 이름으로 갖는 radiogroup에 받은 순서 그대로 그린다', () => {
    renderList()
    const group = screen.getByRole('radiogroup', { name: '문제' })
    expect(group).toHaveAttribute('aria-labelledby', 'q')
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(['쑥갓', '부추', '미나리'])
  })

  it('고르면 onSelect에 choiceId를 넘긴다', () => {
    const onSelect = renderList()
    fireEvent.click(screen.getByRole('radio', { name: '부추' }))
    expect(onSelect).toHaveBeenCalledWith('a')
  })

  it('선택된 것만 checked·choice--selected·체크 아이콘을 갖는다', () => {
    renderList({ selected: 'a' })
    const picked = screen.getByRole('radio', { name: '부추' })
    expect(picked).toBeChecked()
    expect(picked.closest('label')).toHaveClass('choice', 'choice--selected')
    expect(document.querySelectorAll('.choice__check')).toHaveLength(1)
    expect(picked.closest('label')?.querySelector('.choice__check svg')).not.toBeNull()
  })

  it('locked면 라디오가 전부 disabled이고 choice--locked가 붙는다', () => {
    renderList({ locked: true })
    screen.getAllByRole('radio').forEach((r) => {
      expect(r).toBeDisabled()
      expect(r.closest('label')).toHaveClass('choice--locked')
    })
  })

  it('marks가 없으면 정오 클래스·표시가 없다 (레벨테스트 DOM 그대로)', () => {
    renderList({ selected: 'a', locked: true })
    expect(document.querySelector('[class*="correct"], [class*="wrong"], .choice__mark')).toBeNull()
  })

  it('marks가 있으면 정답·내 답을 서로 다른 아이콘과 글자로 표시하고 체크 표시를 대신한다 (KAN-255 W-4)', () => {
    renderList({ selected: 'a', locked: true, marks: { c: 'correct', a: 'wrong' } })
    const correct = screen.getByRole('radio', { name: /쑥갓/ }).closest('label')!
    const wrong = screen.getByRole('radio', { name: /부추/ }).closest('label')!
    expect(correct).toHaveClass('choice--correct')
    expect(correct).toHaveTextContent('정답')
    expect(wrong).toHaveClass('choice--wrong', 'choice--selected')
    expect(wrong).toHaveTextContent('내 답')
    const shape = (label: Element) => label.querySelector('.choice__mark svg path')?.getAttribute('d')
    expect(shape(correct)).not.toEqual(shape(wrong))
    expect(document.querySelectorAll('.choice__check')).toHaveLength(0)
    expect(screen.getByRole('radio', { name: '미나리' }).closest('label')?.querySelector('.choice__mark')).toBeNull()
  })
})
