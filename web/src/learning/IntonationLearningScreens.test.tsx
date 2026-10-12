/**
 * 억양 학습 A-1·A-2 (KAN-253 1·5단계). 상태별 출구, 카드 진입 때 녹음 화면 자동 호출이 정확히 1회인지
 * (StrictMode 포함), 일시정지 A-2의 [다시 말해 보기]·[코스 목록으로], 녹음 회신 뒤 자리 표시를 본다.
 * 네트워크는 deps.fetchImpl로 갈아끼운다.
 */

import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import { IntonationCardScreen, IntonationLearningRoute } from './IntonationLearningScreens'
import type { IntonationCourse } from './intonationApi'
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

describe('A-2 → 녹음 회신 → 자리 표시', () => {
  const ROUTES = { '/intonation-courses': ok(LIST), '/intonation-courses/k1': ok(COURSE) }
  const payload = (start: ReturnType<typeof vi.fn>, n: number) => JSON.parse(start.mock.calls[n][0])

  it('카드 진입 때 녹음 화면을 자동으로 1회 열고, 지금 카드의 회신만 자리 표시로 넘긴다. [다음 카드]에서 다시 1회 → 마지막 카드는 [코스 목록으로]', async () => {
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

    act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId: 'c1', attemptId: 'la_1' })))
    expect(screen.getByText('분석 중이에요')).toBeInTheDocument()
    expect(buttonNames()).toEqual(['다음 카드'])
    expect(start).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '다음 카드' }))
    expect(screen.getByRole('heading', { name: '밥 뭇나' })).toBeInTheDocument()
    expect(start).toHaveBeenCalledTimes(2)
    expect(payload(start, 1)).toMatchObject({ cardId: 'c2', standard: null, itemNumber: 2, totalItems: 2 })
    await waitFor(() => expect(window.AccenturyWeb?.onIntonationRecorded).toBeDefined())
    act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId: 'c2', attemptId: 'la_2' })))
    expect(buttonNames()).toEqual(['코스 목록으로'])
  })

  it('StrictMode에서도 카드 진입마다 자동 호출은 1회다', async () => {
    const start = vi.fn()
    withBridge(start)
    renderRoute(ROUTES, 'acc', true)
    fireEvent.click(await screen.findByRole('button', { name: /코스 k1/ }))
    await screen.findByRole('heading', { name: '안녕하능교' })
    await waitFor(() => expect(window.AccenturyWeb?.onIntonationRecorded).toBeDefined())
    expect(start).toHaveBeenCalledTimes(1)

    act(() => window.AccenturyWeb?.onIntonationRecorded?.(JSON.stringify({ cardId: 'c1', attemptId: 'la_1' })))
    fireEvent.click(screen.getByRole('button', { name: '다음 카드' }))
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
