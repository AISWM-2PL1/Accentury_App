package com.accentury.app.auth

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import com.accentury.app.R
import com.accentury.app.ui.components.AccenturyButton
import com.accentury.app.ui.components.ButtonVariant
import com.accentury.app.ui.components.PaperScreen
import com.accentury.app.ui.components.PaperTitle
import com.accentury.app.ui.components.StatusBlock
import com.accentury.app.ui.components.StatusTone
import com.accentury.app.ui.components.paperShadow
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.LightPoint
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.ui.theme.accenturyColors
import kotlinx.coroutines.launch

/**
 * 설정 화면의 로그인 방식 표기 (KAN-247). 로그인 버튼의 라벨(LoginScreen `providerLabel`, "Google로 계속" 꼴)과
 * 따로 두는 이유: 저쪽은 각 사 버튼 가이드의 표기를 따르고, 여기는 사용자가 읽는 한국어 문장 속 값이다.
 */
internal fun providerName(provider: Provider): String = when (provider) {
    Provider.GOOGLE -> "구글"
    Provider.KAKAO -> "카카오"
    Provider.NAVER -> "네이버"
    Provider.APPLE -> "애플"
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
 * 살아야 하므로(TestFlow KDoc) 닫으면 보던 웹 화면 그대로다. 시스템 뒤로 가기도 닫기와 같다.
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

    // 시안 49 배치 (KAN-288 디자인 3): 앱바 오른쪽 48dp 닫기 ✕, Jua 제목, 실선으로 갈린 계정 줄, 바닥 고정 [로그아웃].
    // 배경 크림은 아래 WebView 배경(#f3ecd9)과 같다 (RecordingOverlay와 같은 이유).
    PaperScreen(
        modifier = modifier,
        onClose = onClose,
        closeEnabled = !busy,
        footer = {
            AccenturyButton(
                text = "로그아웃",
                onClick = { confirming = true },
                modifier = Modifier.fillMaxWidth(),
                variant = ButtonVariant.Secondary,
                enabled = !busy,
            )
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.x6)) {
            PaperTitle("설정")

            Column {
                GroupLabel("계정")
                // 추가 정보 화면을 지나 SignedIn이면 이름·이메일은 늘 있다. 서버 값이 비어 오는 경우만 대비한다.
                AccountRow("이름", user.name ?: "-")
                AccountRow("이메일", user.email ?: "-")
                AccountRow("로그인 방식", providerName(user.provider))
                // 계정 섹션 맨 아래 (KAN-251, 팀 결정: 버튼 두 번 — 여기서 한 번, 확인 창의 [탈퇴]에서 한 번 더).
                AccenturyButton(
                    text = "회원 탈퇴",
                    onClick = {
                        withdrawFailed = false
                        confirmingWithdraw = true
                    },
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                    variant = ButtonVariant.Text,
                    enabled = !busy,
                )
            }

            VoiceConsentSection(
                consented = voiceConsent?.consented,
                onChange = { onVoiceConsentChange(it) is AuthResult.Success },
                onReload = onReloadVoiceConsent,
                onOpenPrivacy = onOpenPrivacy,
            )
        }
    }

    if (confirming) {
        ConfirmDialog(
            title = "로그아웃할까요?",
            onDismiss = { if (!leaving) confirming = false },
            confirmLabel = "로그아웃",
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
            Text("다시 쓰려면 로그인해야 해요", style = MaterialTheme.typography.bodyMedium)
        }
    }

    /*
     * 탈퇴 확인 창 (KAN-251). 문구는 개인정보처리방침의 말("탈퇴하시면 지체 없이 파기합니다")과 맞춘다.
     * [탈퇴]는 벽돌 외곽선 확인 버튼이다 (KAN-288 시안 HIG 수정) — 벽돌 채움이면 주 버튼과 같은 무게라 "눌러도 되는
     * 쪽"으로 읽히고, 잉크 텍스트 버튼이면 [취소]와 구별되지 않았다. 시안 문구 「계정 삭제」 대신 현재 문구를 유지한다.
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
        ) {
            Text(
                "계정 정보(이메일·이름 등)는 탈퇴하면 지체 없이 파기해요\n" +
                    "테스트 결과는 계정과 분리돼 익명으로 남아요\n" +
                    "탈퇴하면 되돌릴 수 없어요",
                style = MaterialTheme.typography.bodyMedium,
            )
            // 실패는 로그인 상태 그대로다 — 창을 닫지 않고 여기서 알려 같은 자리에서 다시 누르게 한다.
            if (withdrawFailed) {
                StatusBlock(tone = StatusTone.Error, message = "탈퇴되지 않았어요 · 네트워크를 확인하고 다시 시도해 주세요")
            }
        }
    }
}

/**
 * 확인 창 (시안 50·50b, KAN-288). 설정 화면 위에 반투명 잉크 막을 깔고 종이 한 장을 띄운다 — 확인은 벽돌 외곽선,
 * 취소는 보조 버튼. AlertDialog는 막 색(시스템 dim)과 버튼 배치를 시안대로 바꿀 수 없어 Dialog 위에 직접 그린다.
 * 막 밖을 누르거나 뒤로 가기를 하면 [onDismiss] — AlertDialog와 같다.
 *
 * 막 색만 팔레트의 유일한 알파 값이다 — 시안 HIG 수정이 rgba(28,26,23,0.45)로 못박았다. 불투명 그림자색 막이면
 * 뒤의 설정 화면이 사라져 "어디서 뜬 창인지"가 안 보였다.
 */
@Composable
private fun ConfirmDialog(
    title: String,
    onDismiss: () -> Unit,
    confirmLabel: String,
    onConfirm: () -> Unit,
    busy: Boolean,
    body: @Composable ColumnScope.() -> Unit,
) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        // 시스템 dim을 끄고 막을 직접 칠한다 — 둘 다 두면 막이 두 겹이 된다.
        (LocalView.current.parent as? DialogWindowProvider)?.window?.let { window ->
            SideEffect { window.setDimAmount(0f) }
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(DIALOG_SCRIM)
                .clickable(interactionSource = null, indication = null, onClick = onDismiss)
                .padding(Spacing.x4),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .paperShadow(MaterialTheme.colorScheme.onSurfaceVariant, Radius.lg)
                    .clip(RoundedCornerShape(Radius.lg))
                    .background(MaterialTheme.colorScheme.background)
                    .border(1.dp, MaterialTheme.colorScheme.onBackground, RoundedCornerShape(Radius.lg))
                    // 종이 안을 눌러도 창이 닫히지 않게 막의 클릭을 여기서 끊는다
                    .clickable(interactionSource = null, indication = null, onClick = {})
                    .padding(horizontal = Spacing.x4, vertical = Spacing.x6),
                verticalArrangement = Arrangement.spacedBy(Spacing.x4),
            ) {
                PaperTitle(title)
                body()
                AccenturyButton(
                    text = confirmLabel,
                    onClick = onConfirm,
                    modifier = Modifier.fillMaxWidth(),
                    variant = ButtonVariant.Destructive,
                    enabled = !busy,
                )
                AccenturyButton(
                    text = "취소",
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth(),
                    variant = ButtonVariant.Secondary,
                    enabled = !busy,
                )
            }
        }
    }
}

/** rgba(28,26,23,0.45) — 잉크 45% */
private val DIALOG_SCRIM = Color(0x731C1A17)

/** 설정 묶음 이름 (시안 `.group-label`) */
@Composable
private fun GroupLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.padding(bottom = Spacing.x2).semantics { heading() },
    )
}

/**
 * 「개인정보」 섹션 — 음성 저장 선택 동의의 유일한 켜고 끄는 자리 (KAN-270, 팀 결정 2026-10-06: 건너뛴 사용자에게
 * 동의 화면을 다시 띄우지 않는다).
 *
 * 스위치는 서버 값([VoiceConsent.consented])을 따른다. 누르는 동안만 새 값을 먼저 보여 주고, 실패하면 그 값을 버려
 * 원래 자리로 돌아간 뒤 한 줄 안내를 남긴다. 서버가 받은 값이 아니면 켜진 것처럼 보이면 안 된다.
 *
 * 익명 모드(KAN-270 5단계, [AnonymousSettingsScreen])도 이 섹션을 쓴다 — 값은 기기 로컬이고 바꾸기는 늘 성공한다.
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

    Column(verticalArrangement = Arrangement.spacedBy(Spacing.x3)) {
        GroupLabel("개인정보")
        if (consented == null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(VOICE_CONSENT_SETTING_LABEL, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Text("상태를 불러오지 못했어요", style = MaterialTheme.typography.bodyMedium)
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
            // 줄 전체가 스위치 하나로 읽히고 눌린다(48dp 터치) — LoginScreen 동의 줄과 같은 구성.
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = Dimens.touchTargetMin)
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
            ) {
                Text(VOICE_CONSENT_SETTING_LABEL, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                // 시안 `.switch`: 켜짐은 벽돌 트랙·크림 손잡이, 꺼짐은 크림 트랙·잉크 테두리·잉크 손잡이
                Switch(
                    checked = checked,
                    onCheckedChange = null,
                    enabled = pending == null,
                    colors = SwitchDefaults.colors(
                        checkedTrackColor = LightPoint,
                        checkedThumbColor = MaterialTheme.colorScheme.background,
                        checkedBorderColor = LightPoint,
                        uncheckedTrackColor = MaterialTheme.colorScheme.background,
                        uncheckedThumbColor = MaterialTheme.colorScheme.onBackground,
                        uncheckedBorderColor = MaterialTheme.colorScheme.onBackground,
                    ),
                )
            }
            if (failed) StatusBlock(tone = StatusTone.Error, message = "바꾸지 못했어요 · 잠시 후 다시 시도해 주세요")
        }
        Text(
            caption,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        AccenturyButton(text = "개인정보처리방침", onClick = onOpenPrivacy, variant = ButtonVariant.Text)
    }
}

/**
 * 로그인을 끈 빌드(익명 모드)의 설정 화면 (KAN-270 5단계). 톱니는 그대로 두고 「개인정보」만 남긴다 — 계정 섹션·
 * 로그아웃·계정 동의 토글은 없다. 스위치는 [AnonymousVoiceConsentStore]를 바꾸고 다음 세션 생성부터 반영된다.
 * 덮는 방식·뒤로 가기는 [SettingsScreen]과 같다.
 */
@Composable
fun AnonymousSettingsScreen(
    consented: Boolean,
    onChange: (Boolean) -> Unit,
    onOpenPrivacy: () -> Unit,
    onClose: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BackHandler(onBack = onClose)
    PaperScreen(modifier = modifier, onClose = onClose) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.x6)) {
            PaperTitle("설정")
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
}

/** 계정 한 줄 — 아래 그림자색 실선 (시안 `.account-row`) */
@Composable
private fun AccountRow(label: String, value: String) {
    Column {
        Row(
            modifier = Modifier.padding(vertical = Spacing.x3),
            horizontalArrangement = Arrangement.spacedBy(Spacing.x4),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(0.35f),
            )
            Text(value, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(0.65f))
        }
        HorizontalDivider(thickness = 1.dp, color = MaterialTheme.accenturyColors.primaryDim)
    }
}
