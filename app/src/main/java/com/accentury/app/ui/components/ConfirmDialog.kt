package com.accentury.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import com.accentury.app.ui.theme.LightPaper
import com.accentury.app.ui.theme.LightPrimaryDim
import com.accentury.app.ui.theme.Motion
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.ScreenTitle
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.ui.theme.isReducedMotionEnabled

/**
 * 확인 창 (KAN-354, KAN-311 시안 s-11-confirm-logout·s-11-confirm-withdraw·s-06-confirm-quit). 그림자색 덮개 위에 종이 한 장 —
 * 폭 320·모서리 [Radius.sheet] 16·[LightPaper] 면·잉크 1 테두리, 제목 Jua 26, 본문, 바닥에 버튼 둘이 나란히 선다
 * (왼쪽 보조 = 머무는 쪽, 오른쪽 확인). AlertDialog는 덮개 색과 버튼 배치를 시안대로 바꿀 수 없어 Dialog 위에 직접 그린다.
 *
 * 창 바깥·시스템 뒤로가기는 왼쪽 버튼과 같다([onDismiss]). [busy]면 두 버튼이 비활성이고 바깥·뒤로가기도 듣지 않는다 —
 * 왼쪽 버튼이 못 눌리는 동안 같은 동작이 다른 길로 새면 안 된다.
 *
 * 설정의 로그아웃·탈퇴와 녹음 화면 ✕의 「테스트를 그만둘까요?」(KAN-288)가 같은 창을 쓴다. 녹음 화면은 머무는 쪽 문구가
 * [계속하기]라 [dismissLabel]로 바꾼다. [confirmVariant]는 되돌릴 수 없는 확인([그만두기]·[탈퇴])이면 벽돌 외곽선
 * [ButtonVariant.Destructive](기본값, 2026-11-16 결정), 시안이 벽돌 채움으로 그린 [로그아웃]이면 [ButtonVariant.Primary]다.
 *
 * 덮개는 `#cfc5aa` 불투명도 0.6이다 — 뒤 화면이 비쳐야 "어디서 뜬 창인지"가 보인다. 덮개와 종이는
 * [Motion.FAST] 150ms에 함께 나타나고, 움직임 줄이기면 처음부터 다 보인다.
 *
 * @param confirmLeading 확인 버튼 라벨 앞 그림 (시안 [로그아웃] 문 화살표·[탈퇴] 휴지통)
 */
@Composable
fun ConfirmDialog(
    title: String,
    onDismiss: () -> Unit,
    confirmLabel: String,
    onConfirm: () -> Unit,
    busy: Boolean,
    dismissLabel: String = "취소",
    confirmVariant: ButtonVariant = ButtonVariant.Destructive,
    confirmLeading: (@Composable () -> Unit)? = null,
    body: @Composable ColumnScope.() -> Unit,
) {
    val dismiss = { if (!busy) onDismiss() }
    val reducedMotion = isReducedMotionEnabled()
    val shown = remember { Animatable(if (reducedMotion) 1f else 0f) }
    LaunchedEffect(Unit) { shown.animateTo(1f, tween(Motion.FAST, easing = Motion.easeOut)) }

    Dialog(onDismissRequest = dismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        // 시스템 dim을 끄고 덮개를 직접 칠한다 — 둘 다 두면 덮개가 두 겹이 된다.
        (LocalView.current.parent as? DialogWindowProvider)?.window?.let { window ->
            SideEffect { window.setDimAmount(0f) }
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer { alpha = shown.value }
                .background(LightPrimaryDim.copy(alpha = SCRIM_ALPHA))
                .clickable(interactionSource = null, indication = null, onClick = dismiss)
                .padding(Spacing.x4),
            contentAlignment = Alignment.Center,
        ) {
            val shape = RoundedCornerShape(Radius.sheet)
            Column(
                modifier = Modifier
                    .widthIn(max = DIALOG_WIDTH)
                    .fillMaxWidth()
                    .clip(shape)
                    .background(LightPaper)
                    .border(1.dp, MaterialTheme.colorScheme.onBackground, shape)
                    // 종이 안을 눌러도 창이 닫히지 않게 덮개의 클릭을 여기서 끊는다
                    .clickable(interactionSource = null, indication = null, onClick = {})
                    .padding(DIALOG_PADDING),
            ) {
                PaperTitle(title, style = ScreenTitle.Form)
                Spacer(Modifier.height(Spacing.x4))
                body()
                Spacer(Modifier.height(Spacing.x6))
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.x3)) {
                    AccenturyButton(
                        text = dismissLabel,
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                        variant = ButtonVariant.Secondary,
                        enabled = !busy,
                    )
                    AccenturyButton(
                        text = confirmLabel,
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f),
                        variant = confirmVariant,
                        enabled = !busy,
                        leading = confirmLeading,
                    )
                }
            }
        }
    }
}

/** 시안 `.sheet` 폭 320. 그보다 좁은 화면에서는 좌우 16을 남기고 줄어든다 */
private val DIALOG_WIDTH = 320.dp

/** 시안 `.sheet` padding 20 — 간격 토큰(16·24) 사이 값이라 여기에만 적는다 */
private val DIALOG_PADDING = 20.dp

/** 시안 덮개 `#cfc5aa` opacity .6 */
private const val SCRIM_ALPHA = 0.6f
