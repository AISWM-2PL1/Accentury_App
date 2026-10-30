import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IntonationCurveLoop } from './IntonationCurveLoop'

describe('IntonationCurveLoop (KAN-302)', () => {
  it('장식 svg 하나에 가이드·선 path 둘과 점 하나를 그리고, 점은 선과 같은 곡선을 따라간다', () => {
    const { container } = render(<IntonationCurveLoop />)

    const svg = container.querySelector('svg.intonation-curve')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg!.querySelectorAll('path')).toHaveLength(2)
    expect(svg!.querySelectorAll('circle')).toHaveLength(1)

    const line = svg!.querySelector('.intonation-curve__line')!
    expect(line).toHaveAttribute('pathLength', '100')

    // 점의 offset-path가 선의 d와 어긋나면 점이 선을 벗어난다 — 같은 상수를 쓰는지 본다
    const dot = svg!.querySelector<SVGCircleElement>('.intonation-curve__dot')!
    expect(dot.getAttribute('style')).toContain(`path("${line.getAttribute('d')}")`)
  })
})
