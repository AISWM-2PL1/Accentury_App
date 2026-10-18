import XCTest
@testable import AccenturyCore

/// 업데이트 필요 화면의 App Store 링크 (KAN-288). 안드로이드 `PlayStoreTest`의 짝이다.
final class AppStoreLinkTests: XCTestCase {

    func testNumericIdBecomesProductPage() {
        XCTAssertEqual(URL(string: "https://apps.apple.com/app/id1234567890"), appStoreProductUrl(appStoreId: "1234567890"))
    }

    /// 게시 전(빈 값)·잘못 적은 값은 버튼을 세우지 않는다
    func testMissingOrMalformedIdHasNoLink() {
        XCTAssertNil(appStoreProductUrl(appStoreId: nil))
        XCTAssertNil(appStoreProductUrl(appStoreId: ""))
        XCTAssertNil(appStoreProductUrl(appStoreId: "id123"))
        XCTAssertNil(appStoreProductUrl(appStoreId: "12 34"))
    }
}
