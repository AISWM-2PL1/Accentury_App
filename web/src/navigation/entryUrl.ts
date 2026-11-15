/**
 * 진입 쿼리 조립 (KAN-31 Stage 1). 화면을 옮길 때 다음 URL의 **쿼리 부분**을 만든다.
 *
 * ## 왜 순수 함수로 떼어냈나
 *
 * 이동 자체(`window.location.href` 대입)는 jsdom이 구현하지 않아 테스트에서 확인할 수 없다.
 * 확인하고 싶은 것은 이동이 아니라 **어떤 파라미터가 남고 어떤 것이 지워지는가**라, 그 규칙만
 * 문자열 → 문자열 함수로 꺼내면 이동 지점을 가로채지 않고도 그대로 검사할 수 있다.
 *
 * ## 남기는 규칙이 하나뿐인 이유
 *
 * 세 함수 모두 **자기가 손대는 파라미터 말고는 전부 그대로 둔다**. 앱이 실어 보낸
 * `bridge`·`app`이 빠지면 스큐 판정(§5)이 구버전 앱으로 보고 업데이트 안내를 띄우고,
 * 공유 링크의 `c`가 빠지면 유입 계측이 화면 전환 한 번에 끊긴다. 어느 쪽이든 "지운 적 없는데
 * 사라진" 값이라, 지울 것만 이름으로 지우는 편이 안전하다.
 *
 * 경로(`window.location.pathname`)는 여기서 다루지 않는다. 웹 단독 진입 경로가 `/t`라
 * 이동할 때마다 경로가 유지돼야 하는데, 그건 호출자가 지금 있는 경로를 그대로 붙이면 되는
 * 일이고 이 규칙과 섞을 이유가 없다.
 */

/**
 * 문항 진행 화면 (`?screen=test&testVersion=...&voiceSet=...&sessionId=...`).
 *
 * `voiceSet`을 함께 싣는 이유는 문항 조회가 그 값을 필요로 해서다 (KAN-205). 서버가 세션마다
 * 세트를 고르므로 다음 문서의 문항 화면이 세트를 모르면 세트 1을 받아 제출이 전부 422가 된다.
 */
export function buildTestUrl(
  search: string,
  session: { testVersion: string; voiceSet: number; sessionId: string },
): string {
  const params = new URLSearchParams(search)
  params.set('screen', 'test')
  params.set('testVersion', session.testVersion)
  params.set('voiceSet', String(session.voiceSet))
  params.set('sessionId', session.sessionId)
  return toQuery(params)
}

/**
 * 결과 화면 (`?screen=result&sessionId=...`).
 * `testVersion`과 `voiceSet`은 지운다 — 결과 화면이 읽지 않는 값이고, 남겨 두면 이 URL을 다시
 * 연 사람이 끝난 세션의 정의 버전과 세트를 물고 다닌다.
 */
export function buildResultUrl(search: string, sessionId: string): string {
  const params = new URLSearchParams(search)
  params.set('screen', 'result')
  params.set('sessionId', sessionId)
  params.delete('testVersion')
  params.delete('voiceSet')
  return toQuery(params)
}

/**
 * 하단 탭 바의 URL 탭 세 곳 (KAN-252 → KAN-347 3-1). 「단어 학습」「억양 학습」 두 탭이 「학습」 하나(`learn`, 사투리 여행
 * 지도)로 합쳐졌다. [설정]은 네이티브 화면이라 URL이 없다
 */
export type TabScreen = 'learn' | 'home' | 'translate'

/** 학습 탭으로 여는 `screen` 값 — 새 값 `learn`과 옛 값 `intonation`·`words` (확정된 결정 2026-11-16) */
export function isLearnScreen(screen: string | null): boolean {
  return screen === 'learn' || screen === 'intonation' || screen === 'words'
}

/**
 * 웹이 학습 탭으로 옮길 때 URL에 싣는 `screen` 값. 새 값 `learn`이 아니라 **옛 값 `intonation`**이다 (KAN-347 3-1 옛 앱 빌드 호환).
 *
 * 웹은 머지 즉시 배포되고 스토어의 옛 앱 빌드(origin/Release `b636648`)는 그대로다. 옛 빌드는 웹이 알려 준 현재 URL
 * (`onLocationChanged`·문서 로드)의 `screen`으로 세 가지를 정한다 — 뒤로가기를 홈으로 돌릴지(Android `BACK_TO_HOME_SCREENS`,
 * iOS `backToHomeScreens` = intonation·words·translate. 모르는 값이면 Android는 앱을 닫고 iOS는 스와이프를 무시한다), 설정
 * 「맞춤형 광고 설정」 행을 열지(`webAdConsentUrl`, 같은 표), 설정 톱니를 세울지(`showsSettingsGear`, home·test·없음만 본다).
 * `learn`을 실으면 옛 빌드의 학습 탭에서 뒤로가기가 앱 종료가 되고 광고 설정 행이 꺼진다. `intonation`이면 옛 빌드도 새
 * 빌드(KAN-354·355, `learn`과 옛 값을 함께 받는다)도 학습 탭으로 안다.
 *
 * `learn`을 받는 앱 빌드가 스토어에 다 퍼진 뒤 이 값을 `'learn'`으로 바꾼다 — 바꾸는 자리는 이 상수 하나다.
 */
export const LEARN_URL_SCREEN = 'intonation'

/**
 * 탭 화면 (`?screen=home|intonation|translate`, KAN-252). 학습 탭은 [LEARN_URL_SCREEN]으로 싣는다. 학습 화면 안의 이동
 * (코스·스탬프·시도 id)은 URL에 싣지 않는다 — 화면 상태로 한다.
 * 레벨테스트의 `sessionId`·`testVersion`·`voiceSet`은 지운다: 탭 화면은 그 값을 읽지 않고, 남겨 두면 끝난
 * 세션을 물고 다닌다 ([buildResultUrl]과 같은 이유).
 *
 * `resume`(홈 [이어가기], KAN-347 3-6)을 주면 학습 탭이 지도를 거치지 않고 지금 스탬프로 바로 들어간다. 한 번 쓰고 버리는
 * 값이라 다른 탭 이동은 늘 지운다(`adConsent`와 같다).
 */
export function buildTabUrl(search: string, screen: TabScreen, options: { resume?: boolean } = {}): string {
  const params = new URLSearchParams(search)
  params.set('screen', screen === 'learn' ? LEARN_URL_SCREEN : screen)
  params.delete('sessionId')
  params.delete('testVersion')
  params.delete('voiceSet')
  // 광고 동의 재열기 플래그 (KAN-315) — 한 번 쓰고 버린다. 탭을 옮겨도 따라가면 홈에 돌아올 때 시트가 또 뜬다
  params.delete('adConsent')
  params.delete('resume')
  if (options.resume === true && screen === 'learn') params.set('resume', '1')
  return toQuery(params)
}

/** 인트로 — 화면 지정만 걷어낸다 */
export function buildIntroUrl(search: string): string {
  const params = new URLSearchParams(search)
  params.delete('screen')
  params.delete('sessionId')
  params.delete('testVersion')
  params.delete('voiceSet')
  params.delete('adConsent')
  params.delete('resume')
  return toQuery(params)
}

/** 테스트 화면(SPA)의 정식 주소 (KAN-346). 배포된 사이트의 루트(`/`)는 사투리 이야기 목록이다 */
export const TEST_PATH = '/test'

/**
 * 다음 URL의 **경로 부분**. 지금 경로를 그대로 쓰되, 브라우저가 루트에 있으면 [TEST_PATH]로 옮긴다 (KAN-346).
 *
 * 배포된 사이트에서 쿼리 없는 `/`는 SPA가 아니라 사투리 이야기 목록이다 (서버 레포의 CloudFront Function).
 * 그래서 옛 루트 주소(`/?screen=result&sessionId=...`)로 들어온 사람이 [다시 테스트하기]를 눌러
 * `/`로 가면 인트로 대신 글 목록이 뜬다. 화면을 옮길 때마다 `/test`로 옮겨 두면 그 길이 없다.
 *
 * 앱(쿼리에 `bridge`)은 루트 그대로 둔다. Function이 `bridge`가 붙은 루트에 SPA를 내주고, 네이티브가
 * 지금 URL에서 다음 URL을 만들기 때문에 경로를 바꾸지 않는 편이 안전하다.
 */
export function entryPath(pathname: string, search: string): string {
  if (pathname === '/' && !new URLSearchParams(search).has('bridge')) return TEST_PATH
  return pathname
}

/** 남은 파라미터가 없으면 물음표도 붙이지 않는다 — `/t?`로 끝나는 주소를 만들지 않기 위해서다 */
function toQuery(params: URLSearchParams): string {
  const query = params.toString()
  return query === '' ? '' : `?${query}`
}
