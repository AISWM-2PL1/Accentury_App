/**
 * 단어 스탬프 (KAN-255 6단계 → KAN-347 4단계) — 앱 WebView 실행을 흉내 내 실 백엔드로 세트 하나를 끝까지 돈다. 세트 목록(W-1)은
 * KAN-347 3단계에서 학습 탭 「사투리 여행」 지도로 바뀌었다 — 지도의 [시작]으로 들어가 성적표의 「지도로」로 돌아온다.
 *
 * 5초 제한(4-2)은 빌드 변수 `VITE_WORD_TIME_LIMIT=true`로 켠 판에서 돈다(`playwright.config.ts`가 기본으로 켠다). 시간 초과 답안과
 * 성적표의 별·코스 별은 서버 KAN-360·KAN-359 전이라 맨 아래 두 스펙이 그 계약 응답을 `page.route`로 목으로 준다.
 *
 * 여기서만 확인할 수 있는 것이 둘이다.
 *
 * 1. **계정 토큰이 브리지를 건너 실제로 통한다.** vitest는 `deps.getToken`으로 토큰을 갈아 끼워
 *    서버가 그 토큰을 받아 주는지는 보지 않는다. 여기서는 가짜 IdP로 받은 진짜 Access 토큰을
 *    `window.AccenturyBridge.getAccessToken`에 심고, 401 갱신 재시도까지 `onAccessTokenRefreshed`
 *    회신으로 실제 순서대로 걷는다.
 * 2. **화면이 서버 채점과 같은 수를 보인다.** W-4에서 읽은 정오를 세어 W-5의 문항 수·맞힌 수·
 *    정답률·오답 목록과 맞춘다 (AC 3). 서버가 정오를 정하고 W-5도 서버가 세므로, 둘이 어긋나면
 *    화면이 응답을 잘못 옮긴 것이다.
 *
 * ## 앱 실행으로 들어가는 법
 *
 * URL에 `bridge=2`가 있으면 웹은 앱 실행으로 보고 스큐 게이트를 지나간다 (`bridge.ts`의
 * `isBridgeCompatible`). 브리지 객체는 `addInitScript`로 문서보다 먼저 심는다 — 화면이 진입하자마자
 * 목록을 부르므로 늦게 심으면 첫 요청이 토큰 없이 나간다. 메서드는 이 화면이 부르는 것만 둔다.
 *
 * 백엔드는 `--accentury.auth.fake-idp=true`로 떠 있어야 한다 (`helpers/accountLogin.ts`,
 * `docs/wiki/browser-e2e.md`의 「단어 학습 스펙」 절).
 */

import { expect, test, type Page } from '@playwright/test'
import { loginWithFakeIdp } from './helpers/accountLogin'

/**
 * 앱이 WebView에 싣는 쿼리와 같은 모양. 학습 탭의 새 값은 `learn`이지만 옛 값 `screen=words`로 연다 — 옛 앱 빌드·옛 링크가
 * 이 값으로 들어와도 학습 탭이 열려야 한다 (KAN-347 3-1)
 */
const WORDS_URL = '/?bridge=2&app=1.0&screen=words'

interface BridgeMock {
  /** 처음 `getAccessToken`이 돌려줄 값. 빈 문자열이면 로그인 안 됨 */
  token: string
  /** 있으면 `refreshAccessToken`이 토큰을 이 값으로 바꾸고 'ok'를 회신한다. 없으면 'failed' */
  refreshTo?: string
}

/** 브리지 흉내를 심고 단어 학습으로 들어간다. 갱신 호출 수는 [refreshCount]로 읽는다 */
async function openWords(page: Page, mock: BridgeMock): Promise<void> {
  await page.addInitScript(({ token, refreshTo }) => {
    let current = token
    const bridge = {
      refreshCount: 0,
      getContractVersion: () => 2,
      getAccessToken: () => current,
      refreshAccessToken: () => {
        bridge.refreshCount += 1
        if (refreshTo !== undefined) current = refreshTo
        // 네이티브처럼 호출이 돌아간 **뒤에** 회신한다 (evaluateJavascript는 다음 틱에 돈다)
        setTimeout(() => {
          const web = (window as unknown as { AccenturyWeb?: { onAccessTokenRefreshed?: (r: string) => void } })
            .AccenturyWeb
          web?.onAccessTokenRefreshed?.(refreshTo !== undefined ? 'ok' : 'failed')
        })
      },
    }
    Object.assign(window, { AccenturyBridge: bridge })
  }, mock)
  await page.goto(WORDS_URL)
}

function refreshCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { AccenturyBridge: { refreshCount: number } }).AccenturyBridge.refreshCount,
  )
}

/** 사투리 여행 지도가 그려졌는지. 제목과 지금 코스 카드가 있어야 한다 */
async function expectMap(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: '사투리 여행' })).toBeVisible()
  await expect(page.getByRole('region', { name: '지금 코스' })).toBeVisible()
}

test('지도 [시작]부터 성적표까지 한 바퀴 - 피드백 정오가 아이콘과 글자로 보이고 성적표 정답률·행이 그 수와 맞는다, 「지도로」에 도장', async ({
  page,
  request,
}) => {
  await openWords(page, { token: await loginWithFakeIdp(request) })

  // 지도. 새 계정은 1코스 첫 스탬프(단어 학습 1)부터다 (순차 잠금, 모두 1코스부터)
  await expectMap(page)
  const card = page.getByRole('region', { name: '지금 코스' })
  await expect(card.getByRole('heading', { level: 2, name: '단어 학습 1' })).toBeVisible()
  await expect(card).toContainText('1번째 스탬프')
  await card.getByRole('button', { name: '시작', exact: true }).click()

  // 카드(s-12). 진행 표시는 「단어 1 / N」. 카드 수는 세트마다 달라 [문제 풀기]가 나올 때까지 넘긴다
  await expect(page.getByRole('progressbar', { name: '단어' })).toHaveAttribute('aria-valuenow', '1')
  await expect(page.locator('.progress-indicator__label')).toHaveText('단어')
  const startQuiz = page.getByRole('button', { name: '문제 풀기', exact: true })
  const nextCard = page.getByRole('button', { name: '다음 카드', exact: true })
  await expect(startQuiz.or(nextCard)).toBeVisible()
  while (await nextCard.isVisible()) {
    await nextCard.click()
    await expect(startQuiz.or(nextCard)).toBeVisible()
  }
  await startQuiz.click()

  // W-3 → W-4 반복. 고른 답은 늘 첫 보기 — 정오는 서버가 정하고 스펙은 화면이 보인 대로 센다
  const showResult = page.getByRole('button', { name: '결과 보기', exact: true })
  const nextItem = page.getByRole('button', { name: '다음 문항', exact: true })
  let items = 0
  let correct = 0
  /** 피드백에서 본 오답 (문항 낱말, 고른 보기, 정답 보기) — 성적표 틀린 행 내용과 대조한다 (KAN-255 리뷰 P2) */
  const wrongSeen: string[][] = []
  for (;;) {
    // 고르기 전 [제출]은 비활성이고 5초 막대가 진행 표시 아래에 있다 (4-2)
    await expect(page.getByRole('button', { name: '제출', exact: true })).toBeDisabled()
    await expect(page.getByRole('timer')).toBeVisible()
    const prompt = (await page.locator('#word-prompt').textContent())?.trim() ?? ''
    // 서버 prompt 「'낱말'를 …」의 따옴표는 「」로 보인다 — 그 낱말이 성적표 행 이름(카드 표준어)이다
    const word = /^「(.+?)」/.exec(prompt)?.[1] ?? prompt
    // 보기 글자는 .choice__text다 — 앞에 번호 상자(KAN-288), 제출 뒤엔 「정답」/「내 답」 표시가 붙는다 (ChoiceList)
    const chosenText = (await page.locator('.choice-list label').first().locator('.choice__text').textContent())?.trim() ?? ''
    await page.getByRole('radiogroup').getByRole('radio').first().check({ force: true })
    await page.getByRole('button', { name: '제출', exact: true }).click()

    // W-4. 색을 빼도 판별되는가 — 글자 「정답」/「오답」과 아이콘 모양(svg)이 함께 있어야 한다
    const verdict = page.getByRole('status')
    await expect(verdict).toBeVisible()
    const label = verdict.locator('.word-verdict__label')
    await expect(label).toHaveText(/^(정답|오답)$/)
    await expect(label.locator('svg')).toHaveCount(1)
    await expect(verdict.locator('.word-verdict__explanation')).not.toBeEmpty()
    items += 1
    const correctText =
      (await page.locator('.choice-list label.choice--correct').locator('.choice__text').textContent())?.trim() ?? ''
    if ((await label.textContent()) === '정답') {
      correct += 1
      expect(correctText).toBe(chosenText)
    } else {
      wrongSeen.push([word, chosenText, correctText])
      await expect(page.locator('.choice-list label.choice--wrong')).toContainText('내 답')
    }

    // 자동으로 넘어가지 않는다 — 잠깐 기다려도 같은 문항의 W-4가 그대로다
    await page.waitForTimeout(500)
    await expect(verdict).toBeVisible()

    if (await showResult.isVisible()) break
    await nextItem.click()
    await expect(verdict).toBeHidden()
  }
  await showResult.click()

  // 성적표(s-15-A). 화면이 센 정오와 서버 집계가 같아야 한다 (AC 3)
  await expect(page.getByRole('heading', { level: 1, name: '단어 학습 1 결과' })).toBeVisible()
  await expect(page.getByText('스탬프 완료', { exact: true })).toBeVisible()
  const summary = (await page.locator('.word-report__summary').textContent())?.trim() ?? ''
  const percent = Number(/정답률 (\d+)%$/.exec(summary)?.[1])
  expect(summary).toBe(`${correct} / ${items} 정답 · 정답률 ${percent}%`)
  // 반올림 규칙은 서버 몫이라 내림·반올림 어느 쪽이든 받는다
  expect([Math.floor((correct * 100) / items), Math.round((correct * 100) / items)]).toContain(percent)
  await expect(page.locator('.score-donut')).toContainText(`${percent}점`)
  // 이 백엔드는 KAN-359 전이라 완료 응답에 stars가 없다 — 별과 「코스 별」 줄 없이 선다 (4-5)
  await expect(page.getByRole('img', { name: /별 3개 중/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: /^코스 별/ })).toHaveCount(0)
  // 행은 세트 문항 전체, 틀린 행은 펼쳐 「내 답 → 정답」. 순서는 서버 몫이라 정렬해 비교한다
  await expect(page.locator('.word-report__row')).toHaveCount(items)
  const wrongRows = page.locator('.word-report__row--wrong')
  await expect(wrongRows).toHaveCount(items - correct)
  for (const row of await wrongRows.all()) await row.locator('summary').click()
  const wrongShown = await wrongRows.evaluateAll((lis) =>
    lis.map((li) => [
      li.querySelector('.word-report__word')?.textContent?.trim() ?? '',
      li.querySelector('.word-report__answer s')?.textContent?.trim() ?? '',
      li.querySelector('.word-report__correct')?.textContent?.trim() ?? '',
    ]),
  )
  const byText = (a: string[], b: string[]) => a.join('|').localeCompare(b.join('|'))
  expect(wrongShown.sort(byText)).toEqual(wrongSeen.sort(byText))
  console.log(`[e2e] 단어 학습 ${items}문항 중 ${correct}개 정답 (${percent}%)`)

  // 「지도로」 — 방금 마친 스탬프가 완료로 돌아와 지금 코스 카드에 도장이 한 번 찍히고, 지금 스탬프는 다음(억양 학습 1)이다
  await page.getByRole('button', { name: '지도로', exact: true }).click()
  await expectMap(page)
  await expect(card).toHaveClass(/is-stamped/)
  await expect(card.locator('.travel-card__stamp')).toBeVisible()
  await expect(card.getByRole('heading', { level: 2, name: '억양 학습 1' })).toBeVisible()
  await expect(card).toContainText('1코스 1 / 9')
})

// 탭 바는 계정 로그인 상태에서만 선다(PR #33 리뷰 P1) — 토큰이 없으면 안내만이다. 로그인 빌드는 토큰이 늘 있고 익명 빌드는
// 탭 바가 없어 이 화면에 오지 않는다.
test('로그인 안 됨 - 토큰이 빈 문자열이면 로그인 안내만, 탭 바는 없다 (KAN-252, PR #33 리뷰 P1)', async ({ page }) => {
  await openWords(page, { token: '' })
  await expect(page.getByText('로그인하면 학습을 이어갈 수 있어요', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0)
})

test('401 - 브리지로 토큰을 갱신한 뒤 같은 요청을 다시 보내 목록이 뜬다', async ({ page, request }) => {
  const token = await loginWithFakeIdp(request)
  await openWords(page, { token: 'e2e-expired-token', refreshTo: token })

  await expectMap(page)
  // 갱신이 실제로 브리지를 거쳤다. 횟수를 1로 못 박지 않는 이유: 개발 빌드 StrictMode가 진입
  // 조회를 두 번 보내, 둘째 401이 첫 갱신이 끝난 뒤에 닿으면 갱신이 한 번 더 나가는 것도 정상이다
  expect(await refreshCount(page)).toBeGreaterThanOrEqual(1)
})

test('목록 조회 실패 - 「오류 코드 500」과 [다시 시도], 다시 불러 지도가 뜬다 (KAN-347 3-7)', async ({ page, request }) => {
  /*
   * [다시 시도]를 누르기 전까지는 전부 500이다. 「첫 요청만」으로 하면 개발 빌드 StrictMode가 보내는
   * 둘째 진입 조회가 성공해 오류 화면을 덮어, 버튼이 뜨지 않거나 스쳐 지나간다.
   */
  let failing = true
  await page.route(
    (url) => url.pathname === '/v0/learning/word-sets',
    (route) => (failing ? route.fulfill({ status: 500, body: '' }) : route.continue()),
  )
  await openWords(page, { token: await loginWithFakeIdp(request) })

  const retry = page.getByRole('button', { name: '다시 시도', exact: true })
  await expect(retry).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: '목록을 불러오지 못했어요' })).toBeVisible()
  await expect(page.getByText('오류 코드 500', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible()
  failing = false
  await retry.click()
  await expectMap(page)
})

test('W-2 오른쪽 위 ✕ - 누르면 사투리 여행 지도로 돌아가고 탭 바가 다시 선다 (KAN-252, KAN-347 4-1)', async ({
  page,
  request,
}) => {
  await openWords(page, { token: await loginWithFakeIdp(request) })
  await expectMap(page)
  const tabBar = page.getByRole('navigation', { name: '주 메뉴' })
  await expect(tabBar).toBeVisible()

  await page.getByRole('button', { name: '시작', exact: true }).click()
  await expect(page.getByRole('progressbar')).toBeVisible()
  // 학습 중엔 탭 바가 숨고 ✕가 유일한 출구다
  await expect(tabBar).toBeHidden()
  await page.getByRole('button', { name: '닫기', exact: true }).click()

  await expectMap(page)
  // 끝내지 않고 나왔으니 도장은 없다
  await expect(page.getByRole('region', { name: '지금 코스' })).not.toHaveClass(/is-stamped/)
  await expect(tabBar).toBeVisible()
  await expect(page.getByRole('button', { name: '닫기', exact: true })).toBeHidden()
})

// ── 서버 KAN-359·KAN-360 계약 목 ──────────────────────────────────────────

/**
 * 학습 API 전부를 목으로 준다(백엔드 불필요). 단어 세트 w1(문항 2개)·w2, 억양 코스 k1~k5(k1은 이미 완료) — w1을 마치면 지금 스탬프가
 * 단어 학습 2(w2)가 된다. 문항 1은 고르지 않고 5초를 넘겨 시간 초과 답안(`timedOut`, KAN-360)을 받는다.
 * `kan359`이면 완료 응답에 이번 시도 `stars`, 구간 요약(`/levels`)에 코스 별 20 → 22 / 21을 준다. 아니면 둘 다 없다(구간 요약 404).
 */
async function mockLearning(page: Page, kan359: boolean): Promise<{ answers: unknown[] }> {
  const answers: unknown[] = []
  let done = false
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
  const notFound = json({ code: 'NOT_FOUND', message: '없음', retryable: false, retryAfterMs: null, correlationId: 'e2e' }, 404)
  const set = (setId: string, standard: string, dialect: string) => ({
    contentVersion: 'e2e', setId, seq: setId === 'w1' ? 1 : 2, level: 1, category: '', title: '',
    cards: [{ cardId: `${setId}c1`, standard, dialect }, { cardId: `${setId}c2`, standard: '할아버지', dialect: '할배' }],
    items: [
      { itemId: 'i1', seq: 1, cardId: `${setId}c1`, prompt: `'${standard}'를 경남 사투리로 무엇이라 할까요?`, choices: [{ choiceId: 'i1a', text: dialect }, { choiceId: 'i1b', text: '오마니' }] },
      { itemId: 'i2', seq: 2, cardId: `${setId}c2`, prompt: "'할아버지'를 경남 사투리로 무엇이라 할까요?", choices: [{ choiceId: 'i2a', text: '할배' }, { choiceId: 'i2b', text: '할망' }] },
    ],
  })
  await page.route(
    (url) => url.pathname.startsWith('/v0/'),
    async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/v0/learning/word-sets') {
        return route.fulfill(
          json({
            contentVersion: 'e2e',
            sets: ['w1', 'w2'].map((setId, i) => ({
              setId, seq: i + 1, level: 1, category: '', title: '', cardCount: 2, itemCount: 2, completed: setId === 'w1' && done,
              ...(kan359 ? { score: setId === 'w1' && done ? 50 : null, stars: setId === 'w1' && done ? 2 : 0 } : {}),
            })),
          }),
        )
      }
      if (path === '/v0/learning/intonation-courses') {
        return route.fulfill(
          json({
            contentVersion: 'e2e',
            courses: [1, 2, 3, 4, 5].map((seq) => ({
              courseId: `k${seq}`, seq, level: 1, topic: null, title: '', cardCount: 3, completedCardCount: seq === 1 ? 3 : 0,
              completed: seq === 1, recommended: false, ...(kan359 ? { score: seq === 1 ? 80 : null, stars: seq === 1 ? 3 : 0 } : {}),
            })),
          }),
        )
      }
      if (path === '/v0/learning/levels' && kan359) {
        const collected = done ? 22 : 20
        return route.fulfill(
          json({
            totalStars: collected,
            starThresholds: [30, 70],
            levels: [
              { level: 1, setCount: 9, completedSetCount: done ? 2 : 1, collectedStars: collected, requiredStars: 21, unlocked: true },
              { level: 2, setCount: 9, completedSetCount: 0, collectedStars: 0, requiredStars: 21, unlocked: collected >= 21 },
            ],
          }),
        )
      }
      if (path === '/v0/learning/word-sets/w1') return route.fulfill(json(set('w1', '할머니', '할매')))
      if (path === '/v0/learning/word-sets/w2') return route.fulfill(json(set('w2', '어머니', '어무이')))
      if (path === '/v0/learning/word-sets/w1/attempts') {
        return route.fulfill(json({ attemptId: 'a1', contentVersion: 'e2e', setId: 'w1', itemCount: 2, startedAt: '2026-11-16T00:00:00Z' }, 201))
      }
      const answer = /^\/v0\/learning\/word-attempts\/a1\/items\/(i[12])\/answer$/.exec(path)
      if (answer !== null) {
        answers.push(route.request().postDataJSON())
        const first = answer[1] === 'i1'
        return route.fulfill(
          json({
            correct: !first,
            correctChoiceId: first ? 'i1a' : 'i2a',
            correctText: first ? '할매' : '할배',
            explanation: first ? "'할매'는 경남에서 '할머니'를 이르는 말입니다." : "'할배'는 경남에서 '할아버지'를 이르는 말입니다.",
            answeredCount: first ? 1 : 2,
            itemCount: 2,
          }),
        )
      }
      if (path === '/v0/learning/word-attempts/a1/complete') {
        done = true
        return route.fulfill(
          json({
            attemptId: 'a1', contentVersion: 'e2e', setId: 'w1', itemCount: 2, correctCount: 1, accuracyPercent: 50,
            wrongItems: [
              {
                itemId: 'i1', cardId: 'w1c1', prompt: "'할머니'를 경남 사투리로 무엇이라 할까요?", chosenChoiceId: null, chosenText: null,
                correctChoiceId: 'i1a', correctText: '할매', explanation: "'할매'는 경남에서 '할머니'를 이르는 말입니다.", timedOut: true,
              },
            ],
            completedAt: '2026-11-16T00:01:00Z',
            ...(kan359 ? { stars: 2 } : {}),
          }),
        )
      }
      return route.fulfill(notFound)
    },
  )
  return { answers }
}

/** 지도 [시작] → 카드 → 문항 1은 5초를 넘기고, 문항 2는 정답을 골라 성적표까지 */
async function finishWithTimeout(page: Page): Promise<void> {
  await expectMap(page)
  await page.getByRole('region', { name: '지금 코스' }).getByRole('button', { name: '시작', exact: true }).click()
  await page.getByRole('button', { name: '다음 카드', exact: true }).click()
  await page.getByRole('button', { name: '문제 풀기', exact: true }).click()

  // 문항(s-13): 서버 prompt의 따옴표가 「」로, 5초 막대가 진행 표시 아래에서 줄고 마지막 1초에 경고로 바뀐다 (타일 11)
  await expect(page.locator('#word-prompt')).toHaveText('「할머니」를 경남 사투리로 무엇이라 할까요?')
  const timer = page.getByRole('timer')
  await expect(timer).toHaveAttribute('aria-label', '남은 시간 5초')
  await expect(page.getByRole('button', { name: '제출', exact: true })).toBeDisabled()
  await expect(timer).toHaveClass(/word-timer--warning/, { timeout: 6_000 })

  // 5초가 끝나면 잠금 + 정답 공개 + 「시간이 다 됐어요」 + [다음 문항]
  await expect(page.getByRole('status')).toContainText('시간이 다 됐어요', { timeout: 3_000 })
  for (const radio of await page.getByRole('radio').all()) await expect(radio).toBeDisabled()
  await expect(page.locator('.choice-list label.choice--correct')).toContainText('할매')
  await expect(page.locator('.choice-list label.choice--correct')).toContainText('정답')
  await expect(page.locator('.choice-list')).not.toContainText('내 답')
  await page.getByRole('button', { name: '다음 문항', exact: true }).click()

  await page.getByRole('radio', { name: '할배' }).check({ force: true })
  await page.getByRole('button', { name: '제출', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('정답')
  await page.getByRole('button', { name: '결과 보기', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '단어 학습 1 결과' })).toBeVisible()
}

test('시간 초과(KAN-360 목) + 별·코스 별(KAN-359 목) - 「시간 초과 → 정답」 행, 「★ 20 → 22 / 21」, 「2코스가 열렸어요」, [다음 스탬프]는 바로 다음 스탬프', async ({
  page,
}) => {
  const { answers } = await mockLearning(page, true)
  await openWords(page, { token: 'e2e-mock-token' })
  await finishWithTimeout(page)

  // 고르지 않은 답은 choiceId 없이 timedOut으로 나갔다 (KAN-360 계약)
  expect(answers).toEqual([{ timedOut: true }, { choiceId: 'i2a' }])

  await expect(page.getByText('스탬프 완료', { exact: true })).toBeVisible()
  await expect(page.locator('.score-donut')).toContainText('50점')
  await expect(page.getByRole('img', { name: '별 3개 중 2개' })).toBeVisible()
  const course = page.getByRole('region', { name: '코스 별 20개에서 22개로, 다음 코스까지 필요한 별 21개' })
  await expect(course.locator('.stamp-reward__count')).toHaveText('★ 20 → 22 / 21')
  await expect(course).toContainText('이번 스탬프 +2')
  await expect(course.getByRole('status')).toHaveText('2코스가 열렸어요')

  await expect(page.getByText('1 / 2 정답 · 정답률 50%', { exact: true })).toBeVisible()
  const rows = page.locator('.word-report__row')
  await expect(rows).toHaveCount(2)
  const timedOutRow = rows.filter({ hasText: '할머니' })
  await timedOutRow.locator('summary').click()
  await expect(timedOutRow.locator('.word-report__answer')).toHaveText(/^시간 초과\s*→\s*정답\s*할매$/)
  await expect(timedOutRow).not.toContainText('내 답')
  await expect(rows.filter({ hasText: '할아버지' })).toContainText('정답')

  // [다음 스탬프] — 지도를 거치지 않고 지금 스탬프(단어 학습 2)의 카드로 바로 간다
  await page.getByRole('button', { name: '다음 스탬프', exact: true }).click()
  await expect(page.getByText('어무이', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: '사투리 여행' })).toHaveCount(0)
})

test('KAN-359 전(완료 응답 stars 없음, 구간 요약 404) - 별·코스 별 줄 없이 점수 원과 문항별 결과만, 「지도로」는 지도', async ({
  page,
}) => {
  await mockLearning(page, false)
  await openWords(page, { token: 'e2e-mock-token' })
  await finishWithTimeout(page)

  await expect(page.locator('.score-donut')).toContainText('50점')
  await expect(page.getByRole('img', { name: /별 3개 중/ })).toHaveCount(0)
  await expect(page.getByRole('region', { name: /^코스 별/ })).toHaveCount(0)
  await expect(page.locator('.word-report__row')).toHaveCount(2)
  await page.getByRole('button', { name: '지도로', exact: true }).click()
  await expectMap(page)
})
