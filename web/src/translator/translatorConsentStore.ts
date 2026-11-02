/**
 * 사투리 번역기 Google Gemini 전송 동의의 저장소 (KAN-304). `ads/webAdConsentStore.ts`를 본떠 최소로 둔다.
 *
 * ## 기기별 한 번만 묻는다
 *
 * 애플 요건 ③은 "보내기 전 사용자 허락"이고, 한 번 받은 허락은 유지된다. 그래서 첫 [바꾸기]에서만
 * 시트를 띄우고, 허락을 받은 뒤에는 묻지 않는다. 매번 묻는 안과 입력창 옆 체크박스 안은
 * 2026-11-02 팀장 결정에서 탈락했다.
 *
 * ## 서버가 아니라 localStorage에 둔다
 *
 * 서버를 바꾸지 않고 심사에 회신하기 위해서다. 앱의 광고 동의는 네이티브 저장소가 정본이지만
 * (`webview-bridge.md` §8.1), 번역기는 WebView 전용 화면이라 브리지에 그런 경로가 없다. 그 결과
 * 재설치하거나 다른 기기에서 쓰면 다시 묻는다.
 *
 * 여기 남는 것은 동의 여부(`'granted'`)뿐이다. 입력 문장은 여전히 어디에도 저장하지 않는다(KAN-256 규칙).
 *
 * ## 저장이 막힌 환경은 문서마다 다시 묻는다
 *
 * 쿠키 차단·사생활 모드·쿼터 초과면 setItem이 실패한다. 그때는 메모리 사본으로 이 문서 안에서만
 * 동의가 이어지고, 탭 바로 문서를 다시 열면 또 묻는다. 묻지 않은 채 보내는 일은 없다 — 광고 동의와
 * 같은 방향의 안전한 실패다.
 */

/** 저장 키. 접두어(`accentury:`)는 진행 스냅샷·광고 동의와 같은 규칙이다 */
export const TRANSLATOR_CONSENT_KEY = 'accentury:translatorConsent'

/** 이 모듈이 저장소에 요구하는 두 메서드. 테스트 대역을 가볍게 하려고 `Storage` 전체를 받지 않는다 */
export interface TranslatorConsentStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const NO_STORAGE: TranslatorConsentStorage = {
  getItem: () => null,
  setItem: () => {},
}

/** 쿠키를 막은 브라우저는 `window.localStorage` 접근 자체가 던진다 — [NO_STORAGE]로 접는다 */
function defaultStorage(): TranslatorConsentStorage {
  try {
    return window.localStorage ?? NO_STORAGE
  } catch {
    return NO_STORAGE
  }
}

/** 이 문서에서 동의했는지. 저장이 막힌 환경에서도 이 문서 안에서는 동의가 이어진다 */
let memory = false

/** 동의했으면 true. 저장된 값이 `'granted'`가 아니거나 읽을 수 없으면 false — 곧 "물어야 한다"다 */
export function readTranslatorConsent(storage: TranslatorConsentStorage = defaultStorage()): boolean {
  if (memory) return true
  try {
    return storage.getItem(TRANSLATOR_CONSENT_KEY) === 'granted'
  } catch {
    return false
  }
}

/** 동의를 남긴다. 사본에 먼저 쓰고 저장소를 시도한다 — 저장이 실패해도 이 문서에서는 다시 묻지 않는다 */
export function writeTranslatorConsent(storage: TranslatorConsentStorage = defaultStorage()): void {
  memory = true
  try {
    storage.setItem(TRANSLATOR_CONSENT_KEY, 'granted')
  } catch {
    // 저장소가 막힌 환경. 다음 문서에서 다시 묻는다(헤더 주석)
  }
}

/** 메모리 사본을 비운다. **테스트 전용** — 모듈 변수라 앞 테스트의 동의가 다음 테스트로 샌다 */
export function resetTranslatorConsentMemory(): void {
  memory = false
}
