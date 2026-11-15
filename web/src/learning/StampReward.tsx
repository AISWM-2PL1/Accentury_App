/**
 * 스탬프 성적표의 보상 부분 (KAN-347 4-4, 시안 s-15-A·s-07-A, 움직임 타일 12). 단어 성적표(4단계)와 억양 성적표(5단계 5-4)가
 * 같이 쓴다 — 그래서 단어 응답이 아니라 숫자만 받는다.
 *
 * - 점수 원(이번 시도 점수) → 별 3칸(이번 시도 별) → 「코스 별」 줄(최고 기록 기준 전후 값, KAN-359 구간 요약).
 * - 움직임(타일 12): 점수 원 count-up 600ms → 별이 150ms 간격으로 하나씩(각 300ms) → 코스 별 막대의 이번 칸이 300ms로 늘어난다 →
 *   코스가 열렸으면 「n코스가 열렸어요」가 「다음 코스까지」 자리에 뜬다. 시간은 전부 토큰이라 동작 줄이기에서는 끝 상태다(tokens.css).
 * - `stars`가 null이면 별 칸을, `course`가 null이면 「코스 별」 줄을 그리지 않는다(서버 필드 전 동작 4-5·5-6).
 */

import { ScoreDonut, Stars } from '../ui'
import type { CourseStarsChange } from './travel'

export interface StampRewardProps {
  /** 이번 시도 점수 0~100 */
  score: number
  /** 이번 시도 별 1~3. null이면 숨긴다 */
  stars: number | null
  /** 코스 별 전후. null이면 숨긴다 */
  course: CourseStarsChange | null
}

export function StampReward({ score, stars, course }: StampRewardProps) {
  return (
    <div className="stamp-reward">
      <ScoreDonut score={score} size={116} label="이번 점수" countUp />
      {stars !== null && (
        <div className="stamp-reward__stars">
          <Stars count={stars} size={32} />
        </div>
      )}
      {course !== null && <CourseStarsLine course={course} />}
    </div>
  )
}

function CourseStarsLine({ course }: { course: CourseStarsChange }) {
  const { before, after, required, unlocked } = course
  const percent = (stars: number) => (Math.min(Math.max(stars, 0), required) / required) * 100
  const remaining = Math.max(required - after, 0)
  return (
    <section
      className="stamp-reward__course"
      aria-label={`코스 별 ${before}개에서 ${after}개로, 다음 코스까지 필요한 별 ${required}개`}
    >
      <div className="stamp-reward__course-head">
        <span className="type-caption stamp-reward__muted">코스 별</span>
        <span className="stamp-reward__count" aria-hidden="true">
          <span className="stamp-reward__brick">★</span> <span className="stamp-reward__muted">{before}</span> →{' '}
          <span className="stamp-reward__brick">{after}</span> / {required}
        </span>
      </div>
      <div
        className="stamp-reward__bar"
        role="progressbar"
        aria-label="코스 별"
        aria-valuemin={0}
        aria-valuemax={required}
        aria-valuenow={Math.min(after, required)}
      >
        <span className="stamp-reward__bar-earned" style={{ width: `${percent(before)}%` }} />
        {percent(after) > percent(before) && (
          <span className="stamp-reward__bar-added" style={{ width: `${percent(after) - percent(before)}%` }} />
        )}
      </div>
      <div className="type-caption stamp-reward__note">
        <span>
          이번 스탬프 <span className="stamp-reward__brick">+{Math.max(after - before, 0)}</span>
        </span>
        {unlocked !== null ? (
          <span className="stamp-reward__unlock" role="status">
            {unlocked}코스가 열렸어요
          </span>
        ) : (
          remaining > 0 && <span>다음 코스까지 별 {remaining}개</span>
        )}
      </div>
    </section>
  )
}

/**
 * 앱 바 오른쪽 「스탬프 완료」 (s-15-A·s-07-A). 앱 바는 `main.tsx`가 `App` 밖에 한 번 그리므로, 출석 배지(`.streak-badge`)처럼
 * 이 글자를 앱 바 위 고정 위치에 둔다. 성적표가 그리는 동안만 보인다
 */
export function StampDoneBadge() {
  return <span className="type-caption stamp-done-badge">스탬프 완료</span>
}
