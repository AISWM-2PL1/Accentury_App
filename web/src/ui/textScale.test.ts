import { afterEach, describe, expect, it } from 'vitest'
import { syncLargeText } from './textScale'

afterEach(() => {
  document.documentElement.style.fontSize = ''
  document.documentElement.removeAttribute('data-large-text')
})

describe('syncLargeText — 루트 글자 크기로 큰 글자 표식을 단다 (KAN-313)', () => {
  it('16px이면 없고, 20px이면 있고, 16px로 돌리면 걷는다', () => {
    const root = document.documentElement
    root.style.fontSize = '16px'
    syncLargeText()
    expect(root.hasAttribute('data-large-text')).toBe(false)

    root.style.fontSize = '20px'
    syncLargeText()
    expect(root.hasAttribute('data-large-text')).toBe(true)

    root.style.fontSize = '16px'
    syncLargeText()
    expect(root.hasAttribute('data-large-text')).toBe(false)
  })
})
