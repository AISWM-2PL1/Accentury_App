package com.accentury.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import com.accentury.app.ui.components.AccenturyButton
import com.accentury.app.ui.components.ChoiceButton
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.Spacing

/**
 * 2열 그리드의 나열 순서 — 웹 `RegionSelectScreen.tsx`의 DISPLAY_ORDER와 같다. 왼쪽 열이 서해안 축, 오른쪽 열이
 * 동해안 축이고 행 우선이라 스크린 리더 순서가 보이는 순서와 같다. [Region] 선언 순서(계약 표)는 건드리지 않는다.
 */
internal val REGION_DISPLAY_ORDER = listOf(
    Region.SEOUL, Region.GANGWON,
    Region.GYEONGGI, Region.CHUNGBUK,
    Region.JEONBUK, Region.CHUNGNAM,
    Region.JEONNAM, Region.GYEONGBUK,
    Region.JEJU, Region.GYEONGNAM,
)

/**
 * 익명 모드의 출신 지역 선택 (KAN-270 7단계). 시작 게이트에서 동의 화면 다음, 아직 지역이 없을 때 선다
 * ([needsAnonymousRegion]). 동의 화면에서 무엇을 골랐든 모두에게 묻는다 (KAN-274). 고른 값은 [AnonymousVoiceConsentStore.saveRegion]으로 남고 세션 body `region`이 된다.
 *
 * 규칙은 웹 지역 화면과 같다 — 기본 선택이 없고(그냥 [다음]을 누른 녹음이 엉뚱한 라벨로 쌓이지 않게) 건너뛰기도 없다.
 * 질문 문장은 [ProfileScreen]의 지역 칸과 같다.
 *
 * @param onDone 고른 지역 코드([Region.name])
 */
@Composable
fun AnonymousRegionScreen(onDone: (String) -> Unit, modifier: Modifier = Modifier) {
    var selected by rememberSaveable { mutableStateOf<Region?>(null) }

    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(start = Spacing.x6, end = Spacing.x6, top = Dimens.screenPaddingTop, bottom = Spacing.x8),
            verticalArrangement = Arrangement.spacedBy(Spacing.x6),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(Spacing.x2)) {
                Text(
                    "어느 지역 말씨가 몸에 배어 있나요?",
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.semantics { heading() },
                )
                Text(
                    "본인이 사용한다고 생각하는 억양의 지역을 골라주시면 됩니다. 결과에는 영향이 없어요.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Column(
                modifier = Modifier.selectableGroup(),
                verticalArrangement = Arrangement.spacedBy(Spacing.x3),
            ) {
                REGION_DISPLAY_ORDER.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.x3)) {
                        row.forEach { region ->
                            ChoiceButton(
                                label = region.label,
                                selected = selected == region,
                                onClick = { selected = region },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }

            AccenturyButton(
                text = "다음",
                onClick = { selected?.let { onDone(it.name) } },
                modifier = Modifier.fillMaxWidth(),
                enabled = selected != null,
            )
            Text(
                "이 정보는 억양 분석 모델을 다듬는 데만 써요",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
