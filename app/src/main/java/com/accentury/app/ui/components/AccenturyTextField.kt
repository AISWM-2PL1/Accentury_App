package com.accentury.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.ui.theme.accenturyColors

/**
 * 입력 칸 (KAN-224 추가 정보 화면). 컷아웃 규칙을 그대로 따른다 — 1.5dp 잉크 테두리, 크림 면, 반경 16.
 * 그림자는 없다: 떠 있는 종이는 주 버튼 하나여야 한다 (AccenturyButton KDoc). 포커스는 테두리가 2dp로
 * 굵어지는 것으로만 보인다 — 두께가 "지금 이것"을 뜻하는 유일한 자리라는 §8 규칙이다.
 *
 * [onClick]을 주면 글자를 치는 칸이 아니라 누르는 칸이 된다(생년월일 — 달력을 연다). 모양은 같고,
 * 스크린 리더에는 버튼으로 읽힌다.
 *
 * @param label 칸 위의 이름. 스크린 리더가 칸을 이 이름으로 읽는다
 * @param placeholder 비었을 때 칸 안에 흐리게 보이는 안내
 */
@Composable
fun AccenturyTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    enabled: Boolean = true,
    onClick: (() -> Unit)? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(Radius.md)
    val box = Modifier
        .fillMaxWidth()
        .defaultMinSize(minHeight = Dimens.touchTargetMin)
        .clip(shape)
        .background(MaterialTheme.colorScheme.surface)
        .border(
            width = if (focused) FOCUSED_BORDER else FIELD_BORDER,
            color = MaterialTheme.accenturyColors.controlBorder,
            shape = shape,
        )

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(Spacing.x2)) {
        Text(label, style = MaterialTheme.typography.labelLarge)

        val content: @Composable () -> Unit = {
            if (value.isEmpty() && placeholder != null) {
                Text(
                    placeholder,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else if (onClick != null) {
                Text(value, style = MaterialTheme.typography.bodyLarge)
            }
        }

        if (onClick != null) {
            Box(
                modifier = box
                    .clickable(enabled = enabled, role = Role.Button, onClickLabel = label, onClick = onClick)
                    .semantics { contentDescription = label }
                    .padding(horizontal = Spacing.x4, vertical = Spacing.x3),
                contentAlignment = Alignment.CenterStart,
            ) { content() }
        } else {
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                enabled = enabled,
                singleLine = true,
                keyboardOptions = keyboardOptions,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
                cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                interactionSource = interaction,
                modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
                decorationBox = { inner ->
                    Box(
                        modifier = box.padding(horizontal = Spacing.x4, vertical = Spacing.x3),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        content()
                        inner()
                    }
                },
            )
        }
    }
}

/** 컷아웃 테두리 (§8). 포커스만 2dp다 — 주 CTA·선택된 선택지와 같은 "지금 이것" 굵기다 */
private val FIELD_BORDER = 1.5.dp
private val FOCUSED_BORDER = 2.dp
