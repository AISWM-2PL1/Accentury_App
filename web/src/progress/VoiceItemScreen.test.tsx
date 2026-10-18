import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeCapture } from '../audio/testing/fakeCapture'
import type { ItemResult } from '../bridge/itemResult'
import type { RetestControl } from '../result/useRetest'
import { VoiceItemScreen } from './VoiceItemScreen'
import type { VoiceItem } from './testDefinition'

/** 더미 확정본의 음성 문항 모양 그대로 (KAN-102 가이드 곡선 포함) */
function voiceItem(extra: Partial<VoiceItem> = {}): VoiceItem {
  return {
    itemId: 'v1',
    seq: 1,
    type: 'VOICE',
    prompt: '"밥 뭇나?"를 평소 말투로 읽어 주세요',
    maxDurationMs: 10_000,
    guideF0: { unit: 'semitone', frameIntervalMs: 10, values: [0, 1] },
    ...extra,
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
  extra: {
    retest?: RetestControl
    probeSession?: () => Promise<'ALIVE' | 'EXPIRED'>
    item?: VoiceItem
  } = {},
) {
  const capture = createFakeCapture()
  const upload = vi.fn(async () => ({ analysisJobId: 'job-1' }))
  const onWebUploaded = vi.fn<(result: ItemResult) => void>()
  const { unmount } = render(
    <VoiceItemScreen
      item={extra.item ?? voiceItem()}
      itemNumber={1}
      totalItems={7}
      webRecording={{ upload, capture: capture.factory }}
      onWebUploaded={onWebUploaded}
      retest={extra.retest}
      probeSession={extra.probeSession}
    />,
  )
  return { capture, upload, onWebUploaded, unmount }
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
    expect(screen.getByText('1 / 7 · 이 문장을 읽어주세요')).toBeInTheDocument()
  })
})

/** 재응시 훅이 만드는 값의 대역. 버튼 라벨·잠금은 `RetestAction`이 그대로 그린다 */
function stubRetest(): RetestControl {
  return { onRetest: vi.fn(), disabled: false, pending: false, message: null, retryAfterSec: 0, adGated: false }
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

  it('확인을 기다리는 사이 화면이 사라지면 응답이 와도 녹음 화면을 다시 열지 않는다', async () => {
    // 기다리는 사이 네이티브 결과가 와서 다음 문항으로 넘어간 경우 — 지난 문항을 다시 열면 안 된다
    const startVoiceItem = stubBridge()
    let resolveProbe!: (verdict: 'ALIVE' | 'EXPIRED') => void
    const probeSession = () =>
      new Promise<'ALIVE' | 'EXPIRED'>((resolve) => {
        resolveProbe = resolve
      })
    const { unmount } = renderScreen({ retest: stubRetest(), probeSession })

    fireEvent.click(screen.getByRole('button', { name: '녹음 화면 다시 열기' }))
    unmount()
    await act(async () => resolveProbe('ALIVE'))

    // 마운트 때의 1회뿐이다
    expect(startVoiceItem).toHaveBeenCalledTimes(1)
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

describe('말투 감정 전달 (KAN-283)', () => {
  it('정의에 emotion이 있으면 가공 없이 페이로드에 싣는다', () => {
    const startVoiceItem = stubBridge()
    renderScreen({ item: voiceItem({ emotion: '부탁하는' }) })

    expect(JSON.parse(startVoiceItem.mock.calls[0][0]).emotion).toBe('부탁하는')
  })

  it('빈 문자열도 그대로 넘긴다 — 표시 여부 판정은 네이티브 몫', () => {
    const startVoiceItem = stubBridge()
    renderScreen({ item: voiceItem({ emotion: '' }) })

    const payload = JSON.parse(startVoiceItem.mock.calls[0][0])
    expect('emotion' in payload).toBe(true)
    expect(payload.emotion).toBe('')
  })

  it('정의에 emotion이 없으면 키 자체를 보내지 않는다 (KAN-282 전 정의와 같은 페이로드)', () => {
    const startVoiceItem = stubBridge()
    renderScreen()

    expect('emotion' in JSON.parse(startVoiceItem.mock.calls[0][0])).toBe(false)
  })
})

describe('대기 푸터의 전송 실패 · [다시 보내기] (KAN-288 6단계)', () => {
  /** 재전송을 아는 앱. 돌려주는 spy가 retryUpload 호출을 받는다 */
  function stubRetryBridge() {
    stubBridge()
    const retryUpload = vi.fn()
    window.AccenturyBridge = { ...window.AccenturyBridge!, retryUpload }
    return retryUpload
  }

  function failUpload(itemId: string, attemptId: string) {
    act(() => window.AccenturyWeb?.onUploadFailed?.(JSON.stringify({ itemId, attemptId })))
  }

  it('이 문항의 업로드가 실패하면 대기 문구 대신 「! 전송 실패」 줄과 [다시 보내기]를 세운다', () => {
    stubRetryBridge()
    renderScreen()

    failUpload('v1', 'at_1')

    expect(screen.getByRole('status')).toHaveTextContent('!전송 실패')
    expect(screen.getByText('1번 문항')).toBeInTheDocument()
    expect(screen.queryByText('잠시만요…')).not.toBeInTheDocument()
    // 새로 녹음하는 길은 그대로 남는다
    expect(screen.getByRole('button', { name: '녹음 화면 다시 열기' })).toBeInTheDocument()
  })

  it('[다시 보내기]는 받은 attemptId 그대로 브리지를 부르고 대기 문구로 돌아간다 — 녹음 화면은 다시 열지 않는다', () => {
    const retryUpload = stubRetryBridge()
    const startVoiceItem = window.AccenturyBridge!.startVoiceItem as ReturnType<typeof vi.fn>
    renderScreen()
    failUpload('v1', 'at_1')

    fireEvent.click(screen.getByRole('button', { name: '다시 보내기' }))

    expect(retryUpload).toHaveBeenCalledWith('at_1')
    expect(startVoiceItem).toHaveBeenCalledTimes(1)
    expect(screen.getByText('잠시만요…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 보내기' })).not.toBeInTheDocument()

    // 또 실패하면 다시 선다
    failUpload('v1', 'at_1')
    expect(screen.getByRole('button', { name: '다시 보내기' })).toBeInTheDocument()
  })

  it('다른 문항의 실패는 버린다', () => {
    stubRetryBridge()
    renderScreen()

    failUpload('v2', 'at_2')

    expect(screen.queryByRole('button', { name: '다시 보내기' })).not.toBeInTheDocument()
  })

  it('재전송을 모르는 앱(iOS·구버전)에서는 수신 지점을 걸지 않아 예전 화면 그대로다', () => {
    stubBridge()
    renderScreen()

    expect(window.AccenturyWeb?.onUploadFailed).toBeUndefined()
    expect(screen.queryByRole('button', { name: '다시 보내기' })).not.toBeInTheDocument()
    expect(screen.getByText('잠시만요…')).toBeInTheDocument()
  })
})
