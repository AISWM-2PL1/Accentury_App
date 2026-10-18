import Foundation

/// 업데이트 필요 화면의 [업데이트하기]가 열 App Store 상품 페이지 (KAN-288 시안 15). 안드로이드 `web/PlayStore.kt` 자리다.
///
/// 형식 근거: Apple StoreKit 문서 「Requesting App Store reviews」의 샘플이 상품 페이지를
/// `https://apps.apple.com/app/id<App Store ID>`로 적고 `openURL`로 연다 — iOS는 이 주소를 Safari가 아니라 App Store 앱으로
/// 넘긴다(https://developer.apple.com/documentation/storekit/requesting-app-store-reviews). 예전 `itms-apps://` 스킴은 같은
/// 문서에 없어 쓰지 않는다.
///
/// ID는 App Store Connect 앱 레코드의 숫자 Apple ID다. 게시 전이라 값이 없으면 nil을 돌려주고, 화면은 [업데이트하기]를
/// 세우지 않는다 — 없는 페이지로 보내는 버튼은 거짓말이다. 숫자가 아니면(오타·`id` 접두어를 붙인 값) 역시 nil이다.
public func appStoreProductUrl(appStoreId: String?) -> URL? {
    guard let id = appStoreId?.trimmingCharacters(in: .whitespaces), !id.isEmpty,
          id.allSatisfy({ $0.isASCII && $0.isNumber })
    else { return nil }
    return URL(string: "https://apps.apple.com/app/id\(id)")
}
