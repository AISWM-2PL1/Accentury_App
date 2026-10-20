package com.accentury.app.recording

import com.accentury.app.audio.QualityStatus
import com.accentury.app.audio.RecordingEngine

sealed interface RecordingUiState {

    data object Idle : RecordingUiState

    /**
     * @property pitchFrames 녹음 시작부터 지금까지 누적된 F0 프레임 (시각 순).
     *   청크마다 새로 온 몇 개가 아니라 전부인 이유는 곡선을 매번 다시 그리기 때문이다.
     */
    data class Recording(
        val elapsedMs: Long,
        val rms: Double,
        val pitchFrames: List<RecordingEngine.PitchFrame> = emptyList(),
    ) : RecordingUiState {
        /**
         * 지금이 8초 경고 구간인가. 판정은 [isCountdownWarning]이 하고 여기는 상한만 채운다 —
         * 경계와 반올림이 웹과 같은 값이어야 해서 규칙을 한 자리에 뒀다 (`RecordingCountdown.kt`).
         *
         * `elapsedMs >= 8_000`을 직접 적던 것을 "남은 시간 2초 이하"로 바꿨다. 값이 같아
         * 동작은 그대로지만, 상한이 문항마다 달라지는 날 비율도 절대값도 아닌 **남은 시간**이
         * 옳은 기준이라는 것이 식에 남는다.
         */
        val countdownActive: Boolean
            get() = isCountdownWarning(elapsedMs, RecordingEngine.MAX_DURATION_MS)
    }

    /**
     * @property pitchFrames 방금 끝난 녹음의 F0 프레임 전체. 재녹음과 다음을 고르는 화면이
     *   자기 억양을 가이드와 비교할 순간이라, 곡선을 지우지 않고 남겨 둔다.
     */
    data class Review(
        val attemptId: String,
        val durationMs: Long,
        val quality: QualityStatus,
        val autoStopped: Boolean,
        val pitchFrames: List<RecordingEngine.PitchFrame> = emptyList(),
    ) : RecordingUiState {
        val canProceed: Boolean get() = quality == QualityStatus.NORMAL
    }

    data class Failed(val reason: String) : RecordingUiState
}

/**
 * 녹음 화면을 누가 띄웠는가 (KAN-253). 상태 머신·품질 선차단·10초 컷·2단 레인은 같고, 위쪽 표기와 확인 단계의 보조
 * 동작만 갈린다. 확인 뒤 무엇을 할지(업로드 대상)는 호출자의 `onNext`가 정한다 — 화면은 세션도 카드도 모른다.
 */
sealed interface RecordingPurpose {

    /** 확인 단계에 [내 녹음 듣기]를 두는가 — 학습에만 (2026-10-12 착수 결정). */
    val offersPlayback: Boolean

    /**
     * 레벨테스트 음성 문항 (KAN-100). 화면 모양은 KAN-253 전과 같다.
     * [emotion]은 대사 위 감정 칩의 재료다 (KAN-283) — 칩을 그릴지는 `emotionCue`가 가른다.
     */
    data class LevelTest(val itemNumber: Int, val totalItems: Int, val emotion: String? = null) : RecordingPurpose {
        override val offersPlayback get() = false
    }

    /**
     * 억양 학습 카드 (KAN-253, webview-bridge.md §12). 표준어 줄은 null이면 생략.
     * 5단계부터 녹음 대기 화면이 A-2 카드 역할을 하므로 레벨테스트와 같은 진행 표기(「카드 진행률」)를 그린다.
     */
    data class IntonationLearning(val standard: String?, val itemNumber: Int, val totalItems: Int) : RecordingPurpose {
        override val offersPlayback get() = true
    }
}
