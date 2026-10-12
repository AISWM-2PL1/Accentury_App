package com.accentury.app.recording

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** 녹음 화면의 두 쓰임 (KAN-253). 레벨테스트 모양은 KAN-253 전과 같아야 한다. */
class RecordingPurposeTest {

    @Test
    fun `레벨테스트는 진행 표기가 있고 내 녹음 듣기는 없다`() {
        val purpose = RecordingPurpose.LevelTest(itemNumber = 2, totalItems = 7)
        assertTrue(purpose.showsProgress)
        assertFalse(purpose.offersPlayback)
    }

    @Test
    fun `억양 학습도 진행 표기가 있고(녹음 대기 화면 = 카드, 5단계) 내 녹음 듣기가 있다`() {
        val purpose = RecordingPurpose.IntonationLearning(standard = null, itemNumber = 1, totalItems = 5)
        assertTrue(purpose.showsProgress)
        assertTrue(purpose.offersPlayback)
    }
}
