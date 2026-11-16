package com.accentury.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.accentury.app.R
import com.accentury.app.ui.components.AccenturyButton
import com.accentury.app.ui.components.AccenturyTextField
import com.accentury.app.ui.components.ButtonVariant
import com.accentury.app.ui.components.ChoiceButton
import com.accentury.app.ui.components.PaperScreen
import com.accentury.app.ui.components.PaperTitle
import com.accentury.app.ui.theme.Spacing
import java.time.LocalDate
import kotlinx.coroutines.launch

/** 달력이 처음 펼칠 달 — 아무것도 고르지 않았을 때 오늘부터 수십 년을 거슬러 넘기지 않게 한다. */
private const val DEFAULT_PICKER_YEAR = 2000
private const val OLDEST_BIRTH_YEAR = 1900

/**
 * 추가 정보 화면 (KAN-224, §3.10). 로그인은 됐지만 프로필이 미완료일 때 선다. 성별(선택, KAN-330)을 뺀 세 칸이 모두 차야
 * [다음]이 켜지고 건너뛸 수 없다 — 연령은 만 14세 가입 제한의 근거다. 출신 지역은 다음 화면([RegionSelectScreen])이 묻고,
 * 저장도 거기서 두 화면 값을 모아 한 번에 한다(KAN-354 3단계). 그래서 이 화면은 서버에 아무것도 보내지 않는다.
 *
 * @param form 두 화면이 나눠 쓰는 입력. 호출자(AuthGate)가 계정 id별로 들고 있어 지역 화면에서 돌아와도 남는다
 * @param onNext [다음] — 지역 화면으로
 * @param error 지역 화면 저장이 만 14세 미만으로 거절된 안내([AuthFailureReason.UnderAge]). 생년월일을 고칠 수 있는 이 화면에서
 *   [다음] 위에 보인다(PR #74 리뷰). 재시도성 실패는 지역 화면이 그린다
 * @param onSwitchAccount [다른 계정으로 로그인] — 로그아웃해 로그인 화면으로 ([AuthGateController.logout]). 만 14세 미만
 *   거절을 받았거나 계정을 잘못 고른 사용자가 이 화면에 갇히지 않게 하는 유일한 출구다(설정 화면은 KAN-247).
 */
@Composable
fun ProfileScreen(
    form: ProfileFormState,
    onNext: () -> Unit,
    onSwitchAccount: suspend () -> Unit,
    modifier: Modifier = Modifier,
    error: AuthFailure? = null,
) {
    val scope = rememberCoroutineScope()
    var pickingDate by rememberSaveable { mutableStateOf(false) }
    var leaving by remember { mutableStateOf(false) }

    // 시안 s-02-profile (KAN-354): 워드마크 앱바 아래 왼쪽 정렬 본문, 바닥에 [다음 →]. 두 버튼은 바닥 고정(PaperFooter) —
    // 하단 주 버튼은 모든 네이티브 화면에서 같은 자리다(리뷰, 지역 화면과 y가 43dp 어긋났다). 키보드가 떠도 footer는
    // 따라 올라오지 않는다(Scaffold가 시스템 바만 빼고 IME 여백은 주지 않는다) — 입력 칸은 위쪽이라 가려지지 않는다.
    PaperScreen(
        modifier = modifier,
        footer = {
            if (error != null) AuthFailureBlock(error, verb = "저장")

            AccenturyButton(
                text = "다음",
                onClick = onNext,
                modifier = Modifier.fillMaxWidth(),
                enabled = form.isComplete && !leaving,
                trailing = { Icon(painterResource(R.drawable.ic_arrow_forward_24), null, Modifier.size(20.dp)) },
            )

            // 시안에는 없지만 유지한다(티켓 결정) — 프로필을 끝내지 못한 사람이 로그인 화면으로 돌아갈 길이다.
            AccenturyButton(
                text = "다른 계정으로 로그인",
                onClick = {
                    scope.launch {
                        leaving = true
                        try {
                            onSwitchAccount()
                        } finally {
                            leaving = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                variant = ButtonVariant.Text,
                enabled = !leaving,
            )
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.x6)) {
            PaperTitle("몇 가지만 알려 주세요")

            AccenturyTextField(
                label = "이메일",
                value = form.email,
                onValueChange = { form.email = it },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            )
            AccenturyTextField(
                label = "이름",
                value = form.name,
                onValueChange = { form.name = it },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            )
            AccenturyTextField(
                label = "생년월일",
                value = form.birthDate.orEmpty(),
                onValueChange = {},
                placeholder = "눌러서 고르기",
                onClick = { pickingDate = true },
            )

            ChoiceGroup(title = "성별 (선택)") {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.x3)) {
                    Gender.entries.forEach { gender ->
                        ChoiceButton(
                            label = gender.label,
                            selected = form.gender == gender,
                            onClick = { form.gender = gender },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    // 성별은 선택 항목이다 (KAN-330, 서버 KAN-328). null과 같은 값이라 처음부터·서버 값이 없을 때 이것이 골라져 있다.
                    ChoiceButton(
                        label = "선택 안 함",
                        selected = form.gender == null,
                        onClick = { form.gender = null },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }

    if (pickingDate) {
        BirthDatePicker(
            initial = form.birthDate,
            onPicked = { form.birthDate = it },
            onDismiss = { pickingDate = false },
        )
    }
}

/** 선택지 묶음. 제목 아래 칸들이 스크린 리더에 한 그룹(라디오 묶음)으로 읽힌다. */
@Composable
private fun ChoiceGroup(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Spacing.x2)) {
        Text(title, style = MaterialTheme.typography.labelLarge)
        Column(
            modifier = Modifier.selectableGroup(),
            verticalArrangement = Arrangement.spacedBy(Spacing.x3),
        ) { content() }
    }
}

/**
 * 생년월일 달력 (Material3 DatePickerDialog). 선택값은 그날의 UTC 자정 밀리초라 [birthDateOf]가 UTC로 푼다.
 * 미래 날짜는 고를 수 없다 — 만 14세 판정은 서버가 한다(400 `AUTH_UNDER_AGE`).
 */
@Composable
private fun BirthDatePicker(initial: String?, onPicked: (String) -> Unit, onDismiss: () -> Unit) {
    val today = LocalDate.now()
    val selected = initial?.let(::utcMillisOf)
    val pickerState = rememberDatePickerState(
        initialSelectedDateMillis = selected,
        initialDisplayedMonthMillis = selected ?: utcMillisOf(LocalDate.of(DEFAULT_PICKER_YEAR, 1, 1).toString()),
        yearRange = OLDEST_BIRTH_YEAR..today.year,
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                !LocalDate.parse(birthDateOf(utcTimeMillis)).isAfter(today)

            override fun isSelectableYear(year: Int): Boolean = year <= today.year
        },
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            AccenturyButton(
                text = "확인",
                onClick = {
                    pickerState.selectedDateMillis?.let { onPicked(birthDateOf(it)) }
                    onDismiss()
                },
                variant = ButtonVariant.Text,
                enabled = pickerState.selectedDateMillis != null,
            )
        },
        dismissButton = { AccenturyButton(text = "취소", onClick = onDismiss, variant = ButtonVariant.Text) },
    ) {
        DatePicker(state = pickerState)
    }
}
