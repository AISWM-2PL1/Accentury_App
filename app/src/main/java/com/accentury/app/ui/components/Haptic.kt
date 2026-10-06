package com.accentury.app.ui.components

import android.view.View
import androidx.core.view.HapticFeedbackConstantsCompat
import androidx.core.view.ViewCompat

/**
 * 햅틱 종류 (KAN-258). 브리지 `haptic(type)`이 받는 세 값이자 네이티브 Compose 버튼이 쓰는 값이다
 * (webview-bridge.md §9). 웹 `HapticType`·iOS allowlist와 같은 세 값이어야 한다 — 하나를 늘리면
 * 셋을 함께 고친다.
 *
 * @property bridgeValue 브리지 계약의 문자열
 */
enum class Haptic(val bridgeValue: String) {
    /** Primary 버튼·녹음 버튼·객관식 선택의 가벼운 탭 */
    Tap("tap"),

    /** 녹음이 다음으로 넘어갈 수 있는 품질로 끝났다 */
    Success("success"),

    /** 녹음이 실패했거나 다시 녹음해야 하는 품질로 끝났다 */
    Error("error");

    companion object {
        /**
         * 브리지 문자열을 종류로 읽는다. 계약 밖 문자열은 null — 브리지가 조용히 버리는 근거다(§5).
         * [com.accentury.app.ads.AdConsent.fromBridgeValue]와 같은 이유로 대소문자·공백을 보정하지
         * 않는다: 보정을 시작하면 웹과 앱이 다른 계약을 들고도 "동작하는" 상태가 생긴다.
         */
        fun fromBridgeValue(raw: String): Haptic? = entries.firstOrNull { it.bridgeValue == raw }
    }
}

/**
 * 햅틱을 이 뷰에서 낸다 (KAN-258). 브리지(WebView)와 Compose(`LocalView.current`)가 같은 매핑을
 * 쓰도록 한 자리에 뒀다 — Compose의 `HapticFeedbackType`을 따로 쓰면 매핑이 둘이 된다.
 *
 * `Vibrator`가 아니라 View 햅틱인 이유: VIBRATE 권한이 필요 없고, 플래그 없는 호출은 OS 「터치
 * 진동」 설정과 뷰의 `isHapticFeedbackEnabled`를 따른다. 설정을 끈 사용자에게 떨지 않는 판단을
 * 우리가 다시 하지 않는다 (`FLAG_IGNORE_GLOBAL_SETTING`을 쓰지 않는 이유).
 *
 * 매핑 (https://developer.android.com/reference/android/view/HapticFeedbackConstants):
 * - [Haptic.Tap] → `VIRTUAL_KEY` — "화면 위 키를 눌렀다"는 뜻이 버튼 탭과 같고 기기마다 짧은 클릭이다.
 *   `CONTEXT_CLICK`은 마우스 우클릭용이라 제조사에 따라 약하거나 빠지는 경우가 있어 고르지 않았다
 * - [Haptic.Success] → `CONFIRM`, [Haptic.Error] → `REJECT` — 둘 다 API 30부터다
 *
 * minSdk 29 대비는 [ViewCompat.performHapticFeedback]에 맡긴다. API 29에서 `CONFIRM`은
 * `VIRTUAL_KEY`로, `REJECT`는 `LONG_PRESS`로 바꿔 부른다 (androidx.core 1.19
 * `HapticFeedbackConstantsCompat.getFeedbackConstantOrFallback`) — 그래서 API 29에서 성공은 탭과
 * 같은 느낌이고, 실패만 길게 구분된다. 내부적으로 플래그 없는 `View.performHapticFeedback(int)`를 부른다.
 */
fun View.performHaptic(haptic: Haptic) {
    val constant = when (haptic) {
        Haptic.Tap -> HapticFeedbackConstantsCompat.VIRTUAL_KEY
        Haptic.Success -> HapticFeedbackConstantsCompat.CONFIRM
        Haptic.Error -> HapticFeedbackConstantsCompat.REJECT
    }
    ViewCompat.performHapticFeedback(this, constant)
}
