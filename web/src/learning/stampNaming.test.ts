import { describe, expect, it } from 'vitest'
import { courseStamps, findStamp, stampName } from './stampNaming'

const words = [1, 2, 3, 4, 5].map((seq) => ({ id: `ws-${seq}`, level: seq <= 4 ? 1 : 2, seq }))
const intonations = [1, 2, 3, 4, 5, 6].map((seq) => ({ id: `ic-${seq}`, level: seq <= 5 ? 1 : 2, seq }))

describe('스탬프 이름·순서 (KAN-347 3-2)', () => {
  it('이름은 「단어 학습 n」「억양 학습 n」, 번호를 모르면 종류만', () => {
    expect(stampName('word', 2)).toBe('단어 학습 2')
    expect(stampName('intonation', 5)).toBe('억양 학습 5')
    expect(stampName('word')).toBe('단어 학습')
  })

  it('코스 안 순서는 단어 1 · 억양 1 · … · 단어 4 · 억양 4 · 억양 5', () => {
    const course1 = courseStamps(words, intonations).get(1)!
    expect(course1.map((s) => stampName(s.kind, s.n))).toEqual([
      '단어 학습 1', '억양 학습 1', '단어 학습 2', '억양 학습 2', '단어 학습 3', '억양 학습 3', '단어 학습 4', '억양 학습 4', '억양 학습 5',
    ])
  })

  it('n은 코스(level) 안에서 다시 1부터, 목록 순서가 섞여도 seq로 센다', () => {
    const courses = courseStamps([...words].reverse(), [...intonations].reverse())
    expect(findStamp(courses, 'word', 'ws-5')).toEqual({ kind: 'word', id: 'ws-5', course: 2, n: 1 })
    expect(findStamp(courses, 'intonation', 'ic-6')).toEqual({ kind: 'intonation', id: 'ic-6', course: 2, n: 1 })
    expect(findStamp(courses, 'word', 'ws-3')?.n).toBe(3)
    expect([...courses.keys()]).toEqual([1, 2])
  })

  it('종류가 다르거나 없는 id는 찾지 않는다', () => {
    const courses = courseStamps(words, intonations)
    expect(findStamp(courses, 'intonation', 'ws-1')).toBeUndefined()
    expect(findStamp(courses, 'word', 'ws-old')).toBeUndefined()
  })
})
