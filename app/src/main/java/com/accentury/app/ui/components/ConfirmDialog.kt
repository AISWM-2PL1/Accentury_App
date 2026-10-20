package com.accentury.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.Spacing

/**
 * 확인 창 (시안 50·50b, KAN-288). 설정 화면 위에 반투명 잉크 막을 깔고 종이 한 장을 띄운다 — 확인은 벽돌 외곽선,
 * 취소는 보조 버튼. AlertDialog는 막 색(시스템 dim)과 버튼 배치를 시안대로 바꿀 수 없어 Dialog 위에 직접 그린다.
 * 막 밖을 누르거나 뒤로 가기를 하면 [onDismiss] — AlertDialog와 같다.
 *
 * 설정의 로그아웃·탈퇴와 녹음 화면 ✕의 「테스트를 그만둘까요?」(KAN-288)가 같은 창을 쓴다. 녹음 화면은 닫는 쪽 문구가
 * [계속하기]라 [dismissLabel]로 바꾼다.
 *
 * 막 색만 팔레트의 유일한 알파 값이다 — 시안 HIG 수정이 rgba(28,26,23,0.45)로 못박았다. 불투명 그림자색 막이면
 * 뒤의 설정 화면이 사라져 "어디서 뜬 창인지"가 안 보였다.
 */
@Composable
fun ConfirmDialog(
    title: String,
    onDismiss: () -> Unit,
    confirmLabel: String,
    onConfirm: () -> Unit,
    busy: Boolean,
    dismissLabel: String = "취소",
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
                    text = dismissLabel,
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
