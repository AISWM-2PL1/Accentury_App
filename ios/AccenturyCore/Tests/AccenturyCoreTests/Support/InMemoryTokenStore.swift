import Foundation
@testable import AccenturyCore

/// 키체인 없이 갱신·게이트 규칙을 돌리기 위한 저장소 (안드로이드 테스트 `InMemoryTokenStore` 자리).
/// URLProtocol 스레드와 테스트 본문이 함께 읽으므로 잠근다.
final class InMemoryTokenStore: TokenStore, @unchecked Sendable {

    private let lock = NSLock()
    private var stored: AuthTokens?

    init(_ initial: AuthTokens? = nil) {
        stored = initial
    }

    var tokens: AuthTokens? {
        lock.lock()
        defer { lock.unlock() }
        return stored
    }

    func read() async -> AuthTokens? { tokens }

    func save(_ tokens: AuthTokens) async { set(tokens) }

    func clear() async { set(nil) }

    // 잠금은 동기 함수 안에서만 건다 — async 문맥에서 NSLock을 직접 부르면 Swift 6 검사가 막는다.
    private func set(_ tokens: AuthTokens?) {
        lock.lock()
        stored = tokens
        lock.unlock()
    }
}

extension AuthTokens {
    /// 테스트 표기를 줄인다 — `AuthTokens("jwt_1", "rt_1")`.
    init(_ access: String, _ refresh: String) {
        self.init(accessToken: access, refreshToken: refresh)
    }
}
