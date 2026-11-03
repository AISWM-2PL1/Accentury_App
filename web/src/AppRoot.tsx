import { useEffect, useState } from 'react'
import App from './App'
import { installAccenturyNavigate, spaNavigate } from './navigation/spaNavigate'

/**
 * SPA 전환의 루트 (KAN-290). `popstate`(뒤로가기)·`accentury:navigate`([spaNavigate])마다 이동 횟수를 올려 `App`을
 * 새로 마운트한다 — 예전 "화면마다 새 문서"처럼 화면 상태·이펙트가 초기화된다. 키가 쿼리 문자열이 아니라 횟수인 까닭은
 * 같은 URL로의 재이동도 새 화면이어야 해서다: 네이티브 설정 행 재열기(KAN-315, replaceState로 플래그를 걷은 뒤 같은
 * URL이 다시 온다)와 탭 바가 「탭마다 같은 문서를 다시 로드」하는 ux-ui 규칙. 이벤트 없는 replaceState는 재마운트하지 않는다.
 */
export function AppRoot() {
  const [nav, setNav] = useState(0)

  useEffect(() => {
    const sync = () => setNav((n) => n + 1)
    window.addEventListener('popstate', sync)
    window.addEventListener('accentury:navigate', sync)
    installAccenturyNavigate(spaNavigate)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('accentury:navigate', sync)
      delete window.accenturyNavigate
    }
  }, [])

  return <App key={nav} navigate={spaNavigate} />
}
