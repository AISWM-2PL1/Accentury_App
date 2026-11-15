import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as icons from './icons'

/** 선 아이콘 한 벌 (KAN-347). 옛 그림 다섯(viewBox 20·48)은 규격이 달라 뺀다 */
const OLD = new Set(['CheckIcon', 'CrossIcon', 'CheckSmallIcon', 'ShareIcon', 'SwapIcon', 'MicIcon'])

describe('선 아이콘', () => {
  const lineIcons = Object.entries(icons).filter(([name]) => !OLD.has(name))

  it.each(lineIcons)('%s 는 viewBox 24 · 획 1.5 · currentColor · 읽히지 않는 그림이다', (_, Icon) => {
    const { container } = render(<Icon />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('stroke-width', '1.5')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '20')
    expect(svg.querySelector('path')!.getAttribute('d')).not.toBe('')
  })

  it('크기를 받는다', () => {
    const { container } = render(<icons.CalendarIcon size={16} />)
    expect(container.querySelector('svg')).toHaveAttribute('height', '16')
  })
})
