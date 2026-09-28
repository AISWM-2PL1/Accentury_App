package com.accentury.app.auth

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** 봉투를 읽을 수 있을 때의 요청 제한 코드 (§2.5). */
private const val CODE_RATE_LIMITED = "RATE_LIMITED"

/** 만 14세 미만 가입 거절 (§3.10). */
private const val CODE_UNDER_AGE = "AUTH_UNDER_AGE"

private const val STATUS_UNAUTHORIZED = 401

/** 서버가 준 밀리초를 사용자에게 읽어 줄 초로 올림한다 — SessionGateController와 같은 규칙. */
private fun ceilSeconds(millis: Long): Long = (millis + 999) / 1_000

/** 앱 진입 게이트의 로그인 관문 상태 (KAN-224). 세션 게이트(KAN-34)보다 앞에 선다. */
sealed interface AuthGateState {

    /** 저장된 토큰이 아직 살아 있는지 확인 중이다. 화면은 스플래시·준비 표시를 유지한다. */
    data object Checking : AuthGateState

    /**
     * 로그인 화면. [error]는 방금 실패한 로그인 시도의 안내다 (처음 들어왔으면 null).
     * 사용자가 IdP 화면에서 취소한 경우는 여기로 오지 않는다 — 호출자가 [AuthGateController.login]을 부르지 않는다.
     */
    data class SignedOut(val error: AuthFailure? = null) : AuthGateState

    /** 로그인은 됐지만 추가 정보(§3.10)가 없다. [error]는 방금 실패한 제출의 안내다. */
    data class NeedsProfile(val user: AuthUser, val error: AuthFailure? = null) : AuthGateState

    /** 테스트에 들어갈 수 있다. */
    data class SignedIn(val user: AuthUser) : AuthGateState

    /**
     * 시작 확인이 판정 없이 끝났다 (전송 실패·429·5xx). **토큰은 그대로다** — 여기서 로그인 화면으로 보내면
     * 망이 잠깐 끊긴 사용자를 로그아웃시키는 셈이다. 화면은 [다시 시도]로 [AuthGateController.retry]를 부른다.
     */
    data class CheckFailed(val error: AuthFailure) : AuthGateState
}

/**
 * 실패 안내의 갈래. SessionFailureReason과 같은 이유로 상태 코드 대신 "사용자가 무엇을 할 수 있나"로 접는다.
 */
enum class AuthFailureReason {
    /** 곧바로 다시 해 보면 된다 — 전송 실패, IdP 토큰 거절(401 `AUTH_IDP_TOKEN_INVALID`: SDK 토큰이 막 만료된 경우 등). */
    Retry,

    /** 서버나 IdP 쪽이 잠시 안 된다 (502 `AUTH_IDP_UNAVAILABLE`, 503 `AUTH_STORE_UNAVAILABLE` 등 재시도 가능한 거절). */
    RetryLater,

    /** 429 — 요청이 몰렸다 (§2.5). [AuthFailure.retryAfterSeconds]만큼 기다리면 풀린다. */
    RateLimited,

    /** 만 14세 미만 (400 `AUTH_UNDER_AGE`). 추가 정보 화면에서만 나온다. */
    UnderAge,

    /** 서버가 재시도 불가로 못박았다 (`VALIDATION_FAILED`·`AUTH_CONSENT_REQUIRED`) — 앱과 서버 계약이 어긋난 경우다. */
    Unsupported,
}

/** @property retryAfterSeconds [AuthFailureReason.RateLimited]일 때 서버가 알려준 대기 시간(초). 그 외에는 null */
data class AuthFailure(val reason: AuthFailureReason, val retryAfterSeconds: Long? = null)

/**
 * 로그인 상태 머신 (KAN-224). 화면에서 분리한 이유는 SessionGateController와 같다 — 오류 응답을 어느 복구
 * 경로로 접는지가 진입 UX를 좌우하는데, Compose·Android에 붙어 있으면 JVM 단위 테스트가 불가능하다.
 * 상태는 [StateFlow]라 화면은 `collectAsState()`로 따라온다.
 *
 * 저장소의 주인은 여전히 [TokenRefresher]·[AuthApi]의 호출 흐름이고, 이 클래스는 저장소를 **보는** 쪽이다.
 * 예외는 로그인 성공(쌍을 처음 저장)과 로그아웃(무조건 비움) 둘뿐이다.
 *
 * @param scope 앱 수명 스코프 (Application이 하나 들고 넘긴다). 시작 확인·[다시 시도]는 여기서 돈다 —
 *   화면 스코프(rememberCoroutineScope)에서 돌리면 회전이 확인을 도중에 취소해 [AuthGateState.Checking]에 남는다.
 */
class AuthGateController(
    private val api: AuthApi,
    private val store: TokenStore,
    private val refresher: TokenRefresher,
    private val scope: CoroutineScope,
) {

    private var checkJob: Job? = null

    private val _state = MutableStateFlow<AuthGateState>(AuthGateState.Checking)
    val state: StateFlow<AuthGateState> = _state.asStateFlow()

    init {
        // 어떤 요청에서든 Refresh가 거절되면 저장소는 이미 비었다 — 화면도 로그인으로 돌린다.
        refresher.onSignedOut = { _state.value = AuthGateState.SignedOut() }
    }

    /**
     * 앱 시작 확인과 [AuthGateState.CheckFailed]의 [다시 시도]가 함께 쓰는 입구. [bootstrap]을 앱 수명
     * [scope]에서 돌리므로 부른 화면이 사라져도(회전) 확인은 끝까지 간다. 이미 도는 확인이 있으면 무시한다.
     */
    fun retry() {
        if (checkJob?.isActive == true) return
        checkJob = scope.launch { bootstrap() }
    }

    /**
     * 확인 본체. 화면은 [retry]로 부른다 — 여기를 직접 부르는 것은 테스트뿐이다.
     *
     * 저장된 Access로 곧장 `me()`를 부르지 않고 갱신부터 하는 이유: Refresh가 살아 있는지가 "로그인 상태"의
     * 정본이다. 오래 안 연 앱의 Access는 거의 늘 만료돼 있어 어차피 갱신을 한 번 거치고, 여기서 먼저 해 두면
     * 거절(401)을 로그인 화면으로, 판정 없음(망·5xx)을 [다시 시도]로 깔끔히 가를 수 있다.
     *
     * **어떻게 끝나든 [AuthGateState.Checking]에 남지 않는다.** 취소되면 [다시 시도]가 보이게 CheckFailed로
     * 두고 취소는 그대로 올린다. 저장소가 계약(읽기는 던지지 않는다)을 어기고 던지면 로그인 화면으로 보낸다 —
     * 읽을 수 없는 저장소는 쌍이 없는 것과 같고(TokenStore.read), CheckFailed로 두면 같은 저장소에 [다시 시도]만
     * 되풀이하며 빠져나갈 길이 없다. 다시 로그인하면 저장이 쌍을 덮어쓴다. 앱 스코프로 예외가 새어 프로세스가 죽는 일도 없다.
     */
    suspend fun bootstrap() {
        _state.value = AuthGateState.Checking
        try {
            _state.value = checkStoredTokens()
        } catch (e: CancellationException) {
            if (_state.value == AuthGateState.Checking) {
                _state.value = AuthGateState.CheckFailed(AuthFailure(AuthFailureReason.Retry))
            }
            throw e
        } catch (_: Exception) {
            _state.value = AuthGateState.SignedOut()
        }
    }

    private suspend fun checkStoredTokens(): AuthGateState {
        if (store.read() == null) return AuthGateState.SignedOut()
        return when (val outcome = refresher.refresh(staleAccess = null)) {
            RefreshOutcome.SignedOut -> AuthGateState.SignedOut()
            is RefreshOutcome.Failed -> AuthGateState.CheckFailed(failureOf(outcome.result))
            is RefreshOutcome.Refreshed -> when (val me = api.me()) {
                is AuthResult.Success -> stateOf(me.value)
                else -> if (store.read() == null) AuthGateState.SignedOut() else AuthGateState.CheckFailed(failureOf(me))
            }
        }
    }

    /**
     * IdP SDK가 준 자격으로 로그인한다. 사용자가 SDK 화면에서 취소했으면 부르지 않는다(안내할 오류가 아니다).
     * 진행 중 버튼 비활성은 화면이 이 suspend 호출이 도는 동안 건다.
     */
    suspend fun login(credential: LoginCredential, privacyPolicyVersion: String) {
        when (val result = api.login(credential, privacyPolicyVersion)) {
            // 서버가 쌍을 준 뒤에는 취소(화면 회전)되어도 저장과 상태 반영을 끝낸다 — 도중에 끊기면 쌍은 저장됐는데
            // 화면은 로그인에 남는다.
            is AuthResult.Success -> withContext(NonCancellable) {
                if (store.save(result.value.tokens)) {
                    _state.value = stateOf(result.value.account)
                } else {
                    // 저장되지 않은 첫 로그인은 지금은 들어간 것처럼 보이다가 다음 실행 때 조용히 로그아웃된다(자동 로그인 AC 위반).
                    // 메모리에 남은 쌍까지 비우고 실패로 알려 사용자가 다시 시도하게 한다.
                    store.clear()
                    _state.value = AuthGateState.SignedOut(AuthFailure(AuthFailureReason.Retry))
                }
            }
            else -> _state.value = AuthGateState.SignedOut(failureOf(result))
        }
    }

    /** 추가 정보를 제출한다. [AuthGateState.NeedsProfile]이 아니면 무시한다. */
    suspend fun submitProfile(input: ProfileInput) {
        val current = _state.value as? AuthGateState.NeedsProfile ?: return
        when (val result = api.updateProfile(input)) {
            is AuthResult.Success -> _state.value = stateOf(result.value)
            else -> {
                // 갱신 거절로 저장소가 비었으면 onSignedOut이 이미 로그인 화면으로 돌렸다 — 덮어쓰지 않는다.
                if (store.read() == null) return
                _state.value = current.copy(error = failureOf(result))
            }
        }
    }

    /**
     * 세션 생성이 403 `AUTH_PROFILE_INCOMPLETE`로 막혔을 때 부른다. 서버가 프로필을 미완료로 본다면(다른 기기에서
     * 값이 지워지는 등) 앱이 들고 있던 [AuthGateState.SignedIn]이 낡은 것이다 — 추가 정보 화면으로 돌린다.
     */
    fun onProfileIncomplete() {
        val signedIn = _state.value as? AuthGateState.SignedIn ?: return
        _state.value = AuthGateState.NeedsProfile(signedIn.user)
    }

    /**
     * 로그아웃. 서버 폐기가 실패해도(망·5xx) **로컬 토큰은 반드시 지운다** — 사용자가 로그아웃을 눌렀는데
     * 로그인 상태가 남으면 그것이 더 큰 문제다. 서버에 남은 Refresh는 만료로 사라진다.
     *
     * Access가 만료돼 로그아웃 요청 중에 갱신이 끼면 서버에는 회전 전 Refresh가 간다. 서버는 그 토큰의
     * 패밀리를 폐기하므로(모르는 토큰도 204) 결과는 같다.
     *
     * @param idpLogout IdP SDK 쪽 로그아웃 (카카오·네이버 SDK 세션 정리 등). 서버 로그아웃 뒤에 부르고,
     *   던져도 로컬 토큰은 지워진 채로 예외가 호출자에게 간다.
     *
     * 화면 스코프에서 불려 도중에 취소돼도(회전) 로컬 정리는 끝낸다 — 취소된 코루틴에서는 DataStore 쓰기가
     * 곧장 취소 예외를 던져 상태 반영까지 건너뛴다.
     */
    suspend fun logout(idpLogout: suspend () -> Unit = {}) {
        try {
            store.read()?.let { api.logout(it.refreshToken) }
            idpLogout()
        } finally {
            withContext(NonCancellable) {
                store.clear()
                _state.value = AuthGateState.SignedOut()
            }
        }
    }

    private fun stateOf(account: Account): AuthGateState = when (account.profileStatus) {
        ProfileStatus.COMPLETE -> AuthGateState.SignedIn(account.user)
        ProfileStatus.INCOMPLETE -> AuthGateState.NeedsProfile(account.user)
    }

    private fun failureOf(result: AuthResult<*>): AuthFailure = when (result) {
        is AuthResult.Success -> error("성공은 실패 안내가 아니다")
        is AuthResult.TransportError -> AuthFailure(AuthFailureReason.Retry)
        is AuthResult.Rejected -> when {
            // 봉투를 읽었으면 코드가 정본이고, 못 읽었으면 대기 시간의 존재가 대신 말해 준다 (SessionGateController와 같은 판정).
            result.code == CODE_RATE_LIMITED || result.retryAfterMs != null ->
                AuthFailure(AuthFailureReason.RateLimited, result.retryAfterMs?.let(::ceilSeconds))

            result.code == CODE_UNDER_AGE -> AuthFailure(AuthFailureReason.UnderAge)

            // 로그인의 401은 IdP 토큰 거절이다 — SDK에서 새 토큰을 받아 다시 하면 된다.
            result.status == STATUS_UNAUTHORIZED -> AuthFailure(AuthFailureReason.Retry)

            result.retryable -> AuthFailure(AuthFailureReason.RetryLater)

            else -> AuthFailure(AuthFailureReason.Unsupported)
        }
    }
}
