/**
 * 사투리 번역기 T-1 (KAN-256 3단계, 디자인 개정 KAN-347 6단계) — 기준은 code wiki ux-ui.md 「사투리 번역기 화면」 절의 상태 표다.
 *
 * 여기서만 확인할 수 있는 것. vitest는 `deps`로 fetch·토큰을 갈아 끼우고 jsdom 클립보드를 흉내 내며 레이아웃이 없다.
 *
 * 1. **탭 바로 다시 로드한 문서가 번역기로 열린다** — 앱 표식(`bridge`·`app`)을 싣고 간 URL이 실제로 T-1을 그린다.
 * 2. **브리지 계정 토큰이 실제 요청 헤더에 실린다** — 화면이 보낸 요청을 `page.route`에서 그대로 읽는다.
 * 3. **진짜 클립보드·브리지 공유** — Chromium의 `navigator.clipboard`와 브리지 `shareResult`가 받은 JSON.
 * 4. **7장 공통 틀(6-1-1)** — 입력·동의 시트·대기·결과·오류 대화상자·입력 오류·한도에서 제목과 입력 카드의 상자가
 *    같은지 boundingBox로 잰다. 방향 전환의 자리 바꿈·회전도 실제 레이아웃에서 본다.
 *
 * Gemini 전송 동의 시트(KAN-304)는 「번역 성공」 테스트가 실제로 거친다. 그 뒤 테스트들은 [consented]로
 * 동의 값을 미리 심어 시트 없이 시작한다.
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

/** 지금 서버(KAN-316) 성공 응답 */
const ok = (dialect: string, remaining = 4) => ({ json: { direction: 'toDialect', dialect, remaining } })

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

/** 이 기기에서 Gemini 전송에 이미 동의한 상태로 연다 (`translatorConsentStore`의 키·값) */
async function consented(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('accentury:translatorConsent', 'granted'))
}

const tabBar = (page: Page) => page.getByRole('navigation', { name: '주 메뉴' })
const input = (page: Page) => page.getByLabel('표준어 문장')
const submit = (page: Page) => page.getByRole('button', { name: '번역하기', exact: true })
const inputCard = (page: Page) => page.locator('.translator-card').first()
const title = (page: Page) => page.getByRole('heading', { level: 1, name: '사투리 번역기' })

test('탭 바 「사투리 번역기」 - 홈 문서에서 누르면 번역기 문서가 앱 실행으로 다시 열리고, 진입만으로는 번역 요청이 없다', async ({ page }) => {
  await asApp(page)
  const requests = await stubTranslations(page, (route) => route.fulfill(ok('밥 뭇나?')))
  await page.goto('/?bridge=2&app=1.0&screen=home')

  await tabBar(page).getByRole('button', { name: '사투리 번역기', exact: true }).click()
  await expect(title(page)).toBeVisible()
  await expect(tabBar(page).getByRole('button', { name: '사투리 번역기', exact: true })).toHaveAttribute('aria-current', 'page')
  const params = new URL(page.url()).searchParams
  expect([params.get('screen'), params.get('bridge'), params.get('app')]).toEqual(['translate', '2', '1.0'])

  await expect(input(page)).toBeVisible()
  await expect(submit(page)).toBeDisabled()
  expect(requests).toHaveLength(0)
})

test('입력 화면(s-03) - 규칙 줄·빈 결과·고지 둘, ↓ 원형 버튼(56)이 두 카드 사이에 있고 이름은 「번역하기」다. 앱 바에 출석 배지가 없다', async ({
  page,
}) => {
  await asApp(page)
  await consented(page)
  await stubTranslations(page, (route) => route.fulfill(ok('밥 뭇나?')))
  await page.goto(TRANSLATE_URL)

  await expect(page.getByText('하루 5번까지 번역할 수 있어요', { exact: true })).toBeVisible()
  await expect(page.getByText('번역한 문장이 여기 나와요', { exact: true })).toBeVisible()
  await expect(page.getByText('입력한 문장은 번역을 위해 Google Gemini API로 보내요', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: '개인정보처리방침' })).toBeVisible()
  await expect(page.getByText('AI 번역이라 실제 표현과 다를 수 있어요', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /출석/ })).toHaveCount(0)

  await input(page).fill('밥 먹었니?')
  const go = await submit(page).boundingBox()
  const cards = page.locator('.translator-card')
  const upper = await cards.nth(0).boundingBox()
  const lower = await cards.nth(1).boundingBox()
  expect([Math.round(go!.width), Math.round(go!.height)]).toEqual([56, 56])
  expect(go!.y).toBeGreaterThan(upper!.y + upper!.height)
  expect(go!.y + go!.height).toBeLessThan(lower!.y)
  // 가운데 정렬
  expect(Math.abs(go!.x + go!.width / 2 - (upper!.x + upper!.width / 2))).toBeLessThan(1)
})

test('번역 성공 - 첫 ↓는 Gemini 전송 동의 시트, [동의하고 보내기] 뒤 받아 적는 줄 둘 + 「번역 중이에요」, 결과·「오늘 4번 남았어요」가 서고, 요청은 {text, direction} + Bearer 1건이다. 입력을 고치면 결과가 지워진다', async ({
  page,
}) => {
  await asApp(page)
  // 응답을 붙잡아 대기 상태를 본다
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  const requests = await stubTranslations(page, async (route) => {
    await held
    await route.fulfill(ok('밥 뭇나?'))
  })
  await page.goto(TRANSLATE_URL)

  await input(page).fill('밥 먹었니?')
  await expect(page.getByText('6/100', { exact: true })).toBeVisible()
  // 미동의 첫 번역 — 요청 대신 동의 시트가 뜬다 (KAN-304)
  await submit(page).click()
  const sheet = page.getByRole('dialog', { name: '문장을 Google Gemini로 보내도 될까요?' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Google LLC의 Gemini API', { exact: false })).toBeVisible()
  await expect(sheet.getByRole('link', { name: '개인정보처리방침' })).toBeVisible()
  // 보내기 아이콘 + 글자 (6-2)
  const agree = sheet.getByRole('button', { name: '동의하고 보내기', exact: true })
  await expect(agree.locator('svg')).toHaveCount(1)
  await expect(sheet.getByRole('button', { name: '취소', exact: true })).toBeVisible()
  expect(requests).toHaveLength(0)
  // 동의가 곧 전송이다. 대기 중 연타가 요청 한 번인 것은 vitest가 본다(「대기 중엔 …」)
  await agree.click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByText('번역 중이에요', { exact: true })).toBeVisible()
  await expect(page.locator('.translator-wait i')).toHaveCount(2)
  for (const line of await page.locator('.translator-wait i').all()) await expect(line).toBeVisible()
  await expect(submit(page)).toBeDisabled()
  await expect(page.getByRole('button', { name: /번역 방향 바꾸기/ })).toBeDisabled()
  await expect(input(page)).toHaveValue('밥 먹었니?')
  await expect(tabBar(page)).toBeVisible()
  release()

  await expect(page.getByText('밥 뭇나?', { exact: true })).toBeVisible()
  await expect(page.locator('.translator-result__meta')).toHaveText('오늘 4번 남았어요')
  await expect(page.getByRole('button', { name: '부적절한 결과 신고', exact: true })).toBeVisible()
  await expect(page.getByText('번역 중이에요', { exact: true })).toHaveCount(0)
  await expect(tabBar(page)).toBeVisible()
  expect(requests).toEqual([{ body: { text: '밥 먹었니?', direction: 'toDialect' }, authorization: `Bearer ${ACCESS_TOKEN}` }])

  // 입력을 고치면 옛 결과가 새 입력의 번역처럼 남지 않는다
  await input(page).fill('밥 먹었니')
  await expect(page.getByText('밥 뭇나?', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '복사', exact: true })).toHaveCount(0)
  await expect(submit(page)).toBeEnabled()
  expect(requests).toHaveLength(1)
})

test('[복사] - 클립보드에 사투리 문장이 들어가고 이름이 「복사했어요」로, 같은 문구가 카드 왼쪽 아래에 보인다', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await asApp(page)
  await consented(page)
  await stubTranslations(page, (route) => route.fulfill(ok('밥 뭇나?')))
  await page.goto(TRANSLATE_URL)

  await input(page).fill('밥 먹었니?')
  await submit(page).click()
  await page.getByRole('button', { name: '복사', exact: true }).click()

  await expect(page.getByRole('button', { name: '복사했어요', exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '복사했어요' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('밥 뭇나?')
})

test('[공유] - 브리지 shareResult가 「표준어 → 사투리」 문구와 https 링크·이미지를 받는다', async ({ page }) => {
  await asApp(page)
  await consented(page)
  await stubTranslations(page, (route) => route.fulfill(ok('밥 뭇나?')))
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

test('[부적절한 결과 신고] - 그 결과를 보내고 「신고했어요. 확인해 볼게요」가 남는다', async ({ page }) => {
  await asApp(page)
  await consented(page)
  await stubTranslations(page, (route) => route.fulfill(ok('밥 뭇나?')))
  const reports: unknown[] = []
  await page.route(
    (url) => url.pathname === '/v0/translations/reports',
    (route) => {
      reports.push(route.request().postDataJSON())
      return route.fulfill({ status: 201, json: { reportId: 'r1' } })
    },
  )
  await page.goto(TRANSLATE_URL)

  await input(page).fill('밥 먹었니?')
  await submit(page).click()
  await page.getByRole('button', { name: '부적절한 결과 신고', exact: true }).click()
  await expect(page.getByText('신고했어요. 확인해 볼게요', { exact: true })).toBeVisible()
  expect(reports).toEqual([{ direction: 'toDialect', text: '밥 먹었니?', result: '밥 뭇나?' }])
})

test('입력 검증 - 빈 입력·공백만이면 ↓ 비활성, 101자(코드 포인트)면 비활성 + 입력 카드 아래 「100자까지 쓸 수 있어요」', async ({ page }) => {
  await asApp(page)
  await consented(page)
  const requests = await stubTranslations(page, (route) => route.fulfill(ok('밥 뭇나?')))
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
  const line = page.getByRole('alert').filter({ hasText: '100자까지 쓸 수 있어요' })
  await expect(line).toBeVisible()
  const card = await inputCard(page).boundingBox()
  expect((await line.boundingBox())!.y).toBeGreaterThan(card!.y + card!.height)
  expect(requests).toHaveLength(0)
})

test('422 TRANSLATION_REJECTED - 입력 카드 아래 (주의) 「올바른 문장을 넣어 주세요」 한 줄, 입력을 고치면 사라진다', async ({ page }) => {
  await asApp(page)
  await consented(page)
  await stubTranslations(page, (route) => route.fulfill({ status: 422, json: envelope('TRANSLATION_REJECTED', false) }))
  await page.goto(TRANSLATE_URL)

  await input(page).fill('ㅋㅋㅋㅋ')
  await submit(page).click()
  const message = page.getByRole('alert').filter({ hasText: '올바른 문장을 넣어 주세요' })
  await expect(message).toBeVisible()
  await expect(message.locator('svg')).toHaveCount(1)
  // 입력 카드와 ↓ 버튼 사이
  const card = await inputCard(page).boundingBox()
  const line = await message.boundingBox()
  expect(line!.y).toBeGreaterThan(card!.y + card!.height)
  expect(line!.y + line!.height).toBeLessThan((await submit(page).boundingBox())!.y)
  await expect(input(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(tabBar(page)).toBeVisible()

  await input(page).fill('밥 먹었니?')
  await expect(message).toHaveCount(0)
})

test('503 TRANSLATION_UNAVAILABLE - 가운데 대화상자(배경 inert), [닫기]는 입력을 남기고 [다시 시도]는 같은 입력으로 다시 보낸다', async ({ page }) => {
  await asApp(page)
  await consented(page)
  const requests = await stubTranslations(page, (route, n) =>
    n <= 2 ? route.fulfill({ status: 503, json: envelope('TRANSLATION_UNAVAILABLE', true) }) : route.fulfill(ok('밥 뭇나?')),
  )
  await page.goto(TRANSLATE_URL)

  await input(page).fill('밥 먹었니?')
  await submit(page).click()
  const dialog = page.getByRole('dialog', { name: '번역하지 못했어요' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('인터넷 연결이 불안정하거나 잠시 사용량이 많아요. 잠시 뒤 다시 시도해 주세요')
  await expect(page.locator('main')).toHaveAttribute('inert', '')
  // 가운데: 대화상자 중심이 화면 중심
  const box = (await page.locator('.dialog__panel').boundingBox())!
  const viewport = page.viewportSize()!
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(1)
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(1)

  await dialog.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(input(page)).toHaveValue('밥 먹었니?')
  await expect(page.locator('main')).not.toHaveAttribute('inert', '')
  // 닫으면 초점이 입력칸으로 돌아온다 — 배경 inert가 풀린 뒤에 옮겨야 실제 브라우저에서 들어간다
  await expect(input(page)).toBeFocused()

  await submit(page).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.getByText('밥 뭇나?', { exact: true })).toBeVisible()
  await expect(dialog).toHaveCount(0)
  const body = { text: '밥 먹었니?', direction: 'toDialect' }
  expect(requests.map((r) => r.body)).toEqual([body, body, body])
})

test('사투리 → 표준어 (KAN-317) - ⇄가 돌고 「표준어」「경남 사투리」 자리가 바뀌며, 요청은 direction toStandard, 결과 라벨은 「표준어」, [복사]·[공유]도 그 문장', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await asApp(page)
  await consented(page)
  const requests = await stubTranslations(page, (route) =>
    (route.request().postDataJSON() as { direction?: string }).direction === 'toStandard'
      ? route.fulfill({ json: { direction: 'toStandard', standard: '밥 먹었니?', remaining: 3 } })
      : route.fulfill(ok('밥 뭇나?')),
  )
  await page.goto(TRANSLATE_URL)

  const standard = page.locator('.translator-pair__lang--standard')
  const dialect = page.locator('.translator-pair__lang--dialect')
  const before = { standard: (await standard.boundingBox())!.x, dialect: (await dialect.boundingBox())!.x }
  expect(before.standard).toBeLessThan(before.dialect)

  const toggle = page.getByRole('button', { name: /번역 방향 바꾸기/ })
  await expect(toggle).toHaveAccessibleName('번역 방향 바꾸기, 현재 표준어 → 사투리')
  await toggle.click()
  await expect(toggle).toHaveAccessibleName('번역 방향 바꾸기, 현재 사투리 → 표준어')
  // 300ms 전환이 끝나면 두 이름이 서로의 자리에 있고 ⇄는 반 바퀴 돌았다
  await expect.poll(async () => Math.round((await standard.boundingBox())!.x)).toBe(Math.round(before.dialect))
  await expect.poll(async () => Math.round((await dialect.boundingBox())!.x)).toBe(Math.round(before.standard))
  await expect.poll(() => toggle.locator('svg').evaluate((el) => getComputedStyle(el).transform)).toMatch(/^matrix\(-1, /)
  // 카드 라벨과 점도 같이 바뀐다
  await expect(page.locator('.translator-card').first().locator('.translator-card__label--dialect')).toHaveText('경남 사투리')

  await page.getByLabel('경남 사투리 문장').fill('밥 뭇나?')
  await submit(page).click()

  await expect(page.getByText('밥 먹었니?', { exact: true })).toBeVisible()
  await expect(page.locator('.translator-card--result .translator-card__label')).toHaveText('표준어')
  await expect(page.locator('.translator-result__meta')).toHaveText('오늘 3번 남았어요')
  expect(requests.map((r) => r.body)).toEqual([{ text: '밥 뭇나?', direction: 'toStandard' }])

  await page.getByRole('button', { name: '복사', exact: true }).click()
  await expect(page.getByRole('button', { name: '복사했어요', exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('밥 먹었니?')

  await page.getByRole('button', { name: '공유', exact: true }).click()
  const shares = await page.evaluate(() => (window as unknown as { AccenturyBridge: { shares: string[] } }).AccenturyBridge.shares)
  expect(shares).toHaveLength(1)
  expect((JSON.parse(shares[0]) as { text: string }).text).toBe('밥 뭇나? → 밥 먹었니?')
})

test('구 서버 사투리 → 표준어 (KAN-317) - direction을 모르는 서버가 {dialect}만 주면 입력 아래 「지금은 표준어로 바꾸기를 쓸 수 없어요」, 대화상자 없음', async ({
  page,
}) => {
  await asApp(page)
  await consented(page)
  await stubTranslations(page, (route) => route.fulfill({ json: { dialect: '밥 뭇나?' } }))
  await page.goto(TRANSLATE_URL)

  await page.getByRole('button', { name: /번역 방향 바꾸기/ }).click()
  await page.getByLabel('경남 사투리 문장').fill('밥 뭇나?')
  await submit(page).click()

  await expect(page.getByRole('alert').filter({ hasText: '지금은 표준어로 바꾸기를 쓸 수 없어요' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('구 서버 응답에 remaining이 없으면 「오늘 n번 남았어요」를 숨긴다', async ({ page }) => {
  await asApp(page)
  await consented(page)
  await stubTranslations(page, (route) => route.fulfill({ json: { dialect: '밥 뭇나?' } }))
  await page.goto(TRANSLATE_URL)

  await input(page).fill('밥 먹었니?')
  await submit(page).click()
  await expect(page.getByText('밥 뭇나?', { exact: true })).toBeVisible()
  await expect(page.getByText(/남았어요/)).toHaveCount(0)
})

const LIMIT_TITLE = '하루 한도를 다 사용했어요.'
const LIMIT_BODY = '번역은 하루 5번까지예요.'

test('remaining 0 - 결과는 「오늘 0번 남았어요」로 보이고, 다음 시도 전(입력 수정)에 한도 카드로 바뀌며 ↓가 잠긴다', async ({ page }) => {
  await asApp(page)
  await consented(page)
  const requests = await stubTranslations(page, (route) => route.fulfill(ok('밥 뭇나?', 0)))
  await page.goto(TRANSLATE_URL)

  await input(page).fill('밥 먹었니?')
  await submit(page).click()
  await expect(page.getByText('밥 뭇나?', { exact: true })).toBeVisible()
  await expect(page.locator('.translator-result__meta')).toHaveText('오늘 0번 남았어요')
  await expect(submit(page)).toBeDisabled()

  await input(page).fill('어디 가?')
  await expect(page.getByText(LIMIT_TITLE, { exact: true })).toBeVisible()
  await expect(page.getByText(LIMIT_BODY, { exact: true })).toBeVisible()
  await expect(submit(page)).toBeDisabled()
  expect(requests).toHaveLength(1)
})

test('429 TRANSLATION_DAILY_LIMIT_EXCEEDED - 결과 카드 자리에 「이용 안내」 + 두 줄, ↓ 비활성, 다시 시도 없음', async ({ page }) => {
  await asApp(page)
  await consented(page)
  await stubTranslations(page, (route) => route.fulfill({ status: 429, json: envelope('TRANSLATION_DAILY_LIMIT_EXCEEDED', false) }))
  await page.goto(TRANSLATE_URL)

  await input(page).fill('밥 먹었니?')
  await submit(page).click()
  const card = page.locator('.translator-card--limit')
  await expect(card.getByText('이용 안내', { exact: true })).toBeVisible()
  await expect(card.getByText(LIMIT_TITLE, { exact: true })).toBeVisible()
  // 한도 종류를 읽을 수 없는 문구(`… (e2e)`)라 기본 본문이다 (KAN-361 limitBody)
  await expect(card.getByText(LIMIT_BODY, { exact: true })).toBeVisible()
  await expect(submit(page)).toBeDisabled()
  await expect(page.getByRole('button', { name: '다시 시도', exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('번역한 문장이 여기 나와요', { exact: true })).toHaveCount(0)
})

test('429 LLM 호출 20번 소진 - 서버 문구에서 한도를 읽어 「번역 요청은 하루 20번까지예요.」, 「5번」이 아니다 (KAN-361)', async ({ page }) => {
  await asApp(page)
  await consented(page)
  const callLimit = '오늘 번역 요청 횟수(20회)를 다 썼습니다. 내일 다시 시도해 주세요.'
  await stubTranslations(page, (route) =>
    route.fulfill({ status: 429, json: { ...envelope('TRANSLATION_DAILY_LIMIT_EXCEEDED', false), message: callLimit } }),
  )
  await page.goto(TRANSLATE_URL)

  await input(page).fill('밥 먹었니?')
  await submit(page).click()
  const card = page.locator('.translator-card--limit')
  await expect(card.getByText(LIMIT_TITLE, { exact: true })).toBeVisible()
  await expect(card.getByText('번역 요청은 하루 20번까지예요.', { exact: true })).toBeVisible()
  await expect(card.getByText(LIMIT_BODY, { exact: true })).toHaveCount(0)
})

test('7장 공통 틀 (6-1-1) - 입력·동의 시트·대기·결과·오류 대화상자·입력 오류·한도에서 제목과 입력 카드 윗선·좌우가 같다', async ({ page }) => {
  await asApp(page)
  let release!: () => void
  let mode: 'hold' | '503' | '422' | '429' = 'hold'
  await stubTranslations(page, async (route) => {
    if (mode === 'hold') {
      await new Promise<void>((resolve) => (release = resolve))
      return route.fulfill(ok('밥 뭇나?'))
    }
    if (mode === '503') return route.fulfill({ status: 503, json: envelope('TRANSLATION_UNAVAILABLE', true) })
    if (mode === '422') return route.fulfill({ status: 422, json: envelope('TRANSLATION_REJECTED', false) })
    return route.fulfill({ status: 429, json: envelope('TRANSLATION_DAILY_LIMIT_EXCEEDED', false) })
  })
  await page.goto(TRANSLATE_URL)
  await page.evaluate(() => document.fonts.ready)

  const boxes: Record<string, { title: number[]; card: number[] }> = {}
  const snap = async (name: string) => {
    const t = (await title(page).boundingBox())!
    const c = (await inputCard(page).boundingBox())!
    boxes[name] = { title: [t.x, t.y], card: [c.x, c.y, c.width] }
  }

  await input(page).fill('밥 먹었니?')
  await snap('입력')
  await submit(page).click()
  await expect(page.getByRole('dialog', { name: '문장을 Google Gemini로 보내도 될까요?' })).toBeVisible()
  await snap('동의 시트')
  await page.getByRole('button', { name: '동의하고 보내기', exact: true }).click()
  await expect(page.getByText('번역 중이에요', { exact: true })).toBeVisible()
  await snap('대기')
  release()
  await expect(page.getByText('밥 뭇나?', { exact: true })).toBeVisible()
  await snap('결과')

  mode = '503'
  await input(page).fill('밥 먹었니')
  await submit(page).click()
  await expect(page.getByRole('dialog', { name: '번역하지 못했어요' })).toBeVisible()
  await snap('오류 대화상자')
  await page.getByRole('button', { name: '닫기', exact: true }).click()

  mode = '422'
  await submit(page).click()
  await expect(page.getByText('올바른 문장을 넣어 주세요', { exact: true })).toBeVisible()
  await snap('입력 오류')

  mode = '429'
  await input(page).fill('밥 먹었니?')
  await submit(page).click()
  await expect(page.getByText(LIMIT_TITLE, { exact: true })).toBeVisible()
  await snap('한도')

  const first = boxes['입력']
  for (const [name, box] of Object.entries(boxes)) expect(box, name).toEqual(first)
  // 시안 수치: 좌우 여백 24, 제목 윗선 80
  expect(first.title).toEqual([24, 80])
  expect([first.card[0], first.card[2]]).toEqual([24, page.viewportSize()!.width - 48])
})

test.describe('모션 축소', () => {
  test('⇄는 회전·자리 바꿈 없이 바로 끝 상태, 받아 적는 줄은 움직이지 않고 서 있다', async ({ page }) => {
    await asApp(page)
    await consented(page)
    await stubTranslations(page, () => new Promise<void>(() => {}))
    // 프로젝트 use 위에서 `test.use({ reducedMotion })`가 먹지 않아 intonation-learning 스펙처럼 페이지에 직접 건다
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(TRANSLATE_URL)

    const standard = page.locator('.translator-pair__lang--standard')
    const dialectX = (await page.locator('.translator-pair__lang--dialect').boundingBox())!.x
    const toggle = page.getByRole('button', { name: /번역 방향 바꾸기/ })
    // 전환 시간이 0.01ms(tokens.css 모션 축소)라 눈에는 바로 끝 상태다
    const durations = () =>
      page.evaluate(() => [
        getComputedStyle(document.querySelector('.translator-pair__lang')!).transitionDuration,
        getComputedStyle(document.querySelector('.translator-pair__toggle svg')!).transitionDuration,
      ])
    expect(await durations()).toEqual(['1e-05s', '1e-05s'])
    await toggle.click()
    await expect.poll(async () => Math.round((await standard.boundingBox())!.x)).toBe(Math.round(dialectX))
    await expect.poll(() => toggle.locator('svg').evaluate((el) => getComputedStyle(el).transform)).toMatch(/^matrix\(-1, /)
    await toggle.click()

    await input(page).fill('밥 먹었니?')
    await submit(page).click()
    await expect(page.getByText('번역 중이에요', { exact: true })).toBeVisible()
    const lines = page.locator('.translator-wait i')
    await expect(lines).toHaveCount(2)
    // 반복 없이 한 번·0.01ms로 끝나고, 끝난 뒤의 줄은 다 그린 모양(변형 없음·불투명) 그대로 선다
    for (const line of await lines.all()) {
      expect(await line.evaluate((el) => [getComputedStyle(el).animationIterationCount, getComputedStyle(el).animationDuration])).toEqual([
        '1',
        '1e-05s',
      ])
      await expect.poll(() => line.evaluate((el) => [getComputedStyle(el).transform, getComputedStyle(el).opacity])).toEqual(['none', '1'])
      expect((await line.boundingBox())!.width).toBeGreaterThan(0)
    }
  })
})
