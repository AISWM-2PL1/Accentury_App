package com.accentury.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.accentury.app.ui.theme.LightPoint
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.Spacing

/**
 * 시안 `.p1-check input`·`.p4-check input` (KAN-354): 22 상자·잉크 1 테두리·모서리 4·크림 면. 체크되면 안쪽 4를 띄운 벽돌
 * 사각형이 찬다(`box-shadow: inset 0 0 0 4px` 위 `background: point`) — 체크 표시는 없다. 상태는 줄의 toggleable이 읽어 준다.
 * 로그인 동의 줄과 음성 저장 동의 줄이 같이 쓴다.
 */
@Composable
fun PaperCheck(checked: Boolean, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(22.dp)
            .border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(Radius.sm))
            .background(MaterialTheme.colorScheme.background, RoundedCornerShape(Radius.sm))
            .padding(1.dp + Spacing.x1),
    ) {
        if (checked) Box(Modifier.fillMaxSize().background(LightPoint))
    }
}
