package com.accentury.app.auth

/** Keystore 없이 갱신·게이트 규칙을 돌리기 위한 저장소. OkHttp 스레드에서도 불리므로 동기화한다. */
class InMemoryTokenStore(initial: AuthTokens? = null) : TokenStore {

    @Volatile
    var tokens: AuthTokens? = initial
        private set

    override suspend fun read(): AuthTokens? = tokens

    /** false면 [save]가 디스크 쓰기 실패를 흉내 낸다 — 실제 저장소처럼 메모리 값은 바꾸고 false를 돌려준다. */
    @Volatile
    var persists: Boolean = true

    override suspend fun save(tokens: AuthTokens): Boolean {
        this.tokens = tokens
        return persists
    }

    override suspend fun clear() {
        tokens = null
    }
}
