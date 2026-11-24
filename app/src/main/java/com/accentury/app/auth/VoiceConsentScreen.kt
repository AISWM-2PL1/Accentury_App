package com.accentury.app.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.accentury.app.R
import com.accentury.app.ui.components.AccenturyButton
import com.accentury.app.ui.components.ButtonVariant
import com.accentury.app.ui.components.PaperCheck
import com.accentury.app.ui.components.PaperScreen
import com.accentury.app.ui.components.PaperTitle
import com.accentury.app.ui.components.StatusBlock
import com.accentury.app.ui.components.StatusTone
import com.accentury.app.ui.components.paperShadow
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.LightPaper
import com.accentury.app.ui.theme.Radius
import com.accentury.app.ui.theme.Spacing
import com.accentury.app.ui.theme.accenturyColors
import kotlinx.coroutines.launch

/**
 * 음성 저장 선택 동의 화면 (KAN-270 2단계, 서버 KAN-269). 로그인과 추가 정보를 마친 미동의 계정에 한 번 뜬다
 * — 띄울지는 [shouldPromptVoiceConsent]가, 다시 안 띄우는 기억은 [VoiceConsentPromptStore]가 맡는다.
 *
 * 웹 화면(`VoiceConsentScreen.tsx`)과 달리 버튼이 둘이다. 웹은 세션마다 묻고 체크를 푼 [다음]이 거부지만, 앱은 계정에
 * 한 번 묻고 끝나므로 [건너뛰기]가 "이번에 안 한다"를 분명히 말해야 한다. [동의하고 계속]은 체크해야 켜진다 —
 * 만 14세 확인이 체크박스 문장에 묶여 있다.
 *
 * 설정 화면처럼 TestFlow 위에 덮인다(호출자 AuthGate). 시스템 뒤로 가기는 막지 않는다 — Activity가 닫히고, 다음
 * 실행에 아직 표시 기록이 없으면 다시 뜬다.
 *
 * 로그인을 끈 빌드(익명 모드, 5단계)는 시작 게이트의 마이크 권한 뒤에서 설치당 한 번 같은 화면을 띄운다 — 선택은
 * [AnonymousVoiceConsentStore]에 남고, 문안은 [details]로 셋째 줄만 웹처럼 바꾼다.
 *
 * @param onConsent 동의를 남긴다. true면 성공 — 계정 모드는 `setVoiceConsent(true)`가 성공했는가, 익명 모드는 늘 true.
 *   성공하면 호출자가 화면을 걷고, 실패면 한 줄 안내를 남긴다
 * @param onSkip 표시 기록만 남기고 걷는다. 서버에 보낼 것이 없다(건너뜀 = 미동의)
 * @param onOpenPrivacy 방침 문서 (LoginScreen과 같은 호출)
 * @param details 보관 항목·기간·철회 줄. 익명 모드는 [VOICE_CONSENT_DETAILS_ANONYMOUS]
 */
@Composable
fun VoiceConsentScreen(
    onConsent: suspend () -> Boolean,
    onSkip: () -> Unit,
    onOpenPrivacy: () -> Unit,
    modifier: Modifier = Modifier,
    details: List<String> = VOICE_CONSENT_DETAILS,
) {
    val scope = rememberCoroutineScope()
    // 처음부터 체크돼 있다(2026-11-24 사용자 결정, KAN-367) - 2026-10-06 팀 결정 「기본 미동의」를 뒤집었다
    var checked by rememberSaveable { mutableStateOf(true) }
    var submitting by remember { mutableStateOf(false) }
    var failed by rememberSaveable { mutableStateOf(false) }

    // 시안 11 배치 (KAN-288): 본문은 스크롤, 두 버튼과 안내 한 줄은 바닥 고정. 체크는 기본 체크(2026-11-24)이고 체크를 풀면 주 버튼은
    // 비활성 모양(그림자색 면)이다. [건너뛰기]는 KAN-354 시안 s-03-voice-consent-app대로 글자 버튼이다(KAN-288의 보조 버튼
    // 모양을 대체, 리뷰 P2-2). 문구는 현재 앱 문구를 유지한다.
    // 모양은 KAN-354 시안 s-03-voice-consent-app: 본문·목록은 흐린 잉크, 체크 줄은 paper 상자 + 종이 그림자, 목록은 둥근 불릿.
    PaperScreen(
        modifier = modifier,
        footer = {
            AccenturyButton(
                text = "동의하고 계속",
                onClick = {
                    // launch 앞에서 세워야 이중 탭이 두 번째 요청을 만들지 않는다(리뷰 P2-2, iOS는 동기라 해당 없음).
                    submitting = true
                    scope.launch {
                        try {
                            failed = !onConsent()
                        } finally {
                            submitting = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = checked && !submitting,
                trailing = { Icon(painterResource(R.drawable.ic_arrow_forward_24), null, Modifier.size(20.dp)) },
            )
            AccenturyButton(
                text = "건너뛰기",
                onClick = onSkip,
                modifier = Modifier.fillMaxWidth(),
                variant = ButtonVariant.Text,
            )
            Text(
                VOICE_CONSENT_FOOTNOTE,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.x4)) {
            PaperTitle(VOICE_CONSENT_TITLE)
            Text(
                VOICE_CONSENT_LEAD,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // 줄 전체가 체크박스 하나로 읽히고 눌린다 (LoginScreen ConsentRow와 같은 구성). 시안 `.p4-consent-check`:
            // 잉크 1 테두리·모서리 10·paper 면·종이 그림자, 안쪽 14, 상자와 글자 사이 12, 위 맞춤.
            val boxShape = RoundedCornerShape(Radius.lg)
            Row(
                modifier = Modifier
                    .paperShadow(MaterialTheme.accenturyColors.primaryDim, Radius.lg)
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = Dimens.touchTargetMin)
                    .clip(boxShape)
                    .background(LightPaper)
                    .border(1.dp, MaterialTheme.colorScheme.primary, boxShape)
                    .toggleable(value = checked, role = Role.Checkbox, enabled = !submitting) { checked = it }
                    .padding(14.dp),
                verticalAlignment = Alignment.Top,
            ) {
                PaperCheck(checked, Modifier.padding(top = 2.dp))
                Text(
                    VOICE_CONSENT_CHECKBOX_LABEL,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(start = Spacing.x3),
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(Spacing.x2)) {
                details.forEach {
                    // 둥근 불릿에 내어쓰기 — 줄이 넘어가도 글머리 아래로 들어가지 않는다 (시안 `list-style-type: disc`)
                    Row {
                        Text(
                            "•",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(end = Spacing.x2),
                        )
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Text(
                    "$VOICE_CONSENT_POLICY_LEAD 개인정보처리방침$VOICE_CONSENT_POLICY_TAIL",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                // 글자의 왼쪽 선을 본문에 맞춘다(시안 `.p4-policy-link` padding-left 0) — TextButton 안쪽 여백 12만큼 왼쪽으로 옮기고
                // 누르는 칸 48은 그대로 둔다(리뷰 P2-2).
                AccenturyButton(
                    text = "개인정보처리방침",
                    onClick = onOpenPrivacy,
                    modifier = Modifier.offset(x = (-12).dp),
                    variant = ButtonVariant.Text,
                )
            }

            if (failed) StatusBlock(tone = StatusTone.Error, message = "잠시 후 다시 시도해 주세요")
        }
    }
}
