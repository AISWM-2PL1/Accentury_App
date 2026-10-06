package com.accentury.app.auth

import android.app.Activity

/** IdP SDK 로그인 한 번의 결말 (KAN-224). */
sealed interface IdpOutcome {

    /** SDK가 토큰을 줬다 — 서버 로그인으로 넘긴다. */
    data class Credential(val credential: LoginCredential) : IdpOutcome

    /** 사용자가 SDK 화면에서 물러났다. 안내할 오류가 아니다 — 로그인 화면에 조용히 돌아온다. */
    data object Cancelled : IdpOutcome

    /** SDK가 토큰을 주지 못했다 (계정 없음·망·SDK 오류). 로그인 화면이 [다시 시도] 안내를 띄운다. */
    data object Failed : IdpOutcome
}

/**
 * IdP 하나의 로그인 (KAN-224). 인터페이스로 둔 것은 구현이 둘(SDK·가짜 IdP)이고, 화면의 상태 규칙
 * ([LoginScreenState])을 SDK 없이 JVM에서 돌려 보려는 것이다. 실제 구현은 `IdpSdks.kt`다.
 */
interface IdpSignIn {
    suspend fun signIn(activity: Activity): IdpOutcome
}

/**
 * 제공자별로 토큰을 싣는 칸을 가른다 — 서버 계약(§3.9, 서버 `AuthService.credential`)이 GOOGLE·APPLE은
 * `idToken`, KAKAO·NAVER는 `accessToken`을 읽는다. 다른 칸에 실으면 400 `VALIDATION_FAILED`다.
 */
fun loginCredentialOf(provider: Provider, token: String, refreshToken: String? = null): LoginCredential =
    when (provider) {
        Provider.GOOGLE, Provider.APPLE -> LoginCredential(provider, idToken = token)
        Provider.KAKAO -> LoginCredential(provider, accessToken = token)
        // 네이버는 Refresh 토큰도 필수다 (KAN-243). 네이버 사용자 조회 API는 토큰의 발급 앱을 알려 주지 않아서, 서버가
        // 이 Refresh 토큰을 우리 Client로 교환해 봐야 우리 앱의 토큰인지 가릴 수 있다. 없으면 400 `VALIDATION_FAILED`다.
        Provider.NAVER -> LoginCredential(provider, accessToken = token, refreshToken = refreshToken)
    }

/**
 * 가짜 IdP의 자격 (KAN-224, 디버그 `BuildConfig.FAKE_IDP`). 서버가 `accentury.auth.fake-idp=true`면
 * `fake:<sub>`를 IdP에 묻지 않고 그 sub로 로그인시킨다 (서버 `IdpVerifiers`, sub 형식 `[A-Za-z0-9._-]{1,64}`).
 * 칸은 진짜 토큰과 같은 규칙을 탄다 — 서버가 필수 필드 검사를 가짜 판정보다 먼저 하기 때문이다.
 * 제공자마다 sub가 달라 세 버튼이 서로 다른 계정이 된다. iOS(3단계)도 같은 형식을 쓴다.
 */
fun fakeLoginCredential(provider: Provider): LoginCredential {
    val token = "fake:dev-${provider.name.lowercase()}"
    // 네이버는 Refresh 칸도 채운다. 서버가 필수 필드 검사를 가짜 판정보다 먼저 하기 때문이다 (KAN-243).
    return loginCredentialOf(provider, token, refreshToken = token.takeIf { provider == Provider.NAVER })
}

/** 가짜 IdP — SDK 화면 없이 곧장 [fakeLoginCredential]을 돌려준다. */
class FakeIdpSignIn(private val provider: Provider) : IdpSignIn {
    override suspend fun signIn(activity: Activity): IdpOutcome = IdpOutcome.Credential(fakeLoginCredential(provider))
}
