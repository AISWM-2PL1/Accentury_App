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
 *
 * 출신 지역(KAN-270 7단계, 키 `region`)도 같은 파일에 둔다. 익명 세션은 프로필이 없어 서버 라벨이 `UNKNOWN`으로
 * 남기 때문에 설치당 한 번 묻는다([needsAnonymousRegion]). 동의 여부와 무관하게 모두에게 묻는다 (KAN-274) — 서버가
 * 동의하지 않은 익명 세션도 음성 없이 점수와 지역을 남기기 때문이다. 동의를 껐다 켜도 지역은 지우지 않는다.
 */
class AnonymousVoiceConsentStore(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private var asked by mutableStateOf(prefs.getBoolean(KEY_ASKED, false))
    private var consented by mutableStateOf(prefs.getBoolean(KEY_CONSENTED, false))
    private var region by mutableStateOf(prefs.getString(KEY_REGION, null))

    fun asked(): Boolean = asked

    fun consented(): Boolean = consented

    /** 저장된 출신 지역 코드([Region.name]). 아직 안 골랐으면 null */
    fun region(): String? = region

    /** 동의 화면의 선택과 설정 스위치. apply — 메인 스레드 버튼 콜백에서 오는 쓰기다 */
    fun save(consented: Boolean) {
        prefs.edit().putBoolean(KEY_ASKED, true).putBoolean(KEY_CONSENTED, consented).apply()
        asked = true
        this.consented = consented
    }

    /** 지역 선택 화면의 [다음] */
    fun saveRegion(code: String) {
        prefs.edit().putString(KEY_REGION, code).apply()
        region = code
    }

    companion object {
        const val PREFS_NAME = "voice_consent_anonymous"
        const val KEY_ASKED = "asked"
        const val KEY_CONSENTED = "consented"
        const val KEY_REGION = "region"
    }
}

/** 익명 세션 생성 body에 실을 동의 버전. 미동의면 null(키째 빠진다) */
fun anonymousVoiceConsentVersion(consented: Boolean): String? = if (consented) VOICE_CONSENT_VERSION else null

/**
 * 시작 게이트에 지역 단계를 세울지 (KAN-270 7단계). 아직 안 골랐으면 동의 여부와 무관하게 세운다 (KAN-274) — 서버가
 * 동의하지 않은 익명 세션도 음성 없이 점수와 지역을 남기므로 라벨은 모두에게서 받는다. 세션 생성 body의 `region`도
 * 같은 이유로 저장값을 그대로 싣는다([AnonymousVoiceConsentStore.region]).
 */
fun needsAnonymousRegion(region: String?): Boolean = region == null
