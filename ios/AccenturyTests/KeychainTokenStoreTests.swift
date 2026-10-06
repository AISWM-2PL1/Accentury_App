import AccenturyCore
import Security
import XCTest
@testable import Accentury

/// ``KeychainTokenStore``가 키체인 쓰기 실패를 호출자에게 알리는지 본다 (KAN-224 리뷰 P1). 실제 키체인 쓰기는 서명
/// 없는 시뮬레이터에서 -34018로 실패하므로, 쓰기 함수를 바꿔 끼워 상태 코드만 겨눈다.
final class KeychainTokenStoreTests: XCTestCase {

    func test키체인_쓰기가_실패하면_false를_돌려주되_메모리에는_새_쌍을_둔다() async {
        let tokens = AuthTokens(accessToken: "jwt_1", refreshToken: "rt_1")
        let store = KeychainTokenStore(add: { _ in errSecMissingEntitlement })

        let persisted = await store.save(tokens)

        XCTAssertFalse(persisted)
        let cached = await store.read()
        XCTAssertEqual(tokens, cached)
    }

    func test키체인_쓰기가_성공하면_true다() async {
        let store = KeychainTokenStore(add: { _ in errSecSuccess })

        let persisted = await store.save(AuthTokens(accessToken: "jwt_1", refreshToken: "rt_1"))

        XCTAssertTrue(persisted)
    }
}
