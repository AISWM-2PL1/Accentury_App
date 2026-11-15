package com.accentury.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.LightPaper
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.accenturyColors

/**
 * 대사 카드 (KAN-148, 형태는 KAN-354 시안 s-06·s-17·s-05-voicecheck-app `.prompt-card`). 웹의 `.prompt-card`와 같은 규격이다 —
 * 어휘 문항(웹)과 이 화면이 번갈아 나오므로 카드 크기·모서리·그림자가 다르면 전환마다 화면이 들썩인다.
 *
 * 오려 낸 종이 카드다: paper 면에 잉크 1dp 테두리, 반경 10, 그리고 [paperShadow]가 오른쪽·아래로 어긋난 그늘 한 겹을 깐다.
 * 높이를 [Dimens.promptCardMinHeight]로 잡는 이유는 그대로다: 문항마다 글자 수가 달라도 카드가 같은 크기여야
 * 아래 요소가 제자리에 있는 것처럼 읽힌다. 넘치면 카드가 자라고 본문이 스크롤된다 — 대사를 자르지 않는다.
 *
 * 대사는 Jua 30이고, 세 줄 이상으로 접히면 26으로 줄인다(KAN-354, 시안의 긴 대사). 첫 배치의 줄 수를 보고 한 번만 줄인다 —
 * 글자 수로 미리 짐작하면 기기 폭·글꼴 배율마다 문턱이 어긋난다.
 *
 * [caption]은 카드 맨 위 흐린 한 줄이다(목소리 점검 「목소리 점검」, 억양 학습 「표준어 · …」, 감정 칩이 없는 레벨 테스트 문항
 * 「n / N · 이 문장을 읽어주세요」). [cue]는 잉크 면 알약 칩이다(KAN-283 감정 칩, 억양 학습 「사투리로 따라 말해 보세요」,
 * 목소리 점검 「편하게 말해 주세요」). 칩은 대사 아래에 둔다(KAN-354) — 대사가 먼저 읽히고 말투 안내가 뒤따른다. 목소리 점검만
 * 시안대로 캡션 아래·대사 위에 둔다([cueAbovePrompt]).
 */
@Composable
fun PromptCard(
    prompt: String,
    modifier: Modifier = Modifier,
    caption: String? = null,
    cue: String? = null,
    cueAbovePrompt: Boolean = false,
) {
    val colors = MaterialTheme.accenturyColors
    val shape = RoundedCornerShape(Radius.lg)
    // 대사가 바뀌면 30부터 다시 잰다
    var long by remember(prompt) { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .paperShadow(colors.primaryDim, Radius.lg)
            .defaultMinSize(minHeight = Dimens.promptCardMinHeight)
            .clip(shape)
            .background(LightPaper)
            .border(CARD_BORDER, MaterialTheme.colorScheme.onBackground, shape)
            .padding(horizontal = CARD_PADDING_X, vertical = CARD_PADDING_Y),
        verticalArrangement = Arrangement.spacedBy(CARD_GAP, Alignment.CenterVertically),
    ) {
        if (caption != null) {
            Text(caption, style = MaterialTheme.typography.labelSmall, color = colors.onPromptCardMuted)
        }
        if (cue != null && cueAbovePrompt) Cue(cue)
        Text(
            prompt,
            /*
             * 한국어를 낱말 단위로 끊는다 (시안의 `word-break: keep-all`). 기본 전략은 글자
             * 아무 데서나 줄을 바꿔서 "자연스럽게"가 "자연스"/"럽게"로 갈리는데, 소리 내어
             * 읽는 문장에서 그 끊김은 읽는 사람을 그대로 더듬게 만든다.
             *
             * `Paragraph`는 줄바꿈 후보를 문단 전체를 보고 고르는 전략이라(기본 `Simple`은
             * 한 줄씩 채운다) 마지막 줄에 한 낱말만 남는 모양도 함께 줄어든다.
             */
            style = MaterialTheme.typography.headlineMedium.copy(
                fontSize = if (long) LONG_PROMPT_SIZE else PROMPT_SIZE,
                lineHeight = if (long) LONG_PROMPT_LINE else PROMPT_LINE,
                lineBreak = LineBreak.Paragraph,
            ),
            color = colors.onPromptCard,
            onTextLayout = { if (!long && it.lineCount >= LONG_PROMPT_LINES) long = true },
        )
        if (cue != null && !cueAbovePrompt) Cue(cue)
    }
}

/** 시안 `.prompt-card__badge` — 잉크 면·크림 글자 알약(반경 4), 본문 글꼴 12/18 */
@Composable
private fun Cue(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall.copy(
            fontFamily = FontFamily.Default,
            fontWeight = FontWeight.Normal,
            fontSize = 12.sp,
            lineHeight = 18.sp,
        ),
        color = MaterialTheme.colorScheme.background,
        modifier = Modifier
            .clip(RoundedCornerShape(Radius.sm))
            .background(MaterialTheme.colorScheme.onBackground)
            .padding(horizontal = 8.dp, vertical = 4.dp),
    )
}

/** 테두리 굵기 (시안 1px 잉크) */
private val CARD_BORDER = 1.dp

/** 시안 `.p2-record .prompt-card` padding 18 20 · gap 10 — 간격 토큰 사이 값이라 여기에만 적는다 */
private val CARD_PADDING_X = 20.dp
private val CARD_PADDING_Y = 18.dp
private val CARD_GAP = 10.dp

/** 대사 Jua 30/1.3, 긴 대사(세 줄 이상) 26/1.3 (시안 `.type-headline`) */
private val PROMPT_SIZE = 30.sp
private val PROMPT_LINE = 39.sp
private val LONG_PROMPT_SIZE = 26.sp
private val LONG_PROMPT_LINE = 34.sp
private const val LONG_PROMPT_LINES = 3
