import AccenturyCore
import SwiftUI

/// 억양 학습 녹음 화면 A-3 (KAN-253, webview-bridge.md §12). 안드로이드 `learning/IntonationRecordingOverlay.kt`의 이식본이다.
/// 레벨테스트와 같은 ``RecordingScreen``을 학습 모양(``AccenturyCore/RecordingPurpose/intonationLearning(standard:itemNumber:totalItems:)``)으로
/// 띄우고, 확인 뒤의 일(카드 업로드)만 여기서 정한다.
///
/// `recording`은 레벨테스트 오버레이와 다른 인스턴스다(호출자가 따로 든다) — 학습이 레벨테스트 녹음 상태를 읽거나 되감지
/// 않게 하려는 것이다(§12 「세션 ID·문항 인덱스와 섞지 않는다」).
///
/// 업로드 실패는 이 화면 안에서 푼다 — 하단을 실패 안내로 바꿔 [재시도]를 무제한, `retryable:false`면 다시 녹음만 준다.
/// 닫기(뒤로가기)는 호출자가 위에 덮는 닫기 버튼·가장자리 스와이프가 맡는다(``IntonationCloseChrome``).
struct IntonationRecordingOverlay: View {

    let start: IntonationRecordingStart
    @ObservedObject var uploader: IntonationRecordingModel
    @ObservedObject var recording: RecordingModel
    /// 시작 게이트의 목소리 점검이 잰 중심 음높이. 학습만 한 사용자는 nil — 녹음의 첫 유성 프레임으로 잡는다.
    let centerHz: Float?

    @StateObject private var player = PcmPlayer()

    var body: some View {
        RecordingScreen(
            questionText: start.prompt,
            purpose: .intonationLearning(standard: start.standard, itemNumber: start.itemNumber, totalItems: start.totalItems),
            // 202 뒤 회신·닫기까지 한 프레임이라도 버튼이 다시 서지 않게 accepted도 제출 중으로 본다.
            submitting: isSubmitting,
            guideF0: start.guideF0,
            centerHz: centerHz,
            model: recording,
            onRetake: { player.stop() },
            onListen: {
                if player.playing {
                    player.stop()
                } else if let pcm = recording.peekRecording() {
                    player.play(pcm)
                }
            },
            listening: player.playing,
            footerOverride: failureFooter,
            onNext: { _, durationMs, _ in
                player.stop()
                // consumeRecording은 PCM을 넘기면서 모델에서 지운다 (FR-DP-02). 재시도용 바이트는 uploader가 든다.
                guard let pcm = recording.consumeRecording() else {
                    recording.reset()
                    return
                }
                uploader.submit(
                    wavBytes: WavWriter.toWavBytes(pcm),
                    durationMs: durationMs,
                    clientQuality: AudioQuality.measure(pcm)
                )
            }
        )
        // 확인 단계를 벗어나면(재녹음으로 녹음이 다시 시작되는 등) 재생을 멈춘다.
        .onChange(of: recording.isReviewing) { reviewing in
            if !reviewing { player.stop() }
        }
        // 화면이 걷히면(뒤로가기·회신 뒤 닫기) 재생을 멈추고 마이크와 PCM을 놓는다.
        .onDisappear {
            player.stop()
            recording.reset()
        }
    }

    private var isSubmitting: Bool {
        switch uploader.uploadState {
        case .uploading, .accepted: return true
        case .idle, .failed: return false
        }
    }

    /// 업로드 실패 하단. 서버 문구를 그대로 보이고, 재시도로 풀릴 실패에만 [재시도]를 둔다.
    private var failureFooter: AnyView? {
        guard case let .failed(message, retryable) = uploader.uploadState else { return nil }
        return AnyView(
            StatusBlock(
                tone: .error,
                message: retryable ? "녹음을 보내지 못했어요" : "이 녹음은 보낼 수 없어요",
                detail: message
            ) {
                HStack(spacing: Papercut.space3) {
                    AccenturyButton(text: "다시 녹음", variant: retryable ? .secondary : .primary, fillsWidth: true) {
                        uploader.discardRecording()
                        recording.retry()
                    }
                    if retryable {
                        AccenturyButton(text: "재시도", fillsWidth: true) { uploader.retry() }
                    }
                }
            }
        )
    }
}

/// 억양 학습 화면(권한 게이트 포함)의 닫기 — 안드로이드 `BackHandler(onBack = intonation::close)` 자리 (KAN-253, §12).
/// iOS에는 시스템 뒤로가기가 없어 닫기 버튼과 왼쪽 가장자리 스와이프 둘로 같은 일을 한다. 회신은 없다.
/// 닫기 ✕는 오른쪽 위다 — 안드로이드 `IntonationCloseButton`의 이식본(KAN-252, 2026-10-13 사용자 결정). 모양은 설정 톱니
/// (``SettingsGearButton``)와 같고, 안드로이드 뒤로가기처럼 제출 중에도 늘 선다(진행 중 업로드는 `close`가 버린다).
struct IntonationCloseChrome<Content: View>: View {

    let onClose: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        ZStack(alignment: .topTrailing) {
            content()
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 20, weight: .regular))
                    .foregroundColor(Papercut.ink)
                    .frame(width: Papercut.touchTargetMin, height: Papercut.touchTargetMin)
                    .background(Circle().fill(Papercut.cream))
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("닫기")
            .padding(Papercut.space2)
        }
        // 왼쪽 가장자리에서 오른쪽으로 끄는 뒤로가기 — 내비게이션 스택의 스와이프 백과 같은 손짓이다.
        .simultaneousGesture(
            DragGesture(minimumDistance: 20).onEnded { value in
                if value.startLocation.x < edgeSwipeStartWidth, value.translation.width > edgeSwipeDistance {
                    onClose()
                }
            }
        )
    }

    private let edgeSwipeStartWidth: CGFloat = 24
    private let edgeSwipeDistance: CGFloat = 80
}
