import AccenturyCore
import AuthenticationServices
import GoogleSignIn
import KakaoSDKAuth
import KakaoSDKCommon
import KakaoSDKUser
import NidThirdPartyLogin
import UIKit

/*
 * IdP SDK 호출은 전부 이 파일에만 있다 (KAN-224). 안드로이드 `auth/IdpSdks.kt`의 자리다.
 *
 * 화면(LoginScreen)은 제공자 이름과 ``IdpOutcome``만 안다 — SDK 타입이 화면으로 번지지 않게 하려는 것이고, 카카오
 * SDK가 `AuthApi`·`Gender` 같은 이름을 우리 Core와 겹쳐 쓰는 문제도 이 파일 안에 가둔다.
 */

/// 이 빌드에 설정이 주입된 제공자 (KAN-224). 빈 값의 버튼은 숨긴다 (``AccenturyCore/visibleProviders(configured:fakeIdp:)``).
/// 애플은 설정값이 없다 — 번들 식별자와 entitlement(Accentury.entitlements)가 전부라 늘 들어간다.
func configuredProviders() -> Set<Provider> {
    var providers: Set<Provider> = [.APPLE]
    if AppConfig.googleIosClientId != nil, AppConfig.googleServerClientId != nil { providers.insert(.GOOGLE) }
    if AppConfig.kakaoNativeAppKey != nil { providers.insert(.KAKAO) }
    if AppConfig.naverClientId != nil, AppConfig.naverClientSecret != nil, AppConfig.naverUrlScheme != nil {
        providers.insert(.NAVER)
    }
    return providers
}

/// 버튼 하나가 부를 로그인. 가짜 IdP 빌드면 SDK를 건너뛴다.
@MainActor
func idpSignIn(_ provider: Provider) async -> IdpOutcome {
    if AppConfig.fakeIdp { return .credential(fakeLoginCredential(provider)) }
    switch provider {
    case .GOOGLE: return await GoogleIdp.signIn()
    case .KAKAO: return await KakaoIdp.signIn()
    case .NAVER: return await NaverIdp.signIn()
    case .APPLE: return await AppleIdp().signIn()
    }
}

/// 네이버 SDK 초기화 (KAN-224). 카카오 SDK와 같은 스위치다 — 설정이 없으면 초기화하지 않고, 로그인 화면은 그 버튼을
/// 숨긴다. `appName`은 네이버 동의 화면에 뜨는 앱 이름이다. 앱 시작에 한 번 부른다(``AccenturyApp``).
func initializeIdpSdks() {
    if let clientId = AppConfig.naverClientId, let secret = AppConfig.naverClientSecret, let scheme = AppConfig.naverUrlScheme {
        NidOAuth.shared.initialize(appName: "Accentury", clientId: clientId, clientSecret: secret, urlScheme: scheme)
    }
}

/// IdP 앱(카카오톡·네이버)이나 구글 인증 창에서 돌아온 URL을 해당 SDK에 넘긴다. 받아 간 SDK가 있으면 true.
/// SwiftUI `onOpenURL`이 부른다 — 우리 앱은 SceneDelegate가 없어 이 자리가 `openURLContexts`다.
@MainActor
func handleIdpOpenURL(_ url: URL) -> Bool {
    // https://developers.kakao.com/docs/latest/ko/kakaologin/ios#set-redirect-uri
    if KakaoSDKAuth.AuthApi.isKakaoTalkLoginUrl(url) { return KakaoSDKAuth.AuthController.handleOpenUrl(url: url) }
    // https://developers.google.com/identity/sign-in/ios/sign-in#2_handle_the_authentication_redirect_url
    if GIDSignIn.sharedInstance.handle(url) { return true }
    // https://github.com/naver/naveridlogin-sdk-ios-swift (NidOAuth.handleURL)
    if configuredProviders().contains(.NAVER), NidOAuth.shared.handleURL(url) { return true }
    return false
}

/// 구글 — GoogleSignIn-iOS (KAN-224). 서버로 보내는 것은 ID 토큰이고, 서버는 그 토큰의 aud를 `serverClientID`
/// (구글 콘솔의 "웹 애플리케이션" 클라이언트, 안드로이드와 같은 값)와 대조한다. `clientID`는 iOS 클라이언트다 —
/// SDK가 계정 선택 창을 여는 데 쓴다.
/// https://developers.google.com/identity/sign-in/ios/backend-auth
private enum GoogleIdp {
    @MainActor
    static func signIn() async -> IdpOutcome {
        guard let clientId = AppConfig.googleIosClientId, let presenter = TopViewController.current() else { return .failed }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientId, serverClientID: AppConfig.googleServerClientId)
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            guard let idToken = result.user.idToken?.tokenString else { return .failed }
            return .credential(loginCredential(of: .GOOGLE, token: idToken))
        } catch let error as GIDSignInError where error.code == .canceled {
            return .cancelled
        } catch {
            return .failed
        }
    }
}

/// 카카오 (KAN-224). 카톡이 깔려 있으면 카톡으로, 없거나 카톡 로그인이 실패하면 카카오계정(웹)으로 간다. 카톡
/// 화면에서 사용자가 취소한 경우는 계정 로그인으로 넘기지 않는다 — 로그인하지 않겠다는 뜻이다. 서버로는 카카오
/// Access 토큰을 보낸다. 안드로이드 `KakaoSignIn`과 같은 순서다.
/// https://developers.kakao.com/docs/latest/ko/kakaologin/ios#login
private enum KakaoIdp {
    @MainActor
    static func signIn() async -> IdpOutcome {
        if UserApi.isKakaoTalkLoginAvailable() {
            let (token, error) = await login { UserApi.shared.loginWithKakaoTalk(completion: $0) }
            if let token { return credential(token) }
            if isCancel(error) { return .cancelled }
        }
        let (token, error) = await login { UserApi.shared.loginWithKakaoAccount(completion: $0) }
        if let token { return credential(token) }
        return isCancel(error) ? .cancelled : .failed
    }

    private static func credential(_ token: OAuthToken) -> IdpOutcome {
        .credential(loginCredential(of: .KAKAO, token: token.accessToken))
    }

    private static func isCancel(_ error: Error?) -> Bool {
        guard let sdkError = error as? SdkError, sdkError.isClientFailed else { return false }
        return sdkError.getClientError().reason == .Cancelled
    }

    @MainActor
    private static func login(
        _ start: (@escaping (OAuthToken?, Error?) -> Void) -> Void
    ) async -> (OAuthToken?, Error?) {
        await withCheckedContinuation { continuation in
            start { token, error in continuation.resume(returning: (token, error)) }
        }
    }
}

/// 네이버 (KAN-224). Swift SDK 5.x의 `NidOAuth` — 네이버 앱이 있으면 앱으로, 없으면 인앱 브라우저로 간다(기본 동작).
/// 서버로는 네이버 Access 토큰을 보낸다. 초기화는 ``initializeIdpSdks()``가 한다.
/// https://github.com/naver/naveridlogin-sdk-ios-swift
private enum NaverIdp {
    @MainActor
    static func signIn() async -> IdpOutcome {
        await withCheckedContinuation { continuation in
            NidOAuth.shared.requestLogin { result in
                switch result {
                case .success(let login):
                    let token = login.accessToken.tokenString
                    continuation.resume(returning: token.isEmpty ? .failed : .credential(loginCredential(of: .NAVER, token: token)))
                case .failure(.clientError(.canceledByUser)):
                    continuation.resume(returning: .cancelled)
                case .failure:
                    continuation.resume(returning: .failed)
                }
            }
        }
    }
}

/// 애플 — AuthenticationServices (KAN-224). 서버로 ID 토큰(`identityToken`)과 **원문** nonce를 보내고, 애플 요청에는
/// 그 SHA-256을 싣는다(``AccenturyCore/AppleNonce``). 이름은 애플이 최초 로그인에만 주므로 있을 때만 싣는다 —
/// 두 번째부터는 서버가 이미 안다. 이메일은 서버가 ID 토큰에서 읽는다.
/// https://developer.apple.com/documentation/authenticationservices/implementing_user_authentication_with_sign_in_with_apple
@MainActor
private final class AppleIdp: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {

    private let nonce = AppleNonce.make()
    private var continuation: CheckedContinuation<IdpOutcome, Never>?

    func signIn() async -> IdpOutcome {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = AppleNonce.sha256(nonce)
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        // 컨트롤러는 델리게이트를 약하게 잡는다 — 이 객체는 continuation이 끝날 때까지 이 함수의 await가 붙든다.
        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8)
        else { return finish(.failed) }
        finish(.credential(
            loginCredential(of: .APPLE, token: idToken, nonce: nonce, name: AppleNonce.displayName(credential.fullName))
        ))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        finish((error as? ASAuthorizationError)?.code == .canceled ? .cancelled : .failed)
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        TopViewController.current()?.view.window ?? ASPresentationAnchor()
    }

    private func finish(_ outcome: IdpOutcome) {
        continuation?.resume(returning: outcome)
        continuation = nil
    }
}

/// IdP SDK 쪽 세션 정리 (KAN-224). ``AccenturyCore/AuthGateController/logout(idpLogout:)``에 넘길 몫이다 —
/// `await gate.logout { await IdpLogout.all() }`. 로그아웃 화면은 이 티켓 범위 밖(KAN-247)이라 아직 부르는 곳이 없다.
///
/// 셋 다 최선 노력이다: 우리 토큰은 이미 서버에서 폐기됐고, SDK 세션이 남으면 다음 로그인에서 계정 선택이
/// 생략될 뿐이다. 하나가 실패해도 나머지는 정리한다. 애플은 앱이 부를 로그아웃 API가 없다(사용자가 설정에서 끊는다).
enum IdpLogout {
    @MainActor
    static func all() async {
        // https://developers.kakao.com/docs/latest/ko/kakaologin/ios#logout
        if AppConfig.kakaoNativeAppKey != nil {
            await withCheckedContinuation { continuation in
                UserApi.shared.logout { _ in continuation.resume() }
            }
        }
        // 기기에 저장된 네이버 토큰을 지운다 (서버 연동 해제는 disconnect — 계정 삭제가 아니라 쓰지 않는다).
        if configuredProviders().contains(.NAVER) { NidOAuth.shared.logout() }
        // https://developers.google.com/identity/sign-in/ios/sign-in#sign_out_the_user
        GIDSignIn.sharedInstance.signOut()
    }
}
