/**
 * 학습 진입 (KAN-252 1단계) — 학습 종류 선택 L-1(`?screen=learn`)과 결과 화면의 [이 등급에 맞는 억양 학습 시작].
 *
 * 여기서만 확인할 수 있는 것은 **문서를 다시 로드하는 전환이 앱 표식(`bridge`·`app`)을 싣고 간다**는 점이다.
 * vitest는 `navigate`에 넘긴 URL까지만 보고, 그 URL로 실제로 다시 열린 문서가 앱 실행으로 판정돼 A-1·W-1을
 * 그리는지는 보지 않는다. 표식이 떨어지면 다음 문서가 웹 단독으로 갈려 학습 버튼이 사라지거나 로그인에서 막힌다.
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
          sets: [{ setId: 's1', seq: 1, level: 1, category: '음식', title: '먹을 것', cardCount: 2, itemCount: 2 }],
        },
      }),
  )
}

/** 앱 WebView 흉내 — 결과 조회용 세션 토큰과 학습용 계정 토큰을 같이 준다 */
async function asApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.assign(window, {
      AccenturyBridge: {
        getContractVersion: () => 2,
        getSessionToken: () => 'e2e-session-token',
        getAccessToken: () => 'e2e-access-token',
      },
    })
  })
}

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

  await learn.click()
  await expect(page.getByRole('heading', { level: 1, name: '억양 학습' })).toBeVisible()
  expectAppMarkers(page, 'intonation')
  expect(new URL(page.url()).searchParams.get('sessionId')).toBeNull()
})

test('웹 단독 결과 화면 - 억양 학습 버튼이 없다 (2026-10-13 사용자 결정)', async ({ page }) => {
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
})

test('L-1 - 억양 학습은 A-1, 단어 학습은 W-1로 앱 실행 그대로 넘어간다', async ({ page }) => {
  await stubServer(page)
  await asApp(page)

  await page.goto('/?bridge=2&app=1.0&screen=learn')
  await expect(page.getByRole('heading', { level: 1, name: '어떤 학습을 할까요?' })).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(2) // 뒤로는 네이티브 몫이다
  await page.getByRole('button', { name: /^억양 학습/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: '억양 학습' })).toBeVisible()
  expectAppMarkers(page, 'intonation')

  await page.goto('/?bridge=2&app=1.0&screen=learn')
  await page.getByRole('button', { name: /^단어 학습/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: '단어 학습' })).toBeVisible()
  expectAppMarkers(page, 'words')
})
