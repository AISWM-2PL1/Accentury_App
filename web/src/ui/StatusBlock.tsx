/**
 * 대기·오류 문구 블록 (KAN-148). 두 상태를 한 컴포넌트로 묶은 이유: 화면 구성이 같고
 * (문구 + 부연 + 선택적 동작) 색과 역할만 다르다. 따로 두면 한쪽에만 부연이 생기는 식으로
 * 어긋난다.
 *
 * `tone="error"`일 때 `role="alert"`을 붙인다 — 화면이 이미 떠 있는 상태에서 나타나는
 * 실패 문구는 스크린 리더가 스스로 읽어 줘야 사용자가 알아챈다. 대기 문구에는 붙이지
 * 않는다: 로딩은 곧 바뀔 상태라 매번 읽어 주면 소음이 된다.
 *
 * ## 예외 화면 서식 (KAN-347 1단계 1-8)
 *
 * `icon`을 주면 한 화면을 통째로 차지하는 예외 화면 서식으로 선다(`.exception`): 아이콘 원 112(아이콘 56), 원 윗선
 * y=200, 제목 Jua 30(h1 — 이 문구가 곧 화면 이름이다), 설명 15 흐린 잉크, 버튼은 내용 너비, 그 아래 오류 코드 한 줄.
 * 학습 로딩·게스트 안내·로그인 안내·목록 오류가 이 서식이다. 아이콘이 없으면 예전 모양 그대로다 — 분석 대기 화면처럼
 * 다른 화면 안에 끼어 서는 블록이 있어서다.
 */

import type { ReactNode } from 'react'

export interface StatusBlockProps {
  tone: 'waiting' | 'error'
  /** 사용자용 문구. 비난 없는 카피 톤을 지킨다 (ux-ui.md) */
  message: string
  /** 원인·부연. 오류에서는 진단 문구가 들어온다 */
  detail?: string
  /** 재시도 같은 복구 동작 */
  action?: ReactNode
  /** 예외 화면 서식의 아이콘 (`ui/icons`의 선 아이콘). 주면 서식이 바뀐다 */
  icon?: ReactNode
  /** 예외 화면 맨 아래 작은 한 줄 (예: 「오류 코드 500」) */
  code?: string
}

export function StatusBlock({ tone, message, detail, action, icon, code }: StatusBlockProps) {
  if (icon !== undefined) {
    return (
      <div
        className={`status-block status-block--${tone} exception`}
        {...(tone === 'error' ? { role: 'alert' as const } : {})}
      >
        <div className="exception__icon" aria-hidden="true">
          {icon}
        </div>
        <h1 className="exception__title">{message}</h1>
        {detail !== undefined && <p className="exception__detail">{detail}</p>}
        {action}
        {code !== undefined && <p className="exception__code">{code}</p>}
      </div>
    )
  }
  return (
    <div
      className={`status-block status-block--${tone}`}
      {...(tone === 'error' ? { role: 'alert' as const } : {})}
    >
      <p className="type-body">{message}</p>
      {detail !== undefined && <p className="type-caption status-block__detail">{detail}</p>}
      {action}
    </div>
  )
}
