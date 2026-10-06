package com.accentury.app.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * 로그인을 끈 빌드(익명 모드)의 음성 저장 동의 (KAN-270 5단계, 팀 결정 2026-10-06).
 *
 * 계정이 없으니 서버에 동의를 둘 자리가 없다 — **설치당 한 번 묻고 기기에 둔다.** 이후 세션(첫 응시·재응시)마다
 * [anonymousVoiceConsentVersion]으로 body의 `voiceConsentVersion`을 정한다. 기본은 미동의다. 재설치·앱 데이터
 * 삭제로 한 번 더 묻는 것은 계정 모드([VoiceConsentPromptStore])와 같이 허용한다.
 *
 * 파일 `voice_consent_anonymous`, 키 `asked`·`consented`. 값을 Compose 상태로도 들고 있어서 [save] 직후 시작 게이트의
 * 동의 단계가 걷히고 설정 스위치가 따라온다(prefs 읽기만으로는 리컴포지션이 일어나지 않는다).
 *
 * 설정 스위치도 [save]를 부른다 — 설정에서 바꾼 것도 "물어봤다"로 친다(PR #22 리뷰의 계정 쪽 규칙과 같다). 그래서
 * 시작 전에 설정에서 켠 사람에게 동의 화면이 또 뜨지 않는다.
 */
class AnonymousVoiceConsentStore(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private var asked by mutableStateOf(prefs.getBoolean(KEY_ASKED, false))
    private var consented by mutableStateOf(prefs.getBoolean(KEY_CONSENTED, false))

    fun asked(): Boolean = asked

    fun consented(): Boolean = consented

    /** 동의 화면의 선택과 설정 스위치. apply — 메인 스레드 버튼 콜백에서 오는 쓰기다 */
    fun save(consented: Boolean) {
        prefs.edit().putBoolean(KEY_ASKED, true).putBoolean(KEY_CONSENTED, consented).apply()
        asked = true
        this.consented = consented
    }

    companion object {
        const val PREFS_NAME = "voice_consent_anonymous"
        const val KEY_ASKED = "asked"
        const val KEY_CONSENTED = "consented"
    }
}

/** 익명 세션 생성 body에 실을 동의 버전. 미동의면 null(키째 빠진다) */
fun anonymousVoiceConsentVersion(consented: Boolean): String? = if (consented) VOICE_CONSENT_VERSION else null
