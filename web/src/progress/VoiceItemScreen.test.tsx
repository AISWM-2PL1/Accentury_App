import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeCapture } from '../audio/testing/fakeCapture'
import type { ItemResult } from '../bridge/itemResult'
import type { RetestControl } from '../result/useRetest'
import { VoiceItemScreen } from './VoiceItemScreen'
import type { VoiceItem } from './testDefinition'

/** 더미 확정본의 음성 문항 모양 그대로 (KAN-102 가이드 곡선 포함) */
function voiceItem(): VoiceItem {
  return {
    itemId: 'v1',
    seq: 1,
    type: 'VOICE',
    prompt: '"밥 뭇나?"를 평소 말투로 읽어 주세요',
    maxDurationMs: 10_000,
    guideF0: { unit: 'semitone', frameIntervalMs: 10, values: [0, 1] },
  }
}

/** 네이티브 브리지가 붙은 앱 환경. 돌려주는 spy가 startVoiceItem 호출을 받는다 */
function stubBridge() {
  const startVoiceItem = vi.fn()
  window.AccenturyBridge = {
    requestMicPermission: vi.fn(),
    startVoiceItem,
    getContractVersion: () => 1,
  }
  return startVoiceItem
}

function renderScreen(
  extra: { retest?: RetestControl; probeSession?: () => Promise<'ALIVE' | 'EXPIRED'> } = {},
) {
  const capture = createFakeCapture()
  const upload = vi.fn(async () => ({ analysisJobId: 'job-1' }))
  const onWebUploaded = vi.fn<(result: ItemResult) => void>()
  render(
    <VoiceItemScreen
      item={voiceItem()}
      itemNumber={1}
      totalItems={10}
      webRecording={{ upload, capture: capture.factory }}
      onWebUploaded={onWebUploaded}
      retest={extra.retest}
      probeSession={extra.probeSession}
    />,
  )
  return { capture, upload, onWebUploaded }
}

afterEach(() => {
  delete window.AccenturyBridge
})

describe('대기 문구 단일화 (KAN-146)', () => {
  it('브리지가 받아준 뒤에도 대기 문구는 중립 문구 하나뿐이다', () => {
    stubBridge()

    renderScreen()

    expect(screen.getByText('잠시만요…')).toBeInTheDocument()
    // 구현 이름을 노출하던 옛 2단계 문구는 어느 쪽도 남지 않는다
    expect(screen.queryByText('녹음 화면을 여는 중…')).not.toBeInTheDocument()
    expect(screen.queryByText('녹음 화면에서 진행 중…')).not.toBeInTheDocument()
  })

  /*
   * 이 티켓의 핵심 회귀 방어선이다. "문구가 두 개"인 것 자체보다, 마운트 직후 브리지 판정이
   * 들어오면서 화면의 글자가 한 번 갈아치워지는 것이 문제였다. 최종 화면만 보는 단언으로는
   * 그 중간 교체를 잡을 수 없으므로, 렌더가 만들어 낸 DOM 변경 기록을 직접 들여다본다.
   * 지워진 텍스트 노드나 덮어써진 글자가 하나라도 있으면 전환 도중 화면이 움직였다는 뜻이다.
   */
  it('브리지 판정 전후로 화면의 글자가 교체되지 않는다', () => {
    stubBridge()
    const observer = new MutationObserver(() => {})
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true,
    })

    renderScreen()

    const replaced: string[] = []
    for (const record of observer.takeRecords()) {
      if (record.type === 'characterData') {
        replaced.push(record.oldValue ?? '')
        continue
      }
      record.removedNodes.forEach((node) => {
        const text = node.textContent?.trim()
        if (text) replaced.push(text)
      })
    }
    observer.disconnect()

    expect(replaced).toEqual([])
  })

  it('브리지가 받아주면 이탈 복구용 재진입 버튼을 남긴다', () => {
    const startVoiceItem = stubBridge()
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: '녹음 화면 다시 열기' }))

    expect(startVoiceItem).toHaveBeenCalledTimes(2)
  })

  it('브리지가 없으면(브라우저 단독) 대기 뷰 대신 녹음 패널이 선다 (KAN-56 Stage 3)', () => {
    renderScreen()

    // 앱 밖에서는 웹이 직접 녹음한다 — 옛 개발용 제출 통로는 사라졌다
    expect(screen.getByRole('button', { name: '녹음' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제출 (개발용)' })).not.toBeInTheDocument()
    expect(screen.queryByText('녹음 화면을 열 수 없어요 (앱 밖에서 실행 중)')).not.toBeInTheDocument()
    // 녹음 패널과 대기 뷰는 배타적이다 — 둘이 겹치면 앱 밖 실행이 "기다리는 중"으로도 보인다
    expect(screen.queryByText('잠시만요…')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '녹음 화면 다시 열기' })).not.toBeInTheDocument()
  })

  it('브리지가 없어도 대사 카드는 그대로다 — 읽을 문장은 녹음 주체와 무관하다', () => {
    renderScreen()

    expect(screen.getByText('"밥 뭇나?"를 평소 말투로 읽어 주세요')).toBeInTheDocument()
    // 카드 아래 따로 있던 지시문이 캡션 한 줄로 합쳐졌다 (KAN-161 3단계)
    expect(screen.getByText('1 / 10 · 이 문장을 읽어주세요')).toBeInTheDocument()
  })
})

/** 재응시 훅이 만드는 값의 대역. 버튼 라벨·잠금은 `RetestAction`이 그대로 그린다 */
function stubRetest(): RetestControl {
  return { onRetest: vi.fn(), disabled: false, pending: false, message: null, retryAfterSec: 0 }
}

describe('앱 대기 푸터의 세션 만료 출구 (KAN-237)', () => {
  it('확인 결과가 만료면 녹음 화면을 다시 열지 않고 [다시 테스트하기]를 세운다', async () => {
    const startVoiceItem = stubBridge()
    const retest = stubRetest()
    const probeSession = vi.fn(async () => 'EXPIRED' as const)
    renderScreen({ retest, probeSession })

    fireEvent.click(screen.getByRole('button', { name: '녹음 화면 다시 열기' }))

    expect(await screen.findByText('세션이 만료되었습니다. 테스트를 다시 시작해 주세요.')).toBeInTheDocument()
    expect(probeSession).toHaveBeenCalledTimes(1)
    // 마운트 때의 1회뿐이다 — 다시 열어 봐야 같은 401이다
    expect(startVoiceItem).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '녹음 화면 다시 열기' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 테스트하기' }))
    expect(retest.onRetest).toHaveBeenCalledTimes(1)
  })

  it('살아 있으면 예전처럼 녹음 화면을 다시 연다', async () => {
    const startVoiceItem = stubBridge()
    renderScreen({ retest: stubRetest(), probeSession: async () => 'ALIVE' })

    fireEvent.click(screen.getByRole('button', { name: '녹음 화면 다시 열기' }))

    // 확인 중에는 잠긴다 — 두 번 눌러 두 번 묻지 않는다
    expect(screen.getByRole('button', { name: '확인 중…' })).toBeDisabled()
    await waitFor(() => expect(startVoiceItem).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('button', { name: '녹음 화면 다시 열기' })).toBeEnabled()
  })

  it('확인 함수가 없으면 곧바로 다시 연다 (기존 동작)', () => {
    const startVoiceItem = stubBridge()
    renderScreen({ retest: stubRetest() })

    fireEvent.click(screen.getByRole('button', { name: '녹음 화면 다시 열기' }))

    expect(startVoiceItem).toHaveBeenCalledTimes(2)
  })

  it('만료여도 재응시 수단이 없는 호출자에게는 죽은 출구 대신 기존 버튼을 남긴다', async () => {
    const startVoiceItem = stubBridge()
    renderScreen({ probeSession: async () => 'EXPIRED' })

    fireEvent.click(screen.getByRole('button', { name: '녹음 화면 다시 열기' }))

    expect(await screen.findByRole('button', { name: '녹음 화면 다시 열기' })).toBeEnabled()
    expect(screen.queryByText('세션이 만료되었습니다. 테스트를 다시 시작해 주세요.')).not.toBeInTheDocument()
    expect(startVoiceItem).toHaveBeenCalledTimes(1)
  })
})
