package com.accentury.app.auth

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.accentury.app.R
import com.accentury.app.ui.components.AccenturyButton
import com.accentury.app.ui.components.ButtonVariant
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.Spacing
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
 * 설정 화면 (KAN-247). 계정 정보와 로그아웃.
 *
 * TestFlow를 컴포지션에서 내리지 않고 **그 위를 덮는다** — WebView는 인트로부터 테스트 끝까지 한 인스턴스로
 * 살아야 하므로(TestFlow KDoc) 닫으면 보던 웹 화면 그대로다. 시스템 뒤로 가기도 닫기와 같다.
 *
 * 계정 값은 게이트가 이미 든 [AuthGateState.SignedIn.user]를 쓴다 — 로그인·시작 확인 때 서버가 준 값이라
 * `/v0/users/me`를 또 부를 이유가 없다.
 *
 * @param onLogout [AuthGateController.logout]. 끝나면 게이트가 SignedOut이 되어 이 화면째 로그인 화면으로 바뀐다
 */
@Composable
fun SettingsScreen(
    user: AuthUser,
    onClose: () -> Unit,
    onLogout: suspend () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    // 회전해도 확인 창이 남게 저장한다. 진행 중 표시는 회전으로 화면 스코프가 끊기면 의미가 없어 remember다.
    var confirming by rememberSaveable { mutableStateOf(false) }
    var leaving by remember { mutableStateOf(false) }

    BackHandler(onBack = onClose)

    // 색을 명시한다 — Surface 기본값(surface)이면 아래 WebView 배경(#f3ecd9)과 어긋난다 (RecordingOverlay와 같은 이유).
    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Spacing.x6, vertical = Spacing.x4),
            verticalArrangement = Arrangement.spacedBy(Spacing.x6),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "설정",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                AccenturyButton(text = "닫기", onClick = onClose, variant = ButtonVariant.Text, enabled = !leaving)
            }

            Column(verticalArrangement = Arrangement.spacedBy(Spacing.x3)) {
                Text(
                    "계정",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.semantics { heading() },
                )
                // 추가 정보 화면을 지나 SignedIn이면 이름·이메일은 늘 있다. 서버 값이 비어 오는 경우만 대비한다.
                AccountRow("이름", user.name ?: "-")
                AccountRow("이메일", user.email ?: "-")
                AccountRow("로그인 방식", providerName(user.provider))
                // [회원 탈퇴]는 KAN-251이 이 자리(계정 섹션 맨 아래)에 붙인다.
            }

            AccenturyButton(
                text = "로그아웃",
                onClick = { confirming = true },
                modifier = Modifier.fillMaxWidth(),
                variant = ButtonVariant.Secondary,
                enabled = !leaving,
            )
        }
    }

    if (confirming) {
        AlertDialog(
            onDismissRequest = { if (!leaving) confirming = false },
            title = { Text("로그아웃할까요?", style = MaterialTheme.typography.titleMedium) },
            text = { Text("다시 쓰려면 로그인해야 해요", style = MaterialTheme.typography.bodyMedium) },
            confirmButton = {
                AccenturyButton(
                    text = "로그아웃",
                    onClick = {
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
                    variant = ButtonVariant.Text,
                    enabled = !leaving,
                )
            },
            dismissButton = {
                AccenturyButton(
                    text = "취소",
                    onClick = { confirming = false },
                    variant = ButtonVariant.Text,
                    enabled = !leaving,
                )
            },
            // 종이 면 그대로 — 기본 surfaceContainerHigh는 Papercut 팔레트 밖의 색이다.
            containerColor = MaterialTheme.colorScheme.background,
        )
    }
}

@Composable
private fun AccountRow(label: String, value: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.x4)) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(0.35f),
        )
        Text(value, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(0.65f))
    }
}
