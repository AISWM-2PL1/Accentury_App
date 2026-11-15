/**
 * 앱 진입 구조 (KAN-252 → KAN-347 3단계) — 하단 탭 바(학습 · 홈 · 사투리 번역기 · 설정)와 결과 화면의
 * [학습 시작](KAN-347 2-7에서 「이 등급에 맞는 억양 학습 시작」을 줄였다). 1단계의 학습 종류 선택 L-1은 2단계에서 탭 바로 바뀌어 없어졌다(2026-10-13 결정).
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

const LEARN_BUTTON = '학습 시작'

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

test('앱 결과 화면 - 공유 아래 [학습 시작]이 서고, 누르면 사투리 여행 지도가 앱 실행으로 열린다', async ({ page }) => {
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
  // 앱 안 결과 화면에는 탭 바가 서고 「홈」이 선택돼 있다 (KAN-347 2-7)
  await expect(tabBar(page)).toBeVisible()
  await expect(tabBar(page).locator('[aria-current]')).toHaveCount(1)
  await expect(tab(page, '홈')).toHaveAttribute('aria-current', 'page')

  await learn.click()
  await expect(page.getByRole('heading', { level: 1, name: '사투리 여행' })).toBeVisible()
  // 학습 탭은 옛 앱 빌드가 아는 화면 값(intonation)으로 싣는다 (KAN-347 3-1, entryUrl `LEARN_URL_SCREEN`)
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

test('앱 홈 - 탭 바 4칸(학습 · 홈 · 사투리 번역기 · 설정)으로 학습 → 번역기 → 홈을 돌고, 매 문서가 앱 실행 그대로다', async ({ page }) => {
  await stubServer(page)
  await stubHome(page, 503)
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=home')

  await expect(page.getByRole('heading', { level: 1, name: '경남 사투리 레벨 테스트' })).toBeVisible()
  await expect(tab(page, '홈')).toHaveAttribute('aria-current', 'page')
  await expect(tabBar(page).getByRole('button')).toHaveText(['학습', '홈', '사투리 번역기', '설정'])

  await tab(page, '학습').click()
  await expect(page.getByRole('heading', { level: 1, name: '사투리 여행' })).toBeVisible()
  await expect(tab(page, '학습')).toHaveAttribute('aria-current', 'page')
  expectAppMarkers(page, 'intonation')

  await tab(page, '사투리 번역기').click()
  await expect(page.getByRole('heading', { level: 1, name: '사투리 번역기' })).toBeVisible()
  // 「준비 중이에요」 자리는 KAN-256 2단계에서 T-1 입력 화면으로 바뀌었다 (화면 자체는 translator 스펙)
  await expect(page.getByLabel('표준어 문장')).toBeVisible()
  expectAppMarkers(page, 'translate')

  await tab(page, '홈').click()
  await expect(page.getByRole('heading', { level: 1, name: '경남 사투리 레벨 테스트' })).toBeVisible()
  expectAppMarkers(page, 'home')

  // 홈의 [레벨 테스트 시작]은 인트로를 거치지 않고 인트로 [시작하기]와 같은 브리지 호출로 바로 시작한다
  // (2026-10-13 사용자 결정). 이후 테스트 문서 재로드는 네이티브 몫이라 이 문서는 홈 그대로다.
  await page.getByRole('button', { name: '레벨 테스트 시작', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { AccenturyBridge: { micCalls: number } }).AccenturyBridge.micCalls))
    .toBe(1)
  expectAppMarkers(page, 'home')
  // 인트로 CTA도 「레벨 테스트 시작」이라(KAN-347 7단계) 이름 대신 인트로의 버튼 자리(.intro-cta)로 가른다
  await expect(page.locator('.intro-cta')).toHaveCount(0)

  // 인트로(재응시·앱 링크 진입)에는 탭 바가 없다
  await page.goto('/?bridge=2&app=1.0')
  await expect(page.locator('.intro-cta')).toBeVisible()
  await expect(tabBar(page)).toHaveCount(0)
})

test('KAN-347 홈 테스트 후 - 등급 캐릭터·이름·5칸 막대·[다시 테스트하기]가 서고, 주 7칸 출석 줄과 [억양 학습 시작]은 없다', async ({ page }) => {
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

  const hero = page.getByRole('region', { name: '명예주민' })
  await expect(hero.getByRole('heading', { level: 1, name: '명예주민' })).toBeVisible()
  await expect(hero.getByRole('img', { name: '명예주민' })).toBeVisible()
  const steps = hero.getByRole('img', { name: `${RESULT_BODY.tier.of}개 등급 중 ${RESULT_BODY.tier.rank}번째` })
  await expect(steps.locator('i')).toHaveCount(5)
  await expect(steps.locator('i.is-on')).toHaveCount(RESULT_BODY.tier.rank)
  // 주 버튼은 이어가기 카드의 [이어가기] 하나다 (KAN-347 3-6) — 테이프 카드의 [억양 학습 시작]은 없다
  await expect(page.locator('.home-hero .btn--primary')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '다음 스탬프' }).getByRole('button', { name: '이어가기' })).toBeVisible()
  await expect(page.locator('.home-attendance, .home-streak')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '억양 학습 시작', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: '경남 사투리 레벨 테스트' })).toHaveCount(0)
  await expect(tab(page, '홈')).toHaveAttribute('aria-current', 'page')

  await page.getByRole('button', { name: '다시 테스트하기', exact: true }).click()
  await expect.poll(() => micCalls(page)).toBe(1)
  expectAppMarkers(page, 'home')
})

/** 월별 출석 응답 — 요청한 연·월을 그대로 돌려준다. 「오늘」은 서버 today가 정하므로 그 달의 2일로 고정한다 */
function attendanceReply(year: number, month: number, days: { day: number; items: object[] }[], monthCount: number, lastMonthCount: number) {
  const iso = (d: number) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return {
    year, month,
    days: days.map((d) => ({ date: iso(d.day), items: d.items })),
    monthCount, lastMonthCount,
    streak: { currentDays: 2, attendedToday: true, lastAttendedDate: iso(2) },
    today: iso(2),
  }
}

test('KAN-347 출석 배지·달력 - 홈 앱 바에만 서고, 칸은 33px·누르는 영역 48px, 지난달·날짜 상세가 응답대로 바뀐다', async ({ page }) => {
  await stubServer(page)
  await stubHome(page, {
    levelTestTaken: false, levelTest: null, recommendedCourseId: null, recommendedSetId: null,
    streak: { currentDays: 2, attendedToday: true, lastAttendedDate: '2026-11-12' },
  })
  // 첫 요청 달은 기기 시계의 KST 달이라, 응답은 요청 쿼리의 연·월로 만든다. 처음 받은 달이 이번 달이고 다른 달은 지난달이다
  // (개발 서버 StrictMode가 이펙트를 두 번 돌려 같은 달 요청이 두 번 올 수 있어 횟수로 가르지 않는다)
  let thisMonth: string | null = null
  await page.route(
    (url) => url.pathname === '/v0/learning/attendance',
    (route) => {
      const q = new URL(route.request().url()).searchParams
      const [year, month] = [Number(q.get('year')), Number(q.get('month'))]
      thisMonth ??= `${year}-${month}`
      return route.fulfill({
        json:
          thisMonth === `${year}-${month}`
            ? attendanceReply(year, month, [
                { day: 1, items: [{ kind: 'SET', key: 'a1', id: 's1', title: '서버 제목', done: 3, total: 3 }] },
                { day: 2, items: [{ kind: 'COURSE', key: 'e2e:k1', id: 'k1', title: '서버 제목', done: 3, total: 3 }] },
              ], 2, 9)
            : attendanceReply(year, month, [{ day: 3, items: [] }], 1, 4),
      })
    },
  )
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=home')

  const badge = page.getByRole('button', { name: '연속 출석 2일, 출석 달력 열기' })
  await expect(badge).toBeVisible()
  // 앱 바 띠(높이 56) 안 오른쪽 끝(본문 여백 24)
  const box = (await badge.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(56)
  expect(Math.round(page.viewportSize()!.width - (box.x + box.width))).toBe(24)

  await badge.click()
  const sheet = page.getByRole('dialog', { name: '출석 달력' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('이번 달 2일 · 지난달 9일')).toBeVisible()
  const day1 = sheet.getByRole('button', { name: /월 1일, 출석$/ })
  // 시트가 다 올라온 뒤 잰다·누른다 (300ms, feedback.spec과 같은 이유)
  await page.waitForTimeout(400)
  const drawn = (await day1.locator('.attendance-cell__day').boundingBox())!
  const hit = (await day1.boundingBox())!
  expect(Math.round(drawn.width)).toBe(33)
  expect(Math.round(drawn.height)).toBe(33)
  expect(hit.width).toBeGreaterThanOrEqual(48)
  expect(hit.height).toBeGreaterThanOrEqual(48)

  await day1.click()
  await expect(sheet.getByText('1코스 단어 학습 1')).toBeVisible()
  await expect(sheet.getByText('3문항 완료')).toBeVisible()
  await sheet.getByRole('button', { name: /월 2일, 오늘, 출석$/ }).click()
  await expect(sheet.getByText('1코스 억양 학습 1')).toBeVisible()
  await expect(sheet.getByText('대사 3개 완료')).toBeVisible()
  await expect(sheet.getByText('서버 제목')).toHaveCount(0)
  await sheet.getByRole('button', { name: /월 5일, / }).click()
  await expect(sheet.getByText('학습 기록이 없어요')).toBeVisible()

  await sheet.getByRole('button', { name: '이전 달' }).click()
  await expect(sheet.getByText('이번 달 1일 · 지난달 4일')).toBeVisible()
  await expect(sheet.getByRole('button', { name: /월 3일, 출석$/ })).toHaveClass(/is-attended/)
  await expect(sheet.getByRole('button', { name: /월 1일, 미출석$/ })).toBeVisible()

  await sheet.getByRole('button', { name: '출석 달력 닫기' }).click()
  await expect(sheet).toHaveCount(0)

  // 다른 탭(학습·번역기) 앱 바에는 배지가 없다
  await tab(page, '사투리 번역기').click()
  await expect(page.getByRole('heading', { level: 1, name: '사투리 번역기' })).toBeVisible()
  await expect(page.locator('.streak-badge')).toHaveCount(0)
  await tab(page, '학습').click()
  await expect(page.getByRole('heading', { level: 1, name: '사투리 여행' })).toBeVisible()
  await expect(page.locator('.streak-badge')).toHaveCount(0)
})

test('KAN-287 홈 테스트 전 - streak 키가 없는 구서버 응답이면 테스트 전 홈 그대로, 출석 배지가 없다', async ({ page }) => {
  await stubServer(page)
  await stubHome(page, { levelTestTaken: false, levelTest: null, recommendedCourseId: null, recommendedSetId: null })
  await asApp(page)
  const home = page.waitForResponse((r) => new URL(r.url()).pathname === '/v0/learning/home')
  await page.goto('/?bridge=2&app=1.0&screen=home')
  await home

  await expect(page.getByRole('heading', { level: 1, name: '경남 사투리 레벨 테스트' })).toBeVisible()
  await expect(page.getByRole('button', { name: '레벨 테스트 시작', exact: true })).toBeVisible()
  await expect(page.locator('.streak-badge')).toHaveCount(0)
  await expect(page.getByText('7문항 · 약 3분')).toBeVisible()
  await expect(tabBar(page)).toBeVisible()
})

test('KAN-287 홈 조회 실패 - 503 봉투면 카드만 숨기고 기존 홈·탭 바가 남아 [레벨 테스트 시작]이 동작한다', async ({ page }) => {
  await stubServer(page)
  await stubHome(page, 503)
  await asApp(page)
  const home = page.waitForResponse((r) => new URL(r.url()).pathname === '/v0/learning/home')
  await page.goto('/?bridge=2&app=1.0&screen=home')
  await home

  await expect(page.getByRole('heading', { level: 1, name: '경남 사투리 레벨 테스트' })).toBeVisible()
  await expect(tabBar(page)).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.home-hero, .streak-badge')).toHaveCount(0)

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

test('탭 바는 지도에서만 - 스탬프(단어 카드 W-2)에 들어가면 사라지고, 지도 본문은 탭 바 높이만큼 아래를 띄운다', async ({ page }) => {
  await stubServer(page)
  await asApp(page)
  // 옛 값 screen=words로 열어도 학습 탭이다 (KAN-347 3-1)
  await page.goto('/?bridge=2&app=1.0&screen=words')

  await expect(page.getByRole('heading', { level: 1, name: '사투리 여행' })).toBeVisible()
  await expect(tabBar(page)).toBeVisible()
  await expect(tab(page, '학습')).toHaveAttribute('aria-current', 'page')
  // 본문 아래 여백이 탭 바 높이 이상이다 — 지도가 길어 끝까지 스크롤해도 마지막 줄이 띠 밑에 깔리지 않는다
  const barHeight = (await tabBar(page).boundingBox())!.height
  const mainPaddingBottom = await page.locator('main').evaluate((m) => parseFloat(getComputedStyle(m).paddingBottom))
  expect(barHeight).toBeGreaterThanOrEqual(48)
  expect(mainPaddingBottom).toBeGreaterThanOrEqual(barHeight)

  await page.getByRole('button', { name: '시작', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '정구지' })).toBeVisible()
  await expect(tabBar(page)).toHaveCount(0)
})

// ── 사투리 여행 지도와 KAN-359 (라우트 목) ────────────────────────────────

/** 코스 1·2 × (단어 4 + 억양 5). done에 든 id가 완료, withStars면 KAN-359 별 필드를 싣는다 */
function travelLists(done: string[], withStars: boolean) {
  const star = (id: string, score: number, stars: number) =>
    withStars ? { score: done.includes(id) ? score : null, stars: done.includes(id) ? stars : 0 } : {}
  return {
    sets: [1, 2, 3, 4, 5, 6, 7, 8].map((seq) => ({
      setId: `w${seq}`, seq, level: seq <= 4 ? 1 : 2, category: '', title: `서버 제목 ${seq}`, cardCount: 1, itemCount: 1,
      completed: done.includes(`w${seq}`), ...star(`w${seq}`, 67, 2),
    })),
    courses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seq) => ({
      courseId: `k${seq}`, seq, level: seq <= 5 ? 1 : 2, topic: null, title: `서버 제목 ${seq}`, cardCount: 3, completedCardCount: 0,
      completed: done.includes(`k${seq}`), recommended: false, ...star(`k${seq}`, 80, 3),
    })),
  }
}

function travelLevels(stars1: number, unlocked2: boolean, done1: number) {
  return {
    totalStars: stars1,
    starThresholds: [30, 70],
    levels: [
      { level: 1, setCount: 9, completedSetCount: done1, collectedStars: stars1, requiredStars: 21, unlocked: true },
      { level: 2, setCount: 9, completedSetCount: 0, collectedStars: 0, requiredStars: 21, unlocked: unlocked2 },
    ],
  }
}

/**
 * 학습 탭이 부르는 목록·구간 요약을 가로챈다. `state()`가 그때그때의 진행을 준다 — 스탬프를 마친 뒤 진행을 바꿔 끼우려고.
 * levels가 null이면 구간 요약은 404(KAN-359 배포 전 서버)다. 홈 응답(등급 캐릭터)은 404로 둔다
 */
async function stubTravel(page: Page, state: () => { done: string[]; levels: object | null }): Promise<void> {
  await page.route(
    (url) => ['/v0/learning/word-sets', '/v0/learning/intonation-courses', '/v0/learning/levels', '/v0/learning/home'].includes(url.pathname),
    (route) => {
      const path = new URL(route.request().url()).pathname
      const { done, levels } = state()
      const notFound = { status: 404, json: { code: 'RESOURCE_NOT_FOUND', message: '없음', retryable: false } }
      if (path === '/v0/learning/word-sets') return route.fulfill({ json: { contentVersion: 'e2e', sets: travelLists(done, levels !== null).sets } })
      if (path === '/v0/learning/intonation-courses') {
        return route.fulfill({ json: { contentVersion: 'e2e', courses: travelLists(done, levels !== null).courses } })
      }
      if (path === '/v0/learning/levels' && levels !== null) return route.fulfill({ json: levels })
      return route.fulfill(notFound)
    },
  )
}

test('KAN-359 전 - 구간 요약이 404면 별·잠금 없이 모든 코스가 열리고, 완료는 completed대로 보인다 (3-5)', async ({ page }) => {
  await stubTravel(page, () => ({ done: ['w1', 'k1'], levels: null }))
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=learn')

  await expect(page.getByRole('heading', { level: 1, name: '사투리 여행' })).toBeVisible()
  await expect(page.getByText('행정구역 경계: 통계청 SGIS(2013)', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: '1코스', exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: '2코스', exact: true })).toBeVisible()
  await expect(page.locator('.travel-star-count, .travel-chip .lock, .travel-total')).toHaveCount(0)
  const card = page.getByRole('region', { name: '지금 코스' })
  await expect(card).toContainText('1코스 2 / 9')
  await expect(card.getByRole('heading', { level: 2, name: '단어 학습 2' })).toBeVisible()

  // 잠금이 없으니 2코스 구역도 눌러 열린다. 코스 지도의 완료 카드는 별·점수 원 없이 「완료」만
  await page.getByRole('button', { name: '1코스 · 진행 중' }).click()
  const stamps = page.getByRole('list').getByRole('button')
  await expect(stamps).toHaveCount(9)
  await expect(stamps.first()).toContainText('완료')
  await expect(page.locator('.travel-stamp-card .stars, .travel-stamp-card .score-donut')).toHaveCount(0)
  await expect(page.getByText(/별 \d+개를 모으면/)).toHaveCount(0)
  await page.getByRole('button', { name: '지도로', exact: true }).click()
  await page.getByRole('button', { name: '2코스 · 열림' }).click()
  await expect(stamps.first()).toContainText('지금 여기 · 시작')
})

test('KAN-359 있음 - 별 합계·코스 칩 「★ 모은 별 / 필요 별」·잠긴 코스 자물쇠, 코스 지도의 점수 원·별·「별 21개를 모으면」', async ({ page }) => {
  await stubTravel(page, () => ({ done: ['w1', 'k1'], levels: travelLevels(5, false, 2) }))
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=learn')

  await expect(page.getByRole('img', { name: '별 5개', exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: '1코스, 별 5개, 필요 별 21개' })).toContainText('5 / 21')
  const locked = page.getByRole('img', { name: '2코스, 잠김, 별 0개, 필요 별 21개' })
  await expect(locked.locator('.lock')).toBeVisible()
  await expect(page.getByRole('button', { name: /^2코스/ })).toHaveCount(0)

  await page.getByRole('button', { name: '1코스 · 진행 중' }).click()
  await expect(page.getByText('별 21개를 모으면 2코스가 열려요', { exact: true })).toBeVisible()
  const first = page.getByRole('list').getByRole('button').first()
  await expect(first.getByRole('img', { name: '별 3개 중 2개' })).toBeVisible()
  await expect(first.locator('.score-donut')).toContainText('67점')
  await expect(page.getByRole('list').getByRole('button').nth(3)).toBeDisabled()
})

/** 한 문항짜리 단어 세트 w4의 W-2~W-5를 가로챈다. 완료 요청이 오면 onComplete로 진행을 바꾼다 */
async function stubWordSet4(page: Page, onComplete: () => void): Promise<void> {
  const result = { attemptId: 'a1', contentVersion: 'e2e', setId: 'w4' }
  await page.route(/\/v0\/learning\/word-(sets\/w4|attempts\/a1)/, (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/v0/learning/word-sets/w4') {
      return route.fulfill({
        json: {
          ...result, seq: 4, level: 1, category: '', title: '', cards: [{ cardId: 'c1', standard: '부추', dialect: '정구지' }],
          items: [{ itemId: 'i1', seq: 1, cardId: 'c1', prompt: '부추를 사투리로?', choices: [{ choiceId: 'i1a', text: '정구지' }] }],
        },
      })
    }
    if (path.endsWith('/attempts')) return route.fulfill({ status: 201, json: { ...result, itemCount: 1, startedAt: '2026-11-16T00:00:00Z' } })
    if (path.endsWith('/answer')) {
      return route.fulfill({ json: { correct: true, correctChoiceId: 'i1a', correctText: '정구지', explanation: '정구지는 부추', answeredCount: 1, itemCount: 1 } })
    }
    onComplete()
    return route.fulfill({ json: { ...result, itemCount: 1, correctCount: 1, accuracyPercent: 100, wrongItems: [], completedAt: '2026-11-16T00:01:00Z' } })
  })
}

/** 지도 [시작] → 단어 세트 w4 한 바퀴 → 성적표 [지도로] */
async function finishWordSet4(page: Page): Promise<void> {
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await page.getByRole('button', { name: '문제 풀기', exact: true }).click()
  await page.getByRole('radio', { name: '정구지' }).check({ force: true })
  await page.getByRole('button', { name: '제출', exact: true }).click()
  await page.getByRole('button', { name: '결과 보기', exact: true }).click()
  await page.getByRole('button', { name: '지도로', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '사투리 여행' })).toBeVisible()
}

const COURSE1 = ['w1', 'k1', 'w2', 'k2', 'w3', 'k3', 'k4', 'k5']

test('코스 완주 + 별 21개 - 지도로 돌아오면 여권 페이지(도장 9개, 75ms 간격) 뒤 2코스 칩 자물쇠가 열린다 (타일 5)', async ({ page }) => {
  let finished = false
  await stubTravel(page, () =>
    finished ? { done: [...COURSE1, 'w4'], levels: travelLevels(22, true, 9) } : { done: COURSE1, levels: travelLevels(19, false, 8) },
  )
  await stubWordSet4(page, () => (finished = true))
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=learn')
  await expect(page.getByRole('region', { name: '지금 코스' })).toContainText('단어 학습 4')

  await finishWordSet4(page)
  const passport = page.getByRole('status', { name: '1코스 완주' })
  await expect(passport).toBeVisible()
  await expect(passport.locator('.travel-passport__stamps > svg')).toHaveCount(9)
  // 도장은 차례로 75ms씩 늦게 찍힌다 — 시간은 토큰(--duration-press)이다
  const delays = await passport
    .locator('.travel-passport__stamps > svg')
    .evaluateAll((svgs) => svgs.map((svg) => getComputedStyle(svg).animationDelay))
  expect(delays.slice(0, 3)).toEqual(['0s', '0.075s', '0.15s'])
  const chip = page.getByRole('img', { name: '2코스, 열림, 별 0개, 필요 별 21개' })
  await expect(chip).toHaveClass(/is-unlocking/)
  // 자물쇠 고리는 여권 페이지(600ms) 뒤에 들린다 — 지연이 --duration-reveal이다
  expect(await chip.locator('.lock__shackle').evaluate((el) => getComputedStyle(el).animationDelay)).toBe('0.6s')
  await expect.poll(() => chip.locator('.lock__shackle').evaluate((el) => getComputedStyle(el).transform)).not.toBe('none')
  // 지금 스탬프는 열린 2코스의 첫 스탬프다
  await expect(page.getByRole('region', { name: '지금 코스' })).toContainText('2코스 0 / 9')
})

test('완주했지만 별 21개 미만 - 여권 페이지만 보이고 자물쇠는 열리지 않는다', async ({ page }) => {
  let finished = false
  await stubTravel(page, () =>
    finished ? { done: [...COURSE1, 'w4'], levels: travelLevels(19, false, 9) } : { done: COURSE1, levels: travelLevels(17, false, 8) },
  )
  await stubWordSet4(page, () => (finished = true))
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=learn')
  await finishWordSet4(page)

  await expect(page.getByRole('status', { name: '1코스 완주' })).toBeVisible()
  await expect(page.locator('.is-unlocking')).toHaveCount(0)
  await expect(page.getByRole('img', { name: '2코스, 잠김, 별 0개, 필요 별 21개' })).toBeVisible()
})

test('동작 줄이기 - 도장·자물쇠가 끝 상태로 바로 보인다 (3단계 움직임)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let finished = false
  await stubTravel(page, () =>
    finished ? { done: [...COURSE1, 'w4'], levels: travelLevels(22, true, 9) } : { done: COURSE1, levels: travelLevels(19, false, 8) },
  )
  await stubWordSet4(page, () => (finished = true))
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=learn')
  await finishWordSet4(page)

  // 지연·길이 모두 0.01ms로 접혀 한 프레임 안에 끝 상태다 — 고리는 들린 채, 마지막 도장도 보인다
  const shackle = page.getByRole('img', { name: '2코스, 열림, 별 0개, 필요 별 21개' }).locator('.lock__shackle')
  const transform = await shackle.evaluate((el) => getComputedStyle(el).transform)
  expect(transform).not.toBe('none')
  const lastStamp = page.locator('.travel-passport__stamps > svg').last()
  expect(Number(await lastStamp.evaluate((el) => getComputedStyle(el).opacity))).toBe(1)
})

test('지금 스탬프 하나 - 지도 [시작]과 홈 [이어가기]가 같은 스탬프로 들어간다 (3-6)', async ({ page }) => {
  await stubServer(page) // 단어 s1(1코스 첫 스탬프)의 상세
  await stubHome(page, {
    levelTestTaken: true,
    levelTest: { testVersion: RESULT_BODY.testVersion, scoreVersion: RESULT_BODY.scoreVersion, tier: RESULT_BODY.tier, completedAt: '2026-10-13T16:00:00Z' },
    recommendedCourseId: null,
    recommendedSetId: null,
  })
  await asApp(page)
  await page.goto('/?bridge=2&app=1.0&screen=home')

  const card = page.getByRole('region', { name: '다음 스탬프' })
  await expect(card).toContainText('1코스 · 1번째 스탬프')
  await expect(card.getByRole('heading', { level: 2, name: '단어 학습 1' })).toBeVisible()
  await card.getByRole('button', { name: '이어가기' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '정구지' })).toBeVisible()
  // 한 번 쓴 resume은 URL에서 걷힌다 — 다시 열면 지도다
  expect(new URL(page.url()).searchParams.get('resume')).toBeNull()
  expectAppMarkers(page, 'intonation')

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: '사투리 여행' })).toBeVisible()
  await page.getByRole('button', { name: '시작', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '정구지' })).toBeVisible()
})
