/**
 * 단어 스탬프 (KAN-255 3단계 → KAN-347 4단계: 카드·문항 5초 제한·피드백·성적표). 훅의 전체 순환, 화면별 계약, 상태별 출구를 본다.
 * 네트워크는 deps.fetchImpl로 갈아끼운다 — 경로·메서드별로 응답을 고르는 작은 가짜 서버다.
 */

import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import { useWordLearning, type WordLearningView } from './useWordLearning'
import { WordLearningRoute, WordQuizScreen, WordReportScreen, quotePrompt } from './WordLearningScreens'
import type { WordApiDeps } from './wordApi'
import { LEVELS_TIMEOUT_MS, type CourseStarsChange } from './travel'
import { WORD_TIME_LIMIT_MS, pauseCountdown, remainingMs, resumeCountdown } from './wordTimer'

/** 코스 1의 「단어 학습 2」 */
const STAMP = { kind: 'word' as const, id: 's1', course: 1, n: 2 }

const SET = {
  contentVersion: 'v1',
  setId: 's1',
  seq: 1,
  level: 1,
  category: '음식',
  title: '먹을 것',
  cards: [
    { cardId: 'c1', standard: '부추', dialect: '정구지' },
    { cardId: 'c2', standard: '뭐 하니', dialect: '머하노' },
  ],
  items: [
    { itemId: 'i1', seq: 1, cardId: 'c1', prompt: '부추를 사투리로?', choices: [{ choiceId: 'i1a', text: '정구지' }, { choiceId: 'i1b', text: '시금치' }] },
    { itemId: 'i2', seq: 2, cardId: 'c2', prompt: '뭐 하니를 사투리로?', choices: [{ choiceId: 'i2a', text: '머하노' }, { choiceId: 'i2b', text: '머꼬' }] },
  ],
}
const ATTEMPT = { attemptId: 'a1', contentVersion: 'v1', setId: 's1', itemCount: 2, startedAt: '2026-10-08T00:00:00Z' }
const answer = (correct: boolean, correctChoiceId: string, correctText: string, answeredCount: number) => ({
  correct, correctChoiceId, correctText, explanation: `${correctText}가 맞아요`, answeredCount, itemCount: 2,
})
const RESULT = {
  attemptId: 'a1',
  contentVersion: 'v1',
  setId: 's1',
  itemCount: 2,
  correctCount: 1,
  accuracyPercent: 50,
  wrongItems: [
    {
      itemId: 'i2', cardId: 'c2', prompt: '뭐 하니를 사투리로?', chosenChoiceId: 'i2b', chosenText: '머꼬',
      correctChoiceId: 'i2a', correctText: '머하노', explanation: '머하노가 맞아요',
    },
  ],
  completedAt: '2026-10-08T00:05:00Z',
}

type Reply = { status: number; body: unknown } | 'network' | 'hang'
const ok = (body: unknown, status = 200): Reply => ({ status, body })
const fail = (status: number, code: string, message: string, retryable: boolean): Reply => ({
  status,
  body: { code, message, retryable, retryAfterMs: null, correlationId: 'c' },
})

/**
 * 경로 끝부분으로 응답을 고른다. 값이 배열이면 부를 때마다 앞에서 하나씩 꺼낸다(마지막은 남긴다).
 * 호출 기록은 [calls]에 쌓인다.
 */
function fakeServer(routes: Record<string, Reply | Reply[]>) {
  const calls: { method: string; path: string; headers: Record<string, string>; body?: string }[] = []
  const fetchImpl: FetchLike = async (input, init) => {
    const path = new URL(input).pathname
    calls.push({ method: init?.method ?? 'GET', path, headers: init?.headers as Record<string, string>, body: init?.body as string })
    const key = Object.keys(routes).find((k) => path.endsWith(k))
    if (key === undefined) throw new Error(`라우트 없음: ${path}`)
    const entry = routes[key]
    const reply = Array.isArray(entry) ? (entry.length > 1 ? entry.shift()! : entry[0]) : entry
    if (reply === 'network') throw new TypeError('Failed to fetch')
    if (reply === 'hang') return new Promise<Response>(() => {})
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body } as Response
  }
  return { fetchImpl, calls }
}

function deps(fetchImpl: FetchLike, token: string | null = 'acc'): WordApiDeps {
  return { fetchImpl, getToken: () => token, refreshToken: async () => false }
}

const happyRoutes = () => ({
  '/word-sets/s1': ok(SET),
  '/word-sets/s1/attempts': ok(ATTEMPT, 201),
  '/items/i1/answer': ok(answer(true, 'i1a', '정구지', 1)),
  '/items/i2/answer': ok(answer(false, 'i2a', '머하노', 2)),
  '/complete': ok(RESULT),
})

afterEach(() => {
  delete window.AccenturyBridge
})

// ── 훅 ──────────────────────────────────────────────────────────────────

describe('useWordLearning', () => {
  it('세트 하나로 W-2(마지막 카드에서 문제 풀기) → W-3/W-4(마지막 문항에서 결과 보기) → W-5를 돈다 — 목록은 부르지 않는다', async () => {
    const hapticSpy = vi.fn()
    window.AccenturyBridge = { requestMicPermission: vi.fn(), startVoiceItem: vi.fn(), getContractVersion: () => 2, haptic: hapticSpy }
    const server = fakeServer(happyRoutes())
    const { result } = renderHook(() => useWordLearning('http://api', 's1', deps(server.fetchImpl)))
    const view = () => result.current.view

    await waitFor(() => expect(view()).toMatchObject({ screen: 'cards', index: 0 }))
    act(() => result.current.nextCard())
    expect(view()).toMatchObject({ screen: 'cards', index: 1 })

    // 마지막 카드의 [문제 풀기]가 시도를 시작한다
    act(() => result.current.startQuiz())
    await waitFor(() => expect(view()).toMatchObject({ screen: 'quiz', attemptId: 'a1', index: 0, result: null }))

    // 제출 성공은 W-4에서 멈춘다 — index가 그대로다
    await act(() => result.current.submit('i1a', 'k1'))
    expect(view()).toMatchObject({ screen: 'quiz', index: 0, result: { correct: true } })
    act(() => result.current.nextItem())
    expect(view()).toMatchObject({ screen: 'quiz', index: 1, result: null })
    await act(() => result.current.submit('i2b', 'k2'))
    expect(view()).toMatchObject({ screen: 'quiz', index: 1, result: { correct: false } })
    // 정오가 정해지는 순간 한 번씩 (KAN-258)
    expect(hapticSpy.mock.calls).toEqual([['success'], ['error']])

    // 마지막 문항 다음은 완료 요청
    act(() => result.current.nextItem())
    await waitFor(() => expect(view()).toMatchObject({ screen: 'complete', result: { accuracyPercent: 50 } }))
    expect(server.calls.filter((c) => c.path.endsWith('/word-sets'))).toHaveLength(0)
    expect(server.calls.map((c) => `${c.method} ${c.path}`)).toContain('POST /v0/learning/word-attempts/a1/complete')
  })

  it('시도가 무너진 code(LEARNING_ATTEMPT_*)의 [다시 시도]는 같은 세트를 처음부터 다시 연다', async () => {
    const server = fakeServer({
      ...happyRoutes(),
      '/items/i1/answer': fail(409, 'LEARNING_ATTEMPT_EXPIRED', '시도가 끝났어요', true),
    })
    const { result } = renderHook(() => useWordLearning('http://api', 's1', deps(server.fetchImpl)))
    const view = () => result.current.view
    await waitFor(() => expect(view().screen).toBe('cards'))
    act(() => result.current.nextCard())
    act(() => result.current.startQuiz())
    await waitFor(() => expect(view().screen).toBe('quiz'))
    await act(() => result.current.submit('i1a', 'k1'))
    expect(view().screen).toBe('error')
    act(() => (view() as Extract<WordLearningView, { screen: 'error' }>).retry())
    await waitFor(() => expect(view()).toMatchObject({ screen: 'cards', index: 0 }))
    expect(server.calls.filter((c) => c.path.endsWith('/word-sets/s1'))).toHaveLength(2)
  })
})

// ── 라우트 (화면 결선) ───────────────────────────────────────────────────

function renderRoute(
  routes: Record<string, Reply | Reply[]>,
  token: string | null = 'acc',
  options: { courseStars?: { collected: number; required: number } | null; timeLimitMs?: number | null } = {},
) {
  const server = fakeServer(routes)
  const exits = { toMap: vi.fn(), toNextStamp: vi.fn() }
  // 탭 바 자리 표시 — 어느 단계에서 그려지는지만 본다 (탭 바 자체는 `ui/TabBar.test.tsx`)
  render(
    <WordLearningRoute
      apiBase="http://api"
      stamp={STAMP}
      courseStars={options.courseStars ?? null}
      exits={exits}
      tabBar={<nav aria-label="탭 바" />}
      deps={deps(server.fetchImpl, token)}
      timeLimitMs={options.timeLimitMs ?? null}
    />,
  )
  return { ...server, exits }
}

const tabBar = () => screen.queryByRole('navigation', { name: '탭 바' })

describe('WordLearningRoute', () => {
  it('받은 세트의 카드로 바로 들어가고, 카드·문항에는 탭 바가 없다 (KAN-147)', async () => {
    renderRoute(happyRoutes())
    expect(await screen.findByText('정구지')).toBeInTheDocument()
    expect(tabBar()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '다음 카드' }))
    fireEvent.click(screen.getByRole('button', { name: '문제 풀기' }))
    expect(await screen.findByRole('radiogroup', { name: '부추를 사투리로?' })).toBeInTheDocument()
    expect(tabBar()).toBeNull()
  })

  it('카드(s-12)는 「단어 1 / 2」 진행 표시, 표준어·사투리 라벨과 낱말을 보이고 마지막 카드에서만 [문제 풀기]다 (4-1)', async () => {
    renderRoute(happyRoutes())
    expect(await screen.findByText('정구지')).toBeInTheDocument()
    expect(screen.getByText('부추')).toBeInTheDocument()
    expect(screen.getByText('표준어')).toBeInTheDocument()
    expect(screen.getByText('사투리')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '단어' })).toHaveAttribute('aria-valuenow', '1')
    expect(document.querySelector('.progress-indicator__count')).toHaveTextContent('1 / 2')
    expect(screen.getByRole('button', { name: '다음 카드' }).querySelector('svg')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '다음 카드' }))
    expect(screen.getByText('머하노')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '문제 풀기' }))
    expect(await screen.findByRole('radiogroup', { name: '부추를 사투리로?' })).toBeInTheDocument()
  })

  it('카드 로드 실패면 [다시 시도]가 같은 세트를 다시 부른다', async () => {
    renderRoute({ ...happyRoutes(), '/word-sets/s1': [fail(503, 'SERVICE_UNAVAILABLE', '잠시 뒤 다시 시도해 주세요', true), ok(SET)] })
    expect(await screen.findByRole('alert')).toHaveTextContent('잠시 뒤 다시 시도해 주세요')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('정구지')).toBeInTheDocument()
  })

  it('재시도로 안 풀리는 code(LEARNING_SET_NOT_FOUND)면 [지도로]다 (KAN-347 3-8)', async () => {
    const { exits } = renderRoute({ ...happyRoutes(), '/word-sets/s1': fail(404, 'LEARNING_SET_NOT_FOUND', '세트를 찾을 수 없어요', false) })
    expect(await screen.findByRole('alert')).toHaveTextContent('세트를 찾을 수 없어요')
    fireEvent.click(screen.getByRole('button', { name: '지도로' }))
    expect(exits.toMap).toHaveBeenCalledTimes(1)
  })

  it('CLIENT_NOT_SIGNED_IN이면 로그인 안내와 탭 바다 (네트워크 없이)', async () => {
    const { calls } = renderRoute(happyRoutes(), null)
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인하면 단어 학습을 할 수 있어요')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(tabBar()).not.toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('iOS 첫 문서처럼 빈 토큰으로 시작해 300ms 뒤 주입되면 로그인 안내 없이 카드가 뜬다 (KAN-255 리뷰 P0)', async () => {
    let token = ''
    window.AccenturyBridge = { requestMicPermission: vi.fn(), startVoiceItem: vi.fn(), getContractVersion: () => 2, getAccessToken: () => token }
    setTimeout(() => (token = 'acc-late'), 300)
    const server = fakeServer(happyRoutes())
    // getToken을 주입하지 않는다 — 기본 공급(브리지 대기)을 타야 한다
    render(
      <WordLearningRoute
        apiBase="http://api"
        stamp={STAMP}
        courseStars={null}
        exits={{ toMap: vi.fn(), toNextStamp: vi.fn() }}
        deps={{ fetchImpl: server.fetchImpl, refreshToken: async () => false }}
      />,
    )

    expect(await screen.findByText('정구지', {}, { timeout: 2_000 })).toBeInTheDocument()
    expect(screen.queryByText('로그인하면 단어 학습을 할 수 있어요')).toBeNull()
    expect(server.calls[0].headers.Authorization).toBe('Bearer acc-late')
  })

  it('UNAUTHENTICATED면 오류 문구 그대로와 탭 바다', async () => {
    renderRoute({ '/word-sets/s1': { status: 401, body: {} } })
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인이 만료됐어요. 다시 로그인해 주세요')
    expect(tabBar()).not.toBeNull()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  /** W-2 마지막 카드 → [문제 풀기]까지 누른다 */
  async function clickStartQuiz() {
    fireEvent.click(await screen.findByRole('button', { name: '다음 카드' }))
    fireEvent.click(screen.getByRole('button', { name: '문제 풀기' }))
  }

  /** W-3 두 문항을 다 풀고 [결과 보기]까지 누른다 */
  async function answerAllAndShowResult() {
    fireEvent.click(await screen.findByRole('radio', { name: '정구지' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    fireEvent.click(await screen.findByRole('button', { name: '다음 문항' }))
    fireEvent.click(await screen.findByRole('radio', { name: '머꼬' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    fireEvent.click(await screen.findByRole('button', { name: '결과 보기' }))
  }

  it('시도 시작 실패면 오류 문구와 [다시 시도], 성공하면 W-3 첫 문항이다', async () => {
    const { calls } = renderRoute({
      ...happyRoutes(),
      '/word-sets/s1/attempts': [fail(503, 'SERVICE_UNAVAILABLE', '잠시 뒤 다시 시도해 주세요', true), ok(ATTEMPT, 201)],
    })
    await clickStartQuiz()
    expect(await screen.findByRole('alert')).toHaveTextContent('잠시 뒤 다시 시도해 주세요')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('radiogroup', { name: '부추를 사투리로?' })).toBeInTheDocument()
    expect(calls.filter((c) => c.path.endsWith('/attempts'))).toHaveLength(2)
  })

  it('시도 시작이 재시도로 안 풀리는 code(LEARNING_ATTEMPT_FORBIDDEN)면 [지도로]다', async () => {
    const { exits } = renderRoute({
      ...happyRoutes(),
      '/word-sets/s1/attempts': fail(403, 'LEARNING_ATTEMPT_FORBIDDEN', '이 학습을 시작할 수 없어요', false),
    })
    await clickStartQuiz()
    expect(await screen.findByRole('alert')).toHaveTextContent('이 학습을 시작할 수 없어요')
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '지도로' }))
    expect(exits.toMap).toHaveBeenCalledTimes(1)
  })

  it('완료 실패면 오류 문구와 [다시 시도], 성공하면 성적표다', async () => {
    const { calls } = renderRoute({ ...happyRoutes(), '/complete': ['network', ok(RESULT)] })
    await clickStartQuiz()
    await answerAllAndShowResult()
    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('heading', { level: 1, name: '단어 학습 2 결과' })).toBeInTheDocument()
    expect(screen.getByText('1 / 2 정답 · 정답률 50%')).toBeInTheDocument()
    expect(calls.filter((c) => c.path.endsWith('/complete'))).toHaveLength(2)
  })

  it('완료가 재시도로 안 풀리는 code(LEARNING_ATTEMPT_FORBIDDEN)면 [지도로]다', async () => {
    const { exits } = renderRoute({ ...happyRoutes(), '/complete': fail(403, 'LEARNING_ATTEMPT_FORBIDDEN', '이 학습에 접근할 수 없어요', false) })
    await clickStartQuiz()
    await answerAllAndShowResult()
    expect(await screen.findByRole('alert')).toHaveTextContent('이 학습에 접근할 수 없어요')
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '지도로' }))
    expect(exits.toMap).toHaveBeenCalledTimes(1)
  })

  it('제출 중 UNAUTHENTICATED도 같은 출구다', async () => {
    renderRoute({ ...happyRoutes(), '/items/i1/answer': { status: 401, body: {} } })
    fireEvent.click(await screen.findByRole('button', { name: '다음 카드' }))
    fireEvent.click(screen.getByRole('button', { name: '문제 풀기' }))
    fireEvent.click(await screen.findByRole('radio', { name: '정구지' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인이 만료됐어요. 다시 로그인해 주세요')
    expect(tabBar()).not.toBeNull()
  })

  it('카드·퀴즈엔 오른쪽 위 ✕(닫기)가 있고 누르면 지도로 간다, 성적표엔 없고 「지도로」가 같은 길, [다음 스탬프]는 toNextStamp다 (KAN-252, 3-8, 4-4)', async () => {
    const { exits } = renderRoute(happyRoutes())
    const close = () => screen.queryByRole('button', { name: '닫기' })
    expect(await screen.findByText('정구지')).toBeInTheDocument()
    fireEvent.click(close()!)
    expect(exits.toMap).toHaveBeenCalledTimes(1)

    await clickStartQuiz()
    expect(await screen.findByRole('radiogroup', { name: '부추를 사투리로?' })).toBeInTheDocument()
    fireEvent.click(close()!)
    expect(exits.toMap).toHaveBeenCalledTimes(2)

    await answerAllAndShowResult()
    expect(await screen.findByRole('heading', { name: '단어 학습 2 결과' })).toBeInTheDocument()
    expect(close()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '지도로' }))
    expect(exits.toMap).toHaveBeenCalledTimes(3)
    expect(exits.toNextStamp).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '다음 스탬프' }))
    expect(exits.toNextStamp).toHaveBeenCalledTimes(1)
    expect(exits.toMap).toHaveBeenCalledTimes(3)
  })
})

// ── W-3·W-4 ─────────────────────────────────────────────────────────────

describe('WordQuizScreen', () => {
  const item = SET.items[0]

  function renderQuiz(props: { result?: ReturnType<typeof answer> | null; submit?: (c: string | null, k: string) => Promise<void> } = {}) {
    const submit = vi.fn(props.submit ?? (async () => {}))
    const onNext = vi.fn()
    const view = render(
      <WordQuizScreen item={item} itemNumber={1} totalItems={2} result={props.result ?? null} submit={submit} onNext={onNext} />,
    )
    return { submit, onNext, view }
  }

  it('문항(s-13): 고르기 전에는 [제출](체크 아이콘)이 비활성이고, 「단어 1 / 2」 진행 표시가 보인다', () => {
    renderQuiz()
    expect(screen.getByRole('button', { name: '제출' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '제출' }).querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('progressbar', { name: '단어' })).toHaveAttribute('aria-valuenow', '1')
    expect(document.querySelector('.progress-indicator__count')).toHaveTextContent('1 / 2')
    // 제한 시간이 꺼져 있으면(기본, KAN-360 전) 막대가 없다
    expect(screen.queryByRole('timer')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: '정구지' }))
    expect(screen.getByRole('button', { name: '제출' })).toBeEnabled()
    // 제출 전에는 정오 클래스가 없다
    expect(document.querySelector('[class*="correct"], [class*="wrong"]')).toBeNull()
  })

  it('제출 직후엔 다음 문항으로 넘어가지 않는다 — 넘김은 W-4의 [다음 문항]만 한다', async () => {
    const { submit, onNext, view } = renderQuiz()
    fireEvent.click(screen.getByRole('radio', { name: '정구지' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    await act(async () => {})
    expect(submit).toHaveBeenCalledWith('i1a', expect.any(String))
    expect(onNext).not.toHaveBeenCalled()

    view.rerender(
      <WordQuizScreen item={item} itemNumber={1} totalItems={2} result={answer(true, 'i1a', '정구지', 1)} submit={submit} onNext={onNext} />,
    )
    expect(onNext).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '다음 문항' }))
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('W-4 정답: ✓ 아이콘과 「정답」 글자, 보기는 잠기고 정답 보기에 「정답」 표시', () => {
    renderQuiz({ result: answer(true, 'i1a', '정구지', 1) })
    const verdict = screen.getByRole('status')
    expect(verdict).toHaveTextContent('정답')
    expect(verdict).not.toHaveTextContent('오답')
    expect(verdict.querySelector('svg path')?.getAttribute('d')).toMatch(/^M4 10.5/)
    expect(verdict).toHaveTextContent('정구지가 맞아요')
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled())
    expect(screen.getByRole('radio', { name: /정구지/ }).closest('label')).toHaveTextContent('정답')
  })

  it('피드백(s-14) 오답: ✕ 아이콘과 「오답」 글자, 서버 해설 그대로, 고른 칸 「내 답」·정답 칸 「정답」', async () => {
    const { view, submit, onNext } = renderQuiz()
    fireEvent.click(screen.getByRole('radio', { name: '시금치' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    await act(async () => {})
    view.rerender(
      <WordQuizScreen item={item} itemNumber={1} totalItems={2} result={answer(false, 'i1a', '정구지', 1)} submit={submit} onNext={onNext} />,
    )
    const verdict = screen.getByRole('status')
    expect(verdict).toHaveTextContent('오답')
    // 해설은 서버 문장 그대로, 앱이 덧붙이던 「정답은 …」 줄은 없다 (s-14)
    expect(verdict.querySelector('.word-verdict__explanation')).toHaveTextContent(/^정구지가 맞아요$/)
    expect(verdict).not.toHaveTextContent('정답은')
    // 정답의 ✓와 다른 모양 (✕)
    expect(verdict.querySelector('svg path')?.getAttribute('d')).toMatch(/^M5 5/)
    // 고른 칸 「내 답」 + 벽돌 테두리(흔들림 대상), 정답 칸 「정답」 꼬리표(SVG + 글자)
    const mine = screen.getByRole('radio', { name: /시금치/ }).closest('label')!
    expect(mine).toHaveTextContent('내 답')
    expect(mine).toHaveClass('choice--wrong')
    expect(mine.closest('.word-quiz')).not.toBeNull()
    const right = screen.getByRole('radio', { name: /정구지/ }).closest('label')!
    expect(right).toHaveTextContent('정답')
    expect(right.querySelector('.choice__mark--correct svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: '다음 문항' }).querySelector('svg')).not.toBeNull()
  })

  it('마지막 문항의 W-4 버튼은 [결과 보기]다', () => {
    render(
      <WordQuizScreen item={item} itemNumber={2} totalItems={2} result={answer(true, 'i1a', '정구지', 2)} submit={async () => {}} onNext={() => {}} />,
    )
    expect(screen.getByRole('button', { name: '결과 보기' })).toBeInTheDocument()
  })

  it('제출 실패 뒤 같은 답 재시도는 같은 멱등 키다 (재시도 불가 오류여도 같은 화면에 남는다)', async () => {
    const submit = vi
      .fn<(c: string | null, k: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('이미 답한 문항이에요'))
      .mockResolvedValueOnce(undefined)
    renderQuiz({ submit })
    fireEvent.click(screen.getByRole('radio', { name: '정구지' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('이미 답한 문항이에요')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await act(async () => {})
    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0])
  })
})

// ── 5초 제한 (4-2, 4-5) ──────────────────────────────────────────────────

describe('5초 제한 막대 (4-2)', () => {
  const item = SET.items[0]
  const timedOutAnswer = { ...answer(false, 'i1a', '정구지', 1) }

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    Reflect.deleteProperty(document, 'visibilityState')
  })

  function renderTimed(submit = vi.fn<(c: string | null, k: string) => Promise<void>>(async () => {})) {
    vi.useFakeTimers()
    const onNext = vi.fn()
    const view = render(
      <WordQuizScreen item={item} itemNumber={1} totalItems={2} result={null} submit={submit} onNext={onNext} timeLimitMs={5000} />,
    )
    const rerenderWith = (result: ReturnType<typeof answer>) =>
      view.rerender(
        <WordQuizScreen item={item} itemNumber={1} totalItems={2} result={result} submit={submit} onNext={onNext} timeLimitMs={5000} />,
      )
    return { submit, onNext, rerenderWith }
  }
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
  const timer = () => screen.getByRole('timer')
  const fill = () => timer().querySelector<HTMLElement>('.word-timer__fill')!

  it('꺼져 있으면 막대가 없고 10초가 지나도 아무것도 내지 않는다', () => {
    vi.useFakeTimers()
    const submit = vi.fn(async () => {})
    render(<WordQuizScreen item={item} itemNumber={1} totalItems={2} result={null} submit={submit} onNext={() => {}} />)
    advance(10_000)
    expect(screen.queryByRole('timer')).toBeNull()
    expect(submit).not.toHaveBeenCalled()
    expect(screen.getAllByRole('radio')[0]).toBeEnabled()
  })

  it('진행 표시 아래 막대가 linear로 줄고, 마지막 1초에 벽돌색 경고(흔들림)로 바뀐다 (타일 11)', () => {
    renderTimed()
    expect(timer()).toHaveAttribute('aria-label', '남은 시간 5초')
    expect(fill().style.transform).toBe('scaleX(1)')
    // 진행 표시 바로 다음 자리
    expect(document.querySelector('.progress-indicator')?.nextElementSibling).toBe(timer())
    advance(3000)
    expect(timer()).toHaveAttribute('aria-label', '남은 시간 2초')
    expect(fill().style.transform).toBe('scaleX(0.4)')
    expect(timer()).not.toHaveClass('word-timer--warning')
    advance(1000)
    expect(timer()).toHaveClass('word-timer--warning')
    expect(timer()).toHaveAttribute('aria-label', '남은 시간 1초')
  })

  it('5초 안에 안 고르면 고르지 않은 답(null)을 내고 선택지를 잠근다, 채점이 오면 정답 공개 + 「시간이 다 됐어요」 + [다음 문항]', async () => {
    const { submit, rerenderWith } = renderTimed()
    advance(4999)
    expect(submit).not.toHaveBeenCalled()
    advance(1)
    await act(async () => {})
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0]).toBeNull()
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled())
    advance(10_000)
    expect(submit).toHaveBeenCalledTimes(1)

    rerenderWith(timedOutAnswer)
    const verdict = screen.getByRole('status')
    expect(verdict).toHaveTextContent('시간이 다 됐어요')
    expect(verdict).not.toHaveTextContent('오답')
    expect(verdict).toHaveTextContent('정구지가 맞아요')
    expect(screen.getByRole('radio', { name: /정구지/ }).closest('label')).toHaveTextContent('정답')
    expect(screen.queryByText('내 답')).toBeNull()
    expect(screen.getByRole('button', { name: '다음 문항' })).toBeEnabled()
  })

  it('답을 고르면 멈추고 제출 전까지 답을 바꿀 수 있다 — 고른 답을 그대로 낸다', async () => {
    const { submit } = renderTimed()
    advance(2000)
    fireEvent.click(screen.getByRole('radio', { name: '시금치' }))
    advance(10_000)
    expect(submit).not.toHaveBeenCalled()
    expect(timer()).toHaveAttribute('aria-label', '남은 시간 3초')
    fireEvent.click(screen.getByRole('radio', { name: '정구지' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    await act(async () => {})
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0]).toBe('i1a')
  })

  it('앱 전환·화면 꺼짐(visibilitychange hidden)이면 멈추고, 돌아오면 남은 시간부터 잇는다', async () => {
    const { submit } = renderTimed()
    advance(1000)
    const setVisibility = (state: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
    }
    setVisibility('hidden')
    advance(60_000)
    expect(submit).not.toHaveBeenCalled()
    expect(timer()).toHaveAttribute('aria-label', '남은 시간 4초')
    setVisibility('visible')
    advance(3999)
    expect(submit).not.toHaveBeenCalled()
    advance(1)
    await act(async () => {})
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0][0]).toBeNull()
  })

  it('시간 초과 답안 제출이 실패하면 [다시 시도]가 같은 멱등 키로 다시 낸다', async () => {
    const submit = vi
      .fn<(c: string | null, k: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('네트워크 오류로 요청하지 못했어요'))
      .mockResolvedValueOnce(undefined)
    renderTimed(submit)
    advance(5000)
    await act(async () => {})
    expect(screen.getByRole('alert')).toHaveTextContent('네트워크 오류로 요청하지 못했어요')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await act(async () => {})
    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0])
    expect(submit.mock.calls[1][0]).toBeNull()
  })
})

describe('Countdown 순수 계산', () => {
  it('남은 시간은 멈춘 동안 줄지 않고, 다시 가면 남은 값부터 준다', () => {
    let c = resumeCountdown({ left: WORD_TIME_LIMIT_MS, since: null }, 1000)
    expect(remainingMs(c, 2500)).toBe(3500)
    c = pauseCountdown(c, 2500)
    expect(remainingMs(c, 99_999)).toBe(3500)
    // 두 번 멈춰도, 두 번 가도 값이 그대로다
    expect(pauseCountdown(c, 5000)).toEqual(c)
    c = resumeCountdown(c, 10_000)
    expect(resumeCountdown(c, 11_000)).toEqual(c)
    expect(remainingMs(c, 13_000)).toBe(500)
    expect(remainingMs(c, 20_000)).toBe(0)
  })
})

describe('quotePrompt', () => {
  it('서버 prompt 앞머리 작은따옴표 한 짝만 「」로 바꾼다 (4-2)', () => {
    expect(quotePrompt("'할머니'를 경남 사투리로 무엇이라 할까요?")).toBe('「할머니」를 경남 사투리로 무엇이라 할까요?')
    expect(quotePrompt("'밥 묵었나'를 'X'로?")).toBe("「밥 묵었나」를 'X'로?")
    expect(quotePrompt('부추를 사투리로?')).toBe('부추를 사투리로?')
  })
})

// ── 시간 초과 한 바퀴 (라우트, KAN-360 계약 목) ────────────────────────────

describe('시간 초과 문항 — 라우트 한 바퀴 (KAN-360 계약)', () => {
  it('고르지 않고 시간이 끝나면 { timedOut: true }를 내고, 성적표에서 그 행이 「시간 초과 → 정답」으로 펼쳐진다', async () => {
    const timedOutResult = {
      ...RESULT,
      correctCount: 0,
      accuracyPercent: 0,
      wrongItems: [
        {
          itemId: 'i1', cardId: 'c1', prompt: '부추를 사투리로?', chosenChoiceId: null, chosenText: null,
          correctChoiceId: 'i1a', correctText: '정구지', explanation: '정구지가 맞아요', timedOut: true,
        },
        { ...RESULT.wrongItems[0], timedOut: false },
      ],
    }
    const { calls } = renderRoute(
      { ...happyRoutes(), '/items/i1/answer': ok(answer(false, 'i1a', '정구지', 1)), '/complete': ok(timedOutResult) },
      'acc',
      // 실시간으로 돌리되 짧게 — 5초 상수는 위 가짜 타이머 시험이 본다
      { timeLimitMs: 60 },
    )
    fireEvent.click(await screen.findByRole('button', { name: '다음 카드' }))
    fireEvent.click(screen.getByRole('button', { name: '문제 풀기' }))
    expect(await screen.findByText('시간이 다 됐어요')).toBeInTheDocument()
    const sent = calls.find((c) => c.path.endsWith('/items/i1/answer'))!
    expect(JSON.parse(sent.body!)).toEqual({ timedOut: true })
    expect(sent.headers['Idempotency-Key']).toEqual(expect.any(String))

    fireEvent.click(screen.getByRole('button', { name: '다음 문항' }))
    fireEvent.click(await screen.findByRole('radio', { name: '머꼬' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    fireEvent.click(await screen.findByRole('button', { name: '결과 보기' }))

    expect(await screen.findByRole('heading', { level: 1, name: '단어 학습 2 결과' })).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    fireEvent.click(rows[0].querySelector('summary')!)
    expect(rows[0]).toHaveTextContent('시간 초과')
    expect(rows[0]).toHaveTextContent('정구지')
    expect(rows[0]).not.toHaveTextContent('내 답')
    expect(rows[0]).not.toHaveTextContent('null')
    expect(rows[1]).toHaveTextContent('내 답')
  })
})

// ── 성적표 (s-15-A) ──────────────────────────────────────────────────────

describe('WordReportScreen', () => {
  const RESULT_STARS = { ...RESULT, stars: 2 }
  const COURSE: CourseStarsChange = { course: 1, before: 5, after: 7, required: 21, unlocked: null, hasNext: true }

  function renderReport(result: typeof RESULT & { stars?: number }, course: CourseStarsChange | null) {
    const onNextStamp = vi.fn()
    const onToMap = vi.fn()
    render(<WordReportScreen set={SET} result={result} course={course} n={2} onNextStamp={onNextStamp} onToMap={onToMap} />)
    return { onNextStamp, onToMap }
  }

  it('앱 바 「스탬프 완료」, 제목 「단어 학습 n 결과」, 점수 원(정답률)·별(이번 시도 stars)·코스 별 줄을 그린다', () => {
    renderReport(RESULT_STARS, COURSE)
    expect(screen.getByText('스탬프 완료')).toHaveClass('stamp-done-badge')
    expect(screen.getByRole('heading', { level: 1, name: '단어 학습 2 결과' })).toBeInTheDocument()
    expect(document.querySelector('.score-donut')).toHaveTextContent('50점')
    expect(screen.getByRole('img', { name: '별 3개 중 2개' })).toBeInTheDocument()
    const course = screen.getByRole('region', { name: '코스 별 5개에서 7개로, 다음 코스까지 필요한 별 21개' })
    // ★·→는 글자가 아니라 SVG다(티켓 1-1) — 글자는 숫자만 남는다
    expect(course.querySelector('.stamp-reward__count')).toHaveTextContent(/^5 7 \/ 21$/)
    expect(course.querySelectorAll('.stamp-reward__count svg')).toHaveLength(2)
    expect(within(course).getByRole('progressbar', { name: '코스 별' })).toHaveAttribute('aria-valuenow', '7')
    // 이번에 더한 칸이 앞 칸과 따로 그려진다
    expect(course.querySelector<HTMLElement>('.stamp-reward__bar-earned')!.style.width).toBe(`${(5 / 21) * 100}%`)
    expect(course.querySelector<HTMLElement>('.stamp-reward__bar-added')!.style.width).toBe(`${(7 / 21) * 100 - (5 / 21) * 100}%`)
    expect(course).toHaveTextContent('이번 스탬프 +2')
    expect(course).toHaveTextContent('다음 코스까지 별 14개')
    expect(screen.queryByText(/코스가 열렸어요/)).toBeNull()
  })

  it('문항별 결과는 세트 문항 전체(맞힌 행 + wrongItems)이고 「n / N 정답 · 정답률 p%」, 틀린 행을 펼치면 「내 답 → 정답」과 해설', () => {
    renderReport(RESULT_STARS, COURSE)
    expect(screen.getByRole('heading', { level: 2, name: '문항별 결과' })).toBeInTheDocument()
    expect(screen.getByText('1 / 2 정답 · 정답률 50%')).toBeInTheDocument()
    const [right, wrong] = screen.getAllByRole('listitem')
    // 행 이름은 카드의 표준어 낱말이다 (시안 s-15-A)
    expect(right).toHaveTextContent('부추')
    expect(right).toHaveTextContent('정답')
    expect(right.querySelector('details')).toBeNull()
    expect(wrong).toHaveTextContent('뭐 하니')
    expect(wrong).toHaveTextContent('오답')
    const details = wrong.querySelector('details')!
    expect(details.open).toBe(false)
    fireEvent.click(wrong.querySelector('summary')!)
    expect(details.open).toBe(true)
    expect(wrong.querySelector('.word-report__answer')).toHaveTextContent(/^내 답\s*머꼬\s*정답\s*머하노$/)
    expect(wrong.querySelector('.word-report__arrow svg')).toBeInTheDocument()
    expect(wrong).toHaveTextContent('머하노가 맞아요')
    // 옛 W-5 문구는 없어졌다
    expect(screen.queryByText('오답이 복습에 쌓였어요')).toBeNull()
    expect(screen.queryByRole('button', { name: '세트 목록으로' })).toBeNull()
  })

  it('[다음 스탬프]는 onNextStamp, 글자 버튼 「지도로」는 onToMap이다', () => {
    const { onNextStamp, onToMap } = renderReport(RESULT_STARS, COURSE)
    expect(screen.getByRole('button', { name: '지도로' })).toHaveClass('btn--text')
    fireEvent.click(screen.getByRole('button', { name: '다음 스탬프' }))
    expect(onNextStamp).toHaveBeenCalledTimes(1)
    expect(onToMap).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '지도로' }))
    expect(onToMap).toHaveBeenCalledTimes(1)
  })

  it('이번 결과로 코스 별이 필요 별에 처음 닿으면 「다음 코스까지」 자리에 「n코스가 열렸어요」', () => {
    renderReport(RESULT_STARS, { course: 1, before: 20, after: 22, required: 21, unlocked: 2, hasNext: true })
    expect(screen.getByRole('status')).toHaveTextContent('2코스가 열렸어요')
    expect(screen.queryByText(/다음 코스까지/)).toBeNull()
    expect(screen.getByRole('progressbar', { name: '코스 별' })).toHaveAttribute('aria-valuenow', '21')
  })

  it('마지막 코스(hasNext false)면 별이 모자라도 「다음 코스까지 별 n개」가 없고 이름에서도 「다음 코스까지」를 뺀다 (PR #76 리뷰)', () => {
    renderReport(RESULT_STARS, { ...COURSE, hasNext: false })
    const course = screen.getByRole('region', { name: '코스 별 5개에서 7개로, 필요한 별 21개' })
    expect(course).toHaveTextContent('이번 스탬프 +2')
    expect(course).not.toHaveTextContent('다음 코스까지')
  })

  it('필요 별이 0이면 막대 폭이 NaN이 아니라 0%다 (PR #76 리뷰)', () => {
    renderReport(RESULT_STARS, { ...COURSE, before: 0, after: 0, required: 0 })
    const course = screen.getByRole('region', { name: /코스 별/ })
    expect(course.querySelector<HTMLElement>('.stamp-reward__bar-earned')!.style.width).toBe('0%')
    expect(course.querySelector('.stamp-reward__bar-added')).toBeNull()
  })

  it('KAN-359 전(완료 응답에 stars 없음)이면 별·코스 별 줄 없이 점수 원과 문항별 결과만 그린다 (4-5)', () => {
    renderReport(RESULT, COURSE)
    expect(document.querySelector('.score-donut')).toHaveTextContent('50점')
    expect(screen.queryByRole('img', { name: /별 3개 중/ })).toBeNull()
    expect(screen.queryByRole('region', { name: /코스 별/ })).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('스탬프 완료')).toBeInTheDocument()
  })

  it('stars는 있고 구간 요약이 없으면(course null) 별만 그리고 코스 별 줄을 숨긴다', () => {
    renderReport(RESULT_STARS, null)
    expect(screen.getByRole('img', { name: '별 3개 중 2개' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /코스 별/ })).toBeNull()
  })
})

describe('성적표 「코스 별」 — 라우트가 구간 요약을 다시 받는다 (KAN-359 목)', () => {
  const LEVELS = (collected: number) => ({
    totalStars: collected,
    starThresholds: [30, 70],
    levels: [
      { level: 1, setCount: 9, completedSetCount: 2, collectedStars: collected, requiredStars: 21, unlocked: true },
      { level: 2, setCount: 9, completedSetCount: 0, collectedStars: 0, requiredStars: 21, unlocked: collected >= 21 },
    ],
  })

  /** 마지막 문항 제출까지 — [결과 보기]를 돌려준다 */
  async function answerAll() {
    fireEvent.click(await screen.findByRole('button', { name: '다음 카드' }))
    fireEvent.click(screen.getByRole('button', { name: '문제 풀기' }))
    fireEvent.click(await screen.findByRole('radio', { name: '정구지' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    fireEvent.click(await screen.findByRole('button', { name: '다음 문항' }))
    fireEvent.click(await screen.findByRole('radio', { name: '머꼬' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    return screen.findByRole('button', { name: '결과 보기' })
  }

  async function finishSet() {
    fireEvent.click(await answerAll())
    await screen.findByRole('heading', { level: 1, name: '단어 학습 2 결과' })
  }

  afterEach(() => vi.useRealTimers())

  it('들어가기 전 별(prop)과 완료 뒤 다시 받은 collectedStars로 「★ 5 → 7 / 21」을 그린다', async () => {
    const { calls } = renderRoute(
      { ...happyRoutes(), '/complete': ok({ ...RESULT, stars: 2 }), '/v0/learning/levels': ok(LEVELS(7)) },
      'acc',
      { courseStars: { collected: 5, required: 21 } },
    )
    await finishSet()
    expect(await screen.findByText('이번 스탬프')).toBeInTheDocument()
    expect(document.querySelector('.stamp-reward__count')).toHaveTextContent(/^5 7 \/ 21$/)
    // 완료 요청 다음에 요약을 읽는다 — 끝난 뒤 값이어야 한다
    const paths = calls.map((c) => c.path)
    expect(paths.indexOf('/v0/learning/levels')).toBeGreaterThan(paths.indexOf('/v0/learning/word-attempts/a1/complete'))
  })

  it('이번 결과로 21개에 처음 닿으면 「2코스가 열렸어요」 (4단계 AC)', async () => {
    renderRoute(
      { ...happyRoutes(), '/complete': ok({ ...RESULT, stars: 2 }), '/v0/learning/levels': ok(LEVELS(22)) },
      'acc',
      { courseStars: { collected: 20, required: 21 } },
    )
    await finishSet()
    expect(await screen.findByText('2코스가 열렸어요')).toBeInTheDocument()
  })

  it('이미 21개를 넘긴 코스면 다시 열렸다고 하지 않는다', async () => {
    renderRoute(
      { ...happyRoutes(), '/complete': ok({ ...RESULT, stars: 2 }), '/v0/learning/levels': ok(LEVELS(24)) },
      'acc',
      { courseStars: { collected: 22, required: 21 } },
    )
    await finishSet()
    expect(await screen.findByText('이번 스탬프')).toBeInTheDocument()
    expect(screen.queryByText(/코스가 열렸어요/)).toBeNull()
  })

  it('완료 응답에 stars가 없으면(KAN-359 전) 요약을 부르지 않고 별·코스 별 줄 없이 성적표가 선다', async () => {
    const { calls } = renderRoute(happyRoutes(), 'acc', { courseStars: { collected: 5, required: 21 } })
    await finishSet()
    expect(screen.queryByRole('img', { name: /별 3개 중/ })).toBeNull()
    expect(screen.queryByText('이번 스탬프')).toBeNull()
    expect(calls.some((c) => c.path.endsWith('/levels'))).toBe(false)
  })

  it('요약 조회가 응답 없이 걸려도 제한 시간(3초) 뒤 성적표가 선다 — 별은 그리고 코스 별 줄만 숨긴다', async () => {
    renderRoute(
      { ...happyRoutes(), '/complete': ok({ ...RESULT, stars: 2 }), '/v0/learning/levels': 'hang' },
      'acc',
      { courseStars: { collected: 5, required: 21 } },
    )
    const showResult = await answerAll()
    vi.useFakeTimers()
    fireEvent.click(showResult)
    const report = () => screen.queryByRole('heading', { level: 1, name: '단어 학습 2 결과' })
    await act(() => vi.advanceTimersByTimeAsync(LEVELS_TIMEOUT_MS - 1))
    expect(report()).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(report()).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '별 3개 중 2개' })).toBeInTheDocument()
    expect(screen.queryByText('이번 스탬프')).toBeNull()
  })

  it('요약 조회가 실패해도(404) 성적표는 선다 — 별은 그리고 코스 별 줄만 숨긴다', async () => {
    renderRoute(
      { ...happyRoutes(), '/complete': ok({ ...RESULT, stars: 2 }), '/v0/learning/levels': fail(404, 'NOT_FOUND', '없음', false) },
      'acc',
      { courseStars: { collected: 5, required: 21 } },
    )
    await finishSet()
    expect(screen.getByRole('img', { name: '별 3개 중 2개' })).toBeInTheDocument()
    expect(screen.queryByText('이번 스탬프')).toBeNull()
  })
})

// ── 게스트 (KAN-330) ─────────────────────────────────────────────────────

describe('게스트 로그인 안내 (KAN-330)', () => {
  const EXITS = { toMap: () => {}, toNextStamp: () => {} }
  function guestBridge(extra: Partial<NonNullable<Window['AccenturyBridge']>> = {}) {
    window.AccenturyBridge = {
      requestMicPermission: vi.fn(),
      startVoiceItem: vi.fn(),
      getContractVersion: () => 2,
      getAccountKind: () => 'guest',
      ...extra,
    }
  }

  it('게스트면 학습 API를 부르지 않고 안내와 탭 바를 그린다, [로그인하기]는 requestLogin', async () => {
    const requestLogin = vi.fn()
    const openSettings = vi.fn()
    guestBridge({ requestLogin, openSettings })
    const server = fakeServer(happyRoutes())
    render(<WordLearningRoute apiBase="http://api" stamp={STAMP} courseStars={null} exits={EXITS} tabBar={<nav aria-label="탭 바" />} deps={deps(server.fetchImpl)} />)

    expect(await screen.findByText('로그인하면 단어 학습과 억양 학습을 할 수 있어요')).toBeInTheDocument()
    expect(server.calls).toHaveLength(0)
    expect(screen.getByRole('navigation', { name: '탭 바' })).toBeInTheDocument()
    const login = screen.getByRole('button', { name: '로그인하기' })
    fireEvent.click(login)
    // 연타해도 한 번만 보낸다(KAN-330 리뷰 P1) — 늦게 끝난 두 번째 이탈이 그사이 들어온 회원 세션을 지우던 경합.
    fireEvent.click(login)
    expect(requestLogin).toHaveBeenCalledTimes(1)
    expect(login).toBeDisabled()
    expect(openSettings).not.toHaveBeenCalled()
  })

  it('requestLogin을 모르는 앱이면 [로그인하기]가 설정 화면으로 내려간다', async () => {
    const openSettings = vi.fn()
    guestBridge({ openSettings })
    render(<WordLearningRoute apiBase="http://api" stamp={STAMP} courseStars={null} exits={EXITS} deps={deps(fakeServer(happyRoutes()).fetchImpl)} />)
    fireEvent.click(await screen.findByRole('button', { name: '로그인하기' }))
    expect(openSettings).toHaveBeenCalledTimes(1)
  })

  it('계정 종류를 모르는 앱이 서버 403 AUTH_GUEST_NOT_ALLOWED를 받아도 같은 안내다', async () => {
    const server = fakeServer({ '/word-sets/s1': fail(403, 'AUTH_GUEST_NOT_ALLOWED', '로그인이 필요한 기능입니다.', false) })
    render(<WordLearningRoute apiBase="http://api" stamp={STAMP} courseStars={null} exits={EXITS} tabBar={<nav aria-label="탭 바" />} deps={deps(server.fetchImpl)} />)
    expect(await screen.findByText('로그인하면 단어 학습과 억양 학습을 할 수 있어요')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('navigation', { name: '탭 바' })).toBeInTheDocument()
  })
})
