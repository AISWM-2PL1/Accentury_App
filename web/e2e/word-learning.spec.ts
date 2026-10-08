/**
 * 단어 학습 W-1~W-5 (KAN-255 6단계) — 앱 WebView 실행을 흉내 내 실 백엔드로 세트 하나를 끝까지 돈다.
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

/** 앱이 WebView에 싣는 쿼리와 같은 모양. `screen=words`가 단어 학습 진입이다 (App.tsx) */
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

/** W-1이 그려졌는지. 제목과 레벨 묶음(h2 「레벨 N」)이 하나 이상 있어야 한다 */
async function expectSetList(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: '단어 학습' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: /^레벨 \d+$/ }).first()).toBeVisible()
}

test('W-1부터 W-5까지 한 바퀴 - W-4 정오가 아이콘과 글자로 보이고 W-5 정답률이 그 수와 맞는다', async ({
  page,
  request,
}) => {
  await openWords(page, { token: await loginWithFakeIdp(request) })

  // W-1. 첫 세트(seq 최소)가 「추천」이다 (WordSetListScreen의 ponytail 주석)
  await expectSetList(page)
  const firstSet = page.locator('.word-set-row').first()
  await expect(firstSet).toContainText('추천')
  await firstSet.click()

  // W-2. 카드 수는 세트마다 달라 [문제 풀기]가 나올 때까지 넘긴다
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
  /** W-4에서 본 오답 (prompt, 고른 보기, 정답 보기) — W-5 오답 목록 내용과 대조한다 (KAN-255 리뷰 P2) */
  const wrongSeen: string[][] = []
  for (;;) {
    const prompt = (await page.locator('#word-prompt').textContent())?.trim() ?? ''
    // 보기 글자는 label의 첫 span이다 — 제출 뒤엔 「정답」/「내 답」 표시가 뒤에 붙는다 (ChoiceList)
    const chosenText = (await page.locator('.choice-list label').first().locator(':scope > span').first().textContent())?.trim() ?? ''
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
      (await page.locator('.choice-list label.choice--correct').locator(':scope > span').first().textContent())?.trim() ?? ''
    if ((await label.textContent()) === '정답') {
      correct += 1
      expect(correctText).toBe(chosenText)
    } else {
      wrongSeen.push([prompt, `내 답: ${chosenText}`, `정답: ${correctText}`])
    }

    // 자동으로 넘어가지 않는다 — 잠깐 기다려도 같은 문항의 W-4가 그대로다
    await page.waitForTimeout(500)
    await expect(verdict).toBeVisible()

    if (await showResult.isVisible()) break
    await nextItem.click()
    await expect(verdict).toBeHidden()
  }
  await showResult.click()

  // W-5. 화면이 센 정오와 서버 집계가 같아야 한다 (AC 3)
  await expect(page.getByRole('heading', { level: 1, name: '세트 완료' })).toBeVisible()
  await expect(page.getByText(`${items}문항 중 ${correct}개 맞혔어요`, { exact: true })).toBeVisible()
  const percent = Number((await page.locator('.text-hero').textContent())?.replace('%', ''))
  // 반올림 규칙은 서버 몫이라 내림·반올림 어느 쪽이든 받는다
  expect([Math.floor((correct * 100) / items), Math.round((correct * 100) / items)]).toContain(percent)
  await expect(page.locator('.word-wrong__item')).toHaveCount(items - correct)
  // 개수만이 아니라 내용도 — 각 항목의 prompt·「내 답」·「정답」이 W-4에서 본 것과 같아야 한다.
  // 순서는 서버 몫이라 정렬해 비교한다
  const wrongShown = await page
    .locator('.word-wrong__item')
    .evaluateAll((lis) => lis.map((li) => [...li.querySelectorAll('p')].slice(0, 3).map((p) => p.textContent?.trim() ?? '')))
  const byText = (a: string[], b: string[]) => a.join('|').localeCompare(b.join('|'))
  expect(wrongShown.sort(byText)).toEqual(wrongSeen.sort(byText))
  console.log(`[e2e] 단어 학습 ${items}문항 중 ${correct}개 정답 (${percent}%)`)

  await page.getByRole('button', { name: '세트 목록으로', exact: true }).click()
  await expectSetList(page)
})

test('로그인 안 됨 - 토큰이 빈 문자열이면 로그인 안내와 [학습 종류로]', async ({ page }) => {
  await openWords(page, { token: '' })
  await expect(page.getByText('로그인하면 단어 학습을 할 수 있어요', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '학습 종류로', exact: true })).toBeVisible()
})

test('401 - 브리지로 토큰을 갱신한 뒤 같은 요청을 다시 보내 목록이 뜬다', async ({ page, request }) => {
  const token = await loginWithFakeIdp(request)
  await openWords(page, { token: 'e2e-expired-token', refreshTo: token })

  await expectSetList(page)
  // 갱신이 실제로 브리지를 거쳤다. 횟수를 1로 못 박지 않는 이유: 개발 빌드 StrictMode가 진입
  // 조회를 두 번 보내, 둘째 401이 첫 갱신이 끝난 뒤에 닿으면 갱신이 한 번 더 나가는 것도 정상이다
  expect(await refreshCount(page)).toBeGreaterThanOrEqual(1)
})

test('목록 조회 실패 - [다시 시도]로 다시 불러 목록이 뜬다', async ({ page, request }) => {
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
  failing = false
  await retry.click()
  await expectSetList(page)
})
