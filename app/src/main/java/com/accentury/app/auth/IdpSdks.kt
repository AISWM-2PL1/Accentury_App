package com.accentury.app.auth

import android.app.Activity
import android.content.Context
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.accentury.app.BuildConfig
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.kakao.sdk.auth.model.OAuthToken
import com.kakao.sdk.common.model.ClientError
import com.kakao.sdk.common.model.ClientErrorCause
import com.kakao.sdk.user.UserApiClient
import com.navercorp.nid.NidOAuth
import com.navercorp.nid.core.data.errorcode.NidOAuthErrorCode
import com.navercorp.nid.oauth.util.NidOAuthCallback
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/** 이 빌드에 설정이 주입된 제공자 (KAN-224). 빈 값의 버튼은 숨긴다 ([visibleProviders]). */
fun configuredProviders(): Set<Provider> = buildSet {
    if (BuildConfig.GOOGLE_SERVER_CLIENT_ID.isNotBlank()) add(Provider.GOOGLE)
    if (BuildConfig.KAKAO_NATIVE_APP_KEY.isNotBlank()) add(Provider.KAKAO)
    if (BuildConfig.NAVER_CLIENT_ID.isNotBlank() && BuildConfig.NAVER_CLIENT_SECRET.isNotBlank()) add(Provider.NAVER)
}

/** 버튼 하나가 부를 로그인. 가짜 IdP 빌드면 SDK를 건너뛴다. */
fun idpSignInFor(provider: Provider): IdpSignIn = when {
    BuildConfig.FAKE_IDP -> FakeIdpSignIn(provider)
    provider == Provider.GOOGLE -> GoogleSignIn(BuildConfig.GOOGLE_SERVER_CLIENT_ID)
    provider == Provider.KAKAO -> KakaoSignIn
    provider == Provider.NAVER -> NaverSignIn
    else -> error("Android에 없는 로그인 제공자: $provider")
}

/**
 * 구글 — Credential Manager의 Sign in with Google (KAN-224). 서버로 보내는 것은 ID 토큰이고, 서버는 그
 * 토큰의 aud를 [serverClientId](구글 콘솔의 "웹 애플리케이션" 클라이언트)와 대조한다.
 *
 * 승인된 계정만 거르지 않는다(`setFilterByAuthorizedAccounts(false)`) — 로그인이 곧 가입이라 처음 오는
 * 사용자도 계정 선택 시트를 봐야 한다.
 * https://developer.android.com/identity/sign-in/credential-manager-siwg
 */
private class GoogleSignIn(private val serverClientId: String) : IdpSignIn {
    override suspend fun signIn(activity: Activity): IdpOutcome {
        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(serverClientId)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        return try {
            val credential = CredentialManager.create(activity).getCredential(activity, request).credential
            if (credential is CustomCredential &&
                credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
            ) {
                val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
                IdpOutcome.Credential(loginCredentialOf(Provider.GOOGLE, idToken))
            } else {
                IdpOutcome.Failed
            }
        } catch (_: GetCredentialCancellationException) {
            IdpOutcome.Cancelled
        } catch (_: NoCredentialException) {
            // 기기에 구글 계정이 없다. 사용자는 [다시 시도] 안내를 본다 — 계정을 추가하고 다시 누르면 된다.
            IdpOutcome.Failed
        } catch (_: GetCredentialException) {
            IdpOutcome.Failed
        } catch (_: GoogleIdTokenParsingException) {
            IdpOutcome.Failed
        }
    }
}

/**
 * 카카오 (KAN-224). 카톡이 깔려 있으면 카톡으로, 없거나 카톡 로그인이 실패하면 카카오계정(웹)으로 간다.
 * 카톡 화면에서 사용자가 취소한 경우는 계정 로그인으로 넘기지 않는다 — 로그인하지 않겠다는 뜻이다.
 * 서버로는 카카오 Access 토큰을 보낸다.
 * https://developers.kakao.com/docs/latest/ko/kakaologin/android#login
 */
private object KakaoSignIn : IdpSignIn {
    override suspend fun signIn(activity: Activity): IdpOutcome {
        val client = UserApiClient.instance
        if (client.isKakaoTalkLoginAvailable(activity)) {
            val (token, error) = kakaoLogin { client.loginWithKakaoTalk(activity, callback = it) }
            if (token != null) return credentialOf(token)
            if (error.isKakaoCancel()) return IdpOutcome.Cancelled
        }
        val (token, error) = kakaoLogin { client.loginWithKakaoAccount(activity, callback = it) }
        return when {
            token != null -> credentialOf(token)
            error.isKakaoCancel() -> IdpOutcome.Cancelled
            else -> IdpOutcome.Failed
        }
    }

    private fun credentialOf(token: OAuthToken) =
        IdpOutcome.Credential(loginCredentialOf(Provider.KAKAO, token.accessToken))

    private fun Throwable?.isKakaoCancel() = this is ClientError && reason == ClientErrorCause.Cancelled

    private suspend fun kakaoLogin(
        start: ((OAuthToken?, Throwable?) -> Unit) -> Unit,
    ): Pair<OAuthToken?, Throwable?> = suspendCancellableCoroutine { cont ->
        start { token, error -> if (cont.isActive) cont.resume(token to error) }
    }
}

/**
 * 네이버 (KAN-224). SDK 5.x의 `NidOAuth` — 성공 콜백은 신호뿐이고 토큰은 [NidOAuth.getAccessToken]으로 꺼낸다.
 * 서버로는 네이버 Access 토큰을 보낸다. 초기화는 AccenturyApplication이 한다(설정이 있을 때만).
 * https://github.com/naver/naveridlogin-sdk-android
 */
private object NaverSignIn : IdpSignIn {
    override suspend fun signIn(activity: Activity): IdpOutcome = suspendCancellableCoroutine { cont ->
        NidOAuth.requestLogin(
            activity,
            object : NidOAuthCallback {
                override fun onSuccess() {
                    val token = NidOAuth.getAccessToken()
                    val outcome = if (token.isNullOrBlank()) {
                        IdpOutcome.Failed
                    } else {
                        IdpOutcome.Credential(loginCredentialOf(Provider.NAVER, token))
                    }
                    if (cont.isActive) cont.resume(outcome)
                }

                override fun onFailure(errorCode: String, errorDesc: String) {
                    val cancelled = NidOAuth.getLastErrorCode() == NidOAuthErrorCode.CLIENT_USER_CANCEL
                    if (cont.isActive) cont.resume(if (cancelled) IdpOutcome.Cancelled else IdpOutcome.Failed)
                }
            },
        )
    }
}

/**
 * IdP SDK 쪽 세션 정리 (KAN-224). [AuthGateController.logout]의 `idpLogout`에 넘길 몫이다 —
 * `gate.logout { IdpLogout.all(context) }`. 지금은 추가 정보 화면의 [다른 계정으로 로그인]이 부르고,
 * 설정 화면의 로그아웃은 KAN-247이다.
 *
 * 셋 다 최선 노력이다: 우리 토큰은 이미 서버에서 폐기됐고, SDK 세션이 남으면 다음 로그인에서 계정 선택이
 * 생략될 뿐이다. 하나가 실패해도 나머지는 정리한다.
 */
object IdpLogout {

    suspend fun all(context: Context) {
        runCatching { kakao() }
        runCatching { naver() }
        runCatching { google(context) }
    }

    /** https://developers.kakao.com/docs/latest/ko/kakaologin/android#logout */
    private suspend fun kakao() {
        if (BuildConfig.KAKAO_NATIVE_APP_KEY.isBlank()) return
        suspendCancellableCoroutine { cont ->
            UserApiClient.instance.logout { if (cont.isActive) cont.resume(Unit) }
        }
    }

    private suspend fun naver() {
        if (!NidOAuth.isInitialized()) return
        suspendCancellableCoroutine { cont ->
            NidOAuth.logout(
                object : NidOAuthCallback {
                    override fun onSuccess() {
                        if (cont.isActive) cont.resume(Unit)
                    }

                    override fun onFailure(errorCode: String, errorDesc: String) {
                        if (cont.isActive) cont.resume(Unit)
                    }
                },
            )
        }
    }

    /** 다음 로그인에서 계정 자동 선택을 끈다. https://developer.android.com/identity/sign-in/credential-manager-siwg#handle-sign-out */
    private suspend fun google(context: Context) {
        CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest())
    }
}
