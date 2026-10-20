package com.accentury.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import com.accentury.app.ui.theme.LightPoint
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.ui.theme.accenturyColors

/**
 * 진척도 (KAN-148, 형태는 KAN-288 디자인 3). 웹의 `ProgressIndicator`와 같은 구성이다 —
 * 도트 줄과 "2 / 7" 표기를 한 덩어리로 묶는다. 둘이 떨어져 있으면 한쪽만 고쳐 숫자와
 * 도트가 어긋나는 날이 온다.
 *
 * 막대 하나였는데 [total]개의 칸으로 바꿨다. 남은 문항을 세어 볼 수 있고, 칸 하나가
 * 채워지는 것이 막대가 조금 자라는 것보다 "한 문항 넘어갔다"로 읽힌다.
 *
 * 디자인 3(KAN-288)에서 칸은 벽돌(온 칸)·그림자색(남은 칸) 막대가 됐다. 남은 칸의 그림자색은 크림 위 대비가 낮지만,
 * 진행 정보는 머리줄 숫자("2 / 7")가 글자로 함께 말하므로 칸 색만으로 상태를 알리지 않는다.
 *
 * [current]가 1부터 시작하는 건 호출자 몫이자 의도다 — 첫 문항을 0/7로 보이면 아직
 * 시작도 안 한 느낌이라 이탈이 는다 (ux-ui.md §3 Goal-Gradient, endowed progress).
 */
@Composable
fun ProgressIndicator(
    current: Int,
    total: Int,
    modifier: Modifier = Modifier,
    label: String = "문항 진행률",
    note: String? = null,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Spacing.x2),
    ) {
        // 머리줄 — 왼쪽 이름, 오른쪽 "2 / 7" (디자인 3 `.card-progress`). 둘 다 시각 전용이다 — 아래 칸 줄이
        // "문항 진행률 2 / 7"을 통째로 한 번만 읽는다 (PR #58 리뷰 P2: 숫자가 두 번 읽히지 않게).
        Row(
            modifier = Modifier.fillMaxWidth().clearAndSetSemantics { },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
            Text(
                // 웹의 ProgressIndicator와 같은 표기다 - 문항이 두 런타임을 오가므로 공백 하나도
                // 다르면 전환에서 숫자가 미세하게 움직인다
                if (note == null) "$current / $total" else "$current / $total · $note",
                style = MaterialTheme.typography.labelLarge,
            )
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clearAndSetSemantics { contentDescription = "$label $current / $total" },
            horizontalArrangement = Arrangement.spacedBy(Spacing.x1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(maxOf(total, 0)) { index ->
                ProgressDot(state = dotState(index + 1, current))
            }
        }
    }
}

/** 도트 하나의 상태 */
internal enum class ProgressDotState { Done, Current, Todo }

/**
 * 칸 하나 (디자인 3 `.ruler-dots`) — 지나온 칸과 지금 칸은 벽돌, 남은 칸은 그림자색 막대. 지금 몇 번째인지는
 * 머리줄의 숫자가 말하므로 칸은 "얼마나 왔나"만 그린다.
 */
@Composable
private fun RowScope.ProgressDot(state: ProgressDotState) {
    Box(
        modifier = Modifier
            .weight(1f)
            .height(DOT_HEIGHT)
            .background(if (state == ProgressDotState.Todo) MaterialTheme.accenturyColors.primaryDim else LightPoint),
    )
}

/** 시안 6px */
private val DOT_HEIGHT = 6.dp

/**
 * 몇 번째 칸이 어떤 상태인가. 계산을 떼어 둔 이유는 경계다 — `position == current`가
 * 현재 칸이고 그보다 앞이 완료인데, 부등호를 한 칸 잘못 쓰면 진행이 통째로 밀린다.
 */
internal fun dotState(position: Int, current: Int): ProgressDotState = when {
    position < current -> ProgressDotState.Done
    position == current -> ProgressDotState.Current
    else -> ProgressDotState.Todo
}
