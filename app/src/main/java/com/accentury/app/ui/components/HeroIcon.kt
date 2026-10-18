package com.accentury.app.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.unit.dp
import com.accentury.app.ui.theme.LightPoint

/**
 * 화면을 여는 표식 (KAN-148, 모양은 KAN-288 디자인 3 `.failure-mark`). 벽돌 1.5dp 점선으로 두른 정사각형을
 * -5° 기울여 놓는다 — 종이에 손으로 찍은 도장 자리다. 안에 무엇을 둘지는 호출자가 정한다(마이크 선화, 「!」).
 *
 * 잉크로 찬 원이던 때와 같은 이유로 면을 채우지 않는다: 면이 있으면 화면에서 주 버튼과 무게가 같아져 어느 쪽을
 * 눌러야 하는지가 흐려진다. 표식은 누르는 것이 아니다. 왼쪽 정렬 화면의 제목 위에 선다.
 *
 * 안의 그림은 장식이다 — 옆 제목이 같은 말을 하므로 호출자가 의미론을 주지 않는다.
 */
@Composable
fun HeroIcon(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = modifier
            .size(HERO_SIZE)
            .rotate(HERO_TILT)
            .dashedBorder(LightPoint, width = 1.5.dp),
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

/** 시안 75px */
private val HERO_SIZE = 76.dp
private const val HERO_TILT = -5f
