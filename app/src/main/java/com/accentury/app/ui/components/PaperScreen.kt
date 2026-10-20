package com.accentury.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.accentury.app.R
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.LightPoint
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.ui.theme.accenturyColors

/*
 * 네이티브 화면의 공통 틀 (KAN-288 디자인 3). 시안의 네이티브 화면은 전부 같은 뼈대다 — 위에 워드마크 앱바,
 * 왼쪽 정렬 본문, 아래에 그림자색 실선으로 갈린 버튼 자리(`.footer`). 화면마다 따로 그리면 앱바 높이·여백이
 * 화면을 넘어갈 때마다 몇 dp씩 튄다.
 */

/**
 * 앱바 — 왼쪽 워드마크, [onClose]가 있으면 오른쪽에 48dp 닫기 ✕ (시안 `.appbar`·`.close`, HIG 수정: 닫기 48×48).
 * 워드마크는 브랜드 표기라 heading이 아니다.
 */
@Composable
fun PaperAppBar(modifier: Modifier = Modifier, onClose: (() -> Unit)? = null, closeEnabled: Boolean = true) {
    Row(
        modifier = modifier.fillMaxWidth().height(Dimens.touchTargetMin),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Accentury", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        if (onClose != null) {
            Box(
                modifier = Modifier
                    .size(Dimens.touchTargetMin)
                    .clickable(enabled = closeEnabled, role = Role.Button, onClick = onClose),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    painter = painterResource(R.drawable.outline_close_24),
                    contentDescription = "닫기",
                    tint = MaterialTheme.colorScheme.onBackground,
                )
            }
        }
    }
}

/**
 * 화면 틀. 본문은 스크롤하고 [footer]는 바닥에 고정된다 — 글꼴을 키운 기기에서 본문이 자라도 누를 버튼은
 * 화면 밖으로 밀리지 않는다. [footer]가 null이면 바닥 줄도 없다.
 */
@Composable
fun PaperScreen(
    modifier: Modifier = Modifier,
    onClose: (() -> Unit)? = null,
    closeEnabled: Boolean = true,
    footer: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            PaperAppBar(
                modifier = Modifier.padding(start = Spacing.x6, end = Spacing.x3, top = Spacing.x2),
                onClose = onClose,
                closeEnabled = closeEnabled,
            )
            // 최소 높이를 뷰포트에 맞춰야 본문 안의 weight 스페이서가 세로 가운데 정렬을 한다 — 스크롤 안의 Column은
            // 최대 높이가 무한이라 weight가 최소 높이를 기준으로 나뉜다. 넘치면 그대로 늘어나 스크롤된다.
            BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .heightIn(min = maxHeight)
                        .padding(start = Spacing.x6, end = Spacing.x6, top = Spacing.x4, bottom = Spacing.x6),
                    content = content,
                )
            }
            if (footer != null) PaperFooter(content = footer)
        }
    }
}

/** 바닥 버튼 자리. 위에 그림자색 1dp 실선 (시안 `.footer`) */
@Composable
fun PaperFooter(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier = modifier.fillMaxWidth()) {
        HorizontalDivider(thickness = 1.dp, color = MaterialTheme.accenturyColors.primaryDim)
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = Spacing.x6, end = Spacing.x6, top = Spacing.x3, bottom = Spacing.x4),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.x2),
            content = content,
        )
    }
}

/** 화면 제목 — 왼쪽 정렬 Jua (시안 `.screen-title`) */
@Composable
fun PaperTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.headlineMedium, modifier = modifier.semantics { heading() })
}

/** 제목 아래 흐린 잉크 한 줄 (시안 `.lead`) */
@Composable
fun PaperLead(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)
}

/** 대기 표시 — 그림자색 둘레에 벽돌 호 (시안 `.spinner`) */
@Composable
fun PaperSpinner(modifier: Modifier = Modifier) {
    CircularProgressIndicator(
        modifier = modifier,
        color = LightPoint,
        trackColor = MaterialTheme.accenturyColors.primaryDim,
    )
}

/**
 * 기다리는 화면 (시안 02·06·14) — 앱바 + 가운데 대기 표시와 Jua 제목. 빈 화면·흰 플래시를 가리는 것이 목적이라
 * 누를 것이 없다.
 */
@Composable
fun PaperWaitingScreen(title: String, modifier: Modifier = Modifier) {
    PaperScreen(modifier = modifier) {
        Spacer(Modifier.weight(1f))
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.x6),
        ) {
            PaperSpinner()
            Text(title, style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.weight(1f))
    }
}

/**
 * 실패 화면 (시안 06b·14b·15) — 「!」 표식, 제목, 부연, 바닥의 주 버튼 하나. 비난 없는 문구 + 지금 할 수 있는 동작 하나라는
 * [StatusBlock]의 규칙 그대로이고, 문구가 화면이 이미 떠 있는 동안 바뀔 수 있어 오류 통지(liveRegion)를 건다.
 */
@Composable
fun PaperFailureScreen(
    title: String,
    detail: String?,
    buttonLabel: String,
    onButtonClick: () -> Unit,
    modifier: Modifier = Modifier,
    // 주 버튼 아래 텍스트 버튼 (시안 15 「나중에」, HIG 수정: 높이 48). null이면 버튼 하나다.
    secondaryLabel: String? = null,
    onSecondaryClick: () -> Unit = {},
) {
    PaperScreen(
        modifier = modifier,
        footer = {
            AccenturyButton(text = buttonLabel, onClick = onButtonClick, modifier = Modifier.fillMaxWidth())
            if (secondaryLabel != null) {
                AccenturyButton(
                    text = secondaryLabel,
                    onClick = onSecondaryClick,
                    modifier = Modifier.fillMaxWidth(),
                    variant = ButtonVariant.Text,
                )
            }
        },
    ) {
        Spacer(Modifier.height(Spacing.x6))
        HeroIcon { Text("!", style = MaterialTheme.typography.titleMedium) }
        Spacer(Modifier.height(Spacing.x6))
        Column(
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
            verticalArrangement = Arrangement.spacedBy(Spacing.x3),
        ) {
            PaperTitle(title)
            if (detail != null) PaperLead(detail)
        }
    }
}
