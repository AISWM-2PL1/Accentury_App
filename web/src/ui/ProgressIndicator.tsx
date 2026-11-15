/**
 * 진척도 (KAN-148, 형태는 KAN-161 2단계 → KAN-347 1단계 알약 칸). 왼쪽 라벨(「단어」「억양」), 오른쪽 「n / N」(13px 흐린 잉크),
 * 아래 알약 칸(높이 8, 간격 6)을 한 덩어리로 묶는다 — 떨어져 있으면 한쪽만 고쳐 숫자와 칸이 어긋나는 날이 온다.
 *
 * 끝난 칸은 벽돌, 지금 칸은 왼쪽 절반만 벽돌, 남은 칸은 종이 그림자색이다(모양은 components.css). 지금 칸을 색이 아니라
 * 반만 찬 모양으로 가르므로 끝난 칸과 색이 같아도 갈린다.
 *
 * `<progress>`를 버린 대가로 role·값 의미론을 손으로 채운다. 값은 progressbar 한 줄로만 읽힌다 — 칸과 위 글자는
 * 눈으로만 읽는다.
 *
 * 값이 1부터 시작하는 건 호출자 몫이자 의도다 — 첫 문항을 0/7로 보이면 아직 시작도
 * 안 한 느낌이라 이탈이 는다 (ux-ui.md §3 Goal-Gradient, endowed progress).
 */

/** 도트 하나의 상태. 스타일은 `data-state`로 CSS가 갖고, 여기서는 이름만 정한다 */
export type ProgressDotState = 'done' | 'current' | 'todo'

export interface ProgressIndicatorProps {
  current: number
  total: number
  label?: string
  /** 숫자 뒤에 붙는 한 마디 (예: `음성` → "2 / 7 · 음성"). 시각 전용이라 읽히지 않는다 */
  note?: string
}

export function ProgressIndicator({
  current,
  total,
  label = '문항 진행률',
  note,
}: ProgressIndicatorProps) {
  return (
    <div className="progress-indicator">
      {/*
        이름과 숫자가 칸 위 한 줄에 선다 (시안 s-07). 둘 다 눈으로만 읽는다 — 값은 아래 progressbar 한 줄이 말한다.
      */}
      <div className="progress-indicator__head" aria-hidden="true">
        <span className="progress-indicator__label">{label}</span>
        <p className="progress-indicator__count">
          {current} / {total}
          {note !== undefined && ` · ${note}`}
        </p>
      </div>
      {/*
        값을 읽는 것은 이 줄 하나다. 도트 열 개가 각각 읽히면 스크린 리더가 같은 정보를
        열 번 말하므로 개별 도트는 aria-hidden으로 빼고, 아래 숫자도 의미론에서 뺀다
        (시각적으로는 남는다).
      */}
      <div
        className="progress-indicator__dots"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
      >
        {Array.from({ length: Math.max(total, 0) }, (_, index) => (
          <span
            key={index}
            className="progress-indicator__dot"
            data-state={dotState(index + 1, current)}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  )
}

/**
 * 몇 번째 칸이 어떤 상태인가. 계산을 떼어 둔 이유는 경계다 — `position === current`가
 * 현재 칸이고 그보다 앞이 완료인데, 부등호를 한 칸 잘못 쓰면 진행이 통째로 밀린다.
 */
function dotState(position: number, current: number): ProgressDotState {
  if (position < current) return 'done'
  if (position === current) return 'current'
  return 'todo'
}
