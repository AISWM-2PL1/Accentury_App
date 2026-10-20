import AccenturyCore
import AVFoundation
import Foundation

/// 억양 학습 확인 단계의 [내 녹음 듣기] (KAN-253). 안드로이드 `recording/PcmPlayer.kt`(AudioTrack `MODE_STATIC`) 자리다.
/// 방금 녹음한 16kHz mono PCM을 **메모리에서** 튼다 — 음성을 기기에 남기지 않는 것이 FR-DP-02라 파일 URL을 거치지 않는다.
///
/// 근거: iOS SDK `AVFAudio/AVAudioPlayer.h`의 `initWithData:fileTypeHint:error:` — "all data must be in the form of an
/// audio file understood by CoreAudio". 그래서 PCM을 레벨테스트 업로드와 같은 ``AccenturyCore/WavWriter``로 메모리 WAV로 접어 넘긴다
/// (최대 10초 = 320KB). AVAudioEngine+PlayerNode보다 짧고, 끝 알림이 델리게이트 한 줄이다.
///
/// 오디오 세션: 녹음(`AudioRecorder`)은 `.record` 카테고리라 그대로는 소리가 안 난다. 재생 직전 `.playback`으로 바꾸고
/// 멈출 때 비활성화한다. 녹음은 시작할 때마다 `.record`로 다시 잡으므로(``AudioRecorder`` `configureSession`) 서로 덮지 않는다 —
/// 단 재녹음 전에 반드시 ``stop()``이 먼저 불려야 한다(호출자가 [재녹음]·[다음]·이탈에서 부른다).
///
/// 메인 스레드에서만 부른다. 화면은 ``playing``으로 버튼 문구를 고른다(끝까지 재생되면 false로 돌아온다).
@MainActor
final class PcmPlayer: NSObject, ObservableObject, AVAudioPlayerDelegate {

    @Published private(set) var playing = false
    private var player: AVAudioPlayer?

    /// 처음부터 재생한다. 이미 재생 중이면 앞 것을 놓고 새로 튼다. 출력을 못 잡으면 재생 없이 버튼만 되돌린다.
    func play(_ pcm: [Int16]) {
        stop()
        guard !pcm.isEmpty else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
            let p = try AVAudioPlayer(data: WavWriter.toWavBytes(pcm), fileTypeHint: AVFileType.wav.rawValue)
            p.delegate = self
            guard p.play() else { throw CocoaError(.featureUnsupported) }
            player = p
            playing = true
        } catch {
            stop()
            // 활성화까지만 하고 플레이어에서 실패했으면 stop()은 세션을 모른다 — 여기서 놓는다.
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }

    /// 정지와 자원 해제를 한 번에. 이탈·다시 녹음·제출에서 부른다. 재생 중이 아니면 아무 일도 없다.
    func stop() {
        playing = false
        guard let p = player else { return }
        player = nil
        p.delegate = nil
        p.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            guard self.player === player else { return }
            self.stop()
        }
    }
}
