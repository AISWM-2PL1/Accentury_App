/**
 * 억양 학습 A-2 (KAN-253 1·5단계, 코스 목록 A-1은 KAN-347 3단계에서 사투리 여행 지도로)와 A-4 분석 대기·실패 출구 (KAN-254 2단계)·카드 연속 녹음,
 * KAN-347 5단계의 성적표(s-07-A)·결과 상세(s-08-intonation-detail)·카드 피드백(s-19). 상태별 출구, 카드 진입·회신 뒤 녹음 화면 호출이
 * 정확히 1회인지(StrictMode 포함), 일시정지 A-2의 [다시 말해 보기]·[지도로], 카드별 뒤 폴링 → 성적표 → 상세·다시 녹음을 본다.
 * 네트워크는 deps.fetchImpl로 갈아끼운다.
 */

import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import {
  IntonationCardScreen,
  IntonationFeedbackScreen,
  IntonationLearningRoute,
  IntonationReportScreen,
  IntonationWaitingScreen,
} from './IntonationLearningScreens'
import type { Stamp } from './stampNaming'
import type { CardResult } from './useIntonationLearning'
import type { IntonationCourse, PitchFeedbackItem } from './intonationApi'
import type { WordApiDeps } from './wordApi'
import { LEVELS_TIMEOUT_MS } from './travel'

/** 2코스가 아닌 1코스의 「억양 학습 2」 — 제목·문맥 줄의 n이 courseId와 무관하게 stamp에서 온다 */
const STAMP: Stamp = { kind: 'intonation', id: 'k1', course: 1, n: 2 }

const GUIDE = { unit: 'semitone', frameIntervalMs: 10, values: [0, 1, null, 2] }

const COURSE: IntonationCourse = {
  contentVersion: 'v1',
  courseId: 'k1',
  seq: 1,
  level: 1,
  topic: null,
  title: '코스 k1',
  cards: [
    { cardId: 'c1', seq: 1, standard: '안녕하세요', dialect: '안녕하능교', guideF0: GUIDE, referenceAudioUrl: null },
    { cardId: 'c2', seq: 2, standard: null, dialect: '밥 뭇나', guideF0: GUIDE, referenceAudioUrl: null },
  ],
}

type Reply = { status: number; body: unknown }
const ok = (body: unknown): Reply => ({ status: 200, body })
const fail = (status: number, code: string, message: string, retryable: boolean): Reply => ({
  status,
  body: { code, message, retryable, retryAfterMs: null, correlationId: 'c' },
})

/** 경로 끝부분으로 응답을 고른다. 배열이면 부를 때마다 앞에서 하나씩 꺼낸다(마지막은 남긴다) */
function fakeServer(routes: Record<string, Reply | Reply[]>): FetchLike {
  return async (input) => {
    const path = new URL(input).pathname
    const key = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((k) => path.endsWith(k))
    if (key === undefined) throw new Error(`라우트 없음: ${path}`)
    const entry = routes[key]
    const reply = Array.isArray(entry) ? (entry.length > 1 ? entry.shift()! : entry[0]) : entry
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body } as Response
  }
}

function deps(fetchImpl: FetchLike, token: string | null = 'acc'): WordApiDeps {
  return { fetchImpl, getToken: () => token, refreshToken: async () => false }
}

const newExits = () => ({ toMap: vi.fn(), toNextStamp: vi.fn() })

function renderRoute(routes: Record<string, Reply | Reply[]>, token: string | null = 'acc', strict = false) {
  const exits = newExits()
  // 탭 바 자리 표시 — 어느 단계에서 그려지는지만 본다 (탭 바 자체는 `ui/TabBar.test.tsx`)
  const route = (
    <IntonationLearningRoute apiBase="http://api" stamp={STAMP} courseStars={null} exits={exits} tabBar={<nav aria-label="탭 바" />} deps={deps(fakeServer(routes), token)} />
  )
  render(strict ? <StrictMode>{route}</StrictMode> : route)
  return { exits }
}

const tabBar = () => screen.queryByRole('navigation', { name: '탭 바' })

/** 성적표 점수 원 (StampReward) — count-up 중에도 스크린 리더 글자에 끝 값이 있다 */
const reportDonut = () => document.querySelector('.stamp-reward .score-donut')

/** 「다시 연습할 대사」 카드 버튼 */
const practiceCard = () => screen.getByRole('region', { name: '다시 연습할 대사' }).querySelector('button')!

/** 화면 안의 버튼 이름 목록 — 출구가 정확히 하나인지 볼 때 쓴다 */
const buttonNames = () => screen.queryAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)

function withBridge(startIntonationRecording?: (payload: string) => void) {
  window.AccenturyBridge = {
    requestMicPermission: vi.fn(),
    startVoiceItem: vi.fn(),
    getContractVersion: () => 2,
    ...(startIntonationRecording ? { startIntonationRecording } : {}),
  }
}

afterEach(() => {
  delete window.AccenturyBridge
  delete window.AccenturyWeb
})

// ── 진입 (코스 하나) ─────────────────────────────────────────────────────

describe('진입 — 받은 코스로 바로 들어간다 (KAN-347 3단계)', () => {
  it('로딩 중엔 버튼도 탭 바도 없다', () => {
    render(
      <IntonationLearningRoute apiBase="http://api" stamp={STAMP} courseStars={null} exits={newExits()} tabBar={<nav aria-label="탭 바" />} deps={deps(() => new Promise(() => {}))} />,
    )
    expect(screen.getByText('불러오는 중이에요')).toBeInTheDocument()
    expect(buttonNames()).toEqual([])
    expect(tabBar()).toBeNull()
  })

  it('코스 목록을 부르지 않고 그 코스의 첫 카드(A-2)다, 탭 바는 없다 (KAN-147)', async () => {
    renderRoute({ '/intonation-courses/k1': ok(COURSE) })
    expect(await screen.findByRole('heading', { name: '안녕하능교' })).toBeInTheDocument()
    expect(tabBar()).toBeNull()
  })

  it('로그인 없음(CLIENT_NOT_SIGNED_IN) → 안내 + 탭 바가 출구 (KAN-252)', async () => {
    renderRoute({ '/intonation-courses/k1': ok(COURSE) }, null)
    expect(await screen.findByText('로그인하면 억양 학습을 할 수 있어요')).toBeInTheDocument()
    expect(buttonNames()).toEqual([])
    expect(tabBar()).not.toBeNull()
  })

  it('UNAUTHENTICATED(갱신 실패) → 문구 그대로 + 탭 바', async () => {
    renderRoute({ '/intonation-courses/k1': { status: 401, body: {} } })
    expect(await screen.findByText('로그인이 만료됐어요. 다시 로그인해 주세요')).toBeInTheDocument()
    expect(buttonNames()).toEqual([])
    expect(tabBar()).not.toBeNull()
  })
})

// ── A-2 (라우트 결선) ────────────────────────────────────────────────────

describe('A-2 카드 로드 실패', () => {
  it('retryable 실패 → [다시 시도] 하나, 누르면 카드가 열린다', async () => {
    renderRoute({
      '/intonation-courses/k1': [fail(503, 'SERVICE_UNAVAILABLE', '잠시 뒤에 다시 해 주세요', true), ok(COURSE)],
    })
    expect(await screen.findByText('잠시 뒤에 다시 해 주세요')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['다시 시도'])
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('heading', { name: '안녕하능교' })).toBeInTheDocument()
  })

  it('LEARNING_COURSE_NOT_FOUND → [지도로] 하나, 누르면 지도로 (KAN-347 3-8)', async () => {
    const { exits } = renderRoute({
      '/intonation-courses/k1': fail(404, 'LEARNING_COURSE_NOT_FOUND', '없는 억양 코스입니다.', false),
    })
    expect(await screen.findByText('없는 억양 코스입니다.')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['지도로'])
    fireEvent.click(screen.getByRole('button', { name: '지도로' }))
    expect(exits.toMap).toHaveBeenCalledTimes(1)
  })
})

const attempt = (attemptId: string, status: string, extra: Record<string, unknown> = {}) => ({
  attemptId, contentVersion: 'v1', cardId: 'c1', status, pollAfterMs: 1000, ...extra,
})
/** 코멘트 하나(「밥」 올리기) — 「다시 연습할 대사」 카드는 코멘트가 있는 대사만 세운다 */
const FB: PitchFeedbackItem[] = [{ word: '밥', raise: '밥', lower: null, split: false }]
const completed = (attemptId: string, score = 80, previousScore: number | null = null, pitchFeedback: PitchFeedbackItem[] = FB) =>
  ok(attempt(attemptId, 'COMPLETED', { score, pitchFeedback, previousScore }))
const processing = (attemptId: string) => ok(attempt(attemptId, 'PROCESSING'))
const failed = (attemptId: string, code: string) => ok(attempt(attemptId, 'FAILED', { error: { code, retryable: false } }))

/** 지금 카드의 회신을 쏜다 — 수신 지점은 A-2 진입 뒤 이펙트에서 설치되므로 설치를 기다린다 */
async function reply(cardId: string, attemptId: string) {
  await waitFor(() => expect(window.AccenturyWeb?.onIntonationRecorded).toBeDefined())
  act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId, attemptId })))
}

describe('카드 연속 녹음 (KAN-254 5단계)', () => {
  const ROUTES = {
    '/intonation-courses/k1': ok(COURSE),
    '/intonation-attempts/la_1': completed('la_1'),
    '/intonation-attempts/la_2': completed('la_2', 72),
  }
  const payload = (start: ReturnType<typeof vi.fn>, n: number) => JSON.parse(start.mock.calls[n][0])

  it('카드 진입 때 녹음 화면을 자동으로 1회 열고, 지금 카드의 회신이 오면 대기·피드백 없이 바로 다음 카드 녹음 → 마지막 회신 뒤 결과 목록', async () => {
    const start = vi.fn()
    withBridge(start)
    renderRoute(ROUTES)
    await screen.findByRole('heading', { name: '안녕하능교' })
    // 수신 지점은 A-2 진입 뒤 이펙트에서 설치된다 — 그 전에 쏘면 아래 무시 검사가 헛돈다
    await waitFor(() => expect(window.AccenturyWeb?.onIntonationRecorded).toBeDefined())
    expect(screen.getByText('1 / 2', { exact: false })).toBeInTheDocument()

    expect(start).toHaveBeenCalledTimes(1)
    expect(payload(start, 0)).toEqual({
      cardId: 'c1',
      prompt: '안녕하능교',
      standard: '안녕하세요',
      maxDurationMs: 10000,
      guideF0: GUIDE,
      itemNumber: 1,
      totalItems: 2,
    })

    // 다른 카드의 회신·깨진 payload는 무시
    act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId: 'c2', attemptId: 'x' })))
    act(() => window.AccenturyWeb?.onIntonationRecorded?.('{broken'))
    expect(screen.getByRole('heading', { name: '안녕하능교' })).toBeInTheDocument()
    expect(start).toHaveBeenCalledTimes(1)

    act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId: 'c1', attemptId: 'la_1' })))
    // 같은 회신이 한 번 더 와도 다음 카드로 두 번 넘어가지 않는다
    act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId: 'c1', attemptId: 'la_1' })))
    expect(screen.getByRole('heading', { name: '밥 뭇나' })).toBeInTheDocument()
    expect(screen.queryByText('분석 중이에요')).toBeNull()
    expect(screen.queryByText('억양 점수')).toBeNull()
    expect(start).toHaveBeenCalledTimes(2)
    expect(payload(start, 1)).toMatchObject({ cardId: 'c2', standard: null, itemNumber: 2, totalItems: 2 })

    await reply('c2', 'la_2')
    expect(await screen.findByRole('heading', { name: '억양 학습 2 결과' })).toBeInTheDocument()
    expect(reportDonut()).toHaveTextContent('76점')
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('StrictMode에서도 카드 진입·회신마다 녹음 호출은 1회다', async () => {
    const start = vi.fn()
    withBridge(start)
    renderRoute(ROUTES, 'acc', true)
    await screen.findByRole('heading', { name: '안녕하능교' })
    await waitFor(() => expect(window.AccenturyWeb?.onIntonationRecorded).toBeDefined())
    expect(start).toHaveBeenCalledTimes(1)

    await reply('c1', 'la_1')
    await screen.findByRole('heading', { name: '밥 뭇나' })
    expect(start).toHaveBeenCalledTimes(2)
    expect(payload(start, 1).cardId).toBe('c2')
  })

  it('카드 로드 실패 → [다시 시도]로 열릴 때 자동 호출 1회 (실패한 시도는 부르지 않는다)', async () => {
    const start = vi.fn()
    withBridge(start)
    renderRoute({
      '/intonation-courses/k1': [fail(503, 'SERVICE_UNAVAILABLE', '잠시 뒤에 다시 해 주세요', true), ok(COURSE)],
    })
    await screen.findByText('잠시 뒤에 다시 해 주세요')
    expect(start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByRole('heading', { name: '안녕하능교' })
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('녹음 화면을 닫고 돌아온 A-2(일시정지): 버튼은 [다시 말해 보기]·[지도로] 둘, 다시 말해 보기는 같은 카드로 다시 연다', async () => {
    const start = vi.fn()
    withBridge(start)
    const { exits } = renderRoute(ROUTES)
    await screen.findByRole('heading', { name: '안녕하능교' })
    expect(buttonNames()).toEqual(['다시 말해 보기', '지도로', '닫기'])

    fireEvent.click(screen.getByRole('button', { name: '다시 말해 보기' }))
    expect(start).toHaveBeenCalledTimes(2)
    expect(payload(start, 1)).toEqual(payload(start, 0))

    fireEvent.click(screen.getByRole('button', { name: '지도로' }))
    expect(exits.toMap).toHaveBeenCalledTimes(1)
  })

  it('브리지 없음(브라우저 단독): 카드는 그대로 열리고 [다시 말해 보기] 비활성', async () => {
    renderRoute(ROUTES)
    await screen.findByRole('heading', { name: '안녕하능교' })
    expect(screen.getByRole('button', { name: '다시 말해 보기' })).toBeDisabled()
    expect(screen.getByText('앱에서 녹음할 수 있어요')).toBeInTheDocument()
  })
})

// ── A-2 (화면 단독) ──────────────────────────────────────────────────────

describe('A-2 대사 카드', () => {
  const renderCard = (index: number) =>
    render(<IntonationCardScreen course={COURSE} index={index} onBack={vi.fn()} />)

  it('표준어·사투리·가이드 곡선 1단을 그린다', () => {
    withBridge(vi.fn())
    renderCard(0)
    expect(screen.getByText('안녕하세요')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '안녕하능교' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: '가이드 억양 곡선' })).toHaveLength(1)
  })

  it('표준어가 null이면 표준어 줄을 생략한다', () => {
    withBridge(vi.fn())
    renderCard(1)
    expect(screen.queryByText('표준어')).toBeNull()
    expect(screen.getByRole('heading', { name: '밥 뭇나' })).toBeInTheDocument()
  })

  it('브리지에 startIntonationRecording이 없으면 [다시 말해 보기] 비활성 + 「앱에서 녹음할 수 있어요」, [지도로]는 살아 있다', () => {
    withBridge()
    renderCard(0)
    expect(screen.getByRole('button', { name: '다시 말해 보기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '지도로' })).toBeEnabled()
    expect(screen.getByText('앱에서 녹음할 수 있어요')).toBeInTheDocument()
  })
})

// ── 뒤 폴링·A-4 대기·결과 목록·상세 (KAN-254 2·5단계, 라우트 결선) ─────────────
// 폴링은 가짜 타이머로 민다. 지터가 있어도 간격은 최대 6초(5초 상한 +20%)라 시간을 넉넉히 민다

describe('뒤 폴링 → 대기 → 결과 목록 → 상세', () => {
  /**
   * 코스 k1을 열고 두 카드 회신(la_1, la_2)을 쏜다. attempts는 /intonation-attempts/{id} 응답(배열이면 차례로,
   * 마지막은 남는다 — 나중에 바꿔 끼우려면 그 배열의 [0]을 갈면 된다). 조회 경로와 목록 조회 횟수를 센다
   */
  async function toEnd(
    attempts: Record<string, Reply | Reply[]>,
    start = vi.fn(),
    cards = 2,
    hold?: (path: string) => Promise<Response> | undefined,
    levels?: { courseStars: { collected: number; required: number }; reply: Reply | Reply[] },
  ) {
    vi.useFakeTimers()
    withBridge(start)
    const calls: string[] = []
    const exits = newExits()
    const routes: Record<string, Reply | Reply[]> = { '/intonation-courses/k1': ok(COURSE) }
    if (levels !== undefined) routes['/learning/levels'] = levels.reply
    for (const [id, r] of Object.entries(attempts)) routes[`/intonation-attempts/${id}`] = r
    const server = fakeServer(routes)
    const fetchImpl: FetchLike = (input, init) => {
      const path = new URL(input).pathname
      if (path.includes('/intonation-attempts/') || path.endsWith('/levels')) calls.push(path)
      return hold?.(path) ?? server(input, init)
    }
    const view = render(
      <IntonationLearningRoute
        apiBase="http://api"
        stamp={STAMP}
        courseStars={levels?.courseStars ?? null}
        exits={exits}
        deps={deps(fetchImpl)}
      />,
    )
    await act(async () => {})
    for (const [cardId, attemptId] of [['c1', 'la_1'], ['c2', 'la_2']].slice(0, cards)) {
      act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId, attemptId })))
      await act(async () => {}) // 첫 조회 응답·다음 카드 수신기 설치까지
    }
    return { calls, start, exits, unmount: view.unmount }
  }
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
  const stageOf = (label: string) => screen.getByText(label).closest('.analysis-step')?.getAttribute('data-state')
  const row = (label: string) => screen.getByRole('button', { name: new RegExp(label) })
  const SUMMARY = '억양 학습 2 결과'

  afterEach(() => vi.useRealTimers())

  it('카드마다 뒤에서 따로 폴링 — 마지막 회신 뒤 분석 중이 남으면 A-4(단계 1, 버튼 없음) → 모두 끝나면 목록', async () => {
    const { calls } = await toEnd({
      la_1: completed('la_1', 91),
      la_2: [processing('la_2'), processing('la_2'), processing('la_2'), completed('la_2', 64)],
    })
    expect(screen.getByText('분석 중이에요')).toBeInTheDocument()
    expect(stageOf('곡선 추출')).toBe('current')
    expect(stageOf('점수 계산')).toBe('todo')
    expect(buttonNames()).toEqual(['닫기']) // 화면 안 버튼은 없고 라우트의 ✕만 (KAN-252)
    expect(calls).toEqual(['/v0/learning/intonation-attempts/la_1', '/v0/learning/intonation-attempts/la_2'])

    await advance(20_000)
    expect(calls.filter((p) => p.endsWith('/la_1'))).toHaveLength(1)
    expect(calls.filter((p) => p.endsWith('/la_2'))).toHaveLength(4)
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
    expect(reportDonut()).toHaveTextContent('78점') // (91 + 64) / 2 = 77.5 → 반올림
    expect(screen.getByRole('img', { name: '별 3개 중 3개' })).toBeInTheDocument() // KAN-359 없음 → 앱 상수 70 이상 ★3
    expect(calls.filter((p) => p.endsWith('/levels'))).toHaveLength(0) // 들어가기 전 코스 별이 없으면 구간 요약을 부르지 않는다
  })

  it('마지막 회신 때 이미 다 끝났으면 대기 없이 바로 목록', async () => {
    await toEnd({ la_1: completed('la_1'), la_2: completed('la_2', 72) })
    expect(screen.queryByText('분석 중이에요')).toBeNull()
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
  })

  it('대기 화면 경과 시간으로 단계가 넘어가고 10초부터 안심 문구', async () => {
    await toEnd({ la_1: completed('la_1'), la_2: processing('la_2') })
    await advance(3_000)
    expect(stageOf('곡선 추출')).toBe('done')
    expect(stageOf('분포 비교')).toBe('current')
    expect(screen.queryByText('분석에 조금 더 걸리고 있어요. 곧 끝나요')).toBeNull()
    await advance(7_500)
    expect(stageOf('점수 계산')).toBe('current')
    expect(screen.getByText('분석에 조금 더 걸리고 있어요. 곧 끝나요')).toBeInTheDocument()
  })

  it('성적표 (5-4): 「스탬프 완료」·점수 원·별, ✕ 없음, 「다시 연습할 대사」는 최저점 대사, 하단 [다음 스탬프]·「지도로」', async () => {
    const { exits } = await toEnd({ la_1: completed('la_1', 80), la_2: completed('la_2', 72, 75) })
    expect(screen.getByText('스탬프 완료')).toBeInTheDocument()
    expect(reportDonut()).toHaveTextContent('76점')
    expect(screen.getByRole('img', { name: '별 3개 중 3개' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '닫기' })).toBeNull()
    expect(screen.queryByRole('region', { name: /코스 별/ })).toBeNull() // KAN-359 전이면 「코스 별」 줄을 숨긴다
    // 옛 「코스를 마쳤어요」·「평균 n점」·「n번 문항」 목록은 없다
    expect(screen.queryByText(/마쳤어요|평균|번 문항/)).toBeNull()

    const card = practiceCard()
    expect(card).toHaveTextContent('뭇나') // 72점인 2번째 대사 「밥 뭇나」(밥에 음절 표시)
    expect(card).not.toHaveTextContent('안녕하능교')
    expect(card).toHaveTextContent('▼3')
    expect(card).toHaveTextContent('지난번 75점보다 3점 하락')
    expect(card).toHaveTextContent('「밥」 음절을 더 높여 보세요')
    expect(card.querySelector('.score-donut')).toHaveTextContent('72점')
    expect(screen.getByRole('img', { name: '밥, 더 높이기, 1번' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /다음 스탬프/ }))
    expect(exits.toNextStamp).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '지도로' }))
    expect(exits.toMap).toHaveBeenCalledTimes(1)
  })

  it('최저점이 동점이면 앞 대사, 그 대사에 코멘트가 없으면 카드를 생략한다', async () => {
    await toEnd({ la_1: completed('la_1', 70, null, []), la_2: completed('la_2', 70) })
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '다시 연습할 대사' })).toBeNull()
  })

  it('성적표 › → 결과 상세 (s-08): 위 「← 결과 목록으로」·카드 한 장·주 버튼 [다시 말해 보기], ✕ 없음 → 성적표로', async () => {
    await toEnd({ la_1: completed('la_1', 80), la_2: completed('la_2', 72) })
    fireEvent.click(practiceCard())
    expect(screen.getByText('억양 학습 2 · 2번째 대사')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '억양 점수 72점, 첫 기록' })).toBeInTheDocument()
    expect(screen.getByText('첫 기록')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['결과 목록으로', '다시 말해 보기'])
    expect(screen.getByRole('button', { name: '다시 말해 보기' })).toHaveClass('btn--primary')
    expect(screen.getByRole('button', { name: '결과 목록으로' })).toHaveClass('btn--text')
    fireEvent.click(screen.getByRole('button', { name: '결과 목록으로' }))
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
  })

  it('상세 [다시 말해 보기] → 같은 카드 녹음(복귀 모드) → 그 카드 1건 대기 → 카드 피드백(s-19)에 ▲·지난번 점수 → 성적표 점수 갱신', async () => {
    const { start } = await toEnd({
      la_1: completed('la_1', 80),
      la_2: completed('la_2', 72),
      la_3: [processing('la_3'), completed('la_3', 86, 72)],
    })
    fireEvent.click(practiceCard())
    fireEvent.click(screen.getByRole('button', { name: '다시 말해 보기' }))
    expect(start).toHaveBeenCalledTimes(3)
    expect(JSON.parse(start.mock.calls[2][0]).cardId).toBe('c2')
    // 회신 없이 닫아도 막히지 않게 복귀 모드 A-2의 출구는 [결과 목록으로]
    expect(screen.getByRole('heading', { name: '밥 뭇나' })).toBeInTheDocument()
    expect(buttonNames()).toEqual(['다시 말해 보기', '결과 목록으로', '닫기'])

    await act(async () => {})
    act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId: 'c2', attemptId: 'la_3' })))
    await act(async () => {})
    expect(screen.getByText('분석 중이에요')).toBeInTheDocument()
    expect(start).toHaveBeenCalledTimes(3) // 복귀 모드는 다음 카드로 넘어가지 않는다
    await advance(2_000)
    // 카드 피드백(s-19): 주 버튼 [다시 말해 보기] + 글자 버튼 「결과 목록으로」 + ✕
    expect(buttonNames()).toEqual(['다시 말해 보기', '결과 목록으로', '닫기'])
    expect(screen.getByRole('button', { name: '다시 말해 보기' })).toHaveClass('btn--primary')
    expect(screen.getByRole('button', { name: '결과 목록으로' })).toHaveClass('btn--text')
    expect(screen.getByText('▲14')).toBeInTheDocument()
    expect(screen.getByText('지난번 72점')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '억양 점수 86점, 지난번 72점보다 14점 상승' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '결과 목록으로' }))
    expect(reportDonut()).toHaveTextContent('83점') // (80 + 86) / 2
    expect(practiceCard()).toHaveTextContent('안녕하능교') // 이제 최저점은 1번째 대사(80)
  })

  it('복귀 모드 A-2에서 회신 없이 [결과 목록으로] → 성적표, 점수는 그대로', async () => {
    await toEnd({ la_1: completed('la_1', 80), la_2: completed('la_2', 72) })
    fireEvent.click(practiceCard())
    fireEvent.click(screen.getByRole('button', { name: '다시 말해 보기' }))
    fireEvent.click(screen.getByRole('button', { name: '결과 목록으로' }))
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
    expect(reportDonut()).toHaveTextContent('76점')
  })

  it('KAN-359 구간 요약이 있으면 「코스 별」 줄(전 → 후)과 starThresholds로 별을 그린다', async () => {
    const levels = (collected: number) =>
      ok({
        totalStars: collected,
        starThresholds: [80, 90],
        levels: [1, 2].map((level) => ({
          level, setCount: 9, completedSetCount: 1, collectedStars: level === 1 ? collected : 0, requiredStars: 21, unlocked: level === 1,
        })),
      })
    const { calls } = await toEnd({ la_1: completed('la_1', 80), la_2: completed('la_2', 72) }, vi.fn(), 2, undefined, {
      courseStars: { collected: 5, required: 21 },
      reply: levels(7),
    })
    await act(async () => {})
    expect(calls.filter((p) => p.endsWith('/levels'))).toHaveLength(1)
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '별 3개 중 1개' })).toBeInTheDocument() // 76 < 80 → ★1 (앱 상수였다면 ★3)
    expect(screen.getByRole('region', { name: '코스 별 5개에서 7개로, 다음 코스까지 필요한 별 21개' })).toBeInTheDocument()
    expect(screen.getByText('다음 코스까지 별 14개')).toBeInTheDocument()
  })

  it('구간 요약이 응답 없이 걸려도 제한 시간(3초) 뒤 성적표가 「코스 별」 줄 없이 선다 — 별은 앱 상수', async () => {
    const hang = (path: string) => (path.endsWith('/levels') ? new Promise<Response>(() => {}) : undefined)
    await toEnd({ la_1: completed('la_1', 80), la_2: completed('la_2', 72) }, vi.fn(), 2, hang, {
      courseStars: { collected: 5, required: 21 },
      reply: ok({}),
    })
    await advance(LEVELS_TIMEOUT_MS - 1)
    expect(screen.queryByRole('heading', { name: SUMMARY })).toBeNull()
    await advance(1)
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '별 3개 중 3개' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /코스 별/ })).toBeNull()
  })

  it('들어가기 전 코스 별은 있는데 구간 요약 조회가 실패하면 「코스 별」 줄만 숨기고 별은 앱 상수', async () => {
    await toEnd({ la_1: completed('la_1', 80), la_2: completed('la_2', 72) }, vi.fn(), 2, undefined, {
      courseStars: { collected: 5, required: 21 },
      reply: fail(404, 'NOT_FOUND', '없음', false),
    })
    await act(async () => {})
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '별 3개 중 3개' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /코스 별/ })).toBeNull()
  })

  it.each([
    ['ANALYSIS_MISREAD', '제시된 문장과 다르게 들렸어요', true],
    ['AUDIO_TOO_QUIET', '목소리가 작게 들렸어요', true],
    ['SOMETHING_ELSE', '분석하지 못했어요. 다시 녹음해 주세요', false],
  ])('%s 행 「다시 녹음 필요」 → 문구 + [다시 녹음]·[결과 목록으로] → 같은 카드 녹음 1회', async (code, message, showsLine) => {
    const { start } = await toEnd({ la_1: completed('la_1', 80), la_2: failed('la_2', code) })
    expect(row('2번째 대사')).toHaveTextContent('다시 녹음 필요')
    // 점수 없는 대사가 섞이면 스탬프 점수·별·「스탬프 완료」를 보이지 않는다 (혼자 정한 사항, 5-4)
    expect(reportDonut()).toBeNull()
    expect(screen.queryByText('스탬프 완료')).toBeNull()
    fireEvent.click(row('2번째 대사'))
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(buttonNames()).toEqual(['다시 녹음', '결과 목록으로', '닫기'])
    expect(screen.queryByText('밥 뭇나') !== null).toBe(showsLine)

    fireEvent.click(screen.getByRole('button', { name: '다시 녹음' }))
    expect(start).toHaveBeenCalledTimes(3)
    expect(JSON.parse(start.mock.calls[2][0]).cardId).toBe('c2')
    expect(screen.getByRole('heading', { name: '밥 뭇나' })).toBeInTheDocument()
    // card 뷰로 돌아와야 새 회신을 받는다
    await act(async () => {})
    expect(window.AccenturyWeb?.onIntonationRecorded).toBeDefined()
  })

  it('카드마다 60초 예산 — 소진 카드는 「확인 필요」로 목록 → [다시 시도]가 같은 attemptId 폴링을 새로 세워 대기 → 결과가 행에 반영', async () => {
    const la2: Reply[] = [processing('la_2')]
    const { calls } = await toEnd({ la_1: completed('la_1', 80), la_2: la2 })
    await advance(70_000)
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
    expect(row('2번째 대사')).toHaveTextContent('확인 필요')
    const before = calls.length
    await advance(20_000)
    expect(calls).toHaveLength(before) // 소진 뒤엔 자동 조회가 없다

    fireEvent.click(row('2번째 대사'))
    expect(screen.getByText('분석이 예상보다 오래 걸리고 있어요')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['다시 시도', '결과 목록으로', '닫기'])
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await act(async () => {})
    expect(calls).toHaveLength(before + 1)
    expect(calls.at(-1)).toMatch(/\/la_2$/)
    expect(screen.getByText('분석 중이에요')).toBeInTheDocument()
    expect(stageOf('곡선 추출')).toBe('current') // 예산과 함께 단계도 0부터

    la2[0] = completed('la_2', 70)
    await advance(6_000)
    expect(screen.getByText('70점')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '결과 목록으로' }))
    expect(screen.queryByRole('button', { name: /2번째 대사/ })).toBeNull() // 끝난 대사는 행에서 빠진다
    expect(reportDonut()).toHaveTextContent('75점')
  })

  /** 응답을 붙잡아 두는 조회 — resolve 전까지 끝나지 않는다. 경로마다 첫 호출만 붙잡는다 */
  function holdFirst(suffix: string) {
    let release: (reply: Reply) => void = () => {}
    let held = false
    const hold = (path: string) => {
      if (held || !path.endsWith(suffix)) return undefined
      held = true
      return new Promise<Response>((resolve) => {
        release = (r) => resolve({ ok: r.status < 300, status: r.status, json: async () => r.body } as Response)
      })
    }
    return { hold, release: (r: Reply) => release(r) }
  }

  it('채점 조회가 응답 없이 멈춰도 60초 deadline에 「확인 필요」로 목록 → [다시 시도] 재폴링 (리뷰 P1)', async () => {
    const { hold } = holdFirst('/la_2')
    const { calls } = await toEnd({ la_1: completed('la_1', 80), la_2: completed('la_2', 70) }, vi.fn(), 2, hold)
    await advance(59_000)
    expect(screen.getByText('분석 중이에요')).toBeInTheDocument()
    expect(calls.filter((p) => p.endsWith('/la_2'))).toHaveLength(1) // 응답이 없으니 다음 조회도 없다
    await advance(1_000)
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
    expect(row('2번째 대사')).toHaveTextContent('확인 필요')

    fireEvent.click(row('2번째 대사'))
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await act(async () => {})
    expect(screen.getByText('70점')).toBeInTheDocument()
  })

  it('deadline 뒤 늦게 온 응답은 「확인 필요」를 덮지 않는다', async () => {
    const { hold, release } = holdFirst('/la_2')
    await toEnd({ la_1: completed('la_1', 80), la_2: completed('la_2', 70) }, vi.fn(), 2, hold)
    await advance(60_000)
    expect(row('2번째 대사')).toHaveTextContent('확인 필요')
    release(completed('la_2', 99))
    await advance(10_000)
    expect(row('2번째 대사')).toHaveTextContent('확인 필요')
  })

  it('끊긴 앞 폴링의 늦은 응답은 다시 녹음한 시도(la_3)의 결과를 덮지 않는다', async () => {
    // la_1 첫 조회를 붙잡아 deadline으로 끝낸 뒤, 재폴링 완료 → 다시 녹음 la_3 완료 → 그때 la_1 첫 응답을 푼다
    const { hold, release } = holdFirst('/la_1')
    await toEnd(
      { la_1: completed('la_1', 80), la_2: completed('la_2', 72), la_3: completed('la_3', 86, 80) },
      vi.fn(),
      2,
      hold,
    )
    await advance(60_000)
    fireEvent.click(row('1번째 대사'))
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' })) // 같은 la_1 재폴링
    await act(async () => {})
    expect(screen.getByText('80점')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다시 말해 보기' })) // 결과 상세 → 같은 카드 다시 녹음
    await act(async () => {})
    act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId: 'c1', attemptId: 'la_3' })))
    await act(async () => {})
    expect(screen.getByText('86점')).toBeInTheDocument()

    release(completed('la_1', 10))
    await advance(10_000)
    expect(screen.getByText('86점')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '결과 목록으로' }))
    expect(reportDonut()).toHaveTextContent('79점') // (86 + 72) / 2 — 늦은 10점이 덮지 않았다
  })

  it('성적표 「지도로」 → 지도로 나간다 (완료 저장 호출 없음, 지도가 진행을 다시 받는다)', async () => {
    const { exits, calls } = await toEnd({ la_1: completed('la_1'), la_2: completed('la_2', 72) })
    fireEvent.click(screen.getByRole('button', { name: '지도로' }))
    expect(exits.toMap).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
  })

  it('403 → 기존 오류 화면, [지도로] 하나', async () => {
    await toEnd({ la_1: fail(403, 'LEARNING_ATTEMPT_FORBIDDEN', '내 시도가 아니에요', false) }, vi.fn(), 1)
    expect(screen.getByText('내 시도가 아니에요')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['지도로'])
  })

  it('retryable 오류 1회 뒤에도 그 카드 폴링을 계속한다', async () => {
    const { calls } = await toEnd({
      la_1: [fail(503, 'SERVICE_UNAVAILABLE', '잠시 뒤에', true), completed('la_1', 65)],
      la_2: completed('la_2', 75),
    })
    expect(screen.getByText('분석 중이에요')).toBeInTheDocument()
    expect(screen.queryByText('잠시 뒤에')).toBeNull()
    await advance(2_000)
    expect(calls.filter((p) => p.endsWith('/la_1'))).toHaveLength(2)
    expect(reportDonut()).toHaveTextContent('70점') // (65 + 75) / 2
  })

  it('언마운트하면 진행 중인 폴링을 모두 멈춘다', async () => {
    const { calls, unmount } = await toEnd({ la_1: processing('la_1'), la_2: processing('la_2') })
    expect(calls).toHaveLength(2)
    unmount()
    await advance(30_000)
    expect(calls).toHaveLength(2)
  })

  it('A-2 [지도로]·오른쪽 위 ✕ → 지도로 나간다 (KAN-252, 3-8) — 라우트가 내려가면 뒤 폴링이 멈춘다', async () => {
    const { calls, exits, unmount } = await toEnd({ la_1: processing('la_1') }, vi.fn(), 1)
    expect(screen.getByRole('heading', { name: '밥 뭇나' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '지도로' }))
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(exits.toMap).toHaveBeenCalledTimes(2)
    unmount() // 사투리 여행 라우트가 지도로 바꾸며 이 흐름을 내린다
    const before = calls.length
    await advance(30_000)
    expect(calls).toHaveLength(before)
  })

  it('대기 화면은 제목 아래에 레벨 테스트 대기와 같은 억양 곡선 루프를 그린다 (KAN-302)', () => {
    const { container } = render(<IntonationWaitingScreen />)
    expect(container.querySelector('.analysis-waiting .intonation-curve')).toHaveAttribute('aria-hidden', 'true')
  })
})

// ── 성적표 (화면 단독) ──────────────────────────────────────────────────

describe('성적표 (s-07-A)', () => {
  const COURSE3: IntonationCourse = {
    ...COURSE,
    cards: ['가 가', '나 나', '다 다'].map((d, i) => ({ ...COURSE.cards[1], cardId: `c${i}`, seq: i, dialect: d })),
  }
  const done = (score: number, feedback: PitchFeedbackItem[] = [], previousScore: number | null = null): CardResult => ({
    attemptId: 'a', outcome: 'completed', score, feedback, previousScore,
  })
  const renderReport = (results: Record<string, CardResult>, onOpen = vi.fn()) =>
    render(
      <IntonationReportScreen
        course={COURSE3}
        n={3}
        results={results}
        courseStars={null}
        starThresholds={null}
        onOpen={onOpen}
        onNextStamp={vi.fn()}
        onToMap={vi.fn()}
      />,
    )

  it('제목 「억양 학습 n 결과」, 점수 = 대사 3개 평균 반올림, 별 = 앱 상수 경계', () => {
    renderReport({ c0: done(29), c1: done(30), c2: done(30) })
    expect(screen.getByRole('heading', { level: 1, name: '억양 학습 3 결과' })).toBeInTheDocument()
    expect(document.querySelector('.score-donut')).toHaveTextContent('30점') // 89 / 3 = 29.67 → 30
    expect(screen.getByRole('img', { name: '별 3개 중 2개' })).toBeInTheDocument()
    expect(screen.getByText('스탬프 완료')).toBeInTheDocument()
  })

  it('분석이 끝나지 않은 대사는 목록 행(분석 중·다시 녹음 필요·확인 필요) — 점수·별·「스탬프 완료」는 없다, 행을 누르면 그 대사', () => {
    const onOpen = vi.fn()
    renderReport({ c0: { attemptId: 'a', outcome: 'processing' }, c1: { attemptId: 'a', outcome: 'quiet' }, c2: { attemptId: 'a', outcome: 'timeout' } }, onOpen)
    expect(buttonNames()).toEqual(['1번째 대사분석 중', '2번째 대사다시 녹음 필요', '3번째 대사확인 필요', '다음 스탬프', '지도로'])
    expect(document.querySelector('.score-donut')).toBeNull()
    expect(screen.queryByRole('img', { name: /별 3개 중/ })).toBeNull()
    expect(screen.queryByText('스탬프 완료')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^3번째/ }))
    expect(onOpen).toHaveBeenCalledWith(2)
  })

  it('「다시 연습할 대사」는 완료된 대사 중 최저점(동점이면 앞)이고 ›를 누르면 그 대사를 연다', () => {
    const onOpen = vi.fn()
    const fb = (word: string) => [{ word, raise: null, lower: word[0], split: false }]
    renderReport({ c0: done(90, fb('가')), c1: done(60, fb('나'), 70), c2: done(60, fb('다')) }, onOpen)
    const card = practiceCard()
    // 「나 나」의 첫 글자에 음절 표시 — 화살표는 글자가 아니라 SVG다(티켓 1-1)
    expect(card).toHaveTextContent('나1 나')
    expect(card.querySelector('.intonation-mark__sign svg')).toBeInTheDocument()
    expect(card.querySelector('[role="img"]')).toHaveAccessibleName('나, 낮추기, 1번')
    expect(card).toHaveTextContent('▼10')
    expect(card).toHaveTextContent('「나」 음절을 낮춰 보세요')
    expect(screen.getByRole('img', { name: '나, 낮추기, 1번' })).toHaveClass('intonation-mark--lower')
    fireEvent.click(card)
    expect(onOpen).toHaveBeenCalledWith(1)
  })

  it('첫 시도 대사의 카드는 증감 대신 「첫 기록」', () => {
    renderReport({ c0: done(50, [{ word: '가', raise: '가', lower: null, split: false }]), c1: done(80), c2: done(80) })
    expect(practiceCard()).toHaveTextContent('첫 기록')
  })
})

// ── 카드 피드백·결과 상세 (화면 단독) ─────────────────────────────────────

describe('카드 피드백 (s-19)·결과 상세 (s-08)', () => {
  const renderFeedback = (
    index: number,
    feedback: PitchFeedbackItem[],
    score = 78,
    previousScore: number | null = null,
    afterRecording = true,
  ) =>
    render(
      <IntonationFeedbackScreen
        course={COURSE}
        n={2}
        index={index}
        result={{ score, feedback, previousScore }}
        afterRecording={afterRecording}
        onBackToSummary={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
  const item = (word: string, raise: string | null, lower: string | null, split = false) => ({ word, raise, lower, split })

  it('카드 한 장에 문맥 줄 → 표준어 → 음절 표시 대사 → 점수 원·증감·지난번 점수, 그 아래 곡선 → 코멘트', () => {
    renderFeedback(0, [item('안녕하능교', '능', null)], 73, 64)
    const card = screen.getByRole('region', { name: '대사와 억양 학습 결과' })
    const order = [
      screen.getByText('억양 학습 2 · 1번째 대사'),
      screen.getByText('안녕하세요'),
      screen.getByRole('img', { name: '능, 더 높이기, 1번' }),
      screen.getByRole('group', { name: '억양 점수 73점, 지난번 64점보다 9점 상승' }),
      screen.getByRole('img', { name: '가이드 억양 곡선' }),
      screen.getByRole('list', { name: '어절별 교정 코멘트' }),
    ]
    for (const el of order.slice(0, 4)) expect(card).toContainElement(el)
    expect(card).toHaveTextContent('▲9')
    expect(card).toHaveTextContent('지난번 64점')
    expect(card.querySelector('.score-donut')).toHaveTextContent('73점')
    expect(screen.getByText('경남 화자 억양')).toBeInTheDocument()
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('첫 시도(previousScore null)면 증감 자리에 「첫 기록」, 지난번 점수 줄은 없다', () => {
    renderFeedback(1, [], 80, null)
    expect(screen.getByText('첫 기록')).toBeInTheDocument()
    expect(screen.queryByText(/지난번/)).toBeNull()
    expect(screen.getByRole('group', { name: '억양 점수 80점, 첫 기록' })).toBeInTheDocument()
  })

  it('내려간 점수는 ▼', () => {
    renderFeedback(1, [], 67, 70)
    expect(screen.getByText('▼3')).toBeInTheDocument()
  })

  it('올릴 음절 = 실선 밑줄 + ↑ + 번호, 내릴 음절 = 점선 밑줄 + ↓ + 번호, 번호는 코멘트 번호와 같고 대사는 문장 그대로 남는다', () => {
    renderFeedback(1, [item('밥', null, '밥'), item('뭇나', '뭇', '나')])
    const lower1 = screen.getByRole('img', { name: '밥, 낮추기, 1번' })
    const raise2 = screen.getByRole('img', { name: '뭇, 더 높이기, 2번' })
    const lower2 = screen.getByRole('img', { name: '나, 낮추기, 2번' })
    expect(lower1).toHaveClass('intonation-mark--lower')
    expect(raise2).toHaveClass('intonation-mark--raise')
    expect(raise2.querySelector('.intonation-mark__syllable')).toHaveTextContent('뭇')
    // 화살표는 글자가 아니라 SVG 선 아이콘이다(티켓 1-1) — 위·아래가 다른 그림이고 글자는 번호만
    const sign = (mark: HTMLElement) => mark.querySelector('.intonation-mark__sign')!
    expect(sign(raise2)).toHaveTextContent(/^2$/)
    expect(sign(lower2)).toHaveTextContent(/^2$/)
    const arrow = (mark: HTMLElement) => sign(mark).querySelector('svg path')!.getAttribute('d')
    expect(arrow(raise2)).not.toBe(arrow(lower2))
    expect(arrow(lower1)).toBe(arrow(lower2))
    // 기호·번호를 빼면 대사 원문 그대로
    const line = raise2.closest('h1')!.cloneNode(true) as HTMLElement
    line.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove())
    expect(line.textContent).toBe('밥 뭇나')
    // 코멘트 2번이 뭇나 — 대사 위 번호와 같다
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('뭇나: 「뭇」 음절을 더 높이고 「나」 음절은 낮춰 보세요')
  })

  it('코멘트는 번호 목록 — split 항목은 화자마다 다르다는 문장', () => {
    renderFeedback(1, [item('밥', '밥', null), item('뭇나', null, null, true)])
    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual(['밥: 「밥」 음절을 더 높여 보세요', '뭇나: 경남 화자마다 높이는 음절이 달라요. 편하게 말해도 괜찮아요'])
    expect(screen.getByRole('list').tagName).toBe('OL')
  })

  it('pitchFeedback이 비면 「높낮이 순서가 경남 화자와 같아요」', () => {
    renderFeedback(1, [], 80, null)
    expect(screen.getByText('높낮이 순서가 경남 화자와 같아요')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('카드 피드백: 주 버튼 [다시 말해 보기](마이크 아이콘), 글자 버튼 「결과 목록으로」가 아래', () => {
    renderFeedback(1, [])
    expect(buttonNames()).toEqual(['다시 말해 보기', '결과 목록으로'])
    const primary = screen.getByRole('button', { name: '다시 말해 보기' })
    expect(primary).toHaveClass('btn--primary')
    expect(primary.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: '결과 목록으로' })).toHaveClass('btn--text')
  })

  it('결과 상세: 「← 결과 목록으로」(SVG 화살표 글자 버튼)가 위, 아래는 주 버튼 [다시 말해 보기]만', () => {
    renderFeedback(1, [], 78, null, false)
    expect(buttonNames()).toEqual(['결과 목록으로', '다시 말해 보기'])
    const back = screen.getByRole('button', { name: '결과 목록으로' })
    expect(back).toHaveClass('btn--text')
    expect(back.querySelector('svg')).not.toBeNull()
  })
})

describe('게스트 로그인 안내 (KAN-330)', () => {
  it('서버 403 AUTH_GUEST_NOT_ALLOWED는 오류 대신 로그인 안내와 탭 바다', async () => {
    renderRoute({ '/intonation-courses/k1': fail(403, 'AUTH_GUEST_NOT_ALLOWED', '로그인이 필요한 기능입니다.', false) })
    expect(await screen.findByText('로그인하면 단어 학습과 억양 학습을 할 수 있어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인하기' })).toBeInTheDocument()
    expect(tabBar()).toBeInTheDocument()
  })

  it('게스트를 아는 앱이면 코스를 부르지 않는다', async () => {
    window.AccenturyBridge = { requestMicPermission: vi.fn(), startVoiceItem: vi.fn(), getContractVersion: () => 2, getAccountKind: () => 'guest' }
    const fetchImpl = vi.fn<FetchLike>()
    render(<IntonationLearningRoute apiBase="http://api" stamp={STAMP} courseStars={null} exits={newExits()} deps={deps(fetchImpl)} />)
    expect(await screen.findByText('로그인하면 단어 학습과 억양 학습을 할 수 있어요')).toBeInTheDocument()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
