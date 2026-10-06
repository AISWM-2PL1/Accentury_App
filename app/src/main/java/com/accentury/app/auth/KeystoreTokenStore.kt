package com.accentury.app.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.ProviderException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
private const val KEY_ALIAS = "accentury_auth_tokens"
private const val TRANSFORMATION = "AES/GCM/NoPadding"
private const val KEY_SIZE_BITS = 256
private const val GCM_TAG_BITS = 128
private const val GCM_IV_BYTES = 12

/**
 * 파일 이름. 백업 제외 규칙(res/xml/backup_rules.xml·data_extraction_rules.xml)이
 * `datastore/auth_tokens.preferences_pb`로 이 이름을 그대로 적고 있다 — 바꾸면 거기도 함께 바꾼다.
 */
private const val STORE_NAME = "auth_tokens"

/*
 * Preferences DataStore는 파일 하나당 인스턴스가 하나여야 한다(둘이면 서로의 쓰기를 덮는다). 최상위
 * 위임 프로퍼티가 프로세스 단일 인스턴스를 보장하는 공식 방식이다.
 * https://developer.android.com/topic/libraries/architecture/datastore (datastore-preferences 1.2.1)
 *
 * 파일이 깨졌으면(CorruptionException) 빈 값으로 갈아 끼운다 — 처리기가 없으면 읽을 때마다 예외가 나 앱이 시작
 * 게이트에서 매번 죽는다. 복호화 실패와 같은 규칙이다: 되살릴 수 없는 쌍은 로그아웃으로 본다(클래스 KDoc).
 */
private val Context.authTokenDataStore: DataStore<Preferences> by preferencesDataStore(
    name = STORE_NAME,
    corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
)

private val SEALED_TOKENS = stringPreferencesKey("sealed_tokens")

/**
 * 토큰 쌍을 Android Keystore의 AES-256-GCM 키로 암호화해 DataStore에 두는 저장소 (KAN-224).
 *
 * EncryptedSharedPreferences(security-crypto)를 쓰지 않는 이유: 라이브러리가 deprecated 됐다. 대신 같은
 * 일을 플랫폼 API로 직접 한다 — 키는 Keystore 밖으로 나오지 않고(루팅되지 않은 기기에서 파일을 빼 가도
 * 복호화할 수 없다), DataStore에는 `base64(IV ‖ 암호문)` 한 줄만 남는다.
 *
 * **복호화 실패는 로그아웃으로 본다.** Keystore 키는 백업·기기 이전으로 따라가지 않으므로 파일만 복원되면
 * 영영 풀 수 없는 암호문이 남는다. 그 상태를 지우고 null을 돌려주면 사용자는 다시 로그인하면 된다 —
 * 예외를 올리면 앱이 시작 게이트에서 매번 같은 자리에서 죽는다. 애초에 파일이 백업되지 않게 제외
 * 규칙도 걸어 두었다(STORE_NAME 주석).
 *
 * 읽은 값은 메모리에 들고 있는다. [AccessTokenInterceptor]가 요청마다 [read]를 부르는데, 그때마다
 * 디스크를 읽고 Keystore로 복호화하면 요청마다 수 ms가 더해진다. 쓰기는 이 인스턴스만 하므로 캐시가
 * 파일과 어긋날 경로가 없다 — 앱 안에서 이 클래스는 하나만 만든다(MainActivity 결선).
 */
class KeystoreTokenStore(context: Context) : TokenStore {

    private val dataStore = context.applicationContext.authTokenDataStore

    private val json = Json { ignoreUnknownKeys = true }

    private val lock = Mutex()

    // 캐시가 비어 있음(아직 안 읽음)과 저장된 값이 없음(null)을 가르려고 로드 여부를 따로 든다.
    private var loaded = false
    private var cached: AuthTokens? = null

    override suspend fun read(): AuthTokens? = lock.withLock {
        if (!loaded) {
            cached = load()
            loaded = true
        }
        cached
    }

    override suspend fun save(tokens: AuthTokens): Boolean = lock.withLock {
        // 실패해도 메모리 값은 새 쌍으로 둔다 — 이 프로세스가 사는 동안은 회전된 쌍이 정본이다. 옛 쌍을 들고 있으면
        // 다음 갱신이 이미 죽은 Refresh를 내 패밀리가 폐기된다. 예외는 삼킨다: 갱신은 OkHttp Authenticator 안
        // runBlocking에서 돌아 여기서 던지면 요청 스레드가 죽는다. 예외 메시지에 암호문 조각이 실릴 수 있어 로그로 남기지 않는다.
        cached = tokens
        loaded = true
        try {
            val sealed = seal(json.encodeToString(AuthTokens.serializer(), tokens))
            dataStore.edit { it[SEALED_TOKENS] = sealed }
            true
        } catch (_: GeneralSecurityException) {
            false
        } catch (_: ProviderException) {
            // Keystore 내부 실패(키 생성·하드웨어 오류)는 GeneralSecurityException이 아닌 런타임 예외로 온다.
            false
        } catch (_: IOException) {
            false
        }
    }

    override suspend fun clear(): Unit = lock.withLock {
        cached = null
        loaded = true
        try {
            dataStore.edit { it.remove(SEALED_TOKENS) }
        } catch (_: IOException) {
            // 파일에 남은 쌍은 다음 시작의 갱신에서 서버가 판정한다 — 로그아웃 직후라면 이미 폐기된 Refresh다.
        }
    }

    private suspend fun load(): AuthTokens? {
        // 읽기 실패(디스크 오류 — 손상은 위 처리기가 빈 값으로 바꾼다)도 쌍이 없는 것으로 본다. [read]는 던지지 않는다
        // (TokenStore 계약). 이 프로세스 동안은 null로 캐시된다 — 다시 로그인하면 저장이 덮어쓴다.
        val sealed = try {
            dataStore.data.first()[SEALED_TOKENS]
        } catch (_: IOException) {
            null
        } ?: return null
        return try {
            json.decodeFromString(AuthTokens.serializer(), open(sealed))
        } catch (_: Exception) {
            // 키 유실(백업 복원·잠금 방식 변경)·손상된 값 — 어느 쪽이든 되살릴 방법이 없다. 클래스 KDoc 참조.
            // 예외 메시지에 암호문 조각이 실릴 수 있어 로그로 남기지 않는다.
            try {
                dataStore.edit { it.remove(SEALED_TOKENS) }
            } catch (_: IOException) {
                // 지우지 못한 암호문은 다음 실행에서 또 복호화에 실패해 여기로 온다 — 결과는 같다.
            }
            null
        }
    }

    private fun seal(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        // IV는 Keystore가 고른다 — 호출자가 IV를 정하는 것을 Keystore 키가 기본으로 막는다(재사용 방지).
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        return Base64.encodeToString(cipher.iv + cipher.doFinal(plain.toByteArray()), Base64.NO_WRAP)
    }

    private fun open(sealed: String): String {
        val bytes = Base64.decode(sealed, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(),
            GCMParameterSpec(GCM_TAG_BITS, bytes, 0, GCM_IV_BYTES),
        )
        return String(cipher.doFinal(bytes, GCM_IV_BYTES, bytes.size - GCM_IV_BYTES))
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER).run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(KEY_SIZE_BITS)
                    .build(),
            )
            generateKey()
        }
    }
}
