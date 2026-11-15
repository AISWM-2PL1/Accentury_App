import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import type { IntonationCourseSummary } from './intonationApi'
import { LEVELS_TIMEOUT_MS, buildTravel, celebrationFor, courseStarsChange, loadTravel, type LearningLevels } from './travel'
import type { WordSetSummary } from './wordApi'

/** 코스 1·2 × (단어 4 + 억양 5). done에 든 id는 completed, 별 필드는 withStars일 때만 */
function lists(done: string[] = [], withStars = false) {
  const words: WordSetSummary[] = [1, 2, 3, 4, 5, 6, 7, 8].map((seq) => ({
    setId: `w${seq}`, seq, level: seq <= 4 ? 1 : 2, category: '', title: `코스 단어 ${seq}`, cardCount: 3, itemCount: 3,
    completed: done.includes(`w${seq}`),
    ...(withStars ? { score: done.includes(`w${seq}`) ? 67 : null, stars: done.includes(`w${seq}`) ? 2 : 0 } : {}),
  }))
  const intonations: IntonationCourseSummary[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seq) => ({
    courseId: `k${seq}`, seq, level: seq <= 5 ? 1 : 2, topic: null, title: `코스 억양 ${seq}`, cardCount: 3,
    completedCardCount: 0, completed: done.includes(`k${seq}`), recommended: false,
    ...(withStars ? { score: done.includes(`k${seq}`) ? 80 : null, stars: done.includes(`k${seq}`) ? 3 : 0 } : {}),
  }))
  return { words, intonations }
}

function levels(course1Stars: number, unlocked2: boolean, completed1 = 0): LearningLevels {
  return {
    totalStars: course1Stars,
    starThresholds: [30, 70],
    levels: [
      { level: 1, setCount: 9, completedSetCount: completed1, collectedStars: course1Stars, requiredStars: 21, unlocked: true },
      { level: 2, setCount: 9, completedSetCount: 0, collectedStars: 0, requiredStars: 21, unlocked: unlocked2 },
    ],
  }
}

const COURSE1 = ['w1', 'k1', 'w2', 'k2', 'w3', 'k3', 'w4', 'k4', 'k5']

describe('사투리 여행 진행 모델 (KAN-347 3-3·3-4)', () => {
  it('코스마다 스탬프 9개를 단어 1 · 억양 1 · … · 억양 4 · 억양 5 순서로, 순번 1~9를 붙인다', () => {
    const { words, intonations } = lists()
    const travel = buildTravel(words, intonations, null)
    expect(travel.courses.map((c) => c.course)).toEqual([1, 2])
    expect(travel.courses[0].stamps.map((s) => s.id)).toEqual(COURSE1)
    expect(travel.courses[0].stamps.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('순차 잠금: 완료 = done, 완료하지 않은 첫 스탬프 = current, 그 뒤 = locked. 지금 스탬프는 그 하나다', () => {
    const { words, intonations } = lists(['w1', 'k1'])
    const travel = buildTravel(words, intonations, null)
    expect(travel.courses[0].stamps.slice(0, 4).map((s) => s.state)).toEqual(['done', 'done', 'current', 'locked'])
    expect(travel.current).toMatchObject({ kind: 'word', id: 'w2', course: 1, n: 2, order: 3 })
    expect(travel.courses[0].completedCount).toBe(2)
  })

  it('KAN-359 전(구간 요약 없음): 별·잠금 없이 모든 코스가 열리고, 완료는 completed대로다', () => {
    const { words, intonations } = lists(COURSE1)
    const travel = buildTravel(words, intonations, null)
    expect(travel.stars).toBeNull()
    expect(travel.completedSetCount).toBeNull()
    expect(travel.courses.every((c) => c.unlocked && c.stars === null)).toBe(true)
    expect(travel.courses.flatMap((c) => c.stamps).every((s) => s.stars === null && s.score === null)).toBe(true)
    // 1코스 완주 → 다음 지금 스탬프는 2코스 첫 스탬프 (별 기준 잠금이 없다)
    expect(travel.current).toMatchObject({ id: 'w5', course: 2, order: 1 })
  })

  it('KAN-359 있으면 서버 별·열림을 그대로 쓴다 — 별이 모자라 잠긴 코스는 지금 스탬프가 없다', () => {
    const { words, intonations } = lists(COURSE1, true)
    const travel = buildTravel(words, intonations, levels(19, false, 9))
    expect(travel.stars).toEqual({ total: 19, goal: 42 })
    expect(travel.completedSetCount).toBe(9)
    expect(travel.courses[0].stars).toEqual({ collected: 19, required: 21 })
    expect(travel.courses[1].unlocked).toBe(false)
    expect(travel.courses[1].stamps.every((s) => s.state === 'locked')).toBe(true)
    expect(travel.current).toBeNull()
    expect(travel.courses[0].stamps[0]).toMatchObject({ score: 67, stars: 2 })
    expect(travel.courses[0].stamps[1]).toMatchObject({ score: 80, stars: 3 })
  })

  it('목록에 별 필드가 있어도 구간 요약이 없으면 별을 그리지 않는다 (KAN-359 판정은 요약 하나)', () => {
    const { words, intonations } = lists(['w1'], true)
    const travel = buildTravel(words, intonations, null)
    expect(travel.courses[0].stamps[0]).toMatchObject({ completed: true, stars: null, score: null })
  })
})

describe('지도 복귀 움직임 (움직임 타일 1·5)', () => {
  const travel = (done: string[], lv: LearningLevels | null) => {
    const { words, intonations } = lists(done, lv !== null)
    return buildTravel(words, intonations, lv)
  }

  it('방금 마친 스탬프가 이번에 처음 완료됐으면 카드 도장', () => {
    expect(celebrationFor(travel(['w1'], null), travel(['w1', 'k1'], null), { kind: 'intonation', id: 'k1' })).toEqual({
      stamp: true, passport: null, unlocked: null,
    })
  })

  it('완료가 안 됐거나(분석 실패·도중 ✕) 이미 완료였던 재도전이면 아무것도 돌지 않는다', () => {
    expect(celebrationFor(travel(['w1'], null), travel(['w1'], null), { kind: 'intonation', id: 'k1' })).toBeNull()
    expect(celebrationFor(travel(['w1'], null), travel(['w1'], null), { kind: 'word', id: 'w1' })).toBeNull()
  })

  it('9개를 채우면 카드 도장 대신 여권 페이지 — 별이 21개 미만이면 자물쇠는 열리지 않는다', () => {
    const before = travel(COURSE1.slice(0, 8), levels(17, false, 8))
    const after = travel(COURSE1, levels(19, false, 9))
    expect(celebrationFor(before, after, { kind: 'intonation', id: 'k5' })).toEqual({ stamp: false, passport: 1, unlocked: null })
  })

  it('별이 21개에 닿으면 다음 코스 칩이 열리고, 같은 때 완주했으면 여권 페이지도 같이 (순서는 화면 몫)', () => {
    const before = travel(COURSE1.slice(0, 8), levels(19, false, 8))
    const after = travel(COURSE1, levels(22, true, 9))
    expect(celebrationFor(before, after, { kind: 'intonation', id: 'k5' })).toEqual({ stamp: false, passport: 1, unlocked: 2 })
  })

  it('완주 전이라도 별이 닿으면 도장 + 자물쇠', () => {
    const before = travel(COURSE1.slice(0, 7), levels(20, false, 7))
    const after = travel(COURSE1.slice(0, 8), levels(23, true, 8))
    expect(celebrationFor(before, after, { kind: 'intonation', id: 'k4' })).toEqual({ stamp: true, passport: null, unlocked: 2 })
  })
})

describe('loadTravel', () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
  const fail = (status: number) =>
    ({ ok: false, status, json: async () => ({ code: 'NOT_FOUND', message: '없음', retryable: false }) }) as unknown as Response

  function fetchWith(levelsReply: Response) {
    const { words, intonations } = lists(['w1'], true)
    return vi.fn<FetchLike>(async (url) => {
      const path = new URL(String(url)).pathname
      if (path === '/v0/learning/word-sets') return ok({ contentVersion: 'v', sets: words })
      if (path === '/v0/learning/intonation-courses') return ok({ contentVersion: 'v', courses: intonations })
      if (path === '/v0/learning/levels') return levelsReply
      throw new Error(path)
    })
  }
  const deps = (fetchImpl: FetchLike) => ({ fetchImpl, getToken: () => 'acc', refreshToken: async () => false })

  it('구간 요약이 404(KAN-359 배포 전)면 별 없는 지도로 선다', async () => {
    const travel = await loadTravel('http://api', deps(fetchWith(fail(404))))
    expect(travel.stars).toBeNull()
    expect(travel.courses[0].stamps[0]).toMatchObject({ completed: true, stars: null })
  })

  it('구간 요약이 있으면 서버 값을 그대로 싣는다', async () => {
    const travel = await loadTravel('http://api', deps(fetchWith(ok(levels(2, false, 1)))))
    expect(travel.stars).toEqual({ total: 2, goal: 42 })
    expect(travel.courses[0].stamps[0]).toMatchObject({ stars: 2, score: 67 })
    expect(travel.courses[1].unlocked).toBe(false)
  })

  it('구간 요약이 응답 없이 걸려도 제한 시간(3초) 뒤 별 없는 지도로 선다', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = fetchWith(ok({}))
      const hang: FetchLike = (url, init) =>
        new URL(String(url)).pathname === '/v0/learning/levels' ? new Promise(() => {}) : fetchImpl(url, init)
      let travel: Awaited<ReturnType<typeof loadTravel>> | undefined
      void loadTravel('http://api', deps(hang)).then((t) => (travel = t))
      await vi.advanceTimersByTimeAsync(LEVELS_TIMEOUT_MS - 1)
      expect(travel).toBeUndefined()
      await vi.advanceTimersByTimeAsync(1)
      expect(travel?.stars).toBeNull()
      expect(travel?.courses[0].stamps[0]).toMatchObject({ completed: true, stars: null })
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('구간 요약이 제때 오면 제한 시간 타이머를 남기지 않는다', async () => {
    vi.useFakeTimers()
    try {
      await loadTravel('http://api', deps(fetchWith(ok(levels(2, false, 1)))))
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('구간 요약 모양이 계약과 다르면 없는 것으로 친다', async () => {
    const travel = await loadTravel('http://api', deps(fetchWith(ok({ totalStars: '2' }))))
    expect(travel.stars).toBeNull()
  })
})

describe('courseStarsChange — 성적표 「코스 별」 (4-4)', () => {
  const levels = (c1: number, withNext = true): LearningLevels => ({
    totalStars: c1,
    starThresholds: [30, 70],
    levels: [
      { level: 1, setCount: 9, completedSetCount: 3, collectedStars: c1, requiredStars: 21, unlocked: true },
      ...(withNext ? [{ level: 2, setCount: 9, completedSetCount: 0, collectedStars: 0, requiredStars: 21, unlocked: c1 >= 21 }] : []),
    ],
  })

  it('전 값은 들어가기 전 코스 별, 뒤 값·필요 별은 다시 받은 구간 요약이다', () => {
    expect(courseStarsChange(1, { collected: 5 }, levels(7))).toEqual({ course: 1, before: 5, after: 7, required: 21, unlocked: null })
  })

  it('필요 별에 처음 닿으면 다음 코스 번호, 이미 넘겼거나 다음 코스가 없으면 null', () => {
    expect(courseStarsChange(1, { collected: 20 }, levels(21))?.unlocked).toBe(2)
    expect(courseStarsChange(1, { collected: 21 }, levels(23))?.unlocked).toBeNull()
    expect(courseStarsChange(1, { collected: 20 }, levels(21, false))?.unlocked).toBeNull()
  })

  it('KAN-359 전(전 값 없음·요약 없음·그 구간 없음)이면 null — 줄을 숨긴다', () => {
    expect(courseStarsChange(1, null, levels(7))).toBeNull()
    expect(courseStarsChange(1, { collected: 5 }, null)).toBeNull()
    expect(courseStarsChange(3, { collected: 5 }, levels(7))).toBeNull()
  })
})
