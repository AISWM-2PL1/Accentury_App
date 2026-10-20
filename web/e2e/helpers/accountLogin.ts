/**
 * 계정 Access 토큰을 실 백엔드에서 받아 온다 (KAN-255 6단계).
 *
 * 단어 학습 API는 레벨테스트와 달리 세션 토큰이 아니라 **계정** Bearer를 받는다. 앱에서는 그 토큰을
 * 네이티브가 소셜 로그인으로 얻어 브리지(`getAccessToken`)로 건네지만, 브라우저 E2E에는 IdP SDK가
 * 없다. 그래서 서버의 가짜 IdP(`--accentury.auth.fake-idp=true`)에 `fake:<sub>`를 내밀어 로그인하고,
 * 받은 토큰을 스펙이 브리지 흉내에 심는다 — 화면이 보는 것은 앱에서와 같은 진짜 계정 토큰이다.
 *
 * 요청은 Playwright `request`로 보낸다. 브라우저를 거치지 않으므로 화면 쪽 상태(저장소·쿠키)에 아무
 * 흔적도 남기지 않고, 주소는 `baseURL` 기준 상대 경로라 개발 서버의 `/v0` 프록시를 그대로 탄다.
 */

import { expect, type APIRequestContext } from '@playwright/test'

/**
 * 동의하는 개인정보처리방침 버전. 서버가 게시 중인 버전과 같아야 로그인이 된다 (KAN-240).
 * 앱 두 벌의 상수와 같은 값이다 — Android `auth/LoginScreenState.kt`의 `PRIVACY_POLICY_VERSION`,
 * iOS `AccenturyCore/Auth/LoginScreenState.swift`의 `privacyPolicyVersion`.
 */
const PRIVACY_POLICY_VERSION = '2026-10-04'

/**
 * 추가 정보 화면에서 사람이 넣는 값. 신규 계정은 `profileStatus: INCOMPLETE`로 시작하므로
 * 앱의 로그인 게이트와 같은 길을 걸어 COMPLETE로 만든다.
 */
const E2E_PROFILE = {
  email: 'e2e-word@example.com',
  name: 'E2E',
  birthDate: '1990-01-01',
  gender: 'MALE',
  region: 'GYEONGNAM',
} as const

/**
 * 새 계정으로 로그인해 Access 토큰을 돌려준다. 테스트마다 sub를 새로 지어 계정을 나눈다 —
 * 병렬 스펙이 같은 계정의 시도를 섞으면 정답률 단언이 남의 답안을 셀 수 있다.
 */
export async function loginWithFakeIdp(request: APIRequestContext): Promise<string> {
  const sub = `e2e-word-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const login = await request.post('/v0/auth/login', {
    data: {
      provider: 'GOOGLE',
      idToken: `fake:${sub}`,
      privacyConsent: true,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    },
  })
  // 실패 본문을 메시지에 싣는다 — fake-idp가 꺼진 서버·방침 버전 어긋남이 여기서 드러난다
  expect(login.ok(), `로그인 실패 ${login.status()} ${await login.text()}`).toBe(true)
  const body = (await login.json()) as { accessToken: string; profileStatus: string }

  if (body.profileStatus !== 'COMPLETE') {
    const profile = await request.put('/v0/users/me/profile', {
      headers: { Authorization: `Bearer ${body.accessToken}` },
      data: E2E_PROFILE,
    })
    expect(profile.ok(), `프로필 저장 실패 ${profile.status()} ${await profile.text()}`).toBe(true)
  }
  return body.accessToken
}
