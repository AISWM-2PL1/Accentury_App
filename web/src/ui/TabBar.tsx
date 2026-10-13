/**
 * 하단 탭 바 (KAN-252, 2026-10-13 사용자 결정). 홈 · 억양 학습 · 단어 학습 · 사투리 번역기 · 설정 다섯 칸.
 *
 * 어느 화면에 세울지는 부르는 쪽이 정한다 — 앱 안(standalone 아님)의 목록 화면에서만 선다. 진행 중 화면
 * (테스트·학습 카드·녹음·퀴즈·완료)에는 이탈 버튼을 두지 않는다는 규칙(KAN-147)을 이 컴포넌트가 알 수 없어서다.
 *
 * 탭 이동은 [onSelect]에 맡긴다. App이 같은 문서를 다시 로드해 넘기고(`go*` 헬퍼), 쿼리의 앱 표식은
 * `navigation/entryUrl`의 [buildTabUrl]이 지킨다. [설정]만 URL이 없다 — 네이티브의 기존 설정 화면이라
 * 브리지로 연다. 그 메서드를 모르는 앱(구버전)에서는 탭을 아예 그리지 않는다: 누르면 아무 일도 없는 탭보다 낫다.
 *
 * 아이콘은 `ui/icons`와 같은 규칙(잉크 선 하나, `currentColor`, `aria-hidden`)이다. 라벨이 늘 옆에 있어서
 * 그림이 읽힐 필요가 없다.
 */

import type { ReactNode } from 'react'
import { canOpenSettings, openSettings } from '../bridge/bridge'
import type { TabScreen } from '../navigation/entryUrl'

const TABS: { id: TabScreen; label: string; icon: ReactNode }[] = [
  { id: 'home', label: '홈', icon: <path d="M4 11 L12 4 L20 11 V20 H14 V14 H10 V20 H4 Z" /> },
  { id: 'intonation', label: '억양 학습', icon: <path d="M3 14 C6 6 8 6 10 12 S14 18 16 10 S19 8 21 12" /> },
  { id: 'words', label: '단어 학습', icon: <path d="M5 4 H17 A2 2 0 0 1 19 6 V20 H7 A2 2 0 0 1 5 18 Z M5 18 A2 2 0 0 1 7 16 H19" /> },
  { id: 'translate', label: '사투리 번역기', icon: <path d="M4 5 H16 V13 H9 L5 16 V13 H4 Z M18 9 H20 V17 H19 V20 L15 17 H10 V15" /> },
]

const SETTINGS_ICON = (
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3 V6 M12 18 V21 M3 12 H6 M18 12 H21 M5.6 5.6 L7.8 7.8 M16.2 16.2 L18.4 18.4 M5.6 18.4 L7.8 16.2 M16.2 7.8 L18.4 5.6" />
  </>
)

export interface TabBarProps {
  /** 지금 화면의 탭. 없으면(결과 화면) 어느 탭도 강조하지 않는다 */
  current?: TabScreen
  onSelect: (tab: TabScreen) => void
}

export function TabBar({ current, onSelect }: TabBarProps) {
  return (
    <nav className="tab-bar" aria-label="주 메뉴">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="tab-bar__item"
          aria-current={tab.id === current ? 'page' : undefined}
          onClick={() => onSelect(tab.id)}
        >
          <TabIcon>{tab.icon}</TabIcon>
          <span className="tab-bar__label">{tab.label}</span>
        </button>
      ))}
      {canOpenSettings() && (
        <button type="button" className="tab-bar__item" onClick={() => openSettings()}>
          <TabIcon>{SETTINGS_ICON}</TabIcon>
          <span className="tab-bar__label">설정</span>
        </button>
      )}
    </nav>
  )
}

function TabIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}
