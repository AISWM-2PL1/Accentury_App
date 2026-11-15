/**
 * 학습 탭 「사투리 여행」 (KAN-347 3단계) — 지도·코스 지도·탭 안 상태·스탬프 들어가고 나오기·움직임 클래스·홈 이어가기 카드.
 * 진행 모델의 규칙 자체는 `travel.test.ts`가 본다. 여기서는 그 값이 화면에 어떻게 서는지와 화면 사이의 길을 본다.
 */

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import { ContinueCard, TravelRoute } from './TravelScreens'
import type { LearningLevels } from './travel'
import type { WordApiDeps } from './wordApi'

type Reply = { status: number; body: unknown } | 'network'
const ok = (body: unknown): Reply => ({ status: 200, body })
const fail = (status: number, code: string, retryable = false): Reply => ({
  status,
  body: { code, message: '실패', retryable, retryAfterMs: null, correlationId: 'c' },
})

/** 코스 1·2 × (단어 4 + 억양 5). done에 든 id는 completed, 별 필드는 withStars일 때만 */
function lists(done: string[], withStars: boolean) {
  const words = [1, 2, 3, 4, 5, 6, 7, 8].map((seq) => ({
    setId: `w${seq}`, seq, level: seq <= 4 ? 1 : 2, category: '', title: `서버 제목 단어 ${seq}`, cardCount: 3, itemCount: 3,
    completed: done.includes(`w${seq}`),
    ...(withStars ? { score: done.includes(`w${seq}`) ? 67 : null, stars: done.includes(`w${seq}`) ? 2 : 0 } : {}),
  }))
  const courses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seq) => ({
    courseId: `k${seq}`, seq, level: seq <= 5 ? 1 : 2, topic: null, title: `서버 제목 억양 ${seq}`, cardCount: 3,
    completedCardCount: 0, completed: done.includes(`k${seq}`), recommended: false,
    ...(withStars ? { score: done.includes(`k${seq}`) ? 80 : null, stars: done.includes(`k${seq}`) ? 3 : 0 } : {}),
  }))
  return { words: ok({ contentVersion: 'v', sets: words }), courses: ok({ contentVersion: 'v', courses }) }
}

function levels(stars1: number, unlocked2: boolean, done1: number): Reply {
  const body: LearningLevels = {
    totalStars: stars1,
    starThresholds: [30, 70],
    levels: [
      { level: 1, setCount: 9, completedSetCount: done1, collectedStars: stars1, requiredStars: 21, unlocked: true },
      { level: 2, setCount: 9, completedSetCount: 0, collectedStars: 0, requiredStars: 21, unlocked: unlocked2 },
    ],
  }
  return ok(body)
}

const WORD_SET = (setId: string) =>
  ok({ contentVersion: 'v', setId, seq: 1, level: 1, category: '', title: '', cards: [{ cardId: 'c1', standard: '부추', dialect: '정구지' }], items: [] })

/** 경로로 응답을 고른다. 값이 배열이면 부를 때마다 앞에서 하나씩 꺼낸다(마지막은 남긴다) */
function fakeServer(routes: Record<string, Reply | Reply[]>) {
  const calls: string[] = []
  const fetchImpl: FetchLike = async (input) => {
    const path = new URL(input).pathname
    calls.push(path)
    const entry = routes[path] ?? fail(404, 'NOT_FOUND')
    const reply = Array.isArray(entry) ? (entry.length > 1 ? entry.shift()! : entry[0]) : entry
    if (reply === 'network') throw new TypeError('Failed to fetch')
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body } as Response
  }
  return { fetchImpl, calls }
}

const deps = (fetchImpl: FetchLike, token: string | null = 'acc'): WordApiDeps => ({
  fetchImpl,
  getToken: () => token,
  refreshToken: async () => false,
})

function renderRoute(routes: Record<string, Reply | Reply[]>, props: { resume?: boolean; token?: string | null } = {}) {
  const server = fakeServer(routes)
  const onResumeConsumed = vi.fn()
  render(
    <TravelRoute
      apiBase="http://api"
      tabBar={<nav aria-label="탭 바" />}
      resume={props.resume}
      onResumeConsumed={onResumeConsumed}
      deps={deps(server.fetchImpl, props.token === undefined ? 'acc' : props.token)}
    />,
  )
  return { ...server, onResumeConsumed }
}

const routesOf = (done: string[], level: Reply | null) => {
  const { words, courses } = lists(done, level !== null)
  return {
    '/v0/learning/word-sets': words,
    '/v0/learning/intonation-courses': courses,
    ...(level === null ? {} : { '/v0/learning/levels': level }),
  } as Record<string, Reply | Reply[]>
}

const tabBar = () => screen.queryByRole('navigation', { name: '탭 바' })
const mapHeading = () => screen.findByRole('heading', { level: 1, name: '사투리 여행' })

afterEach(() => {
  delete window.AccenturyBridge
})

describe('사투리 여행 지도 (s-11)', () => {
  it('KAN-359 전: 5코스 칩·출처·지금 코스 카드·메모가 서고 별·잠금은 없다, 모든 코스 구역이 열려 있다', async () => {
    renderRoute(routesOf(['w1', 'k1'], null))
    await mapHeading()
    expect(screen.getByText('행정구역 경계: 통계청 SGIS(2013)')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('지도는 얼마나 배웠는지 표시예요')
    expect(screen.getByRole('img', { name: '1코스' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '2코스' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /잠김|별/ })).toBeNull()
    expect(screen.getByRole('button', { name: '1코스 · 진행 중' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2코스 · 열림' })).toBeInTheDocument()
    expect(document.querySelector('.lock')).toBeNull()

    const card = screen.getByRole('region', { name: '지금 코스' })
    expect(card).toHaveTextContent('1코스 2 / 9')
    expect(within(card).getByRole('progressbar', { name: '1코스 스탬프 9개 중 2개' })).toHaveAttribute('aria-valuenow', '2')
    expect(within(card).getByRole('heading', { level: 2, name: '단어 학습 2' })).toBeInTheDocument()
    expect(card).toHaveTextContent('3번째 스탬프')
    expect(card).toHaveTextContent('약 1분')
    expect(card).not.toHaveTextContent('난이도')
    expect(tabBar()).not.toBeNull()
  })

  it('KAN-359 있으면 별 합계·막대, 코스 칩 별, 잠긴 코스 자물쇠, 카드 「★ n / 21」을 서버 값 그대로 그린다', async () => {
    renderRoute(routesOf(['w1', 'k1'], levels(5, false, 2)))
    await mapHeading()
    expect(screen.getByRole('img', { name: '별 5개' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '전체 코스 별 목표 합계 42개 중 5개' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '1코스, 별 5개, 필요 별 21개' })).toBeInTheDocument()
    const locked = screen.getByRole('img', { name: '2코스, 잠김, 별 0개, 필요 별 21개' })
    expect(locked).toHaveClass('is-locked')
    expect(locked.querySelector('.lock__body')).not.toBeNull()
    expect(locked.querySelector('.lock__shackle')).not.toBeNull()
    // 잠긴 구역은 누를 수 없다
    expect(screen.queryByRole('button', { name: /^2코스/ })).toBeNull()
    expect(screen.getByRole('img', { name: '2코스 · 잠김' })).toBeInTheDocument()
    const card = screen.getByRole('region', { name: '지금 코스' })
    expect(within(card).getByRole('img', { name: '별 5개, 다음 코스에 필요한 별 21개' })).toHaveTextContent('5 / 21')
  })

  it('[시작]은 지금 스탬프로 바로 들어가고, 스탬프 안에는 탭 바가 없다', async () => {
    const { calls } = renderRoute({ ...routesOf(['w1', 'k1'], null), '/v0/learning/word-sets/w2': WORD_SET('w2') })
    await mapHeading()
    fireEvent.click(screen.getByRole('button', { name: '시작' }))
    expect(await screen.findByText('정구지')).toBeInTheDocument()
    expect(calls).toContain('/v0/learning/word-sets/w2')
    expect(tabBar()).toBeNull()
  })

  it('resume이면 지도를 거치지 않고 지금 스탬프로 들어가 한 번 썼다고 알린다 (홈 [이어가기], 3-6)', async () => {
    const { onResumeConsumed } = renderRoute({ ...routesOf([], null), '/v0/learning/word-sets/w1': WORD_SET('w1') }, { resume: true })
    expect(await screen.findByText('정구지')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: '사투리 여행' })).toBeNull()
    expect(onResumeConsumed).toHaveBeenCalledTimes(1)
  })

  it('홈 응답에 등급이 있으면 제목 옆에 등급 캐릭터를 그린다', async () => {
    renderRoute({
      ...routesOf([], null),
      '/v0/learning/home': ok({
        levelTestTaken: true,
        levelTest: { testVersion: 't', scoreVersion: 's', completedAt: '2026-11-01T00:00:00Z', tier: { code: 'NATIVE', name: '경남 토박이', rank: 1, of: 5 } },
        recommendedCourseId: null,
        recommendedSetId: null,
      }),
    })
    await mapHeading()
    expect(await screen.findByRole('img', { name: '경남 토박이' })).toBeInTheDocument()
  })
})

describe('코스 지도 (s-16)', () => {
  async function openCourse1(routes: Record<string, Reply | Reply[]>) {
    const server = renderRoute(routes)
    await mapHeading()
    fireEvent.click(screen.getByRole('button', { name: /^1코스 · / }))
    await screen.findByRole('button', { name: '지도로' })
    return server
  }
  const cards = () => within(screen.getByRole('list')).getAllByRole('button')

  it('스탬프 9개가 단어 학습 1 · 억양 학습 1 · … · 억양 학습 4 · 억양 학습 5 순서와 이름·단위로 선다', async () => {
    await openCourse1(routesOf(['w1'], null))
    const names = cards().map((c) => c.querySelector('.travel-stamp-card__title')?.textContent)
    expect(names).toEqual([
      '단어 학습 1', '억양 학습 1', '단어 학습 2', '억양 학습 2', '단어 학습 3', '억양 학습 3', '단어 학습 4', '억양 학습 4', '억양 학습 5',
    ])
    expect(cards()[0]).toHaveTextContent('3문항 · 약 1분')
    expect(cards()[1]).toHaveTextContent('대사 3개 · 약 3분')
    expect(screen.queryByText(/서버 제목/)).toBeNull()
    expect(screen.queryByText(/장$/)).toBeNull()
    expect(screen.getByText('완료', { selector: '.travel-legend span' })).toBeInTheDocument()
  })

  it('카드 3상태 — 완료 「완료」, 지금 「지금 여기 · 시작」, 진행 전 「앞 스탬프를 완료하면 열려요」 + 누를 수 없다. KAN-359 전엔 별·점수 원이 없다', async () => {
    await openCourse1(routesOf(['w1'], null))
    const [done, current, locked] = cards()
    expect(done).toHaveTextContent('완료')
    expect(done).toBeEnabled()
    expect(current).toHaveTextContent('지금 여기 · 시작')
    expect(locked).toHaveTextContent('앞 스탬프를 완료하면 열려요')
    expect(locked).toBeDisabled()
    expect(document.querySelector('.travel-stamp-card .stars, .travel-stamp-card .score-donut')).toBeNull()
    expect(screen.queryByText(/별 \d+개를 모으면/)).toBeNull()
  })

  it('KAN-359 있으면 완료 카드에 점수 원 + 별, 머리글 「★ n / 21」과 「별 21개를 모으면 2코스가 열려요」', async () => {
    await openCourse1(routesOf(['w1', 'k1'], levels(5, false, 2)))
    const [word1, tone1, current] = cards()
    expect(within(word1).getByRole('img', { name: '별 3개 중 2개' })).toBeInTheDocument()
    expect(word1).toHaveTextContent('67점')
    expect(within(tone1).getByRole('img', { name: '별 3개 중 3개' })).toBeInTheDocument()
    expect(within(current).getByRole('img', { name: '별 3개 중 0개' })).toBeInTheDocument()
    expect(current.querySelector('.score-donut')).toBeNull()
    expect(screen.getByRole('img', { name: '별 5개, 필요 별 21개' })).toHaveTextContent('5 / 21')
    expect(screen.getByText('별 21개를 모으면 2코스가 열려요')).toBeInTheDocument()
  })

  it('완료한 스탬프는 다시 들어갈 수 있고, 「← 지도로」는 지도로 돌아간다', async () => {
    await openCourse1({ ...routesOf(['w1'], null), '/v0/learning/word-sets/w1': WORD_SET('w1') })
    fireEvent.click(screen.getByRole('button', { name: '지도로' }))
    await mapHeading()
    fireEvent.click(screen.getByRole('button', { name: /^1코스 · / }))
    fireEvent.click(await screen.findByRole('button', { name: /단어 학습 1/ }))
    expect(await screen.findByText('정구지')).toBeInTheDocument()
  })
})

describe('탭 안 상태 (3-7) — 탭 바가 같이 선다', () => {
  it('로딩: 「불러오는 중이에요」', () => {
    render(<TravelRoute apiBase="http://api" tabBar={<nav aria-label="탭 바" />} deps={deps(() => new Promise(() => {}))} />)
    expect(screen.getByRole('heading', { level: 1, name: '불러오는 중이에요' })).toBeInTheDocument()
    expect(tabBar()).not.toBeNull()
  })

  it('목록 오류: 「목록을 불러오지 못했어요」 + 「오류 코드 500」, [다시 시도]가 다시 받는다', async () => {
    const { words, courses } = lists([], false)
    renderRoute({ '/v0/learning/word-sets': [fail(500, 'INTERNAL'), words], '/v0/learning/intonation-courses': courses })
    expect(await screen.findByRole('heading', { level: 1, name: '목록을 불러오지 못했어요' })).toBeInTheDocument()
    expect(screen.getByText('잠시 뒤 다시 시도해 주세요')).toBeInTheDocument()
    expect(screen.getByText('오류 코드 500')).toBeInTheDocument()
    expect(tabBar()).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await mapHeading()
  })

  it('네트워크 오류면 오류 코드 줄이 없다', async () => {
    renderRoute({ '/v0/learning/word-sets': 'network' })
    expect(await screen.findByRole('heading', { level: 1, name: '목록을 불러오지 못했어요' })).toBeInTheDocument()
    expect(screen.queryByText(/오류 코드/)).toBeNull()
  })

  it('로그인 안내 (s-20): 시안 문구와 [설정에서 로그인] 폴백', async () => {
    const openSettings = vi.fn()
    window.AccenturyBridge = { requestMicPermission: vi.fn(), startVoiceItem: vi.fn(), getContractVersion: () => 2, openSettings }
    renderRoute(routesOf([], null), { token: null })
    expect(await screen.findByRole('heading', { level: 1, name: '로그인하면 학습을 이어갈 수 있어요' })).toBeInTheDocument()
    expect(screen.getByText('학습 기록과 출석이 계정에 저장돼요')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '설정에서 로그인' }))
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect(tabBar()).not.toBeNull()
  })

  it('게스트 (s-20b): 로그인 안내와 탭 바, 학습 API를 부르지 않는다', async () => {
    window.AccenturyBridge = { requestMicPermission: vi.fn(), startVoiceItem: vi.fn(), getContractVersion: () => 2, getAccountKind: () => 'guest' }
    const { calls } = renderRoute(routesOf([], null))
    expect(await screen.findByText('로그인하면 단어 학습과 억양 학습을 할 수 있어요')).toBeInTheDocument()
    expect(tabBar()).not.toBeNull()
    expect(calls).toHaveLength(0)
  })
})

describe('지도로 돌아올 때의 움직임 (타일 1·5)', () => {
  /** 단어 스탬프 하나를 열고 ✕로 지도로 나온다. 목록 응답은 [들어가기 전, 돌아온 뒤] 차례로 */
  async function finishAndReturn(before: ReturnType<typeof routesOf>, after: ReturnType<typeof routesOf>, setId: string) {
    const routes: Record<string, Reply | Reply[]> = { [`/v0/learning/word-sets/${setId}`]: WORD_SET(setId) }
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      routes[key] = [before[key], after[key]].filter((r): r is Reply => r !== undefined) as Reply[]
    }
    renderRoute(routes)
    await mapHeading()
    fireEvent.click(screen.getByRole('button', { name: '시작' }))
    await screen.findByText('정구지')
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    await mapHeading()
  }

  it('방금 마친 스탬프가 완료로 돌아오면 지금 코스 카드에 도장이 한 번 찍힌다', async () => {
    await finishAndReturn(routesOf(['w1', 'k1'], null), routesOf(['w1', 'k1', 'w2'], null), 'w2')
    const card = screen.getByRole('region', { name: '지금 코스' })
    expect(card).toHaveClass('is-stamped')
    expect(card.querySelector('.travel-card__stamp')).not.toBeNull()
    // 코스 지도에 갔다 오면(다른 화면) 다시 돌지 않는다
    fireEvent.click(screen.getByRole('button', { name: /^1코스 · / }))
    fireEvent.click(await screen.findByRole('button', { name: '지도로' }))
    expect(screen.getByRole('region', { name: '지금 코스' })).not.toHaveClass('is-stamped')
  })

  it('완료가 안 됐으면(도중 ✕) 아무것도 돌지 않는다', async () => {
    await finishAndReturn(routesOf(['w1', 'k1'], null), routesOf(['w1', 'k1'], null), 'w2')
    expect(screen.getByRole('region', { name: '지금 코스' })).not.toHaveClass('is-stamped')
    expect(screen.queryByRole('status')).toBeNull()
  })

  const COURSE1 = ['w1', 'k1', 'w2', 'k2', 'w3', 'k3', 'w4', 'k4', 'k5']

  it('별이 21개에 닿으면 다음 코스 칩 자물쇠가 열리고, 같은 때 9개를 완주했으면 여권 페이지도 선다', async () => {
    // 마지막 스탬프가 단어가 되도록 w4를 뒤로 미룬다
    const beforeDone = COURSE1.filter((id) => id !== 'w4')
    await finishAndReturn(routesOf(beforeDone, levels(19, false, 8)), routesOf(COURSE1, levels(22, true, 9)), 'w4')
    const passport = screen.getByRole('status', { name: '1코스 완주' })
    expect(passport).toHaveTextContent('스탬프 9개를 모두 완료했어요')
    expect(passport.querySelectorAll('.travel-passport__stamps > svg')).toHaveLength(9)
    const chip = screen.getByRole('img', { name: '2코스, 열림, 별 0개, 필요 별 21개' })
    expect(chip).toHaveClass('is-unlocking')
    expect(chip.querySelector('.lock__shackle')).not.toBeNull()
    expect(screen.getByText('2코스가 열렸어요')).toBeInTheDocument()
    // 여권 페이지(문서 순서상 먼저) → 자물쇠 (CSS 지연이 순서를 맡는다)
    expect(passport.compareDocumentPosition(screen.getByRole('region', { name: '지금 코스' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('9개를 완주해도 별이 21개 미만이면 여권 페이지만 보이고 자물쇠는 열리지 않는다', async () => {
    const beforeDone = COURSE1.filter((id) => id !== 'w4')
    await finishAndReturn(routesOf(beforeDone, levels(17, false, 8)), routesOf(COURSE1, levels(19, false, 9)), 'w4')
    expect(screen.getByRole('status', { name: '1코스 완주' })).toBeInTheDocument()
    expect(document.querySelector('.is-unlocking')).toBeNull()
    expect(screen.getByRole('img', { name: '2코스, 잠김, 별 0개, 필요 별 21개' })).toBeInTheDocument()
  })
})

describe('홈 이어가기 카드 (s-02, 3-6)', () => {
  it('지금 스탬프의 「n코스 · m번째 스탬프」·이름, KAN-359 있으면 「스탬프 n개」, [이어가기]', async () => {
    const onResume = vi.fn()
    const server = fakeServer(routesOf(['w1', 'k1'], levels(5, false, 2)))
    render(<ContinueCard apiBase="http://api" onResume={onResume} deps={deps(server.fetchImpl)} />)
    const card = await screen.findByRole('region', { name: '다음 스탬프' })
    expect(card).toHaveTextContent('1코스 · 3번째 스탬프')
    expect(within(card).getByRole('heading', { level: 2, name: '단어 학습 2' })).toBeInTheDocument()
    expect(card).toHaveTextContent('스탬프 2개')
    fireEvent.click(within(card).getByRole('button', { name: '이어가기' }))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('KAN-359 전엔 「스탬프 n개」를 숨기고, 진행을 못 받으면 카드가 없다', async () => {
    const server = fakeServer(routesOf(['w1'], null))
    const { unmount } = render(<ContinueCard apiBase="http://api" onResume={vi.fn()} deps={deps(server.fetchImpl)} />)
    const card = await screen.findByRole('region', { name: '다음 스탬프' })
    expect(card).not.toHaveTextContent(/스탬프 \d+개/)
    unmount()

    const broken = fakeServer({ '/v0/learning/word-sets': fail(500, 'INTERNAL') })
    render(<ContinueCard apiBase="http://api" onResume={vi.fn()} deps={deps(broken.fetchImpl)} />)
    await waitFor(() => expect(broken.calls.length).toBeGreaterThan(0))
    await act(async () => {})
    expect(screen.queryByRole('region', { name: '다음 스탬프' })).toBeNull()
  })
})
