import Foundation
@testable import AccenturyCore

/// 여러 스레드에서 적히는 사건 기록. 캡처 열림/닫힘 순서를 단언하는 데 쓴다.
final class EventLog: @unchecked Sendable {
    private let lock = NSLock()
    private var events: [String] = []

    func append(_ event: String) {
        lock.lock()
        events.append(event)
        lock.unlock()
    }

    var all: [String] {
        lock.lock()
        defer { lock.unlock() }
        return events
    }

    func contains(_ event: String) -> Bool { all.contains(event) }

    /// 지금까지 쌓인 것을 꺼내 가며 비운다. 회차마다 순서를 따로 읽는 경합 테스트가 쓴다.
    func drain() -> [String] {
        lock.lock()
        defer { lock.unlock() }
        let events = self.events
        self.events.removeAll()
        return events
    }
}

/// 마이크 자리에 끼우는 가짜 소스. 안드로이드 테스트의 `FakeSource(flow { ... })` 자리다.
///
/// 세 가지를 흉내 낸다:
/// - **콜드**: `recordingStream()`을 부를 때마다 처음부터 다시 흐른다 (재녹음·재응시 경로).
/// - **정리 구간**: 스트림이 **어떤 경로로 끝나든**(취소·다 흐름·실패·소비자가 루프를 빠져나감)
///   `release{n}`을 정확히 1회 남긴다 — 실제 캡처(`AudioRecorder`)의 `onTermination` 자리이고,
///   "화면을 떠나면 마이크를 놓는가"를 여기서 단언한다. 이터레이터가 해제될 때 남기므로 엔진이
///   정지 깃발을 보고 `break`한 경우도 잡힌다 (취소 경로에서만 남기던 예전 대역은 정지 깃발이
///   취소보다 먼저 닿는 인터리빙에서 반납을 영영 안 남겼다 — KAN-254 PR #32 CI).
/// - **늦은 반납**: `releaseDelay`를 주면 그만큼 마이크를 더 쥐고 있다. 이터레이터 해제 안에서
///   동기로 기다리므로 `engine.record`가 돌아오기 전에 반납이 끝난다 — 코틀린 테스트의
///   `withContext(NonCancellable) { delay(...) }`처럼 취소와 무관하게 끝까지 수행된다.
final class FakePcmSource: PcmSource, @unchecked Sendable {

    let events: EventLog

    private let chunk: [Int16]
    /// nil이면 무한 소스다.
    private let limit: Int?
    private let intervalNanos: UInt64
    private let releaseDelay: TimeInterval
    private let failure: Error?
    private let lock = NSLock()
    private var opens = 0

    init(
        chunk: [Int16] = FakePcmSource.tone(),
        limit: Int? = nil,
        intervalNanos: UInt64 = 0,
        releaseDelay: TimeInterval = 0,
        failure: Error? = nil,
        events: EventLog = EventLog()
    ) {
        self.chunk = chunk
        self.limit = limit
        self.intervalNanos = intervalNanos
        self.releaseDelay = releaseDelay
        self.failure = failure
        self.events = events
    }

    /// 안드로이드 테스트가 쓰던 ±1000 교대 파형. 유성 판정이 나오도록 진폭이 충분하다.
    static func tone(amplitude: Int16 = 1000, count: Int = chunkSize) -> [Int16] {
        (0..<count).map { $0 % 2 == 0 ? amplitude : -amplitude }
    }

    func recordingStream() -> AsyncThrowingStream<[Int16], Error> {
        lock.lock()
        opens += 1
        let id = opens
        lock.unlock()

        var emitted = 0
        var opened = false
        let releaser = Releaser { [events, releaseDelay] in
            if opened {
                if releaseDelay > 0 { Thread.sleep(forTimeInterval: releaseDelay) }
                events.append("release\(id)")
            }
        }
        return AsyncThrowingStream(unfolding: { [self] in
            // 클로저가 releaser를 쥐고 있다 — 이터레이터가 해제되면 클로저와 함께 풀리며 반납한다.
            _ = releaser
            if !opened {
                opened = true
                events.append("open\(id)")
            }
            if let failure { throw failure }
            if intervalNanos > 0 { try await Task.sleep(nanoseconds: intervalNanos) }
            if let limit, emitted >= limit { return nil }
            emitted += 1
            return chunk
        })
    }
}

/// 해제될 때 한 번 정리를 돈다. `AsyncThrowingStream(unfolding:)`에는 `onTermination`이 없어서
/// 이터레이터 수명에 정리를 거는 자리로 쓴다.
private final class Releaser: @unchecked Sendable {
    private let onRelease: () -> Void
    init(_ onRelease: @escaping () -> Void) { self.onRelease = onRelease }
    deinit { onRelease() }
}
