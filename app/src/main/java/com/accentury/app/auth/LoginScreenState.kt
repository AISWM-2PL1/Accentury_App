package com.accentury.app.auth

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.setValue

/**
 * 가입 시 동의받는 개인정보처리방침의 버전 (KAN-224, KAN-240).
 *
 * 값은 게시된 방침(서버 레포 `infra/privacy/privacy.html`의 `accentury-policy-version` 메타, 시행일과 같은
 * 날짜)이다. 계정 수집 항목을 반영한 개정본이 2026-09-29 버전이다 (KAN-240). **서버는 게시 중인 버전과
 * 정확히 같은 값만 동의로 받고 다르면 400 AUTH_CONSENT_REQUIRED다** - 방침을 개정하면 서버 레포의
 * `AccenturyProperties.Auth.PRIVACY_POLICY_VERSION`, privacy.html, iOS `LoginScreenState.swift`와 이 값을 함께
 * 올린다. 어긋난 동안에는 새 가입이 전부 막힌다 (재로그인은 동의 필드를 보지 않아 영향이 없다).
 */
const val PRIVACY_POLICY_VERSION = "2026-09-29"

/**
 * 방침 문서 주소. 웹(`web/src/legal/privacyPolicy.ts`의 DEFAULT_PRIVACY_POLICY_URL)과 같은 값이고 같은
 * 이유로 **환경과 무관하게 prod 문서다** — 디버그의 WEB_URL(로컬 Vite)에는 이 정적 파일이 없고, 법적 고지는
 * 정본이 하나여야 한다. 외부 링크 allowlist(`web/WebConfig.kt`의 EXTERNAL_LINK_HOSTS)도 이 호스트다.
 */
const val PRIVACY_POLICY_URL = "https://accentury.app/privacy.html"

/** 로그인 화면이 버튼을 세우는 순서 (KAN-224 팀 결정 2026-09-28). APPLE은 iOS 전용이라 없다. */
val LOGIN_PROVIDERS: List<Provider> = listOf(Provider.GOOGLE, Provider.KAKAO, Provider.NAVER)

/**
 * 이 빌드에 보일 로그인 버튼. 설정(키·클라이언트 ID)이 빈 제공자는 숨긴다 — 눌러야 SDK 오류로 떨어질
 * 버튼을 세워 둘 이유가 없다. 가짜 IdP면 설정과 무관하게 셋 다 보인다(SDK를 부르지 않는다).
 *
 * @param configured 설정이 주입된 제공자
 */
fun visibleProviders(configured: Set<Provider>, fakeIdp: Boolean): List<Provider> =
    LOGIN_PROVIDERS.filter { fakeIdp || it in configured }

/**
 * 로그인 화면의 상태 (KAN-224). 화면에서 떼어 낸 이유는 SessionGateController와 같다 — "언제 누를 수
 * 있나"와 "취소는 오류가 아니다"라는 규칙을 JVM에서 검증하려는 것이다.
 *
 * 서버 로그인의 실패 안내는 [AuthGateController]의 SignedOut.error가 들고, 여기는 서버에 닿기 전
 * IdP 단계의 실패([idpError])만 든다.
 */
class LoginScreenState(consented: Boolean = false) {

    /** 개인정보 수집·이용 동의(필수). 동의 없이 로그인 버튼이 눌리지 않는 것이 [AuthApi.login]의 전제다. */
    var consented: Boolean by mutableStateOf(consented)

    /** IdP 화면 또는 서버 로그인이 도는 중 — 두 번째 탭이 두 번째 로그인을 내보내지 않게 막는다. */
    var inFlight: Boolean by mutableStateOf(false)
        private set

    /** IdP SDK가 토큰을 주지 못했다. 다음 시도를 시작하면 지운다. */
    var idpError: AuthFailure? by mutableStateOf(null)
        private set

    val buttonsEnabled: Boolean get() = consented && !inFlight

    /**
     * 버튼 하나를 눌렀다. [idp]로 SDK 로그인을 하고, 토큰을 받으면 [login](서버 로그인)으로 넘긴다.
     * 취소는 아무 흔적도 남기지 않는다. 막혀 있을 때([buttonsEnabled]가 false) 들어온 호출은 무시한다.
     */
    suspend fun signIn(idp: suspend () -> IdpOutcome, login: suspend (LoginCredential) -> Unit) {
        if (!buttonsEnabled) return
        inFlight = true
        idpError = null
        try {
            when (val outcome = idp()) {
                is IdpOutcome.Credential -> login(outcome.credential)
                IdpOutcome.Cancelled -> Unit
                IdpOutcome.Failed -> idpError = AuthFailure(AuthFailureReason.Retry)
            }
        } finally {
            inFlight = false
        }
    }

    companion object {
        /** 회전에는 동의만 넘긴다. 진행 중이던 로그인은 화면 코루틴과 함께 취소되므로 되살릴 것이 없다. */
        fun saver(): Saver<LoginScreenState, Boolean> = Saver(
            save = { it.consented },
            restore = { LoginScreenState(consented = it) },
        )
    }
}
