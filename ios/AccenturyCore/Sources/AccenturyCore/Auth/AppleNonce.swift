import CryptoKit
import Foundation
import Security

/// Sign in with Apple의 nonce (KAN-224).
///
/// 원문은 서버로, SHA-256 16진은 애플 요청(`ASAuthorizationAppleIDRequest.nonce`)으로 간다. 애플이 해시를
/// ID 토큰의 `nonce` 클레임에 그대로 담아 주고, 서버는 받은 원문을 해시해 그 클레임과 대조한다 — 탈취한 ID 토큰을
/// 다른 로그인에 다시 쓰는 재생 공격을 막는 장치다. 원문이 기기 밖(애플)으로 나가지 않는 것이 요점이라 순서를
/// 뒤집으면 안 된다. https://developer.apple.com/documentation/authenticationservices/asauthorizationopenidrequest/nonce
public enum AppleNonce {

    /// 원문 nonce. 32바이트 난수를 16진 64자로 편다 (서버 상한 이내, 서버 `AuthService.NONCE_MAX`).
    /// 난수는 `SecRandomCopyBytes` — 예측 가능한 난수면 nonce가 막으려는 재생을 막지 못한다.
    public static func make() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        precondition(status == errSecSuccess, "SecRandomCopyBytes 실패: \(status)")
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    /// 애플 요청에 싣는 값 — 원문의 SHA-256 소문자 16진.
    public static func sha256(_ raw: String) -> String {
        SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// 애플이 최초 로그인에만 주는 이름(`ASAuthorizationAppleIDCredential.fullName`)을 서버로 보낼 한 줄로 접는다.
    /// 비었으면 nil — 서버에 빈 이름을 보내지 않는다. 순서·띄어쓰기는 기기 로캘의 이름 표기 규칙을 따른다
    /// (한국어면 성+이름) — 직접 이어 붙이면 로캘마다 틀린 순서가 나온다.
    public static func displayName(_ components: PersonNameComponents?) -> String? {
        guard let components else { return nil }
        let formatted = PersonNameComponentsFormatter.localizedString(from: components, style: .default)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return formatted.isEmpty ? nil : formatted
    }
}
