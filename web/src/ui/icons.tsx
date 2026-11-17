/**
 * 화면이 쓰는 선화 아이콘 (KAN-161 3단계).
 *
 * ## 이모지가 아니라 SVG인 이유
 *
 * 이모지(✓·🎤·📝)는 **시스템이 자기 색으로 그린다.** 잉크 한 색으로 접은 화면에서 그것만
 * 색을 갖고, 안드로이드·iOS·데스크톱이 저마다 다른 그림을 준다 — 같은 화면이 기기마다 다른
 * 그림이 되는 셈이라 시안을 맞출 수가 없다. 여기 있는 것은 전부 잉크 선 하나로 그린 도형이다.
 *
 * ## 색을 받지 않는다
 *
 * 전부 `currentColor`다. 크림 버튼 안에서는 크림으로, 잉크 글자 옆에서는 잉크로 그려진다 —
 * 아이콘마다 색을 인자로 받으면 부르는 자리가 색을 알아야 하고, 그 자리가 팔레트 바깥의
 * 값을 적기 시작하는 첫 걸음이 된다.
 *
 * 전부 `aria-hidden`이다. 아이콘 옆에는 항상 같은 뜻의 글자가 있고(버튼 라벨, 선택지 문구),
 * 그림까지 읽히면 스크린 리더가 같은 말을 두 번 한다.
 */

/** 고른 선택지의 표시. 잉크 20px — 선택지 오른쪽 끝에 선다 (아트보드 `Vocab.dc.html`) */
export function CheckIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 10.5 L8 14.5 L16 5.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 오답 표시 (KAN-255 W-4). 정답의 ✓와 **모양이 달라야** 색 없이도 정오가 읽힌다 (NFR-US-03) —
 * 같은 ✓에 색만 바꾸면 흑백·색각 이상에서 두 표시가 같아진다. 크기·획은 [CheckIcon]과 맞춘다.
 */
export function CrossIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/**
 * 끝난 단계의 표시. 24px 잉크 원 **안에** 들어가므로 획이 더 굵고(3) 크기가 작다(12) —
 * 같은 ✓를 그냥 줄이면 원 안에서 선이 실처럼 얇아져 무엇인지 안 보인다.
 */
export function CheckSmallIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 10.5 L8 14.5 L16 5.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** 공유. 위로 나가는 화살표 + 담는 상자 — 잉크 주버튼 안이라 크림 선으로 그려진다 */
export function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 12 L10 3 M6.5 6.5 L10 3 L13.5 6.5 M4 10 L4 16 L16 16 L16 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 번역 방향 바꾸기 (KAN-317). 서로 반대로 가는 가로 화살표 둘(⇄)이고, 모양은 KAN-311 v11 아이콘 세트를
 * 참고했다. 아이콘만으로는 뜻이 약해 버튼 안에서 지금 방향 글자와 함께 선다. 획은 [ShareIcon]과 맞춘다.
 */
export function SwapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3 7 L16 7 M13 4 L16 7 L13 10 M17 13 L4 13 M7 10 L4 13 L7 16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 마이크 선화. 히어로 아이콘(지름 112 크림 원) 안에 서는 크기라 56px이다.
 *
 * 면이 아니라 선인 이유는 녹음 버튼과 같다 (정본 §8): 크림 위의 잉크 면은 주 버튼과 무게가
 * 같아져 "눌러야 하는 것"으로 읽힌다. 이 그림은 화면이 무엇에 대한 것인지 말할 뿐이다.
 */
export function MicIcon({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M24 6 C20.7 6 18 8.7 18 12 L18 24 C18 27.3 20.7 30 24 30 C27.3 30 30 27.3 30 24 L30 12 C30 8.7 27.3 6 24 6 Z M12 22 L12 24 C12 30.6 17.4 36 24 36 C30.6 36 36 30.6 36 24 L36 22 M24 36 L24 42 M17 42 L31 42"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 선 아이콘 한 벌 (KAN-347 1단계, 시안 v11 아이콘 세트). viewBox 24, 획 1.5. 예외 화면 아이콘 원(112) 안에서는 CSS가
 * 56으로 키우고(`.exception__icon svg`), 버튼 안에서는 20으로 선다.
 */
function LineIcon({ d, size = 20, fill = 'none' }: { d: string; size?: number; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

/** 시계 — 불러오는 중 (s-14-learning-loading) */
export function ClockIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l4 2" />
}

/** 사람 — 로그인 안내 (s-20) */
export function UserIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-2a8 6 0 0 1 16 0v2" />
}

/**
 * 자물쇠 — 게스트 안내 (s-20b-learning-guest), 잠긴 코스 칩 (s-11). 몸통과 고리를 따로 그린다 — 코스가 열릴 때 고리만
 * 들려 돌아간다(움직임 타일 5, `.lock__shackle`). 모양은 한 획으로 그리던 때와 같다
 */
export function LockIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="lock"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path className="lock__body" d="M6 10h12v11H6ZM12 14v3" />
      <path className="lock__shackle" d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

/** 끊긴 구름 — 목록 오류 (s-21) */
export function CloudOffIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M3 3l18 18M5 16a4 4 0 0 1-1-8m4-3a7 7 0 0 1 12 5 4 4 0 0 1 1 7M8 18h7" />
}

/** 다시 시도 — 돌아가는 화살표 둘 */
export function RefreshIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5" />
}

/*
 * 2~7단계 화면이 쓸 선 아이콘 (KAN-347 1단계 보강). 모양은 시안 `screens/*.html`의 SVG 그대로이고 규격은 위 5종과 같다
 * (viewBox 24, 획 1.5, aria-hidden). 위쪽의 `CheckIcon`·`CrossIcon`·`ShareIcon`·`SwapIcon`·`MicIcon`은 옛 그림(viewBox 20·48,
 * 굵은 획)이라 지금 쓰는 자리를 위해 남기고, 새 화면은 아래 `*LineIcon`을 쓴다.
 */

/** → 다음 카드·다음 스탬프·이어가기·시작 (시안 `arrow`) */
export function ArrowRightIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M4 12h16m-6-6 6 6-6 6" />
}

/** ← 지도로·결과 목록으로 (s-16, s-08-intonation-detail) */
export function ArrowLeftIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M20 12H4m6-6-6 6 6 6" />
}

/** ↑ 음절 표시 「더 높이기」 (s-19·s-08-intonation-detail) */
export function ArrowUpIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M12 21V3m-6 6 6-6 6 6" />
}

/** ↓ 번역하기 원형 버튼 (s-03), 음절 표시 「낮추기」 */
export function ArrowDownIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M12 3v18m-6-6 6 6 6-6" />
}

/** ⇄ 번역 방향 전환 원형 버튼 (s-03·s-04) */
export function SwapLineIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M3 8h18m-4-4 4 4-4 4M21 16H3m4-4-4 4 4 4" />
}

/** ✓ 제출·완료·정답 꼬리표 (시안 `check`) */
export function CheckLineIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="m5 12 4 4L19 6" />
}

/** ✕ 닫기·오답 꼬리표 (시안 `cross`). 앱바 닫기 ✕는 `CloseButton`의 Material 그림이 따로 있다 */
export function CloseLineIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M6 6l12 12M18 6 6 18" />
}

/** 마이크 — 버튼 안 20 (레벨 테스트 시작·다시 말해 보기). 예외 화면 56은 위 `MicIcon` */
export function MicLineIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM6 11v1a6 6 0 0 0 12 0v-1M12 18v4m-4 0h8" />
}

/** 달력 — 홈 출석 배지 (s-01·s-02) */
export function CalendarIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M4 5h16v16H4ZM4 9h16M8 3v4m8-4v4M8 13h2m4 0h2m-8 4h2" />
}

/** 보내기 — 동의하고 보내기·후기 보내기 (s-10-translator-consent-sheet) */
export function SendIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="m3 11 18-8-8 18-2-8-8-2ZM11 13 21 3" />
}

/** 복사 — 번역 결과 (s-04) */
export function CopyIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M8 8h12v13H8ZM16 8V3H3v13h5" />
}

/** 공유 — 번역 결과 (s-04) */
export function ShareLineIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M12 16V3m-4 4 4-4 4 4M5 12v9h14v-9" />
}

/** 주의 — 입력 오류 한 줄 (s-09-error-input) */
export function WarningIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M12 3 2 21h20L12 3Z M12 9v5 M12 17v.1" />
}

/** 정지 — 녹음 중 (s-06-recording). 선 아이콘 중 유일하게 속을 채운다 — 시안은 녹음 버튼 CSS가 채웠는데, 같은 클래스를 쓰는 마이크까지 채워져 아이콘이 스스로 갖는다 */
export function StopIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M6 6h12v12H6Z" fill="currentColor" />
}

/** › — 다시 연습할 대사 카드·목록 행 (시안 `chevron-right`) */
export function ChevronRightIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="m9 6 6 6-6 6" />
}

/** ‹ — 출석 달력 이전 달 (시안 `chevron-left`) */
export function ChevronLeftIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="m15 6-6 6 6 6" />
}

/** 재녹음 — 녹음 다시 듣기의 [재녹음] (s-06-recording-review `retry`). 다른 [다시 시도]는 `RefreshIcon` */
export function RetryIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M4 9a8 8 0 1 1 0 6M4 4v5h5" />
}

/** 책 — 단어 학습 (시안 s-02-b 출석 상세 행, 탭 바 「단어 학습」과 같은 그림) */
export function WordLineIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M5 4 H17 A2 2 0 0 1 19 6 V20 H7 A2 2 0 0 1 5 18 Z M5 18 A2 2 0 0 1 7 16 H19" />
}

/** 물결 — 억양 학습 (시안 s-02-b 출석 상세 행·s-10 [학습 시작], 탭 바 「억양 학습」과 같은 그림) */
export function ToneLineIcon({ size }: { size?: number }) {
  return <LineIcon size={size} d="M3 14 C6 6 8 6 10 12 S14 18 16 10 S19 8 21 12" />
}
