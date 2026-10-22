package com.accentury.app.web

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WebConfigTest {

    // --- buildWebUrl: 스큐 협상 파라미터 (§5) ---

    @Test
    fun `로드 URL에 브리지 계약 버전과 앱 버전을 실어 보낸다`() {
        assertEquals(
            "https://web.example.com?bridge=$BRIDGE_CONTRACT_VERSION&app=1.0",
            buildWebUrl("https://web.example.com", "1.0"),
        )
    }

    @Test
    fun `기존 쿼리가 있으면 덮지 않고 뒤에 잇는다`() {
        assertEquals(
            "https://web.example.com?env=dev&bridge=$BRIDGE_CONTRACT_VERSION&app=1.0",
            buildWebUrl("https://web.example.com?env=dev", "1.0"),
        )
    }

    @Test
    fun `앱 버전 문자열은 URL 인코딩을 거친다`() {
        val url = buildWebUrl("https://web.example.com", "1.0 beta")
        assertFalse(url.contains(" "))
        assertTrue(url.contains("app=1.0"))
    }

    // --- buildWebUrl: 테스트 진입 URL 조립 (KAN-100) ---

    @Test
    fun `테스트 진입 URL은 스큐 파라미터에 screen test testVersion sessionId를 잇는다`() {
        assertEquals(
            "https://web.example.com?bridge=$BRIDGE_CONTRACT_VERSION&app=1.0" +
                "&screen=test&testVersion=gn-2026.08.1&voiceSet=7&sessionId=dev-session",
            buildWebUrl(
                base = "https://web.example.com",
                appVersionName = "1.0",
                testEntry = TestEntry(testVersion = "gn-2026.08.1", voiceSet = 7, sessionId = "dev-session"),
            ),
        )
    }

    @Test
    fun `testEntry가 없으면 인트로 URL과 완전히 같다`() {
        assertEquals(
            buildWebUrl("https://web.example.com", "1.0"),
            buildWebUrl("https://web.example.com", "1.0", testEntry = null),
        )
    }

    @Test
    fun `세션 값에 든 구분자는 인코딩돼 쿼리 구조를 깨뜨리지 않는다`() {
        val url = buildWebUrl(
            base = "https://web.example.com",
            appVersionName = "1.0",
            // 서버가 발급하는 값이라 형식을 앱이 보증하지 않는다 — 파라미터를 덧붙이는 꼴이 되면 안 된다.
            testEntry = TestEntry(testVersion = "gn 2026&x=1", voiceSet = 2, sessionId = "s/1?2"),
        )
        assertTrue(url.contains("&testVersion=gn+2026%26x%3D1&"))
        // 세트는 정수라 인코딩할 것이 없다 - 값이 그대로 실렸는지만 본다 (KAN-205)
        assertTrue(url.contains("&voiceSet=2&"))
        assertTrue(url.endsWith("&sessionId=s%2F1%3F2"))
    }

    @Test
    fun `기존 쿼리가 있는 base에도 테스트 진입 파라미터를 잇는다`() {
        assertEquals(
            "https://web.example.com?env=dev&bridge=$BRIDGE_CONTRACT_VERSION&app=1.0" +
                "&screen=test&testVersion=v1&voiceSet=1&sessionId=s1",
            buildWebUrl("https://web.example.com?env=dev", "1.0", TestEntry("v1", 1, "s1")),
        )
    }

    // --- buildWebUrl: 공유 유입 계측 코드 전달 (KAN-32) ---

    @Test
    fun `계측 코드는 인트로 URL의 맨 뒤에 붙는다`() {
        assertEquals(
            "https://web.example.com?bridge=$BRIDGE_CONTRACT_VERSION&app=1.0&c=kko_share",
            buildWebUrl("https://web.example.com", "1.0", campaignToken = "kko_share"),
        )
    }

    @Test
    fun `테스트 진입 URL에도 계측 코드가 맨 뒤에 붙는다`() {
        assertEquals(
            "https://web.example.com?bridge=$BRIDGE_CONTRACT_VERSION&app=1.0" +
                "&screen=test&testVersion=v1&voiceSet=1&sessionId=s1&c=kko_share",
            buildWebUrl("https://web.example.com", "1.0", TestEntry("v1", 1, "s1"), campaignToken = "kko_share"),
        )
    }

    @Test
    fun `계측 코드가 없으면 c 파라미터 자체가 없다`() {
        assertFalse(buildWebUrl("https://web.example.com", "1.0").contains("c="))
        assertEquals(
            buildWebUrl("https://web.example.com", "1.0"),
            buildWebUrl("https://web.example.com", "1.0", campaignToken = null),
        )
    }

    @Test
    fun `계측 코드도 URL 인코딩을 거친다`() {
        // 링크에서 온 값이라 형식을 앱이 보증하지 않는다 — 쿼리 구조를 깨뜨리면 안 된다.
        assertTrue(buildWebUrl("https://web.example.com", "1.0", campaignToken = "a b").endsWith("&c=a+b"))
    }

    // --- webOrigin: allowlist 비교 입력 정규화 (§7) ---

    @Test
    fun `http https URL에서 origin을 뽑는다`() {
        assertEquals("https://web.example.com", webOrigin("https://web.example.com/intro?x=1"))
        assertEquals("http://10.0.2.2:5173", webOrigin("http://10.0.2.2:5173/"))
    }

    @Test
    fun `기본 포트는 표기 유무와 무관하게 같은 origin이다`() {
        assertEquals(webOrigin("https://web.example.com"), webOrigin("https://web.example.com:443"))
        assertEquals(webOrigin("http://web.example.com"), webOrigin("http://web.example.com:80"))
    }

    @Test
    fun `http 계열이 아닌 스킴은 origin이 없다 - javascript file about`() {
        assertNull(webOrigin("javascript:alert(1)"))
        assertNull(webOrigin("file:///etc/passwd"))
        assertNull(webOrigin("about:blank"))
    }

    @Test
    fun `파싱 불가능한 문자열은 origin이 없다`() {
        assertNull(webOrigin("not a url"))
        assertNull(webOrigin(""))
    }

    // --- isAllowedWebUrl: 보안 경계 (§7) ---

    @Test
    fun `allowlist 안의 origin만 허용한다`() {
        val allowed = setOf("https://web.example.com")
        assertTrue(isAllowedWebUrl("https://web.example.com/intro", allowed))
        assertFalse(isAllowedWebUrl("https://evil.example.com/intro", allowed))
        assertFalse(isAllowedWebUrl("http://web.example.com/intro", allowed)) // 스킴 다운그레이드 거부
        assertFalse(isAllowedWebUrl("https://web.example.com:8443/intro", allowed)) // 다른 포트 거부
    }

    @Test
    fun `null이나 origin이 없는 URL은 항상 거부한다`() {
        val allowed = setOf("https://web.example.com")
        assertFalse(isAllowedWebUrl(null, allowed))
        assertFalse(isAllowedWebUrl("javascript:alert(1)", allowed))
    }

    @Test
    fun `호스트 대소문자는 origin 비교에 영향을 주지 않는다`() {
        assertTrue(isAllowedWebUrl("https://WEB.Example.com/intro", setOf("https://web.example.com")))
    }

    // --- externalUrlToOpen: 앱 밖으로 내보낼 URL (KAN-177) ---

    @Test
    fun `prod 도메인의 https 문서는 그대로 돌려준다`() {
        assertEquals(
            "https://accentury.app/privacy.html",
            externalUrlToOpen("https://accentury.app/privacy.html"),
        )
    }

    @Test
    fun `staging 호스트도 거절한다`() {
        /*
         * 방침은 법적 고지라 정본이 하나이고, 웹 상수가 환경과 무관하게 prod를 가리킨다
         * (privacyPolicy.ts). staging 빌드도 같은 문서를 열므로 웹은 이 호스트를 보내지
         * 않는다 — 목록에 두면 쓰지도 않는 문을 하나 더 여는 셈이다.
         *
         * APP_LINK_ORIGINS와 갈리는 지점이다. 저쪽은 링크로 앱에 들어오는 경로라
         * staging이 필요하고, 이쪽은 앱 밖으로 나가는 경로라 필요 없다.
         */
        assertNull(externalUrlToOpen("https://staging.accentury.app/privacy.html"))
    }

    @Test
    fun `경로와 포트가 달라도 호스트만 맞으면 통과한다`() {
        // isAllowedWebUrl과 갈리는 지점이다 - 저쪽은 origin 일치, 이쪽은 호스트 일치다
        assertEquals("https://accentury.app/legal/privacy.html", externalUrlToOpen("https://accentury.app/legal/privacy.html"))
    }

    @Test
    fun `목록 밖 호스트는 거절한다`() {
        assertNull(externalUrlToOpen("https://evil.example.com/privacy.html"))
        // 서브도메인을 흘리지 않는다 - suffix 비교가 아니라 완전 일치다
        assertNull(externalUrlToOpen("https://accentury.app.evil.example.com/privacy.html"))
    }

    @Test
    fun `https가 아니면 거절한다`() {
        assertNull(externalUrlToOpen("http://accentury.app/privacy.html"))
        assertNull(externalUrlToOpen("javascript:alert(1)"))
        assertNull(externalUrlToOpen("intent://accentury.app/privacy.html#Intent;end"))
        assertNull(externalUrlToOpen("accentury://privacy"))
    }

    @Test
    fun `파서를 갈라 놓을 수 있는 문자는 거절한다`() {
        /*
         * java.net.URI가 읽는 호스트와 android.net.Uri가 여는 호스트가 갈릴 여지를 막는다.
         * userinfo 꼴에서 URI는 host를 evil.example.com으로 읽지만, 그 판정에 기대는 것 자체가
         * 파서 두 개의 일치에 기대는 것이다 - 방침 URL에는 애초에 없는 문자들이다.
         */
        assertNull(externalUrlToOpen("https://accentury.app@evil.example.com/privacy.html"))
        assertNull(externalUrlToOpen("https://accentury.app\\@evil.example.com/privacy.html"))
        assertNull(externalUrlToOpen("https://accentury.app/priv acy.html"))
        assertNull(externalUrlToOpen("https://accentury.app/privacy.html\n"))
    }

    @Test
    fun `호스트에 percent-encoding이 있으면 거절한다`() {
        /*
         * KAN-199 #2. iOS Foundation은 %61을 a로 풀어 accentury.app으로 읽고 통과시켰고
         * java.net.URI는 authority를 디코딩하지 않아 host가 null이라 거절했다 — 같은 입력에
         * 두 앱이 다르게 답하던 자리다. 이제 양쪽 다 명시적으로 거절한다.
         *
         * iOS `WebConfigTests.swift`에 같은 케이스가 있다. 한쪽만 고치면 계약이 다시 갈린다.
         */
        assertNull(externalUrlToOpen("https://%61ccentury.app/privacy.html"))
        assertNull(externalUrlToOpen("https://accentury%2eapp/privacy.html"))
        // 경로의 percent-encoding은 정상이다 - 막는 것은 호스트뿐이다
        assertEquals(
            "https://accentury.app/privacy%20policy.html",
            externalUrlToOpen("https://accentury.app/privacy%20policy.html"),
        )
    }

    @Test
    fun `빈 값과 형식이 아닌 값은 거절한다`() {
        assertNull(externalUrlToOpen(null))
        assertNull(externalUrlToOpen(""))
        assertNull(externalUrlToOpen("not a url"))
    }


    // --- buildWebUrl: 홈 시작 (KAN-252) ---

    @Test
    fun `홈 시작 URL은 스큐 파라미터 뒤에 screen home을 잇고 계측 코드는 맨 뒤다`() {
        assertEquals(
            "https://web.example.com?bridge=$BRIDGE_CONTRACT_VERSION&app=1.0&screen=home",
            buildWebUrl("https://web.example.com", "1.0", home = true),
        )
        assertEquals(
            "https://web.example.com?bridge=$BRIDGE_CONTRACT_VERSION&app=1.0&screen=home&c=abc",
            buildWebUrl("https://web.example.com", "1.0", campaignToken = "abc", home = true),
        )
    }

    @Test
    fun `testEntry가 있으면 home은 무시되고 테스트 진입 URL 그대로다`() {
        val entry = TestEntry(testVersion = "gn-1", voiceSet = 2, sessionId = "s-1")
        assertEquals(
            buildWebUrl("https://web.example.com", "1.0", testEntry = entry),
            buildWebUrl("https://web.example.com", "1.0", testEntry = entry, home = true),
        )
    }

    // --- startsAtHome: 첫 문서 홈 판정 (KAN-252, PR #33 리뷰 P1) ---

    @Test
    fun `일반 실행은 홈, 코드 없는 링크와 무효 코드 링크는 인트로다`() {
        val allowed = setOf("https://accentury.app")
        fun entered(url: String?) = parseAppLink(url, allowed) != null

        assertTrue(startsAtHome(tabBarEntry = true, introRequested = false, appLinkEntered = entered(null)))
        assertFalse(startsAtHome(tabBarEntry = true, introRequested = false, appLinkEntered = entered("https://accentury.app/t")))
        assertFalse(
            startsAtHome(tabBarEntry = true, introRequested = false, appLinkEntered = entered("https://accentury.app/t?c=kko%20share")),
        )
        assertFalse(startsAtHome(tabBarEntry = true, introRequested = false, appLinkEntered = entered("https://accentury.app/t?c=kko_share")))
    }

    @Test
    fun `재응시와 익명 빌드는 홈이 아니다`() {
        assertFalse(startsAtHome(tabBarEntry = true, introRequested = true, appLinkEntered = false))
        assertFalse(startsAtHome(tabBarEntry = false, introRequested = false, appLinkEntered = false))
    }

    // --- webBackTarget: 시스템 뒤로가기 판정 (KAN-252) ---

    private val app = "https://web.example.com/?bridge=2&app=1.0"
    private val home = "$app&screen=home"

    @Test
    fun `홈에서의 뒤로는 가로채지 않는다 - 앱 종료`() {
        assertNull(webBackTarget(home, startRequested = false))
    }

    @Test
    fun `탭 화면의 뒤로는 홈 문서다`() {
        listOf("intonation", "words", "translate").forEach { screen ->
            assertEquals(home, webBackTarget("$app&screen=$screen", startRequested = false))
        }
    }

    @Test
    fun `시작을 누르기 전의 인트로는 홈으로, 누른 뒤는 가로채지 않는다`() {
        assertEquals(home, webBackTarget(app, startRequested = false))
        assertNull(webBackTarget(app, startRequested = true))
    }

    @Test
    fun `테스트 진행과 결과는 가로채지 않는다`() {
        assertNull(webBackTarget("$app&screen=test&testVersion=gn-1&voiceSet=2&sessionId=s-1", startRequested = true))
        assertNull(webBackTarget("$app&screen=result&sessionId=s-1", startRequested = true))
        assertNull(webBackTarget("$app&screen=result&sessionId=s-1", startRequested = false))
    }

    @Test
    fun `홈으로 갈 때 계측 코드는 남기고 레벨테스트 값은 지운다`() {
        assertEquals(
            "https://web.example.com/?bridge=2&app=1.0&c=abc&screen=home",
            webBackTarget("$app&screen=words&sessionId=s-1&c=abc#x", startRequested = false),
        )
    }

    @Test
    fun `문서가 아직 없으면 가로채지 않는다`() {
        assertNull(webBackTarget(null, startRequested = false))
    }

    // --- webTabUrl: 탭 문서 조립 — 억양 녹음 ✕의 목적지 (KAN-252, 2026-10-13) ---

    @Test
    fun `탭 문서는 screen만 바꾼다`() {
        assertEquals("$app&screen=intonation", webTabUrl("$app&screen=intonation", "intonation"))
        assertEquals("$app&screen=intonation", webTabUrl(home, "intonation"))
        assertEquals("$app&screen=intonation", webTabUrl(app, "intonation"))
    }

    @Test
    fun `탭 문서는 레벨테스트 값을 지우고 계측 코드는 남기며 fragment를 뗀다`() {
        assertEquals(
            "https://web.example.com/?bridge=2&app=1.0&c=abc&screen=intonation",
            webTabUrl("$app&screen=test&testVersion=gn-1&voiceSet=2&sessionId=s-1&c=abc#x", "intonation"),
        )
    }

    @Test
    fun `문서가 아직 없으면 탭 문서도 없다`() {
        assertNull(webTabUrl(null, "intonation"))
    }

    // --- showsSettingsGear: 로그인 빌드 톱니 판정 (KAN-252, 2026-10-13) ---

    @Test
    fun `톱니는 인트로와 테스트 진행에서만 선다`() {
        assertTrue(showsSettingsGear(app))
        assertTrue(showsSettingsGear("$app&screen=test&testVersion=gn-1&voiceSet=2&sessionId=s-1"))
    }

    @Test
    fun `탭 화면과 결과에서는 톱니가 없다`() {
        listOf("home", "intonation", "words", "translate", "result").forEach { screen ->
            assertFalse(screen, showsSettingsGear("$app&screen=$screen"))
        }
    }

    @Test
    fun `문서가 아직 없으면 톱니가 없다`() {
        assertFalse(showsSettingsGear(null))
    }

    // --- spaNavigateJs: 앱 안 이동을 웹 SPA 라우터에 맡기는 JS (KAN-290) ---

    @Test
    fun `SPA 이동 JS는 accenturyNavigate를 URL 리터럴로 부른다`() {
        val js = spaNavigateJs("https://web.example.com/?screen=home")
        assertTrue(js.contains("window.accenturyNavigate"))
        assertTrue(js.endsWith("(\"https://web.example.com/?screen=home\")"))
    }

    @Test
    fun `SPA 이동 JS는 따옴표·역슬래시·script 닫는 태그를 이스케이프한다`() {
        val js = spaNavigateJs("a\"b\\c</script>")
        assertTrue(js.endsWith("(\"a\\\"b\\\\c\\u003c/script>\")"))
        assertFalse(js.contains("</script>"))
    }

    @Test
    fun `SPA 이동 JS는 줄바꿈과 줄 구분자를 이스케이프한다`() {
        val js = spaNavigateJs("a\nb\rc\u2028d\u2029e")
        assertTrue(js.endsWith("(\"a\\nb\\rc\\u2028d\\u2029e\")"))
        assertFalse(js.contains('\n'))
    }
}
