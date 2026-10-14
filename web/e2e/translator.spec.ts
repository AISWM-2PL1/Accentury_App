/**
 * 사투리 번역기 T-1 (KAN-256 3단계) — 기준은 code wiki ux-ui.md 「사투리 번역기 화면 (KAN-256)」 절의 상태 표다.
 *
 * 여기서만 확인할 수 있는 것은 셋이다. vitest는 `deps`로 fetch·토큰을 갈아 끼우고 jsdom 클립보드를 흉내 낸다.
 *
 * 1. **탭 바로 다시 로드한 문서가 번역기로 열린다** — 앱 표식(`bridge`·`app`)을 싣고 간 URL이 실제로 T-1을 그린다.
 * 2. **브리지 계정 토큰이 실제 요청 헤더에 실린다** — 화면이 보낸 요청을 `page.route`에서 그대로 읽는다.
 * 3. **진짜 클립보드·브리지 공유** — Chromium의 `navigator.clipboard`와 브리지 `shareResult`가 받은 JSON.
 *
 * 서버는 `page.route`로 가로챈다(백엔드 없이 돈다). 앱 실행 흉내는 `learning-entry` 스펙과 같다 —
 * URL의 `bridge=2`와 `addInitScript`로 먼저 심은 브리지.
 */

import { expect, test, type Page, type Route } from '@playwright/test'

const TRANSLATE_URL = '/?bridge=2&app=1.0&screen=translate'
const ACCESS_TOKEN = 'e2e-access-token'

/** 앱 WebView 흉내. `shareResult`가 받은 JSON을 `shares`에 쌓는다 */
async function asApp(page: Page): Promise<void> {
  await page.addInitScript((token) => {
    const bridge = {
      shares: [] as string[],
      getContractVersion: () => 2,
      getAccessToken: () => token,
      shareResult: (payloadJson: string) => {
        bridge.shares.push(payloadJson)
      },
    }
    Object.assign(window, { AccenturyBridge: bridge })
  }, ACCESS_TOKEN)
}

/** 오류 봉투(§2.3) 모양 — `net/errorEnvelope.ts`가 읽는 code·message·retryable + correlationId */
const envelope = (code: string, retryable: boolean) => ({ code, message: `${code} (e2e)`, retryable, correlationId: 'e2e' })

/**
 * `POST /v0/translations`를 가로챈다. 응답은 [respond]가 정하고, 들어온 요청은 돌려준 배열에 쌓인다.
 * 화면의 다른 요청은 건드리지 않는다.
 */
async function stubTranslations(page: Page, respond: (route: Route, n: number) => Promise<void> | void) {
  const requests: { body: unknown; authorization: string | undefined }[] = []
  await page.route(
    (url) => url.pathname === '/v0/translations',
    (route) => {
      const req = route.request()
      requests.push({ body: req.postDataJSON(), authorization: req.headers()['authorization'] })
      return respond(route, requests.length)
    },
  )
  return requests
}

const tabBar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' })
const input = (page: Page) => page.getByLabel('표준어 문장')
const submit = (page: Page) => page.getByRole('button', { name: '바꾸기', exact: true })

test('탭 바 「사투리 번역기」 - 홈 문서에서 누르면 번역기 문서가 앱 실행으로 다시 열리고, 진입만으로는 번역 요청이 없다', async ({ page }) => {
  await asApp(page)
  const requests = await stubTranslations(page, (route) => route.fulfill({ json: { dialect: '밥 뭇나?' } }))
  await page.goto('/?bridge=2&app=1.0&screen=home')

  await tabBar(page).getByRole('button', { name: '사투리 번역기', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '사투리 번역기' })).toBeVisible()
  await expect(tabBar(page).getByRole('button', { name: '사투리 번역기', exact: true })).toHaveAttribute('aria-current', 'page')
  const params = new URL(page.url()).searchParams
  expect([params.get('screen'), params.get('bridge'), params.get('app')]).toEqual(['translate', '2', '1.0'])

  await expect(input(page)).toBeVisible()
  await expect(submit(page)).toBeDisabled()
  expect(requests).toHaveLength(0)
})

test('번역 성공 - 대기 문구 뒤 결과·AI 고지가 서고, 요청은 {text} + Bearer 1건이다(연타해도). 입력을 고치면 결과가 지워진다', async ({
  page,
}) => {
  await asApp(page)
  // 응답을 붙잡아 대기 상태를 본다
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  const requests = await stubTranslations(page, async (route) => {
    await held
    await route.fulfill({ json: { dialect: '밥 뭇나?' } })
  })
  await page.goto(TRANSLATE_URL)

  // 개인정보 안내 + 처리방침 링크는 입력 단계부터 있다
  await expect(page.getByText('개인정보나 민감한 내용은 넣지 마세요', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: '개인정보처리방침' })).toBeVisible()

  await input(page).fill('밥 먹었니?')
  await expect(page.getByText('6/100', { exact: true })).toBeVisible()
  // 연타 — 첫 클릭이 버튼을 잠그므로 둘째는 아무 일도 하지 않아야 한다
  await submit(page).dblclick()
  await expect(page.getByText('바꾸는 중이에요', { exact: true })).toBeVisible()
  await expect(submit(page)).toBeDisabled()
  await expect(input(page)).toHaveValue('밥 먹었니?')
  await expect(tabBar(page)).toBeVisible()
  release()

  await expect(page.getByText('밥 뭇나?', { exact: true })).toBeVisible()
  await expect(page.getByText('AI 번역이라 실제 표현과 다를 수 있어요', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '개인정보처리방침' })).toBeVisible()
  await expect(tabBar(page)).toBeVisible()
  expect(requests).toEqual([{ body: { text: '밥 먹었니?' }, authorization: `Bearer ${ACCESS_TOKEN}` }])

  // 입력을 고치면 옛 결과가 새 입력의 번역처럼 남지 않는다
  await input(page).fill('밥 먹었니')
  await expect(page.getByText('밥 뭇나?', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '복사', exact: true })).toHaveCount(0)
  await expect(submit(page)).toBeEnabled()
  expect(requests).toHaveLength(1)
})

test('[복사] - 클립보드에 사투리 문장이 들어가고 라벨이 「복사했어요」로 바뀐다', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await asApp(page)
  await stubTranslations(page, (route) => route.fulfill({ json: { dialect: '밥 뭇나?' } }))
  await page.goto(TRANSLATE_URL)

  await input(page).fill('밥 먹었니?')
  await submit(page).click()
  await page.getByRole('button', { name: '복사', exact: true }).click()

  await expect(page.getByRole('button', { name: '복사했어요', exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('밥 뭇나?')
})

test('[공유] - 브리지 shareResult가 「표준어 → 사투리」 문구와 https 링크·이미지를 받는다', async ({ page }) => {
  await asApp(page)
  await stubTranslations(page, (route) => route.fulfill({ json: { dialect: '밥 뭇나?' } }))
  await page.goto(TRANSLATE_URL)

  await input(page).fill('밥 먹었니?')
  await submit(page).click()
  await page.getByRole('button', { name: '공유', exact: true }).click()

  const shares = await page.evaluate(() => (window as unknown as { AccenturyBridge: { shares: string[] } }).AccenturyBridge.shares)
  expect(shares).toHaveLength(1)
  const payload = JSON.parse(shares[0]) as { text: string; webTestUrl: string; imageUrl: string }
  expect(payload.text).toBe('밥 먹었니? → 밥 뭇나?')
  expect(payload.webTestUrl).toMatch(/^https:\/\//)
  expect(payload.imageUrl).toMatch(/^https:\/\//)
})

test('입력 검증 - 빈 입력·공백만이면 [바꾸기] 비활성, 101자(코드 포인트)면 비활성 + 「100자까지 쓸 수 있어요」', async ({ page }) => {
  await asApp(page)
  const requests = await stubTranslations(page, (route) => route.fulfill({ json: { dialect: '밥 뭇나?' } }))
  await page.goto(TRANSLATE_URL)

  await expect(submit(page)).toBeDisabled()
  await input(page).fill('   ')
  await expect(submit(page)).toBeDisabled()

  // 이모지는 UTF-16 2칸이지만 1자다 — 100개는 통과, 101개는 초과
  await input(page).fill('😀'.repeat(100))
  await expect(page.getByText('100/100', { exact: true })).toBeVisible()
  await expect(submit(page)).toBeEnabled()
  await expect(page.getByText('100자까지 쓸 수 있어요', { exact: true })).toHaveCount(0)

  await input(page).fill('😀'.repeat(101))
  await expect(page.getByText('101/100', { exact: true })).toBeVisible()
  await expect(submit(page)).toBeDisabled()
  await expect(page.getByText('100자까지 쓸 수 있어요', { exact: true })).toBeVisible()
  expect(requests).toHaveLength(0)
})

test('422 TRANSLATION_REJECTED - 「올바른 문장을 넣어주세요」, 입력을 고치면 문구가 사라진다', async ({ page }) => {
  await asApp(page)
  await stubTranslations(page, (route) => route.fulfill({ status: 422, json: envelope('TRANSLATION_REJECTED', false) }))
  await page.goto(TRANSLATE_URL)

  await input(page).fill('ㅋㅋㅋㅋ')
  await submit(page).click()
  const message = page.getByText('올바른 문장을 넣어주세요', { exact: true })
  await expect(message).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 시도', exact: true })).toHaveCount(0)
  await expect(tabBar(page)).toBeVisible()

  await input(page).fill('밥 먹었니?')
  await expect(message).toHaveCount(0)
})

test('503 TRANSLATION_UNAVAILABLE - 오류 + [다시 시도], 같은 입력으로 다시 보내 결과가 뜬다', async ({ page }) => {
  await asApp(page)
  const requests = await stubTranslations(page, (route, n) =>
    n === 1
      ? route.fulfill({ status: 503, json: envelope('TRANSLATION_UNAVAILABLE', true) })
      : route.fulfill({ json: { dialect: '밥 뭇나?' } }),
  )
  await page.goto(TRANSLATE_URL)

  await input(page).fill('밥 먹었니?')
  await submit(page).click()
  await expect(page.getByText('지금은 바꿀 수 없어요. 잠시 뒤 다시 시도해 주세요', { exact: true })).toBeVisible()
  await expect(tabBar(page)).toBeVisible()

  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.getByText('밥 뭇나?', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 시도', exact: true })).toHaveCount(0)
  expect(requests.map((r) => r.body)).toEqual([{ text: '밥 먹었니?' }, { text: '밥 먹었니?' }])
})
