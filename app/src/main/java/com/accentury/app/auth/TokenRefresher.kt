package com.accentury.app.auth

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

private const val STATUS_UNAUTHORIZED = 401

/** 갱신 한 번의 결말. */
sealed interface RefreshOutcome {

    /** 쓸 수 있는 쌍이 저장돼 있다 — 방금 회전했거나, 다른 요청이 먼저 회전해 둔 것이다. */
    data class Refreshed(val tokens: AuthTokens) : RefreshOutcome

    /** 저장된 쌍이 없거나 서버가 Refresh를 거절했다. 저장소는 비었고 다시 로그인해야 한다. */
    data object SignedOut : RefreshOutcome

    /** 서버가 판정을 못 냈다 (전송 실패·429·5xx). 토큰은 그대로다 — 나중에 다시 갱신하면 된다. */
    data class Failed(val result: AuthResult<Nothing>) : RefreshOutcome
}

/**
 * Access 토큰 갱신을 한 번에 하나만 내보내는 관문 (KAN-224).
 *
 * **왜 한 번에 하나인가.** Refresh는 쓸 때마다 회전하고, 이미 회전된 Refresh를 다시 내면 서버가 탈취로
 * 보고 패밀리째 폐기한다(401 `AUTH_REFRESH_REUSED`). Access가 만료된 순간 요청 다섯 개가 동시에 401을
 * 받아 각자 갱신하면, 첫 갱신이 회전시킨 뒤 나머지 넷이 옛 Refresh를 내서 **정상 사용자가 로그아웃된다.**
 * 그래서 [mutex]로 줄 세우고, 줄 선 사이에 저장소가 이미 새 Access를 들고 있으면 서버에 묻지 않고 그 값을
 * 쓴다 — 401을 받은 요청이 실어 보냈던 토큰([refresh]의 staleAccess)과 지금 저장된 토큰이 다르면 누군가
 * 먼저 갱신한 것이다.
 *
 * **토큰을 지우는 것은 서버가 Refresh를 거절(401)했을 때뿐이다.** 전송 실패·429·5xx에서 지우면 지하철에서
 * 앱을 연 사용자가 매번 로그아웃된다. 그 경우는 이번 요청만 실패시키고 토큰은 둔다.
 *
 * @param refreshCall 실제 갱신 호출 — [AuthApi.refresh]. 함수로 받는 이유는 [AuthClients]가 인증
 *   클라이언트를 만들 때 이 객체가 먼저 있어야 해서다(생성 순서의 고리를 끊는다).
 */
class TokenRefresher(
    private val store: TokenStore,
    private val refreshCall: suspend (refreshToken: String) -> AuthResult<AuthTokens>,
) {

    private val mutex = Mutex()

    /**
     * 서버가 Refresh를 거절해 저장소를 비운 순간 불린다. [AuthGateController]가 자기를 등록해 화면을 로그인으로
     * 돌린다. 어느 스레드에서든 불릴 수 있다(OkHttp Authenticator 스레드 포함).
     *
     * 흐름(SharedFlow) 대신 콜백인 이유: 구독이 늦으면 흐름의 신호는 흘러가 버린다. 로그아웃 신호를 놓치면
     * 화면이 토큰 없는 로그인 상태로 남는다 — 동기 콜백은 놓칠 수 없다.
     */
    @Volatile
    var onSignedOut: (() -> Unit)? = null

    /**
     * @param staleAccess 401을 받은 요청이 실어 보냈던 Access. null이면 저장소와 비교하지 않고 반드시 서버에
     *   갱신을 묻는다 (앱 시작 시 Refresh가 아직 살아 있는지 확인하는 [AuthGateController.bootstrap]).
     */
    suspend fun refresh(staleAccess: String?): RefreshOutcome = mutex.withLock {
        val current = store.read() ?: return@withLock RefreshOutcome.SignedOut
        if (staleAccess != null && current.accessToken != staleAccess) {
            return@withLock RefreshOutcome.Refreshed(current)
        }
        when (val result = refreshCall(current.refreshToken)) {
            is AuthResult.Success -> {
                store.save(result.value)
                RefreshOutcome.Refreshed(result.value)
            }
            is AuthResult.Rejected -> if (result.status == STATUS_UNAUTHORIZED) {
                // AUTH_REFRESH_INVALID(만료·폐기)와 AUTH_REFRESH_REUSED(탈취 의심) 모두 이 Refresh로는 영영 못 푼다.
                store.clear()
                onSignedOut?.invoke()
                RefreshOutcome.SignedOut
            } else {
                RefreshOutcome.Failed(result)
            }
            is AuthResult.TransportError -> RefreshOutcome.Failed(result)
        }
    }
}
