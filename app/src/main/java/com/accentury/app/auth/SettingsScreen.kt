package com.accentury.app.auth

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.accentury.app.R
import com.accentury.app.ads.AdConsent
import com.accentury.app.ui.components.AccenturyButton
import com.accentury.app.ui.components.ButtonVariant
import com.accentury.app.ui.components.ConfirmDialog
import com.accentury.app.ui.components.PaperTitle
import com.accentury.app.ui.components.StatusBlock
import com.accentury.app.ui.components.StatusTone
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.LightPaper
import com.accentury.app.ui.theme.LightPoint
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.ui.theme.accenturyColors
import kotlinx.coroutines.launch

/**
 * 설정 화면의 로그인 방식 표기 (KAN-247). 로그인 버튼의 라벨(LoginScreen `providerLabel`, 「카카오 로그인」 꼴)과
 * 따로 두는 이유: 저쪽은 각 사 버튼 가이드의 표기를 따르고, 여기는 사용자가 읽는 한국어 문장 속 값이다.
 */
internal fun providerName(provider: Provider): String = when (provider) {
    Provider.GOOGLE -> "구글"
    Provider.KAKAO -> "카카오"
    Provider.NAVER -> "네이버"
    Provider.APPLE -> "애플"
    Provider.GUEST -> "게스트"
}

/**
 * 광고 신고 메일의 받는 주소 — 방침 13항 문의처·스토어 연락처와 같은 주소다 (docs/wiki/play-store-listing.md §3).
 * 신고 창구가 문의처와 다르면 이용자가 두 곳에 묻게 된다.
 */
internal const val SUPPORT_EMAIL = "team2pl1@gmail.com"

/**
 * 「광고 신고」 메일 작성 화면을 연다 (KAN-344-4, 애플 가이드라인 1.2 — 부적절한 콘텐츠를 신고할 수단). 광고 SDK에는 앱이 띄울 신고
 * 화면이 없어 문의 메일로 받는다. 메일 앱이 없으면 아무 일도 하지 않는다 — 방침 문서의 문의처가 남은 경로다.
 */
internal fun openAdReportMail(context: Context) {
    val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:"))
        .putExtra(Intent.EXTRA_EMAIL, arrayOf(SUPPORT_EMAIL))
        .putExtra(Intent.EXTRA_SUBJECT, "[광고 신고] Accentury")
        .putExtra(
            Intent.EXTRA_TEXT,
            "신고할 광고의 화면 캡처를 붙여 주세요.\n\n- 광고를 본 시각:\n- 광고가 나온 화면:\n- 신고 사유:\n",
        )
    try {
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        // 메일 앱 없음 — 위 KDoc
    }
}

/**
 * 「맞춤형 광고 설정」 행의 보조 줄 (KAN-315). 값은 설정을 열 때 [AdConsent] 저장소에서 읽은 것이다.
 * 행이 비활성(테스트 진행·시작 게이트 중, PR #60 리뷰)이면 값 대신 언제 바꿀 수 있는지를 보인다.
 */
internal fun adConsentSettingValue(consent: AdConsent, enabled: Boolean): String = when {
    !enabled -> "테스트가 끝난 뒤 바꿀 수 있어요"
    consent == AdConsent.Granted -> "맞춤형 광고 허용"
    consent == AdConsent.Denied -> "일반 광고만 보기"
    else -> "아직 고르지 않음"
}

/**
 * 웹 화면 위에 뜨는 설정 진입 톱니 (KAN-247, 팀 결정 A안). 웹·브리지를 건드리지 않고 네이티브가 WebView 위에
 * 얹는다 — 진입점을 웹 화면마다 만들면 브리지 계약이 하나 늘고 iOS까지 같이 바뀐다.
 *
 * 모양은 크림 원에 톱니만 얹고 테두리·그림자는 없다(테두리는 팀장 요청으로 뺐다, 2026-10-03) —
 * 웹 화면의 주 버튼보다 무게가 앞서면 안 된다. 터치 영역은 ux-ui.md §5 최소선 48dp다.
 */
@Composable
fun SettingsGearButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(Dimens.touchTargetMin)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.background)
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painter = painterResource(R.drawable.outline_settings_24),
            contentDescription = "설정",
            tint = MaterialTheme.colorScheme.primary,
        )
    }
}

/**
 * 설정 화면 (KAN-247). 계정 정보, 회원 탈퇴(KAN-251), 음성 저장 동의(KAN-270), 로그아웃.
 *
 * TestFlow를 컴포지션에서 내리지 않고 **그 위를 덮는다** — WebView는 인트로부터 테스트 끝까지 한 인스턴스로
 * 살아야 하므로(TestFlow KDoc) 닫으면 보던 웹 화면 그대로다. 시스템 뒤로 가기도 닫기와 같다. 열고 닫기는 전환 없이
 * 바로 바뀐다 — 티켓의 300ms 이하를 채우고, 움직임 줄이기에서도 같은 결과다 (KAN-354).
 *
 * 계정 값은 게이트가 이미 든 [AuthGateState.SignedIn.user]를 쓴다 — 로그인·시작 확인 때 서버가 준 값이라
 * `/v0/users/me`를 또 부를 이유가 없다.
 *
 * @param onLogout [AuthGateController.logout]. 끝나면 게이트가 SignedOut이 되어 이 화면째 로그인 화면으로 바뀐다
 * @param onWithdraw [AuthGateController.withdraw]. 탈퇴되면 로그아웃과 같이 로그인 화면으로 바뀌고, 실패하면 로그인 상태
 *   그대로 확인 창에 안내를 남긴다
 * @param voiceConsent [AuthGateState.SignedIn.voiceConsent] (KAN-270). null이면 스위치 대신 [다시 시도]를 보인다
 * @param onVoiceConsentChange [AuthGateController.setVoiceConsent]
 * @param onReloadVoiceConsent [AuthGateController.reloadVoiceConsent]
 * @param onOpenPrivacy 방침 문서 (LoginScreen과 같은 호출)
 * @param adConsent 맞춤형 광고 동의 현재 값 (KAN-315). 설정을 열 때 읽은 값이면 된다 — 시트에서 바꿀 때 설정은 이미 닫혀 있다
 * @param onOpenAdConsent 「맞춤형 광고 설정」을 눌렀다 (KAN-315). 호출자가 설정을 닫고 웹 홈의 광고 동의 시트로 옮긴다
 * @param adConsentEnabled 지금 광고 동의 시트를 다시 열 수 있나 (PR #60 리뷰). 테스트 진행·시작 게이트 중엔 false라 행이 비활성이다
 */
@Composable
fun SettingsScreen(
    user: AuthUser,
    voiceConsent: VoiceConsent?,
    onClose: () -> Unit,
    onLogout: suspend () -> Unit,
    onWithdraw: suspend () -> WithdrawOutcome,
    onVoiceConsentChange: suspend (Boolean) -> AuthResult<Account>,
    onReloadVoiceConsent: suspend () -> Unit,
    onOpenPrivacy: () -> Unit,
    adConsent: AdConsent,
    onOpenAdConsent: () -> Unit,
    adConsentEnabled: Boolean,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    // 회전해도 확인 창이 남게 저장한다. 진행 중 표시는 회전으로 화면 스코프가 끊기면 의미가 없어 remember다.
    var confirming by rememberSaveable { mutableStateOf(false) }
    var leaving by remember { mutableStateOf(false) }
    var confirmingWithdraw by rememberSaveable { mutableStateOf(false) }
    var withdrawing by remember { mutableStateOf(false) }
    var withdrawFailed by remember { mutableStateOf(false) }
    val busy = leaving || withdrawing

    BackHandler(onBack = onClose)

    // 시안 s-11-settings 「B 목록형」 (KAN-354): 왼쪽 「설정」·오른쪽 ✕ 머리, 계정·광고·개인정보 묶음. 바닥 고정 버튼은 없다.
    SettingsFrame(onClose = onClose, closeEnabled = !busy, modifier = modifier) {
        GroupLabel("계정", first = true)
        // 추가 정보 화면을 지나 SignedIn이면 이름·이메일은 늘 있다. 서버 값이 비어 오는 경우만 대비한다.
        SettingsRow(R.drawable.ic_user_24, "이름", value = user.name ?: "-")
        RowDivider()
        SettingsRow(R.drawable.ic_mail_24, "이메일", value = user.email ?: "-")
        RowDivider()
        SettingsRow(R.drawable.ic_key_24, "로그인 방식", value = providerName(user.provider))
        // 계정 행 바로 아래 (시안 `.p5-account-actions`). 탈퇴는 KAN-251 팀 결정대로 두 번 누른다 — 여기서 한 번, 확인 창의 [탈퇴]에서 한 번 더.
        AccountActions {
            AccenturyButton(
                text = "로그아웃",
                onClick = { confirming = true },
                modifier = Modifier.fillMaxWidth(),
                variant = ButtonVariant.Secondary,
                enabled = !busy,
                leading = { ButtonIcon(R.drawable.ic_logout_24) },
            )
            AccenturyButton(
                text = "회원 탈퇴",
                onClick = {
                    withdrawFailed = false
                    confirmingWithdraw = true
                },
                modifier = Modifier.fillMaxWidth(),
                variant = ButtonVariant.Text,
                enabled = !busy,
                leading = { ButtonIcon(R.drawable.ic_trash_24) },
            )
        }

        GroupLabel("광고")
        AdConsentRow(consent = adConsent, available = adConsentEnabled, enabled = !busy && adConsentEnabled, onClick = onOpenAdConsent)
        RowDivider()
        AdReportRow()

        VoiceConsentSection(
            consented = voiceConsent?.consented,
            onChange = { onVoiceConsentChange(it) is AuthResult.Success },
            onReload = onReloadVoiceConsent,
            onOpenPrivacy = onOpenPrivacy,
        )
    }

    if (confirming) {
        ConfirmDialog(
            title = "로그아웃할까요?",
            onDismiss = { if (!leaving) confirming = false },
            confirmLabel = "로그아웃",
            // 로그아웃은 되돌릴 수 있는 확인이라 시안대로 벽돌 채움 주 버튼이다 (KAN-354, s-11-confirm-logout)
            confirmVariant = ButtonVariant.Primary,
            onConfirm = {
                scope.launch {
                    leaving = true
                    try {
                        onLogout()
                    } finally {
                        leaving = false
                        confirming = false
                    }
                }
            },
            busy = leaving,
        ) {
            Text("다시 쓰려면 로그인해야 해요")
        }
    }

    /*
     * 탈퇴 확인 창 (KAN-251). 문구는 개인정보처리방침의 말("탈퇴하시면 지체 없이 파기합니다")과 맞춘다.
     * [탈퇴]는 벽돌 외곽선 확인 버튼에 휴지통을 앞에 둔다 (KAN-354 확정 결정, 시안 s-11-confirm-withdraw의 채움 그림은 이 결정으로 읽는다) —
     * 벽돌 채움이면 주 버튼과 같은 무게라 "눌러도 되는 쪽"으로 읽힌다. 시안 문구 「계정 삭제」 대신 현재 문구를 유지한다.
     */
    if (confirmingWithdraw) {
        ConfirmDialog(
            title = "회원 탈퇴할까요?",
            onDismiss = { if (!withdrawing) confirmingWithdraw = false },
            confirmLabel = if (withdrawing) "탈퇴하는 중" else "탈퇴",
            onConfirm = {
                // launch 앞에서 세워야 이중 탭이 두 번째 요청을 만들지 않는다(설정 토글과 같은 이유).
                withdrawing = true
                withdrawFailed = false
                scope.launch {
                    try {
                        // 탈퇴되면 게이트가 SignedOut이 되어 이 화면째 내려간다.
                        withdrawFailed = onWithdraw() is WithdrawOutcome.Failed
                    } finally {
                        withdrawing = false
                    }
                }
            },
            busy = withdrawing,
            confirmLeading = { ButtonIcon(R.drawable.ic_trash_24) },
        ) {
            Text(
                "계정 정보(이메일·이름 등)는 탈퇴하면 지체 없이 파기해요\n" +
                    "테스트 결과는 계정과 분리돼 익명으로 남아요\n" +
                    "탈퇴하면 되돌릴 수 없어요",
            )
            // 실패는 로그인 상태 그대로다 — 창을 닫지 않고 여기서 알려 같은 자리에서 다시 누르게 한다.
            if (withdrawFailed) {
                StatusBlock(tone = StatusTone.Error, message = "탈퇴되지 않았어요 · 네트워크를 확인하고 다시 시도해 주세요")
            }
        }
    }
}

/**
 * 로그인을 끈 빌드(익명 모드)의 설정 화면 (KAN-270 5단계). 톱니는 그대로 두고 「광고 신고」와 「개인정보」만 남긴다 — 계정 섹션·
 * 로그아웃·계정 동의 토글은 없다. 스위치는 [AnonymousVoiceConsentStore]를 바꾸고 다음 세션 생성부터 반영된다.
 * 덮는 방식·뒤로 가기·목록형 서식(KAN-354)은 [SettingsScreen]과 같다.
 *
 * 게스트 계정(KAN-330)도 이 화면이다 — 게스트의 레벨 테스트는 서버가 익명 세션으로 받아(§3.21) 음성 동의가 같은 기기 로컬
 * 값이고, 계정 행·회원 탈퇴는 지울 개인 정보가 없어 두지 않는다. 대신 「계정」 묶음에 [onLogin]의 「로그인」을 둔다 —
 * 회원 설정의 [로그아웃] 자리다(KAN-354, 바닥 고정 버튼 없음).
 *
 * @param onLogin 게스트만 — 게스트 토큰을 버리고 로그인 화면으로 ([AuthGateController.requestLogin]). null이면 「계정」 묶음이 없다
 * @param adConsent 게스트만 — 「맞춤형 광고 설정」 행의 값 (KAN-330 5단계, iOS 게스트 설정과 맞춤). null이면 행이 없다.
 *   [adConsentEnabled]·[onOpenAdConsent]는 [SettingsScreen]과 같다
 */
@Composable
fun AnonymousSettingsScreen(
    consented: Boolean,
    onChange: (Boolean) -> Unit,
    onOpenPrivacy: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    onLogin: (() -> Unit)? = null,
    adConsent: AdConsent? = null,
    adConsentEnabled: Boolean = false,
    onOpenAdConsent: () -> Unit = {},
) {
    BackHandler(onBack = onClose)
    SettingsFrame(onClose = onClose, modifier = modifier) {
        if (onLogin != null) {
            GroupLabel("계정", first = true)
            // iOS `GuestSettingsScreen`과 같은 문장·순서(안내 → [로그인]). 글자는 음성 저장 동의 안내와 같은 12/18 흐린 잉크다 (KAN-354 AC).
            Text("로그인하면 억양 학습과 단어 학습 기록을 남길 수 있어요", style = SMALL_TEXT, color = MaterialTheme.colorScheme.onSurfaceVariant)
            AccountActions {
                AccenturyButton(text = "로그인", onClick = onLogin, modifier = Modifier.fillMaxWidth())
            }
        }
        GroupLabel("광고", first = onLogin == null)
        adConsent?.let {
            AdConsentRow(consent = it, available = adConsentEnabled, enabled = adConsentEnabled, onClick = onOpenAdConsent)
            RowDivider()
        }
        AdReportRow()
        // consented가 늘 있어 [다시 시도] 갈래는 닿지 않는다 — onReload는 빈 함수다.
        VoiceConsentSection(
            consented = consented,
            onChange = { onChange(it); true },
            onReload = {},
            onOpenPrivacy = onOpenPrivacy,
            caption = VOICE_CONSENT_SETTING_CAPTION_ANONYMOUS,
        )
    }
}

/**
 * 설정 화면 틀 (KAN-354, 시안 s-11-settings `.app-bar`·`.p5-list`). 머리는 왼쪽 「설정」 제목(Jua 26)·오른쪽 48 ✕이고
 * 스크롤하지 않는다. 목록은 좌우 24 안에서 스크롤한다. 워드마크 앱바·바닥 고정 버튼 자리가 없어 [PaperScreen]을 쓰지 않는다.
 * 배경 크림은 아래 WebView 배경(#f3ecd9)과 같다 (RecordingOverlay와 같은 이유).
 */
@Composable
private fun SettingsFrame(
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
    closeEnabled: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            // ✕ 상자의 오른쪽 여백은 [PaperAppBar]와 같은 12 — 글리프가 본문 오른쪽 선(24)에 맞는다.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = Spacing.x6, end = Spacing.x3, top = Spacing.x2)
                    .height(APP_BAR_HEIGHT),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PaperTitle("설정", modifier = Modifier.weight(1f))
                Box(
                    modifier = Modifier
                        .size(Dimens.touchTargetMin)
                        .clickable(enabled = closeEnabled, role = Role.Button, onClick = onClose),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        painter = painterResource(R.drawable.outline_close_24),
                        contentDescription = "설정 닫기",
                        tint = MaterialTheme.colorScheme.onBackground,
                    )
                }
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(start = Spacing.x6, end = Spacing.x6, top = Spacing.x1, bottom = Spacing.x6),
                content = content,
            )
        }
    }
}

/** 시안 `.app-bar` 높이 56 */
private val APP_BAR_HEIGHT = 56.dp

/** 시안 `.row` 높이 56 — 터치 최소 48보다 크다 */
private val ROW_MIN_HEIGHT = 56.dp

/** 시안 `.row`·`.value` 글자 13 */
private val ROW_TEXT = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Normal, fontSize = 13.sp, lineHeight = 20.sp)

/** 시안 `.section-label`·`.caption` 글자 12/18 */
private val SMALL_TEXT = TextStyle(fontFamily = FontFamily.Default, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 18.sp)

/** 설정 묶음 이름 (시안 `.section-label`: 12 흐린 잉크, 위 6·아래 2, 첫 묶음은 위 여백 없음) */
@Composable
private fun GroupLabel(text: String, first: Boolean = false) {
    Text(
        text,
        style = SMALL_TEXT,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .padding(top = if (first) 0.dp else Spacing.x2, bottom = Spacing.x1)
            .semantics { heading() },
    )
}

/** 행 사이 그림자색 1 실선 (시안 `.row + .row`) */
@Composable
private fun RowDivider() {
    HorizontalDivider(thickness = 1.dp, color = MaterialTheme.accenturyColors.primaryDim)
}

/** 행 앞 선화 20 (시안 `.icon`). 이름은 행 글자가 읽으므로 그림은 읽지 않는다 */
@Composable
private fun RowIcon(@DrawableRes icon: Int, size: Dp = ICON_SIZE) {
    Icon(painterResource(icon), contentDescription = null, modifier = Modifier.size(size))
}

/** 버튼 라벨 앞 아이콘 20 (1단계 계약) */
@Composable
private fun ButtonIcon(@DrawableRes icon: Int) {
    Icon(painterResource(icon), contentDescription = null, modifier = Modifier.size(ICON_SIZE))
}

private val ICON_SIZE = 20.dp

/**
 * 목록 한 행 (시안 `.row`): 앞 선화, 라벨, 오른쪽 흐린 값, [onClick]이 있으면 오른쪽 꺾쇠와 행 전체 누름.
 * 높이 56 이상이라 글자를 키우면 행이 따라 자란다. [caption]은 라벨 아래 흐린 줄이다(「광고 신고」의 받는 주소).
 */
@Composable
private fun SettingsRow(
    @DrawableRes icon: Int,
    label: String,
    value: String? = null,
    caption: String? = null,
    onClick: (() -> Unit)? = null,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = ROW_MIN_HEIGHT)
            .then(if (onClick != null) Modifier.clickable(enabled = enabled, role = Role.Button, onClick = onClick) else Modifier)
            .padding(vertical = Spacing.x2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ROW_GAP),
    ) {
        RowIcon(icon)
        Column(Modifier.weight(if (value == null) 1f else 0.45f)) {
            Text(label, style = ROW_TEXT)
            if (caption != null) Text(caption, style = SMALL_TEXT, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (value != null) {
            Text(
                value,
                style = ROW_TEXT,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(0.55f),
            )
        }
        if (onClick != null) RowIcon(R.drawable.ic_chevron_24, size = CHEVRON_SIZE)
    }
}

/** 시안 `.row` 간격 10 */
private val ROW_GAP = 10.dp

/** 시안 `.chevron` 14 */
private val CHEVRON_SIZE = 14.dp

/** 계정 행 아래 버튼 자리 (시안 `.p5-account-actions`: 위 8, 버튼 사이 4, 버튼은 폭 전체) */
@Composable
private fun AccountActions(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = Spacing.x2, bottom = Spacing.x2),
        verticalArrangement = Arrangement.spacedBy(Spacing.x1),
        content = content,
    )
}

/**
 * 「광고 신고」 행 (KAN-344-4). 「맞춤형 광고 설정」 바로 아래 같은 목록 행이다. 회원·게스트·익명 설정 모두에 선다.
 * 받는 주소를 캡션에 보인다 — 메일 앱이 없는 기기는 탭해도 반응이 없어 신고할 곳을 알 길이 없다(iOS `AdReportRow`와 같다, PR #70 리뷰).
 */
@Composable
private fun AdReportRow() {
    val context = LocalContext.current
    SettingsRow(
        icon = R.drawable.ic_flag_24,
        label = "광고 신고",
        caption = "부적절한 광고를 ${SUPPORT_EMAIL}로 알려 주세요",
        onClick = { openAdReportMail(context) },
    )
}

/**
 * 「맞춤형 광고 설정」 행 (KAN-315, 팀 결정 2026-11-03). 광고 동의 시트를 다시 여는 유일한 네이티브 경로다.
 * 값은 오른쪽 흐린 글자, 그 뒤 꺾쇠다 (시안 `.row.ad`). 줄 전체가 버튼 하나로 눌린다.
 */
@Composable
private fun AdConsentRow(consent: AdConsent, available: Boolean, enabled: Boolean, onClick: () -> Unit) {
    SettingsRow(
        icon = R.drawable.ic_megaphone_24,
        label = "맞춤형 광고 설정",
        value = adConsentSettingValue(consent, available),
        onClick = onClick,
        enabled = enabled,
    )
}

/**
 * 「개인정보」 묶음 — 음성 저장 선택 동의의 유일한 켜고 끄는 자리 (KAN-270, 팀 결정 2026-10-06: 건너뛴 사용자에게
 * 동의 화면을 다시 띄우지 않는다). 스위치 행, 안내, 「개인정보처리방침」 행 순서다 (시안 `.voice`·`.caption`·`.policy`).
 *
 * 스위치는 서버 값([VoiceConsent.consented])을 따른다. 누르는 동안만 새 값을 먼저 보여 주고, 실패하면 그 값을 버려
 * 원래 자리로 돌아간 뒤 한 줄 안내를 남긴다. 서버가 받은 값이 아니면 켜진 것처럼 보이면 안 된다.
 *
 * 익명 모드(KAN-270 5단계, [AnonymousSettingsScreen])도 이 묶음을 쓴다 — 값은 기기 로컬이고 바꾸기는 늘 성공한다.
 *
 * @param consented 지금 값. null이면(계정 모드에서 상태를 못 받음) 스위치 대신 [다시 시도]
 * @param onChange 새 값을 남긴다. true면 성공
 * @param caption 스위치 아래 안내. 익명 모드는 [VOICE_CONSENT_SETTING_CAPTION_ANONYMOUS]
 */
@Composable
private fun VoiceConsentSection(
    consented: Boolean?,
    onChange: suspend (Boolean) -> Boolean,
    onReload: suspend () -> Unit,
    onOpenPrivacy: () -> Unit,
    caption: String = VOICE_CONSENT_SETTING_CAPTION,
) {
    val scope = rememberCoroutineScope()
    var pending by remember { mutableStateOf<Boolean?>(null) }
    var failed by remember { mutableStateOf(false) }
    var reloading by remember { mutableStateOf(false) }

    GroupLabel("개인정보")
    if (consented == null) {
        Row(
            modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = ROW_MIN_HEIGHT),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(ROW_GAP),
        ) {
            RowIcon(R.drawable.ic_mic_24)
            Text(VOICE_CONSENT_SETTING_LABEL, style = ROW_TEXT, modifier = Modifier.weight(1f))
            Text("상태를 불러오지 못했어요", style = ROW_TEXT, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        AccenturyButton(
            text = "다시 시도",
            onClick = {
                scope.launch {
                    reloading = true
                    try {
                        onReload()
                    } finally {
                        reloading = false
                    }
                }
            },
            variant = ButtonVariant.Text,
            enabled = !reloading,
        )
    } else {
        val checked = pending ?: consented
        // 줄 전체가 스위치 하나로 읽히고 눌린다(toggleable + Role.Switch가 켜짐·꺼짐을 말로 읽는다) — LoginScreen 동의 줄과 같은 구성.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = ROW_MIN_HEIGHT)
                .toggleable(value = checked, role = Role.Switch, enabled = pending == null) { next ->
                    // launch 앞에서 세워야 이중 탭이 두 번째 요청을 만들지 않는다(리뷰 P2-1, iOS는 동기라 해당 없음).
                    pending = next
                    failed = false
                    scope.launch {
                        try {
                            failed = !onChange(next)
                        } finally {
                            pending = null
                        }
                    }
                },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(ROW_GAP),
        ) {
            RowIcon(R.drawable.ic_mic_24)
            Text(VOICE_CONSENT_SETTING_LABEL, style = ROW_TEXT, modifier = Modifier.weight(1f))
            PaperSwitch(checked = checked, enabled = pending == null)
        }
        if (failed) StatusBlock(tone = StatusTone.Error, message = "바꾸지 못했어요 · 잠시 후 다시 시도해 주세요")
    }
    Text(
        caption,
        style = SMALL_TEXT,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(bottom = Spacing.x2),
    )
    RowDivider()
    // 시안 `.policy`: 방패 선화, 밑줄 글자, 오른쪽 외부 링크 16
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = ROW_MIN_HEIGHT)
            .clickable(role = Role.Button, onClick = onOpenPrivacy),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ROW_GAP),
    ) {
        RowIcon(R.drawable.ic_shield_24)
        Text(
            "개인정보처리방침",
            style = ROW_TEXT.copy(textDecoration = TextDecoration.Underline),
            modifier = Modifier.weight(1f),
        )
        RowIcon(R.drawable.ic_external_24, size = EXTERNAL_ICON_SIZE)
    }
}

/** 시안 `.end` 16 */
private val EXTERNAL_ICON_SIZE = 16.dp

/**
 * 시안 `.switch` (KAN-354): 38×24 모서리 4 트랙에 16 네모 손잡이. 꺼짐은 paper 트랙·잉크 손잡이, 켜짐은 벽돌 트랙·paper 손잡이와
 * 왼쪽 체크. 그림만 그린다 — 누름과 읽기는 행의 toggleable이 맡는다. 진행 중(비활성)은 시안 `--opacity-disabled` 0.6이다.
 * 손잡이는 전환 없이 자리를 바꾼다(움직임 줄이기와 같은 결과).
 */
@Composable
private fun PaperSwitch(checked: Boolean, enabled: Boolean) {
    val ink = MaterialTheme.colorScheme.onBackground
    Box(
        modifier = Modifier
            .size(Dimens.touchTargetMin)
            .alpha(if (enabled) 1f else DISABLED_ALPHA),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(width = 38.dp, height = 24.dp)
                .clip(RoundedCornerShape(Radius.sm))
                .background(if (checked) LightPoint else LightPaper)
                .border(1.dp, ink, RoundedCornerShape(Radius.sm)),
        ) {
            if (checked) {
                Icon(
                    painterResource(R.drawable.ic_check_24),
                    contentDescription = null,
                    tint = LightPaper,
                    modifier = Modifier.align(Alignment.CenterStart).padding(start = 2.dp).size(12.dp),
                )
            }
            Box(
                modifier = Modifier
                    .align(if (checked) Alignment.CenterEnd else Alignment.CenterStart)
                    .padding(horizontal = 3.dp)
                    .size(16.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(if (checked) LightPaper else ink),
            )
        }
    }
}

/** 시안 `--opacity-disabled` */
private const val DISABLED_ALPHA = 0.6f
