package com.accentury.app.learning

import com.accentury.app.audio.ClientQuality
import com.accentury.app.bridge.IntonationRecorded
import com.accentury.app.bridge.IntonationRecordingStart
import com.accentury.app.net.TransportFailure
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class IntonationRecordingViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val start = IntonationRecordingStart(
        cardId = "card_1", prompt = "어데 가노?", standard = null, maxDurationMs = 10_000L, itemNumber = 1, totalItems = 3,
    )
    private val quality = ClientQuality(rms = 0.1, peak = 0.8, silenceRatio = 0.1, clipped = false)

    /** 응답을 차례로 돌려주고 실린 키를 기록하는 가짜 업로드. */
    private class FakeUpload(vararg results: IntonationUploadResult) {
        private val queue = ArrayDeque(results.toList())
        val keys = mutableListOf<String>()
        val cards = mutableListOf<String>()
        suspend fun upload(cardId: String, key: String, wav: ByteArray, durationMs: Long, q: ClientQuality): IntonationUploadResult {
            cards += cardId
            keys += key
            return queue.removeFirst()
        }
    }

    private fun viewModel(fake: FakeUpload): IntonationRecordingViewModel {
        var n = 0
        return IntonationRecordingViewModel(upload = fake::upload, newKey = { "k${++n}" })
    }

    private val unavailable = IntonationUploadResult.Rejected(503, "ANALYSIS_UNAVAILABLE", "분석 서버에 연결할 수 없습니다.", retryable = true)
    private val rateLimited = IntonationUploadResult.Rejected(429, "RATE_LIMITED", "잠시 후", retryable = true)

    @Test
    fun `202면 cardId와 attemptId를 회신할 상태가 되고 닫으면 화면이 없다`() = runTest(dispatcher) {
        val fake = FakeUpload(IntonationUploadResult.Accepted("la_1"))
        val vm = viewModel(fake)
        vm.open(start)

        vm.submit(ByteArray(4), 2_000L, quality)
        assertEquals(IntonationUploadState.Uploading, vm.uploadState.value)
        advanceUntilIdle()

        assertEquals(IntonationUploadState.Accepted(IntonationRecorded("card_1", "la_1")), vm.uploadState.value)
        assertEquals(listOf("card_1"), fake.cards)
        vm.close()
        assertNull(vm.start.value)
        assertEquals(IntonationUploadState.Idle, vm.uploadState.value)
    }

    @Test
    fun `같은 녹음의 재시도는 같은 키다`() = runTest(dispatcher) {
        val fake = FakeUpload(IntonationUploadResult.TransportError(TransportFailure.Offline), rateLimited, IntonationUploadResult.Accepted("la_1"))
        val vm = viewModel(fake)
        vm.open(start)

        vm.submit(ByteArray(4), 2_000L, quality)
        advanceUntilIdle()
        assertEquals(IntonationUploadState.Failed("인터넷 연결을 확인해 주세요", retryable = true), vm.uploadState.value)
        vm.retry()
        advanceUntilIdle()
        vm.retry()
        advanceUntilIdle()

        assertEquals(listOf("k1", "k1", "k1"), fake.keys)
        assertTrue(vm.uploadState.value is IntonationUploadState.Accepted)
    }

    @Test
    fun `503 ANALYSIS_UNAVAILABLE 뒤 재시도는 새 키다 - 서버가 같은 키에 실패 시도를 돌려준다`() = runTest(dispatcher) {
        val fake = FakeUpload(unavailable, rateLimited, IntonationUploadResult.Accepted("la_2"))
        val vm = viewModel(fake)
        vm.open(start)

        vm.submit(ByteArray(4), 2_000L, quality)
        advanceUntilIdle()
        vm.retry() // 503 뒤 → 새 키
        advanceUntilIdle()
        vm.retry() // 429 뒤 → 같은 키
        advanceUntilIdle()

        assertEquals(listOf("k1", "k2", "k2"), fake.keys)
    }

    @Test
    fun `다시 녹음해 제출하면 새 키다`() = runTest(dispatcher) {
        val fake = FakeUpload(rateLimited, IntonationUploadResult.Accepted("la_1"))
        val vm = viewModel(fake)
        vm.open(start)

        vm.submit(ByteArray(4), 2_000L, quality)
        advanceUntilIdle()
        vm.discardRecording()
        assertEquals(IntonationUploadState.Idle, vm.uploadState.value)
        vm.submit(ByteArray(4), 2_000L, quality)
        advanceUntilIdle()

        assertEquals(listOf("k1", "k2"), fake.keys)
    }

    @Test
    fun `retryable false면 재시도하지 않을 실패로 서버 문구를 싣는다`() = runTest(dispatcher) {
        val fake = FakeUpload(IntonationUploadResult.Rejected(422, "AUDIO_TOO_LONG", "녹음이 너무 깁니다. (최대 10초)", retryable = false))
        val vm = viewModel(fake)
        vm.open(start)

        vm.submit(ByteArray(4), 2_000L, quality)
        advanceUntilIdle()

        assertEquals(IntonationUploadState.Failed("녹음이 너무 깁니다. (최대 10초)", retryable = false), vm.uploadState.value)
    }

    @Test
    fun `갱신 뒤에도 401이면 로그인 만료 안내다`() = runTest(dispatcher) {
        val fake = FakeUpload(IntonationUploadResult.Rejected(401, "AUTH_TOKEN_INVALID", "로그인이 필요합니다.", retryable = false))
        val vm = viewModel(fake)
        vm.open(start)

        vm.submit(ByteArray(4), 2_000L, quality)
        advanceUntilIdle()

        assertEquals(IntonationUploadState.Failed("로그인이 만료됐어요. 다시 로그인해 주세요", retryable = false), vm.uploadState.value)
    }

    @Test
    fun `업로드 중 닫으면 늦게 온 202가 회신 상태를 만들지 못한다`() = runTest(dispatcher) {
        val gate = CompletableDeferred<IntonationUploadResult>()
        val vm = IntonationRecordingViewModel(upload = { _, _, _, _, _ -> gate.await() })
        vm.open(start)

        vm.submit(ByteArray(4), 2_000L, quality)
        advanceUntilIdle()
        vm.close()
        gate.complete(IntonationUploadResult.Accepted("la_late"))
        advanceUntilIdle()

        assertEquals(IntonationUploadState.Idle, vm.uploadState.value)
        assertNull(vm.start.value)
    }

    @Test
    fun `제출한 음성 바이트는 접수 뒤 0으로 덮인다 (FR-DP-02)`() = runTest(dispatcher) {
        val wav = ByteArray(4) { 7 }
        val vm = viewModel(FakeUpload(IntonationUploadResult.Accepted("la_1")))
        vm.open(start)

        vm.submit(wav, 2_000L, quality)
        advanceUntilIdle()

        assertTrue(wav.all { it == 0.toByte() })
    }
}
