import XCTest
@testable import AccenturyCore

/// `app/src/test/java/com/accentury/app/web/WebConfigTest.kt`의 1:1 이식본.
/// 케이스 순서·주장 내용이 안드로이드와 같아야 두 플랫폼이 같은 URL을 만든다는 걸 보증할 수 있다.
final class WebConfigTests: XCTestCase {

    // MARK: - buildWebUrl: 스큐 협상 파라미터 (§5)

    /// 로드 URL에 브리지 계약 버전과 앱 버전을 실어 보낸다.
    func testBuildWebUrlCarriesBridgeContractVersionAndAppVersion() {
        XCTAssertEqual(
            "https://web.example.com?bridge=\(bridgeContractVersion)&app=1.0",
            buildWebUrl(base: "https://web.example.com", appVersionName: "1.0")
        )
    }

    /// 기존 쿼리가 있으면 덮지 않고 뒤에 잇는다.
    func testAppendsToExistingQueryInsteadOfOverwriting() {
        XCTAssertEqual(
            "https://web.example.com?env=dev&bridge=\(bridgeContractVersion)&app=1.0",
            buildWebUrl(base: "https://web.example.com?env=dev", appVersionName: "1.0")
        )
    }

    /// 앱 버전 문자열은 URL 인코딩을 거친다.
    func testAppVersionStringIsUrlEncoded() {
        let url = buildWebUrl(base: "https://web.example.com", appVersionName: "1.0 beta")
        XCTAssertFalse(url.contains(" "))
        XCTAssertTrue(url.contains("app=1.0"))
    }

    // MARK: - buildWebUrl: 테스트 진입 URL 조립 (KAN-100)

    /// 테스트 진입 URL은 스큐 파라미터에 screen test testVersion voiceSet sessionId를 잇는다.
    func testTestEntryUrlAppendsScreenTestVersionVoiceSetAndSessionId() {
        XCTAssertEqual(
            "https://web.example.com?bridge=\(bridgeContractVersion)&app=1.0"
                + "&screen=test&testVersion=gn-2026.08.1&voiceSet=7&sessionId=dev-session",
            buildWebUrl(
                base: "https://web.example.com",
                appVersionName: "1.0",
                testEntry: TestEntry(testVersion: "gn-2026.08.1", voiceSet: 7, sessionId: "dev-session")
            )
        )
    }

    /// testEntry가 없으면 인트로 URL과 완전히 같다.
    func testNilTestEntryProducesTheSameUrlAsIntro() {
        XCTAssertEqual(
            buildWebUrl(base: "https://web.example.com", appVersionName: "1.0"),
            buildWebUrl(base: "https://web.example.com", appVersionName: "1.0", testEntry: nil)
        )
    }

    /// 세션 값에 든 구분자는 인코딩돼 쿼리 구조를 깨뜨리지 않는다.
    func testSeparatorsInsideSessionValuesAreEncoded() {
        let url = buildWebUrl(
            base: "https://web.example.com",
            appVersionName: "1.0",
            // 서버가 발급하는 값이라 형식을 앱이 보증하지 않는다 — 파라미터를 덧붙이는 꼴이 되면 안 된다.
            testEntry: TestEntry(testVersion: "gn 2026&x=1", voiceSet: 2, sessionId: "s/1?2")
        )
        XCTAssertTrue(url.contains("&testVersion=gn+2026%26x%3D1&"))
        // 세트는 정수라 인코딩할 것이 없다 - 값이 그대로 실렸는지만 본다 (KAN-205)
        XCTAssertTrue(url.contains("&voiceSet=2&"))
        XCTAssertTrue(url.hasSuffix("&sessionId=s%2F1%3F2"))
    }

    /// 비ASCII 값은 Java `URLEncoder.encode`처럼 UTF-8 바이트 단위 대문자 %HH로 나간다 —
    /// 양 플랫폼이 같은 URL을 만들어야 웹의 스큐 판정·세션 식별이 갈리지 않는다 (Codex 지적으로 추가).
    func testNonAsciiValuesAreUtf8PercentEncodedLikeJava() {
        let url = buildWebUrl(base: "https://web.example.com", appVersionName: "1.0-한글 β😀")
        XCTAssertTrue(url.hasSuffix("&app=1.0-%ED%95%9C%EA%B8%80+%CE%B2%F0%9F%98%80"), url)
    }

    /// 기존 쿼리가 있는 base에도 테스트 진입 파라미터를 잇는다.
    func testAppendsTestEntryParametersToBaseWithExistingQuery() {
        XCTAssertEqual(
            "https://web.example.com?env=dev&bridge=\(bridgeContractVersion)&app=1.0"
                + "&screen=test&testVersion=v1&voiceSet=1&sessionId=s1",
            buildWebUrl(
                base: "https://web.example.com?env=dev",
                appVersionName: "1.0",
                testEntry: TestEntry(testVersion: "v1", voiceSet: 1, sessionId: "s1")
            )
        )
    }

    // MARK: - buildWebUrl: 공유 유입 계측 코드 전달 (KAN-32)

    /// 계측 코드는 인트로 URL의 맨 뒤에 붙는다.
    func testCampaignTokenIsAppendedAtTheEndOfTheIntroUrl() {
        XCTAssertEqual(
            "https://web.example.com?bridge=\(bridgeContractVersion)&app=1.0&c=kko_share",
            buildWebUrl(base: "https://web.example.com", appVersionName: "1.0", campaignToken: "kko_share")
        )
    }

    /// 테스트 진입 URL에도 계측 코드가 맨 뒤에 붙는다.
    func testCampaignTokenIsAppendedAtTheEndOfTheTestEntryUrl() {
        XCTAssertEqual(
            "https://web.example.com?bridge=\(bridgeContractVersion)&app=1.0"
                + "&screen=test&testVersion=v1&voiceSet=1&sessionId=s1&c=kko_share",
            buildWebUrl(
                base: "https://web.example.com",
                appVersionName: "1.0",
                testEntry: TestEntry(testVersion: "v1", voiceSet: 1, sessionId: "s1"),
                campaignToken: "kko_share"
            )
        )
    }

    /// 계측 코드가 없으면 c 파라미터 자체가 없다.
    func testNoCampaignTokenMeansNoCParameterAtAll() {
        XCTAssertFalse(buildWebUrl(base: "https://web.example.com", appVersionName: "1.0").contains("c="))
        XCTAssertEqual(
            buildWebUrl(base: "https://web.example.com", appVersionName: "1.0"),
            buildWebUrl(base: "https://web.example.com", appVersionName: "1.0", campaignToken: nil)
        )
    }

    /// 계측 코드도 URL 인코딩을 거친다.
    func testCampaignTokenIsUrlEncodedToo() {
        // 링크에서 온 값이라 형식을 앱이 보증하지 않는다 — 쿼리 구조를 깨뜨리면 안 된다.
        let url = buildWebUrl(base: "https://web.example.com", appVersionName: "1.0", campaignToken: "a b")
        XCTAssertTrue(url.hasSuffix("&c=a+b"))
    }

    // MARK: - webOrigin: allowlist 비교 입력 정규화 (§7)

    /// http https URL에서 origin을 뽑는다.
    func testExtractsOriginFromHttpAndHttpsUrls() {
        XCTAssertEqual("https://web.example.com", webOrigin("https://web.example.com/intro?x=1"))
        XCTAssertEqual("http://10.0.2.2:5173", webOrigin("http://10.0.2.2:5173/"))
    }

    /// 기본 포트는 표기 유무와 무관하게 같은 origin이다.
    func testDefaultPortsYieldTheSameOriginWhetherWrittenOrNot() {
        XCTAssertEqual(webOrigin("https://web.example.com"), webOrigin("https://web.example.com:443"))
        XCTAssertEqual(webOrigin("http://web.example.com"), webOrigin("http://web.example.com:80"))
    }

    /// http 계열이 아닌 스킴은 origin이 없다 - javascript file about.
    func testNonHttpSchemesHaveNoOrigin() {
        XCTAssertNil(webOrigin("javascript:alert(1)"))
        XCTAssertNil(webOrigin("file:///etc/passwd"))
        XCTAssertNil(webOrigin("about:blank"))
    }

    /// 파싱 불가능한 문자열은 origin이 없다.
    func testUnparsableStringsHaveNoOrigin() {
        XCTAssertNil(webOrigin("not a url"))
        XCTAssertNil(webOrigin(""))
    }

    // MARK: - isAllowedWebUrl: 보안 경계 (§7)

    /// allowlist 안의 origin만 허용한다.
    func testOnlyOriginsInsideTheAllowlistPass() {
        let allowed: Set<String> = ["https://web.example.com"]
        XCTAssertTrue(isAllowedWebUrl("https://web.example.com/intro", allowedOrigins: allowed))
        XCTAssertFalse(isAllowedWebUrl("https://evil.example.com/intro", allowedOrigins: allowed))
        // 스킴 다운그레이드 거부
        XCTAssertFalse(isAllowedWebUrl("http://web.example.com/intro", allowedOrigins: allowed))
        // 다른 포트 거부
        XCTAssertFalse(isAllowedWebUrl("https://web.example.com:8443/intro", allowedOrigins: allowed))
    }

    /// nil이나 origin이 없는 URL은 항상 거부한다.
    func testNilOrOriginlessUrlsAreAlwaysRejected() {
        let allowed: Set<String> = ["https://web.example.com"]
        XCTAssertFalse(isAllowedWebUrl(nil, allowedOrigins: allowed))
        XCTAssertFalse(isAllowedWebUrl("javascript:alert(1)", allowedOrigins: allowed))
    }

    /// 호스트 대소문자는 origin 비교에 영향을 주지 않는다.
    func testHostCaseDoesNotAffectOriginComparison() {
        XCTAssertTrue(
            isAllowedWebUrl("https://WEB.Example.com/intro", allowedOrigins: ["https://web.example.com"])
        )
    }

    // MARK: - externalUrlToOpen: 앱 밖으로 내보낼 URL (KAN-177)

    /// prod 도메인의 https 문서는 그대로 돌려준다.
    func testTheProdDocumentPassesThroughUnchanged() {
        XCTAssertEqual(
            "https://accentury.app/privacy.html",
            externalUrlToOpen("https://accentury.app/privacy.html")
        )
    }

    /// staging 호스트도 거절한다 - 방침은 정본이 하나이고 웹이 이 호스트를 보내지 않는다.
    /// ``appLinkOrigins``와 갈리는 지점이다: 저쪽은 앱으로 들어오는 경로라 staging이 필요하다.
    func testTheStagingHostIsRejectedToo() {
        XCTAssertNil(externalUrlToOpen("https://staging.accentury.app/privacy.html"))
    }

    /// 경로와 포트가 달라도 호스트만 맞으면 통과한다 — `isAllowedWebUrl`과 갈리는 지점이다.
    func testPathAndPortDoNotMatterOnlyTheHost() {
        XCTAssertEqual(
            "https://accentury.app/legal/privacy.html",
            externalUrlToOpen("https://accentury.app/legal/privacy.html")
        )
    }

    /// 목록 밖 호스트는 거절한다. 접미사 비교가 아니라 완전 일치다.
    func testHostsOutsideTheListAreRejected() {
        XCTAssertNil(externalUrlToOpen("https://evil.example.com/privacy.html"))
        XCTAssertNil(externalUrlToOpen("https://accentury.app.evil.example.com/privacy.html"))
    }

    /// https가 아니면 거절한다.
    func testNonHttpsSchemesAreRejected() {
        XCTAssertNil(externalUrlToOpen("http://accentury.app/privacy.html"))
        XCTAssertNil(externalUrlToOpen("javascript:alert(1)"))
        XCTAssertNil(externalUrlToOpen("accentury://privacy"))
    }

    /// 파서를 갈라 놓을 수 있는 문자는 거절한다 — 검사에 쓰는 `URLComponents`와 실제로 여는
    /// `URL`이 그 문자에서 host를 다르게 읽을 여지를 애초에 없앤다 (안드로이드와 같은 자리).
    func testCharactersThatCanSplitTheTwoParsersAreRejected() {
        XCTAssertNil(externalUrlToOpen("https://accentury.app@evil.example.com/privacy.html"))
        XCTAssertNil(externalUrlToOpen("https://accentury.app\\@evil.example.com/privacy.html"))
        XCTAssertNil(externalUrlToOpen("https://accentury.app/priv acy.html"))
        XCTAssertNil(externalUrlToOpen("https://accentury.app/privacy.html\n"))
    }

    /// 호스트에 percent-encoding이 있으면 거절한다 (KAN-199 #2).
    ///
    /// Foundation은 `%61`을 `a`로 풀어 `accentury.app`으로 읽고 통과시켰고, 안드로이드
    /// `java.net.URI`는 authority를 디코딩하지 않아 host가 nil이라 거절했다 — 같은 입력에
    /// 두 앱이 다르게 답하던 자리다. 안드로이드 `WebConfigTest.kt`에 같은 케이스가 있다.
    func testPercentEncodedHostsAreRejected() {
        XCTAssertNil(externalUrlToOpen("https://%61ccentury.app/privacy.html"))
        XCTAssertNil(externalUrlToOpen("https://accentury%2eapp/privacy.html"))
        // 경로의 percent-encoding은 정상이다 - 막는 것은 호스트뿐이다
        XCTAssertEqual(
            "https://accentury.app/privacy%20policy.html",
            externalUrlToOpen("https://accentury.app/privacy%20policy.html")
        )
    }

    /// 빈 값과 형식이 아닌 값은 거절한다.
    func testEmptyAndMalformedValuesAreRejected() {
        XCTAssertNil(externalUrlToOpen(nil))
        XCTAssertNil(externalUrlToOpen(""))
        XCTAssertNil(externalUrlToOpen("not a url"))
    }

    // MARK: - buildWebUrl: 홈 시작 (KAN-252)

    /// 홈 시작 URL은 스큐 파라미터 뒤에 screen home을 잇고 계측 코드는 맨 뒤다.
    func testHomeUrlAppendsScreenHomeAfterSkewParamsAndCampaignLast() {
        XCTAssertEqual(
            "https://web.example.com?bridge=\(bridgeContractVersion)&app=1.0&screen=home",
            buildWebUrl(base: "https://web.example.com", appVersionName: "1.0", home: true)
        )
        XCTAssertEqual(
            "https://web.example.com?bridge=\(bridgeContractVersion)&app=1.0&screen=home&c=abc",
            buildWebUrl(base: "https://web.example.com", appVersionName: "1.0", campaignToken: "abc", home: true)
        )
    }

    /// testEntry가 있으면 home은 무시되고 테스트 진입 URL 그대로다.
    func testHomeIsIgnoredWhenTestEntryIsPresent() {
        let entry = TestEntry(testVersion: "gn-1", voiceSet: 2, sessionId: "s-1")
        XCTAssertEqual(
            buildWebUrl(base: "https://web.example.com", appVersionName: "1.0", testEntry: entry),
            buildWebUrl(base: "https://web.example.com", appVersionName: "1.0", testEntry: entry, home: true)
        )
    }

    // MARK: - startsAtHome: 첫 문서 홈 판정 (KAN-252, PR #33 리뷰 P1)

    func test일반_실행은_홈이고_코드_없는_링크와_무효_코드_링크는_인트로다() {
        let allowed: Set<String> = ["https://accentury.app"]
        func entered(_ url: String?) -> Bool { parseAppLink(url, allowedOrigins: allowed) != nil }

        XCTAssertTrue(startsAtHome(tabBarEntry: true, introRequested: false, appLinkEntered: entered(nil)))
        XCTAssertFalse(startsAtHome(tabBarEntry: true, introRequested: false, appLinkEntered: entered("https://accentury.app/t")))
        XCTAssertFalse(startsAtHome(tabBarEntry: true, introRequested: false, appLinkEntered: entered("https://accentury.app/t?c=kko%20share")))
        XCTAssertFalse(startsAtHome(tabBarEntry: true, introRequested: false, appLinkEntered: entered("https://accentury.app/t?c=kko_share")))
    }

    func test재응시와_익명_빌드는_홈이_아니다() {
        XCTAssertFalse(startsAtHome(tabBarEntry: true, introRequested: true, appLinkEntered: false))
        XCTAssertFalse(startsAtHome(tabBarEntry: false, introRequested: false, appLinkEntered: false))
    }

    // MARK: - webBackTarget: 뒤로가기 판정 (KAN-252)

    private let app = "https://web.example.com/?bridge=2&app=1.0"
    private var home: String { "\(app)&screen=home" }

    /// 홈에서의 뒤로는 아무 일도 없다.
    func testBackFromHomeDoesNothing() {
        XCTAssertNil(webBackTarget(currentUrl: home, startRequested: false))
    }

    /// 탭 화면의 뒤로는 홈 문서다.
    func testBackFromTabScreensGoesHome() {
        for screen in ["intonation", "words", "translate"] {
            XCTAssertEqual(home, webBackTarget(currentUrl: "\(app)&screen=\(screen)", startRequested: false), screen)
        }
    }

    /// 시작을 누르기 전의 인트로는 홈으로, 누른 뒤는 아무 일도 없다.
    func testIntroGoesHomeOnlyBeforeStart() {
        XCTAssertEqual(home, webBackTarget(currentUrl: app, startRequested: false))
        XCTAssertNil(webBackTarget(currentUrl: app, startRequested: true))
    }

    /// 테스트 진행과 결과는 그대로 둔다.
    func testBackDuringTestAndResultDoesNothing() {
        XCTAssertNil(webBackTarget(
            currentUrl: "\(app)&screen=test&testVersion=gn-1&voiceSet=2&sessionId=s-1", startRequested: true
        ))
        XCTAssertNil(webBackTarget(currentUrl: "\(app)&screen=result&sessionId=s-1", startRequested: true))
        XCTAssertNil(webBackTarget(currentUrl: "\(app)&screen=result&sessionId=s-1", startRequested: false))
    }

    /// 홈으로 갈 때 계측 코드는 남기고 레벨테스트 값과 fragment는 지운다.
    func testBackKeepsCampaignAndDropsTestValues() {
        XCTAssertEqual(
            "https://web.example.com/?bridge=2&app=1.0&c=abc&screen=home",
            webBackTarget(currentUrl: "\(app)&screen=words&sessionId=s-1&c=abc#x", startRequested: false)
        )
    }

    /// 문서가 아직 없으면 아무 일도 없다.
    func testBackWithoutDocumentDoesNothing() {
        XCTAssertNil(webBackTarget(currentUrl: nil, startRequested: false))
    }

    // MARK: - webTabUrl: 탭 문서 조립 — 억양 녹음 ✕의 목적지 (KAN-252, 2026-10-13)

    /// 탭 문서는 screen만 바꾼다.
    func testTabUrlReplacesScreen() {
        XCTAssertEqual("\(app)&screen=intonation", webTabUrl(currentUrl: "\(app)&screen=intonation", screen: "intonation"))
        XCTAssertEqual("\(app)&screen=intonation", webTabUrl(currentUrl: home, screen: "intonation"))
        XCTAssertEqual("\(app)&screen=intonation", webTabUrl(currentUrl: app, screen: "intonation"))
    }

    /// 탭 문서는 레벨테스트 값을 지우고 계측 코드는 남기며 fragment를 뗀다.
    func testTabUrlKeepsCampaignAndDropsTestValues() {
        XCTAssertEqual(
            "https://web.example.com/?bridge=2&app=1.0&c=abc&screen=intonation",
            webTabUrl(
                currentUrl: "\(app)&screen=test&testVersion=gn-1&voiceSet=2&sessionId=s-1&c=abc#x", screen: "intonation"
            )
        )
    }

    /// 문서가 아직 없으면 탭 문서도 없다.
    func testTabUrlWithoutDocumentIsNil() {
        XCTAssertNil(webTabUrl(currentUrl: nil, screen: "intonation"))
    }

    // MARK: - showsSettingsGear: 로그인 빌드 톱니 판정 (KAN-252, 2026-10-13)

    /// 톱니는 인트로와 테스트 진행에서만 선다.
    func testGearShowsOnlyOnIntroAndTest() {
        XCTAssertTrue(showsSettingsGear(app))
        XCTAssertTrue(showsSettingsGear("\(app)&screen=test&testVersion=gn-1&voiceSet=2&sessionId=s-1"))
    }

    /// 탭 화면과 결과에서는 톱니가 없다.
    func testGearHiddenOnTabScreensAndResult() {
        for screen in ["home", "intonation", "words", "translate", "result"] {
            XCTAssertFalse(showsSettingsGear("\(app)&screen=\(screen)"), screen)
        }
    }

    /// 문서가 아직 없으면 톱니가 없다.
    func testGearHiddenWithoutDocument() {
        XCTAssertFalse(showsSettingsGear(nil))
    }
}
