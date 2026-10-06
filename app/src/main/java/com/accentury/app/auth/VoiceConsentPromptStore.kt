package com.accentury.app.auth

import android.content.Context
import android.content.SharedPreferences

/**
 * 음성 저장 동의 화면을 이 계정에 이미 띄웠는지 (KAN-270, 팀 결정 2026-10-06).
 *
 * 건너뛴 사용자에게는 다시 띄우지 않고, 켜는 길은 설정 화면 하나다. 그런데 서버에는 "건너뜀" 상태가 없어
 * (미동의와 같다) 로컬에 둔다. 계정 id별로 적는 이유: 한 기기에서 다른 계정으로 로그인하면 그 계정은 아직
 * 묻지 않았다. 재설치나 앱 데이터 삭제로 한 번 더 뜨는 것은 허용한다(팀 결정).
 *
 * 파일 이름 `voice_consent_prompt`, 키 = 사용자 id, 값 = true. [com.accentury.app.ads.SharedPreferencesAdConsentStore]와
 * 같은 이유로 앱 기본 prefs가 아니라 전용 파일이다. 판정은 [shouldPromptVoiceConsent]가 한다 — 이 클래스는
 * 계측기 없이 만들 수 없어 단위 테스트는 판정 함수 쪽을 덮는다.
 */
class VoiceConsentPromptStore(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun wasPrompted(userId: String): Boolean = prefs.getBoolean(userId, false)

    // apply — 메인 스레드의 버튼 콜백에서 오는 쓰기다. 되읽기는 메모리 사본에서 즉시 반영된다.
    fun markPrompted(userId: String) {
        prefs.edit().putBoolean(userId, true).apply()
    }

    companion object {
        const val PREFS_NAME = "voice_consent_prompt"
    }
}

/**
 * 동의 화면을 띄울지 (KAN-270). 로그인과 추가 정보를 마친([AuthGateState.SignedIn]) 미동의 계정에, 이 기기에서
 * 아직 묻지 않았을 때만. 동의 상태를 모르면(null — 로그인 직후 `me()` 실패 등) 띄우지 않는다 — 이미 동의한
 * 사람에게 다시 묻는 것보다 이번에 한 번 안 묻는 쪽이 낫고, 설정 화면에서 켤 수 있다.
 */
fun shouldPromptVoiceConsent(state: AuthGateState, wasPrompted: Boolean): Boolean =
    state is AuthGateState.SignedIn && state.voiceConsent?.consented == false && !wasPrompted
