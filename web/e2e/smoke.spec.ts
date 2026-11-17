/**
 * 시작 게이트 스모크 (KAN-181 1단계) — 인트로에서 문항 진행 화면까지 실브라우저로 걸어간다.
 *
 * 여기서만 확인할 수 있는 것이 셋이다.
 *
 * 1. **가짜 마이크가 진짜 오디오 경로를 탄다.** vitest는 `getUserMedia`도 `AudioContext`도
 *    없어 캡처를 주입으로 갈아 끼우는데(`VoiceCheckScreenProps.capture`), 그러면 워클릿·
 *    리샘플러·YIN이 실제로 이어지는지는 아무도 보지 않는다. Chromium의 합성 장치가 2.5초짜리
 *    "안녕하세요"를 흘려 넣으면 그 사슬 전체가 한 번에 걸린다.
 * 2. **문서를 다시 로드하는 화면 전환이 성립한다.** 세션 생성 뒤의 이동은 `location.href`
 *    대입이라 jsdom이 구현하지 않아, 단위 테스트는 주입한 `navigate`가 받은 문자열만 본다.
 *    브라우저에서는 그 URL로 실제 새 문서가 뜨고 진입 분기(App)가 다시 돈다.
 * 3. **백엔드가 실제로 세션을 준다.** `POST /v0/sessions`가 `/v0` 프록시를 거쳐 로컬
 *    백엔드로 나가고, 받은 토큰이 저장소를 건너 다음 문서까지 닿아야 이 스펙이 통과한다.
 *
 * 게이트를 걷는 절차 자체는 [startTest]가 갖는다 (KAN-181 2단계에 완주 스펙이 붙으면서
 * 같은 길을 두 번 적게 됐다). 이 스펙에 남은 것은 **인트로 화면 고유의 확인**이다 —
 * 게이트 통과만 보는 것이라면 완주 스펙이 이미 매번 지나간다. 예외로 목소리 점검 「듣는 중」 마이크 단언을 둔다 — 듣는 중은
 * 시작 게이트 안에서 잠깐만 서서, [startTest]를 걷는 이 스펙에서 걷기 전에 기다림을 걸어야 잡힌다.
 */

import { expect, test } from '@playwright/test'
import {
  ESTIMATED_MINUTES,
  VOCABULARY_ITEM_COUNT,
  VOICE_ITEM_COUNT,
} from '../src/intro/introText'
import { passAdConsentIfShown, REGION_TITLE, startTest } from './helpers/testFlow'

test('웹 단독 진입 - 인트로에서 가짜 마이크로 목소리 점검을 통과해 문항 화면까지 간다', async ({
  page,
}) => {
  /*
   * 브라우저 콘솔을 그대로 흘려보낸다. 오디오 경로의 실패는 화면에 "목소리가 잡히지
   * 않았어요" 한 줄로만 나타나서, 무엇이 왜 안 됐는지는 콘솔에만 남는다.
   */
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      console.log(`[browser:${message.type()}] ${message.text()}`)
    }
  })

  /*
   * 인트로의 숫자 카드는 게이트를 걷기 **전에** 본다 — [시작하기]를 누르면 화면이 갈리므로
   * 나중에는 확인할 수 없다.
   *
   * 값을 적어 두지 않고 상수에서 조립하는 이유: KAN-10 연동으로 문항 수가 서버 값으로
   * 바뀌면 이 스펙도 같이 따라가야 하는데, 여기에 10을 적어 두면 그때 화면과 스펙이 조용히
   * 갈라진다.
   */
  await page.goto('/test')
  /*
   * 광고 ID가 든 빌드의 첫 방문에는 동의 시트가 인트로를 덮는다 (KAN-197 2단계). 숫자 카드는
   * 가려져도 보이는 것으로 잡히지만, 시트를 걷어낸 뒤에 재는 편이 사람이 실제로 읽는 화면과
   * 같다. 인트로가 그려지기를 기다리는 것도 이 헬퍼가 한다 (PR #109 리뷰 (2026-09-13)) —
   * `goto` 직후의 빈 순간을 「시트 없음」으로 읽고 지나가면 아래 단언이 뒤늦은 막에 막힌다.
   */
  await passAdConsentIfShown(page)
  await expect(
    page.getByText(`${VOICE_ITEM_COUNT + VOCABULARY_ITEM_COUNT}문항`),
  ).toBeVisible()
  await expect(page.getByText(`약 ${ESTIMATED_MINUTES}분`)).toBeVisible()

  /*
   * 「듣는 중」 마이크는 선으로 남아야 한다 — 녹음 버튼의 채움이 같은 클래스(`record-button--active`)를 타고 마이크까지 칠해
   * 뭉개진 적이 있다 (KAN-347 7단계 보완). 듣는 중은 게이트 안에서 잠깐만 서므로 걷기 전에 기다림을 걸어 둔다.
   * computed style은 jsdom이 못 보는 자리라 여기서 본다
   */
  const listeningMicFill = page
    .locator('.voice-check__foot .record-button--active path')
    .evaluate((path) => getComputedStyle(path).fill)

  const startedAt = Date.now()
  await startTest(page)
  console.log(`시작 게이트 통과까지 ${Date.now() - startedAt}ms`)
  expect(await listeningMicFill).toBe('none')
})

/*
 * 출신 지역 지도 (KAN-347 7단계). 칩은 같은 name의 네이티브 라디오라 방향키 이동·「고른 칩만 Tab 순서」를 브라우저가 준다 —
 * jsdom은 키보드로 라디오를 옮기지 않아 실브라우저에서 본다. 큰 글자에서는 지도를 걷고 같은 칩을 2열 목록으로 편다.
 * 세션 생성 전 화면이라 백엔드를 타지 않는다.
 */
test('출신 지역 지도 - 방향키로 칩을 옮기고, 고른 지역이 벽돌로 칠해지며, 큰 글자에서는 2열 목록이다', async ({ page }) => {
  await page.goto('/test')
  await passAdConsentIfShown(page)
  await page.getByRole('button', { name: '레벨 테스트 시작', exact: true }).click()
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: REGION_TITLE })).toBeVisible()
  await expect(page.getByText('행정구역 경계: 통계청 SGIS(2013)')).toBeVisible()
  await expect(page.locator('.region-map__geography path[data-region]')).toHaveCount(18)

  // 고르기 전: Tab은 그룹의 첫 칩 하나로 들어간다
  const group = page.getByRole('radiogroup', { name: REGION_TITLE })
  await group.getByRole('radio', { name: '서울' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: '경기, 인천 포함' })).toBeChecked()
  await expect(page.getByRole('radio', { name: '경기, 인천 포함' })).toBeFocused()
  await expect(page.getByRole('status').filter({ hasText: '경기 · 인천 포함' })).toBeVisible()

  // 경남까지 옮기면 경남 묶음 면(경상남도·울산·부산) 셋이 칠해진다
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: '경남, 부산·울산 포함' })).toBeChecked()
  await expect(page.locator('.region-map__geography path.is-selected')).toHaveCount(3)
  // 벽돌(--color-point #a8503a). 색 전환 150ms가 끝나기를 기다린다
  await expect
    .poll(() => page.locator('.region-map__geography path.is-selected').first().evaluate((el) => getComputedStyle(el).fill))
    .toBe('rgb(168, 80, 58)')
  await expect(page.getByText('경남 · 부산·울산 포함')).toBeVisible()

  // 고른 칩만 Tab 순서에 든다: [다음]에서 Shift+Tab 한 번이면 고른 칩이다
  await page.getByRole('button', { name: '다음', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('radio', { name: '경남, 부산·울산 포함' })).toBeFocused()

  // 큰 글자: 지도가 걷히고 칩이 2열로 서며 서로 겹치지 않는다
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '150%'
    window.dispatchEvent(new Event('resize'))
  })
  await expect(page.locator('.region-map__geography')).toBeHidden()
  const boxes = await page.locator('.region-chip').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }),
  )
  expect(new Set(boxes.map((b) => Math.round(b.left))).size).toBe(2)
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const overlap = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
      expect(overlap, `칩 ${i}·${j} 겹침`).toBe(false)
    }
  }

  // 부제 두 줄(「결과에는 영향이 없어요」 복원, PR #76 리뷰)이 목록·지도를 밀어 넘치지 않는다 — 큰 글자 목록, 360 폭 지도 둘 다
  const lead = page.locator('.region-screen__lead')
  await expect(lead).toHaveText(/결과에는 영향이 없어요$/)
  const noOverflow = async (below: string) => {
    const { leadBottom, belowTop, scrollX } = await page.evaluate((sel) => ({
      leadBottom: document.querySelector('.region-screen__lead')!.getBoundingClientRect().bottom,
      belowTop: document.querySelector(sel)!.getBoundingClientRect().top,
      scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }), below)
    expect(leadBottom).toBeLessThanOrEqual(belowTop + 0.5)
    expect(scrollX).toBeLessThanOrEqual(0)
  }
  await page.setViewportSize({ width: 360, height: 780 })
  await noOverflow('.region-chip')
  await page.evaluate(() => {
    document.documentElement.style.fontSize = ''
    window.dispatchEvent(new Event('resize'))
  })
  await expect(page.locator('.region-map__geography')).toBeVisible()
  await noOverflow('.region-map')
})
