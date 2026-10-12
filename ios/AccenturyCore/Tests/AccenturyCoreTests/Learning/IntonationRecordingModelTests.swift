import XCTest
@testable import AccenturyCore

/// 억양 녹음 화면의 열림·업로드·키 규칙 (KAN-253). 안드로이드 `learning/IntonationRecordingViewModelTest.kt`의 이식본 (8건).
@MainActor
final class IntonationRecordingModelTests: XCTestCase {

    private let start = IntonationRecordingStart(cardId: "card_1", prompt: "어데 가노?", standard: nil, maxDurationMs: 10_000)
    private let quality = ClientQuality(rms: 0.1, peak: 0.8, silenceRatio: 0.1, clipped: false)
    private let unavailable = IntonationUploadResult.rejected(status: 503, code: "ANALYSIS_UNAVAILABLE", message: "분석 서버에 연결할 수 없습니다.", retryable: true)
    private let rateLimited = IntonationUploadResult.rejected(status: 429, code: "RATE_LIMITED", message: "잠시 후", retryable: true)

    /// 응답을 차례로 돌려주고 실린 키를 기록하는 가짜 업로드.
    private final class FakeUpload: @unchecked Sendable {
        private let lock = NSLock()
        private var queue: [IntonationUploadResult]
        private(set) var keys: [String] = []
        private(set) var cards: [String] = []

        init(_ results: IntonationUploadResult...) { queue = results }

        func take(cardId: String, key: String) -> IntonationUploadResult {
            lock.lock()
            defer { lock.unlock() }
            cards.append(cardId)
            keys.append(key)
            return queue.removeFirst()
        }
    }

    private func model(_ fake: FakeUpload) -> IntonationRecordingModel {
        var n = 0
        return IntonationRecordingModel(
            upload: { cardId, key, _, _, _ in fake.take(cardId: cardId, key: key) },
            newKey: { n += 1; return "k\(n)" }
        )
    }

    private func submit(_ m: IntonationRecordingModel) {
        m.submit(wavBytes: Data([1, 2, 3, 4]), durationMs: 2_000, clientQuality: quality)
    }

    private func settle(_ m: IntonationRecordingModel) async {
        await waitUntil("업로드가 끝나지 않았다") { m.uploadState != .uploading }
    }

    func test202면_cardId와_attemptId를_회신할_상태가_되고_닫으면_화면이_없다() async {
        let fake = FakeUpload(.accepted(attemptId: "la_1"))
        let m = model(fake)
        m.open(start)

        submit(m)
        XCTAssertEqual(.uploading, m.uploadState)
        await settle(m)

        XCTAssertEqual(.accepted(IntonationRecorded(cardId: "card_1", attemptId: "la_1")), m.uploadState)
        XCTAssertEqual(["card_1"], fake.cards)
        m.close()
        XCTAssertNil(m.start)
        XCTAssertEqual(.idle, m.uploadState)
    }

    func test같은_녹음의_재시도는_같은_키다() async {
        let fake = FakeUpload(.transportError(.offline), rateLimited, .accepted(attemptId: "la_1"))
        let m = model(fake)
        m.open(start)

        submit(m)
        await settle(m)
        XCTAssertEqual(.failed(message: "인터넷 연결을 확인해 주세요", retryable: true), m.uploadState)
        m.retry()
        await settle(m)
        m.retry()
        await settle(m)

        XCTAssertEqual(["k1", "k1", "k1"], fake.keys)
        guard case .accepted = m.uploadState else { return XCTFail("\(m.uploadState)") }
    }

    func test503_ANALYSIS_UNAVAILABLE_뒤_재시도는_새_키다() async {
        let fake = FakeUpload(unavailable, rateLimited, .accepted(attemptId: "la_2"))
        let m = model(fake)
        m.open(start)

        submit(m)
        await settle(m)
        m.retry() // 503 뒤 → 새 키
        await settle(m)
        m.retry() // 429 뒤 → 같은 키
        await settle(m)

        XCTAssertEqual(["k1", "k2", "k2"], fake.keys)
    }

    func test다시_녹음해_제출하면_새_키다() async {
        let fake = FakeUpload(rateLimited, .accepted(attemptId: "la_1"))
        let m = model(fake)
        m.open(start)

        submit(m)
        await settle(m)
        m.discardRecording()
        XCTAssertEqual(.idle, m.uploadState)
        submit(m)
        await settle(m)

        XCTAssertEqual(["k1", "k2"], fake.keys)
    }

    func testRetryable_false면_재시도하지_않을_실패로_서버_문구를_싣는다() async {
        let m = model(FakeUpload(.rejected(status: 422, code: "AUDIO_TOO_LONG", message: "녹음이 너무 깁니다. (최대 10초)", retryable: false)))
        m.open(start)

        submit(m)
        await settle(m)

        XCTAssertEqual(.failed(message: "녹음이 너무 깁니다. (최대 10초)", retryable: false), m.uploadState)
    }

    func test갱신_뒤에도_401이면_로그인_만료_안내다() async {
        let m = model(FakeUpload(.rejected(status: 401, code: "AUTH_TOKEN_INVALID", message: "로그인이 필요합니다.", retryable: false)))
        m.open(start)

        submit(m)
        await settle(m)

        XCTAssertEqual(.failed(message: "로그인이 만료됐어요. 다시 로그인해 주세요", retryable: false), m.uploadState)
    }

    func test업로드_중_닫으면_늦게_온_202가_회신_상태를_만들지_못한다() async {
        let gate = Gate()
        let m = IntonationRecordingModel(upload: { _, _, _, _, _ in await gate.wait() })
        m.open(start)

        submit(m)
        await waitUntil("업로드가 시작되지 않았다") { await gate.isWaiting }
        m.close()
        await gate.open(.accepted(attemptId: "la_late"))
        // 늦은 결과가 메인 액터에 닿을 짬을 준다.
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(.idle, m.uploadState)
        XCTAssertNil(m.start)
    }

    /// 안드로이드는 ByteArray를 0으로 덮는다. Swift `Data`는 값 타입이라 보관 참조를 놓는 것으로 같은 불변식을 본다 (FR-DP-02).
    func test제출한_음성_바이트는_접수_뒤에도_닫은_뒤에도_남지_않는다() async {
        let m = model(FakeUpload(.accepted(attemptId: "la_1"), rateLimited))
        m.open(start)

        submit(m)
        XCTAssertTrue(m.retainsAudio)
        await settle(m)
        XCTAssertFalse(m.retainsAudio, "202 뒤에도 음성을 쥐고 있다")

        m.open(start)
        submit(m)
        await settle(m)
        XCTAssertTrue(m.retainsAudio, "재시도용 바이트는 실패 동안 남아야 한다")
        m.close()
        XCTAssertFalse(m.retainsAudio, "닫은 뒤에도 음성을 쥐고 있다")
    }
}

/// 업로드 결과를 테스트가 정한 순간에 풀어 주는 관문 (안드로이드 `CompletableDeferred` 자리).
private actor Gate {
    private var continuation: CheckedContinuation<IntonationUploadResult, Never>?
    var isWaiting: Bool { continuation != nil }

    func wait() async -> IntonationUploadResult {
        await withCheckedContinuation { continuation = $0 }
    }

    func open(_ result: IntonationUploadResult) {
        continuation?.resume(returning: result)
        continuation = nil
    }
}
