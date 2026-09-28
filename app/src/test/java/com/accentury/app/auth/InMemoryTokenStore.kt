package com.accentury.app.auth

/** Keystore 없이 갱신·게이트 규칙을 돌리기 위한 저장소. OkHttp 스레드에서도 불리므로 동기화한다. */
class InMemoryTokenStore(initial: AuthTokens? = null) : TokenStore {

    @Volatile
    var tokens: AuthTokens? = initial
        private set

    override suspend fun read(): AuthTokens? = tokens

    override suspend fun save(tokens: AuthTokens) {
        this.tokens = tokens
    }

    override suspend fun clear() {
        tokens = null
    }
}
