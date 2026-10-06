import Foundation

/// 녹음 결과가 내는 햅틱 (KAN-258, webview-bridge.md §9). 안드로이드 `RecordingScreen.kt`의
/// `recordingResultHaptic` 이식본이다. 다음으로 넘어갈 수 있는 녹음이면 성공, 다시 녹음해야 하는
/// 품질이나 녹음 실패면 실패다. 결과가 아닌 상태(대기·녹음 중)는 nil이다.
/// [다음] 버튼을 여는 ``RecordingUiState/Review/canProceed``와 같은 기준이다.
///
/// "화면이 처음 본 상태는 건너뛴다"는 규칙은 여기 없다 — 언제 부를지는 녹음 화면이 정한다
/// (`RecordingScreen`의 `.onChange`).
public func recordingResultHaptic(_ state: RecordingUiState) -> Haptic? {
    switch state {
    case .review(let review): return review.canProceed ? .success : .error
    case .failed: return .error
    case .idle, .recording: return nil
    }
}
