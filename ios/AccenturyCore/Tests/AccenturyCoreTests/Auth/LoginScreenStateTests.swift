import XCTest
@testable import AccenturyCore

/// 안드로이드 `auth/LoginScreenStateTest.kt`·`IdpSignInTest.kt`의 이식본에 iOS 몫(APPLE·nonce)을 더했다 (KAN-224).
@MainActor
final class LoginScreenStateTests: XCTestCase {

    private let credential = LoginCredential(provider: .KAKAO, accessToken: "t")

    func test동의_전에는_버튼이_꺼져_있고_눌러도_아무_일도_없다() async {
        let state = LoginScreenState()
        var idpCalled = false

        await state.signIn(idp: { idpCalled = true; return .cancelled }, login: { _ in })

        XCTAssertFalse(state.buttonsEnabled)
        XCTAssertFalse(idpCalled)
    }

    func test로그인이_도는_동안에는_버튼이_꺼지고_두_번째_탭은_무시된다() async {
        let state = LoginScreenState(consented: true)
        var logins = 0
        var release: CheckedContinuation<IdpOutcome, Never>?
        let credential = credential

        let first = Task { @MainActor in
            await state.signIn(idp: { await withCheckedContinuation { release = $0 } }, login: { _ in logins += 1 })
        }
        await waitUntil { release != nil }
        XCTAssertTrue(state.inFlight)
        XCTAssertFalse(state.buttonsEnabled)

        await state.signIn(idp: { .credential(credential) }, login: { _ in logins += 1 })
        release?.resume(returning: .credential(credential))
        await first.value

        XCTAssertEqual(1, logins)
        XCTAssertFalse(state.inFlight)
        XCTAssertTrue(state.buttonsEnabled)
    }

    func testIdP에서_취소하면_오류도_서버_로그인도_없다() async {
        let state = LoginScreenState(consented: true)
        var loggedIn = false

        await state.signIn(idp: { .cancelled }, login: { _ in loggedIn = true })

        XCTAssertNil(state.idpError)
        XCTAssertFalse(loggedIn)
        XCTAssertFalse(state.inFlight)
    }

    func testIdP_실패는_다시_시도_안내가_되고_다음_시도가_지운다() async {
        let state = LoginScreenState(consented: true)

        await state.signIn(idp: { .failed }, login: { _ in })
        XCTAssertEqual(AuthFailure(.retry), state.idpError)

        await state.signIn(idp: { .cancelled }, login: { _ in })
        XCTAssertNil(state.idpError)
    }

    func test토큰을_받으면_그_자격_그대로_서버_로그인으로_넘긴다() async {
        let state = LoginScreenState(consented: true)
        var sent: LoginCredential?
        let credential = credential

        await state.signIn(idp: { .credential(credential) }, login: { sent = $0 })

        XCTAssertEqual(credential, sent)
    }

    func test설정이_빈_제공자는_숨기고_순서는_구글_카카오_네이버_애플이다() {
        XCTAssertEqual([.GOOGLE, .NAVER, .APPLE], visibleProviders(configured: [.APPLE, .NAVER, .GOOGLE], fakeIdp: false))
        XCTAssertEqual([], visibleProviders(configured: [], fakeIdp: false))
    }

    func test가짜_IdP면_설정이_없어도_넷_다_보인다() {
        XCTAssertEqual([.GOOGLE, .KAKAO, .NAVER, .APPLE], visibleProviders(configured: [], fakeIdp: true))
    }

    func test가짜_IdP_구글과_애플은_idToken_카카오와_네이버는_accessToken_칸에_싣는다() {
        XCTAssertEqual("fake:dev-google", fakeLoginCredential(.GOOGLE).idToken)
        XCTAssertNil(fakeLoginCredential(.GOOGLE).accessToken)
        XCTAssertEqual("fake:dev-kakao", fakeLoginCredential(.KAKAO).accessToken)
        XCTAssertNil(fakeLoginCredential(.KAKAO).idToken)
        XCTAssertEqual("fake:dev-naver", fakeLoginCredential(.NAVER).accessToken)
        XCTAssertEqual("fake:dev-apple", fakeLoginCredential(.APPLE).idToken)
    }

    /// 서버는 애플이면 nonce를 필수로 본다 — 가짜 판정보다 필드 검사가 먼저다.
    func test가짜_애플도_nonce를_싣고_다른_제공자는_싣지_않는다() {
        XCTAssertEqual(64, fakeLoginCredential(.APPLE).nonce?.count)
        XCTAssertNil(fakeLoginCredential(.GOOGLE).nonce)
        XCTAssertNil(fakeLoginCredential(.KAKAO).nonce)
    }

    func test가짜_sub는_서버가_받는_형식이다() throws {
        let pattern = try NSRegularExpression(pattern: "^[A-Za-z0-9._-]{1,64}$")
        for provider in loginProviders {
            let credential = fakeLoginCredential(provider)
            let sub = String(try XCTUnwrap(credential.idToken ?? credential.accessToken).dropFirst("fake:".count))
            XCTAssertNotNil(pattern.firstMatch(in: sub, range: NSRange(sub.startIndex..., in: sub)), sub)
        }
    }

    // MARK: 애플 nonce

    /// FIPS 180-2 부록 B.1의 "abc" 시험 벡터. 애플에 싣는 값이 소문자 16진 SHA-256이어야 서버 대조가 맞는다.
    func testnonce_해시는_SHA256_소문자_16진이다() {
        XCTAssertEqual(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            AppleNonce.sha256("abc")
        )
    }

    func testnonce_원문은_매번_다른_64자_16진이다() {
        let a = AppleNonce.make()
        let b = AppleNonce.make()
        XCTAssertNotEqual(a, b)
        XCTAssertEqual(64, a.count)
        XCTAssertTrue(a.allSatisfy(\.isHexDigit))
    }

    func test애플_이름이_비었으면_서버로_보내지_않는다() {
        XCTAssertNil(AppleNonce.displayName(nil))
        XCTAssertNil(AppleNonce.displayName(PersonNameComponents()))
        var name = PersonNameComponents()
        name.givenName = "길동"
        name.familyName = "홍"
        let formatted = AppleNonce.displayName(name)
        XCTAssertTrue(formatted?.contains("길동") == true && formatted?.contains("홍") == true, formatted ?? "nil")
    }
}
