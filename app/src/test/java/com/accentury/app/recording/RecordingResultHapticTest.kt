package com.accentury.app.recording

import com.accentury.app.audio.QualityStatus
import com.accentury.app.ui.components.Haptic
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RecordingResultHapticTest {

    private fun review(quality: QualityStatus) =
        RecordingUiState.Review(attemptId = "at_1", durationMs = 3_000L, quality = quality, autoStopped = false)

    @Test
    fun `다음으로 넘어갈 수 있는 녹음이면 성공이다`() {
        assertEquals(Haptic.Success, recordingResultHaptic(review(QualityStatus.NORMAL)))
    }

    @Test
    fun `다시 녹음해야 하는 품질이면 실패다`() {
        QualityStatus.entries.filter { it != QualityStatus.NORMAL }.forEach {
            assertEquals(it.name, Haptic.Error, recordingResultHaptic(review(it)))
        }
    }

    @Test
    fun `녹음 실패는 실패다`() {
        assertEquals(Haptic.Error, recordingResultHaptic(RecordingUiState.Failed("mic")))
    }

    @Test
    fun `결과가 아닌 상태는 햅틱이 없다`() {
        assertNull(recordingResultHaptic(RecordingUiState.Idle))
        assertNull(recordingResultHaptic(RecordingUiState.Recording(elapsedMs = 1_000L, rms = 0.0)))
    }
}
