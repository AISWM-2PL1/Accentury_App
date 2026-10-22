import { notifyLocationChanged, supportsSpaNavigation } from '../bridge/bridge'

declare global {
  interface Window {
    /** 네이티브가 문서 로드 대신 부르는 화면 전환 진입점 (KAN-290). 루트가 마운트된 뒤에만 있다 */
    accenturyNavigate?: (url: string) => boolean
  }
}

/**
 * 문서를 옮긴다 — SPA 전환을 못 하는 실행(구버전 앱)의 폴백이자 `App`의 기본 `navigate`. `replace`는 히스토리의
 * 지금 항목을 덮어쓴다 (`App.tsx`의 `goToResult` 주석).
 */
export function assignHref(url: string, options?: { replace?: boolean }): void {
  if (options?.replace === true) {
    window.location.replace(url)
    return
  }
  window.location.href = url
}

/**
 * 화면 전환 (KAN-290). 문서를 다시 로드하지 않고 히스토리만 바꾼 뒤 네이티브에 새 URL을 알리고, `AppRoot`가
 * `accentury:navigate`를 듣고 다시 그린다. 구버전 앱(브리지에 `onLocationChanged` 없음)은 [assignHref]로 문서를 옮긴다.
 */
export function spaNavigate(url: string, options?: { replace?: boolean }): void {
  if (!supportsSpaNavigation()) {
    assignHref(url, options)
    return
  }
  if (options?.replace === true) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  notifyLocationChanged(window.location.href)
  window.dispatchEvent(new Event('accentury:navigate'))
}

/** 네이티브가 부를 `window.accenturyNavigate`를 심는다. 항상 true — 받았다는 회신이다(없으면 네이티브는 문서 로드로 폴백) */
export function installAccenturyNavigate(navigate: (url: string) => void): void {
  window.accenturyNavigate = (url) => {
    navigate(String(url))
    return true
  }
}
