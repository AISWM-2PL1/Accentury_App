package com.accentury.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.Spacing

/**
 * 상태 블록의 성격. 스크린 리더 통지 여부만 갈린다 - 색으로는 갈리지 않는다 (KAN-161).
 */
enum class StatusTone { Waiting, Error }

/**
 * 대기·오류 문구 블록 (KAN-148). 웹의 `StatusBlock`과 같은 구성이다 —
 * 문구 + 부연 + 선택적 복구 동작.
 *
 * 오류일 때만 `liveRegion`을 건다. 화면이 이미 떠 있는 상태에서 나타나는 실패 문구는
 * 스크린 리더가 스스로 읽어 줘야 사용자가 알아챈다. 대기 문구에는 걸지 않는다 —
 * 로딩은 곧 바뀔 상태라 매번 읽어 주면 소음이 된다. 웹이 `role="alert"`를 오류에만
 * 붙이는 것과 같은 판단이다.
 *
 * **색 면도, 빨강도 없다** (KAN-161 2단계). 오류를 색으로 알리던 규칙이 사라졌으니
 * 두 톤에 다른 색을 줄 이유도 없다 - 무엇이 잘못됐는지는 잉크 문구와 「!」 머리표가 말하고, 부연은
 * 대기든 오류든 흐린 잉크다. 문구는 흐린 잉크 점선 상자에 왼쪽 정렬로 담는다 (KAN-288 디자인 3 `.status-box`).
 * 복구 동작은 [action]으로 상자 아래에 들어온다.
 */
@Composable
fun StatusBlock(
    tone: StatusTone,
    message: String,
    modifier: Modifier = Modifier,
    detail: String? = null,
    action: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Spacing.x3),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .dashedBorder(MaterialTheme.colorScheme.onSurfaceVariant)
                .padding(horizontal = Spacing.x4, vertical = Spacing.x4)
                .then(
                    if (tone == StatusTone.Error) {
                        Modifier.semantics { liveRegion = LiveRegionMode.Assertive }
                    } else {
                        Modifier
                    },
                ),
            verticalArrangement = Arrangement.spacedBy(Spacing.x1),
        ) {
            Row {
                // 오류 머리표 「!」 (시안 `.status-box`). 색을 못 쓰는 팔레트라 기호가 오류를 말한다 — 스크린 리더는
                // 문구만 읽으면 된다.
                if (tone == StatusTone.Error) {
                    Text("! ", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.clearAndSetSemantics { })
                }
                Text(message, style = MaterialTheme.typography.bodyMedium)
            }
            if (detail != null) {
                Text(
                    detail,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        action?.invoke()
    }
}

/**
 * 1dp 점선 테두리 (시안 `border:1px dashed`). 상태 상자·히어로 표식이 함께 쓴다 — Compose `border`에는
 * 점선이 없다. 레이아웃 크기를 바꾸지 않고 자기 경계 안쪽에 그린다.
 */
internal fun Modifier.dashedBorder(
    color: Color,
    width: Dp = 1.dp,
    cornerRadius: Dp = Radius.md,
): Modifier = drawBehind {
    val stroke = width.toPx()
    drawRoundRect(
        color = color,
        topLeft = Offset(stroke / 2f, stroke / 2f),
        size = Size(size.width - stroke, size.height - stroke),
        cornerRadius = CornerRadius(cornerRadius.toPx()),
        style = Stroke(width = stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))),
    )
}
