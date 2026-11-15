package com.accentury.app.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.times
import com.accentury.app.R
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.LightPaper
import com.accentury.app.ui.theme.Motion
import com.accentury.app.ui.theme.accenturyColors
import com.accentury.app.ui.theme.isReducedMotionEnabled
import com.accentury.app.ui.theme.motionDuration

/**
 * 원형 녹음 버튼 (KAN-148, 형태는 KAN-354 시안 s-06·s-17 `.p2-record-button`과 움직임 타일 2). 다른 버튼은 모두 각진 알약인데
 * 녹음만 원형이라, 화면에서 눌러야 할 것이 무엇인지 모양만으로 읽힌다.
 *
 * paper 동그라미에 잉크 1dp 테두리, 안의 그림은 잉크다. 대기 중에는 [paperCircleShadow]가 그늘을 깔고, 누르면 다른 버튼과
 * 같은 거리만큼 내려가 그늘을 덮는다. 녹음 중에는 그늘이 없다 — 이미 눌린 상태라는 뜻이다(시안 `.is-recording`).
 *
 * 색으로는 상태를 말하지 않는다 (정본 §7). 녹음 중이라는 것은 **안쪽 도형**이 말한다 —
 * 대기는 마이크 선화, 녹음 중은 잉크 정사각형(정지의 관용 기호)이다. 여기에 둘레의 소리 원과 접근성 라벨이 겹친다.
 *
 * 소리 원(타일 2)은 녹음 중에만 버튼 둘레에 그리는 그림자색 2dp 원 하나다. [level](0~1)에 따라 버튼 테두리에서 1.35배까지
 * 커지고, 값이 바뀔 때마다 [Motion.FAST] 150ms로 따라간다. 소리가 없으면 버튼 테두리에 붙어 버튼에 가려진다.
 * 시간 반복 파문(1400ms마다 1.6배)을 바꿨다 — 말하는 크기에 반응해야 "듣고 있다"가 전해진다.
 * 움직임 줄이기면 원을 그리지 않는다. 도형과 라벨은 그대로라 상태 정보는 잃지 않는다.
 */
@Composable
fun RecordButton(
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    recording: Boolean = false,
    /** 소리 크기 0~1 — 녹음 중 소리 원의 크기. 녹음 화면이 rms를 맞춰 넘긴다(`soundRingLevel`) */
    level: Float = 0f,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val reduceMotion = isReducedMotionEnabled()
    val ink = MaterialTheme.colorScheme.onBackground
    val shadow = MaterialTheme.accenturyColors.primaryDim
    val view = LocalView.current

    val sink by animateFloatAsState(
        targetValue = if (pressed) 1f else 0f,
        animationSpec = tween(
            durationMillis = motionDuration(Motion.PRESS),
            easing = Motion.easeOut,
        ),
        label = "recordSink",
    )
    val ringScale by animateFloatAsState(
        targetValue = 1f + level.coerceIn(0f, 1f) * SOUND_RING_GROWTH,
        animationSpec = tween(durationMillis = Motion.FAST, easing = Motion.easeOut),
        label = "soundRing",
    )

    Box(
        modifier = modifier
            .size(
                width = Dimens.recordButtonSize + Dimens.paperShadowX,
                height = Dimens.recordButtonSize + Dimens.paperShadowY,
            )
            // 아이콘에는 설명을 달지 않고 버튼이 통째로 하나로 읽히게 한다 - 그러지 않으면
            // 스크린 리더가 아이콘과 버튼을 따로 짚는다
            .semantics(mergeDescendants = true) { this.contentDescription = contentDescription },
        // 그림자 자리를 오른쪽·아래에 두므로 본체는 왼쪽 위에 붙는다
        contentAlignment = Alignment.TopStart,
    ) {
        if (recording && !reduceMotion) {
            // 원의 바깥선이 버튼 지름 × ringScale에 닿는다 — 1.35배를 넘지 않는다
            Box(
                modifier = Modifier
                    .size(Dimens.recordButtonSize)
                    .drawBehind {
                        val stroke = SOUND_RING_STROKE.toPx()
                        drawCircle(
                            color = shadow,
                            radius = size.minDimension / 2f * ringScale - stroke / 2f,
                            style = Stroke(width = stroke),
                        )
                    },
            )
        }
        Box(
            modifier = Modifier
                .paperCircleShadow(shadow, visible = !recording)
                .size(Dimens.recordButtonSize)
                .offset(x = sink * Dimens.paperShadowX, y = sink * Dimens.paperShadowY)
                .clip(CircleShape)
                .background(LightPaper)
                .border(OUTLINE_WIDTH, ink, CircleShape)
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                ) {
                    // 시작·정지 모두 가벼운 탭 (KAN-258). 결과의 성공·실패는 녹음 화면이 따로 낸다
                    view.performHaptic(Haptic.Tap)
                    onClick()
                },
            contentAlignment = Alignment.Center,
        ) {
            if (recording) {
                /*
                 * 정지는 아이콘 자산 없이 사각형 하나로 그린다 - 재생/정지의 관용 기호라
                 * 따로 설명하지 않아도 읽히고, 마이크에 사선을 그은 그림보다 "지금 누르면
                 * 멈춘다"가 분명하다.
                 */
                Box(
                    modifier = Modifier
                        .size(STOP_ICON_SIZE)
                        .clip(RoundedCornerShape(STOP_ICON_RADIUS))
                        .background(ink),
                )
            } else {
                Icon(
                    painter = painterResource(R.drawable.ic_mic_24),
                    contentDescription = null,
                    tint = ink,
                    modifier = Modifier.size(RECORD_ICON_SIZE),
                )
            }
        }
    }
}

private val OUTLINE_WIDTH = 1.dp

/** 시안 선화 20 × 1.7 */
private val RECORD_ICON_SIZE = 34.dp

/** 정지 사각형. 시안 선화(12 격자 사각형 × 1.7)에 선 굵기를 더한 값 */
private val STOP_ICON_SIZE = 22.dp
private val STOP_ICON_RADIUS = 2.dp

/** 소리 원 (움직임 타일 2): 선 굵기 2, 최대 1.35배 */
private val SOUND_RING_STROKE = 2.dp
private const val SOUND_RING_GROWTH = 0.35f
