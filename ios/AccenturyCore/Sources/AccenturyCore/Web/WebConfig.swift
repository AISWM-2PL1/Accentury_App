import Foundation

/// 앱이 보유한 브리지 계약 버전 (webview-layer.md §5).
/// 규칙: 메서드·필드 추가는 하위호환이라 버전을 유지하고, 삭제·의미 변경 시에만 올린다.
/// ItemResult 5필드(KAN-89 계약)를 바꾸는 변경도 반드시 버전 증가 대상이다.
///
/// KAN-205에서 1 → 2로 올렸다. 진입 쿼리의 `voiceSet`이 웹에 필수가 됐고, 그 값을 싣지 않는
/// 구버전 앱은 문항 화면에서 빠져나올 수 없다 — 웹의 `REQUIRED_BRIDGE_VERSION`과 짝이다.
///
/// KAN-196(광고 동의 `getAdConsent`·`setAdConsent`·`showInterstitialAd`)은 **2를 유지한다** — 메서드
/// 추가뿐이라 하위호환이고, 웹은 없는 메서드를 `readAdConsent() === null`("광고 개념 없음")로 접는다.
/// 광고 없는 구버전 앱이 신버전 웹을 열어도 응시가 막히지 않으므로 올릴 이유가 없다.
public let bridgeContractVersion = 2

/// 로드 실패 판정 자체 타임아웃 (§6). 페이지 로드 완료 콜백이 영영 안 오는 경우를 대비한다.
/// 8초 = Nielsen 10초 주의력 한계 직전, "진입 → 결과 3분" 목표와 정합하는 제안값.
///
/// 안드로이드는 `LOAD_TIMEOUT_MS`를 밀리초 `Long`으로 들고 있다. iOS 쪽 타이머 API가
/// 전부 초 단위 `TimeInterval`을 받으므로 여기서는 단위를 초로 바꿔 담는다 — 값 자체(8초)는 같다.
public let loadTimeout: TimeInterval = 8

/// 테스트 진입 파라미터 (KAN-100). 시작 게이트(KAN-98)를 통과한 뒤의 정식 진입 URL에만 붙는다 —
/// 웹은 `screen=test`를 보고 인트로 대신 문항 진행 화면으로 들어간다 (web/src/App.tsx).
public struct TestEntry: Equatable, Sendable {
    /// 세션에 고정된 정의 버전. 웹이 `GET /v0/tests/{testVersion}`으로 정의를 받는다.
    public let testVersion: String
    /// 세션에 고정된 음성 문항 세트 (KAN-205). 웹이 정의 조회의 `?voiceSet=`에 그대로 넣는다 —
    /// 빠지면 세트 1의 문항이 와서 세션의 세트와 갈리고 제출이 전부 422다.
    public let voiceSet: Int
    /// 진행 스냅샷을 세션별로 가르는 식별자. 업로드가 붙는 세션과 같은 값이어야 한다.
    public let sessionId: String

    public init(testVersion: String, voiceSet: Int, sessionId: String) {
        self.testVersion = testVersion
        self.voiceSet = voiceSet
        self.sessionId = sessionId
    }
}

/// WebView가 로드할 최종 URL. 브리지 버전과 앱 버전을 쿼리로 실어 보낸다 —
/// 스큐 판정의 주체는 웹이므로(§5) 앱은 자기 버전을 알리기만 하면 된다.
///
/// `testEntry`가 있으면 테스트 진입 URL, 없으면 인트로 URL이다. 두 URL을 한 함수로 묶은 이유:
/// 스큐 파라미터는 어느 쪽에도 빠지면 안 되는데(빠지면 웹이 업데이트 안내를 띄운다) 조립을
/// 나누면 한쪽만 고치는 실수가 생긴다.
///
/// - Parameter bridgeVersion: URL에 실어 보낼 브리지 계약 버전. 기본값이 앱이 실제로 구현한
///   버전(``bridgeContractVersion``)이고, **이 인자를 넘기는 곳은 디버그 스모크 하나뿐이다**
///   (`-BridgeVersionOverride`, KAN-108 §8). 웹의 스큐 판정은 낮은 버전을 실어 보내야만 볼 수
///   있는데, 그걸 보려고 상수를 잠깐 고쳐 빌드하면 그 검증이 커밋에 남지 않는다.
/// - Parameter campaignToken: Universal Link로 들어온 공유 유입 계측 코드 (``parseAppLink(_:allowedOrigins:)``,
///   KAN-32). 있으면 `c`로 딸려 보내 웹이 만드는 첫 세션에 같은 코드가 실리게 한다 — 웹은 진입
///   쿼리의 `?c=`를 `session/campaign.ts`로 읽고 `navigation/entryUrl.ts`가 화면을 옮겨도 그
///   값을 보존한다. 앱이 값을 해석하지 않고 그대로 넘기는 자리라, 링크에서 실려 온 유입 경로가
///   세션까지 이어진다.
/// - Parameter home: 인트로 대신 홈 탭(`screen=home`)으로 연다 (KAN-252). 로그인 빌드의 첫 문서만 켠다 — 재응시·앱 링크처럼
///   인트로로 가야 하는 경로는 호출자가 끈다. `testEntry`가 있으면 무시한다: 테스트 진입 URL은 그대로여야 한다.
///   안드로이드 `buildWebUrl(home =)`의 이식본이다
public func buildWebUrl(
    base: String,
    appVersionName: String,
    testEntry: TestEntry? = nil,
    bridgeVersion: Int = bridgeContractVersion,
    campaignToken: String? = nil,
    home: Bool = false
) -> String {
    let separator: Character = base.contains("?") ? "&" : "?"
    var query = "bridge=\(bridgeVersion)&app=\(encodeQueryValue(appVersionName))"
    if let testEntry {
        query += "&screen=test"
        query += "&testVersion=\(encodeQueryValue(testEntry.testVersion))"
        query += "&voiceSet=\(testEntry.voiceSet)"
        query += "&sessionId=\(encodeQueryValue(testEntry.sessionId))"
    } else if home {
        query += "&screen=\(homeScreen)"
    }
    if let campaignToken {
        query += "&c=\(encodeQueryValue(campaignToken))"
    }
    return "\(base)\(separator)\(query)"
}

/// 홈 탭의 `screen` 값 (KAN-252). 웹 `TabScreen`의 'home'과 같다.
private let homeScreen = "home"

/// 뒤로가기가 홈으로 돌리는 탭 화면 (KAN-252). 홈 자신은 빠진다 — 홈에서의 뒤로는 아무 일도 없다.
private let backToHomeScreens: Set<Substring> = ["intonation", "words", "translate"]

/// 홈 문서로 옮길 때 지우는 레벨테스트 값. 웹 `buildTabUrl`이 지우는 것과 같다.
private let testQueryKeys: Set<Substring> = ["sessionId", "testVersion", "voiceSet"]

/// 뒤로가기의 목적지 (KAN-252, 로그인 빌드). 홈 문서 URL이면 그리로 옮기고, nil이면 아무것도 하지 않는다.
/// 안드로이드 `webBackTarget`의 이식본이다 — 판정 표가 같아야 두 앱의 뒤로가 같은 곳으로 간다.
///
/// iOS에는 시스템 뒤로 버튼이 없어 화면 왼쪽 가장자리 스와이프가 이 판정을 부른다(`TestFlowView`). 안드로이드에서 null이
/// "가로채지 않아 앱이 닫힌다"인 자리가 여기서는 "스와이프를 무시한다"다.
///
/// 홈으로 돌리는 것은 **탭 화면**(억양·단어·번역기)과 **시작을 누르기 전의 인트로**뿐이다. 홈 자신·테스트 진행·결과는
/// 그대로 둔다 — 테스트 중 뒤로가기로 응시가 끊기지 않게 한 KAN-191·KAN-147 규칙을 건드리지 않는다.
/// 인트로는 `screen`이 없는 문서인데, `startRequested`가 서면 시작 게이트(권한·점검·세션)가 진행 중이라 마찬가지로 둔다.
///
/// 목적지는 웹 탭 이동(`buildTabUrl`)과 같은 결과다 — `screen`만 home으로 바꾸고 레벨테스트 값을 지우며 나머지(`bridge`·
/// `app`·`c`)는 보존한다. 판정을 URL 문자열 → 행동의 순수 함수로 둔 이유는 WebKit 없이 표로 검증하려는 것이다.
public func webBackTarget(currentUrl: String?, startRequested: Bool) -> String? {
    guard let currentUrl else { return nil }
    let (base, params) = splitDocumentUrl(currentUrl)
    let goHome: Bool
    if let screen = screenParam(params) {
        goHome = backToHomeScreens.contains(screen)
    } else {
        goHome = !startRequested
    }
    guard goHome else { return nil }
    return webTabUrl(currentUrl: currentUrl, screen: homeScreen)
}

/// 현재 문서를 탭 `screen` 문서로 옮긴 URL (KAN-252). 안드로이드 `webTabUrl`의 이식본이다. 웹 탭 이동(`buildTabUrl`)과 같은
/// 쿼리 규칙이다 — `screen`만 바꾸고 레벨테스트 값을 지우며 나머지(`bridge`·`app`·`c`)는 보존하고 fragment는 뗀다.
/// ``webBackTarget(currentUrl:startRequested:)``(홈)과 억양 녹음 ✕(억양 탭, 2026-10-13 사용자 결정)가 같이 쓴다.
/// 문서를 아직 모르면(nil) nil — 호출자는 옮기지 않는다.
public func webTabUrl(currentUrl: String?, screen: String) -> String? {
    guard let currentUrl else { return nil }
    let (base, params) = splitDocumentUrl(currentUrl)
    let kept = params.filter { param in
        let key = queryKey(param)
        return key != "screen" && !testQueryKeys.contains(key)
    }
    return "\(base)?" + (kept.map(String.init) + ["screen=\(screen)"]).joined(separator: "&")
}

/// 로그인 빌드에서 WebView 위 설정 톱니를 세울 문서인가 (KAN-252, 2026-10-13 사용자 결정). 안드로이드 `showsSettingsGear`의
/// 이식본이다. 레벨 테스트 웹 화면 — 인트로(`screen` 없음)와 진행(`screen=test`) — 만 true다. 이 화면들엔 탭 바가 없어
/// 설정으로 갈 길이 톱니뿐이다. 탭 화면(home·intonation·words·translate)과 결과(`screen=result`)는 탭 바의 [설정]이 있어 false다.
/// 문서를 아직 모르면(nil) false — 로그인 빌드의 첫 문서는 홈이라 톱니가 없는 쪽이 맞다.
/// 녹음 오버레이·시작 게이트처럼 네이티브가 WebView를 덮는 경우는 URL로 알 수 없어 호출자(`TestFlowView`)가 따로 거른다.
public func showsSettingsGear(_ currentUrl: String?) -> Bool {
    guard let currentUrl else { return false }
    let screen = screenParam(splitDocumentUrl(currentUrl).params)
    return screen == nil || screen == "test"
}

/// 문서 URL을 fragment를 뗀 뒤 `?` 앞(base)과 `&`로 나눈 쿼리 조각으로 가른다. 빈 조각은 버린다(안드로이드와 같다).
private func splitDocumentUrl(_ url: String) -> (base: Substring, params: [Substring]) {
    let document = url.prefix { $0 != "#" }
    guard let mark = document.firstIndex(of: "?") else { return (document, []) }
    return (document[..<mark], document[document.index(after: mark)...].split(separator: "&"))
}

/// 쿼리 조각의 키(`=` 앞).
private func queryKey(_ param: Substring) -> Substring {
    param.prefix { $0 != "=" }
}

/// 첫 `screen` 조각의 값. 없으면 nil, `=`가 없으면 빈 값이다(안드로이드 `substringAfter('=', "")`와 같다).
private func screenParam(_ params: [Substring]) -> Substring? {
    guard let param = params.first(where: { queryKey($0) == "screen" }) else { return nil }
    guard let equals = param.firstIndex(of: "=") else { return "" }
    return param[param.index(after: equals)...]
}

/// 값에 든 `&`·`=`·공백이 쿼리 구조를 깨뜨리지 않게 한다. 앱 버전은 물론 서버가 발급하는
/// testVersion·sessionId도 형식을 앱이 정하지 않으므로 전부 거쳐 간다.
///
/// 안드로이드가 쓰는 `URLEncoder.encode(value, "UTF-8")`(application/x-www-form-urlencoded)와
/// 같은 결과를 낸다 — 공백은 `%20`이 아니라 `+`, 그리고 `.` `-` `*` `_`만 영숫자와 함께 그대로 남는다.
/// Foundation의 `addingPercentEncoding`은 공백을 `%20`으로 만들어 두 플랫폼의 URL이 갈리므로 쓰지 않는다.
private func encodeQueryValue(_ value: String) -> String {
    var out = ""
    for byte in Array(value.utf8) {
        switch byte {
        case UInt8(ascii: "a")...UInt8(ascii: "z"),
             UInt8(ascii: "A")...UInt8(ascii: "Z"),
             UInt8(ascii: "0")...UInt8(ascii: "9"),
             UInt8(ascii: "."), UInt8(ascii: "-"), UInt8(ascii: "*"), UInt8(ascii: "_"):
            out.append(Character(UnicodeScalar(byte)))
        case UInt8(ascii: " "):
            out.append("+")
        default:
            out += String(format: "%%%02X", byte)
        }
    }
    return out
}

/// URL의 origin(스킴://호스트[:포트])을 뽑는다. http(s)가 아니거나(javascript: 등)
/// 파싱이 안 되면 nil — allowlist 비교의 입력을 한 가지 꼴로 좁히는 함수다.
/// 기본 포트(80/443)는 표기 유무가 같은 origin이 되도록 지운다.
public func webOrigin(_ url: String) -> String? {
    guard let components = URLComponents(string: url) else { return nil }
    guard let scheme = components.scheme?.lowercased() else { return nil }
    guard scheme == "http" || scheme == "https" else { return nil }
    guard let rawHost = components.host, !rawHost.isEmpty else { return nil }
    let host = rawHost.lowercased()
    let port: Int? = switch (scheme, components.port) {
    case (_, nil): nil
    case ("http", 80): nil
    case ("https", 443): nil
    case (_, let value): value
    }
    guard let port else { return "\(scheme)://\(host)" }
    return "\(scheme)://\(host):\(port)"
}

/// allowlist 검사 (§7). 브리지가 마이크 권한 게이트를 호출하므로 이 검사가 곧 보안 경계다 —
/// allowlist 밖 URL은 WebView 로드도, 브리지 실행도 막는다.
public func isAllowedWebUrl(_ url: String?, allowedOrigins: Set<String>) -> Bool {
    guard let url, let origin = webOrigin(url) else { return false }
    return allowedOrigins.contains(origin)
}

/// 앱 밖 브라우저로 열어도 되는 호스트 (KAN-177). 안드로이드 `EXTERNAL_LINK_HOSTS`의 이식본이다.
///
/// 지금 여기로 나가는 링크는 개인정보처리방침 하나뿐이다 (`web/src/legal/privacyPolicy.ts`).
/// 그런데도 목록을 두는 이유는 **여는 주소를 정하는 쪽이 웹**이기 때문이다 — WebView에 실린
/// 스크립트가 부르는 메서드라, 넘어온 값을 그대로 열면 앱이 아무 주소나 여는 창구가 된다.
///
/// **prod 호스트 하나뿐이다.** 방침은 법적 고지라 정본이 하나여야 하고, 그래서 웹 상수도
/// 환경과 무관하게 prod를 가리킨다 (`web/src/legal/privacyPolicy.ts`) — staging 빌드도 같은
/// 문서를 연다. 여기에 `staging.accentury.app`을 함께 두면 **웹이 절대 보내지 않는 호스트로
/// 문을 하나 더 여는 것**이라 뺐다. ``appLinkOrigins``에 staging이 있는 것과 혼동하지 말 것 —
/// 저쪽은 링크로 앱에 **들어오는** 경로라 릴리스 전 확인에 staging 버킷이 필요하다.
///
/// 시뮬레이터의 `webUrl`(로컬 Vite)에서 파생하지 않는 이유도 같다 — 방침 문서는 로컬에 없고
/// 늘 우리 도메인에 있다.
public let externalLinkHosts: Set<String> = ["accentury.app"]

/// 브리지가 받은 외부 URL을 열어도 되는지 판정한다 (KAN-177). 열어도 되면 그 URL, 아니면 nil.
///
/// ``isAllowedWebUrl(_:allowedOrigins:)``과 판정 대상이 다르다. 저쪽은 **WebView가 로드할** URL을
/// origin 단위로 보고, 이쪽은 **앱 밖으로 내보낼** URL을 호스트 단위로 본다 — 포트·경로가
/// 문서마다 다를 수 있어서 origin 일치를 요구하면 방침 문서를 옮기는 날 링크가 조용히 죽는다.
///
/// https만 통과시킨다. 방침 문서는 어느 환경에서도 HTTPS로 서므로 http를 받아 줄 이유가 없고,
/// `javascript:`·앱 스킴은 host가 없어 자동으로 걸린다.
///
/// `user@host` 꼴과 역슬래시·공백을 따로 막는다. **여기서 근거는 안드로이드와 다르다**
/// (KAN-199 #2에서 정정). 저쪽은 검사하는 `java.net.URI`와 여는 `android.net.Uri`가 진짜 다른
/// 구현이라 host가 갈릴 여지가 있지만, 이쪽은 검사하는 `URLComponents`와 여는 `URL`이 둘 다
/// Foundation이라 같은 호스트를 준다 — 검사한 곳과 여는 곳이 어긋나지 않는다. 그래도 막는
/// 이유는 두 가지다: 방침 URL에 애초에 없는 문자이고, 두 플랫폼이 같은 입력에 같은 답을
/// 내야 계약이 하나로 남는다.
///
/// 호스트의 `%`도 같은 이유로 막는다. Foundation은 `%61ccentury.app`을 `accentury.app`으로
/// 디코딩해 통과시키는데, `java.net.URI`는 디코딩하지 않아 host가 null이 되어 거절한다 —
/// 같은 입력에 두 앱이 다르게 답하던 자리다. 어느 쪽도 우회는 아니지만(양쪽 다 자기가 검사한
/// 호스트를 그대로 연다) 동작이 갈리므로 양쪽에서 명시적으로 거절한다. 검사 대상은 디코딩
/// 이전 값이라 `percentEncodedHost`를 본다 — `host`를 보면 이미 풀린 뒤라 `%`가 남지 않는다.
public func externalUrlToOpen(_ url: String?, allowedHosts: Set<String> = externalLinkHosts) -> String? {
    guard let url else { return nil }
    let hasRiskyCharacter = url.unicodeScalars.contains { scalar in
        scalar == "\\" || scalar.properties.isWhitespace || scalar.value < 0x20
    }
    guard !hasRiskyCharacter else { return nil }
    guard let components = URLComponents(string: url) else { return nil }
    guard components.scheme?.lowercased() == "https" else { return nil }
    guard components.user == nil, components.password == nil else { return nil }
    guard components.percentEncodedHost?.contains("%") != true else { return nil }
    guard let host = components.host?.lowercased(), allowedHosts.contains(host) else { return nil }
    return url
}
