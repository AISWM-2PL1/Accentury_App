/**
 * 글자 크기 100·150·200% (KAN-313) — WCAG 1.4.4 「텍스트 크기 조정」: 글자를 200%까지 키워도 내용과 기능을 잃지 않아야 한다.
 *
 * OS 글자 크기를 키우면 WebView의 루트 글자 크기가 커지고, rem으로 적은 글자·간격·칸이 함께 커진다(code wiki ux-ui.md
 * 「크기 단위 규칙 (rem/px 구분, KAN-313)」 절). 여기서 지키는 것은 그 결과 화면이 망가지지 않는다는 것 셋이다.
 *
 * 1. **가로 스크롤 없음** — 큰 글자에서 한 줄에 안 들어가는 행·낱말이 화면 폭을 밀어내면 문서가 옆으로 밀린다.
 * 2. **누르는 자리 48 이상** — 터치 하한(`--touch-target-min` = `max(48px, 3rem)`)이 큰 글자에서 무너지지 않는지.
 *    인라인 텍스트 링크(본문 속 `a.text-link`, `index.html`의 `#site-footer` 링크)는 뺀다 — 100%부터 글자 높이(16px)가
 *    곧 링크 높이인 문장 속 링크라 48 칸을 두지 않는 것이 시안이다(WCAG 2.5.8의 inline 예외). 그래서 셀렉터를 버튼·탭·
 *    버튼 모양 링크(`a.btn`)·보기(`label.choice`)로 좁힌다. 네이티브 체크박스는 이 화면들에 없다(동의 화면은 녹음 흐름 쪽).
 * 3. **넘침 없음** — `overflow: visible`인 글자 칸에서 내용이 칸보다 넓으면 이웃 칸을 덮는다.
 * 4. **잘림 없음** — `overflow`가 visible이 아닌 글자 칸에서 내용이 칸보다 넓거나 높으면 글자가 잘려 안 보인다.
 *
 * 글자 크기는 화면이 그려진 뒤 `documentElement.style.fontSize`로 건다. `addInitScript`로 미리 걸면 React가 그리기 전에
 * 지워져 적용되지 않는다(2단계 실측). 건 뒤 `resize`를 보내 큰 글자 표식(`html[data-large-text]`, `ui/textScale.ts`)을
 * 다시 재게 한다 — 앱이 루트 글자 크기를 바꾼 뒤 표식을 갱신하는 경로와 같다. 겹침은 보지 않는다 — 큰 글자에서 sticky·fixed 하단 띠가 본문 위에 오는 것은 의도된
 * 배치이고, 인라인 링크끼리 줄바꿈 상자가 겹치는 것도 오탐이다.
 *
 * 서버 응답은 전부 `page.route`로 가로챈다 — 백엔드·AI 서버 없이 돈다. 녹음 중 화면(타이머 캡슐·정지 버튼·레벨 바)은
 * 설정의 가짜 마이크로 [녹음]을 누른 채 잰다. 업로드까지 가는 녹음 흐름은 `full-run`이 맡는다. 앱 실행 흉내는
 * `learning-entry`·`translator` 스펙과 같다(URL의 `bridge=2` + `addInitScript`로 먼저 심은 브리지).
 */

import { expect, test, type Page } from '@playwright/test'
import { passAdConsentIfShown } from './helpers/testFlow'

/**
 * Pixel 7 폭 412(기준)와 좁은 폰 360. 넘침은 좁은 폭에서 먼저 난다. 100·150·200%에 더해 중간 배율 재현점(KAN-327)을 둔다 —
 * 화면 폭으로 큰 글자를 가르던 때 360 폭 110%·412 폭 115~125%에서 탭 라벨·등급명이 칸을 넘었다
 */
const VIEWPORTS = [
  { width: 412, height: 915, scales: [100, 115, 125, 150, 200] },
  { width: 360, height: 740, scales: [100, 110, 150, 200] },
] as const

// ── 서버 응답 (learning-entry·translator 스펙과 같은 모양) ──

const RESULT_BODY = {
  status: 'READY',
  scores: { intonation: 78, vocabulary: 60, overall: 72 },
  // 등급명 중 가장 긴 한 낱말(4자) — 홈 등급 카드가 큰 글자에서 이 낱말을 칸에 맞추는지 본다
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

const GUIDE_F0 = {
  unit: 'semitone',
  frameIntervalMs: 10,
  values: Array.from({ length: 120 }, (_, i) => (i % 30 < 3 ? null : Math.sin(i / 12) * 3)),
}

// 문장은 실제 정의처럼 두 줄 이상이 되게 길게 둔다 — 짧으면 큰 글자의 줄바꿈을 시험하지 못한다
const VOICE_ITEM = { itemId: 'v1', type: 'VOICE', prompt: '아이고 마, 니 오늘 밥은 묵었나? 와 이리 늦게 댕기노', maxDurationMs: 10000, guideF0: GUIDE_F0, emotion: '걱정하는' }
const VOCAB_ITEM = {
  itemId: 'w1',
  type: 'VOCABULARY',
  prompt: '「정구지」는 표준어로 무엇일까요? 경남에서 흔히 쓰는 말이에요',
  choices: [
    { choiceId: 'a', text: '부추' },
    { choiceId: 'b', text: '시금치 나물을 무친 반찬' },
    { choiceId: 'c', text: '고구마 줄기' },
    { choiceId: 'd', text: '미나리' },
  ],
}

/** 첫 문항이 음성인 정의와 단어인 정의. 세션 저장값의 testVersion으로 갈라 받는다 */
const definition = (items: object[]) => ({
  testVersion: 'gn-e2e',
  scoreVersion: 'sv-0.3',
  dialect: 'GYEONGNAM',
  estimatedDurationSec: 180,
  items: items.map((item, i) => ({ ...item, seq: i + 1 })),
})

async function stubServer(page: Page): Promise<void> {
  await page.route(/\/v0\/sessions\/[^/]+\/result$/, (r) => r.fulfill({ json: RESULT_BODY }))
  await page.route(/\/v0\/tests\/gn-voice/, (r) => r.fulfill({ json: definition([VOICE_ITEM, VOCAB_ITEM]) }))
  await page.route(/\/v0\/tests\/gn-vocab/, (r) => r.fulfill({ json: definition([VOCAB_ITEM, VOICE_ITEM]) }))
  await page.route(
    (u) => u.pathname === '/v0/learning/home',
    (r) =>
      r.fulfill({
        json: {
          levelTestTaken: true,
          levelTest: { testVersion: 'gn-2026.08.1', scoreVersion: 'sv-0.3', tier: RESULT_BODY.tier, completedAt: '2026-10-13T16:00:00Z' },
          recommendedCourseId: 'k1',
          recommendedSetId: 's1',
          streak: { currentDays: 3, attendedToday: false, lastAttendedDate: '2026-10-13' },
        },
      }),
  )
  await page.route(
    (u) => u.pathname === '/v0/learning/intonation-courses',
    (r) =>
      r.fulfill({
        json: {
          contentVersion: 'e2e',
          courses: [
            { courseId: 'k1', seq: 1, level: 1, topic: '시장에서', title: '인사와 안부 묻기', cardCount: 3, completedCardCount: 1, completed: false, recommended: true },
            { courseId: 'k2', seq: 2, level: 2, topic: null, title: '길 묻고 가르쳐 주기', cardCount: 4, completedCardCount: 4, completed: true, recommended: false },
            { courseId: 'k3', seq: 3, level: 3, topic: '집에서', title: '밥상 앞에서 하는 말', cardCount: 5, completedCardCount: 0, completed: false, recommended: false },
          ],
        },
      }),
  )
  await page.route(
    (u) => u.pathname === '/v0/learning/intonation-courses/k1',
    (r) =>
      r.fulfill({
        json: {
          contentVersion: 'e2e',
          courseId: 'k1',
          seq: 1,
          level: 1,
          topic: '시장에서',
          title: '인사와 안부 묻기',
          cards: [
            { cardId: 'c1', seq: 1, standard: '밥 먹었니? 오늘은 왜 이렇게 늦게 다니니', dialect: '밥 뭇나? 오늘은 와 이리 늦게 댕기노', guideF0: GUIDE_F0, referenceAudioUrl: null },
            { cardId: 'c2', seq: 2, standard: '어디 가니', dialect: '어데 가노', guideF0: GUIDE_F0, referenceAudioUrl: null },
          ],
        },
      }),
  )
  await page.route(
    (u) => u.pathname === '/v0/learning/word-sets',
    (r) =>
      r.fulfill({
        json: {
          contentVersion: 'e2e',
          sets: [
            { setId: 's1', seq: 1, level: 1, category: '음식', title: '먹을 것', cardCount: 1, itemCount: 1 },
            { setId: 's2', seq: 2, level: 1, category: '생활', title: '집 안에서 쓰는 물건 이름', cardCount: 6, itemCount: 6 },
          ],
        },
      }),
  )
}

/** 앱 WebView 흉내. 번역기 Gemini 동의(KAN-304)는 미리 심어 시트 없이 연다 */
async function asApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const noop = () => {}
    Object.assign(window, {
      AccenturyBridge: {
        getContractVersion: () => 2,
        getSessionToken: () => 'e2e-session-token',
        getAccessToken: () => 'e2e-access-token',
        openSettings: noop,
        requestMicPermission: noop,
        shareResult: noop,
      },
    })
    localStorage.setItem('accentury:translatorConsent', 'granted')
  })
}

/** 웹 단독 문항 화면 — 시작 게이트(권한·점검·세션 생성)를 건너뛰고 세션 저장값을 미리 심는다 */
async function webSession(page: Page, sessionId: string, testVersion: string): Promise<void> {
  await page.addInitScript(
    ({ sessionId, testVersion }) => {
      sessionStorage.setItem(
        'accentury.webSession',
        JSON.stringify({ sessionId, sessionToken: 'st_web', testVersion, voiceSet: 1, expiresAt: '2099-01-01T00:00:00Z' }),
      )
    },
    { sessionId, testVersion },
  )
}

/** 마이크가 막힌 브라우저 — 권한 요청이 곧바로 거절된다 */
async function denyMic(page: Page): Promise<void> {
  await page.addInitScript(() =>
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () => Promise.reject(new DOMException('e2e', 'NotAllowedError')),
    }),
  )
}

/** 화면별 진입. 끝나면 그 화면이 다 그려져 있다 */
const SCREENS: Record<string, (page: Page) => Promise<void>> = {
  인트로: async (page) => {
    await page.goto('/')
    await passAdConsentIfShown(page)
  },
  홈: async (page) => {
    await asApp(page)
    await page.goto('/?bridge=2&app=1.0&screen=home')
    await expect(page.locator('.home-streak')).toBeVisible()
  },
  '음성 문항': async (page) => {
    await webSession(page, 's_voice', 'gn-voice')
    await page.goto('/?screen=test&testVersion=gn-voice&voiceSet=1&sessionId=s_voice')
    await expect(page.getByRole('button', { name: '녹음', exact: true })).toBeVisible({ timeout: 20_000 })
  },
  '단어 문항': async (page) => {
    await webSession(page, 's_vocab', 'gn-vocab')
    await page.goto('/?screen=test&testVersion=gn-vocab&voiceSet=1&sessionId=s_vocab')
    await expect(page.getByRole('radiogroup')).toBeVisible({ timeout: 20_000 })
  },
  결과: async (page) => {
    await asApp(page)
    await page.goto('/?bridge=2&app=1.0&screen=result&sessionId=s_e2e')
    await expect(page.getByRole('button', { name: '친구에게 공유하기' })).toBeVisible()
  },
  '억양 코스 목록': async (page) => {
    await asApp(page)
    await page.goto('/?bridge=2&app=1.0&screen=intonation')
    await expect(page.getByRole('button', { name: /인사와 안부/ })).toBeVisible()
  },
  '억양 카드': async (page) => {
    await SCREENS['억양 코스 목록'](page)
    await page.getByRole('button', { name: /인사와 안부/ }).click()
    await expect(page.getByText('밥 뭇나?', { exact: false }).first()).toBeVisible()
  },
  '단어 세트': async (page) => {
    await asApp(page)
    await page.goto('/?bridge=2&app=1.0&screen=words')
    await expect(page.getByRole('button', { name: /먹을 것/ })).toBeVisible()
  },
  번역기: async (page) => {
    await asApp(page)
    await page.goto('/?bridge=2&app=1.0&screen=translate')
    await expect(page.getByLabel('표준어 문장')).toBeVisible()
  },
  '녹음 중': async (page) => {
    await SCREENS['음성 문항'](page)
    await page.getByRole('button', { name: '녹음', exact: true }).click()
    await expect(page.getByRole('button', { name: '정지', exact: true })).toBeVisible({ timeout: 10_000 })
  },
  '마이크 차단': async (page) => {
    await denyMic(page)
    await page.goto('/')
    await passAdConsentIfShown(page)
    await page.getByRole('button', { name: '내 억양 테스트하기', exact: true }).click()
    await expect(page.getByRole('button', { name: '앱으로 테스트하기' })).toBeVisible()
  },
}

/** 브라우저 안에서 세 항목을 잰다. 보이는 요소만 본다(.sr-only 안, 크기 0, 숨김 제외) */
function measure() {
  const de = document.documentElement
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0' && el.closest('.sr-only') === null
  }
  const describe = (el: Element) => {
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)
    return `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')} "${text}"`
  }
  const smallTargets = [...document.querySelectorAll('button, [role="tab"], a.btn, label.choice')]
    .filter(visible)
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    // 부동소수 오차만 허용한다(0.01px). 0.5px 여유는 47.5px 버튼도 통과시켰다(Codex 교차 검증 2026-11-09)
    .filter(({ r }) => r.width < 47.99 || r.height < 47.99)
    .map(({ el, r }) => `${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`)
  const overflowing = [...document.body.querySelectorAll('*')]
    .filter((el) => !(el instanceof SVGElement) && visible(el) && el.textContent?.trim())
    .filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible')
    .map((el) => `${describe(el)} sw=${el.scrollWidth} cw=${el.clientWidth}`)
  /*
   * 잘린 글자 — overflow가 visible이 아닌 칸은 넘친 글자를 덮지 않고 잘라 버려 위 검사에 안 잡힌다. 직접 글자를 가진
   * 요소만 본다(그림·띠를 감싼 상자의 장식 잘림은 글자가 아니다). 빼는 것:
   * - `text-overflow: ellipsis`·`-webkit-line-clamp` — 말줄임으로 자르겠다고 정한 칸이다
   * - textarea — 입력이 길면 안에서 스크롤해 보는 칸이다(번역기). 스크롤로 내용을 보는 영역은 잘림이 아니다
   * - sticky·fixed 하단 띠 안 — 큰 글자에서 하단 붙박이를 어떻게 둘지는 팀 결정 대기다(code wiki ux-ui.md KAN-313 절)
   */
  const hasOwnText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
  const inPinned = (el: Element) => {
    for (let a: Element | null = el; a; a = a.parentElement) {
      const pos = getComputedStyle(a).position
      if (pos === 'fixed' || pos === 'sticky') return true
    }
    return false
  }
  const clipped = [...document.body.querySelectorAll('*')]
    .filter((el) => !(el instanceof SVGElement) && !(el instanceof HTMLTextAreaElement) && visible(el) && hasOwnText(el))
    .filter((el) => {
      const cs = getComputedStyle(el)
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') return false
      if (cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none')) return false
      return (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && !inPinned(el)
    })
    .map((el) => `${describe(el)} sw=${el.scrollWidth} cw=${el.clientWidth} sh=${el.scrollHeight} ch=${el.clientHeight}`)
  return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, smallTargets, overflowing, clipped }
}

for (const { scales, ...viewport } of VIEWPORTS) {
  test.describe(`폭 ${viewport.width}`, () => {
    test.use({ viewport })

    for (const [screen, enter] of Object.entries(SCREENS)) {
      for (const scale of scales) {
        test(`${screen} ${scale}% - 가로 스크롤·48 미만 터치·글자 넘침·잘림 없음`, async ({ page }) => {
          await stubServer(page)
          await enter(page)
          const largeText = await page.evaluate((s) => {
            document.documentElement.style.fontSize = `${s}%`
            window.dispatchEvent(new Event('resize'))
            return document.documentElement.hasAttribute('data-large-text')
          }, scale)
          expect(largeText, '큰 글자 표식').toBe(scale > 100)
          await page.evaluate(() => document.fonts.ready)
          // 글자 크기를 바꾼 뒤 컨테이너 쿼리·레이아웃이 다시 잡히기를 한 프레임 기다린다
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

          const m = await page.evaluate(measure)
          expect(m.scrollWidth, '가로 스크롤').toBeLessThanOrEqual(m.clientWidth)
          expect(m.smallTargets, '48 미만 터치 대상').toEqual([])
          expect(m.overflowing, '칸 밖으로 넘친 글자').toEqual([])
          expect(m.clipped, '칸에 잘린 글자(가로·세로)').toEqual([])
        })
      }
    }
  })
}

/*
 * 320 폭 기본 글자 배치 (Codex 교차 검증 2026-11-09). 큰 글자용 재배치가 칸 폭만 보고 켜지면 320 폭에서는 100%에서도
 * 걸린다 — 홈 등급 카드의 글자가 그림 아래로 내려가고(카드 200→314px) 탭 라벨이 줄을 바꿨다(탭 바 65→77px).
 * 기준 스냅샷 대신 두 가지만 단정한다: 등급 글자가 그림과 같은 행, 탭 라벨이 한 줄.
 */
test.describe('폭 320 기본 글자', () => {
  test.use({ viewport: { width: 320, height: 915 } })

  test('홈 등급 카드는 그림과 글자가 같은 행이고 탭 라벨은 한 줄이다', async ({ page }) => {
    await stubServer(page)
    await SCREENS['홈'](page)
    await page.evaluate(() => document.fonts.ready)

    const art = await page.locator('.home-tier .illustration--home').boundingBox()
    const text = await page.locator('.home-tier__text').boundingBox()
    expect(art && text, '등급 카드 그림·글자').toBeTruthy()
    // 같은 행: 글자 칸이 그림 오른쪽에서 시작하고 세로로 그림과 겹친다
    expect(text!.x).toBeGreaterThanOrEqual(art!.x + art!.width)
    expect(text!.y).toBeLessThan(art!.y + art!.height)

    const labels = page.locator('.tab-bar__label')
    expect(await labels.count()).toBeGreaterThan(0)
    for (const box of await labels.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
      // 한 줄 = line-height 1rem(16px)
      expect(box).toBeLessThanOrEqual(16.01)
    }
  })
})
