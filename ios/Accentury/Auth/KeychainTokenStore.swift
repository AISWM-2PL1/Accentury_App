import AccenturyCore
import Foundation
import Security

/// 토큰 쌍을 키체인에 두는 저장소 (KAN-224). 안드로이드 `auth/KeystoreTokenStore.kt`의 자리다.
///
/// 안드로이드는 Keystore 키로 직접 암호화해 DataStore에 뒀지만, iOS는 키체인 자체가 그 일을 한다 — 항목은 기기
/// 암호화 키로 잠기고 앱 밖으로 나오지 않는다. 접근 등급은 `AfterFirstUnlockThisDeviceOnly`다:
/// - **AfterFirstUnlock**: 재부팅 뒤 한 번 잠금을 푼 다음부터는 백그라운드에서도 읽힌다. 업로드가 백그라운드
///   실행 시간 안에서 세션 생성·갱신을 부를 수 있어 `WhenUnlocked`면 그 사이 잠금에 걸린다.
/// - **ThisDeviceOnly**: 백업·기기 이전으로 따라가지 않는다. 안드로이드가 토큰 파일을 백업 제외 규칙에 넣은 것과
///   같은 판단이다 — 새 기기에서는 다시 로그인하면 된다.
///
/// **읽기 실패는 로그아웃으로 본다.** 깨진 값을 지우고 nil을 돌려주면 사용자는 다시 로그인하면 된다 — 안드로이드
/// 복호화 실패와 같은 규칙이다. 읽은 값은 메모리에 들고 있는다: 인증 요청마다 키체인을 부르지 않으려는 것이고,
/// 쓰기는 이 인스턴스만 하므로 캐시가 키체인과 어긋날 경로가 없다 — 앱 안에서 하나만 만든다(``AuthHub``).
actor KeychainTokenStore: TokenStore {

    /// 키체인 항목의 service·account. 바꾸면 이미 로그인한 사용자가 전부 로그아웃된다.
    private let service = "com.accentury.app.auth"
    private let account = "tokens"

    /// 캐시가 비어 있음(아직 안 읽음)과 저장된 값이 없음(nil)을 가르려고 로드 여부를 따로 든다.
    private var loaded = false
    private var cached: AuthTokens?

    func read() async -> AuthTokens? {
        if !loaded {
            cached = load()
            loaded = true
        }
        return cached
    }

    func save(_ tokens: AuthTokens) async {
        guard let data = try? JSONEncoder().encode(tokens) else { return }
        SecItemDelete(baseQuery() as CFDictionary)
        var item = baseQuery()
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        // 실패해도 메모리 값은 새 쌍으로 둔다 — 이 프로세스가 사는 동안은 회전된 쌍이 정본이다. 옛 쌍을 들고 있으면
        // 다음 갱신이 이미 죽은 Refresh를 내 패밀리가 폐기된다.
        SecItemAdd(item as CFDictionary, nil)
        cached = tokens
        loaded = true
    }

    func clear() async {
        SecItemDelete(baseQuery() as CFDictionary)
        cached = nil
        loaded = true
    }

    private func load() -> AuthTokens? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else {
            return nil
        }
        guard let tokens = try? JSONDecoder().decode(AuthTokens.self, from: data) else {
            // 깨진 값 — 되살릴 방법이 없다. 값에 토큰 조각이 있을 수 있어 로그로 남기지 않는다.
            SecItemDelete(baseQuery() as CFDictionary)
            return nil
        }
        return tokens
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
