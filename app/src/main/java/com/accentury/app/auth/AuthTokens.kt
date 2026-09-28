package com.accentury.app.auth

import kotlinx.serialization.Serializable

/**
 * 서버가 발급한 계정 토큰 쌍 (KAN-224, 서버 KAN-223 §3.9·§3.12).
 *
 * [refreshToken]은 쓸 때마다 회전한다 — 갱신 응답의 새 쌍을 **통째로** 저장해야 하고, 옛 Refresh를 다시
 * 내면 서버가 재사용으로 보고 패밀리를 폐기한다(401 `AUTH_REFRESH_REUSED`). 그래서 둘을 한 값으로 묶어
 * 한 번에 저장한다: 따로 저장하면 그사이 프로세스가 죽을 때 Access와 Refresh가 서로 다른 세대가 된다.
 *
 * Access 만료 시각(`accessTokenExpiresInSec`)은 들고 있지 않는다. 만료를 미리 셈하지 않고 401을 받으면
 * 그때 갱신한다([TokenAuthenticator]) — 기기 시계가 틀려도 동작이 같고, 서버가 만료 전에 무효화한
 * 토큰도 같은 경로로 복구된다.
 *
 * @Serializable인 것은 [KeystoreTokenStore]가 JSON 한 줄로 접어 암호화하기 때문이다.
 */
@Serializable
data class AuthTokens(val accessToken: String, val refreshToken: String) {
    // 토큰은 어떤 로그·크래시 리포트·계측에도 실리면 안 된다 — data class 기본 toString은 두 값을 그대로 찍는다.
    override fun toString(): String = "AuthTokens[redacted]"
}

/**
 * 토큰 쌍의 영속 저장소 (KAN-224). 실제 구현은 [KeystoreTokenStore]이고, 인터페이스로 둔 것은 JVM 단위
 * 테스트가 Android Keystore 없이 갱신·게이트 규칙을 돌리기 위해서다.
 */
interface TokenStore {
    /** 저장된 쌍. 없거나 읽을 수 없으면(복호화 실패 등) null. */
    suspend fun read(): AuthTokens?

    suspend fun save(tokens: AuthTokens)

    suspend fun clear()
}
