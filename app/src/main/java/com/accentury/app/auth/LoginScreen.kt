package com.accentury.app.auth

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import com.accentury.app.ui.components.AccenturyButton
import com.accentury.app.ui.components.ButtonVariant
import com.accentury.app.ui.components.StatusBlock
import com.accentury.app.ui.components.StatusTone
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * 로그인 화면 (KAN-224). 인트로(웹)보다 앞에 서는 필수 관문이다.
 *
 * 버튼은 브랜드 색·로고 없이 보조 버튼 모양의 글자만 쓴다 (2026-09-28 팀장 결정) — 크림·잉크 한 벌 화면에
 * 브랜드 색 셋이 서면 그것만 튄다. 순서는 구글 → 카카오 → 네이버.
 *
 * @param error 방금 실패한 서버 로그인의 안내 ([AuthGateState.SignedOut.error])
 * @param providers 이 빌드에 보일 버튼 ([visibleProviders])
 * @param signInFor 버튼 하나의 IdP 로그인. 실제 빌드는 [idpSignInFor]
 * @param onLogin 토큰을 받은 뒤의 서버 로그인 ([AuthGateController.login])
 * @param onOpenPrivacy [보기] — 방침 문서를 연다
 */
@Composable
fun LoginScreen(
    error: AuthFailure?,
    providers: List<Provider>,
    signInFor: (Provider) -> IdpSignIn,
    onLogin: suspend (LoginCredential) -> Unit,
    onOpenPrivacy: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state = rememberSaveable(saver = LoginScreenState.saver()) { LoginScreenState() }
    val scope = rememberCoroutineScope()
    // 로그인 SDK는 Activity 위에 자기 화면을 띄운다. 이 화면은 늘 MainActivity 안에서 돈다.
    val activity = checkNotNull(LocalActivity.current)

    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(start = Spacing.x6, end = Spacing.x6, top = Dimens.screenPaddingTop, bottom = Spacing.x8),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.x6),
        ) {
            // 텍스트 히어로 (design-tokens §8) — 인트로와 같은 글자·같은 크기. 화면 이름을 말하는 것이 이것뿐이라 heading이다.
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Spacing.x2),
            ) {
                Text(
                    "사투리 좀 치나?",
                    style = MaterialTheme.typography.displayLarge,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    "로그인하고 내 말씨가 어디 사투리인지 알아보세요",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }

            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(Spacing.x3),
            ) {
                providers.forEach { provider ->
                    AccenturyButton(
                        text = "${providerLabel(provider)}로 계속하기",
                        onClick = {
                            scope.launch {
                                state.signIn(idp = { signInFor(provider).signIn(activity) }, login = onLogin)
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        variant = ButtonVariant.Secondary,
                        enabled = state.buttonsEnabled,
                    )
                }
            }

            ConsentRow(
                checked = state.consented,
                onCheckedChange = { state.consented = it },
                onOpenPrivacy = onOpenPrivacy,
            )

            val shown = state.idpError ?: error
            when {
                // 설정이 하나도 없는 빌드 — 가짜 IdP도 꺼져 있으면 누를 것이 없다. 사용자에게는 업데이트 안내다.
                providers.isEmpty() -> AuthFailureBlock(AuthFailure(AuthFailureReason.Unsupported), verb = "로그인")
                shown != null -> AuthFailureBlock(shown, verb = "로그인")
                // 서버 로그인까지 도는 동안 버튼은 흐려지고 여기서 기다림을 알린다.
                state.inFlight -> CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

/**
 * 필수 동의 한 줄. 줄 전체가 체크박스 하나로 읽히고 눌린다(48dp 터치). [보기]는 따로 눌리는 글자 버튼이다.
 */
@Composable
private fun ConsentRow(checked: Boolean, onCheckedChange: (Boolean) -> Unit, onOpenPrivacy: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Row(
            modifier = Modifier
                .weight(1f)
                .defaultMinSize(minHeight = Dimens.touchTargetMin)
                .toggleable(value = checked, role = Role.Checkbox, onValueChange = onCheckedChange),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(
                checked = checked,
                onCheckedChange = null,
                colors = CheckboxDefaults.colors(
                    checkedColor = MaterialTheme.colorScheme.primary,
                    uncheckedColor = MaterialTheme.colorScheme.primary,
                    checkmarkColor = MaterialTheme.colorScheme.onPrimary,
                ),
            )
            Text(
                "개인정보 수집·이용 동의 (필수)",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(start = Spacing.x2),
            )
        }
        AccenturyButton(text = "보기", onClick = onOpenPrivacy, variant = ButtonVariant.Text)
    }
}

private fun providerLabel(provider: Provider): String = when (provider) {
    Provider.GOOGLE -> "Google"
    Provider.KAKAO -> "카카오"
    Provider.NAVER -> "네이버"
    Provider.APPLE -> "Apple"
}

/**
 * 인증 실패 안내 (KAN-224). SessionGateScreen의 실패 문구와 같은 말투다 — 비난 없이, 지금 할 수 있는 것 하나.
 * 복구 동작은 화면이 따로 둔다(로그인은 IdP 버튼, 추가 정보는 [완료], 시작 확인은 [다시 시도]).
 *
 * @param verb 실패한 동작 ("로그인" · "저장" · "연결") — "~하지 못했어요"·"~할 수 있어요"에 들어간다
 */
@Composable
internal fun AuthFailureBlock(
    failure: AuthFailure,
    verb: String,
    modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null,
) {
    val (message, detail) = when (failure.reason) {
        AuthFailureReason.Retry -> "${verb}하지 못했어요" to "네트워크를 확인하고 다시 시도해 주세요"
        AuthFailureReason.RetryLater -> "${verb}하지 못했어요" to "잠시 뒤에 다시 시도해 주세요"
        AuthFailureReason.RateLimited -> "잠시 뒤에 ${verb}할 수 있어요" to (
            failure.retryAfterSeconds?.let { "접속이 몰리고 있어요 · ${it}초 뒤에 다시 눌러 주세요" }
                ?: "접속이 몰리고 있어요 · 잠시 뒤에 다시 눌러 주세요"
            )
        AuthFailureReason.UnderAge -> "만 14세 이상만 가입할 수 있어요" to null
        AuthFailureReason.Unsupported -> "지금은 ${verb}할 수 없어요" to "앱을 최신 버전으로 업데이트한 뒤 다시 열어 주세요"
    }
    StatusBlock(tone = StatusTone.Error, message = message, detail = detail, modifier = modifier, action = action)
}

/**
 * 시작 확인 화면 (KAN-224). 첫 확인은 스플래시가 가리므로 이 화면의 대기 표시는 [다시 시도] 뒤에만 보인다.
 * 확인이 판정 없이 끝나면([AuthGateState.CheckFailed]) 토큰은 그대로 둔 채 다시 시도만 준다 —
 * 망이 잠깐 끊긴 사용자를 로그인 화면으로 보내면 멀쩡한 로그인을 버리게 한다.
 *
 * @param failure null이면 확인 중이다
 */
@Composable
fun AuthCheckScreen(failure: AuthFailure?, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.fillMaxSize().padding(Spacing.x4),
            verticalArrangement = Arrangement.spacedBy(Spacing.x3, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (failure == null) {
                StatusBlock(tone = StatusTone.Waiting, message = "로그인 정보를 확인하고 있어요")
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            } else {
                AuthFailureBlock(
                    failure = failure,
                    verb = "연결",
                    action = { AccenturyButton(text = "다시 시도", onClick = onRetry, variant = ButtonVariant.Secondary) },
                )
            }
        }
    }
}
