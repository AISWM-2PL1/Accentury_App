package com.accentury.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.times
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.LightPoint
import com.accentury.app.ui.theme.LightPointForeground
import com.accentury.app.ui.theme.Motion
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.ui.theme.accenturyColors
import com.accentury.app.ui.theme.motionDuration

/**
 * 버튼 무게 (KAN-148, 모양은 KAN-288 디자인 3).
 *
 * - [Primary] 주동작 (녹음 시작·다음·허용). 화면에서 유일하게 벽돌로 꽉 찬 면이고 종이 그림자가 있다
 * - [Secondary] 보조 (재녹음·재시도·취소). 크림 면에 잉크 1dp 테두리, 그림자 없음
 * - [Text] 이탈·종료. 흐린 잉크 밑줄 글자라 무게를 가장 뺀다
 * - [Destructive] 되돌릴 수 없는 확인 (로그아웃·탈퇴 확인 창). 크림 면에 벽돌 1.5dp 테두리·벽돌 글자 —
 *   벽돌 채움이면 주 버튼과 같은 무게라 "눌러도 되는 쪽"으로 읽힌다 (시안 HIG 수정 50·50b)
 */
enum class ButtonVariant { Primary, Secondary, Text, Destructive }

/**
 * 공통 버튼 (KAN-148, 형태는 KAN-288 디자인 3). 웹의 `.btn`과 같은 모양·같은 값이다 —
 * 두 런타임이 한 테스트 안에서 번갈아 나오므로 버튼이 서로 다르게 생기면 바로 보인다.
 *
 * 주 버튼은 오려 낸 종이다: 오른쪽·아래로 어긋난 자리에 [paperShadow]가 단색 면 한 겹을 깔고, 누르면 본체가
 * 정확히 그만큼 내려가 그림자를 덮는다. 총 차지 높이는 눌림 전후로 같아서 옆 요소가 밀리지 않는다.
 * 그림자는 주 버튼에만 있다 — 화면에 떠 있는 종이가 둘이면 어느 쪽을 눌러야 하는지가 흐려진다.
 *
 * 비활성은 불투명도가 아니라 **모양**으로 말한다 (시안 `.btn:disabled`): 그림자색 면·흐린 잉크 테두리와 글자,
 * 그림자 없음. 동의 화면의 「동의하고 계속」처럼 "아직 못 누른다"가 화면의 정보인 자리에서 흐린 벽돌은
 * 눌리는 버튼과 구별되지 않았다.
 *
 * 최소 높이는 주 버튼이 [Dimens.controlHeightLg] 50dp, 나머지가 [Dimens.touchTargetMin] 48dp다.
 * 라벨은 전부 본문 산세리프다 — Jua는 제목·대사·점수·등급 전용이다 (디자인 3 규칙).
 *
 * @param leading 라벨 왼쪽 끝에 붙는 그림 (KAN-224 IdP 로고). 라벨 위치는 바뀌지 않는다
 */
@Composable
fun AccenturyButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: ButtonVariant = ButtonVariant.Primary,
    enabled: Boolean = true,
    leading: (@Composable () -> Unit)? = null,
) {
    if (variant == ButtonVariant.Text) {
        TextButton(
            onClick = onClick,
            enabled = enabled,
            modifier = modifier.defaultMinSize(minHeight = Dimens.touchTargetMin),
        ) {
            Text(
                text,
                style = MaterialTheme.typography.labelLarge.copy(textDecoration = TextDecoration.Underline),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        return
    }

    val colors = MaterialTheme.accenturyColors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()

    val isPrimary = variant == ButtonVariant.Primary
    // 주동작에만 가벼운 탭 (KAN-258 B안). 햅틱은 아껴 써야 뜻이 남아서 보조·텍스트 버튼은 떨지 않는다.
    val view = LocalView.current
    val click = if (isPrimary) ({ view.performHaptic(Haptic.Tap); onClick() }) else onClick
    val shape = RoundedCornerShape(Radius.md)

    val ink = MaterialTheme.colorScheme.onBackground
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val brick = LightPoint
    // (면, 테두리, 글자). 비활성은 변형과 무관하게 한 모양이다.
    val (fill, line, label) = when {
        !enabled -> Triple(colors.primaryDim, muted, muted)
        isPrimary -> Triple(brick, brick, LightPointForeground)
        variant == ButtonVariant.Destructive -> Triple(MaterialTheme.colorScheme.background, brick, brick)
        else -> Triple(MaterialTheme.colorScheme.background, ink, ink)
    }

    // 눌림은 0..1 한 값이다 - 본체가 내려가는 거리를 x·y 따로 애니메이션하면 두 축이
    // 미세하게 어긋나 종이가 비스듬히 미끄러진다.
    val sink by animateFloatAsState(
        targetValue = if (pressed && enabled && isPrimary) 1f else 0f,
        animationSpec = tween(
            durationMillis = motionDuration(Motion.PRESS),
            easing = Motion.easeOut,
        ),
        label = "buttonSink",
    )

    Box(
        modifier = modifier
            .paperShadow(colors.primaryDim, Radius.md, visible = isPrimary && enabled)
            .offset(x = sink * Dimens.paperShadowX, y = sink * Dimens.paperShadowY)
            .defaultMinSize(
                minWidth = MIN_BUTTON_WIDTH,
                minHeight = if (isPrimary) Dimens.controlHeightLg else Dimens.touchTargetMin,
            )
            .clip(shape)
            .background(fill)
            .border(
                width = if (variant == ButtonVariant.Destructive) DESTRUCTIVE_BORDER else BUTTON_BORDER,
                color = line,
                shape = shape,
            )
            .clickableButton(enabled, interaction, click)
            .padding(horizontal = Spacing.x6),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = label,
        )
        // 앞머리 그림(로그인 IdP 로고)은 왼쪽 안쪽 여백에 붙고 라벨은 버튼 가운데 그대로다. 본체 안에 그려야 눌림을 함께 탄다.
        if (leading != null) {
            Box(Modifier.align(Alignment.CenterStart)) { leading() }
        }
    }
}

/** 라벨이 짧아도 손가락이 닿을 만큼은 넓게 잡는다 */
private val MIN_BUTTON_WIDTH = 120.dp

/** 테두리 굵기. 시안 `.btn`은 1px, 벽돌 외곽선 확인 버튼만 1.5px다 */
private val BUTTON_BORDER = 1.dp
private val DESTRUCTIVE_BORDER = 1.5.dp

/** ripple 없이 누름 상태만 받는다 - 눌림 표현은 종이가 내려가는 것으로 이미 하고 있다 */
private fun Modifier.clickableButton(
    enabled: Boolean,
    interaction: MutableInteractionSource,
    onClick: () -> Unit,
): Modifier = this.clickable(
    interactionSource = interaction,
    indication = null,
    enabled = enabled,
    onClick = onClick,
)
