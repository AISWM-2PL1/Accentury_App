/**
 * 음성 저장 선택 동의 (KAN-270 1단계, 서버 KAN-269) — 체크하고 시작하면 세션 생성 본문에 게시
 * 버전이 실리고 서버가 201로 받는다.
 *
 * 단위 테스트(`App.test.tsx`)는 fetch 대역이 받은 본문까지만 본다. 여기서만 보이는 것은 **실서버가
 * 이 버전을 게시 버전으로 아는가**다 — 웹 상수(`legal/voiceConsent.ts`)와 서버
 * `AccenturyProperties.VOICE_CONSENT_VERSION`이 어긋나면 첫 요청이 400이라 `startTest`의 201
 * 단언에서 걸린다(웹은 동의 없이 한 번 더 만들어 응시를 잇지만, 그 재시도는 이 단언을 통과시키지
 * 않는다). 그래서 이 스펙에는 KAN-269가 들어간 서버(origin/Dev 이후)가 필요하다.
 *
 * 미동의 쪽은 따로 스펙을 두지 않는다 — 다른 스펙 전부가 기본값(체크하지 않은 [다음])으로
 * `startTest`를 지나며 "키 자체가 없다"를 매번 단언한다.
 */

import { test } from '@playwright/test'
import { startTest } from './helpers/testFlow'

test('음성 저장 동의 - 체크하고 시작하면 세션 생성 본문에 게시 버전이 실리고 201이 온다', async ({ page }) => {
  await startTest(page, { voiceConsent: true })
})
