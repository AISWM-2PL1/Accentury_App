import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REQUIRED_BRIDGE_VERSION } from '../bridge/bridge'
import type { RegionCode } from './regions'
import { RegionSelectScreen } from './RegionSelectScreen'

/** 칩 이름표 순서 = 계약 표 `REGIONS` 순서 (시안 s-13 칩 순서). DOM 순서가 곧 방향키·Tab 순서다 */
const CHIP_LABELS = ['서울', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']

const TITLE = '어느 지역 말씨가 몸에 배어 있나요?'

afterEach(() => {
  delete window.AccenturyBridge
})

function renderScreen() {
  const onDone = vi.fn<(region: RegionCode) => void>()
  const view = render(<RegionSelectScreen onDone={onDone} />)
  return { onDone, ...view }
}

describe('RegionSelectScreen — 제목과 지도 (KAN-347 7단계)', () => {
  it('제목은 「어느 지역 말씨가 몸에 배어 있나요?」(26 .type-headline)이고 부제가 기준을 밝힌다', () => {
    renderScreen()

    const title = screen.getByRole('heading', { level: 1, name: TITLE })
    expect(title).toHaveClass('type-headline')
    expect(screen.getByText('본인이 쓴다고 생각하는 억양의 지역을 골라 주세요')).toBeInTheDocument()
    expect(screen.getByText('이 정보는 억양 분석 모델을 다듬는 데만 써요')).toBeInTheDocument()
  })

  it('지도 위 칩 10개가 하나의 라디오 그룹이고 그룹 이름은 제목이다. 처음에는 아무것도 골라져 있지 않다', () => {
    renderScreen()

    const group = screen.getByRole('radiogroup', { name: TITLE })
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(10)
    radios.forEach((radio) => expect(group).toContainElement(radio))
    expect(radios.map((radio) => (radio as HTMLInputElement).labels?.[0]?.textContent)).toEqual(CHIP_LABELS)
    // 같은 name의 네이티브 라디오 — 방향키 이동과 「고른 칩만 Tab 순서」를 브라우저가 준다 (E2E smoke가 실제 키로 확인)
    expect(new Set(radios.map((radio) => (radio as HTMLInputElement).name))).toEqual(new Set(['region']))
    expect(radios.filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(0)
  })

  it('광역시 포함 표기가 칩의 스크린 리더 이름에 들어간다', () => {
    renderScreen()

    expect(screen.getByRole('radio', { name: '경남, 부산·울산 포함' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '경기, 인천 포함' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '충남, 대전 포함' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '전남, 광주 포함' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '경북, 대구 포함' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '서울' })).toBeInTheDocument()
  })

  it('지도에 「행정구역 경계: 통계청 SGIS(2013)」가 보인다', () => {
    renderScreen()

    expect(screen.getByText('행정구역 경계: 통계청 SGIS(2013)')).toBeInTheDocument()
  })

  it('칩을 고르면 그 지역 면이 칠해지고(경남은 부산·울산까지) 아래에 지역 설명 한 줄이 뜬다', () => {
    const { container } = renderScreen()

    expect(screen.getByRole('status')).toHaveTextContent('지도에서 지역을 눌러 주세요')
    fireEvent.click(screen.getByRole('radio', { name: '경남, 부산·울산 포함' }))

    expect(screen.getByRole('status')).toHaveTextContent('경남 · 부산·울산 포함')
    const painted = [...container.querySelectorAll('.region-map__geography path.is-selected')]
    expect(painted).toHaveLength(3)
    painted.forEach((path) => expect(path).toHaveAttribute('data-region', 'GYEONGNAM'))

    fireEvent.click(screen.getByRole('radio', { name: '제주' }))
    expect(screen.getByRole('status')).toHaveTextContent('제주')
    expect(container.querySelectorAll('.region-map__geography path.is-selected')).toHaveLength(1)
  })

  it('지도 면을 눌러도 그 지역 칩이 골라진다', () => {
    const { container } = renderScreen()

    fireEvent.click(container.querySelector('.region-map__geography path[data-region="GANGWON"]')!)
    expect(screen.getByRole('radio', { name: '강원' })).toBeChecked()
  })
})

describe('RegionSelectScreen — [다음]', () => {
  it('고르기 전에는 잠겨 있고 눌러도 아무 일도 없다 — 건너뛰기가 없다', () => {
    const { onDone } = renderScreen()

    const next = screen.getByRole('button', { name: '다음' })
    expect(next).toBeDisabled()
    fireEvent.click(next)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('하나를 고르면 열리고, 누르면 그 코드로 한 번 알린다', () => {
    const { onDone } = renderScreen()

    fireEvent.click(screen.getByRole('radio', { name: '제주' }))
    const next = screen.getByRole('button', { name: '다음' })
    expect(next).toBeEnabled()
    expect(screen.getByRole('radio', { name: '제주' })).toBeChecked()

    fireEvent.click(next)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith('JEJU')
  })

  it('다시 고르면 마지막 선택으로 알린다 — 고르기와 확정은 다른 동작이다', () => {
    const { onDone } = renderScreen()

    fireEvent.click(screen.getByRole('radio', { name: '서울' }))
    fireEvent.click(screen.getByRole('radio', { name: /^경남/ }))
    expect(screen.getByRole('radio', { name: '서울' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /^경남/ })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onDone).toHaveBeenCalledWith('GYEONGNAM')
  })
})

describe('RegionSelectScreen — 햅틱 (KAN-258)', () => {
  it('지역을 고르면 탭 햅틱을 요청한다 — 어휘 문항 선택과 같은 규칙', () => {
    const vibrate = vi.fn()
    window.AccenturyBridge = {
      requestMicPermission: vi.fn(),
      startVoiceItem: vi.fn(),
      getContractVersion: () => REQUIRED_BRIDGE_VERSION,
      haptic: vibrate,
    }
    renderScreen()

    fireEvent.click(screen.getByRole('radio', { name: '제주' }))
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledWith('tap')
  })
})
