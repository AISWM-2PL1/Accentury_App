package com.accentury.app.auth

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LoginScreenStateTest {

    private val credential = LoginCredential(Provider.KAKAO, accessToken = "t")

    @Test
    fun `동의 전에는 버튼이 꺼져 있고 눌러도 아무 일도 없다`() = runTest {
        val state = LoginScreenState()
        var idpCalled = false

        state.signIn(idp = { idpCalled = true; IdpOutcome.Cancelled }, login = {})

        assertFalse(state.buttonsEnabled)
        assertFalse(idpCalled)
    }

    @Test
    fun `로그인이 도는 동안에는 버튼이 꺼지고 두 번째 탭은 무시된다`() = runTest {
        val state = LoginScreenState(consented = true)
        val gate = CompletableDeferred<IdpOutcome>()
        var logins = 0

        val first = launch { state.signIn(idp = { gate.await() }, login = { logins++ }) }
        testScheduler.runCurrent()
        assertTrue(state.inFlight)
        assertFalse(state.buttonsEnabled)

        state.signIn(idp = { IdpOutcome.Credential(credential) }, login = { logins++ })
        gate.complete(IdpOutcome.Credential(credential))
        first.join()

        assertEquals(1, logins)
        assertFalse(state.inFlight)
        assertTrue(state.buttonsEnabled)
    }

    @Test
    fun `IdP에서 취소하면 오류도 서버 로그인도 없다`() = runTest {
        val state = LoginScreenState(consented = true)
        var loggedIn = false

        state.signIn(idp = { IdpOutcome.Cancelled }, login = { loggedIn = true })

        assertNull(state.idpError)
        assertFalse(loggedIn)
        assertFalse(state.inFlight)
    }

    @Test
    fun `IdP 실패는 다시 시도 안내가 되고 다음 시도가 지운다`() = runTest {
        val state = LoginScreenState(consented = true)

        state.signIn(idp = { IdpOutcome.Failed }, login = {})
        assertEquals(AuthFailure(AuthFailureReason.Retry), state.idpError)

        state.signIn(idp = { IdpOutcome.Cancelled }, login = {})
        assertNull(state.idpError)
    }

    @Test
    fun `토큰을 받으면 그 자격 그대로 서버 로그인으로 넘긴다`() = runTest {
        val state = LoginScreenState(consented = true)
        var sent: LoginCredential? = null

        state.signIn(idp = { IdpOutcome.Credential(credential) }, login = { sent = it })

        assertEquals(credential, sent)
    }

    @Test
    fun `설정이 빈 제공자는 숨기고 순서는 구글 카카오 네이버다`() {
        assertEquals(
            listOf(Provider.GOOGLE, Provider.NAVER),
            visibleProviders(setOf(Provider.NAVER, Provider.GOOGLE), fakeIdp = false),
        )
        assertEquals(emptyList<Provider>(), visibleProviders(emptySet(), fakeIdp = false))
    }

    @Test
    fun `가짜 IdP면 설정이 없어도 셋 다 보인다`() {
        assertEquals(
            listOf(Provider.GOOGLE, Provider.KAKAO, Provider.NAVER),
            visibleProviders(emptySet(), fakeIdp = true),
        )
    }
}
