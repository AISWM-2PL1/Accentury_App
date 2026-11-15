package com.accentury.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.accentury.app.ui.theme.Dimens

/**
 * 화면을 여는 아이콘 원 (KAN-354, KAN-311 시안 `.p3-status-symbol`·`.hero-icon`). 지름 [Dimens.heroIconSize] 112,
 * 잉크 1dp 테두리, 크림 면, 그림자 없음 — 안의 선화 아이콘은 [Dimens.heroIconGlyph] 56dp를 호출자가 준다. 예외 화면
 * ([PaperExceptionScreen])과 마이크 권한 화면이 같은 원을 쓴다. KAN-288의 기울인 벽돌 점선 사각형을 바꿨다.
 *
 * 그림자가 없는 이유는 그대로다: 떠 있는 종이는 화면에 주 버튼 하나뿐이어야 어느 쪽을 눌러야 하는지가 흐려지지 않는다.
 * 안의 그림은 장식이다 — 옆 제목이 같은 말을 하므로 호출자가 의미론을 주지 않는다. 그림 색은 잉크([LocalContentColor]).
 */
@Composable
fun HeroIcon(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .size(Dimens.heroIconSize)
            .border(1.dp, MaterialTheme.colorScheme.onBackground, CircleShape)
            .background(MaterialTheme.colorScheme.background, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        CompositionLocalProvider(LocalContentColor provides MaterialTheme.colorScheme.onBackground, content = content)
    }
}
