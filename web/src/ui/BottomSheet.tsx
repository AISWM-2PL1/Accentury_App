/**
 * 바텀 시트 공용 부품 (KAN-347 1단계, 시안 s-12-ad-consent-sheet·s-10-translator-consent-sheet·s-23, 움직임 타일 4).
 *
 * 화면을 덮는 막(`.sheet`) 안에 아래에서 올라오는 종이 한 장(`.sheet__panel`)을 세운다. 모양·움직임은 CSS가 전부 갖고,
 * 여기서 하는 일은 대화상자 의미론(`role="dialog"` + `aria-modal` + 제목 연결)을 한 곳에서 붙이는 것뿐이다.
 *
 * 닫는 길(Escape·막 탭)은 시트마다 다르다 — 광고 동의는 선택만이 닫는 길이고, 후기는 셋 다 듣는다. 그래서 부품은
 * 막의 click·keydown을 넘겨받기만 하고 판단은 부르는 쪽이 한다.
 *
 * `overlayClassName`·`className`은 시트마다 붙여 온 이름(`.ad-consent-sheet`·`.feedback-panel` 등)을 그대로 남기려고
 * 받는다 — iOS 스모크 구동기와 E2E 헬퍼가 그 이름을 본다. 패널이 폼이어야 하는 시트(후기)는 `as="form"`으로 받는다.
 */

import type { ComponentPropsWithoutRef, KeyboardEvent, MouseEvent, ReactNode } from 'react'

export interface BottomSheetProps extends Omit<ComponentPropsWithoutRef<'form'>, 'role'> {
  /** 시트 제목 요소의 id. 대화상자 이름이 된다 */
  labelledBy: string
  /** 패널을 `<form>`으로 그린다. 기본은 `<div>` */
  as?: 'div' | 'form'
  /** 막(바깥)에 붙일 클래스 */
  overlayClassName?: string
  onOverlayClick?: (event: MouseEvent<HTMLDivElement>) => void
  onOverlayKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  children: ReactNode
}

export function BottomSheet({
  labelledBy,
  as = 'div',
  overlayClassName,
  onOverlayClick,
  onOverlayKeyDown,
  className,
  children,
  ...rest
}: BottomSheetProps) {
  const panelProps = {
    ...rest,
    className: ['sheet__panel', className].filter(Boolean).join(' '),
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': labelledBy,
  }
  return (
    <div
      className={['sheet', overlayClassName].filter(Boolean).join(' ')}
      onClick={onOverlayClick}
      onKeyDown={onOverlayKeyDown}
    >
      {as === 'form' ? (
        <form {...panelProps}>{children}</form>
      ) : (
        <div {...(panelProps as ComponentPropsWithoutRef<'div'>)}>{children}</div>
      )}
    </div>
  )
}
