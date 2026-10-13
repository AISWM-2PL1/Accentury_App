/**
 * 억양 학습 A-1·A-2 (KAN-253 4·5단계) — 앱 WebView 실행을 흉내 내 실 백엔드의 시드 코스로 돈다.
 * 5단계부터 카드에 들어서면(코스 열기, [다음 카드]) 웹이 녹음 화면을 자동으로 한 번 부르고, A-2는
 * 녹음 화면을 뒤로가기로 닫았을 때 보이는 일시정지 화면이다([다시 말해 보기]·[코스 목록으로]).
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
 * 3. **실채점 (KAN-254 4·5단계).** 네이티브 업로드를 Playwright `request`로 흉내 낸다 — 브리지에 심은 것과 같은
 *    계정 토큰으로 `POST /v0/learning/intonation-cards/{cardId}/recordings`에 가짜 마이크 WAV를 올리고([uploadRecording]),
 *    202의 진짜 attemptId를 회신에 싣는다. 그 뒤 채점 조회는 가로채지 않는다 — 카드를 끝까지 연속으로 올린 뒤 결과 목록의
 *    평균·행 점수, 행을 연 A-5 점수·코멘트·직전 대비를 서버 폴링 응답과 대조하고, A-1에 「완료」(KAN-268)가 서는지 본다.
 *    가짜 AI 엔진은 해시 점수만 주고 segments를 안 줘 pitchFeedback이 늘 빈 배열이다. 실패 출구는 엔진이 오독·분석 실패를
 *    못 내므로 채점 조회를 가로채 만든다.
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
import { feedbackComment, formatDelta } from '../src/learning/intonationFeedback'
import type { IntonationAttempt } from '../src/learning/intonationApi'
import { loginWithFakeIdp } from './helpers/accountLogin'

/** 앱이 WebView에 싣는 쿼리와 같은 모양. `screen=intonation`이 억양 학습 진입이다 (App.tsx) */
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

/** A-1이 그려졌는지. 제목과 레벨 묶음(h2 「레벨 N」)이 하나 이상 있어야 한다 */
async function expectCourseList(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: '억양 학습' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: /^레벨 \d+$/ }).first()).toBeVisible()
}

/** A-2의 n/N — 진행 도트의 aria 값 (ProgressIndicator) */
async function expectCardProgress(page: Page, current: number, total: number): Promise<void> {
  const progress = page.getByRole('progressbar', { name: '카드 진행률' })
  await expect(progress).toHaveAttribute('aria-valuenow', String(current))
  await expect(progress).toHaveAttribute('aria-valuemax', String(total))
}

const speak = (page: Page) => page.getByRole('button', { name: '다시 말해 보기', exact: true })

/** 첫 코스를 열어 A-2 1/N에 선다 — 자동 호출 1회까지 확인 */
async function openFirstCourse(page: Page): Promise<void> {
  await expectCourseList(page)
  await page.locator('.word-set-row').first().click()
  await expect(speak(page)).toBeEnabled()
  await expect.poll(async () => (await intonationCalls(page)).length).toBe(1)
}

test('A-1 → 카드 진입 자동 녹음 호출 → 회신 → 다음 카드에서 다시 자동 호출 - 브리지 payload가 서버 상세의 카드와 같다', async ({
  page,
  request,
}) => {
  const token = await loginWithFakeIdp(request)
  await stubAttempts(page, ['PROCESSING', 'COMPLETED'])
  await openIntonation(page, { token })

  // A-1. 추천 강조는 많아야 하나 (서버 §3.20)
  await expectCourseList(page)
  const rows = page.locator('.word-set-row')
  expect(await rows.count()).toBeGreaterThan(0)
  expect(await page.locator('.word-set-row--recommended').count()).toBeLessThanOrEqual(1)

  // 첫 코스의 id는 서버 목록에서 — 화면 첫 행이 seq 최소 코스다
  const list = await request.get(LIST_PATH, { headers: { Authorization: `Bearer ${token}` } })
  expect(list.ok()).toBe(true)
  const firstCourse = ((await list.json()) as { courses: { courseId: string; title: string }[] }).courses[0]
  await expect(rows.first()).toContainText(firstCourse.title)
  const detailRes = await request.get(`${LIST_PATH}/${firstCourse.courseId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(detailRes.ok()).toBe(true)
  const detail = (await detailRes.json()) as {
    cards: { cardId: string; seq: number; dialect: string; standard: string | null; guideF0: unknown }[]
  }
  const cards = [...detail.cards].sort((a, b) => a.seq - b.seq)
  const card = cards[0]

  // 코스 열기 = 녹음 화면 자동 호출 1회 (5단계)
  await rows.first().click()
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
  await expect(page.getByRole('button', { name: '코스 목록으로', exact: true })).toBeVisible()

  // 회신 → 대기·피드백 없이 바로 다음 카드의 녹음 자동 호출 (5단계). 채점은 뒤에서 돈다
  await replyRecorded(page, card.cardId)
  if (cards.length > 1) {
    await expectCardProgress(page, 2, cards.length)
    await expect(page.getByRole('heading', { level: 1, name: cards[1].dialect, exact: true })).toBeVisible()
    await expect.poll(async () => (await intonationCalls(page)).length).toBe(2)
    expect((await intonationCalls(page))[1]).toMatchObject({ cardId: cards[1].cardId, itemNumber: 2, totalItems: cards.length })
    await expect(page.getByText('분석 중이에요', { exact: true })).toHaveCount(0)
  } else {
    await expect(page.getByText('77점', { exact: true })).toBeVisible()
  }
})

test('회신 없음(녹음 화면에서 뒤로가기) - 일시정지 A-2가 그대로이고 [다시 말해 보기]로 다시 연다', async ({ page, request }) => {
  await openIntonation(page, { token: await loginWithFakeIdp(request) })
  await openFirstCourse(page)

  await page.waitForTimeout(500)
  await expect(page.getByRole('progressbar', { name: '카드 진행률' })).toHaveAttribute('aria-valuenow', '1')
  await expect(speak(page)).toBeEnabled()
  await expect(page.getByText('분석 중이에요', { exact: true })).toHaveCount(0)

  await speak(page).click()
  await expect.poll(async () => (await intonationCalls(page)).length).toBe(2)
})

test('A-2 오른쪽 위 ✕ - 누르면 A-1 코스 목록으로 돌아가고 탭 바가 다시 선다 (KAN-252, 2026-10-13 사용자 결정)', async ({
  page,
  request,
}) => {
  await openIntonation(page, { token: await loginWithFakeIdp(request) })
  const tabBar = page.getByRole('navigation', { name: '주 메뉴' })
  await expectCourseList(page)
  await expect(tabBar).toBeVisible()
  await openFirstCourse(page)
  await expect(tabBar).toBeHidden()

  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expectCourseList(page)
  await expect(tabBar).toBeVisible()
  await expect(page.getByRole('button', { name: '닫기', exact: true })).toBeHidden()
})

test('다른 카드의 늦은 회신은 무시하고 지금 카드의 회신만 받는다', async ({ page, request }) => {
  await stubAttempts(page, ['PROCESSING'])
  await openIntonation(page, { token: await loginWithFakeIdp(request) })
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

test('목록 조회 실패 - 출구는 [다시 시도] 하나, 누르면 목록이 뜬다', async ({ page, request }) => {
  // [다시 시도] 전까지 전부 500 — 「첫 요청만」이면 StrictMode의 둘째 진입 조회가 오류 화면을 덮는다
  let failing = true
  await page.route(
    (url) => url.pathname === LIST_PATH,
    (route) => (failing ? route.fulfill({ status: 500, body: '' }) : route.continue()),
  )
  await openIntonation(page, { token: await loginWithFakeIdp(request) })

  const retry = page.getByRole('button', { name: '다시 시도', exact: true })
  await expect(retry).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(1)
  failing = false
  await retry.click()
  await expectCourseList(page)
})

test('빈 목록 - 「아직 준비 중인 코스예요」와 탭 바, 화면 버튼은 없다 (KAN-252)', async ({ page, request }) => {
  await page.route(
    (url) => url.pathname === LIST_PATH,
    (route) => route.fulfill({ json: { contentVersion: 'in-e2e', courses: [] } }),
  )
  await openIntonation(page, { token: await loginWithFakeIdp(request) })

  await expect(page.getByText('아직 준비 중인 코스예요', { exact: true })).toBeVisible()
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible()
})

test('카드 로드 실패 - 500은 [다시 시도]로 다시 불러 A-2, 404는 [코스 목록으로]', async ({ page, request }) => {
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
  await openIntonation(page, { token: await loginWithFakeIdp(request) })
  await expectCourseList(page)
  const firstRow = page.locator('.word-set-row').first()

  // 500 → 재시도 가능 → [다시 시도] 하나
  await firstRow.click()
  const retry = page.getByRole('button', { name: '다시 시도', exact: true })
  await expect(retry).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(1)
  reply = 'pass'
  await retry.click()
  await expect(speak(page)).toBeEnabled()
  // 실패한 로드는 녹음을 부르지 않고, 성공한 재시도에서 1회
  await expect.poll(async () => (await intonationCalls(page)).length).toBe(1)

  // 404 → 재시도 불가 → [코스 목록으로] 하나, 누르면 목록
  await page.reload()
  await expectCourseList(page)
  reply = 'notFound'
  await firstRow.click()
  const backToList = page.getByRole('button', { name: '코스 목록으로', exact: true })
  await expect(backToList).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(1)
  await backToList.click()
  await expectCourseList(page)
})

test('로그인 안 됨 - 토큰이 빈 문자열이면 로그인 안내와 탭 바가 출구, 홈 탭은 앱 실행 그대로 홈 (KAN-252)', async ({ page }) => {
  await openIntonation(page, { token: '' })
  await expect(page.getByText('로그인하면 억양 학습을 할 수 있어요', { exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '홈', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '내 사투리 레벨 테스트' })).toBeVisible()
  const params = new URL(page.url()).searchParams
  expect(params.get('screen')).toBe('home')
  expect(params.get('bridge')).toBe('2')
})

test('401 - 브리지로 토큰을 갱신한 뒤 같은 요청을 다시 보내 목록이 뜬다', async ({ page, request }) => {
  const token = await loginWithFakeIdp(request)
  await openIntonation(page, { token: 'e2e-expired-token', refreshTo: token })
  await expectCourseList(page)
})

/** A-5에 선 점수·코멘트가 서버 응답과 같은지. 서버 응답을 돌려준다 */
async function expectFeedbackMatchesServer(
  page: Page,
  request: APIRequestContext,
  token: string,
  attemptId: string,
): Promise<IntonationAttempt> {
  await expect(page.getByText('억양 점수', { exact: true })).toBeVisible({ timeout: 70_000 })
  const attempt = await fetchAttempt(request, token, attemptId)
  expect(attempt.status).toBe('COMPLETED')
  await expect(page.locator('.intonation-score .text-hero')).toHaveText(`${attempt.score}점`)
  const feedback = attempt.pitchFeedback ?? []
  if (feedback.length > 0) {
    await expect(page.locator('.intonation-comments li')).toHaveText(feedback.map(feedbackComment))
  } else {
    await expect(page.getByText('높낮이 순서가 경남 화자와 같아요', { exact: true })).toBeVisible()
  }
  return attempt
}

/** 결과 목록 행 — 위에서부터 카드 순서다 */
const resultRows = (page: Page) => page.locator('.intonation-results .word-set-row')

/** 결과 목록의 평균·행 점수가 서버 점수와 같은지 */
async function expectSummary(page: Page, title: string, scores: number[]): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: `${title} 코스를 마쳤어요` })).toBeVisible({ timeout: 90_000 })
  const average = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  await expect(page.getByText(`평균 ${average}점`, { exact: true })).toBeVisible()
  await expect(resultRows(page).locator('.word-set-row__meta')).toHaveText(scores.map((s) => `${s}점`))
}

test('실채점 - 카드를 연속으로 올리면 결과 목록의 평균·행 점수가 서버와 같고, 행 A-5의 [다시 시도] 2회차에 직전 대비가 행에 반영, A-1에 「완료」', async ({
  page,
  request,
}) => {
  test.setTimeout(240_000) // 카드 7장 + 재시도 1회, 업로드마다 분석 (로컬 AI 스텁 지연 8초)
  const token = await loginWithFakeIdp(request)
  await openIntonation(page, { token })
  await expectCourseList(page)

  // 카드가 가장 적은 코스 (시드 V10에선 레벨 5의 7장)
  const list = await request.get(LIST_PATH, { headers: { Authorization: `Bearer ${token}` } })
  const { courses } = (await list.json()) as { courses: { courseId: string; title: string; cardCount: number }[] }
  const course = courses.reduce((a, b) => (b.cardCount < a.cardCount ? b : a))
  const row = page.locator('.word-set-row').filter({ has: page.getByText(course.title, { exact: true }) })
  await expect(row).toContainText(`0/${course.cardCount}장`)
  await row.click()

  // 회신마다 결과를 보이지 않고 바로 다음 카드 녹음을 부른다 (5단계)
  const attemptIds: string[] = []
  for (let n = 1; n <= course.cardCount; n++) {
    await expect.poll(async () => (await intonationCalls(page)).length).toBe(n)
    const call = (await intonationCalls(page))[n - 1]
    expect(call).toMatchObject({ itemNumber: n, totalItems: course.cardCount })
    const attemptId = await uploadRecording(request, token, call.cardId)
    attemptIds.push(attemptId)
    await replyRecorded(page, call.cardId, attemptId)
    await expect(page.getByText('억양 점수', { exact: true })).toHaveCount(0)
  }
  expect(await intonationCalls(page)).toHaveLength(course.cardCount)
  // 마지막 카드는 막 올렸으니 아직 분석 중이다 — 대기를 거쳐 목록
  await expect(page.getByText('분석 중이에요', { exact: true })).toBeVisible()

  await expect(page.getByRole('heading', { level: 1, name: `${course.title} 코스를 마쳤어요` })).toBeVisible({ timeout: 90_000 })
  const attempts = await Promise.all(attemptIds.map((id) => fetchAttempt(request, token, id)))
  expect(attempts.map((a) => a.status)).toEqual(attemptIds.map(() => 'COMPLETED'))
  const scores = attempts.map((a) => a.score!)
  await expectSummary(page, course.title, scores)

  // 1번 행 → A-5 서버 점수 그대로, 첫 시도라 직전 대비 없음
  await resultRows(page).first().click()
  const first = await expectFeedbackMatchesServer(page, request, token, attemptIds[0])
  expect(first.previousScore).toBeNull()
  await expect(page.locator('.intonation-delta')).toHaveCount(0)

  // [다시 시도] → 같은 카드 녹음 호출(복귀 모드) → 새 키로 두 번째 업로드 → 그 카드 대기 → A-5 직전 대비 (AC: 2회차)
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect.poll(async () => (await intonationCalls(page)).length).toBe(course.cardCount + 1)
  const firstCardId = (await intonationCalls(page))[0].cardId
  expect((await intonationCalls(page))[course.cardCount].cardId).toBe(firstCardId)
  const secondAttemptId = await uploadRecording(request, token, firstCardId)
  expect(secondAttemptId).not.toBe(attemptIds[0])
  await replyRecorded(page, firstCardId, secondAttemptId)
  await expect(page.getByText('분석 중이에요', { exact: true })).toBeVisible()
  const second = await expectFeedbackMatchesServer(page, request, token, secondAttemptId)
  expect(second.previousScore).toBe(first.score)
  const delta = page.locator('.intonation-delta')
  await expect(delta).toContainText(`지난번보다 ${formatDelta(second.score! - first.score!)}점`)
  await expect(delta).toContainText(`지난번 ${first.score}점에서 ${second.score}점`)

  // [결과 목록으로] → 1번 행·평균이 2회차 점수로 갱신
  await page.getByRole('button', { name: '결과 목록으로', exact: true }).click()
  await expectSummary(page, course.title, [second.score!, ...scores.slice(1)])

  // [코스 목록으로] → A-1. 완료 저장 호출은 없고 서버가 시도 기록으로 계산한다 (KAN-268)
  await page.getByRole('button', { name: '코스 목록으로', exact: true }).click()
  await expectCourseList(page)
  await expect(row.locator('.word-set-row__meta')).toHaveText(/완료$/)
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
  await openIntonation(page, { token: await loginWithFakeIdp(request) })
  await openFirstCourse(page)
  const total = (await intonationCalls(page))[0].totalItems
  for (let n = 0; n < total; n++) {
    await expect.poll(async () => (await intonationCalls(page)).length).toBe(n + 1)
    await replyRecorded(page, (await intonationCalls(page))[n].cardId, `la_e2e_${n}`)
  }
  const cards = await intonationCalls(page)
  await expect(page.getByText(/코스를 마쳤어요$/)).toBeVisible()
  await expect(page.getByText(/^평균/)).toHaveCount(0) // 완료 카드가 없으면 평균 줄이 없다
  await expect(resultRows(page).locator('.word-set-row__meta')).toHaveText(cards.map(() => '다시 녹음 필요'))

  for (const [i, [, message, showsLine]] of exits.entries()) {
    await resultRows(page).nth(i).click()
    await expect(page.getByText(message, { exact: true })).toBeVisible()
    // 오독·조용함만 무엇을 다시 말할지 대사를 다시 보인다
    await expect(page.getByText(cards[i].prompt, { exact: true })).toHaveCount(showsLine ? 1 : 0)
    // [다시 녹음]·[결과 목록으로] + 라우트의 ✕(코스 목록으로, KAN-252)
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
