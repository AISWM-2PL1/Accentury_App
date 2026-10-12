package com.accentury.app.learning

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.accentury.app.audio.ClientQuality
import com.accentury.app.bridge.IntonationRecorded
import com.accentury.app.bridge.IntonationRecordingStart
import com.accentury.app.upload.userMessage
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

/** 서버가 그 키의 시도를 실패로 기록했을 수 있는 코드 — 재시도 때 새 키를 쓴다 (아래 KDoc). */
private const val CODE_ANALYSIS_UNAVAILABLE = "ANALYSIS_UNAVAILABLE"
private const val STATUS_UNAUTHORIZED = 401

/** 억양 녹음 업로드의 화면 쪽 상태 (KAN-253). */
sealed interface IntonationUploadState {
    /** 아직 제출 전 — 녹음 화면이 대기·녹음·확인 단계를 스스로 그린다. */
    data object Idle : IntonationUploadState
    data object Uploading : IntonationUploadState

    /** @property retryable false면 [재시도] 대신 다시 녹음을 안내한다(오디오가 같으면 결과도 같다). */
    data class Failed(val message: String, val retryable: Boolean) : IntonationUploadState

    /** 202 접수. 호출자가 웹에 한 번 회신하고 [IntonationRecordingViewModel.close]로 화면을 닫는다. */
    data class Accepted(val recorded: IntonationRecorded) : IntonationUploadState
}

/**
 * 억양 학습 녹음 화면(A-3)의 열림과 업로드 (KAN-253, webview-bridge.md §12).
 *
 * 레벨테스트의 TestFlowController·UploadViewModel을 쓰지 않는다 — 학습은 세션·문항 인덱스·보관 음성 복구가 없고, 업로드
 * 실패를 웹으로 돌아간 뒤 상태 바에서 푸는 것이 아니라 녹음 화면 안에서 푼다(회신은 성공만). 그래서 상태가 열린 카드 하나와
 * 그 카드의 제출 하나뿐이다.
 *
 * ViewModel인 이유는 [com.accentury.app.upload.UploadViewModel]과 같다 — 회전으로 Activity가 다시 서도 열린 화면과
 * 올라가던 업로드가 살아야 한다. 프로세스 사망은 회신 없이 A-2로 돌아간 것과 같다(이탈 허용).
 *
 * **멱등 키 규칙**: 확인 단계에서 제출한 녹음 1건마다 새 키, 그 녹음의 [retry]는 같은 키. 단 `503 ANALYSIS_UNAVAILABLE`
 * 뒤에는 새 키다 — 서버(IntonationScoringService.upload)는 분석 큐 전달이 실패하면 그 키의 시도를 RETRYABLE_FAILED로
 * 커밋한 뒤 503을 주고, 같은 키 재전송에는 분석을 다시 돌리지 않고 그 실패 시도를 202로 돌려준다. 같은 키로 재시도하면
 * 웹은 202를 받고 영영 실패할 시도를 폴링한다.
 *
 * @param upload [IntonationUploadClient.upload]. 함수로 받는 이유는 JVM 테스트에서 네트워크 없이 키 규칙을 보려는 것이다
 */
class IntonationRecordingViewModel(
    private val upload: suspend (
        cardId: String,
        idempotencyKey: String,
        wavBytes: ByteArray,
        durationMs: Long,
        clientQuality: ClientQuality,
    ) -> IntonationUploadResult,
    private val newKey: () -> String = { "li_" + UUID.randomUUID() },
) : ViewModel() {

    private class Pending(val wavBytes: ByteArray, val durationMs: Long, val clientQuality: ClientQuality, val key: String)

    private val _start = MutableStateFlow<IntonationRecordingStart?>(null)

    /** 열린 카드. null이면 녹음 화면이 없다. */
    val start: StateFlow<IntonationRecordingStart?> = _start.asStateFlow()

    private val _upload = MutableStateFlow<IntonationUploadState>(IntonationUploadState.Idle)
    val uploadState: StateFlow<IntonationUploadState> = _upload.asStateFlow()

    private var pending: Pending? = null
    private var job: Job? = null

    /** 웹의 `startIntonationRecording`. 앞 카드의 화면이 남아 있으면 버리고 새로 연다. */
    fun open(start: IntonationRecordingStart) {
        close()
        _start.value = start
    }

    /** 뒤로가기·회신 뒤·로그아웃. 진행 중 업로드는 버린다 — 서버에 닿았더라도 다음 녹음은 새 키라 별개 시도다(§12). */
    fun close() {
        discardRecording()
        _start.value = null
    }

    /** 확인 단계의 제출. 녹음 1건 = 새 키. */
    fun submit(wavBytes: ByteArray, durationMs: Long, clientQuality: ClientQuality) {
        if (_upload.value == IntonationUploadState.Uploading) return
        wipe()
        pending = Pending(wavBytes, durationMs, clientQuality, newKey())
        send()
    }

    /** 실패 뒤 [재시도]. 횟수 제한 없음. */
    fun retry() {
        if (_upload.value !is IntonationUploadState.Failed) return
        send()
    }

    /** 다시 녹음 — 제출한 오디오와 키를 버리고 녹음 화면의 대기로 돌아간다. 다음 제출은 새 키다. */
    fun discardRecording() {
        job?.cancel()
        job = null
        wipe()
        _upload.value = IntonationUploadState.Idle
    }

    private fun send() {
        val start = _start.value ?: return
        val p = pending ?: return
        _upload.value = IntonationUploadState.Uploading
        job = viewModelScope.launch {
            _upload.value = when (val result = upload(start.cardId, p.key, p.wavBytes, p.durationMs, p.clientQuality)) {
                is IntonationUploadResult.Accepted -> {
                    wipe()
                    IntonationUploadState.Accepted(IntonationRecorded(start.cardId, result.attemptId))
                }
                is IntonationUploadResult.Rejected -> {
                    if (result.code == CODE_ANALYSIS_UNAVAILABLE) {
                        pending = Pending(p.wavBytes, p.durationMs, p.clientQuality, newKey())
                    }
                    IntonationUploadState.Failed(rejectionMessage(result), result.retryable)
                }
                is IntonationUploadResult.TransportError ->
                    IntonationUploadState.Failed(result.failure.userMessage(), retryable = true)
            }
        }
    }

    /** 음성 바이트는 쓸 일이 끝나면 0으로 덮는다 (FR-DP-02, 레벨테스트 업로드와 같은 규칙). */
    private fun wipe() {
        pending?.wavBytes?.fill(0)
        pending = null
    }

    override fun onCleared() {
        wipe()
    }
}

/** 서버 문구가 있으면 그대로 — 왜 안 됐는지는 서버만 안다(KAN-147과 같은 이유). 401은 갱신까지 실패한 로그인 만료다. */
private fun rejectionMessage(result: IntonationUploadResult.Rejected): String = when {
    result.status == STATUS_UNAUTHORIZED -> "로그인이 만료됐어요. 다시 로그인해 주세요"
    result.message != null -> result.message
    result.retryable -> "전송에 실패했어요. 다시 시도해 주세요"
    else -> "이 녹음은 보낼 수 없어요. 다시 녹음해 주세요"
}
