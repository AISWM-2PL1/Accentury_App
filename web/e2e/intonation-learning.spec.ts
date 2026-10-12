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
 * 2. **회신 → 자리 표시 → 다음 카드가 실 문서에서 이어진다.** 네이티브 회신은
 *    `window.AccenturyWeb.onIntonationRecorded`를 다음 틱에 부르는 것으로 흉내 낸다
 *    (evaluateJavascript와 같은 순서). 회신이 없거나(뒤로가기) 다른 카드 것이면 A-2가 그대로여야 한다.
 *
 * 실제 녹음·업로드는 네이티브 몫이라 이 스펙 밖이다 — 에뮬레이터 확인이 덮는다
 * (`docs/wiki/browser-e2e.md`의 「억양 학습 스펙」 절).
 *
 * 브리지 흉내·로그인·StrictMode 이중 조회 주의는 `word-learning.spec.ts`와 같다. 백엔드는
 * `--accentury.auth.fake-idp=true`로 떠 있어야 하고 Flyway 시드 코스(V10)가 있어야 한다.
 */

import { expect, test, type Page } from '@playwright/test'
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

/** 네이티브 회신 흉내 — 테스트가 고른 cardId로 */
function replyRecorded(page: Page, cardId: string): Promise<void> {
  return page.evaluate((id) => {
    const web = (window as unknown as { AccenturyWeb: { onIntonationRecorded: (p: string) => void } }).AccenturyWeb
    web.onIntonationRecorded(JSON.stringify({ cardId: id, attemptId: 'la_e2e_manual' }))
  }, cardId)
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

  // 회신 → 「분석 중」 자리 표시 → 출구 하나
  await replyRecorded(page, card.cardId)
  await expect(page.getByText('분석 중이에요', { exact: true })).toBeVisible()
  if (cards.length > 1) {
    await page.getByRole('button', { name: '다음 카드', exact: true }).click()
    await expectCardProgress(page, 2, cards.length)
    await expect(page.getByRole('heading', { level: 1, name: cards[1].dialect, exact: true })).toBeVisible()
    await expect.poll(async () => (await intonationCalls(page)).length).toBe(2)
    expect((await intonationCalls(page))[1]).toMatchObject({ cardId: cards[1].cardId, itemNumber: 2, totalItems: cards.length })
  } else {
    await page.getByRole('button', { name: '코스 목록으로', exact: true }).click()
    await expectCourseList(page)
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

test('다른 카드의 늦은 회신은 무시하고 지금 카드의 회신만 받는다', async ({ page, request }) => {
  await openIntonation(page, { token: await loginWithFakeIdp(request) })
  await openFirstCourse(page)
  const { cardId } = (await intonationCalls(page))[0]

  await replyRecorded(page, `${cardId}-other`)
  await page.waitForTimeout(500)
  await expect(speak(page)).toBeVisible()
  await expect(page.getByText('분석 중이에요', { exact: true })).toHaveCount(0)

  // 수신 지점이 살아 있었다는 앵커 — 같은 cardId면 넘어간다 (없음 단언이 헛돌지 않게)
  await replyRecorded(page, cardId)
  await expect(page.getByText('분석 중이에요', { exact: true })).toBeVisible()
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

test('빈 목록 - 「아직 준비 중인 코스예요」와 [학습 종류로] 하나', async ({ page, request }) => {
  await page.route(
    (url) => url.pathname === LIST_PATH,
    (route) => route.fulfill({ json: { contentVersion: 'in-e2e', courses: [] } }),
  )
  await openIntonation(page, { token: await loginWithFakeIdp(request) })

  await expect(page.getByText('아직 준비 중인 코스예요', { exact: true })).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '학습 종류로', exact: true })).toBeVisible()
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

test('로그인 안 됨 - 토큰이 빈 문자열이면 로그인 안내와 [학습 종류로]', async ({ page }) => {
  await openIntonation(page, { token: '' })
  await expect(page.getByText('로그인하면 억양 학습을 할 수 있어요', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '학습 종류로', exact: true })).toBeVisible()
})

test('401 - 브리지로 토큰을 갱신한 뒤 같은 요청을 다시 보내 목록이 뜬다', async ({ page, request }) => {
  const token = await loginWithFakeIdp(request)
  await openIntonation(page, { token: 'e2e-expired-token', refreshTo: token })
  await expectCourseList(page)
})
