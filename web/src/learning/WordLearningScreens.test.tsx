/**
 * 단어 학습 W-1~W-5 (KAN-255 3단계). 훅의 전체 순환, 화면별 계약, 상태별 출구를 본다.
 * 네트워크는 deps.fetchImpl로 갈아끼운다 — 경로·메서드별로 응답을 고르는 작은 가짜 서버다.
 */

import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import { useWordLearning } from './useWordLearning'
import { WordLearningRoute, WordQuizScreen, WordSetCompleteScreen } from './WordLearningScreens'
import type { WordApiDeps } from './wordApi'

const SETS = {
  contentVersion: 'v1',
  sets: [
    { setId: 's1', seq: 1, level: 1, category: '음식', title: '먹을 것', cardCount: 2, itemCount: 2 },
    { setId: 's2', seq: 2, level: 2, category: '인사', title: '인사말', cardCount: 3, itemCount: 3 },
  ],
}
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

type Reply = { status: number; body: unknown } | 'network'
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
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body } as Response
  }
  return { fetchImpl, calls }
}

function deps(fetchImpl: FetchLike, token: string | null = 'acc'): WordApiDeps {
  return { fetchImpl, getToken: () => token, refreshToken: async () => false }
}

const happyRoutes = () => ({
  '/word-sets': ok(SETS),
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
  it('W-1 → W-2(마지막 카드에서 문제 풀기) → W-3/W-4(마지막 문항에서 결과 보기) → W-5 → W-1로 한 바퀴 돈다', async () => {
    const hapticSpy = vi.fn()
    window.AccenturyBridge = { requestMicPermission: vi.fn(), startVoiceItem: vi.fn(), getContractVersion: () => 2, haptic: hapticSpy }
    const server = fakeServer(happyRoutes())
    const { result } = renderHook(() => useWordLearning('http://api', deps(server.fetchImpl)))
    const view = () => result.current.view

    await waitFor(() => expect(view().screen).toBe('list'))
    act(() => result.current.openSet('s1'))
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

    act(() => result.current.backToList())
    await waitFor(() => expect(view().screen).toBe('list'))
    expect(server.calls.filter((c) => c.path.endsWith('/word-sets'))).toHaveLength(2)
    expect(server.calls.map((c) => `${c.method} ${c.path}`)).toContain('POST /v0/learning/word-attempts/a1/complete')
  })
})

// ── 라우트 (화면 결선) ───────────────────────────────────────────────────

function renderRoute(routes: Record<string, Reply | Reply[]>, token: string | null = 'acc') {
  const server = fakeServer(routes)
  const onLeave = vi.fn()
  render(<WordLearningRoute apiBase="http://api" onLeave={onLeave} deps={deps(server.fetchImpl, token)} />)
  return { ...server, onLeave }
}

describe('WordLearningRoute', () => {
  it('W-1은 레벨별로 묶고 첫 세트만 추천으로 강조하며, 행은 버튼이다', async () => {
    renderRoute(happyRoutes())
    const level1 = await screen.findByRole('region', { name: '레벨 1' })
    const first = within(level1).getByRole('button', { name: /먹을 것/ })
    expect(first).toHaveTextContent('추천')
    expect(first).toHaveTextContent('카드 2장')
    expect(first).toHaveClass('word-set-row--recommended')
    const second = within(screen.getByRole('region', { name: '레벨 2' })).getByRole('button', { name: /인사말/ })
    expect(second).not.toHaveTextContent('추천')
  })

  it('W-2는 표준어와 사투리를 보이고 마지막 카드에서만 [문제 풀기]다', async () => {
    renderRoute(happyRoutes())
    fireEvent.click(await screen.findByRole('button', { name: /먹을 것/ }))
    expect(await screen.findByText('정구지')).toBeInTheDocument()
    expect(screen.getByText('부추')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '카드 진행률' })).toHaveAttribute('aria-valuenow', '1')
    fireEvent.click(screen.getByRole('button', { name: '다음 카드' }))
    expect(screen.getByText('머하노')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '문제 풀기' }))
    expect(await screen.findByRole('radiogroup', { name: '부추를 사투리로?' })).toBeInTheDocument()
  })

  it('목록 실패면 [다시 시도]가 목록을 다시 부른다', async () => {
    const { calls } = renderRoute({ '/word-sets': ['network', ok(SETS)] })
    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('button', { name: /먹을 것/ })).toBeInTheDocument()
    expect(calls).toHaveLength(2)
  })

  it('빈 목록이면 안내와 [학습 종류로]만 있다', async () => {
    const { onLeave } = renderRoute({ '/word-sets': ok({ contentVersion: 'v1', sets: [] }) })
    expect(await screen.findByText('아직 준비 중인 세트예요')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '학습 종류로' }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('카드 로드 실패면 [다시 시도]가 같은 세트를 다시 부른다', async () => {
    renderRoute({ ...happyRoutes(), '/word-sets/s1': [fail(503, 'SERVICE_UNAVAILABLE', '잠시 뒤 다시 시도해 주세요', true), ok(SET)] })
    fireEvent.click(await screen.findByRole('button', { name: /먹을 것/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('잠시 뒤 다시 시도해 주세요')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('정구지')).toBeInTheDocument()
  })

  it('재시도로 안 풀리는 code(LEARNING_SET_NOT_FOUND)면 [세트 목록으로]다', async () => {
    renderRoute({ ...happyRoutes(), '/word-sets/s1': fail(404, 'LEARNING_SET_NOT_FOUND', '세트를 찾을 수 없어요', false) })
    fireEvent.click(await screen.findByRole('button', { name: /먹을 것/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('세트를 찾을 수 없어요')
    fireEvent.click(screen.getByRole('button', { name: '세트 목록으로' }))
    expect(await screen.findByRole('button', { name: /먹을 것/ })).toBeInTheDocument()
  })

  it('CLIENT_NOT_SIGNED_IN이면 로그인 안내와 [학습 종류로]다 (네트워크 없이)', async () => {
    const { onLeave, calls } = renderRoute(happyRoutes(), null)
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인하면 단어 학습을 할 수 있어요')
    fireEvent.click(screen.getByRole('button', { name: '학습 종류로' }))
    expect(onLeave).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(0)
  })

  it('iOS 첫 문서처럼 빈 토큰으로 시작해 300ms 뒤 주입되면 로그인 안내 없이 W-1이 뜬다 (KAN-255 리뷰 P0)', async () => {
    let token = ''
    window.AccenturyBridge = { requestMicPermission: vi.fn(), startVoiceItem: vi.fn(), getContractVersion: () => 2, getAccessToken: () => token }
    setTimeout(() => (token = 'acc-late'), 300)
    const server = fakeServer(happyRoutes())
    // getToken을 주입하지 않는다 — 기본 공급(브리지 대기)을 타야 한다
    render(<WordLearningRoute apiBase="http://api" onLeave={vi.fn()} deps={{ fetchImpl: server.fetchImpl, refreshToken: async () => false }} />)

    expect(await screen.findByRole('button', { name: /먹을 것/ }, { timeout: 2_000 })).toBeInTheDocument()
    expect(screen.queryByText('로그인하면 단어 학습을 할 수 있어요')).toBeNull()
    expect(server.calls[0].headers.Authorization).toBe('Bearer acc-late')
  })

  it('UNAUTHENTICATED면 오류 문구 그대로와 [학습 종류로]다', async () => {
    renderRoute({ '/word-sets': { status: 401, body: {} } })
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인이 만료됐어요. 다시 로그인해 주세요')
    expect(screen.getByRole('button', { name: '학습 종류로' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  it('제출 중 UNAUTHENTICATED도 같은 출구다', async () => {
    renderRoute({ ...happyRoutes(), '/items/i1/answer': { status: 401, body: {} } })
    fireEvent.click(await screen.findByRole('button', { name: /먹을 것/ }))
    fireEvent.click(await screen.findByRole('button', { name: '다음 카드' }))
    fireEvent.click(screen.getByRole('button', { name: '문제 풀기' }))
    fireEvent.click(await screen.findByRole('radio', { name: '정구지' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    expect(await screen.findByRole('button', { name: '학습 종류로' })).toBeInTheDocument()
  })
})

// ── W-3·W-4 ─────────────────────────────────────────────────────────────

describe('WordQuizScreen', () => {
  const item = SET.items[0]

  function renderQuiz(props: { result?: ReturnType<typeof answer> | null; submit?: (c: string, k: string) => Promise<void> } = {}) {
    const submit = vi.fn(props.submit ?? (async () => {}))
    const onNext = vi.fn()
    const view = render(
      <WordQuizScreen item={item} itemNumber={1} totalItems={2} result={props.result ?? null} submit={submit} onNext={onNext} />,
    )
    return { submit, onNext, view }
  }

  it('W-3: 고르기 전에는 [제출]이 비활성이고, 진척도가 보인다', () => {
    renderQuiz()
    expect(screen.getByRole('button', { name: '제출' })).toBeDisabled()
    expect(screen.getByRole('progressbar', { name: '문항 진행률' })).toHaveAttribute('aria-valuenow', '1')
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

  it('W-4 오답: ✕ 아이콘과 「오답」 글자, 정답 문구, 내가 고른 보기에 「내 답」', async () => {
    const { view, submit, onNext } = renderQuiz()
    fireEvent.click(screen.getByRole('radio', { name: '시금치' }))
    fireEvent.click(screen.getByRole('button', { name: '제출' }))
    await act(async () => {})
    view.rerender(
      <WordQuizScreen item={item} itemNumber={1} totalItems={2} result={answer(false, 'i1a', '정구지', 1)} submit={submit} onNext={onNext} />,
    )
    const verdict = screen.getByRole('status')
    expect(verdict).toHaveTextContent('오답')
    expect(verdict).toHaveTextContent('정답은 정구지')
    // 정답의 ✓와 다른 모양 (✕)
    expect(verdict.querySelector('svg path')?.getAttribute('d')).toMatch(/^M5 5/)
    expect(screen.getByRole('radio', { name: /시금치/ }).closest('label')).toHaveTextContent('내 답')
    expect(screen.getByRole('radio', { name: /정구지/ }).closest('label')).toHaveTextContent('정답')
  })

  it('마지막 문항의 W-4 버튼은 [결과 보기]다', () => {
    render(
      <WordQuizScreen item={item} itemNumber={2} totalItems={2} result={answer(true, 'i1a', '정구지', 2)} submit={async () => {}} onNext={() => {}} />,
    )
    expect(screen.getByRole('button', { name: '결과 보기' })).toBeInTheDocument()
  })

  it('제출 실패 뒤 같은 답 재시도는 같은 멱등 키다 (재시도 불가 오류여도 같은 화면에 남는다)', async () => {
    const submit = vi
      .fn<(c: string, k: string) => Promise<void>>()
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

// ── W-5 ─────────────────────────────────────────────────────────────────

describe('WordSetCompleteScreen', () => {
  it('정답률·맞힌 수·오답 목록·복습 안내를 응답 그대로 그린다', () => {
    const onBackToList = vi.fn()
    render(<WordSetCompleteScreen result={RESULT} onBackToList={onBackToList} />)
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('2문항 중 1개 맞혔어요')).toBeInTheDocument()
    expect(screen.getByText('오답이 복습에 쌓였어요')).toBeInTheDocument()
    const wrong = screen.getByRole('listitem')
    expect(wrong).toHaveTextContent('뭐 하니를 사투리로?')
    expect(wrong).toHaveTextContent('내 답: 머꼬')
    expect(wrong).toHaveTextContent('정답: 머하노')
    expect(wrong).toHaveTextContent('머하노가 맞아요')
    fireEvent.click(screen.getByRole('button', { name: '세트 목록으로' }))
    expect(onBackToList).toHaveBeenCalledTimes(1)
  })
})
