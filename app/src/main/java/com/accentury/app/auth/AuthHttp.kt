package com.accentury.app.auth

import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Dispatcher
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

private const val HEADER_AUTHORIZATION = "Authorization"
private const val BEARER_PREFIX = "Bearer "
private const val STATUS_UNAUTHORIZED = 401

/*
 * 아래 둘은 OkHttp의 동기 확장점(Interceptor·Authenticator)이라 suspend인 저장소·갱신을 runBlocking으로
 * 잇는다. 이 자리는 OkHttp 호출 스레드(enqueue면 디스패처 스레드)이고 메인 스레드가 아니다 — 여기서 막히는
 * 것은 그 요청 하나다. 막힘이 서로를 기다리는 교착이 되지 않게 하는 장치는 [AuthClients]의 디스패처 분리다.
 */

/**
 * 저장된 Access 토큰을 `Authorization: Bearer`로 싣는다 (KAN-224).
 *
 * 토큰이 없으면(로그아웃 상태) 헤더 없이 보낸다 — 세션 생성은 익명으로도 성립하는 호출이라 여기서 막을
 * 이유가 없다. 호출자가 이미 Authorization을 달았으면 건드리지 않는다: [TokenAuthenticator]가 새 토큰으로
 * 다시 만든 요청도 이 인터셉터를 다시 지나가는데, 그때 저장소 값으로 덮으면 재시도가 무엇을 실었는지 흐려진다.
 */
class AccessTokenInterceptor(private val store: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header(HEADER_AUTHORIZATION) != null) return chain.proceed(request)
        val access = runBlocking { store.read() }?.accessToken ?: return chain.proceed(request)
        return chain.proceed(request.newBuilder().header(HEADER_AUTHORIZATION, BEARER_PREFIX + access).build())
    }
}

/**
 * 401을 받으면 한 번 갱신하고 원래 요청을 새 토큰으로 다시 보낸다 (KAN-224).
 *
 * 다시 보낸 요청마저 401이면 포기한다 — [Response.priorResponse]가 있으면 이미 한 번 재시도한 응답이다.
 * 새 토큰도 거절당했다면 갱신으로 풀리는 문제가 아니고(계정 삭제 등), 계속 돌면 갱신-거절 무한 고리다.
 * Bearer 없이 나간 요청의 401도 손대지 않는다: 갱신할 토큰이 애초에 없다.
 */
class TokenAuthenticator(private val refresher: TokenRefresher) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.code != STATUS_UNAUTHORIZED || response.priorResponse != null) return null
        val sent = response.request.header(HEADER_AUTHORIZATION)
            ?.takeIf { it.startsWith(BEARER_PREFIX) }
            ?.removePrefix(BEARER_PREFIX)
            ?: return null
        val outcome = runBlocking { refresher.refresh(staleAccess = sent) }
        // 갱신이 거절됐거나(저장소는 이미 비었다) 판정이 안 났으면(토큰은 그대로) 이 401을 호출자에게 그대로 올린다.
        val tokens = (outcome as? RefreshOutcome.Refreshed)?.tokens ?: return null
        return response.request.newBuilder()
            .header(HEADER_AUTHORIZATION, BEARER_PREFIX + tokens.accessToken)
            .build()
    }
}

/**
 * 인증 쪽 객체들을 한 번에 엮는다 (KAN-224). 앱에서 하나만 만든다.
 *
 * 생성 순서의 고리: [authedClient]는 [refresher]를 알아야 하고, [refresher]는 [api]의 갱신 호출을,
 * [api]는 [authedClient]를 알아야 한다. [refresher]가 갱신을 함수로 받아 [api]를 늦게 부르게 해서 끊는다.
 *
 * **[authedClient]가 디스패처를 따로 갖는 이유 (교착 방지).** newBuilder는 기본적으로 디스패처를 공유하고,
 * OkHttp 디스패처는 호스트당 동시 5개까지만 돌린다. 인증 요청 5개가 동시에 401을 받아 전부 Authenticator
 * 안에서 runBlocking으로 갱신을 기다리는데 그 갱신 호출이 같은 디스패처 줄 뒤에 서면, 자리를 쥔 5개가
 * 비켜 주지 않아 영영 나가지 못한다. 인증 클라이언트만 새 디스패처를 받으면 갱신(base)과 줄이 겹치지 않는다.
 * 연결 풀은 그대로 공유된다.
 *
 * @param base 공통 설정(타임아웃 등)의 바탕 클라이언트. 로그인·갱신은 이것 그대로 나간다
 */
class AuthClients(baseUrl: String, val store: TokenStore, base: OkHttpClient = OkHttpClient()) {

    val refresher: TokenRefresher = TokenRefresher(store) { refreshToken -> api.refresh(refreshToken) }

    /**
     * Bearer + 자동 갱신 클라이언트. 사용자 API(`/v0/users/me*`, `/v0/auth/logout`)와 세션 생성
     * (`com.accentury.app.session.sessionCreationClient`에 넘겨 15초 상한을 얹는다)만 쓴다. 세션 범위
     * API(업로드 등, `st_` 토큰)는 이 클라이언트를 쓰지 않는다 — 거기에 JWT가 실리면 세션 토큰 자리를 덮는다.
     */
    val authedClient: OkHttpClient = base.newBuilder()
        .dispatcher(Dispatcher())
        .addInterceptor(AccessTokenInterceptor(store))
        .authenticator(TokenAuthenticator(refresher))
        .build()

    val api: AuthApi = AuthApi(baseUrl, base, authedClient)
}
