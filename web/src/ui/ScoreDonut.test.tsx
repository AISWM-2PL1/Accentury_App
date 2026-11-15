import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScoreDonut } from './ScoreDonut'

/** 동작 줄이기 설정을 흉내 낸다. jsdom에는 matchMedia가 없다 */
function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function dashOffset(container: HTMLElement): number {
  return Number(container.querySelector('.score-donut__value')!.getAttribute('stroke-dashoffset'))
}

describe('ScoreDonut', () => {
  it('가운데 「N점」과 스크린 리더 이름을 그린다 — 레벨 테스트 결과 마크업 그대로', () => {
    const { container } = render(<ScoreDonut score={72} label="종합 점수" />)
    expect(screen.getByText('72점')).toHaveClass('type-headline', 'score-donut__score')
    expect(screen.getByText('종합 점수')).toHaveClass('sr-only')
    // r 54 원 둘레의 28%가 남는다
    expect(dashOffset(container)).toBeCloseTo(2 * Math.PI * 54 * 0.28, 3)
    // 크기를 주지 않으면 결과 화면 기본(96)이라 인라인 크기가 없다
    expect(container.querySelector('.score-donut')).not.toHaveAttribute('style')
  })

  it('원호는 0~100으로 가두고 숫자는 받은 그대로 둔다', () => {
    const { container } = render(<ScoreDonut score={130} />)
    expect(dashOffset(container)).toBe(0)
    expect(screen.getByText('130점')).toBeInTheDocument()
  })

  it('size를 주면 크기·배율 변수만 바뀐다', () => {
    const { container } = render(<ScoreDonut score={50} size={144} />)
    const style = (container.querySelector('.score-donut') as HTMLElement).style
    expect(style.getPropertyValue('--score-donut-size')).toBe('144px')
    expect(style.getPropertyValue('--score-donut-scale')).toBe('1.5')
  })

  it('count-up은 0점에서 시작해 600ms 뒤 끝 값에 닿는다', () => {
    mockReducedMotion(false)
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const { container } = render(<ScoreDonut score={80} countUp />)
    expect(container.querySelector('.score-donut__score')).toHaveTextContent('0점')
    // 도는 숫자는 읽히지 않고 끝 값 한 줄만 읽힌다
    expect(container.querySelector('.score-donut__score')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('80점')).toHaveClass('sr-only')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    const mid = Number(container.querySelector('.score-donut__score')!.textContent!.replace('점', ''))
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(80)

    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(container.querySelector('.score-donut__score')).toHaveTextContent('80점')
    expect(dashOffset(container)).toBeCloseTo(2 * Math.PI * 54 * 0.2, 3)
  })

  it('동작 줄이기면 count-up이 끝 값으로 바로 그린다', () => {
    mockReducedMotion(true)
    const { container } = render(<ScoreDonut score={80} countUp />)
    expect(container.querySelector('.score-donut__score')).toHaveTextContent('80점')
  })
})
