/**
 * 게스트(「로그인 없이 둘러보기」) 로그인 안내 (KAN-330). 게스트는 사투리 번역기와 레벨 테스트(익명 세션)를 쓸 수 있고(팀 결정
 * 2026-11-10, PR #70 리뷰) 학습·홈 등급·출석은 서버가 403 `AUTH_GUEST_NOT_ALLOWED`로 막는다(서버 KAN-329). 그 자리마다 오류 문구 대신 이 안내 하나를 그린다 —
 * 미리 끊은 경우(`wordApi` `request`)와 서버가 막은 경우가 같은 code라 화면 규칙이 하나다.
 *
 * [로그인하기]는 네이티브가 게스트 세션을 버리고 로그인 화면으로 가게 한다(`requestLogin`, webview-bridge §15). 그 메서드를
 * 모르는 앱이면 설정 화면(로그아웃이 있다)으로 내려간다. 출구는 늘 함께 서는 탭 바라 버튼을 더 두지 않는다.
 *
 * `requestLogin`을 보낸 뒤에는 버튼을 막는다(KAN-330 리뷰 P1) — 연타가 이탈을 두 번 보내지 않게. 네이티브도 겹친 호출을
 * 무시하지만 보낼 이유가 없다. 설정 화면으로 내려가는 갈래는 화면을 떠났다 돌아올 수 있어 막지 않는다.
 */

import { useState } from 'react'
import { openSettings, requestLogin } from '../bridge/bridge'
import { Button, StatusBlock } from '../ui'

export const GUEST_LOGIN_MESSAGE = '로그인하면 단어 학습과 억양 학습을 할 수 있어요'
export const GUEST_LOGIN_ACTION = '로그인하기'

export function GuestLoginPrompt() {
  const [requested, setRequested] = useState(false)
  const onClick = () => {
    if (requestLogin()) setRequested(true)
    else openSettings()
  }
  return (
    <StatusBlock
      tone="waiting"
      message={GUEST_LOGIN_MESSAGE}
      action={
        <Button onClick={onClick} disabled={requested}>
          {GUEST_LOGIN_ACTION}
        </Button>
      }
    />
  )
}
