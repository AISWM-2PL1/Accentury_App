package com.accentury.app.auth

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.setValue
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * DatePicker가 준 밀리초를 `YYYY-MM-DD`로 (KAN-224).
 *
 * Material3 DatePicker의 선택값은 **그 날짜의 UTC 자정**이다. 기기 시간대(KST)로 풀면 UTC 자정이 KST
 * 09시라 날짜는 맞지만, 서쪽 시간대(UTC-)에서는 전날이 된다 — 그래서 늘 UTC로 푼다.
 */
fun birthDateOf(utcMillis: Long): String =
    Instant.ofEpochMilli(utcMillis).atOffset(ZoneOffset.UTC).toLocalDate().toString()

/** [birthDateOf]의 역 — 이미 고른 날짜를 DatePicker의 초기 선택으로 되돌린다. 형식이 깨졌으면 null. */
fun utcMillisOf(birthDate: String): Long? = runCatching {
    LocalDate.parse(birthDate).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
}.getOrNull()

/**
 * 추가 정보 화면의 입력 (KAN-224, §3.10). 다섯 칸이 다 차야 [완료]가 켜진다 — 건너뛰기는 없다.
 *
 * 서버가 이미 아는 값은 미리 채운다: IdP가 준 이메일·이름, 그리고 다른 기기에서 입력했다가 서버가
 * 미완료로 되돌린 경우(403 `AUTH_PROFILE_INCOMPLETE`)의 나머지 값. 애플 릴레이 이메일도 고치지 않고 그대로 둔다.
 */
class ProfileFormState(
    email: String = "",
    name: String = "",
    birthDate: String? = null,
    gender: Gender? = null,
    region: Region? = null,
) {
    var email: String by mutableStateOf(email)
    var name: String by mutableStateOf(name)

    /** `YYYY-MM-DD`. 달력에서만 고른다 — 손으로 치는 칸이 아니다. */
    var birthDate: String? by mutableStateOf(birthDate)
    var gender: Gender? by mutableStateOf(gender)
    var region: Region? by mutableStateOf(region)

    /** 제출이 나가 있다 — [완료]를 다시 누를 수 없다. */
    var submitting: Boolean by mutableStateOf(false)

    /** 이메일 검증은 '@'가 있는지까지만 본다. 형식의 정본은 서버 검증(400 `VALIDATION_FAILED`)이다. */
    val isComplete: Boolean
        get() = email.trim().let { it.isNotEmpty() && '@' in it } &&
            name.isNotBlank() && birthDate != null && gender != null && region != null

    /** [isComplete]일 때만 부른다. 앞뒤 공백은 서버로 보내지 않는다. */
    fun toInput(): ProfileInput = ProfileInput(
        email = email.trim(),
        name = name.trim(),
        birthDate = checkNotNull(birthDate),
        gender = checkNotNull(gender).name,
        region = checkNotNull(region).name,
    )

    companion object {
        /** 서버가 준 계정 값으로 채운다. 모르는 코드(서버가 값을 늘린 경우)는 빈칸으로 두고 다시 고르게 한다. */
        fun from(user: AuthUser): ProfileFormState = ProfileFormState(
            email = user.email.orEmpty(),
            name = user.name.orEmpty(),
            birthDate = user.birthDate,
            gender = Gender.entries.firstOrNull { it.name == user.gender },
            region = Region.entries.firstOrNull { it.name == user.region },
        )

        /** 회전·프로세스 복원에 입력을 넘긴다. 제출 중 표시는 요청과 함께 사라지므로 싣지 않는다. */
        fun saver(): Saver<ProfileFormState, List<String?>> = Saver(
            save = { listOf(it.email, it.name, it.birthDate, it.gender?.name, it.region?.name) },
            restore = { saved ->
                ProfileFormState(
                    email = saved[0].orEmpty(),
                    name = saved[1].orEmpty(),
                    birthDate = saved[2],
                    gender = Gender.entries.firstOrNull { it.name == saved[3] },
                    region = Region.entries.firstOrNull { it.name == saved[4] },
                )
            },
        )
    }
}
