package com.accentury.app.auth

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.accentury.app.R
import com.accentury.app.ui.components.AccenturyButton
import com.accentury.app.ui.components.ButtonVariant
import com.accentury.app.ui.components.PaperFailureScreen
import com.accentury.app.ui.components.PaperCheck
import com.accentury.app.ui.components.PaperScreen
import com.accentury.app.ui.components.PaperSpinner
import com.accentury.app.ui.components.PaperWaitingScreen
import com.accentury.app.ui.components.StatusBlock
import com.accentury.app.ui.components.StatusTone
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.LightPoint
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.web.openStoreListing
import kotlinx.coroutines.launch

/**
 * 로그인 화면 (KAN-224). 인트로(웹)보다 앞에 서는 필수 관문이다.
 *
 * IdP 버튼은 각 사 버튼 가이드의 면·글자·문구를 그대로 쓴다 (2026-11-11 사용자 결정, KAN-311 시안 s-01-login·KAN-354).
 * 2026-09-28 팀장 결정(「Papercut 보조 버튼 유지」, 크림 면에 로고만 공식 색)을 바꿨다 — 출처·근거는
 * docs/wiki/social-login-logos.md. 순서는 구글 → 카카오 → 네이버.
 *
 * @param error 방금 실패한 서버 로그인의 안내 ([AuthGateState.SignedOut.error])
 * @param providers 이 빌드에 보일 버튼 ([visibleProviders])
 * @param signInFor 버튼 하나의 IdP 로그인. 실제 빌드는 [idpSignInFor]
 * @param onLogin 토큰을 받은 뒤의 서버 로그인 ([AuthGateController.login])
 * @param onOpenPrivacy [보기] — 방침 문서를 연다
 * @param onStartGuest 둘러보기 동의 단계의 [둘러보기] ([AuthGateController.startGuest], KAN-330). 실패 안내는 [error]로 돌아온다
 */
@Composable
fun LoginScreen(
    error: AuthFailure?,
    providers: List<Provider>,
    signInFor: (Provider) -> IdpSignIn,
    onLogin: suspend (LoginCredential) -> Unit,
    onOpenPrivacy: () -> Unit,
    onStartGuest: suspend () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state = rememberSaveable(saver = LoginScreenState.saver()) { LoginScreenState() }
    val scope = rememberCoroutineScope()
    // 로그인 SDK는 Activity 위에 자기 화면을 띄운다. 이 화면은 늘 MainActivity 안에서 돈다.
    val activity = checkNotNull(LocalActivity.current)

    // 히어로는 워드마크를 품고 가로 가운데, 아래 묶음 위 남은 칸의 세로 가운데에 선다 (2026-09-28 팀장 결정, iOS와 같은 배치).
    // 디자인 3(KAN-288)에서 앱바 워드마크·왼쪽 정렬로 바뀌었다가 사용자 결정(2026-10-29)으로 되돌렸다. 위아래 가중치가 같아서
    // 어느 화면 높이에서도 가운데다. 동의를 버튼 위에 둔 것은 버튼이 동의 전에는 눌리지 않기 때문이다 — 막은 이유가 먼저 보여야 한다.
    PaperScreen(modifier = modifier, appBar = false) {
        Spacer(Modifier.weight(1f))
        IntroHero(modifier = Modifier.align(Alignment.CenterHorizontally))
        Spacer(Modifier.weight(1f).heightIn(min = Spacing.x6))
        if (state.guestStep) {
            GuestConsentStep(state = state, onOpenPrivacy = onOpenPrivacy, onStart = { scope.launch { state.startGuest(onStartGuest) } })
        } else {
            ConsentRow(
                checked = state.consented,
                onCheckedChange = { state.consented = it },
                onOpenPrivacy = onOpenPrivacy,
            )
            Spacer(Modifier.height(Spacing.x3))
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(Spacing.x3),
            ) {
                // 시안 `.p1-social-list` gap 10
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    providers.forEach { provider ->
                        IdpButton(
                            provider = provider,
                            onClick = {
                                scope.launch {
                                    state.signIn(idp = { signInFor(provider).signIn(activity) }, login = onLogin)
                                }
                            },
                            enabled = state.buttonsEnabled,
                        )
                    }
                }
                // 소셜 버튼 아래 글자 버튼 (KAN-330, 애플 5.1.1(v) — 번역처럼 계정과 무관한 기능은 로그인 없이 쓰게 한다).
                // 동의 전에도 눌린다 — 누르면 동의 단계가 열리고 거기서 방침 동의와 만 14세 확인을 받는다.
                AccenturyButton(
                    text = "로그인 없이 둘러보기",
                    onClick = { state.guestStep = true },
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                    variant = ButtonVariant.Text,
                    enabled = !state.inFlight,
                )
            }
        }
        Spacer(Modifier.height(Spacing.x4))
        val shown = state.idpError ?: error
        when {
            // 설정이 하나도 없는 빌드 — 가짜 IdP도 꺼져 있으면 누를 것이 없다. 사용자에게는 업데이트 안내다.
            providers.isEmpty() -> AuthFailureBlock(AuthFailure(AuthFailureReason.Unsupported), verb = "로그인")
            shown != null -> AuthFailureBlock(shown, verb = "로그인")
            // 서버 로그인까지 도는 동안 버튼은 흐려지고 여기서 기다림을 알린다.
            state.inFlight -> PaperSpinner(modifier = Modifier.align(Alignment.CenterHorizontally))
        }
    }
}

/**
 * 웹 CSS의 줄 높이처럼 줄 간격을 글자 위아래로 나눠 두고 잘라내지 않는다. Compose 기본값은 첫 줄 위·끝 줄 아래
 * 간격을 잘라 내 웹보다 글자가 몇 dp씩 붙는다 — 히어로 줄 위치를 웹과 맞추려고 여기서만 쓴다.
 */
private val CssLineHeight = LineHeightStyle(alignment = LineHeightStyle.Alignment.Center, trim = LineHeightStyle.Trim.None)

/**
 * 웹 인트로의 상단 블록을 옮겼다 (KAN-224, `web/src/intro/IntroScreen.tsx` `.intro-hero`) — 앱 첫 화면이
 * 테스트 인트로와 같은 얼굴이어야 한다. 워드마크·제목·부제 모두 가운데 정렬이다.
 * 화면 이름은 두 줄 히어로 하나만 heading이다(웹 h1). 밑줄은 장식이라 의미론이 없다.
 */
@Composable
private fun IntroHero(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.x2),
    ) {
        Text("Accentury", style = MaterialTheme.typography.titleMedium.copy(lineHeightStyle = CssLineHeight), color = MaterialTheme.colorScheme.onBackground)
        // 밑줄 폭 = 제목 글자 폭 (웹 `.intro-heading`이 글자 폭으로 줄고 svg가 width 100%).
        Column(
            modifier = Modifier.width(IntrinsicSize.Max),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.x1),
        ) {
            Text(
                "사투리\n좀 치나?",
                // text-intro-hero 56 · leading-tight 1.15 — 네이티브 타입 슬롯에 없는 웹 전용 크기라 여기서만 덮는다
                style = MaterialTheme.typography.displayLarge.copy(fontSize = 56.sp, lineHeight = 64.sp, lineHeightStyle = CssLineHeight),
                color = MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { heading() },
            )
            // 웹 svg viewBox 0 0 200 12, `M 4 3.5 Q 100 13.5 196 3.5`, preserveAspectRatio none + non-scaling-stroke:
            // 좌표만 상자에 늘리고 굵기(7dp)는 그대로다.
            Canvas(modifier = Modifier.fillMaxWidth().height(Spacing.x3)) {
                val sx = size.width / 200f
                val sy = size.height / 12f
                val path = Path().apply {
                    moveTo(4f * sx, 3.5f * sy)
                    quadraticTo(100f * sx, 13.5f * sy, 196f * sx, 3.5f * sy)
                }
                drawPath(path, color = LightPoint, style = Stroke(width = 7.dp.toPx(), cap = StrokeCap.Round))
            }
        }
        Text(
            "내 목소리로 확인하는 사투리 억양",
            style = MaterialTheme.typography.bodyMedium.copy(lineHeightStyle = CssLineHeight),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * 필수 동의 한 줄. 줄 전체가 체크박스 하나로 읽히고 눌린다(48dp 터치). [보기]는 따로 눌리는 글자 버튼이다.
 */
@Composable
private fun ConsentRow(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    onOpenPrivacy: (() -> Unit)?,
    label: String = "개인정보 수집·이용 동의 (필수)",
) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Row(
            modifier = Modifier
                .weight(1f)
                .defaultMinSize(minHeight = Dimens.touchTargetMin)
                .toggleable(value = checked, role = Role.Checkbox, onValueChange = onCheckedChange),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PaperCheck(checked)
            // 시안 HIG 수정: 라벨 13/20 잉크. 상자와 12 사이 (`.p1-check` gap)
            Text(
                label,
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Normal),
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.padding(start = Spacing.x3),
            )
        }
        if (onOpenPrivacy != null) AccenturyButton(text = "보기", onClick = onOpenPrivacy, variant = ButtonVariant.Text)
    }
}

/**
 * 「로그인 없이 둘러보기」 동의 단계 (KAN-330). 소셜 버튼 자리를 갈아 끼운다 — 방침 동의는 소셜 가입과 같은 값([LoginScreenState.consented])
 * 이라 한쪽에서 체크하면 다른 쪽도 체크돼 있다. [돌아가기]는 소셜 버튼으로 되돌린다.
 */
@Composable
private fun GuestConsentStep(state: LoginScreenState, onOpenPrivacy: () -> Unit, onStart: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Spacing.x3)) {
        Column {
            ConsentRow(checked = state.consented, onCheckedChange = { state.consented = it }, onOpenPrivacy = onOpenPrivacy)
            ConsentRow(
                checked = state.over14,
                onCheckedChange = { state.over14 = it },
                onOpenPrivacy = null,
                label = "만 14세 이상입니다 (필수)",
            )
        }
        // iOS와 같은 라벨 (KAN-330 5단계) — 두 플랫폼 심사 경로를 같은 말로 맞춘다.
        AccenturyButton(
            text = "둘러보기 시작",
            onClick = onStart,
            modifier = Modifier.fillMaxWidth(),
            enabled = state.guestEnabled,
            // 시안 s-01b-login-guest의 → (KAN-354 3단계 — 2단계는 드로어블이 없어 미뤘다)
            trailing = { Icon(painterResource(R.drawable.ic_arrow_forward_24), null, Modifier.size(20.dp)) },
        )
        AccenturyButton(
            text = "돌아가기",
            onClick = { state.guestStep = false },
            modifier = Modifier.align(Alignment.CenterHorizontally),
            variant = ButtonVariant.Text,
            enabled = !state.inFlight,
        )
    }
}

/**
 * IdP 버튼 한 개 (KAN-354, 시안 `.p1-brand`). 각 사 가이드 규격이라 공용 [AccenturyButton]을 쓰지 않는다 — 폭 전체·높이 48·
 * 모서리 12·테두리와 그림자 없음·시스템 글꼴 15(Jua 라벨 규칙 제외)이고, 로고는 왼쪽에 고정, 문구는 버튼 가운데다.
 *
 * 눌림은 면 위에 검정 10%를 덮고, 비활성(방침 동의 전)은 버튼 전체를 40%로 흐린다 — 공용 비활성(그림자색 면)으로 바꾸면
 * 각 사 면색이 사라진다. 눌리지 않는 것과 스크린 리더의 「사용 중지됨」은 clickable(enabled)가 맡는다.
 */
@Composable
private fun IdpButton(provider: Provider, onClick: () -> Unit, enabled: Boolean) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val (fill, label) = idpColors(provider)
    val shape = RoundedCornerShape(12.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(Dimens.controlHeightLg)
            .alpha(if (enabled) 1f else IDP_DISABLED_ALPHA)
            .clip(shape)
            .background(fill)
            .then(if (pressed && enabled) Modifier.background(IdpPressedOverlay) else Modifier)
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        // 시안: 로고 왼쪽 16(구글 12), 문구는 좌우 48을 비운 가운데
        IdpLogo(provider, Modifier.align(Alignment.CenterStart).padding(start = if (provider == Provider.GOOGLE) Spacing.x3 else Spacing.x4))
        Text(
            providerLabel(provider),
            style = TextStyle(fontFamily = FontFamily.Default, fontSize = 15.sp, fontWeight = FontWeight.Medium, lineHeight = 15.sp),
            color = label,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = 48.dp),
        )
    }
}

/** 각 사 가이드의 버튼 색 (면, 글자) — 브랜드 고정값이라 테마 토큰으로 올리지 않는다 */
private fun idpColors(provider: Provider): Pair<Color, Color> = when (provider) {
    Provider.GOOGLE -> Color(0xFFF2F2F2) to Color(0xFF1F1F1F) // Neutral 테마
    Provider.KAKAO -> Color(0xFFFEE500) to Color.Black.copy(alpha = 0.85f)
    Provider.NAVER -> Color(0xFF03C75A) to Color.White
    // Android에는 애플 버튼이 없고(LOGIN_PROVIDERS) 게스트는 IdP가 아니다 — 애플 가이드의 검정 면만 채워 둔다
    Provider.APPLE, Provider.GUEST -> Color.Black to Color.White
}

private val IdpPressedOverlay = Color.Black.copy(alpha = 0.1f)
private const val IDP_DISABLED_ALPHA = 0.4f

/**
 * IdP 공식 로고 (KAN-224). 파일은 각 사 배포본에서 옮겼다 — 구글 G는 그라데이션·블러라 벡터 드로어블로
 * 옮길 수 없어 공식 SVG를 렌더링한 PNG다. 버튼 글자가 이미 제공자를 말하므로 스크린 리더에는 읽히지 않는다.
 * 크기는 시안 `.p1-brand img` 값이다(구글 20, 카카오 18×17, 네이버 16).
 */
@Composable
private fun IdpLogo(provider: Provider, modifier: Modifier) {
    val (res, size) = when (provider) {
        Provider.GOOGLE -> R.drawable.ic_idp_google to Modifier.size(20.dp)
        Provider.KAKAO -> R.drawable.ic_idp_kakao to Modifier.size(18.dp, 17.dp)
        Provider.NAVER -> R.drawable.ic_idp_naver to Modifier.size(16.dp)
        Provider.APPLE, Provider.GUEST -> return
    }
    Image(painterResource(res), contentDescription = null, modifier = modifier.then(size))
}

/** IdP 버튼 문구 — 각 사 가이드의 표기다 (KAN-354, 구글은 2026-11-16 결정) */
internal fun providerLabel(provider: Provider): String = when (provider) {
    Provider.GOOGLE -> "Google 계정으로 계속하기"
    Provider.KAKAO -> "카카오 로그인"
    Provider.NAVER -> "네이버 로그인"
    // Android 로그인 화면에는 없다(LOGIN_PROVIDERS)
    Provider.APPLE -> "Apple로 계속하기"
    Provider.GUEST -> "게스트"
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
    val (message, detail) = authFailureCopy(failure, verb)
    StatusBlock(tone = StatusTone.Error, message = message, detail = detail, modifier = modifier, action = action)
}

/** [AuthFailureBlock]과 시작 확인 실패 화면이 같은 문구를 쓴다 — (문구, 부연) */
private fun authFailureCopy(failure: AuthFailure, verb: String): Pair<String, String?> = when (failure.reason) {
    AuthFailureReason.Retry -> "${verb}하지 못했어요" to "네트워크를 확인하고 다시 시도해 주세요"
    AuthFailureReason.RetryLater -> "${verb}하지 못했어요" to "잠시 뒤에 다시 시도해 주세요"
    AuthFailureReason.RateLimited -> "잠시 뒤에 ${verb}할 수 있어요" to (
        failure.retryAfterSeconds?.let { "접속이 몰리고 있어요 · ${it}초 뒤에 다시 눌러 주세요" }
            ?: "접속이 몰리고 있어요 · 잠시 뒤에 다시 눌러 주세요"
        )
    AuthFailureReason.UnderAge -> "만 14세 이상만 가입할 수 있어요" to null
    // 서버 문구(「오늘은 로그인 없이 시작할 수 있는 횟수를 다 썼습니다」)와 같은 뜻이다 (KAN-330).
    AuthFailureReason.GuestLimitExceeded -> "오늘은 로그인 없이 둘러볼 수 없어요" to "로그인해서 이용해 주세요"
    AuthFailureReason.Unsupported -> "지금은 ${verb}할 수 없어요" to "앱을 최신 버전으로 업데이트한 뒤 다시 열어 주세요"
}

/**
 * 시작 확인 화면 (KAN-224). 첫 확인은 스플래시가 가리므로 이 화면의 대기 표시는 [다시 시도] 뒤에만 보인다.
 * 확인이 판정 없이 끝나면([AuthGateState.CheckFailed]) 토큰은 그대로 둔 채 다시 시도만 준다 —
 * 망이 잠깐 끊긴 사용자를 로그인 화면으로 보내면 멀쩡한 로그인을 버리게 한다. 배치는 시안 02·06b (KAN-288).
 *
 * @param failure null이면 확인 중이다
 */
@Composable
fun AuthCheckScreen(failure: AuthFailure?, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    if (failure == null) {
        PaperWaitingScreen(title = "로그인 정보를 확인하고 있어요", modifier = modifier)
    } else {
        val (message, detail) = authFailureCopy(failure, verb = "연결")
        // 재시도 불가 거절(Unsupported)은 업데이트 안내다 (KAN-288 시안 15) — [업데이트하기]가 스토어를 열고, 지금까지의
        // [다시 시도]는 [나중에]로 남는다.
        if (failure.reason == AuthFailureReason.Unsupported) {
            val context = LocalContext.current
            PaperFailureScreen(
                title = message,
                detail = detail,
                buttonLabel = "업데이트하기",
                onButtonClick = { openStoreListing(context) },
                modifier = modifier,
                secondaryLabel = "나중에",
                onSecondaryClick = onRetry,
            )
        } else {
            PaperFailureScreen(
                title = message,
                detail = detail,
                buttonLabel = "다시 시도",
                onButtonClick = onRetry,
                modifier = modifier,
                // 전송 실패(Retry)는 「네트워크를 확인하고」 문구라 연결 끊김 그림이다 (KAN-354)
                icon = if (failure.reason == AuthFailureReason.Retry) R.drawable.ic_offline_24 else R.drawable.ic_alert_24,
                buttonIcon = R.drawable.ic_refresh_24,
            )
        }
    }
}
