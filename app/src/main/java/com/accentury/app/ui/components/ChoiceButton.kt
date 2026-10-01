package com.accentury.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.ui.theme.accenturyColors

/**
 * 여럿 중 하나를 고르는 선택지 (KAN-224 — 성별·출신지역). 웹의 `.choice`와 같은 규칙이다: 1.5dp 잉크
 * 테두리 + 크림 면 + 반경 16, **고른 것만 테두리 2dp와 오프셋 그림자**. 색으로 고른 것을 가르지 않는다(§7).
 *
 * 그림자 자리는 고르지 않은 칸도 비워 둔다([paperShadow]의 visible=false) — 고를 때마다 칸 크기가 바뀌면
 * 격자가 들썩인다. 라벨은 웹 2열 선택지와 같은 Jua `titleMedium`이다.
 *
 * 스크린 리더에는 라디오 버튼으로 읽힌다. 묶음을 하나의 그룹으로 읽히게 하는 것(`selectableGroup`)은
 * 부모가 한다 — 한 묶음이 한 행일 수도, 격자일 수도 있어서다.
 */
@Composable
fun ChoiceButton(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val shape = RoundedCornerShape(Radius.md)
    val view = LocalView.current
    Box(
        modifier = modifier
            .paperShadow(MaterialTheme.accenturyColors.primaryDim, Radius.md, visible = selected)
            .fillMaxWidth()
            .defaultMinSize(minHeight = Dimens.controlHeightLg)
            .clip(shape)
            .background(MaterialTheme.colorScheme.surface)
            .border(
                width = if (selected) SELECTED_BORDER else CHOICE_BORDER,
                color = MaterialTheme.accenturyColors.controlBorder,
                shape = shape,
            )
            .selectable(selected = selected, enabled = enabled, role = Role.RadioButton) {
                // 고를 때 가벼운 탭 (KAN-258) — 웹 객관식 선택과 같은 규칙이다
                view.performHaptic(Haptic.Tap)
                onClick()
            }
            .padding(horizontal = Spacing.x3),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center, maxLines = 1)
    }
}

private val CHOICE_BORDER = 1.5.dp
private val SELECTED_BORDER = 2.dp
