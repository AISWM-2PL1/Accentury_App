package com.accentury.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.accentury.app.ui.components.AccenturyButton
import com.accentury.app.ui.components.ButtonVariant
import com.accentury.app.ui.components.StatusBlock
import com.accentury.app.ui.components.StatusTone
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.Spacing
import kotlinx.coroutines.launch

/**
 * 음성 저장 선택 동의 화면 (KAN-270 2단계, 서버 KAN-269). 로그인과 추가 정보를 마친 미동의 계정에 한 번 뜬다
 * — 띄울지는 [shouldPromptVoiceConsent]가, 다시 안 띄우는 기억은 [VoiceConsentPromptStore]가 맡는다.
 *
 * 웹 화면(`VoiceConsentScreen.tsx`)과 달리 버튼이 둘이다. 웹은 세션마다 묻고 미체크 [다음]이 거부지만, 앱은 계정에
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
    var checked by rememberSaveable { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var failed by rememberSaveable { mutableStateOf(false) }

    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(start = Spacing.x6, end = Spacing.x6, top = Dimens.screenPaddingTop, bottom = Spacing.x8),
            verticalArrangement = Arrangement.spacedBy(Spacing.x6),
        ) {
            Text(
                VOICE_CONSENT_TITLE,
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )
            Text(VOICE_CONSENT_LEAD, style = MaterialTheme.typography.bodyLarge)

            // 줄 전체가 체크박스 하나로 읽히고 눌린다 (LoginScreen ConsentRow와 같은 구성).
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .defaultMinSize(minHeight = Dimens.touchTargetMin)
                    .toggleable(value = checked, role = Role.Checkbox, enabled = !submitting) { checked = it },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = checked,
                    onCheckedChange = null,
                    enabled = !submitting,
                    colors = CheckboxDefaults.colors(
                        checkedColor = MaterialTheme.colorScheme.primary,
                        uncheckedColor = MaterialTheme.colorScheme.primary,
                        checkmarkColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                )
                Text(
                    VOICE_CONSENT_CHECKBOX_LABEL,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(start = Spacing.x2),
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(Spacing.x2)) {
                details.forEach {
                    Text(
                        "· $it",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    "$VOICE_CONSENT_POLICY_LEAD 개인정보처리방침$VOICE_CONSENT_POLICY_TAIL",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                AccenturyButton(text = "개인정보처리방침", onClick = onOpenPrivacy, variant = ButtonVariant.Text)
            }

            if (failed) StatusBlock(tone = StatusTone.Error, message = "잠시 후 다시 시도해 주세요")

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
        }
    }
}
