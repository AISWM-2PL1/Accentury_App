import Combine
import Foundation

/// 서버가 그 키의 시도를 실패로 기록했을 수 있는 코드 — 재시도 때 새 키를 쓴다 (아래 문서 주석).
private let codeAnalysisUnavailable = "ANALYSIS_UNAVAILABLE"
private let statusUnauthorized = 401

/// 억양 녹음 업로드의 화면 쪽 상태 (KAN-253). 안드로이드 `IntonationUploadState`의 이식본이다.
public enum IntonationUploadState: Equatable, Sendable {
    /// 아직 제출 전 — 녹음 화면이 대기·녹음·확인 단계를 스스로 그린다.
    case idle
    case uploading
    /// `retryable`이 false면 [재시도] 대신 다시 녹음을 안내한다(오디오가 같으면 결과도 같다).
    case failed(message: String, retryable: Bool)
    /// 202 접수. 호출자가 웹에 한 번 회신하고 ``IntonationRecordingModel/close()``로 화면을 닫는다.
    case accepted(IntonationRecorded)
}

/// 억양 학습 녹음 화면(A-3)의 열림과 업로드 (KAN-253, webview-bridge.md §12). 안드로이드
/// `learning/IntonationRecordingViewModel.kt`의 이식본이다. 화면 결선 없이 `swift test`로 키 규칙을 보려고 Core에 둔다
/// (``LoginScreenState``와 같은 자리).
///
/// 레벨테스트의 ``TestFlowController``·``UploadManager``를 쓰지 않는다 — 학습은 세션·문항 인덱스·보관 음성 복구가 없고,
/// 업로드 실패를 웹으로 돌아간 뒤 상태 바에서 푸는 것이 아니라 녹음 화면 안에서 푼다(회신은 성공만). 그래서 상태가 열린
/// 카드 하나와 그 카드의 제출 하나뿐이다.
///
/// **멱등 키 규칙**: 확인 단계에서 제출한 녹음 1건마다 새 키, 그 녹음의 ``retry()``는 같은 키. 단 `503 ANALYSIS_UNAVAILABLE`
/// 뒤에는 새 키다 — 서버(IntonationScoringService.upload)는 분석 큐 전달이 실패하면 그 키의 시도를 RETRYABLE_FAILED로
/// 커밋한 뒤 503을 주고, 같은 키 재전송에는 분석을 다시 돌리지 않고 그 실패 시도를 202로 돌려준다. 같은 키로 재시도하면
/// 웹은 202를 받고 영영 실패할 시도를 폴링한다.
///
/// **음성 바이트(FR-DP-02)**: 안드로이드는 `ByteArray`를 0으로 덮지만 Swift `Data`는 값 타입이라 남이 든 사본을 덮을 수
/// 없다. 여기서는 레벨테스트 ``UploadManager``와 같이 **참조를 놓는 것**으로 폐기한다 — 접수·다시 녹음·닫기에서
/// 보관분(`pending`)을 지우고, 진행 중 전송은 Task 취소로 끊는다(``retainsAudio``로 테스트가 확인한다).
@MainActor
public final class IntonationRecordingModel: ObservableObject {

    public typealias Upload = @Sendable (
        _ cardId: String,
        _ idempotencyKey: String,
        _ wavBytes: Data,
        _ durationMs: Int64,
        _ clientQuality: ClientQuality
    ) async -> IntonationUploadResult

    private struct Pending {
        let wavBytes: Data
        let durationMs: Int64
        let clientQuality: ClientQuality
        let key: String
    }

    /// 열린 카드. nil이면 녹음 화면이 없다.
    @Published public private(set) var start: IntonationRecordingStart?
    @Published public private(set) var uploadState: IntonationUploadState = .idle

    private let upload: Upload
    private let newKey: () -> String
    private var pending: Pending?
    private var task: Task<Void, Never>?
    /// 지금 유효한 전송의 번호. 닫기·다시 녹음에 밀린 전송의 늦은 결과는 이 번호가 안 맞아 버려진다.
    private var generation = 0

    /// - Parameter upload: ``IntonationUploadClient/upload(cardId:idempotencyKey:wavBytes:durationMs:clientQuality:)``.
    ///   함수로 받는 이유는 테스트에서 네트워크 없이 키 규칙을 보려는 것이다
    /// - Parameter newKey: 안드로이드 `"li_" + UUID.randomUUID()`와 같은 모양(소문자 UUID)
    public init(upload: @escaping Upload, newKey: @escaping () -> String = { "li_" + UUID().uuidString.lowercased() }) {
        self.upload = upload
        self.newKey = newKey
    }

    /// 보관 중인 음성 바이트가 있는가 — FR-DP-02 폐기 확인용.
    public var retainsAudio: Bool { pending != nil }

    /// 웹의 `startIntonationRecording`. 앞 카드의 화면이 남아 있으면 버리고 새로 연다.
    public func open(_ start: IntonationRecordingStart) {
        close()
        self.start = start
    }

    /// 뒤로가기·회신 뒤·로그아웃. 진행 중 업로드는 버린다 — 서버에 닿았더라도 다음 녹음은 새 키라 별개 시도다(§12).
    public func close() {
        discardRecording()
        start = nil
    }

    /// 확인 단계의 제출. 녹음 1건 = 새 키.
    public func submit(wavBytes: Data, durationMs: Int64, clientQuality: ClientQuality) {
        if uploadState == .uploading { return }
        pending = Pending(wavBytes: wavBytes, durationMs: durationMs, clientQuality: clientQuality, key: newKey())
        send()
    }

    /// 실패 뒤 [재시도]. 횟수 제한 없음.
    public func retry() {
        guard case .failed = uploadState else { return }
        send()
    }

    /// 다시 녹음 — 제출한 오디오와 키를 버리고 녹음 화면의 대기로 돌아간다. 다음 제출은 새 키다.
    public func discardRecording() {
        task?.cancel()
        task = nil
        generation += 1
        pending = nil
        uploadState = .idle
    }

    private func send() {
        guard let start, let p = pending else { return }
        generation += 1
        let generation = generation
        let upload = upload
        uploadState = .uploading
        task = Task { [weak self] in
            let result = await upload(start.cardId, p.key, p.wavBytes, p.durationMs, p.clientQuality)
            self?.finish(result, cardId: start.cardId, generation: generation)
        }
    }

    private func finish(_ result: IntonationUploadResult, cardId: String, generation: Int) {
        // 닫기·다시 녹음 뒤 늦게 온 결과는 버린다 — 늦은 202가 회신을 만들면 웹이 이미 떠난 화면에 답이 간다.
        guard generation == self.generation else { return }
        task = nil
        switch result {
        case .accepted(let attemptId):
            pending = nil
            uploadState = .accepted(IntonationRecorded(cardId: cardId, attemptId: attemptId))
        case let .rejected(status, code, message, retryable):
            if code == codeAnalysisUnavailable, let p = pending {
                pending = Pending(wavBytes: p.wavBytes, durationMs: p.durationMs, clientQuality: p.clientQuality, key: newKey())
            }
            uploadState = .failed(
                message: Self.rejectionMessage(status: status, message: message, retryable: retryable),
                retryable: retryable
            )
        case .transportError(let failure):
            uploadState = .failed(message: failure.userMessage, retryable: true)
        }
    }

    /// 서버 문구가 있으면 그대로 — 왜 안 됐는지는 서버만 안다(KAN-147과 같은 이유). 401은 갱신까지 실패한 로그인 만료다.
    private static func rejectionMessage(status: Int, message: String?, retryable: Bool) -> String {
        if status == statusUnauthorized { return "로그인이 만료됐어요. 다시 로그인해 주세요" }
        if let message { return message }
        return retryable ? "전송에 실패했어요. 다시 시도해 주세요" : "이 녹음은 보낼 수 없어요. 다시 녹음해 주세요"
    }
}
