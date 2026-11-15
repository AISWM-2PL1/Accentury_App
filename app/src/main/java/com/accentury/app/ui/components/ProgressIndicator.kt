package com.accentury.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.LightPoint
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.ui.theme.accenturyColors

/**
 * 진척도 (KAN-148, 형태는 KAN-354 시안 s-06·s-17 `.progress-indicator`). 웹의 `ProgressIndicator`와 같은 구성이다 —
 * 도트 줄과 "2 / 7" 표기를 한 덩어리로 묶는다. 둘이 떨어져 있으면 한쪽만 고쳐 숫자와 도트가 어긋나는 날이 온다.
 *
 * 막대 하나가 아니라 [total]개의 칸이다. 남은 문항을 세어 볼 수 있고, 칸 하나가 채워지는 것이 막대가 조금 자라는 것보다
 * "한 문항 넘어갔다"로 읽힌다. 칸은 알약 모양 높이 8·간격 6, 지난 칸은 벽돌, 지금 칸은 왼쪽 절반 벽돌, 남은 칸은 그림자색이다.
 * 남은 칸의 그림자색은 크림 위 대비가 낮지만, 진행 정보는 머리줄 숫자가 글자로 함께 말하므로 칸 색만으로 상태를 알리지 않는다.
 *
 * 머리줄은 왼쪽 [label]「억양」, 오른쪽 "n / N"이다(KAN-354, 「문항 진행률」·「카드 진행률」 라벨과 「· 음성」 덧붙임을 걷었다).
 * 스크린 리더는 덩어리 전체를 [progressDescription] 한 문장으로 한 번만 읽는다 — 라벨·숫자·칸이 따로 읽히면 같은 정보를 세 번 듣는다.
 *
 * [current]가 1부터 시작하는 건 호출자 몫이자 의도다 — 첫 문항을 0/7로 보이면 아직
 * 시작도 안 한 느낌이라 이탈이 는다 (ux-ui.md §3 Goal-Gradient, endowed progress).
 *
 * @param totalPhrase 스크린 리더 문장의 분모 부분. 레벨 테스트 「7문항」(기본값), 억양 학습 「대사 3개」
 */
@Composable
fun ProgressIndicator(
    current: Int,
    total: Int,
    modifier: Modifier = Modifier,
    label: String = "억양",
    totalPhrase: String = "${total}문항",
) {
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clearAndSetSemantics { contentDescription = progressDescription(label, current, totalPhrase) },
        verticalArrangement = Arrangement.spacedBy(Spacing.x2),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = muted, modifier = Modifier.weight(1f))
            // 웹의 ProgressIndicator와 같은 표기다 - 문항이 두 런타임을 오가므로 공백 하나도
            // 다르면 전환에서 숫자가 미세하게 움직인다
            Text("$current / $total", style = MaterialTheme.typography.labelSmall, color = muted)
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(DOT_GAP),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(maxOf(total, 0)) { index ->
                ProgressDot(state = dotState(index + 1, current))
            }
        }
    }
}

/** 스크린 리더가 진척도 전체를 한 번에 읽는 문장 — 「억양 · 7문항 중 1번째」 (시안 `aria-label`) */
internal fun progressDescription(label: String, current: Int, totalPhrase: String): String =
    "$label · $totalPhrase 중 ${current}번째"

/** 도트 하나의 상태 */
internal enum class ProgressDotState { Done, Current, Todo }

/** 칸 하나 (시안 `.progress-indicator__dot`) — 그림자색 알약 위에 지난 칸은 전부, 지금 칸은 왼쪽 절반을 벽돌로 칠한다 */
@Composable
private fun RowScope.ProgressDot(state: ProgressDotState) {
    Box(
        modifier = Modifier
            .weight(1f)
            .height(Dimens.progressDotHeight)
            .clip(RoundedCornerShape(Radius.full))
            .background(MaterialTheme.accenturyColors.primaryDim),
    ) {
        val fill = when (state) {
            ProgressDotState.Done -> 1f
            ProgressDotState.Current -> 0.5f
            ProgressDotState.Todo -> 0f
        }
        if (fill > 0f) Box(Modifier.fillMaxWidth(fill).fillMaxHeight().background(LightPoint))
    }
}

/** 시안 칸 사이 6 — 간격 토큰(4·8) 사이 값이라 여기에만 적는다 */
private val DOT_GAP = 6.dp

/**
 * 몇 번째 칸이 어떤 상태인가. 계산을 떼어 둔 이유는 경계다 — `position == current`가
 * 현재 칸이고 그보다 앞이 완료인데, 부등호를 한 칸 잘못 쓰면 진행이 통째로 밀린다.
 */
internal fun dotState(position: Int, current: Int): ProgressDotState = when {
    position < current -> ProgressDotState.Done
    position == current -> ProgressDotState.Current
    else -> ProgressDotState.Todo
}
