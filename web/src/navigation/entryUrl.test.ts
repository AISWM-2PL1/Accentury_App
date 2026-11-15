/**
 * 진입 쿼리 조립 (KAN-31 Stage 1). 검사의 축은 하나다 — **지울 것만 지우는가**.
 *
 * `bridge`·`app`이 빠지면 스큐 판정이 구버전 앱으로 오해하고, `c`가 빠지면 유입 계측이 화면
 * 전환 한 번에 끊긴다. 둘 다 "지운 적 없는데 사라진" 증상이라 화면에서는 원인이 보이지 않는다.
 */

import { describe, expect, it } from 'vitest'
import { LEARN_URL_SCREEN, buildIntroUrl, buildResultUrl, buildTabUrl, buildTestUrl, entryPath, isLearnScreen } from './entryUrl'

/** 앱 진입(bridge·app)과 공유 링크 진입(c)이 한꺼번에 들어 있는 최악의 조합 */
const ENTRY = '?bridge=1&app=1.0&c=kko_share'

const paramsOf = (query: string) => new URLSearchParams(query)

describe('buildTestUrl — 문항 진행 화면', () => {
  it('화면·정의 버전·세트·세션을 얹는다', () => {
    const next = paramsOf(
      buildTestUrl('?c=kko_share', { testVersion: 'gn-2026.08.1', voiceSet: 7, sessionId: 's_1' }),
    )

    expect(next.get('screen')).toBe('test')
    expect(next.get('testVersion')).toBe('gn-2026.08.1')
    // 세트가 빠지면 다음 문서의 문항 화면이 세트 1을 받아 제출이 전부 422다 (KAN-205)
    expect(next.get('voiceSet')).toBe('7')
    expect(next.get('sessionId')).toBe('s_1')
  })

  it('기존 진입 파라미터는 그대로 남는다', () => {
    const next = paramsOf(
      buildTestUrl(ENTRY, { testVersion: 'gn-2026.08.1', voiceSet: 1, sessionId: 's_1' }),
    )

    expect(next.get('bridge')).toBe('1')
    expect(next.get('app')).toBe('1.0')
    expect(next.get('c')).toBe('kko_share')
  })
})

describe('buildResultUrl — 결과 화면', () => {
  it('화면과 세션을 얹고 정의 버전과 세트는 지운다', () => {
    const next = paramsOf(
      buildResultUrl(`${ENTRY}&screen=test&testVersion=gn-2026.08.1&voiceSet=7`, 's_1'),
    )

    expect(next.get('screen')).toBe('result')
    expect(next.get('sessionId')).toBe('s_1')
    expect(next.get('testVersion')).toBeNull()
    expect(next.get('voiceSet')).toBeNull()
  })

  it('기존 진입 파라미터는 그대로 남는다', () => {
    const next = paramsOf(buildResultUrl(ENTRY, 's_1'))

    expect(next.get('bridge')).toBe('1')
    expect(next.get('app')).toBe('1.0')
    expect(next.get('c')).toBe('kko_share')
  })
})

describe('buildIntroUrl — 인트로 복귀', () => {
  it('화면 지정만 걷어낸다', () => {
    const next = paramsOf(buildIntroUrl(`${ENTRY}&screen=result&sessionId=s_1&testVersion=gn-2026.08.1`))

    expect(next.get('screen')).toBeNull()
    expect(next.get('sessionId')).toBeNull()
    expect(next.get('testVersion')).toBeNull()
    expect(next.get('bridge')).toBe('1')
    expect(next.get('app')).toBe('1.0')
    expect(next.get('c')).toBe('kko_share')
  })

  it('남을 파라미터가 없으면 물음표도 붙이지 않는다', () => {
    expect(buildIntroUrl('?screen=result&sessionId=s_1')).toBe('')
  })
})

describe('buildTabUrl — 하단 탭 화면 (KAN-252)', () => {
  it.each([
    ['home', 'home'],
    ['learn', LEARN_URL_SCREEN],
    ['translate', 'translate'],
  ] as const)('화면을 %s로 두고 레벨테스트 값만 지운다 — 앱 표식(bridge·app)과 유입 코드는 남는다', (tab, screen) => {
    const next = paramsOf(buildTabUrl(`${ENTRY}&screen=result&sessionId=s_1&testVersion=gn-2026.08.1&voiceSet=3`, tab))

    expect(next.get('screen')).toBe(screen)
    expect(next.get('sessionId')).toBeNull()
    expect(next.get('testVersion')).toBeNull()
    expect(next.get('voiceSet')).toBeNull()
    expect(next.get('bridge')).toBe('1')
    expect(next.get('app')).toBe('1.0')
    expect(next.get('c')).toBe('kko_share')
  })

  it('빈 쿼리에서도 화면 지정 하나는 남는다', () => {
    expect(buildTabUrl('', 'translate')).toBe('?screen=translate')
  })

  it('광고 동의 재열기 플래그(adConsent)는 지운다 — 탭을 옮겨도 따라가지 않는다 (KAN-315)', () => {
    const next = paramsOf(buildTabUrl(`${ENTRY}&screen=home&adConsent=open`, 'learn'))

    expect(next.get('adConsent')).toBeNull()
    expect(next.get('bridge')).toBe('1')
    expect(next.get('c')).toBe('kko_share')
    expect(buildIntroUrl('?screen=home&adConsent=open')).toBe('')
  })

  it('URL에 남은 resume은 어느 탭 이동에서든 지운다 — 이어가기는 URL에 싣지 않는다 (KAN-347 3-6)', () => {
    expect(paramsOf(buildTabUrl(`${ENTRY}&resume=1`, 'learn')).get('resume')).toBeNull()
    expect(paramsOf(buildTabUrl(`${ENTRY}&resume=1`, 'home')).get('resume')).toBeNull()
    expect(buildIntroUrl('?screen=intonation&resume=1')).toBe('')
  })
})

describe('학습 탭 화면 값 (KAN-347 3-1, 확정된 결정 2026-11-16)', () => {
  it('새 값 learn과 옛 값 intonation·words를 모두 학습 탭으로 받는다', () => {
    for (const screen of ['learn', 'intonation', 'words']) expect(isLearnScreen(screen)).toBe(true)
    for (const screen of ['home', 'translate', 'test', 'result', null, '']) expect(isLearnScreen(screen)).toBe(false)
  })

  /*
   * 스토어 옛 앱 빌드(origin/Release b636648)가 웹의 현재 URL `screen`으로 정하는 표를 그대로 옮겼다:
   * - Android `WebConfig.kt` `BACK_TO_HOME_SCREENS`, iOS `WebConfig.swift` `backToHomeScreens` — 뒤로가기를 홈으로 돌리는 값.
   *   밖의 값이면 Android는 앱을 닫고 iOS는 왼쪽 스와이프를 무시한다. 광고 설정 행(`webAdConsentUrl`)도 이 표 + home이다.
   * - `showsSettingsGear` — screen이 없거나 test일 때만 톱니를 세운다(탭 바 화면에 톱니가 겹치면 안 된다).
   * 웹이 탭 이동으로 내보내는 URL은 전부 이 표 안이어야 한다. 학습 탭을 `learn`으로 실으면 여기서 깨진다.
   */
  const OLD_BUILD_BACK_TO_HOME = ['intonation', 'words', 'translate']
  const oldBuildShowsGear = (screen: string | null) => screen === null || screen === 'test'

  it.each(['learn', 'home', 'translate'] as const)('%s 탭 URL은 옛 빌드의 뒤로가기·광고 설정 표 안이고 톱니를 세우지 않는다', (tab) => {
    const screen = paramsOf(buildTabUrl(`${ENTRY}&screen=home`, tab)).get('screen')
    expect(screen === 'home' || OLD_BUILD_BACK_TO_HOME.includes(screen!)).toBe(true)
    expect(oldBuildShowsGear(screen)).toBe(false)
    // 옛 빌드의 억양 녹음 ✕(`webTabUrl(..., "intonation")`)가 여는 값도 학습 탭이다
    expect(isLearnScreen('intonation')).toBe(true)
  })
})

describe('entryPath - 다음 URL의 경로 (KAN-346)', () => {
  it('브라우저가 루트에 있으면 /test로 옮긴다', () => {
    // 배포된 사이트의 쿼리 없는 /는 사투리 이야기 목록이다. 옛 결과 주소에서 인트로로 돌아갈 때 목록이 뜨면 안 된다
    expect(entryPath('/', '?screen=result&sessionId=s_1')).toBe('/test')
    expect(entryPath('/', '')).toBe('/test')
    expect(entryPath('/', '?c=kko_share')).toBe('/test')
  })

  it('앱은 루트 그대로 둔다', () => {
    // bridge가 붙은 루트에는 SPA가 나가고, 네이티브가 지금 URL에서 다음 URL을 만든다
    expect(entryPath('/', '?bridge=2&app=1.0&screen=home')).toBe('/')
  })

  it('루트가 아닌 경로는 그대로 둔다', () => {
    expect(entryPath('/t', '?c=kko_share')).toBe('/t')
    expect(entryPath('/test', '')).toBe('/test')
  })
})
