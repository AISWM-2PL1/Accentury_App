/**
 * 억양 학습 A-2 이후 (KAN-253 4·5단계) — 앱 WebView 실행을 흉내 내 실 백엔드의 시드 코스로 돈다. 코스 목록(A-1)은 KAN-347
 * 3단계에서 학습 탭 「사투리 여행」 지도로 바뀌었다 — 순차 잠금이라 새 계정의 지금 스탬프는 단어 학습 1이므로, 단어 세트 1을
 * API로 끝내 둔 뒤([completeFirstWordSet]) 지도 [시작]으로 억양 학습 1에 들어간다.
 * 5단계부터 카드에 들어서면(코스 열기, [다음 카드]) 웹이 녹음 화면을 자동으로 한 번 부르고, A-2는
 * 녹음 화면을 뒤로가기로 닫았을 때 보이는 일시정지 화면이다([다시 말해 보기]·[지도로]).
 *
 * 여기서만 확인할 수 있는 것이 둘이다.
 *
 * 1. **카드 진입 자동 호출이 브리지에 싣는 카드가 서버의 카드와 같다.** vitest는 가짜 fetch가 준 카드를
 *    그대로 되비추는지만 본다. 여기서는 실 서버 상세 응답(Playwright `request`로 따로 받은 것)과
 *    `startIntonationRecording` payload의 cardId·prompt·standard·guideF0·itemNumber·totalItems를 대조한다 — 웹이 카드를
 *    seq로 다시 정렬하므로, 정렬이 어긋나면 엉뚱한 카드의 녹음이 엉뚱한 cardId로 올라간다.
 * 2. **회신 → 바로 다음 카드 녹음이 실 문서에서 이어진다 (KAN-254 5단계).** 네이티브 회신은
 *    `window.AccenturyWeb.onIntonationRecorded`를 다음 틱에 부르는 것으로 흉내 낸다
 *    (evaluateJavascript와 같은 순서). 회신이 없거나(뒤로가기) 다른 카드 것이면 A-2가 그대로여야 한다.
 *    이 둘은 회신의 attemptId가 가짜라 채점 조회를 [stubAttempts]로 가로챈다.
 * 3. **실채점 (KAN-254 4·5단계 → KAN-347 5단계 성적표).** 네이티브 업로드를 Playwright `request`로 흉내 낸다 — 브리지에 심은 것과 같은
 *    계정 토큰으로 `POST /v0/learning/intonation-cards/{cardId}/recordings`에 가짜 마이크 WAV를 올리고([uploadRecording]),
 *    202의 진짜 attemptId를 회신에 싣는다. 그 뒤 채점 조회는 가로채지 않는다 — 카드를 끝까지 연속으로 올린 뒤 성적표의
 *    점수(대사 점수 평균 반올림)·별을 서버 폴링 응답과 대조하고, 「지도로」에 도장·코스 지도에 「완료」(KAN-268)가 서는지 본다.
 *    가짜 AI 엔진은 해시 점수만 주고 segments를 안 줘 pitchFeedback이 늘 빈 배열이라 「다시 연습할 대사」 카드는 서지만 조언 줄(①)과 음절 표시가 없다 —
 *    그 길(카드 → 결과 상세 → 다시 말해 보기 → 카드 피드백)과 [다음 스탬프]는 실업로드 + 채점 조회 가로채기로 본다.
 *    실패 출구는 엔진이 오독·분석 실패를 못 내므로 채점 조회를 가로채 만든다.
 *
 * 실제 녹음(마이크·녹음 화면)은 네이티브 몫이라 이 스펙 밖이다 — 에뮬레이터 확인이 덮는다
 * (`docs/wiki/browser-e2e.md`의 「억양 학습 스펙」 절).
 *
 * 브리지 흉내·로그인·StrictMode 이중 조회 주의는 `word-learning.spec.ts`와 같다. 백엔드는
 * `--accentury.auth.fake-idp=true`로 떠 있어야 하고 Flyway 시드 코스(V10)가 있어야 한다.
 */

import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { feedbackComment, formatDelta, starsForScore } from '../src/learning/intonationFeedback'
import type { IntonationAttempt } from '../src/learning/intonationApi'
import { loginWithFakeIdp } from './helpers/accountLogin'

/** 앱이 WebView에 싣는 쿼리와 같은 모양. 옛 값 `screen=intonation`도 학습 탭이다 (KAN-347 3-1) */
const INTONATION_URL = '/?bridge=2&app=1.0&screen=intonation'

const LIST_PATH = '/v0/learning/intonation-courses'

interface BridgeMock {
  /** 처음 `getAccessToken`이 돌려줄 값. 빈 문자열이면 로그인 안 됨 */
  token: string
  /** 있으면 `refreshAccessToken`이 토큰을 이 값으로 바꾸고 'ok'를 회신한다. 없으면 'failed' */
  refreshTo?: string
}

interface RecordingCall {
  cardId: string
  prompt: string
  standard: string | null
  maxDurationMs: number
  guideF0: unknown
  itemNumber: number
  totalItems: number
}

/** 브리지 흉내를 심고 억양 학습으로 들어간다. 녹음 호출은 [intonationCalls]로 읽는다 */
async function openIntonation(page: Page, mock: BridgeMock): Promise<void> {
  await page.addInitScript(({ token, refreshTo }) => {
    let current = token
    const calls: unknown[] = []
    const web = () =>
      (window as unknown as { AccenturyWeb?: Record<string, ((p: string) => void) | undefined> }).AccenturyWeb
    Object.assign(window, {
      __intonationCalls: calls,
      AccenturyBridge: {
        getContractVersion: () => 2,
        getAccessToken: () => current,
        refreshAccessToken: () => {
          if (refreshTo !== undefined) current = refreshTo
          setTimeout(() => web()?.onAccessTokenRefreshed?.(refreshTo !== undefined ? 'ok' : 'failed'))
        },
        // 회신은 테스트가 [replyRecorded]로 직접 쏜다 — 자동 호출이 카드 진입 즉시라, 자동 회신이면 A-2를 볼 틈이 없다
        startIntonationRecording: (payloadJson: string) => {
          calls.push(JSON.parse(payloadJson))
        },
      },
    })
  }, mock)
  await page.goto(INTONATION_URL)
}

function intonationCalls(page: Page): Promise<RecordingCall[]> {
  return page.evaluate(() => (window as unknown as { __intonationCalls: RecordingCall[] }).__intonationCalls)
}

/** 네이티브 회신 흉내 — 테스트가 고른 cardId로. attemptId는 실채점이면 [uploadRecording]이 받은 값 */
function replyRecorded(page: Page, cardId: string, attemptId = 'la_e2e_manual'): Promise<void> {
  return page.evaluate(([id, attempt]) => {
    const web = (window as unknown as { AccenturyWeb: { onIntonationRecorded: (p: string) => void } }).AccenturyWeb
    web.onIntonationRecorded(JSON.stringify({ cardId: id, attemptId: attempt }))
  }, [cardId, attemptId] as const)
}

/** 앱 디버그 빌드가 에뮬레이터 마이크에 주입하는 것과 같은 WAV (16kHz 모노, 2.5초) */
const FAKE_MIC_WAV = readFileSync(fileURLToPath(new URL('../../app/src/debug/assets/fake_mic.wav', import.meta.url)))

/**
 * 네이티브 업로드 흉내 (KAN-254 4단계) — 앱이 녹음 뒤 올리는 것과 같은 multipart다. 회신마다 새 Idempotency-Key라
 * 같은 카드를 다시 올리면 새 시도가 생긴다. meta.clientQuality는 객체여야 한다(문자열이면 400). 202의 attemptId를 돌려준다
 */
async function uploadRecording(request: APIRequestContext, token: string, cardId: string): Promise<string> {
  const res = await request.post(`/v0/learning/intonation-cards/${cardId}/recordings`, {
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() },
    multipart: {
      audio: { name: 'recording.wav', mimeType: 'audio/wav', buffer: FAKE_MIC_WAV },
      meta: {
        name: 'meta.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({ durationMs: 2500, clientQuality: { rms: 0.1, peak: 0.5, silenceRatio: 0.1, clipped: false } }),
        ),
      },
    },
  })
  expect(res.status(), `업로드 실패 ${res.status()} ${await res.text()}`).toBe(202)
  return ((await res.json()) as { attemptId: string }).attemptId
}

/** 서버 폴링 응답을 따로 받는다 — 화면이 A-5를 그린 뒤라 이미 COMPLETED다 */
async function fetchAttempt(request: APIRequestContext, token: string, attemptId: string): Promise<IntonationAttempt> {
  const res = await request.get(`/v0/learning/intonation-attempts/${attemptId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(res.ok()).toBe(true)
  return (await res.json()) as IntonationAttempt
}

const ATTEMPT_PATH = '/v0/learning/intonation-attempts/'

/** 실패 출구의 서버 오류 코드. 오독·조용함·그 밖의 분석 실패 (intonationFeedback.attemptOutcome) */
type FailCode = 'ANALYSIS_MISREAD' | 'AUDIO_TOO_QUIET' | 'ANALYSIS_UNSCORABLE'

/** 채점 조회를 가로챈다. 차례로 내주고 마지막 상태를 반복한다 (KAN-254 응답 모양) */
async function stubAttempts(page: Page, statuses: ('PROCESSING' | 'COMPLETED')[]): Promise<void> {
  const queue = [...statuses]
  await page.route(
    (url) => url.pathname.startsWith(ATTEMPT_PATH),
    (route) => {
      const next = queue.length > 1 ? queue.shift()! : queue[0]
      const attemptId = route.request().url().split('/').pop()
      route.fulfill({
        json: {
          attemptId, contentVersion: 'in-e2e', cardId: 'stub', status: next, pollAfterMs: 500,
          ...(next === 'COMPLETED' ? { score: 77, pitchFeedback: [], previousScore: null } : {}),
        },
      })
    },
  )
}

/** 사투리 여행 지도가 그려졌는지 */
async function expectMap(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: '사투리 여행' })).toBeVisible()
}

/**
 * 단어 세트 1(1코스 첫 스탬프)을 API로 끝낸다 — 순차 잠금(KAN-347 3-4)이라 그래야 지금 스탬프가 억양 학습 1이다.
 * 답은 늘 첫 보기다(정오는 이 스펙의 관심 밖)
 */
async function completeFirstWordSet(request: APIRequestContext, token: string): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` }
  const sets = (await (await request.get('/v0/learning/word-sets', { headers })).json()) as { sets: { setId: string; seq: number }[] }
  const first = [...sets.sets].sort((a, b) => a.seq - b.seq)[0]
  const detail = (await (await request.get(`/v0/learning/word-sets/${first.setId}`, { headers })).json()) as {
    items: { itemId: string; choices: { choiceId: string }[] }[]
  }
  const attempt = await request.post(`/v0/learning/word-sets/${first.setId}/attempts`, { headers })
  expect(attempt.status()).toBe(201)
  const { attemptId } = (await attempt.json()) as { attemptId: string }
  for (const item of detail.items) {
    const answer = await request.post(`/v0/learning/word-attempts/${attemptId}/items/${item.itemId}/answer`, {
      headers: { ...headers, 'Idempotency-Key': randomUUID() },
      data: { choiceId: item.choices[0].choiceId },
    })
    expect(answer.ok(), `답안 실패 ${answer.status()} ${await answer.text()}`).toBe(true)
  }
  expect((await request.post(`/v0/learning/word-attempts/${attemptId}/complete`, { headers })).ok()).toBe(true)
}

/** 지도의 지금 코스 카드 [시작] — 억양 학습 1로 들어간다 */
async function startCurrentStamp(page: Page): Promise<void> {
  const card = page.getByRole('region', { name: '지금 코스' })
  await expect(card.getByRole('heading', { level: 2, name: '억양 학습 1' })).toBeVisible()
  await card.getByRole('button', { name: '시작', exact: true }).click()
}

/** A-2의 n/N — 진행 도트의 aria 값 (ProgressIndicator) */
async function expectCardProgress(page: Page, current: number, total: number): Promise<void> {
  const progress = page.getByRole('progressbar', { name: '카드 진행률' })
  await expect(progress).toHaveAttribute('aria-valuenow', String(current))
  await expect(progress).toHaveAttribute('aria-valuemax', String(total))
}

const speak = (page: Page) => page.getByRole('button', { name: '다시 말해 보기', exact: true })

/** 지도 [시작]으로 억양 학습 1을 열어 A-2 1/N에 선다 — 자동 호출 1회까지 확인 */
async function openFirstCourse(page: Page): Promise<void> {
  await expectMap(page)
  await startCurrentStamp(page)
  await expect(speak(page)).toBeEnabled()
  await expect.poll(async () => (await intonationCalls(page)).length).toBe(1)
}

/** 새 계정 + 단어 세트 1 완료 → 학습 탭 */
async function openAsLearner(page: Page, request: APIRequestContext, mock: Partial<BridgeMock> = {}): Promise<string> {
  const token = await loginWithFakeIdp(request)
  await completeFirstWordSet(request, token)
  await openIntonation(page, { token, ...mock })
  return token
}

/**
 * 억양 곡선 루프가 실제로 움직이는지 (KAN-302, Codex 교차 검증 P1 2026-10-29). jsdom은 CSS 애니메이션을
 * 돌리지 않아 vitest로는 점 추종·85% 정지·레이아웃 고정을 증명하지 못한다 — 실브라우저(Chromium)에서
 * `getComputedStyle`로 진행 중인 값을 읽는다.
 *
 * 셀렉터가 역할·텍스트가 아니라 클래스인 이유: 곡선은 장식이라 `aria-hidden`이고(이름 없음), 접근성
 * 트리에서 잡을 길이 없다. 그 aria-hidden 자체가 계약이라 같이 단언한다.
 *
 * 표본 간격 300ms × 최대 3회. 선은 2.4초 중 85%까지 긋고 정지하므로, 두 표본이 우연히 정지 구간(0px)에
 * 함께 걸려도 셋째 표본은 다음 주기의 긋는 구간에 들어간다. 점의 `offset-distance`는 `@supports`가 참인
 * Chromium 전제다(미지원 브라우저는 점이 끝점에 서 있다 — 컴포넌트 머리 주석).
 */
async function expectIntonationCurveRunning(page: Page): Promise<void> {
  const curve = page.locator('.analysis-waiting .intonation-curve')
  await expect(curve).toBeVisible()
  await expect(curve).toHaveAttribute('aria-hidden', 'true')

  const sample = () =>
    page.evaluate(() => {
      const line = document.querySelector('.analysis-waiting .intonation-curve__line')
      const dot = document.querySelector('.analysis-waiting .intonation-curve__dot')
      const steps = document.querySelector('.analysis-waiting .analysis-steps')
      if (!line || !dot || !steps) return null
      return {
        dashoffset: getComputedStyle(line).strokeDashoffset,
        offsetDistance: getComputedStyle(dot).offsetDistance,
        stepsTop: steps.getBoundingClientRect().top,
      }
    })

  const samples = [await sample()]
  await page.waitForTimeout(300)
  samples.push(await sample())
  if (samples[0]?.dashoffset === samples[1]?.dashoffset) {
    await page.waitForTimeout(300)
    samples.push(await sample())
  }
  expect(samples, '대기 화면이 표본을 다 뽑기 전에 넘어갔다').not.toContain(null)
  const taken = samples as NonNullable<(typeof samples)[number]>[]
  expect(new Set(taken.map((s) => s.dashoffset)).size, '선이 그려지는 중이어야 한다').toBeGreaterThan(1)
  expect(taken.some((s) => s.offsetDistance !== '100%'), '점이 곡선을 따라가는 중이어야 한다').toBe(true)
  for (const s of taken) expect(s.stepsTop).toBeCloseTo(taken[0].stepsTop, 0)

  // reduced-motion — tokens.css 전역 규칙이 0.01ms·1회로 접어 기본값(다 그은 선, 끝점의 점)에 멈춘다
  await page.emulateMedia({ reducedMotion: 'reduce' })
  try {
    await page.waitForTimeout(300)
    const still = [await sample()]
    await page.waitForTimeout(300)
    still.push(await sample())
    for (const s of still) expect(s).toMatchObject({ dashoffset: '0px', offsetDistance: '100%' })
  } finally {
    await page.emulateMedia({ reducedMotion: null })
  }
}

test('지도 [시작] → 카드 진입 자동 녹음 호출 → 회신 → 다음 카드에서 다시 자동 호출 - 브리지 payload가 서버 상세의 카드와 같다', async ({
  page,
  request,
}) => {
  await stubAttempts(page, ['PROCESSING', 'COMPLETED'])
  const token = await openAsLearner(page, request)
  await expectMap(page)

  // 억양 학습 1 = 1코스(level 1)의 seq 최소 억양 코스 (스탬프 이름 규칙, KAN-347 3-2)
  const list = await request.get(LIST_PATH, { headers: { Authorization: `Bearer ${token}` } })
  expect(list.ok()).toBe(true)
  const firstCourse = ((await list.json()) as { courses: { courseId: string; seq: number; level: number }[] }).courses
    .filter((c) => c.level === 1)
    .sort((a, b) => a.seq - b.seq)[0]
  const detailRes = await request.get(`${LIST_PATH}/${firstCourse.courseId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(detailRes.ok()).toBe(true)
  const detail = (await detailRes.json()) as {
    cards: { cardId: string; seq: number; dialect: string; standard: string | null; guideF0: unknown }[]
  }
  const cards = [...detail.cards].sort((a, b) => a.seq - b.seq)
  const card = cards[0]

  // 스탬프 열기 = 녹음 화면 자동 호출 1회 (5단계)
  await startCurrentStamp(page)
  await expect.poll(async () => (await intonationCalls(page)).length).toBe(1)
  expect((await intonationCalls(page))[0]).toEqual({
    cardId: card.cardId,
    prompt: card.dialect,
    standard: card.standard,
    maxDurationMs: 10_000,
    guideF0: card.guideF0,
    itemNumber: 1,
    totalItems: cards.length,
  })

  // 녹음 화면 아래의 일시정지 A-2. n/N, 사투리 대사, 가이드 곡선, 버튼 둘
  await expectCardProgress(page, 1, cards.length)
  await expect(page.getByRole('heading', { level: 1, name: card.dialect, exact: true })).toBeVisible()
  if (card.standard !== null) await expect(page.getByText(card.standard, { exact: true })).toBeVisible()
  const curve = page.getByRole('img', { name: '가이드 억양 곡선' })
  await expect(curve).toBeVisible()
  await expect(curve.locator('path').first()).toBeAttached()
  await expect(speak(page)).toBeEnabled()
  await expect(page.getByRole('button', { name: '지도로', exact: true })).toBeVisible()

  // 회신 → 대기·피드백 없이 바로 다음 카드의 녹음 자동 호출 (5단계). 채점은 뒤에서 돈다
  await replyRecorded(page, card.cardId)
  if (cards.length > 1) {
    await expectCardProgress(page, 2, cards.length)
    await expect(page.getByRole('heading', { level: 1, name: cards[1].dialect, exact: true })).toBeVisible()
    await expect.poll(async () => (await intonationCalls(page)).length).toBe(2)
    expect((await intonationCalls(page))[1]).toMatchObject({ cardId: cards[1].cardId, itemNumber: 2, totalItems: cards.length })
    await expect(page.getByText('분석 중이에요', { exact: true })).toHaveCount(0)
  } else {
    await expect(page.locator('.stamp-reward .score-donut')).toContainText('77점')
  }
})

test('회신 없음(녹음 화면에서 뒤로가기) - 일시정지 A-2가 그대로이고 [다시 말해 보기]로 다시 연다', async ({ page, request }) => {
  await openAsLearner(page, request)
  await openFirstCourse(page)

  await page.waitForTimeout(500)
  await expect(page.getByRole('progressbar', { name: '카드 진행률' })).toHaveAttribute('aria-valuenow', '1')
  await expect(speak(page)).toBeEnabled()
  await expect(page.getByText('분석 중이에요', { exact: true })).toHaveCount(0)

  await speak(page).click()
  await expect.poll(async () => (await intonationCalls(page)).length).toBe(2)
})

test('A-2 오른쪽 위 ✕ - 누르면 사투리 여행 지도로 돌아가고 탭 바가 다시 선다 (KAN-252, KAN-347 5-1)', async ({
  page,
  request,
}) => {
  await openAsLearner(page, request)
  const tabBar = page.getByRole('navigation', { name: '주 메뉴' })
  await expectMap(page)
  await expect(tabBar).toBeVisible()
  await openFirstCourse(page)
  await expect(tabBar).toBeHidden()

  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expectMap(page)
  await expect(tabBar).toBeVisible()
  await expect(page.getByRole('button', { name: '닫기', exact: true })).toBeHidden()
})

test('다른 카드의 늦은 회신은 무시하고 지금 카드의 회신만 받는다', async ({ page, request }) => {
  await stubAttempts(page, ['PROCESSING'])
  await openAsLearner(page, request)
  await openFirstCourse(page)
  const { cardId } = (await intonationCalls(page))[0]

  await replyRecorded(page, `${cardId}-other`)
  await page.waitForTimeout(500)
  await expect(speak(page)).toBeVisible()
  await expect(page.getByText('분석 중이에요', { exact: true })).toHaveCount(0)

  // 수신 지점이 살아 있었다는 앵커 — 같은 cardId면 다음 카드 녹음으로 넘어간다 (없음 단언이 헛돌지 않게)
  await replyRecorded(page, cardId)
  await expect.poll(async () => (await intonationCalls(page)).length).toBe(2)
})

test('목록 조회 실패 - 「오류 코드 500」과 화면 안 출구 [다시 시도] 하나, 탭 바가 서고 누르면 지도가 뜬다 (KAN-347 3-7)', async ({ page, request }) => {
  // [다시 시도] 전까지 전부 500 — 「첫 요청만」이면 StrictMode의 둘째 진입 조회가 오류 화면을 덮는다
  let failing = true
  await page.route(
    (url) => url.pathname === LIST_PATH,
    (route) => (failing ? route.fulfill({ status: 500, body: '' }) : route.continue()),
  )
  await openIntonation(page, { token: await loginWithFakeIdp(request) })

  const retry = page.getByRole('button', { name: '다시 시도', exact: true })
  await expect(retry).toBeVisible()
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(1)
  await expect(page.getByText('오류 코드 500', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible()
  failing = false
  await retry.click()
  await expectMap(page)
})

test('카드 로드 실패 - 500은 [다시 시도]로 다시 불러 A-2, 404는 [지도로]', async ({ page, request }) => {
  let reply: 'fail500' | 'notFound' | 'pass' = 'fail500'
  await page.route(
    (url) => url.pathname.startsWith(`${LIST_PATH}/`),
    (route) =>
      reply === 'fail500'
        ? route.fulfill({ status: 500, body: '' })
        : reply === 'notFound'
          ? route.fulfill({
              status: 404,
              json: { code: 'LEARNING_COURSE_NOT_FOUND', message: '없는 억양 코스입니다.', retryable: false, retryAfterMs: null, correlationId: 'e2e' },
            })
          : route.continue(),
  )
  await openAsLearner(page, request)
  await expectMap(page)

  // 500 → 재시도 가능 → [다시 시도] 하나
  await startCurrentStamp(page)
  const retry = page.getByRole('button', { name: '다시 시도', exact: true })
  await expect(retry).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(1)
  reply = 'pass'
  await retry.click()
  await expect(speak(page)).toBeEnabled()
  // 실패한 로드는 녹음을 부르지 않고, 성공한 재시도에서 1회
  await expect.poll(async () => (await intonationCalls(page)).length).toBe(1)

  // 404 → 재시도 불가 → [지도로] 하나, 누르면 지도
  await page.reload()
  await expectMap(page)
  reply = 'notFound'
  await startCurrentStamp(page)
  const backToMap = page.getByRole('button', { name: '지도로', exact: true })
  await expect(backToMap).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(1)
  await backToMap.click()
  await expectMap(page)
})

// 탭 바는 계정 로그인 상태에서만 선다(PR #33 리뷰 P1) — 토큰이 없으면 안내만이다. 로그인 빌드는 토큰이 늘 있고 익명 빌드는
// 탭 바가 없어 이 화면에 오지 않는다.
test('로그인 안 됨 - 토큰이 빈 문자열이면 로그인 안내만, 탭 바는 없다 (KAN-252, PR #33 리뷰 P1)', async ({ page }) => {
  await openIntonation(page, { token: '' })
  await expect(page.getByText('로그인하면 학습을 이어갈 수 있어요', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0)
})

test('401 - 브리지로 토큰을 갱신한 뒤 같은 요청을 다시 보내 지도가 뜬다', async ({ page, request }) => {
  const token = await loginWithFakeIdp(request)
  await openIntonation(page, { token: 'e2e-expired-token', refreshTo: token })
  await expectMap(page)
})

/** 성적표의 분석 미완료 대사 행 — 위에서부터 대사 순서다 */
const resultRows = (page: Page) => page.locator('.intonation-results .word-set-row')

/** 성적표가 섰고 점수 원(대사 점수 평균 반올림)·별·「스탬프 완료」가 맞는지 (KAN-347 5-4). KAN-359 전 서버라 「코스 별」 줄은 없다 */
async function expectReport(page: Page, scores: number[]): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: '억양 학습 1 결과' })).toBeVisible({ timeout: 90_000 })
  const average = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  await expect(page.locator('.stamp-reward .score-donut')).toContainText(`${average}점`)
  await expect(page.getByRole('img', { name: `별 3개 중 ${starsForScore(average)}개` })).toBeVisible()
  await expect(page.getByText('스탬프 완료', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: /코스 별/ })).toHaveCount(0)
}

/** 모든 시도가 서버에서 COMPLETED가 될 때까지 — 그래야 진행을 다시 받을 때 그 스탬프가 완료로 계산된다 (KAN-268) */
async function waitServerCompleted(request: APIRequestContext, token: string, attemptIds: string[]): Promise<number[]> {
  let attempts: IntonationAttempt[] = []
  await expect
    .poll(
      async () => {
        attempts = await Promise.all(attemptIds.map((id) => fetchAttempt(request, token, id)))
        return attempts.map((a) => a.status)
      },
      { timeout: 90_000 },
    )
    .toEqual(attemptIds.map(() => 'COMPLETED'))
  return attempts.map((a) => a.score!)
}

test('실채점 - 카드를 연속으로 올리면 성적표의 점수·별이 서버 점수 평균과 같고, 「지도로」에 도장·코스 지도에 「완료」', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000) // 카드 3장, 업로드마다 분석 (로컬 AI 스텁 지연 8초)
  const token = await openAsLearner(page, request)
  await expectMap(page)

  // 억양 학습 1 = 1코스의 seq 최소 억양 코스
  const list = await request.get(LIST_PATH, { headers: { Authorization: `Bearer ${token}` } })
  const { courses } = (await list.json()) as { courses: { courseId: string; cardCount: number; level: number; seq: number }[] }
  const course = courses.filter((c) => c.level === 1).sort((a, b) => a.seq - b.seq)[0]
  await startCurrentStamp(page)

  // 회신마다 결과를 보이지 않고 바로 다음 카드 녹음을 부른다 (KAN-254 5단계)
  const attemptIds: string[] = []
  for (let n = 1; n <= course.cardCount; n++) {
    await expect.poll(async () => (await intonationCalls(page)).length).toBe(n)
    const call = (await intonationCalls(page))[n - 1]
    expect(call).toMatchObject({ itemNumber: n, totalItems: course.cardCount })
    const attemptId = await uploadRecording(request, token, call.cardId)
    attemptIds.push(attemptId)
    await replyRecorded(page, call.cardId, attemptId)
  }
  expect(await intonationCalls(page)).toHaveLength(course.cardCount)
  // 마지막 카드는 막 올렸으니 아직 분석 중이다 — 대기(바꾸지 않는 화면, 5-2)를 거쳐 성적표
  await expect(page.getByText('분석 중이에요', { exact: true })).toBeVisible()
  await expectIntonationCurveRunning(page)

  await expect(page.getByRole('heading', { level: 1, name: '억양 학습 1 결과' })).toBeVisible({ timeout: 90_000 })
  const scores = await waitServerCompleted(request, token, attemptIds)
  await expectReport(page, scores)
  // 가짜 엔진은 코멘트가 없다 — 「다시 연습할 대사」 카드는 서고 조언 줄(①)만 없다 (PR #76 리뷰)
  const practice = page.getByRole('region', { name: '다시 연습할 대사' })
  await expect(practice).toHaveCount(1)
  await expect(practice.locator('.intonation-practice__tip')).toHaveCount(0)

  // 「지도로」 → 지도. 완료 저장 호출은 없고 서버가 시도 기록으로 계산한다 (KAN-268) — 방금 마친 스탬프에 도장이 찍히고
  // 지금 스탬프는 다음(단어 학습 2)이다. 코스 지도에서 억양 학습 1 카드가 「완료」다
  await page.getByRole('button', { name: '지도로', exact: true }).click()
  await expectMap(page)
  const card = page.getByRole('region', { name: '지금 코스' })
  await expect(card).toHaveClass(/is-stamped/)
  await expect(card.getByRole('heading', { level: 2, name: '단어 학습 2' })).toBeVisible()
  await page.getByRole('button', { name: '1코스 · 진행 중' }).click()
  await expect(page.getByRole('list').getByRole('button').nth(1)).toContainText('억양 학습 1')
  await expect(page.getByRole('list').getByRole('button').nth(1)).toContainText('완료')
})

/*
 * 성적표의 「다시 연습할 대사」 → 결과 상세(s-08) → [다시 말해 보기] → 카드 피드백(s-19) → 성적표 → [다음 스탬프] (KAN-347 5-3~5-5).
 * 가짜 엔진은 코멘트를 못 내므로 화면의 채점 조회만 가로채 점수·코멘트·직전 점수를 정한다. 업로드는 진짜로 해서 서버에 완료 기록이
 * 남는다 — [다음 스탬프]가 진행을 다시 받았을 때 억양 학습 1이 완료로 계산돼 다음 스탬프(단어 학습 2)로 바로 들어간다.
 */
test('다시 연습할 대사 - 최저점 대사 카드 › 결과 상세 → [다시 말해 보기] → 카드 피드백 ▲ → 성적표 → [다음 스탬프]는 지도를 거치지 않고 단어 학습 2', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000)
  const token = await openAsLearner(page, request)
  await openFirstCourse(page)
  const total = (await intonationCalls(page))[0].totalItems
  expect(total).toBeGreaterThanOrEqual(2)

  // 회신 순서대로 80, 64(최저), 90… 다시 녹음(la_e2e_re)은 73점, 지난번 64점. 코멘트는 2번째 대사 첫 어절의 첫 음절 올리기
  const plan = new Map<string, { score: number; previousScore: number | null }>()
  let feedback: { word: string; raise: string; lower: null; split: boolean }[] = []
  await page.route(
    (url) => url.pathname.startsWith(ATTEMPT_PATH),
    (route) => {
      const attemptId = route.request().url().split('/').pop()!
      const p = plan.get(attemptId) ?? { score: 50, previousScore: null }
      route.fulfill({
        json: { attemptId, contentVersion: 'in-e2e', cardId: 'stub', status: 'COMPLETED', pollAfterMs: 500, ...p, pitchFeedback: feedback },
      })
    },
  )
  const uploaded: string[] = []
  const scores = [80, 64, 90, 85, 88]
  for (let n = 0; n < total; n++) {
    await expect.poll(async () => (await intonationCalls(page)).length).toBe(n + 1)
    const call = (await intonationCalls(page))[n]
    if (n === 1) {
      const word = call.prompt.split(' ')[0]
      feedback = [{ word, raise: word[0], lower: null, split: false }]
    }
    const attemptId = await uploadRecording(request, token, call.cardId)
    uploaded.push(attemptId)
    plan.set(attemptId, { score: scores[n], previousScore: null })
    await replyRecorded(page, call.cardId, attemptId)
  }
  const calls = await intonationCalls(page)
  await expect(page.getByRole('heading', { level: 1, name: '억양 학습 1 결과' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.stamp-reward .score-donut')).toContainText(
    `${Math.round(scores.slice(0, total).reduce((a, b) => a + b, 0) / total)}점`,
  )

  // 최저점(64) = 2번째 대사, 첫 시도라 「첫 기록」, 첫 코멘트 줄
  const practice = page.getByRole('region', { name: '다시 연습할 대사' }).getByRole('button')
  await expect(practice).toContainText('첫 기록')
  await expect(practice).toContainText(`「${feedback[0].raise}」 음절을 더 높여 보세요`)
  await practice.click()

  // 결과 상세 (s-08): 위 「← 결과 목록으로」, 카드 한 장, 주 버튼 [다시 말해 보기], ✕ 없음
  await expect(page.getByText('억양 학습 1 · 2번째 대사', { exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: '억양 점수 64점, 첫 기록' })).toBeVisible()
  await expect(page.locator('.intonation-comments li')).toHaveText(feedback.map(feedbackComment))
  await expect(page.getByRole('button', { name: '닫기', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '결과 목록으로', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '억양 학습 1 결과' })).toBeVisible()

  // 다시 상세 → [다시 말해 보기] = 그 대사 녹음(복귀 모드) → 회신 → 카드 피드백(s-19)
  await practice.click()
  await page.getByRole('button', { name: '다시 말해 보기', exact: true }).click()
  await expect.poll(async () => (await intonationCalls(page)).length).toBe(total + 1)
  expect((await intonationCalls(page))[total].cardId).toBe(calls[1].cardId)
  plan.set('la_e2e_re', { score: 73, previousScore: 64 })
  await replyRecorded(page, calls[1].cardId, 'la_e2e_re')
  await expect(page.getByRole('group', { name: '억양 점수 73점, 지난번 64점보다 9점 상승' })).toBeVisible()
  await expect(page.getByText(formatDelta(9), { exact: true })).toBeVisible()
  await expect(page.getByText('지난번 64점', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '닫기', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '결과 목록으로', exact: true }).click()

  // [다음 스탬프] — 서버 채점이 끝나 억양 학습 1이 완료로 계산된 뒤 누른다. 지도를 거치지 않고 단어 학습 2 카드
  await waitServerCompleted(request, token, uploaded)
  await page.getByRole('button', { name: '다음 스탬프' }).click()
  await expect(page.getByRole('progressbar', { name: /단어/ })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: '사투리 여행' })).toHaveCount(0)
})

/*
 * 실패 출구 3종. 가짜 AI 엔진은 실패로 AUDIO_TOO_QUIET 하나만, 그것도 ACCENTURY_AI_FAKE_FAIL_ITEM 한 문항에만 낸다 —
 * 그 자리는 retake 스펙(레벨테스트 문항 v3)이 쓰고, 오독(ANALYSIS_MISREAD)·분석 실패(ANALYSIS_UNSCORABLE)는 아예 못 낸다.
 * 그래서 채점 조회를 가로채 만든다 — 회신의 attemptId에 오류 코드를 실어 카드마다 다른 실패를 낸다.
 * 60초 소진(「확인 필요」·[다시 시도])은 벽시계 60초를 태워야 해 E2E에선 빼고 vitest 가짜 타이머가 덮는다.
 */
test('실패 출구 - 오독·조용함·분석 실패 행은 「다시 녹음 필요」, 상세 문구와 [다시 녹음]·[결과 목록으로], [다시 녹음]은 그 카드 녹음을 연다', async ({
  page,
  request,
}) => {
  const exits: [FailCode, string, boolean][] = [
    ['ANALYSIS_MISREAD', '제시된 문장과 다르게 들렸어요', true],
    ['AUDIO_TOO_QUIET', '목소리가 작게 들렸어요', true],
    ['ANALYSIS_UNSCORABLE', '분석하지 못했어요. 다시 녹음해 주세요', false],
  ]
  await page.route(
    (url) => url.pathname.startsWith(ATTEMPT_PATH),
    (route) => {
      const attemptId = route.request().url().split('/').pop()!
      const code = exits[Number(attemptId.split('_').pop()) % exits.length][0]
      route.fulfill({
        json: { attemptId, contentVersion: 'in-e2e', cardId: 'stub', status: 'FAILED', pollAfterMs: 500, error: { code, retryable: false } },
      })
    },
  )
  await openAsLearner(page, request)
  await openFirstCourse(page)
  const total = (await intonationCalls(page))[0].totalItems
  for (let n = 0; n < total; n++) {
    await expect.poll(async () => (await intonationCalls(page)).length).toBe(n + 1)
    await replyRecorded(page, (await intonationCalls(page))[n].cardId, `la_e2e_${n}`)
  }
  const cards = await intonationCalls(page)
  await expect(page.getByRole('heading', { level: 1, name: '억양 학습 1 결과' })).toBeVisible()
  // 점수 있는 대사가 없으면 점수 원·별·「스탬프 완료」가 없다 (KAN-347 5-4)
  await expect(page.locator('.score-donut')).toHaveCount(0)
  await expect(page.getByText('스탬프 완료', { exact: true })).toHaveCount(0)
  await expect(resultRows(page).locator('.word-set-row__meta')).toHaveText(cards.map(() => '다시 녹음 필요'))

  for (const [i, [, message, showsLine]] of exits.entries()) {
    await resultRows(page).nth(i).click()
    await expect(page.getByText(message, { exact: true })).toBeVisible()
    // 오독·조용함만 무엇을 다시 말할지 대사를 다시 보인다
    await expect(page.getByText(cards[i].prompt, { exact: true })).toHaveCount(showsLine ? 1 : 0)
    // [다시 녹음]·[결과 목록으로] + 라우트의 ✕(지도로, KAN-252)
    await expect(page.getByRole('button')).toHaveCount(3)
    if (i < exits.length - 1) {
      await page.getByRole('button', { name: '결과 목록으로', exact: true }).click()
      continue
    }
    await page.getByRole('button', { name: '다시 녹음', exact: true }).click()
    await expect.poll(async () => (await intonationCalls(page)).length).toBe(total + 1)
    expect((await intonationCalls(page))[total].cardId).toBe(cards[i].cardId)
    await expect(page.getByRole('button', { name: '결과 목록으로', exact: true })).toBeVisible()
  }
})
