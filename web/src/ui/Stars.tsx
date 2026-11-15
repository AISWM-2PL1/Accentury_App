/**
 * 별 칸 (KAN-347 1단계 1-5). 채운 별 = 벽돌 면 + 잉크 1px 테두리, 빈 별 = 종이 그림자색(#cfc5aa) 테두리.
 * 결과 화면·코스 지도 카드·사투리 여행 지도(3~5단계)가 쓴다.
 *
 * 별 하나하나를 읽히지 않고 묶음 전체를 그림 하나(`role="img"`)로 두어 「별 3개 중 2개」 한 줄로 읽힌다 —
 * 별마다 읽히면 같은 정보를 세 번 듣는다. 채운 별과 빈 별은 색만이 아니라 면의 유무로도 갈린다 (WCAG 1.4.1).
 */

export interface StarsProps {
  /** 채운 별 수 (0~total). 범위를 벗어나면 그림만 가둔다 */
  count: number
  /** 칸 수. 세트 별은 3이다 */
  total?: number
  /** 별 하나의 크기(px) */
  size?: number
}

/** 다섯 꼭짓점 별. viewBox 24 */
export const STAR_PATH = 'M12 2.8 L14.75 8.75 L21.2 9.45 L16.4 13.85 L17.7 20.2 L12 17 L6.3 20.2 L7.6 13.85 L2.8 9.45 L9.25 8.75 Z'

export function Stars({ count, total = 3, size = 20 }: StarsProps) {
  const filled = Math.min(Math.max(Math.round(count), 0), total)
  return (
    <span className="stars" role="img" aria-label={`별 ${total}개 중 ${filled}개`}>
      {Array.from({ length: total }, (_, index) => (
        <svg
          key={index}
          className={index < filled ? 'stars__star stars__star--filled' : 'stars__star'}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d={STAR_PATH} strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  )
}
