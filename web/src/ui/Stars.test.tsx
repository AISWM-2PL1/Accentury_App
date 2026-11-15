import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Stars } from './Stars'

describe('Stars', () => {
  it('「별 3개 중 2개」 한 줄로 읽히고 별 하나하나는 읽히지 않는다', () => {
    const { container } = render(<Stars count={2} />)
    expect(screen.getByRole('img', { name: '별 3개 중 2개' })).toBeInTheDocument()
    const stars = container.querySelectorAll('.stars__star')
    expect(stars).toHaveLength(3)
    stars.forEach((star) => expect(star).toHaveAttribute('aria-hidden', 'true'))
  })

  it('앞에서부터 개수만큼 채운다 — 채운 별과 빈 별은 클래스로 갈린다', () => {
    const { container } = render(<Stars count={1} />)
    const filled = Array.from(container.querySelectorAll('.stars__star')).map((star) =>
      star.classList.contains('stars__star--filled'),
    )
    expect(filled).toEqual([true, false, false])
  })

  it('0개면 빈 별 셋이고, 범위를 넘는 값은 칸 수에 가둔다', () => {
    const { rerender } = render(<Stars count={0} />)
    expect(screen.getByRole('img', { name: '별 3개 중 0개' })).toBeInTheDocument()
    rerender(<Stars count={5} />)
    expect(screen.getByRole('img', { name: '별 3개 중 3개' })).toBeInTheDocument()
  })

  it('크기를 받는다', () => {
    const { container } = render(<Stars count={3} size={28} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '28')
  })
})
