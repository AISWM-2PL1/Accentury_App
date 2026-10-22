import { useEffect, useState } from 'react'
import App from './App'
import { installAccenturyNavigate, spaNavigate } from './navigation/spaNavigate'

/**
 * SPA 전환의 루트 (KAN-290). URL 쿼리를 상태로 들고 `popstate`(뒤로가기)·`accentury:navigate`([spaNavigate])에 다시
 * 그린다. `key={search}`로 화면마다 `App`을 새로 마운트한다 — 예전 "화면마다 새 문서"처럼 화면 상태·이펙트가 초기화된다.
 */
export function AppRoot() {
  const [search, setSearch] = useState(window.location.search)

  useEffect(() => {
    const sync = () => setSearch(window.location.search)
    window.addEventListener('popstate', sync)
    window.addEventListener('accentury:navigate', sync)
    installAccenturyNavigate(spaNavigate)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('accentury:navigate', sync)
      delete window.accenturyNavigate
    }
  }, [])

  return <App key={search} navigate={spaNavigate} />
}
