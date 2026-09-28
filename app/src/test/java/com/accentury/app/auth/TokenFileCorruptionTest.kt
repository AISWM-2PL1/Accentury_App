package com.accentury.app.auth

import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * 토큰 파일이 깨졌을 때 KeystoreTokenStore의 처리기(ReplaceFileCorruptionHandler → 빈 값)가 읽기를 예외 대신
 * 빈 값으로 바꾸는지 본다. 처리기가 없으면 CorruptionException이 시작 확인까지 올라가 앱이 매번 죽었다.
 */
class TokenFileCorruptionTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun `깨진 토큰 파일은 예외 없이 빈 값으로 읽힌다`() = runTest {
        val file = tmp.newFile("auth_tokens.preferences_pb").apply { writeBytes(byteArrayOf(0x7f, 0x00, 0x13, 0x37)) }
        val store = PreferenceDataStoreFactory.create(
            corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
            scope = backgroundScope,
            produceFile = { file },
        )

        assertNull(store.data.first()[stringPreferencesKey("sealed_tokens")])
    }
}
