/**
 * 가운데 대화상자 공용 부품 (KAN-347 1단계, 시안 s-09-error-C). 폭 320, 모서리 16, 제목 26, 덮개는 바텀 시트와 같다.
 * 번역기 오류(6단계)가 처음 쓴다.
 *
 * 제목·설명·버튼 줄을 부품이 그린다 — 대화상자마다 제목 크기와 버튼 배치가 갈리지 않게. 설명은 `aria-describedby`로
 * 이어 열리는 순간 제목과 함께 읽힌다. 닫는 길(Escape·버튼)과 배경 `inert`는 부르는 쪽 몫이다(배경이 무엇인지 그쪽만 안다).
 */

import { useId, type KeyboardEvent, type ReactNode } from 'react'

export interface DialogProps {
  title: string
  /** 제목 아래 설명 한 문단 */
  description?: ReactNode
  /** 버튼들. 세로로 쌓이고 폭을 채운다 */
  actions: ReactNode
  /** 대화상자 안 keydown (Escape로 닫기 등) */
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
}

export function Dialog({ title, description, actions, onKeyDown }: DialogProps) {
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  return (
    <div className="dialog" onKeyDown={onKeyDown}>
      <div
        className="dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : descriptionId}
      >
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        {description !== undefined && (
          <p id={descriptionId} className="dialog__body">
            {description}
          </p>
        )}
        <div className="dialog__actions">{actions}</div>
      </div>
    </div>
  )
}
