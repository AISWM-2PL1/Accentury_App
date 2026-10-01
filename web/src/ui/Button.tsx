/**
 * 공통 버튼 (KAN-148). 화면들이 실제로 반복해서 쓰는 세 무게만 둔다 —
 * 주동작(primary)·보조(secondary)·이탈(text).
 *
 * 크기·색·눌림 효과는 `components.css`의 `.btn` 계열이 갖는다. 여기서 하는 일은
 * 변형을 클래스 이름으로 옮기고 `type="button"`을 기본으로 박는 것뿐이다 —
 * 폼 안에서 `<button>`의 기본값은 submit이라, 빠뜨리면 눌렀을 때 페이지가 새로고침된다.
 *
 * primary만 누를 때 가벼운 탭 햅틱을 낸다 (KAN-258). 보조·이탈 버튼까지 떨면 진동이 "중요한
 * 동작"이라는 뜻을 잃는다 — 햅틱은 아껴 쓸 때만 의미가 남는다는 Apple HIG의 판단을 따른다.
 * disabled 버튼은 브라우저가 click 자체를 내지 않아 햅틱도 나가지 않는다.
 */

import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { haptic } from '../bridge/bridge'

export type ButtonVariant = 'primary' | 'secondary' | 'text'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: ReactNode
}

export function Button({
  variant = 'primary',
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, className].filter(Boolean).join(' ')
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (variant === 'primary') haptic('tap')
    onClick?.(event)
  }
  return (
    <button type="button" className={classes} {...rest} onClick={handleClick}>
      {children}
    </button>
  )
}
