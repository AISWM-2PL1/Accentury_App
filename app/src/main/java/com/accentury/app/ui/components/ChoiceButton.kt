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
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.ui.theme.accenturyColors

/**
 * 여럿 중 하나를 고르는 선택지 (KAN-224 — 성별·출신지역, 모양은 KAN-288 디자인 3). 웹의 `.picker`와 같은 규칙이다:
 * 고르지 않은 칸은 흐린 잉크 1dp 테두리 + 크림 면 + 반경 6, **고른 칸만 잉크 2dp 테두리·✓·오프셋 그림자**.
 * 색으로 고른 것을 가르지 않는다(§7) — 테두리 굵기와 ✓가 함께 말한다. 미선택 테두리를 그림자색(#cfc5aa)이 아니라
 * 흐린 잉크로 둔 것은 크림 위 비텍스트 대비 3:1을 넘기기 위해서다 (시안 HIG 수정).
 *
 * 그림자 자리는 고르지 않은 칸도 비워 둔다([paperShadow]의 visible=false) — 고를 때마다 칸 크기가 바뀌면
 * 격자가 들썩인다. 라벨은 본문 산세리프다(Jua는 제목·대사 전용).
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
                color = if (selected) MaterialTheme.colorScheme.onBackground else MaterialTheme.colorScheme.onSurfaceVariant,
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
        Text(
            // ✓는 그림으로만 둔다 — 선택 여부는 selectable이 이미 읽어 준다.
            if (selected) "✓ $label" else label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            maxLines = 1,
            modifier = Modifier.clearAndSetSemantics { contentDescription = label },
        )
    }
}

private val CHOICE_BORDER = 1.dp
private val SELECTED_BORDER = 2.dp
