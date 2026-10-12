package com.accentury.app.recording

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import com.accentury.app.audio.SAMPLE_RATE

/**
 * 억양 학습 확인 단계의 [내 녹음 듣기] (KAN-253). 방금 녹음한 16kHz mono PCM을 메모리에서 바로 튼다.
 *
 * MediaPlayer가 아니라 AudioTrack인 이유: MediaPlayer는 파일·URI·FileDescriptor만 받아 WAV를 디스크에 한 번 써야 하는데,
 * 음성을 기기에 남기지 않는 것이 FR-DP-02다. 근거: AudioTrack 레퍼런스 개요 — "static mode should be chosen when dealing
 * with short sounds that fit in memory" (developer.android.com/reference/android/media/AudioTrack, MODE_STATIC). 최대 10초 =
 * 320KB라 정적 버퍼 한 번에 들어간다.
 *
 * 메인 스레드에서만 부른다. 끝까지 재생되면 [onEnded]가 메인 스레드로 온다(마커 리스너를 메인 Looper에 건다).
 */
class PcmPlayer(private val onEnded: () -> Unit) {

    private var track: AudioTrack? = null

    /** 처음부터 재생한다. 이미 재생 중이면 앞 것을 놓고 새로 튼다. */
    fun play(pcm: ShortArray) {
        stop()
        if (pcm.isEmpty()) return
        val t = runCatching {
            AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build(),
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(SAMPLE_RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build(),
                )
                .setTransferMode(AudioTrack.MODE_STATIC)
                .setBufferSizeInBytes(pcm.size * Short.SIZE_BYTES)
                .build()
        }.getOrNull() ?: return onEnded() // 출력 장치를 못 잡으면 재생 없이 버튼만 되돌린다
        t.write(pcm, 0, pcm.size)
        t.notificationMarkerPosition = pcm.size
        t.setPlaybackPositionUpdateListener(
            object : AudioTrack.OnPlaybackPositionUpdateListener {
                override fun onMarkerReached(track: AudioTrack) {
                    if (this@PcmPlayer.track === track) {
                        stop()
                        onEnded()
                    }
                }

                override fun onPeriodicNotification(track: AudioTrack) = Unit
            },
            Handler(Looper.getMainLooper()),
        )
        t.play()
        track = t
    }

    /** 정지와 자원 해제를 한 번에. 이탈·다시 녹음·업로드 시작에서 부른다. 재생 중이 아니면 아무 일도 없다. */
    fun stop() {
        val t = track ?: return
        track = null
        runCatching { t.stop() }
        t.release()
    }
}
