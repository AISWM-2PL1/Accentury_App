package com.accentury.app.learning

import android.annotation.SuppressLint
import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.accentury.app.audio.AudioQuality
import com.accentury.app.audio.WavWriter
import com.accentury.app.bridge.IntonationRecordingStart
import com.accentury.app.recording.PcmPlayer
import com.accentury.app.recording.RecordingPurpose
import com.accentury.app.recording.RecordingScreen
import com.accentury.app.recording.RecordingUiState
import com.accentury.app.recording.RecordingViewModel
import com.accentury.app.ui.components.AccenturyButton
import com.accentury.app.ui.components.ButtonVariant
import com.accentury.app.ui.components.StatusBlock
import com.accentury.app.ui.components.StatusTone
import com.accentury.app.ui.theme.Spacing

/**
 * 억양 학습 녹음 화면 A-3 (KAN-253, webview-bridge.md §12). 레벨테스트와 같은 [RecordingScreen]을 학습 모양
 * ([RecordingPurpose.IntonationLearning])으로 띄우고, 확인 뒤의 일(카드 업로드)만 여기서 정한다.
 *
 * [recording]은 레벨테스트 오버레이와 다른 인스턴스다(호출자가 키를 따로 준다) — 학습이 레벨테스트 녹음 상태를 읽거나
 * 되감지 않게 하려는 것이다(§12 「세션 ID·문항 인덱스와 섞지 않는다」).
 *
 * 업로드 실패는 이 화면 안에서 푼다 — 하단을 실패 안내로 바꿔 [재시도]를 무제한, `retryable:false`면 다시 녹음만 준다.
 */
@SuppressLint("MissingPermission") // 호출자가 마이크 권한을 확인한 뒤에만 띄운다 (MainActivity의 PermissionGate)
@Composable
fun IntonationRecordingOverlay(
    start: IntonationRecordingStart,
    uploader: IntonationRecordingViewModel,
    recording: RecordingViewModel,
    /** 시작 게이트의 목소리 점검이 잰 중심 음높이. 학습만 한 사용자는 null — 녹음의 첫 유성 프레임으로 잡는다. */
    centerHz: Float?,
) {
    val activity = LocalActivity.current
    val upload by uploader.uploadState.collectAsStateWithLifecycle()
    val recState by recording.uiState.collectAsStateWithLifecycle()

    var listening by remember { mutableStateOf(false) }
    val player = remember { PcmPlayer(onEnded = { listening = false }) }
    fun stopPlayback() {
        player.stop()
        listening = false
    }

    // 확인 단계를 벗어나면(재녹음으로 녹음이 다시 시작되는 등) 재생을 멈춘다.
    val inReview = recState is RecordingUiState.Review
    LaunchedEffect(inReview) { if (!inReview) stopPlayback() }

    DisposableEffect(Unit) {
        onDispose {
            player.stop()
            // 회전은 화면이 다시 서므로 녹음을 살린다. 그 밖의 퇴장(뒤로가기·회신 뒤 닫기)은 마이크와 PCM을 놓는다.
            if (activity?.isChangingConfigurations != true) recording.reset()
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        RecordingScreen(
            questionText = start.prompt,
            purpose = RecordingPurpose.IntonationLearning(start.standard, start.itemNumber, start.totalItems),
            guideF0 = start.guideF0,
            centerHz = centerHz,
            // 202 뒤 회신·닫기까지 한 프레임이라도 버튼이 다시 서지 않게 Accepted도 제출 중으로 본다.
            submitting = upload == IntonationUploadState.Uploading || upload is IntonationUploadState.Accepted,
            onRetake = ::stopPlayback,
            onListen = {
                if (listening) {
                    stopPlayback()
                } else {
                    recording.peekRecording()?.let {
                        listening = true
                        player.play(it)
                    }
                }
            },
            listening = listening,
            footer = (upload as? IntonationUploadState.Failed)?.let { failed ->
                {
                    UploadFailedControls(
                        failed = failed,
                        onRetry = uploader::retry,
                        onRerecord = {
                            uploader.discardRecording()
                            recording.retryRecording()
                        },
                    )
                }
            },
            onNext = { _, durationMs, _ ->
                stopPlayback()
                // consumeRecording은 PCM을 넘기면서 뷰모델에서 지운다 (FR-DP-02). 재시도용 바이트는 uploader가 든다.
                val pcm = recording.consumeRecording()
                if (pcm == null) {
                    recording.reset()
                } else {
                    uploader.submit(WavWriter.toWavBytes(pcm), durationMs, AudioQuality.measure(pcm))
                }
            },
            viewModel = recording,
        )
    }
}

/** 업로드 실패 하단. 서버 문구를 그대로 보이고, 재시도로 풀릴 실패에만 [재시도]를 둔다. */
@Composable
private fun UploadFailedControls(
    failed: IntonationUploadState.Failed,
    onRetry: () -> Unit,
    onRerecord: () -> Unit,
) {
    StatusBlock(
        tone = StatusTone.Error,
        message = if (failed.retryable) "녹음을 보내지 못했어요" else "이 녹음은 보낼 수 없어요",
        detail = failed.message,
        action = {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Spacing.x3)) {
                AccenturyButton(
                    text = "다시 녹음",
                    variant = if (failed.retryable) ButtonVariant.Secondary else ButtonVariant.Primary,
                    onClick = onRerecord,
                    modifier = Modifier.weight(1f),
                )
                if (failed.retryable) {
                    AccenturyButton(text = "재시도", onClick = onRetry, modifier = Modifier.weight(1f))
                }
            }
        },
    )
}
