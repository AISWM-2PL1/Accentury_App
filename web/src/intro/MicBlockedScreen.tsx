/**
 * 마이크 게이트 실패 안내 (KAN-56 Stage 2).
 *
 * 브라우저에서 녹음을 시작할 수 없을 때 인트로를 대신한다. 화면의 목적은 하나 —
 * **사용자가 다음에 무엇을 하면 되는지** 알려 주는 것이다. 그래서 실패 사유를 그대로 옮기지
 * 않고(그건 콘솔 몫이다) 사유마다 다른 행동을 제시한다.
 *
 * 앱 링크가 주버튼인 이유: 세 사유 중 둘(unsupported·unavailable)은 브라우저 안에서
 * 사용자가 할 수 있는 일이 없거나 확실치 않은데, 앱은 어느 경우에도 확실하게 동작한다.
 * 권한 거부(denied)만 설정으로 되돌릴 수 있어 [다시 시도]를 같이 준다.
 */

import { storeLabelFor, storeListingReady, storeUrlFor, type StorePlatform } from '../audio/storeLink'
import { STORE_PENDING_CAPTION } from '../audio/storeText'
import { Button } from '../ui'
import { MicIcon } from '../ui/icons'

export interface MicBlockedScreenProps {
  reason: 'denied' | 'unavailable' | 'unsupported'
  platform: StorePlatform
  /** 권한을 다시 요청한다. 되돌릴 여지가 없는 `unsupported`에는 주지 않는다 */
  onRetry?: () => void
}

/** 사유별 문구. 비난 없는 톤을 지킨다 — "허용하지 않으셨습니다"가 아니라 무엇이 필요한지 */
const COPY: Record<MicBlockedScreenProps['reason'], { title: string; body: string }> = {
  denied: {
    title: '마이크 권한이 필요해요',
    // 문구는 KAN-347 7단계(시안 s-22). 「휴대폰 설정에서」는 2026-11-05 문구 검토 값이다
    body: '레벨 테스트는 목소리로 진행돼요. 휴대폰 설정에서 마이크를 허용한 뒤 다시 시작해 주세요.',
  },
  unsupported: {
    title: '이 브라우저에서는 녹음을 지원하지 않아요',
    body: '앱에서는 바로 테스트할 수 있어요.',
  },
  unavailable: {
    title: '마이크를 사용할 수 없어요',
    body: '다른 앱이 마이크를 쓰고 있지 않은지 확인해 주세요.',
  },
}

export function MicBlockedScreen({ reason, platform, onRetry }: MicBlockedScreenProps) {
  const copy = COPY[reason]
  const storeLabel = storeLabelFor(platform)
  const listingReady = storeListingReady()

  return (
    <main className="screen">
      {/*
        예외 화면 서식 (KAN-347 1단계, 시안 s-22): 아이콘 원 112 · 원 윗선 y=200 · 제목 Jua 30 · 설명 15 흐린 잉크.
        `.status-block`은 달지 않는다 — iOS 스모크 구동기가 그 이름으로 대기·오류 블록을 가른다(nativeSmokeSelectors).
        하단 버튼은 아래 `.screen__footer`라 전체 너비 그대로다(확정된 결정 2026-11-16). 문구는 7단계에서 바꿨다.

        아이콘은 잉크 선화다 (KAN-161 3단계) — 이모지는 시스템이 자기 색으로 그려 잉크 한 색 화면에 유일한 색조로 남았다.
      */}
      <div className="exception">
        <div className="exception__icon" aria-hidden="true">
          <MicIcon />
        </div>
        <h1 className="exception__title">{copy.title}</h1>
        <p className="exception__detail">{copy.body}</p>
      </div>

      <div className="screen__footer">
        {/*
          버튼이 아니라 <a>인 이유: 스토어로 나가는 것은 이동이라 링크의 기본 동작(새 탭·길게
          눌러 복사·스크린 리더의 "링크" 안내)이 전부 의미를 갖는다. onClick으로 location을
          바꾸면 그게 전부 사라진다. 생김새만 주버튼과 맞춘다.

          **스토어 등록 전에는 그 링크를 세우지 않는다** (사용자 요청 2026-09-15,
          `audio/storeLink.ts`의 [storeListingReady]). 이 화면에서 특히 중요한 이유는 여기
          앱 링크가 부가 정보가 아니라 **주동작**이기 때문이다 — 세 사유 중 둘(unsupported·
          unavailable)은 브라우저 안에서 할 수 있는 일이 없어 이 버튼이 유일한 출구다.
          유일한 출구가 "앱을 찾을 수 없습니다"로 끝나면 화면이 통째로 거짓말이 된다. 그래서
          링크를 없는 곳으로 보내는 대신 흐린 버튼과 사정 한 줄을 남긴다. [다시 시도]는
          그대로 둔다 — 권한 거부는 지금 바로 되돌릴 수 있는 유일한 사유라 스토어와 무관하다.

          `variant`를 주버튼 그대로 두는 것도 결과 화면([AppDownloadAction])과 같은 이유다:
          등록 전후로 배치가 흔들리지 않아야 한다.
        */}
        {listingReady ? (
          <>
            <a className="btn btn--primary" href={storeUrlFor(platform)} style={{ width: '100%' }}>
              앱으로 테스트하기
            </a>
            <p className="type-caption" style={{ color: 'var(--color-muted-foreground)' }}>
              {storeLabel}로 이동해요
            </p>
          </>
        ) : (
          <>
            <Button disabled style={{ width: '100%' }}>
              앱으로 테스트하기
            </Button>
            <p className="type-caption" style={{ color: 'var(--color-muted-foreground)' }}>
              {STORE_PENDING_CAPTION}
            </p>
          </>
        )}
        {onRetry !== undefined && (
          <Button variant="text" onClick={onRetry} style={{ width: '100%' }}>
            다시 시도
          </Button>
        )}
      </div>
    </main>
  )
}
