/**
 * 분석 실패 갈래 (KAN-181 3단계 → KAN-191 → KAN-271로 뒤집음) — 음성 문항 하나가 판정에
 * 실패했을 때 브라우저 단독 응시자가 재녹음으로 완주하는가.
 *
 * ## 이력
 *
 * KAN-181이 처음 겨눈 것은 "재녹음으로 복구해 완주한다"였지만 그때 브라우저에는 그 길이 없었다 —
 * 브리지가 없으면 [다시 녹음]이 그려지지 않아 대기 화면이 막다른 길이 됐고, 스펙은 그 막다름을
 * 단언했다. KAN-191은 막다름에 [다시 테스트하기] 출구를 붙였고 스펙은 그 출구를 단언했다.
 *
 * **KAN-271이 재녹음 자체를 웹 대기열로 옮겼다.** 실패 줄의 [다시 녹음]이 웹 녹음 패널로 그 문항
 * 화면을 열고, 업로드가 접수되면 남은 실패 문항으로, 없으면 대기 화면으로 돌아와 폴링을 다시
 * 돌린다. 그래서 이 스펙은 다시 처음 겨눈 것, 곧 **완주**를 단언한다.
 *
 * ## 테스트 둘과 `E2E_FAIL_TIMES`
 *
 * 가짜 AI 엔진은 `E2E_FAIL_ITEM`(compose → `ACCENTURY_AI_FAKE_FAIL_ITEM`) 문항을 언제나
 * 실패시켰다. 그러면 재녹음해도 같은 판정이라 완주를 볼 수 없다. 서버 KAN-271이
 * `E2E_FAIL_TIMES`(→ `ACCENTURY_AI_FAKE_FAIL_TIMES`)를 더해 처음 N번만 실패시킬 수 있게 됐다.
 *
 * - `E2E_FAIL_ITEM` + `E2E_FAIL_TIMES=1` 무대 → 완주 테스트 (첫 판정만 실패, 재녹음은 성공)
 * - `E2E_FAIL_ITEM`만 있는 무대 → 재실패 테스트 (재녹음도 실패, 다시 [다시 녹음]이 서는가)
 *
 * 둘은 `E2E_FAIL_TIMES` 유무로 서로 skip된다. 스펙은 스택 설정을 알아낼 길이 없어
 * (browser-e2e.md 「스택 두 상태와 대칭 스킵」) 환경 변수를 무대를 세운 쪽과 똑같이 줘야 한다.
 *
 * **실패 카운터는 ai 프로세스 전역이다.** 요청에 세션 식별자가 없어 가짜 엔진이 세션별로 셀 수
 * 없다. 한 번 실패를 쓰고 나면 그 ai는 더는 실패시키지 않으므로, 완주 테스트를 다시 돌리려면 ai를
 * `--force-recreate`로 다시 띄워야 한다. 같은 이유로 **이 파일은 재시도를 끈다** — CI의
 * `retries: 1`이 두 번째 시도를 돌리면 카운터가 이미 소진돼 409가 오지 않고, 첫 시도의 진짜 실패
 * 원인 대신 엉뚱한 시간 초과가 남는다.
 *
 * ## 실패 문항이 세션에 실리게 하기 — 세트를 고정한다
 *
 * 서버가 세션마다 음성 세트를 무작위로 고르므로(KAN-205) 그대로 두면 `E2E_FAIL_ITEM`이 이 세션에
 * 없을 수 있다 (gn-2026.10.1은 세트가 수십 개라 거의 언제나 없다). 세션 생성 API는 `voiceSet`을
 * 받으므로(KAN-182), 요청을 가로채 [VOICE_SET]을 실어 보낸다. 웹은 응답의 세트를 그대로 따르므로
 * 화면 흐름은 무작위 배정과 같다.
 */

import { expect, test, type Page } from '@playwright/test'
import { answerAllItems, answerVoiceItem, awaitItem, startTest } from './helpers/testFlow'

/** 실패시킬 음성 문항 id. 무대를 세운 쪽(compose)과 같은 값을 봐야 한다 */
const failItem = process.env.E2E_FAIL_ITEM
const hasFailItem = failItem !== undefined && failItem !== ''
/** 처음 N번만 실패시키는 무대인가. 없으면 언제나 실패 */
const failsOnce = process.env.E2E_FAIL_TIMES !== undefined && process.env.E2E_FAIL_TIMES !== ''

/**
 * `E2E_FAIL_ITEM`이 실리는 세트. `VoiceSets` 규칙상 세트 1은 음성 풀의 처음 3개(v1~v3)라
 * 문서가 권하는 v3가 들어 있다. 다른 문항을 실패시키려면 `E2E_VOICE_SET`으로 그 문항의 세트를 준다.
 */
const VOICE_SET = Number(process.env.E2E_VOICE_SET ?? '1')

test.skip(
  !hasFailItem,
  'AI가 특정 문항을 실패시키도록 떠 있어야 한다: E2E_FAIL_ITEM=v3 [E2E_FAIL_TIMES=1] docker compose up -d --no-deps --wait ai',
)

// 카운터가 ai 전역이라 두 번째 시도는 실패를 만나지 못한다 (헤더 「테스트 둘과 E2E_FAIL_TIMES」)
test.describe.configure({ retries: 0 })

/** 문항 7건 + 409 대기 + 재녹음 + 두 번째 분석 대기. 완주 실측의 몇 배에서 끊는다 */
test.setTimeout(180_000)

const isConflict = (url: string, status: number) => url.includes('/complete') && status === 409

/**
 * 첫 응시를 마치고 409를 확인한 뒤, 실패 줄의 [다시 녹음]을 눌러 같은 번호의 문항 화면까지 간다.
 *
 * @returns 재녹음 구간의 요청 수를 세는 카운터 (클릭 직전부터 센다)
 */
async function failAndOpenRetake(page: Page) {
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[browser:error] ${message.text()}`)
  })

  await page.route('**/v0/sessions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const body = route.request().postDataJSON() as Record<string, unknown>
    await route.continue({ postData: JSON.stringify({ ...body, voiceSet: VOICE_SET }) })
  })

  /*
   * 서버가 짚은 실패 목록으로 **우리가 심은 그 문항이** 실패했는지 본다 — 화면 문구는 다른 이유의
   * 실패에도 같다. `retakeItems`는 봉투의 최상위 필드다(파싱 뒤 `itemIds`로 묶이기 전 원문).
   */
  const conflict = page.waitForResponse((r) => isConflict(r.url(), r.status()), { timeout: 90_000 })

  await startTest(page)
  await answerAllItems(page)

  const envelope = await (await conflict).json()
  expect(envelope.code).toBe('RESULT_RETAKE_REQUIRED')
  expect(envelope.retakeItems).toEqual([failItem])

  await expect(page.getByText('일부 문항을 다시 녹음해야 해요')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('아래 목록에서 해당 문항을 다시 녹음해 주세요')).toBeVisible()

  // 실패 줄 하나에 [다시 녹음] 하나. KAN-271 전의 막다름 출구는 더는 없다
  const retake = page.getByRole('button', { name: '다시 녹음', exact: true })
  await expect(retake).toHaveCount(1)
  await expect(page.getByRole('button', { name: '다시 테스트하기' })).toHaveCount(0)
  await expect(page.getByText('여기서는 더 진행할 수 없어요')).toHaveCount(0)
  await expect(page).toHaveURL(/screen=test/)

  /*
   * 줄의 번호는 첫 응시의 전체 기준 번호다. 재녹음 화면의 진행 표기가 같은 번호여야 사용자가
   * "아까 그 문항"으로 알아본다. 번호 자체는 정의의 순서라 박지 않고 화면에서 읽는다.
   */
  const label = await page
    .getByRole('listitem')
    .filter({ has: retake })
    .getByText(/^\d+번 문항$/)
    .textContent()
  const itemNumber = Number(label?.replace('번 문항', ''))
  expect(itemNumber).toBeGreaterThan(0)

  const counts = { uploads: 0, answers: 0 }
  page.on('request', (request) => {
    if (request.method() !== 'POST') return
    if (/\/voice-items\/[^/]+\/recording$/.test(request.url())) counts.uploads++
    if (/\/vocab-items\/[^/]+\/answer$/.test(request.url())) counts.answers++
  })

  await retake.click()
  expect(await awaitItem(page, itemNumber)).toBe('VOICE')
  return counts
}

test('음성 문항 분석 실패 - 실패 문항만 다시 녹음해 결과까지 완주한다', async ({ page }) => {
  test.skip(!failsOnce, 'E2E_FAIL_TIMES가 없는 무대는 재녹음도 실패한다 (아래 재실패 테스트가 그 무대를 쓴다)')

  const counts = await failAndOpenRetake(page)
  await answerVoiceItem(page)

  // 대기 화면으로 돌아와 폴링이 다시 돈다 (진행률 막대는 대기 화면의 두 상태 모두에 있다)
  await expect(page.getByRole('progressbar', { name: '분석 진행률' })).toBeVisible()
  await expect(page).toHaveURL(/screen=result/, { timeout: 60_000 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText(/^\d+개 등급 중 \d+번째$/)).toBeVisible()

  // 재녹음 구간에는 실패한 그 문항 하나만 — 성공한 음성 문항도 어휘 문항도 다시 나오지 않았다
  expect(counts).toEqual({ uploads: 1, answers: 0 })
})

test('재녹음한 문항이 다시 실패하면 대기 화면에 다시 실패로 표시되고 다시 녹음할 수 있다', async ({ page }) => {
  test.skip(failsOnce, 'E2E_FAIL_TIMES가 있는 무대에서는 재녹음이 성공한다 (위 완주 테스트가 그 무대를 쓴다)')

  const counts = await failAndOpenRetake(page)
  // 재녹음 뒤 두 번째 409. 시도 상한(5회)에 닿지 않게 재녹음은 한 번만 한다
  const again = page.waitForResponse((r) => isConflict(r.url(), r.status()), { timeout: 90_000 })
  await answerVoiceItem(page)

  const envelope = await (await again).json()
  expect(envelope.retakeItems).toEqual([failItem])

  await expect(page.getByText('일부 문항을 다시 녹음해야 해요')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('다시 녹음이 필요해요')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '다시 녹음', exact: true })).toHaveCount(1)
  await expect(page).toHaveURL(/screen=test/)
  expect(counts).toEqual({ uploads: 1, answers: 0 })
})
