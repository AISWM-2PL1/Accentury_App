package com.accentury.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Surface
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import com.accentury.app.ui.components.AccenturyButton
import com.accentury.app.ui.components.AccenturyTextField
import com.accentury.app.ui.components.ButtonVariant
import com.accentury.app.ui.components.ChoiceButton
import com.accentury.app.ui.theme.Dimens
import com.accentury.app.ui.theme.Spacing
import java.time.LocalDate
import kotlinx.coroutines.launch

/** 달력이 처음 펼칠 달 — 아무것도 고르지 않았을 때 오늘부터 수십 년을 거슬러 넘기지 않게 한다. */
private const val DEFAULT_PICKER_YEAR = 2000
private const val OLDEST_BIRTH_YEAR = 1900

/**
 * 추가 정보 화면 (KAN-224, §3.10). 로그인은 됐지만 프로필이 미완료일 때 선다. 다섯 칸이 모두 차야
 * [완료]가 켜지고 건너뛸 수 없다 — 출신지역은 학습 데이터 라벨이고(KAN-201), 연령은 만 14세 가입 제한의 근거다.
 *
 * @param user 서버가 아는 계정 값. 칸을 미리 채운다
 * @param error 방금 실패한 제출의 안내 ([AuthGateState.NeedsProfile.error])
 * @param onSubmit [AuthGateController.submitProfile]
 * @param onSwitchAccount [다른 계정으로 로그인] — 로그아웃해 로그인 화면으로 ([AuthGateController.logout]). 만 14세 미만
 *   거절을 받았거나 계정을 잘못 고른 사용자가 이 화면에 갇히지 않게 하는 유일한 출구다(설정 화면은 KAN-247).
 */
@Composable
fun ProfileScreen(
    user: AuthUser,
    error: AuthFailure?,
    onSubmit: suspend (ProfileInput) -> Unit,
    onSwitchAccount: suspend () -> Unit,
    modifier: Modifier = Modifier,
) {
    // 계정이 바뀌면(다른 계정으로 다시 로그인) 앞 계정의 입력을 물려받지 않는다.
    val form = rememberSaveable(user.id, saver = ProfileFormState.saver()) { ProfileFormState.from(user) }
    val scope = rememberCoroutineScope()
    var pickingDate by rememberSaveable { mutableStateOf(false) }
    var leaving by remember { mutableStateOf(false) }

    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(start = Spacing.x6, end = Spacing.x6, top = Dimens.screenPaddingTop, bottom = Spacing.x8),
            verticalArrangement = Arrangement.spacedBy(Spacing.x6),
        ) {
            Text(
                "몇 가지만 알려 주세요",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.semantics { heading() },
            )

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

            ChoiceGroup(title = "성별") {
                Row(horizontalArrangement = Arrangement.spacedBy(Spacing.x3)) {
                    Gender.entries.forEach { gender ->
                        ChoiceButton(
                            label = gender.label,
                            selected = form.gender == gender,
                            onClick = { form.gender = gender },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            // 질문은 웹 지역 선택 화면(RegionSelectScreen)과 같은 문장이다 — 같은 값을 묻는 두 화면이 다르게 묻지 않게.
            ChoiceGroup(title = "어느 지역 말씨가 몸에 배어 있나요?") {
                Region.entries.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(Spacing.x3)) {
                        row.forEach { region ->
                            ChoiceButton(
                                label = region.label,
                                selected = form.region == region,
                                onClick = { form.region = region },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }

            if (error != null) AuthFailureBlock(error, verb = "저장")

            AccenturyButton(
                text = "완료",
                onClick = {
                    scope.launch {
                        form.submitting = true
                        try {
                            onSubmit(form.toInput())
                        } finally {
                            form.submitting = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = form.isComplete && !form.submitting && !leaving,
            )

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
                enabled = !form.submitting && !leaving,
            )
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
