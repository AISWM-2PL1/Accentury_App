package com.accentury.app.auth

import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProfileFormStateTest {

    private fun complete() = ProfileFormState(
        email = "a@b.co",
        name = "이름",
        birthDate = "2000-01-02",
        gender = Gender.FEMALE,
        region = Region.JEJU,
    )

    @Test
    fun `다섯 칸이 다 차야 완료할 수 있다`() {
        assertTrue(complete().isComplete)
        assertFalse(complete().apply { email = "" }.isComplete)
        assertFalse(complete().apply { name = "" }.isComplete)
        assertFalse(complete().apply { birthDate = null }.isComplete)
        assertFalse(complete().apply { gender = null }.isComplete)
        assertFalse(complete().apply { region = null }.isComplete)
    }

    @Test
    fun `공백뿐인 이메일과 이름, 골뱅이 없는 이메일은 빈칸이다`() {
        assertFalse(complete().apply { email = "   " }.isComplete)
        assertFalse(complete().apply { name = "  \t" }.isComplete)
        assertFalse(complete().apply { email = "ab.co" }.isComplete)
    }

    @Test
    fun `보낼 때 앞뒤 공백을 걷고 코드는 서버 이름 그대로다`() {
        val input = complete().apply { email = "  a@b.co "; name = " 이름 " }.toInput()
        assertEquals(ProfileInput("a@b.co", "이름", "2000-01-02", "FEMALE", "JEJU"), input)
    }

    @Test
    fun `서버 계정 값으로 칸을 미리 채운다 - 애플 릴레이 이메일도 그대로`() {
        val user = AuthUser(
            id = "u-1",
            provider = Provider.APPLE,
            email = "x1y2@privaterelay.appleid.com",
            name = "홍길동",
            region = "GYEONGNAM",
        )
        val form = ProfileFormState.from(user)

        assertEquals("x1y2@privaterelay.appleid.com", form.email)
        assertEquals("홍길동", form.name)
        assertEquals(Region.GYEONGNAM, form.region)
        assertEquals(null, form.gender)
        assertFalse(form.isComplete)
    }

    @Test
    fun `모르는 코드는 빈칸으로 둔다`() {
        val form = ProfileFormState.from(AuthUser(id = "u", provider = Provider.GOOGLE, gender = "OTHER", region = "UNKNOWN"))
        assertEquals(null, form.gender)
        assertEquals(null, form.region)
    }

    @Test
    fun `달력의 UTC 자정은 기기 시간대와 무관하게 그날이다 - KST와 서쪽 시간대`() {
        val original = TimeZone.getDefault()
        try {
            val jan2 = utcMillisOf("2000-01-02")!!
            TimeZone.setDefault(TimeZone.getTimeZone("Asia/Seoul"))
            assertEquals("2000-01-02", birthDateOf(jan2))
            TimeZone.setDefault(TimeZone.getTimeZone("America/Los_Angeles"))
            assertEquals("2000-01-02", birthDateOf(jan2))
        } finally {
            TimeZone.setDefault(original)
        }
    }

    @Test
    fun `KST 자정 직전의 UTC 값도 UTC 날짜로 읽는다`() {
        // 2000-01-01T15:00Z = KST 2000-01-02 00:00. 달력은 UTC 자정만 주지만 경계에서 기기 시간대를 타지 않는지 본다.
        val kstMidnight = utcMillisOf("2000-01-01")!! + 15 * 60 * 60 * 1000L
        assertEquals("2000-01-01", birthDateOf(kstMidnight))
    }

    @Test
    fun `날짜 왕복과 깨진 형식`() {
        assertEquals("1999-12-31", birthDateOf(utcMillisOf("1999-12-31")!!))
        assertEquals(null, utcMillisOf("2000/01/02"))
    }

    @Test
    fun `지역은 웹 regions ts와 같은 순서 같은 표기다`() {
        assertEquals(
            listOf("서울", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"),
            Region.entries.map { it.label },
        )
    }
}
