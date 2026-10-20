/**
 * 앱 진입 구조 (KAN-252) — 하단 탭 바(홈 · 억양 학습 · 단어 학습 · 사투리 번역기 · 설정)와 결과 화면의
 * [이 등급에 맞는 억양 학습 시작]. 1단계의 학습 종류 선택 L-1은 2단계에서 탭 바로 바뀌어 없어졌다(2026-10-13 결정).
 *
 * 여기서만 확인할 수 있는 것은 **문서를 다시 로드하는 전환이 앱 표식(`bridge`·`app`)을 싣고 간다**는 점이다.
 * vitest는 `navigate`에 넘긴 URL까지만 보고, 그 URL로 실제로 다시 열린 문서가 앱 실행으로 판정돼 탭 화면과
 * 탭 바를 그리는지는 보지 않는다. 표식이 떨어지면 다음 문서가 웹 단독으로 갈려 탭 바가 사라지거나 로그인에서 막힌다.
 *
 * 서버 응답은 전부 가로챈다 — 이 스펙이 보는 것은 화면 사이의 길이지 학습 API가 아니다(그건
 * `word-learning`·`intonation-learning` 스펙 몫). 그래서 백엔드 없이 돈다. 앱 실행 흉내는 두 스펙과 같다:
 * URL의 `bridge=2`와 `addInitScript`로 먼저 심은 브리지.
 */

import { expect, test, type Page } from '@playwright/test'

const RESULT_BODY = {
  status: 'READY',
  scores: { intonation: 78, vocabulary: 60, overall: 72 },
  tier: { code: 'HONORARY', name: '명예주민', rank: 4, of: 5 },
  comment: '억양은 거의 토박이인데 단어에서 들켰습니다.',
  share: {
    imageUrl: 'https://static.accentury.app/tier/honorary.png',
    text: '나는 명예주민! 너도 시도해볼래?',
    webTestUrl: 'https://accentury.app/t?c=kko_share',
  },
  testVersion: 'gn-2026.08.1',
  scoreVersion: 'sv-0.3',
  expiresAt: '2099-01-01T00:00:00Z',
}

const LEARN_BUTTON = '이 등급에 맞는 억양 학습 시작'

const WORD_SET = {
  contentVersion: 'e2e',
  setId: 's1',
  seq: 1,
  level: 1,
  category: '음식',
  title: '먹을 것',
  cards: [{ cardId: 'c1', standard: '부추', dialect: '정구지' }],
  items: [{ itemId: 'i1', seq: 1, cardId: 'c1', prompt: '부추를 사투리로?', choices: [{ choiceId: 'i1a', text: '정구지' }] }],
}

/** 결과·A-1·W-1 목록 응답을 가로챈다. 목록은 한 줄씩이면 화면이 그려진 것을 확인하기에 충분하다 */
async function stubServer(page: Page): Promise<void> {
  await page.route(/\/v0\/sessions\/[^/]+\/result$/, (route) => route.fulfill({ json: RESULT_BODY }))
  await page.route(
    (url) => url.pathname === '/v0/learning/intonation-courses',
    (route) =>
      route.fulfill({
        json: {
          contentVersion: 'e2e',
          courses: [
            { courseId: 'k1', seq: 1, level: 1, topic: null, title: '인사', cardCount: 3, completedCardCount: 0, completed: false, recommended: true },
          ],
        },
      }),
  )
  await page.route(
    (url) => url.pathname === '/v0/learning/word-sets',
    (route) =>
      route.fulfill({
        json: {
          contentVersion: 'e2e',
          sets: [{ setId: 's1', seq: 1, level: 1, category: '음식', title: '먹을 것', cardCount: 1, itemCount: 1 }],
        },
      }),
  )
  await page.route(
    (url) => url.pathname === '/v0/learning/word-sets/s1',
    (route) => route.fulfill({ json: WORD_SET }),
  )
}

/**
 * 홈 상태(`GET /v0/learning/home`, KAN-287)를 가로챈다. [stubServer]에 넣지 않는 이유는 홈을 여는 테스트마다
 * 응답을 따로 골라야 해서다. 숫자를 주면 그 상태 코드의 오류 봉투로 답한다.
 */
async function stubHome(page: Page, reply: object | number): Promise<void> {
  await page.route(
    (url) => url.pathname === '/v0/learning/home',
    (route) =>
      typeof reply === 'number'
        ? route.fulfill({ status: reply, json: { code: 'INTERNAL', message: '잠시 뒤 다시', retryable: true } })
        : route.fulfill({ json: reply }),
  )
}

/**
 * 앱 WebView 흉내 — 결과 조회용 세션 토큰과 학습용 계정 토큰을 같이 준다. `openSettings`·`requestMicPermission`은
 * 부른 횟수만 센다(네이티브가 설정 화면을 띄우고, 테스트 시작 게이트를 여는 자리다). 문서를 다시 로드하면 새로 심기므로 횟수는 문서마다 0부터다.
 */
async function asApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const bridge = {
      settingsCalls: 0,
      getContractVersion: () => 2,
      getSessionToken: () => 'e2e-session-token',
      getAccessToken: () => 'e2e-access-token',
      openSettings: () => {
        bridge.settingsCalls += 1
      },
      micCalls: 0,
      requestMicPermission: () => {
        bridge.micCalls += 1
      },
    }
    Object.assign(window, { AccenturyBridge: bridge })
  })
}

const tabBar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' })
const tab = (page: Page, name: string) => tabBar(page).getByRole('button', { name, exact: true })

const micCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { AccenturyBridge: { micCalls: number } }).AccenturyBridge.micCalls)

/** 다시 열린 문서가 앱 표식을 그대로 싣고 있는지 */
function expectAppMarkers(page: Page, screen: string): void {
  const params = new URL(page.url()).searchParams
  expect(params.get('screen')).toBe(screen)
  expect(params.get('bridge')).toBe('2')
  expect(params.get('app')).toBe('1.0')
}

test('앱 결과 화면 - 공유 아래 [이 등급에 맞는 억양 학습 시작]이 서고, 누르면 A-1이 앱 실행으로 열린다', async ({ page }) => {
  await stubServer(page)
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=result&sessionId=s_e2e')

  const share = page.getByRole('button', { name: '친구에게 공유하기', exact: true })
  const learn = page.getByRole('button', { name: LEARN_BUTTON, exact: true })
  await expect(share).toBeVisible()
  await expect(learn).toBeVisible()
  // 공유 바로 아래 — 위계를 바꾸지 않는다
  const [shareBox, learnBox] = [await share.boundingBox(), await learn.boundingBox()]
  expect(learnBox!.y).toBeGreaterThan(shareBox!.y)
  // 앱 안 결과 화면에는 탭 바가 서고, 결과는 탭 화면이 아니라 어느 탭도 강조하지 않는다
  await expect(tabBar(page)).toBeVisible()
  await expect(tabBar(page).locator('[aria-current]')).toHaveCount(0)

  await learn.click()
  await expect(page.getByRole('heading', { level: 1, name: '억양 학습' })).toBeVisible()
  expectAppMarkers(page, 'intonation')
  expect(new URL(page.url()).searchParams.get('sessionId')).toBeNull()
})

test('익명 빌드 결과 화면 - 앱 안이라도 계정 토큰이 없으면 탭 바·학습 버튼이 없고 [다시 테스트하기]는 그대로다 (PR #33 리뷰 P1)', async ({ page }) => {
  await stubServer(page)
  // 익명 빌드 WebView 흉내 — 브리지·bridge=2는 있고 getAccessToken은 빈 값이다(계정 클라이언트 없음, webview-bridge §11)
  await page.addInitScript(() => {
    Object.assign(window, {
      AccenturyBridge: {
        getContractVersion: () => 2,
        getSessionToken: () => 'e2e-session-token',
        getAccessToken: () => '',
        requestMicPermission: () => {},
      },
    })
  })
  await page.goto('/?bridge=2&app=1.0&screen=result&sessionId=s_e2e')

  await expect(page.getByRole('button', { name: '친구에게 공유하기', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 테스트하기', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: LEARN_BUTTON, exact: true })).toHaveCount(0)
  await expect(tabBar(page)).toHaveCount(0)
})

test('웹 단독 결과 화면 - 억양 학습 버튼도 탭 바도 없다 (2026-10-13 사용자 결정)', async ({ page }) => {
  await stubServer(page)
  // 웹 단독 결과는 이 탭의 세션 저장소 토큰으로 조회한다 (`session/webSession.ts`)
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'accentury.webSession',
      JSON.stringify({ sessionId: 's_web', sessionToken: 'st_web', testVersion: 'gn-2026.08.1', voiceSet: 1, expiresAt: '2099-01-01T00:00:00Z' }),
    )
  })
  await page.goto('/?screen=result&sessionId=s_web')

  await expect(page.getByRole('button', { name: '친구에게 공유하기', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: LEARN_BUTTON, exact: true })).toHaveCount(0)
  await expect(tabBar(page)).toHaveCount(0)
})

test('앱 홈 - 탭 바로 억양 → 단어 → 번역기 → 홈을 돌고, 매 문서가 앱 실행 그대로다', async ({ page }) => {
  await stubServer(page)
  await stubHome(page, 503)
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=home')

  await expect(page.getByRole('heading', { level: 1, name: '내 사투리 레벨 테스트' })).toBeVisible()
  await expect(tab(page, '홈')).toHaveAttribute('aria-current', 'page')
  await expect(tabBar(page).getByRole('button')).toHaveCount(5)

  await tab(page, '억양 학습').click()
  await expect(page.getByRole('heading', { level: 1, name: '억양 학습' })).toBeVisible()
  await expect(tab(page, '억양 학습')).toHaveAttribute('aria-current', 'page')
  expectAppMarkers(page, 'intonation')

  await tab(page, '단어 학습').click()
  await expect(page.getByRole('heading', { level: 1, name: '단어 학습' })).toBeVisible()
  await expect(tab(page, '단어 학습')).toHaveAttribute('aria-current', 'page')
  expectAppMarkers(page, 'words')

  await tab(page, '사투리 번역기').click()
  await expect(page.getByRole('heading', { level: 1, name: '사투리 번역기' })).toBeVisible()
  // 「준비 중이에요」 자리는 KAN-256 2단계에서 T-1 입력 화면으로 바뀌었다 (화면 자체는 translator 스펙)
  await expect(page.getByLabel('표준어 문장')).toBeVisible()
  expectAppMarkers(page, 'translate')

  await tab(page, '홈').click()
  await expect(page.getByRole('heading', { level: 1, name: '내 사투리 레벨 테스트' })).toBeVisible()
  expectAppMarkers(page, 'home')

  // 홈의 [레벨 테스트 시작]은 인트로를 거치지 않고 인트로 [시작하기]와 같은 브리지 호출로 바로 시작한다
  // (2026-10-13 사용자 결정). 이후 테스트 문서 재로드는 네이티브 몫이라 이 문서는 홈 그대로다.
  await page.getByRole('button', { name: '레벨 테스트 시작', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { AccenturyBridge: { micCalls: number } }).AccenturyBridge.micCalls))
    .toBe(1)
  expectAppMarkers(page, 'home')
  await expect(page.getByRole('button', { name: '내 억양 테스트하기', exact: true })).toHaveCount(0)

  // 인트로(재응시·앱 링크 진입)에는 탭 바가 없다
  await page.goto('/?bridge=2&app=1.0')
  await expect(page.getByRole('button', { name: '내 억양 테스트하기', exact: true })).toBeVisible()
  await expect(tabBar(page)).toHaveCount(0)
})

test('KAN-287 홈 테스트 후 - 등급 카드·KST 응시일·출석 문구가 서고, [억양 학습 시작]은 A-1로, [다시 테스트하기]는 브리지로 간다', async ({ page }) => {
  await stubServer(page)
  await stubHome(page, {
    levelTestTaken: true,
    levelTest: { testVersion: RESULT_BODY.testVersion, scoreVersion: RESULT_BODY.scoreVersion, tier: RESULT_BODY.tier, completedAt: '2026-10-13T16:00:00Z' },
    recommendedCourseId: 'k1',
    recommendedSetId: 's1',
    streak: { currentDays: 3, attendedToday: false, lastAttendedDate: '2026-10-13' },
  })
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=home')

  const card = page.getByRole('region', { name: '명예주민' })
  await expect(card.getByRole('heading', { level: 1, name: '명예주민' })).toBeVisible()
  await expect(card.getByRole('img', { name: '명예주민' })).toBeVisible()
  // UTC 16:00은 KST 다음 날 01:00 — 실브라우저 Intl에서도 날짜가 넘어간다
  await expect(card.locator('p.type-label')).toHaveText('2026년 10월 14일 응시')
  await expect(page.locator('p.home-streak')).toHaveText('3일 연속 출석 중 · 오늘 학습하면 4일')
  await expect(page.locator('.btn--primary')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1, name: '내 사투리 레벨 테스트' })).toHaveCount(0)
  await expect(tab(page, '홈')).toHaveAttribute('aria-current', 'page')

  await page.getByRole('button', { name: '억양 학습 시작', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '억양 학습' })).toBeVisible()
  expectAppMarkers(page, 'intonation')

  await tab(page, '홈').click()
  await page.getByRole('button', { name: '다시 테스트하기', exact: true }).click()
  await expect.poll(() => micCalls(page)).toBe(1)
  expectAppMarkers(page, 'home')
})

test('KAN-287 홈 테스트 전 - streak 키가 없는 구서버 응답이면 기존 홈 그대로, 출석 문구가 없다', async ({ page }) => {
  await stubServer(page)
  await stubHome(page, { levelTestTaken: false, levelTest: null, recommendedCourseId: null, recommendedSetId: null })
  await asApp(page)
  const home = page.waitForResponse((r) => new URL(r.url()).pathname === '/v0/learning/home')
  await page.goto('/?bridge=2&app=1.0&screen=home')
  await home

  await expect(page.getByRole('heading', { level: 1, name: '내 사투리 레벨 테스트' })).toBeVisible()
  await expect(page.getByRole('button', { name: '레벨 테스트 시작', exact: true })).toBeVisible()
  await expect(page.locator('.home-streak')).toHaveCount(0)
  await expect(tabBar(page)).toBeVisible()
})

test('KAN-287 홈 조회 실패 - 503 봉투면 카드만 숨기고 기존 홈·탭 바가 남아 [레벨 테스트 시작]이 동작한다', async ({ page }) => {
  await stubServer(page)
  await stubHome(page, 503)
  await asApp(page)
  const home = page.waitForResponse((r) => new URL(r.url()).pathname === '/v0/learning/home')
  await page.goto('/?bridge=2&app=1.0&screen=home')
  await home

  await expect(page.getByRole('heading', { level: 1, name: '내 사투리 레벨 테스트' })).toBeVisible()
  await expect(tabBar(page)).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.home-tier')).toHaveCount(0)

  await page.getByRole('button', { name: '레벨 테스트 시작', exact: true }).click()
  await expect.poll(() => micCalls(page)).toBe(1)
})

test('설정 탭 - 문서를 옮기지 않고 window.AccenturyBridge.openSettings를 한 번 부른다', async ({ page }) => {
  await stubServer(page)
  await stubHome(page, 503)
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=home')

  const before = page.url()
  await tab(page, '설정').click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { AccenturyBridge: { settingsCalls: number } }).AccenturyBridge.settingsCalls))
    .toBe(1)
  expect(page.url()).toBe(before)
})

test('탭 바는 목록에서만 - 단어 학습 카드(W-2)에 들어가면 사라지고, 목록 본문은 탭 바 높이만큼 아래를 띄운다', async ({ page }) => {
  await stubServer(page)
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=words')

  const row = page.getByRole('button', { name: /먹을 것/ })
  await expect(row).toBeVisible()
  await expect(tabBar(page)).toBeVisible()
  // 본문 아래 여백이 탭 바 높이 이상이다 — 목록이 길어 끝까지 스크롤해도 마지막 행이 띠 밑에 깔리지 않는다
  const barHeight = (await tabBar(page).boundingBox())!.height
  const mainPaddingBottom = await page.locator('main').evaluate((m) => parseFloat(getComputedStyle(m).paddingBottom))
  expect(barHeight).toBeGreaterThanOrEqual(48)
  expect(mainPaddingBottom).toBeGreaterThanOrEqual(barHeight)

  await row.click()
  await expect(page.getByRole('heading', { level: 1, name: '정구지' })).toBeVisible()
  await expect(tabBar(page)).toHaveCount(0)
})
