/**
 * 억양 학습 A-1·A-2 (KAN-253 1·5단계)와 A-4 분석 대기·실패 출구 (KAN-254 2단계)·A-5 피드백 (3단계)·카드 연속 녹음과
 * 결과 목록 (5단계). 상태별 출구, 카드 진입·회신 뒤 녹음 화면 호출이 정확히 1회인지(StrictMode 포함), 일시정지 A-2의
 * [다시 말해 보기]·[코스 목록으로], 카드별 뒤 폴링 → 결과 목록 → 상세·다시 녹음을 본다.
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
  IntonationSummaryScreen,
} from './IntonationLearningScreens'
import type { CardResult } from './useIntonationLearning'
import type { IntonationCourse, PitchFeedbackItem } from './intonationApi'
import type { WordApiDeps } from './wordApi'

const GUIDE = { unit: 'semitone', frameIntervalMs: 10, values: [0, 1, null, 2] }

const course = (id: string, extra: Record<string, unknown> = {}) => ({
  courseId: id, seq: 1, level: 1, topic: null, title: `코스 ${id}`, cardCount: 2, completedCardCount: 0,
  completed: false, recommended: false, ...extra,
})

const LIST = {
  contentVersion: 'v1',
  courses: [course('k1', { recommended: true, topic: '인사' }), course('k2', { completedCardCount: 2, completed: true }), course('k3', { level: 2 })],
}

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

function renderRoute(routes: Record<string, Reply | Reply[]>, token: string | null = 'acc', strict = false) {
  const onLeave = vi.fn()
  const route = <IntonationLearningRoute apiBase="http://api" onLeave={onLeave} deps={deps(fakeServer(routes), token)} />
  render(strict ? <StrictMode>{route}</StrictMode> : route)
  return { onLeave }
}

/** 화면 안의 버튼 이름 목록 — 출구가 정확히 하나인지 볼 때 쓴다 */
const buttonNames = () => screen.queryAllByRole('button').map((b) => b.textContent)

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

// ── A-1 ─────────────────────────────────────────────────────────────────

describe('A-1 코스 목록', () => {
  it('로딩 중엔 버튼이 없다', () => {
    render(<IntonationLearningRoute apiBase="http://api" onLeave={vi.fn()} deps={deps(() => new Promise(() => {}))} />)
    expect(screen.getByText('불러오는 중이에요')).toBeInTheDocument()
    expect(buttonNames()).toEqual([])
  })

  it('레벨별로 묶고 추천은 1개만 강조, 완료 표시는 가볍게', async () => {
    renderRoute({ '/intonation-courses': ok(LIST) })
    expect(await screen.findByRole('heading', { name: '억양 학습' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '레벨 1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '레벨 2' })).toBeInTheDocument()

    const recommended = document.querySelectorAll('.word-set-row--recommended')
    expect(recommended).toHaveLength(1)
    expect(recommended[0]).toHaveTextContent('코스 k1')
    expect(recommended[0]).toHaveTextContent('추천')
    expect(recommended[0]).toHaveTextContent('인사')
    expect(screen.getByRole('button', { name: /코스 k1/ })).toHaveTextContent('0/2장')
    expect(screen.getByRole('button', { name: /코스 k2/ })).toHaveTextContent('완료')
  })

  it('추천이 없으면 아무것도 강조하지 않는다 (임시 첫 코스 추천을 쓰지 않는다)', async () => {
    renderRoute({ '/intonation-courses': ok({ contentVersion: 'v1', courses: [course('k1'), course('k2')] }) })
    await screen.findByRole('heading', { name: '억양 학습' })
    expect(document.querySelectorAll('.word-set-row--recommended')).toHaveLength(0)
  })

  it('빈 목록 → 「아직 준비 중인 코스예요」 + [학습 종류로] 하나', async () => {
    const { onLeave } = renderRoute({ '/intonation-courses': ok({ contentVersion: 'v1', courses: [] }) })
    expect(await screen.findByText('아직 준비 중인 코스예요')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['학습 종류로'])
    fireEvent.click(screen.getByRole('button', { name: '학습 종류로' }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('목록 실패 → [다시 시도] 하나, 누르면 다시 받는다', async () => {
    renderRoute({ '/intonation-courses': [fail(500, 'INTERNAL', '잠시 후 다시 시도해 주세요', false), ok(LIST)] })
    expect(await screen.findByText('잠시 후 다시 시도해 주세요')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['다시 시도'])
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('heading', { name: '억양 학습' })).toBeInTheDocument()
  })

  it('로그인 없음(CLIENT_NOT_SIGNED_IN) → 안내 + [학습 종류로] 하나', async () => {
    const { onLeave } = renderRoute({ '/intonation-courses': ok(LIST) }, null)
    expect(await screen.findByText('로그인하면 억양 학습을 할 수 있어요')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['학습 종류로'])
    fireEvent.click(screen.getByRole('button', { name: '학습 종류로' }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('UNAUTHENTICATED(갱신 실패) → 문구 그대로 + [학습 종류로] 하나', async () => {
    renderRoute({ '/intonation-courses': { status: 401, body: {} } })
    expect(await screen.findByText('로그인이 만료됐어요. 다시 로그인해 주세요')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['학습 종류로'])
  })
})

// ── A-2 (라우트 결선) ────────────────────────────────────────────────────

describe('A-2 카드 로드 실패', () => {
  it('retryable 실패 → [다시 시도] 하나, 누르면 카드가 열린다', async () => {
    renderRoute({
      '/intonation-courses': ok(LIST),
      '/intonation-courses/k1': [fail(503, 'SERVICE_UNAVAILABLE', '잠시 뒤에 다시 해 주세요', true), ok(COURSE)],
    })
    fireEvent.click(await screen.findByRole('button', { name: /코스 k1/ }))
    expect(await screen.findByText('잠시 뒤에 다시 해 주세요')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['다시 시도'])
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('heading', { name: '안녕하능교' })).toBeInTheDocument()
  })

  it('LEARNING_COURSE_NOT_FOUND → [코스 목록으로] 하나, 누르면 목록', async () => {
    renderRoute({
      '/intonation-courses': ok(LIST),
      '/intonation-courses/k1': fail(404, 'LEARNING_COURSE_NOT_FOUND', '없는 억양 코스입니다.', false),
    })
    fireEvent.click(await screen.findByRole('button', { name: /코스 k1/ }))
    expect(await screen.findByText('없는 억양 코스입니다.')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['코스 목록으로'])
    fireEvent.click(screen.getByRole('button', { name: '코스 목록으로' }))
    expect(await screen.findByRole('heading', { name: '억양 학습' })).toBeInTheDocument()
  })
})

const attempt = (attemptId: string, status: string, extra: Record<string, unknown> = {}) => ({
  attemptId, contentVersion: 'v1', cardId: 'c1', status, pollAfterMs: 1000, ...extra,
})
const completed = (attemptId: string, score = 80, previousScore: number | null = null) =>
  ok(attempt(attemptId, 'COMPLETED', { score, pitchFeedback: [], previousScore }))
const processing = (attemptId: string) => ok(attempt(attemptId, 'PROCESSING'))
const failed = (attemptId: string, code: string) => ok(attempt(attemptId, 'FAILED', { error: { code, retryable: false } }))

/** 지금 카드의 회신을 쏜다 — 수신 지점은 A-2 진입 뒤 이펙트에서 설치되므로 설치를 기다린다 */
async function reply(cardId: string, attemptId: string) {
  await waitFor(() => expect(window.AccenturyWeb?.onIntonationRecorded).toBeDefined())
  act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId, attemptId })))
}

describe('카드 연속 녹음 (KAN-254 5단계)', () => {
  const ROUTES = {
    '/intonation-courses': ok(LIST),
    '/intonation-courses/k1': ok(COURSE),
    '/intonation-attempts/la_1': completed('la_1'),
    '/intonation-attempts/la_2': completed('la_2', 72),
  }
  const payload = (start: ReturnType<typeof vi.fn>, n: number) => JSON.parse(start.mock.calls[n][0])

  it('카드 진입 때 녹음 화면을 자동으로 1회 열고, 지금 카드의 회신이 오면 대기·피드백 없이 바로 다음 카드 녹음 → 마지막 회신 뒤 결과 목록', async () => {
    const start = vi.fn()
    withBridge(start)
    renderRoute(ROUTES)
    fireEvent.click(await screen.findByRole('button', { name: /코스 k1/ }))
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
    expect(await screen.findByRole('heading', { name: '코스 k1 코스를 마쳤어요' })).toBeInTheDocument()
    expect(screen.getByText('평균 76점')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['1번 문항80점', '2번 문항72점', '코스 목록으로'])
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('StrictMode에서도 카드 진입·회신마다 녹음 호출은 1회다', async () => {
    const start = vi.fn()
    withBridge(start)
    renderRoute(ROUTES, 'acc', true)
    fireEvent.click(await screen.findByRole('button', { name: /코스 k1/ }))
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
      '/intonation-courses': ok(LIST),
      '/intonation-courses/k1': [fail(503, 'SERVICE_UNAVAILABLE', '잠시 뒤에 다시 해 주세요', true), ok(COURSE)],
    })
    fireEvent.click(await screen.findByRole('button', { name: /코스 k1/ }))
    await screen.findByText('잠시 뒤에 다시 해 주세요')
    expect(start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await screen.findByRole('heading', { name: '안녕하능교' })
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('녹음 화면을 닫고 돌아온 A-2(일시정지): 버튼은 [다시 말해 보기]·[코스 목록으로] 둘, 다시 말해 보기는 같은 카드로 다시 연다', async () => {
    const start = vi.fn()
    withBridge(start)
    renderRoute(ROUTES)
    fireEvent.click(await screen.findByRole('button', { name: /코스 k1/ }))
    await screen.findByRole('heading', { name: '안녕하능교' })
    expect(buttonNames()).toEqual(['다시 말해 보기', '코스 목록으로'])

    fireEvent.click(screen.getByRole('button', { name: '다시 말해 보기' }))
    expect(start).toHaveBeenCalledTimes(2)
    expect(payload(start, 1)).toEqual(payload(start, 0))

    fireEvent.click(screen.getByRole('button', { name: '코스 목록으로' }))
    expect(await screen.findByRole('heading', { name: '억양 학습' })).toBeInTheDocument()
  })

  it('브리지 없음(브라우저 단독): 카드는 그대로 열리고 [다시 말해 보기] 비활성', async () => {
    renderRoute(ROUTES)
    fireEvent.click(await screen.findByRole('button', { name: /코스 k1/ }))
    await screen.findByRole('heading', { name: '안녕하능교' })
    expect(screen.getByRole('button', { name: '다시 말해 보기' })).toBeDisabled()
    expect(screen.getByText('앱에서 녹음할 수 있어요')).toBeInTheDocument()
  })
})

// ── A-2 (화면 단독) ──────────────────────────────────────────────────────

describe('A-2 대사 카드', () => {
  const renderCard = (index: number) =>
    render(<IntonationCardScreen course={COURSE} index={index} onBackToList={vi.fn()} />)

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

  it('브리지에 startIntonationRecording이 없으면 [다시 말해 보기] 비활성 + 「앱에서 녹음할 수 있어요」, [코스 목록으로]는 살아 있다', () => {
    withBridge()
    renderCard(0)
    expect(screen.getByRole('button', { name: '다시 말해 보기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '코스 목록으로' })).toBeEnabled()
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
  ) {
    vi.useFakeTimers()
    withBridge(start)
    const calls: string[] = []
    const listCalls = vi.fn()
    const routes: Record<string, Reply | Reply[]> = { '/intonation-courses': ok(LIST), '/intonation-courses/k1': ok(COURSE) }
    for (const [id, r] of Object.entries(attempts)) routes[`/intonation-attempts/${id}`] = r
    const server = fakeServer(routes)
    const fetchImpl: FetchLike = (input, init) => {
      const path = new URL(input).pathname
      if (path.includes('/intonation-attempts/')) calls.push(path)
      if (path.endsWith('/intonation-courses')) listCalls()
      return hold?.(path) ?? server(input, init)
    }
    const view = render(<IntonationLearningRoute apiBase="http://api" onLeave={vi.fn()} deps={deps(fetchImpl)} />)
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: /코스 k1/ }))
    await act(async () => {})
    for (const [cardId, attemptId] of [['c1', 'la_1'], ['c2', 'la_2']].slice(0, cards)) {
      act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId, attemptId })))
      await act(async () => {}) // 첫 조회 응답·다음 카드 수신기 설치까지
    }
    return { calls, start, listCalls, unmount: view.unmount }
  }
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
  const stageOf = (label: string) => screen.getByText(label).closest('.analysis-step')?.getAttribute('data-state')
  const row = (label: string) => screen.getByRole('button', { name: new RegExp(label) })
  const SUMMARY = '코스 k1 코스를 마쳤어요'

  afterEach(() => vi.useRealTimers())

  it('카드마다 뒤에서 따로 폴링 — 마지막 회신 뒤 분석 중이 남으면 A-4(단계 1, 버튼 없음) → 모두 끝나면 목록', async () => {
    const { calls } = await toEnd({
      la_1: completed('la_1', 91),
      la_2: [processing('la_2'), processing('la_2'), processing('la_2'), completed('la_2', 64)],
    })
    expect(screen.getByText('분석 중이에요')).toBeInTheDocument()
    expect(stageOf('곡선 추출')).toBe('current')
    expect(stageOf('점수 계산')).toBe('todo')
    expect(buttonNames()).toEqual([])
    expect(calls).toEqual(['/v0/learning/intonation-attempts/la_1', '/v0/learning/intonation-attempts/la_2'])

    await advance(20_000)
    expect(calls.filter((p) => p.endsWith('/la_1'))).toHaveLength(1)
    expect(calls.filter((p) => p.endsWith('/la_2'))).toHaveLength(4)
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
    expect(screen.getByText('평균 78점')).toBeInTheDocument() // (91 + 64) / 2 = 77.5 → 반올림
    expect(row('1번 문항')).toHaveTextContent('91점')
    expect(row('2번 문항')).toHaveTextContent('64점')
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

  it('완료 행 → A-5 (버튼 [결과 목록으로]·[다시 시도]) → [결과 목록으로]', async () => {
    await toEnd({ la_1: completed('la_1', 80), la_2: completed('la_2', 72) })
    fireEvent.click(row('1번 문항'))
    expect(screen.getByText('억양 점수')).toBeInTheDocument()
    expect(screen.getByText('80점')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['결과 목록으로', '다시 시도'])
    fireEvent.click(screen.getByRole('button', { name: '결과 목록으로' }))
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
  })

  it('A-5 [다시 시도] → 같은 카드 녹음(복귀 모드) → 그 카드 1건 대기 → A-5에 직전 대비 → 목록 행·평균 갱신', async () => {
    const { start } = await toEnd({
      la_1: completed('la_1', 80),
      la_2: completed('la_2', 72),
      la_3: [processing('la_3'), completed('la_3', 86, 80)],
    })
    fireEvent.click(row('1번 문항'))
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(start).toHaveBeenCalledTimes(3)
    expect(JSON.parse(start.mock.calls[2][0]).cardId).toBe('c1')
    // 회신 없이 닫아도 막히지 않게 복귀 모드 A-2의 출구는 [결과 목록으로]
    expect(screen.getByRole('heading', { name: '안녕하능교' })).toBeInTheDocument()
    expect(buttonNames()).toEqual(['다시 말해 보기', '결과 목록으로'])

    await act(async () => {})
    act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId: 'c1', attemptId: 'la_3' })))
    await act(async () => {})
    expect(screen.getByText('분석 중이에요')).toBeInTheDocument()
    expect(start).toHaveBeenCalledTimes(3) // 복귀 모드는 다음 카드로 넘어가지 않는다
    await advance(2_000)
    expect(screen.getByText('86점')).toBeInTheDocument()
    expect(screen.getByText('지난번보다 +6점')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '결과 목록으로' }))
    expect(row('1번 문항')).toHaveTextContent('86점')
    expect(screen.getByText('평균 79점')).toBeInTheDocument()
  })

  it('복귀 모드 A-2에서 회신 없이 [결과 목록으로] → 목록, 행은 그대로', async () => {
    await toEnd({ la_1: completed('la_1', 80), la_2: completed('la_2', 72) })
    fireEvent.click(row('1번 문항'))
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    fireEvent.click(screen.getByRole('button', { name: '결과 목록으로' }))
    expect(screen.getByRole('heading', { name: SUMMARY })).toBeInTheDocument()
    expect(row('1번 문항')).toHaveTextContent('80점')
  })

  it.each([
    ['ANALYSIS_MISREAD', '제시된 문장과 다르게 들렸어요', true],
    ['AUDIO_TOO_QUIET', '목소리가 작게 들렸어요', true],
    ['SOMETHING_ELSE', '분석하지 못했어요. 다시 녹음해 주세요', false],
  ])('%s 행 「다시 녹음 필요」 → 문구 + [다시 녹음]·[결과 목록으로] → 같은 카드 녹음 1회', async (code, message, showsLine) => {
    const { start } = await toEnd({ la_1: completed('la_1', 80), la_2: failed('la_2', code) })
    expect(row('2번 문항')).toHaveTextContent('다시 녹음 필요')
    expect(screen.getByText('평균 80점')).toBeInTheDocument()
    fireEvent.click(row('2번 문항'))
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(buttonNames()).toEqual(['다시 녹음', '결과 목록으로'])
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
    expect(row('2번 문항')).toHaveTextContent('확인 필요')
    const before = calls.length
    await advance(20_000)
    expect(calls).toHaveLength(before) // 소진 뒤엔 자동 조회가 없다

    fireEvent.click(row('2번 문항'))
    expect(screen.getByText('분석이 예상보다 오래 걸리고 있어요')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['다시 시도', '결과 목록으로'])
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
    expect(row('2번 문항')).toHaveTextContent('70점')
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
    expect(row('2번 문항')).toHaveTextContent('확인 필요')

    fireEvent.click(row('2번 문항'))
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await act(async () => {})
    expect(screen.getByText('70점')).toBeInTheDocument()
  })

  it('deadline 뒤 늦게 온 응답은 「확인 필요」를 덮지 않는다', async () => {
    const { hold, release } = holdFirst('/la_2')
    await toEnd({ la_1: completed('la_1', 80), la_2: completed('la_2', 70) }, vi.fn(), 2, hold)
    await advance(60_000)
    expect(row('2번 문항')).toHaveTextContent('확인 필요')
    release(completed('la_2', 99))
    await advance(10_000)
    expect(row('2번 문항')).toHaveTextContent('확인 필요')
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
    fireEvent.click(row('1번 문항'))
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' })) // 같은 la_1 재폴링
    await act(async () => {})
    expect(screen.getByText('80점')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' })) // A-5 → 같은 카드 다시 녹음
    await act(async () => {})
    act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId: 'c1', attemptId: 'la_3' })))
    await act(async () => {})
    expect(screen.getByText('86점')).toBeInTheDocument()

    release(completed('la_1', 10))
    await advance(10_000)
    expect(screen.getByText('86점')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '결과 목록으로' }))
    expect(row('1번 문항')).toHaveTextContent('86점')
  })

  it('[코스 목록으로] → 목록을 다시 받는다 (완료 저장 호출 없음)', async () => {
    const { listCalls, calls } = await toEnd({ la_1: completed('la_1'), la_2: completed('la_2', 72) })
    expect(listCalls).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '코스 목록으로' }))
    await act(async () => {})
    expect(screen.getByRole('heading', { name: '억양 학습' })).toBeInTheDocument()
    expect(listCalls).toHaveBeenCalledTimes(2)
    expect(calls).toHaveLength(2)
  })

  it('403 → 기존 오류 화면, [코스 목록으로] 하나', async () => {
    await toEnd({ la_1: fail(403, 'LEARNING_ATTEMPT_FORBIDDEN', '내 시도가 아니에요', false) }, vi.fn(), 1)
    expect(screen.getByText('내 시도가 아니에요')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['코스 목록으로'])
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
    expect(row('1번 문항')).toHaveTextContent('65점')
  })

  it('언마운트하면 진행 중인 폴링을 모두 멈춘다', async () => {
    const { calls, unmount } = await toEnd({ la_1: processing('la_1'), la_2: processing('la_2') })
    expect(calls).toHaveLength(2)
    unmount()
    await advance(30_000)
    expect(calls).toHaveLength(2)
  })

  it('코스 중간에 [코스 목록으로]로 나가면 뒤 폴링을 멈춘다', async () => {
    const { calls } = await toEnd({ la_1: processing('la_1') }, vi.fn(), 1)
    expect(screen.getByRole('heading', { name: '밥 뭇나' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '코스 목록으로' }))
    await act(async () => {})
    const before = calls.length
    await advance(30_000)
    expect(calls).toHaveLength(before)
  })
})

// ── 결과 목록 (화면 단독) ────────────────────────────────────────────────

describe('결과 목록', () => {
  const COURSE5: IntonationCourse = {
    ...COURSE,
    cards: ['가', '나', '다', '라', '마'].map((d, i) => ({ ...COURSE.cards[1], cardId: `c${i}`, seq: i, dialect: d })),
  }
  const done = (score: number): CardResult => ({ attemptId: 'a', outcome: 'completed', score, feedback: [], previousScore: null })

  it('heading·평균(완료만, 반올림)·행 상태 4종, 하단 [코스 목록으로]', () => {
    const onOpen = vi.fn()
    render(
      <IntonationSummaryScreen
        course={COURSE5}
        results={{
          c0: done(81),
          c1: { attemptId: 'a', outcome: 'processing' },
          c2: { attemptId: 'a', outcome: 'quiet' },
          c3: { attemptId: 'a', outcome: 'timeout' },
          c4: done(70),
        }}
        onOpen={onOpen}
        onBackToList={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: '코스 k1 코스를 마쳤어요' })).toBeInTheDocument()
    expect(screen.getByText('평균 76점')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['1번 문항81점', '2번 문항분석 중', '3번 문항다시 녹음 필요', '4번 문항확인 필요', '5번 문항70점', '코스 목록으로'])
    fireEvent.click(screen.getByRole('button', { name: /^4/ }))
    expect(onOpen).toHaveBeenCalledWith(3)
  })

  it('완료 카드가 없으면 평균 줄이 없다', () => {
    render(
      <IntonationSummaryScreen
        course={COURSE}
        results={{ c1: { attemptId: 'a', outcome: 'failed' }, c2: { attemptId: 'b', outcome: 'misread' } }}
        onOpen={vi.fn()}
        onBackToList={vi.fn()}
      />,
    )
    expect(screen.queryByText(/평균/)).toBeNull()
  })
})
// ── A-5 피드백 (KAN-254 3단계, 화면 단독) ────────────────────────────────

describe('A-5 피드백', () => {
  const renderFeedback = (
    index: number,
    feedback: PitchFeedbackItem[],
    score = 78,
    previousScore: number | null = null,
  ) =>
    render(
      <IntonationFeedbackScreen
        course={COURSE}
        index={index}
        result={{ score, feedback, previousScore }}
        onBackToSummary={vi.fn()}
        onRetry={vi.fn()}
      />,
    )
  const item = (word: string, raise: string | null, lower: string | null, split = false) => ({ word, raise, lower, split })

  it('위→아래 점수 → 대사 → 곡선 → 코멘트 → 직전 대비', () => {
    renderFeedback(1, [item('뭇나', '뭇', null)], 78, 72)
    const order = [
      screen.getByText('78점'),
      screen.getByRole('img', { name: '뭇, 더 높이기, 1번' }),
      screen.getByRole('img', { name: '가이드 억양 곡선' }),
      screen.getByRole('list'),
      screen.getByText('지난번보다 +6점'),
    ]
    expect(screen.getByText('억양 점수')).toBeInTheDocument()
    expect(screen.getByText('경남 화자 억양')).toBeInTheDocument()
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('raise·lower 글자를 기호·번호와 함께 강조하고, 대사는 문장 그대로 남는다', () => {
    renderFeedback(1, [item('밥', null, '밥'), item('뭇나', '뭇', '나')])
    const lower1 = screen.getByRole('img', { name: '밥, 낮추기, 1번' })
    const raise2 = screen.getByRole('img', { name: '뭇, 더 높이기, 2번' })
    const lower2 = screen.getByRole('img', { name: '나, 낮추기, 2번' })
    expect(lower1).toHaveClass('intonation-mark--lower')
    expect(raise2).toHaveClass('intonation-mark--raise')
    expect(raise2.querySelector('[aria-hidden="true"]')).toHaveTextContent('↑2')
    expect(lower2.querySelector('[aria-hidden="true"]')).toHaveTextContent('↓2')
    // 기호·번호를 빼면 대사 원문 그대로
    const line = raise2.closest('p')!.cloneNode(true) as HTMLElement
    line.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove())
    expect(line.textContent).toBe('밥 뭇나')
  })

  it('표준어가 있으면 대사 위에 작게 보인다', () => {
    renderFeedback(0, [])
    expect(screen.getByText('안녕하세요')).toBeInTheDocument()
  })

  it('코멘트는 번호 목록 — split 항목은 화자마다 다르다는 문장', () => {
    renderFeedback(1, [item('밥', '밥', null), item('뭇나', null, null, true)])
    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual([
      "밥: '밥' 음절을 더 높여 보세요",
      '뭇나: 경남 화자마다 높이는 음절이 달라요. 편하게 말해도 괜찮아요',
    ])
    expect(screen.getByRole('list').tagName).toBe('OL')
  })

  it('pitchFeedback이 비면 「높낮이 순서가 경남 화자와 같아요」, previousScore null이면 직전 대비 없음', () => {
    renderFeedback(1, [], 80, null)
    expect(screen.getByText('높낮이 순서가 경남 화자와 같아요')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByText(/지난번/)).toBeNull()
  })

  it.each([
    [78, 72, '지난번보다 +6점', '지난번 72점에서 78점'],
    [70, 76, '지난번보다 −6점', '지난번 76점에서 70점'],
  ])('직전 대비 %i vs %i → 부호로만', (score, prev, text, label) => {
    renderFeedback(1, [], score, prev)
    expect(screen.getByText(text)).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText(label)).toHaveClass('sr-only')
  })
})

