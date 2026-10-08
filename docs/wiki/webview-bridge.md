# WebView 브리지 계약 (정본)

앱 안에서 화면을 그리는 것은 웹(`web/`)이고, 마이크·녹음·공유·계측처럼 브라우저가 할 수 없는
일은 네이티브가 한다. 그 둘이 주고받는 창구가 브리지다. **이 문서가 계약의 정본이다** — 메서드를
더하거나 payload를 바꾸는 사람은 여기 표를 먼저 고친다.

설계 배경과 결정 이력(왜 원격 전용인가, 왜 CloudFront인가, 스탠드얼론 웹 판정 규칙 등)은
`~/accentury/docs/wiki/webview-layer.md`에 있다. 그쪽은 이력 장부이고, **계약의 현재 모습은
이 문서가 말한다.** 두 문서가 어긋나면 이 문서가 맞다.

## 1. 계약 버전 규칙

| 변경 | 버전 |
|---|---|
| 메서드·필드·수신 슬롯 **추가** | 그대로 (하위호환) |
| 메서드·필드 **삭제**, 의미·payload 모양 **변경** | +1 |

현재 버전은 **2**이다. 정본 상수는 세 곳에 있고 값이 같아야 한다:

| 플랫폼 | 위치 |
|---|---|
| 웹 (요구 버전) | `web/src/bridge/bridge.ts` `REQUIRED_BRIDGE_VERSION` |
| Android (보유 버전) | `app/src/main/java/com/accentury/app/web/WebConfig.kt` `BRIDGE_CONTRACT_VERSION` |
| iOS (보유 버전) | `ios/AccenturyCore/Sources/AccenturyCore/Web/WebConfig.swift` `bridgeContractVersion` |

1 → 2는 KAN-205다. 진입 URL에 `voiceSet`이 필수가 됐다 - 서버가 세션마다 음성 문항 세트를
고르므로(§3.1) 웹이 그 값 없이는 문항을 조회할 수 없다. 파라미터 추가지만 웹이 **요구**하는
쪽이라 구버전 앱에게는 의미 변경이고, 버전을 올리지 않으면 세트를 싣지 않는 앱이 스큐 게이트를
통과한 뒤 문항 화면에서 빠져나오지 못한다.

**스큐 판정의 주체는 웹이다.** 앱은 로드 URL에 `?bridge=<보유 버전>`을 실어 보내기만 하고,
그 값이 요구 버전보다 낮으면 웹이 업데이트 안내 화면을 띄운다. 그래서 구버전 앱을 고치지 않고도
판정이 선다.

메서드 추가가 버전을 올리지 않는다는 규칙의 대가는 **웹 래퍼가 없는 메서드를 스스로 처리해야
한다**는 것이다. `bridge.ts`의 래퍼는 전부 `typeof bridge?.foo !== 'function'`이면 `false`를
돌려주고, 호출자가 폴백으로 내려간다.

## 2. web → native (`window.AccenturyBridge`)

| 메서드 | 티켓 | 하는 일 | 없을 때 웹의 폴백 |
|---|---|---|---|
| `getContractVersion(): number` | KAN-97 | 앱이 보유한 계약 버전. 동기 반환 | 스큐 협상 이전 앱으로 본다 |
| `getSessionToken(): string` | KAN-13 | 어휘 답안 제출의 `Authorization` 헤더에 실을 토큰. 동기 반환. origin이 allowlist 밖이면 빈 문자열 | 빈 값은 `null`로 정규화 → 제출 불가 |
| `requestMicPermission()` | KAN-98 | 네이티브 마이크 권한 게이트를 연다 | 웹이 직접 `getUserMedia` |
| `startVoiceItem(payloadJson)` | KAN-100 | 네이티브 녹음 화면으로 전환. payload = `{itemId, prompt, itemNumber, totalItems, maxDurationMs, guideF0}` | 웹 녹음기(`WebVoiceRecorder`) |
| `startRetest()` | KAN-34 | 이전 세션·결과를 버리고 새 세션으로 인트로 리로드. **인자 없음** — 폐기할 토큰은 네이티브가 들고 있다 | 쿼리를 걷어내고 인트로로 (`goToIntro`) |
| `startRetestAfterFailure()` | KAN-248 | 실패 출구의 재응시. `startRetest`와 같되 **보상형 광고만 건너뛴다**. 인자도 회신 규칙 차이도 없다 (§8.6) | `startRetest()` — 구버전 앱에서는 광고가 떠도 감수. 그것도 없으면 `goToIntro` |
| `shareResult(payloadJson)` | KAN-30 | 카카오 피드 템플릿으로 공유. payload = `{imageUrl, text, webTestUrl}` — 점수·세션 id·등급 코드 없음 | `navigator.share` → 링크 복사 |
| `logEvent(name, paramsJson)` | KAN-33 | 계측 이벤트를 네이티브 Firebase로. 앱 안 이벤트를 웹 gtag로 보내면 앱 사용자가 웹 트래픽으로 세어진다 | gtag 경로 |
| `openExternalUrl(url)` | KAN-177 | 앱 **밖** 브라우저로 링크를 연다 (§4) | `<a>`의 기본 동작 |
| `getAdConsent(): string` | KAN-196 | 맞춤형 광고 동의 상태. `'granted' \| 'denied' \| 'unknown'` 중 하나를 동기 반환 (§8). origin이 allowlist 밖이면 `getSessionToken`처럼 빈 문자열 | 래퍼 `readAdConsent()`가 null — 시트도 링크도 광고 라벨도 없다. 계약 밖 문자열도 null |
| `setAdConsent(state)` | KAN-196 | 동의를 네이티브 저장소에 쓴다. 인자는 `'granted' \| 'denied'` — `'unknown'`으로 되돌리는 길은 없다 | 래퍼 false. `readAdConsent()`가 null인 실행에서는 애초에 부르지 않는다 |
| `showInterstitialAd()` | KAN-196 | 분석 대기 화면의 전면 광고. **인자도 회신도 없다** (`shareResult`와 같은 규칙) | 래퍼 false — 광고 없이 대기 화면만 |
| `haptic(type)` | KAN-258 | 가벼운 탭·성공·실패 햅틱. 인자는 `'tap' \| 'success' \| 'error'`, 그 밖은 네이티브가 무시. 회신 없음. OS 「터치 진동」 설정을 따른다 (§9) | 래퍼 false — 무동작 (브라우저 단독·구버전 앱) |
| `getAccessToken(): string` | KAN-255 | 계정 Access 토큰. 단어 학습 API(`/v0/learning/word-*`)의 `Authorization`에 싣는다. 동기 반환. 로그인 안 됨·로그인 끈 빌드·origin 불허면 빈 문자열 (§11). Android: `AccenturyBridge.getAccessToken` ← `MainActivity` TestFlow의 `currentAccessToken()`. iOS: `BridgeUserScript`의 문서 변수 `accessToken` ← `WebViewCoordinator.pushAccessToken` ← `TestFlowView`의 `readAccessToken` | 빈 값은 `null`로 정규화 → 네트워크 전에 `CLIENT_NOT_SIGNED_IN` |
| `refreshAccessToken()` | KAN-255 | 계정 토큰 갱신 요청. **fire-and-forget** — 결과는 `onAccessTokenRefreshed`로 온다 (§11). Android: `AccenturyBridge.refreshAccessToken` → `MainActivity` TestFlow의 `refreshAccessToken()`. iOS: `BridgeDispatcher` `case "refreshAccessToken"` → `WebViewCoordinator.refreshAccessTokenForWeb` → `TestFlowView`의 `refreshAccessToken` | 래퍼 `refreshAccessToken()`이 즉시 false → `UNAUTHENTICATED` |

`@JavascriptInterface`·`postMessage`는 문자열만 주고받으므로 구조체는 JSON으로 직렬화해 넘긴다.

서버가 앞서 보관한 음성을 잃어 업로드를 거절했을 때 앞 문항 녹음 화면을 다시 여는 일은 이 표에 메서드를 더하지 않고 양쪽이 각자 한다 (§10).

## 3. native → web (`window.AccenturyWeb`)

| 슬롯 | 티켓 | 하는 일 |
|---|---|---|
| `onItemResult(payloadJson)` | KAN-100 | 네이티브 녹음이 끝난 문항 결과 |
| `onRetestFailed(payloadJson)` | KAN-34 | 재응시 실패 (`startRetest`·`startRetestAfterFailure` 공통). **성공은 오지 않는다** — 성공하면 페이지가 리로드된다. KAN-196부터 보상형 광고를 중간에 닫은 경우도 이 슬롯이다: `{code:'AD_DISMISSED', message:'광고를 끝까지 보시면 다시 테스트할 수 있어요', retryable:true, retryAfterMs:null}` (§8) |
| `onAccessTokenRefreshed(result)` | KAN-255 | `refreshAccessToken()`의 결과. 인자는 JSON이 아니라 문자열 `'ok' \| 'failed'` 그대로다 (§11) |

슬롯 단위로 갈아끼운다. 객체를 통째로 교체하면 나중에 설치한 수신자가 먼저 설치된 것을 지운다.

보관 음성 유실 복구(§10)에서 다시 녹음한 앞 문항의 결과도 이 `onItemResult`로 들어온다. 웹은 그 결과를 이미 제출된 문항의 것으로 보고 진행에 반영하지 않는다.

분석 대기 화면의 재녹음(KAN-271)도 같은 두 메서드만 쓴다. [다시 녹음]을 누르면 웹이 실패 문항 대기열(누른 문항 먼저, 나머지 seq 순)을 세우고, 문항마다 `startVoiceItem` → `onItemResult`를 받은 뒤 다음 문항의 `startVoiceItem`을 보낸다 — 첫 응시에서 음성 문항이 연달아 나올 때와 같은 순서다. 마지막 결과 뒤 웹은 대기 화면으로 돌아간다. 페이로드의 `itemNumber`·`totalItems`는 첫 응시와 같은 값이다. 네이티브 변경은 없다. 네이티브 업로드가 문항 시도 상한(429 `RATE_RETAKE_EXCEEDED`)에 걸려 녹음 화면을 닫으면 웹은 그 실패를 듣지 못하므로, 이 재녹음 화면의 대기 푸터에는 [녹음 화면 다시 열기] 아래 [다시 테스트하기]가 늘 함께 선다(첫 응시·진행 중 복구 화면에는 없다, KAN-147). 재녹음 도중 프로세스가 복원되면 웹은 대기열 없이 대기 화면으로 돌아오고, 그 뒤 도착한 `onItemResult`는 대기 화면의 폴링을 다시 세운다.

## 4. `openExternalUrl` — 외부 링크 (KAN-177)

인트로 하단의 개인정보처리방침 링크가 이 창구를 쓴다. 앱에 설정 화면이 없어 **방침으로 가는
길이 이것뿐이고**, Google Play는 스토어 등록 정보뿐 아니라 앱 안에서도 방침을 볼 수 있기를
요구한다.

### 왜 웹이 직접 못 여는가

두 길이 다 막혀 있다.

- **WebView 안에서 이동** — allowlist(§7)에 걸린다. 디버그·시뮬레이터 빌드의 origin은 로컬
  Vite(`http://10.0.2.2:5173`)라 우리 도메인의 방침 문서가 로드 차단 대상이다. 통과하는
  prod에서도 문제가 남는다: 인트로가 사라지는데 **돌아올 길이 없다.** Android는 시스템
  뒤로가기를 WebView back으로 넘기는 코드가 없어 액티비티가 닫히고, iOS에는 시스템 뒤로가기
  자체가 없다.
- **`target="_blank"`** — 앱 안에서 아무 일도 하지 않는다. Android는
  `setSupportMultipleWindows`가 꺼져 있고, iOS `WKWebView`에는 `uiDelegate`가 없어 새 웹뷰를
  만들 주체가 없다. 오류도 나지 않아서 "눌렀는데 아무 일 없음"으로만 보인다.

그래서 **여는 주체를 네이티브로 옮긴다.** 앱 화면 위에 시트를 덮으므로 닫으면 인트로가 그대로
남는다.

| 플랫폼 | 여는 방법 | 파일 |
|---|---|---|
| Android | Chrome Custom Tabs (`androidx.browser`) | `app/src/main/java/com/accentury/app/web/ExternalBrowser.kt` |
| iOS | `SFSafariViewController` | `ios/Accentury/Web/ExternalBrowser.swift` |
| 스탠드얼론 웹 | `<a target="_blank">` (브리지가 없으므로 기본 동작) | `web/src/legal/PrivacyNotice.tsx` |

시스템 브라우저를 `ACTION_VIEW`·`UIApplication.open`으로 띄우지 않는 이유는 앱을 떠나기
때문이다 — 사용자가 앱 전환기를 거쳐 돌아와야 한다. 툴바 색은 두 플랫폼 모두 팔레트 정본
(Compose `LightBackground` / `Papercut.cream`)에서 가져온다. 시트 색이 갈리면 앱을 벗어난 것처럼
읽히는데, 실제로는 앱 위에 덮인 창이라 그 인상이 사실과 다르다.

### 네이티브가 URL을 다시 보는 이유

**여는 주소를 정하는 쪽이 웹이다.** WebView에 실린 스크립트가 부르는 메서드라, 넘어온 값을
그대로 열면 앱이 아무 주소나 여는 창구가 된다. 그래서 호스트 목록으로 다시 좁힌다.

| 함수 | 판정 단위 | 대상 |
|---|---|---|
| `isAllowedWebUrl` (§7) | origin (스킴+호스트+포트) | WebView가 **로드할** URL |
| `externalUrlToOpen` (KAN-177) | 호스트 | 앱 밖으로 **내보낼** URL |

호스트 단위인 이유: 포트·경로는 문서마다 다를 수 있어서 origin 일치를 요구하면 방침 문서를
옮기는 날 링크가 조용히 죽는다. 허용 호스트는 **`accentury.app` 하나뿐**이고, 접미사 비교가
아니라 완전 일치다(`accentury.app.evil.example.com`은 거절).

`staging.accentury.app`은 **일부러 뺐다.** 방침은 정본이 하나여야 해서 웹 상수가 환경과 무관하게
prod를 가리키고(아래 참조), staging 빌드도 같은 문서를 연다 — 그러니 웹이 이 호스트를 보낼 일이
없고, 목록에 두면 쓰지도 않는 문을 하나 더 여는 셈이다. App Links의 `APP_LINK_ORIGINS` /
`appLinkOrigins`에 staging이 있는 것과 혼동하지 말 것: **저쪽은 링크로 앱에 들어오는 경로**라
릴리스 전 확인에 staging 버킷이 필요하고, 이쪽은 앱 밖으로 나가는 경로라 필요 없다.

거절 규칙:

- **https만.** 방침 문서는 어느 환경에서도 HTTPS로 선다. `javascript:`·`intent:`·앱 스킴은
  host가 없어 자동으로 걸린다
- **`user@host`·역슬래시·공백·제어문자 거절.** 근거가 두 플랫폼에서 다르다 (KAN-199 #2에서
  정정). 안드로이드는 검사하는 `java.net.URI`와 여는 `android.net.Uri`가 **진짜 다른 구현**이라
  그 문자들에서 host가 갈릴 여지가 있다. iOS는 검사하는 `URLComponents`와 여는 `URL`이 둘 다
  Foundation이라 같은 호스트를 준다 — 검사한 곳과 여는 곳이 어긋나지 않는다. 그래도 양쪽 다
  막는 이유는 방침 URL에 애초에 없는 문자이고, 두 앱이 같은 입력에 같은 답을 내야 계약이
  하나로 남기 때문이다
- **호스트의 `%` 거절.** 같은 입력에 두 앱이 다르게 답하던 자리다 (KAN-199 #2, 2026-09-08 실행 확인).

  | 입력 | 안드로이드 `java.net.URI` | iOS Foundation |
  |---|---|---|
  | `https://%61ccentury.app/privacy.html` | `getHost()` = null → 거절 | `accentury.app` → 통과였다 |
  | `https://accentury%2eapp/privacy.html` | `getHost()` = null → 거절 | `accentury.app` → 통과였다 |

  `java.net.URI`는 authority를 디코딩하지 않고 Foundation은 한다. **어느 쪽도 우회는 아니다** —
  양쪽 다 자기가 검사한 호스트를 그대로 열기 때문에 검사와 실행이 어긋나지 않는다. 보안 결함이
  아니라 동작 불일치라, 이제 양쪽이 명시적으로 거절한다: 안드로이드는 `rawAuthority`에 `%`가
  있으면, iOS는 `percentEncodedHost`에 `%`가 있으면. iOS에서 `host`가 아니라
  `percentEncodedHost`를 보는 이유는 `host`가 이미 디코딩된 값이라 `%`가 남지 않아서다.
  경로의 percent-encoding은 그대로 통과한다 — 막는 것은 호스트뿐이다. 두 레포의 테스트에
  같은 케이스가 들어 있다 (`WebConfigTest.kt` · `WebConfigTests.swift`)

검증에 실패하거나 origin이 allowlist 밖이면 **조용히 아무 일도 하지 않고** Crashlytics에 흔적만
남긴다(`bridge_parse_failed: openExternalUrl`). 웹은 오류를 되돌려 줄 상대가 아니고, 인트로에서
대신 할 수 있는 일도 없다.

### 정책 URL은 한 곳에만 있다

`web/src/legal/privacyPolicy.ts`의 `DEFAULT_PRIVACY_POLICY_URL`이 정본이다. **환경과 무관하게
언제나 이 주소** — staging 빌드도 여기를 연다.

```
https://accentury.app/privacy.html
```

환경별로 가르지 않는 이유는 방침이 **법적 고지**이기 때문이다. staging 웹을 쓰는 사람에게도
실제로 적용되는 것은 prod에 게시된 그 문서이고, 환경마다 다른 사본을 가리키면 "화면이 가리키는
문서"와 "실제로 고지된 문서"가 어긋난다. 빌드 산출물이 환경을 몰라야 한다는 원칙(KAN-127)과도
같은 방향이라, 배포 워크플로는 이 값을 넘기지 않는다 — `.github/workflows/web-deploy.yml`이
환경을 아는 값으로 두는 것은 GA4 측정 ID 하나뿐이다.

`VITE_PRIVACY_POLICY_URL`은 그 원칙의 예외가 아니라 **로컬 확인용 손잡이**다. 게시 전 본문을
브라우저에서 보고 싶을 때 staging 문서를 잠깐 가리키는 식으로 쓴다. 위 allowlist가 prod 호스트만
허용하므로 **앱 안에서는 다른 주소를 넣어도 열리지 않는다.**

**`.html`은 취향이 아니라 계약이다.** CloudFront SPA 재작성 함수가 마지막 경로 조각에 점이 없으면
`/index.html`로 돌리므로, `/privacy`는 **200을 주면서** 정책 문서가 아니라 앱 화면을 띄운다
(KAN-133, 2026-09-04 staging 실측). 오류가 남지 않는 실패라 눌러 보기 전에는 아무도 모른다 —
`privacyPolicy.test.ts`가 이 한 줄을 붙든다.

문서 본문과 게시 경로는 `privacy-policy.md`를 본다.

## 5. 보안 규칙 (양 플랫폼 공통)

- **allowlist가 곧 보안 경계다.** 브리지가 마이크 권한 게이트를 열고 세션 토큰을 건네므로,
  allowlist 밖 URL은 WebView 로드도 브리지 실행도 막는다
- **검사 순서가 신뢰 경계다** — origin 먼저, 파싱은 그 뒤. allowlist 밖 페이지가 보낸 payload는
  내용과 무관하게 처리할 값이 아니다
- **호출 시점이 아니라 처리 시점의 URL로 판정한다.** 메시지를 보낸 뒤 페이지가 allowlist 밖으로
  리다이렉트될 수 있다
- **불량 payload는 조용히 버린다.** 웹은 오류를 되돌려 줄 상대가 아니고(신뢰 경계 밖), 잘못된
  컨텍스트로 화면을 띄우는 것보다 아무 일도 안 하는 편이 안전하다. 대신 Crashlytics 비치명
  이벤트로 남긴다 — allowlist를 통과한 페이지만 거기 닿으므로, 그 보고는 곧 **우리 웹과 우리
  앱이 계약을 다르게 알고 있다**는 뜻이다

## 6. 플랫폼별 구현 차이

| | Android | iOS |
|---|---|---|
| 주입 | `addJavascriptInterface`로 Kotlin 객체를 그대로 심는다 | 브리지 객체를 **JS 소스로 적어** `WKUserScript(.atDocumentStart)`로 심는다 |
| 동기 반환 | 공짜 — JS가 곧바로 Kotlin을 부른다 | JS 안의 값을 읽는다. `WKScriptMessageHandler`는 단방향·비동기라 값을 되돌릴 수 없다 |
| 스레드 | `@JavascriptInterface`는 **JS 전용 스레드** → `View.post`로 메인에 넘긴 뒤 검증 | WebKit이 메인 스레드에서 부른다 → 넘기는 단계가 없다 |
| 파일 | `web/AccenturyBridge.kt` | `Web/AccenturyBridge.swift` + `Web/BridgeUserScript.swift` |

iOS의 계정 Access 토큰(`getAccessToken`, KAN-255)도 세션 토큰·광고 동의와 같은 구조로 심는다 — 문서 변수 +
`__accenturySetAccessToken` setter + 대기 자리. 네이티브가 문서 커밋 때(Keychain을 새로 읽어)와 갱신 성공 직후에 민다 (§11).

**계약 메서드를 더할 때 iOS는 파일이 둘이다** — 디스패처의 `case`와 주입 JS의 객체 리터럴을 함께
고쳐야 한다. 웹 쪽 `bridge.ts`는 이 차이를 모른다.

## 7. 계약을 바꿀 때 고칠 곳

메서드를 하나 더할 때 손대는 자리 전부다 (KAN-177이 실제로 지나간 경로. KAN-196은 웹 쪽
1·7·테스트를 2단계에서 끝냈고 2~6은 3·4단계가 지나간다).

| 순서 | 파일 |
|---|---|
| 1 | `web/src/bridge/bridge.ts` — 인터페이스 + 래퍼 |
| 2 | `app/src/main/java/com/accentury/app/web/AccenturyBridge.kt` — `@JavascriptInterface` + 생성자 파라미터 |
| 3 | `app/src/main/java/com/accentury/app/web/WebViewHost.kt` · `MainActivity.kt` — 콜백 배선 |
| 4 | `ios/Accentury/Web/BridgeUserScript.swift` — 주입 JS 객체 |
| 5 | `ios/Accentury/Web/AccenturyBridge.swift` — 디스패처 `case` + 필드 |
| 6 | `ios/Accentury/Web/WebViewHost.swift`(3계층) · `TestFlow/TestFlowView.swift` — 콜백 배선 |
| 7 | 이 문서 §2 표 |

KAN-255는 웹 쪽 1·7·테스트를 1단계에서 끝냈고, Android(2·3, 4단계)·iOS(4~6, 5단계) 완료 (§11).

테스트도 같은 수만큼 늘어난다: `bridge.test.ts`, `AccenturyBridgeTest.kt`,
`AccenturyBridgeTests.swift`, `BridgeUserScriptTests.swift`(메서드 목록).

웹 쪽에서 메서드의 **유무**를 보고 화면을 가르는 자리도 있다 — 동의 시트·「맞춤형 광고 설정」
링크·[광고 보고 다시 테스트하기] 라벨이 그렇다 (§8). 앱 실행에서 `getAdConsent`를 지우거나
이름을 바꾸면 이 셋이 한꺼번에 사라진다. 다만 앞의 둘은 브라우저 단독 실행에서 브리지 없이도
뜬다 (KAN-197 2단계) — 판정이 `readAdConsent() !== null` 하나에서 `resolveAdConsentSource`의
세 갈래로 갈렸다 (`ads/adConsent.ts`).

## 8. 광고·동의 (KAN-196)

1차 배포에 Google AdMob 맞춤형 광고가 들어간다 (2026-09-11 확정). 형식은 둘 — 분석 대기
화면의 **전면(interstitial) 1회**, 결과 화면 [다시 테스트하기]의 **보상형(rewarded)**. 맞춤형
동의는 앱 첫 실행에 인트로 위 시트로 묻고, 거부하면 비맞춤(npa) 광고만 나온다. 철회·재동의는
인트로 하단 방침 링크(§4) 옆 「맞춤형 광고 설정」이다.

웹 단독 실행은 **KAN-197**이 맡는다 — 브라우저 저장소에 동의를 두고 Google AdSense 태그로
광고를 띄운다. 정본은 [`ads-web-adsense.md`](ads-web-adsense.md)다. 그 2단계(2026-09-13)로
**브리지 부재가 곧 "광고 없음"이던 것은 끝났다**: 브리지가 없으면서 `isStandaloneWeb`이 참이고
**광고 ID가 든 빌드**면 웹이 자기 저장소(`ads/webAdConsentStore.ts`)에 묻고 시트도 링크도
그대로 뜬다. 지금 `null`로 남는 것은 둘이다 — 객체나 `?bridge=`는 있는데 `getAdConsent`를
모르는 구버전 앱, 그리고 `VITE_ADSENSE_*`가 빈 브라우저 빌드다 (팀 결정 2026-09-13, PR #109
리뷰 — 동의는 광고가 있을 때 묻는다). 둘 다 `resolveAdConsentSource`의 `'none'`이다.

이 절의 나머지 사실은 그대로다. 갈리는 자리가 `useAdConsent` 안이라는 것도, 브리지 메서드의
유무를 보는 규칙이 **앱 경로의 것**이라는 것도 바뀌지 않았다. 웹 광고 호출(AdSense 태그)은
아직 없다 — KAN-197 3단계다.

음성 저장 선택 동의(KAN-270)는 **브리지를 쓰지 않는다.** 웹 단독은 세션(생성 본문 `voiceConsentVersion`)에,
앱은 계정(`/v0/users/me/voice-consent`)에 기록하고, WebView 안의 웹은 동의 여부를 모른다 — 인트로 고지 문장을
"따로 동의하지 않으면 …"으로 조건부로 바꾼 이유다. 계약 버전은 2 그대로다 ([voice-consent.md](voice-consent.md)).

### 8.1 동의 저장이 네이티브인 이유

세 가지가 겹친다.

- **소비자가 네이티브다.** 동의 값을 읽는 것은 AdMob SDK 초기화(npa 여부)와 iOS ATT 흐름이고
  둘 다 네이티브에 산다. 웹이 들고 있으면 SDK를 세우는 쪽이 매번 WebView가 뜨기를 기다려
  물어봐야 한다
- **WebView 저장소는 사용자가 지운다.** 웹 localStorage는 앱 설정의 "WebView 데이터 삭제"·
  iOS "웹사이트 데이터 지우기"로 함께 날아간다. 동의는 법적 고지의 결과라 사용자가 의도하지
  않은 경로로 사라지면 안 된다
- **KAN-197 웹 단독과 저장소가 다르다.** 웹 단독은 브라우저 저장소를, 앱은 네이티브 저장소를
  쓰게 된다. 웹이 자기 저장소를 정본으로 삼으면 같은 코드가 두 저장소를 오가야 한다

그래서 정본은 SharedPreferences(Android) · UserDefaults(iOS)이고 웹은 `getAdConsent` /
`setAdConsent`로 읽고 쓸 뿐이다. 웹 훅(`ads/adConsent.ts`)은 마운트 때 한 번 읽어 둔 사본이다.

### 8.2 보상형 광고가 `startRetest` 안인 이유

새 메서드가 없다. 광고를 아는 앱은 `startRetest()`를 받으면 **보상형 광고 → 완주 → 새 세션
생성 → 인트로 리로드**를 한 트랜잭션으로 진행한다. 중도에 닫으면 기존 `onRetestFailed`로
`AD_DISMISSED`를 보내고(위 §3 payload), 결과 화면은 그대로 남아 버튼이 다시 열린다. **광고
로드 실패는 막지 않는다** — 광고 없이 그대로 재응시로 통과시킨다.

웹이 사이에 끼는 설계(`showRewardedAd()` → 완주 회신 → 웹이 `startRetest()`)를 두지 않은
이유: 광고는 봤는데 세션 생성이 실패한 상태를 **웹이** 들고 있어야 한다. 그 상태에서 사용자가
다시 누르면 광고를 두 번 보게 되고, 안 보게 하려면 "광고 완주 크레딧"을 웹이 기억해야 하는데
그 기억은 리로드로 사라진다. 네이티브 한 곳에서 끝내면 이 상태가 존재하지 않는다.

문구 정본은 네이티브다 (`RetestFailure` 계약 그대로). 웹은 `message`를 그대로 그리고 코드로
문구를 고르지 않는다 — `AD_DISMISSED`도 예외가 아니다.

실패 출구(문항 중 세션 만료·분석 막다른 상태)의 재응시는 이 광고를 건너뛴다 — KAN-248, §8.6.

### 8.3 전면 광고가 fire-and-forget인 이유

`showInterstitialAd()`는 인자도 회신도 없다. 광고가 떴는지·언제 닫혔는지·로드에 실패했는지에
따라 대기 화면이 달라질 것이 하나도 없다 — 폴링은 광고 아래에서 그대로 돌고, 결과가 나오면
광고를 닫은 뒤 그 화면이 기다리고 있다. `shareResult`가 카톡 결말을 회신하지 않는 것과 같은
판단이다.

**세션당 한 번**은 웹이 센다 (`ads/interstitial.ts`, 세션 id 키의 모듈 상태). 대기 화면은
StrictMode 이중 실행·재녹음 뒤 리렌더·재마운트로 여러 번 마운트되므로 화면 안 ref로는
부족하다. 네이티브는 받은 만큼 띄우면 된다 — 횟수 방어를 두 곳에 두지 않는다.

### 8.4 라벨 규칙

재응시 버튼 라벨은 **광고 경로(`RetestControl.adGated`)이고** `readAdConsent() !== null`이면
**[광고 보고 다시 테스트하기]**, 아니면 예전 그대로 [다시 테스트하기]다 (`result/RetestAction.tsx`).
`adGated`는 결과 화면(`from === 'result'`)에서만 참이다 — 대기 화면 막다른 상태와 문항 화면의
실패 출구는 광고를 건너뛰므로(§8.6) 동의 유무와 무관하게 [다시 테스트하기]다. 동의 값이
아니라 **유무**를 보는 이유는 값이 무엇이든 광고는 나오기 때문이다(허용 → 맞춤형, 거부 →
일반). null인 실행(웹 단독·구버전 앱)에서는 광고가 뜨지 않으니 "광고 보고"라고 적으면
거짓말이 된다.

### 8.5 네이티브 구현 (3·4단계 완료 — Android / iOS)

| 항목 | 내용 | Android (3단계) | iOS (4단계) |
|---|---|---|---|
| `getAdConsent()` | 저장소 값을 `'granted' \| 'denied' \| 'unknown'` 문자열로. 저장된 적 없으면 `'unknown'`. origin 거부는 빈 문자열(§2) | `AccenturyBridge.getAdConsent` → `SharedPreferencesAdConsentStore` (파일 `ad_consent`, 키 `state`) | 토큰과 같은 심 — 문서 변수 `adConsent`, `WebViewHost.pushAdConsent`가 origin 통과 문서에만 민다. 저장소 `UserDefaultsAdConsentStore` (키 `ad_consent.state`) |
| `setAdConsent(state)` | `'granted' \| 'denied'`만 받는다. 그 밖의 값(`'unknown'` 포함)은 §5 규칙대로 조용히 버리고 Crashlytics 흔적 | `AccenturyBridge.setAdConsent` → `AdsController.setConsent` (저장 + 프리로드 시작) | `BridgeDispatcher` `"setAdConsent"` → `AdsController.shared.setConsent` (저장 + `granted`면 ATT → 프리로드) |
| `showInterstitialAd()` | 전면 광고 표시. 받아 둔 것이 없으면 아무 일 없음. 회신 없음 | `InterstitialGate.show` | `AdsController.showInterstitial` → `InterstitialGate.show` (`present(from:)` 최상단 VC) |
| `startRetestAfterFailure()` (KAN-248) | 보상형 광고 게이트 없이 곧바로 기존 재응시 흐름. 회신·잠금(`retestInFlight`)·세션 생성 규칙은 `startRetest`와 같다 (§8.6) | `AccenturyBridge.startRetestAfterFailure` → `MainActivity.startRetestAfterFailure` → `proceedRetest` (광고 게이트 `RewardedRetestAd` 우회). 잠금은 `proceedRetest` 안의 `beginRetest()`라 `startRetest`와 같은 잠금을 지난다 | `BridgeUserScript` 객체 리터럴 → `BridgeDispatcher` `"startRetestAfterFailure"` (origin 검증) → `TestFlowView.handleRetestAfterFailure` → `proceedRetest` → `TestFlowModel.startRetest` (광고 게이트 `AdsController.runRewardedRetest` 우회). 잠금은 `TestFlowModel.startRetest` 안의 `beginRetest()`라 `startRetest`와 같은 잠금을 지난다 |
| `startRetest()` | 보상형 광고 완주 후에만 기존 재응시 흐름. 중도 닫힘 → `onRetestFailed` `AD_DISMISSED` (`retryable:true`, `retryAfterMs:null`). 로드·표시 실패 → 광고 없이 통과 | `MainActivity.startRetest` → `RewardedRetestAd.run` (상태기계 `RewardedRetestGate`) → `proceedRetest`. 회신 payload는 `adDismissedRetestFailure()` | `TestFlowView.handleRetest` → `AdsController.runRewardedRetest` → `RewardedRetestAd.run` (Core `RewardedRetestGate`, 같은 표) → `proceedRetest` → `TestFlowModel.startRetest`. payload는 Core `adDismissedRetestFailure()` |
| 동의 → SDK | `granted`만 맞춤형. `denied`·`unknown`은 npa 요청(`AdRequest` extras `npa=1`). **`unknown`이면 요청을 아예 내지 않는다** — 첫 `setAdConsent`가 프리로드의 시작점 | `AdRequests.kt` `personalizationAllowed`·`buildAdRequest`, 프리로드 조건은 `AdsController.preloadIfConsented` | Core `personalizationAllowed`, `AdRequests.make` (`Extras.additionalParameters["npa"]="1"`), `AdsController.preloadIfConsented` |
| SDK 초기화 | 앱 시작에 한 번. 아동 대상 아님·동의 연령 미만 아님 명시 | `AccenturyApplication` → `AdsController.initialize` (백그라운드 스레드) | `AccenturyApp.init` → `AdsController.shared.start` (`MobileAds.shared.start`, SDK가 비동기) |
| iOS ATT | ATT 결과를 `setAdConsent`로 접어 넣지 않는다: 그 값은 사용자가 시트에서 고른 것이어야 「맞춤형 광고 설정」이 보여 주는 상태와 맞는다 | — | **`setAdConsent('granted')` 직후** `requestTrackingAuthorization`. `denied`면 부르지 않는다. 결과는 저장하지 않는다. 근거·앱 시작 경로는 `ads-admob.md` §7.5 |

Android 쪽 결정의 근거(ID 주입, 전면 광고 중 폴링, 프리로드 시점, 릴리스 빗장)는 `ads-admob.md`에
있고, iOS가 갈리는 지점(SwiftPM·Info.plist·ATT·심)은 그 문서 §7이다.

**스모크 구동기는 동의를 미리 심어야 한다.** `WebAutoDriver.swift`는 인트로에서 [시작하기]를
JS `.click()`으로 누르므로 시트의 막에 걸리지는 않지만, 동의가 `unknown`인 채 진행되고
전면·보상형 광고가 실제 SDK를 부르면 자동 진행이 광고 위에서 멈춘다. iOS(4단계)는
`-AutoFlowDrive 1`·`-AutoStartSmoke 1`이면 `AdsController.start`가 저장소에 `denied`를 미리 쓰고
`adsSuppressed`로 전면은 no-op, 보상형은 광고 없이 통과(proceed)시킨다 — Debug 한정, 로그
`ADS: smoke consent=denied suppressed=true`. Android 스모크에는 아직 같은 사전 세팅이 없다. 웹 쪽
`nativeSmokeSelectors.test.ts`는 구동기가 보는 클래스만 지키므로 이 조건을 잡지 못한다.

### 8.6 실패 출구는 광고를 건너뛴다 — `startRetestAfterFailure` (KAN-248)

사용자 잘못이 아닌 실패 때문에 다시 하는 재응시에는 광고를 물리지 않는다 (팀장 결정). 웹은
`useRetest`의 `from`([RetestOrigin])으로 어느 메서드를 부를지 가른다 (`result/useRetest.ts`
`isAdGated`). 라벨(§8.4)도 같은 판정을 본다.

| 출구 | `from` | 부르는 메서드 | 광고 |
|---|---|---|---|
| 결과 화면 [다시 테스트하기] (정상 완주 뒤) | `'result'` | `startRetest()` | 있음 |
| 결과 화면의 결과 만료 상태 | `'result'` | `startRetest()` | 있음 — 이미 완주·결과를 본 뒤의 정상 재응시 (팀 결정 2026-09-28) |
| 문항 중 세션 만료·제출 실패 (`VoiceItemScreen`·`VocabularyItemScreen`·`WebVoiceRecorder`·`TestFlowScreen`) | `'item'` | `startRetestAfterFailure()` | 없음 |
| 분석 대기 막다른 상태 (`AnalysisWaitingScreen` FAILED·손댈 문항 없음) | `'waiting'` | `startRetestAfterFailure()` | 없음 |

성공·실패 회신은 `startRetest`와 완전히 같다 — 성공은 인트로 리로드, 실패는 `onRetestFailed`.
광고가 없으니 `AD_DISMISSED`가 올 일이 없을 뿐이다. 네이티브의 재응시 잠금(`retestInFlight`)과
세션 생성 규칙(KAN-107)도 그대로다.

**`startRetest({reason})`처럼 인자로 가르지 않은 이유.** Android `@JavascriptInterface`는 이름과
인자 개수로 메서드를 찾는다. 인자 없는 `startRetest()`만 가진 구버전 앱에 인자를 넘기면
"Method not found" 예외가 나 재응시 자체가 죽는다 — 광고를 빼려다 출구를 없애는 셈이다. 별도
메서드는 웹이 `typeof`로 유무를 가려 없으면 `startRetest()`로 내려갈 수 있다. 메서드 추가라
계약 버전도 그대로 2다 (§1).

구버전 조합:

| 웹 | 앱 | 실패 출구에서 일어나는 일 |
|---|---|---|
| 새 웹 | 새 앱 | `startRetestAfterFailure()` — 광고 없음 |
| 새 웹 | 구버전 앱 (`startRetestAfterFailure` 없음) | 래퍼가 `startRetest()`로 폴백 — 광고가 뜬다. 재응시가 막히는 것보다 나아 감수한다. 라벨은 [다시 테스트하기]라 광고가 예고 없이 뜰 수 있다 |
| 구버전 웹 | 새 앱 | 구버전 웹은 인자 없는 `startRetest()`만 부른다 — 광고가 뜬다 (예전 동작 그대로) |
| — | 브리지 없음 (브라우저 단독) | 래퍼 false → `goToIntro` 폴백. 광고 없음 |

## 9. 햅틱 (KAN-258)

버튼 누름과 결과 순간에 짧은 햅틱을 준다. 계약 버전은 2 그대로다 — 메서드 추가라 하위호환이다(§1).
`haptic`을 모르는 앱에서는 래퍼가 false를 주고 버튼은 진동 없이 그대로 눌린다.

**`navigator.vibrate`가 아니라 브리지인 이유.** iOS WKWebView에는 `navigator.vibrate`가 없다.
Android WebView는 있지만 VIBRATE 권한이 필요하고 길이(ms)만 정할 수 있어, OS 햅틱처럼 짧고
가볍게 떨리지 않는다. 화면 대부분이 웹 버튼이라 웹이 네이티브 햅틱을 브리지로 부른다. 브라우저
단독 실행에서는 햅틱이 없다 — `navigator.vibrate`로 메우지 않는다.

**범위 (B안, 팀 결정).** 햅틱은 아껴 쓸 때만 뜻이 남는다(Apple HIG). 그래서 붙이는 곳을 좁혔다.

| 자리 | 종류 | 구현 위치 |
|---|---|---|
| Primary 버튼 (`Button` `variant="primary"`) | `tap` | 웹 `ui/Button.tsx` |
| 객관식 선택 (어휘 문항·출신 지역 라디오) | `tap` | 웹 `ui/ChoiceList.tsx`(어휘 문항, KAN-255에서 `VocabularyItemScreen.tsx`로부터 추출)·`RegionSelectScreen.tsx` |
| 시작 대기 카운트다운 3·2·1 (숫자가 바뀔 때마다, 0 제외) | `tap` | 웹 `TestStartScreen.tsx` — 실기기 확인 중 사용자 요청으로 추가 (2026-10-01) |
| 녹음 버튼 | `tap` | 네이티브 녹음 화면 (Android `RecordButton.kt`, iOS `RecordButton.swift`) |
| 녹음 완료·실패 | `success`·`error` | 네이티브 녹음 화면 (`RecordingScreen`) — 앱 안 녹음 실패는 웹에 회신되지 않는다 |
| Secondary·text 버튼 | 없음 | — |

**종류 → 플랫폼 매핑.**

| `type` | Android (API 30+ / API 29 폴백) | iOS (16+) |
|---|---|---|
| `tap` | `VIRTUAL_KEY` / 같음 | `UIImpactFeedbackGenerator(style: .light)` |
| `success` | `CONFIRM` / `VIRTUAL_KEY` | `UINotificationFeedbackGenerator` `.success` |
| `error` | `REJECT` / `LONG_PRESS` | `UINotificationFeedbackGenerator` `.error` |

Android는 `ui/components/Haptic.kt`의 `View.performHaptic` 한 곳이 매핑을 쥔다. 브리지(WebView)와
네이티브 Compose 버튼(`LocalView.current`)이 같은 함수를 부르고, Compose `HapticFeedbackType`은 쓰지
않는다(매핑이 둘이 된다). 호출은 `ViewCompat.performHapticFeedback`이다 — `CONFIRM`·`REJECT`는
API 30부터라 minSdk 29에서는 androidx.core가 위 폴백으로 바꿔 부른다. 그래서 API 29에서 성공은 탭과
같은 느낌이다. 플래그 없는 호출이라 OS 「터치 진동」 설정을 따르고, VIBRATE 권한도 필요 없다
(`Vibrator`·`FLAG_IGNORE_GLOBAL_SETTING`을 쓰지 않는다). `tap`을 `CONTEXT_CLICK`이 아니라
`VIRTUAL_KEY`로 고른 이유: 뜻("화면 위 키를 눌렀다")이 버튼 탭과 같고, `CONTEXT_CLICK`은 마우스
우클릭용이라 제조사마다 세기가 들쭉날쭉하다.

iOS는 `UI/Components/HapticPlayer.swift`의 `HapticPlayer.play` 한 곳이 매핑을 쥔다. 브리지 디스패처와
네이티브 SwiftUI 버튼(Primary `AccenturyButton`·`ChoiceButton`·`RecordButton`)이 같은 함수를 부르고,
종류 자체(`Haptic`)와 allowlist 판정(`Haptic(bridgeValue:)`)은 `AccenturyCore`에 있어 `swift test`가 본다.
SwiftUI `.sensoryFeedback`이 아니라 UIKit 생성기인 이유는 배포 타깃이다 — 그쪽은 iOS 17부터다.
UIKit 생성기는 시스템 「햅틱」 설정을 따르므로 우리가 설정을 다시 묻지 않는다. 생성기는 부를 때마다
만들고 `prepare()`(Taptic Engine 예열, 선택 사항)는 부르지 않는다: 탭은 손을 뗀 뒤 울려 예열할 "직전"이
없고, 결과 햅틱은 언제 올지 모른다.
[UIImpactFeedbackGenerator](https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator) ·
[UINotificationFeedbackGenerator](https://developer.apple.com/documentation/uikit/uinotificationfeedbackgenerator) ·
[prepare()](https://developer.apple.com/documentation/uikit/uifeedbackgenerator/prepare())

**녹음 결과 트리거.** `Review`로 들어가면 `canProceed`(품질 NORMAL)일 때 `success`, 아니면 `error`.
`Failed`로 들어가면 `error`. 판정은 순수 함수 `recordingResultHaptic`이 하고(Android
`RecordingScreen.kt`, iOS `AccenturyCore` `Recording/RecordingResultHaptic.swift`), 녹음 화면은 상태가
바뀔 때마다 한 번 보되 **화면이 처음 본 상태는 건너뛴다**. 회전으로 액티비티가 다시 만들어져도
뷰모델은 살아 있어 같은 결과가 다시 들어오는데, 그것은 새 결과가 아니라서 떨지 않는다. 이 규칙의
구현이 플랫폼마다 다르다: Android는 `LaunchedEffect(state)`가 첫 값에도 돌아서 `primed` 플래그로 첫
번을 건너뛰고, iOS는 iOS 16의 한 인자 `.onChange(of: model.uiState)`가 처음 나타날 때의 값으로는
불리지 않아 플래그 없이 같은 동작이 나온다(iOS 17의 `initial:` 인자는 쓰지 않는다). 정지 버튼의
`tap`과 결과의 `success`·`error`는 짧은 간격(체감상 거의 연달아)으로 이어서 난다(정지 요청 → 엔진이 다음 청크
경계에서 끝내고 품질 판정). "눌렀다 → 결과가 정해졌다"는 두 사건이라 합치지 않는다. 10초 자동
종료는 탭 없이 결과 햅틱만 난다.

**allowlist.** 네이티브는 `tap`·`success`·`error` 세 값만 받는다. 그 밖의 값은 §5 규칙대로 조용히
버린다 — 웹 `HapticType`과 양 플랫폼 allowlist가 같은 세 값이어야 하고, 하나를 늘리면 셋을 함께
고친다. OS 「터치 진동」 설정이 꺼져 있으면 떨지 않는 판단도 네이티브 몫이라 웹은 설정을 묻지 않는다.
계약 밖 값도 §5대로 Crashlytics 비치명 이벤트(`bridge_parse_failed: haptic`)로 남긴다. 버튼마다
불리는 메서드라 소음을 걱정할 수 있지만, 우리 웹은 `HapticType` 세 값만 보내므로 이 기록이 쌓인다면
그것은 계약이 어긋났다는 신호다.

## 10. 보관 음성 유실 복구 (KAN-261)

계약 버전은 2 그대로다. 메서드도 슬롯도 늘리지 않았다 — 웹에 "앞 문항을 다시 열어 달라"는 메시지가
없어서, 앞 문항 녹음 화면은 녹음을 쥔 쪽(웹 브라우저 경로 또는 네이티브)이 스스로 다시 연다.

**오류 봉투 (가칭).** 음성 업로드가 `code: 'VOICE_SLOT_MISSING'`과 `missingItems: string[]`(서버가 잃은
앞 음성 문항의 itemId)를 싣고 거절된다. 코드 이름과 필드는 KAN-262가 확정하기 전의 가칭이다.

**복구 규칙.** 빠진 문항들을 seq 순서로 다시 녹음하고, 마지막에 거절당한 문항(X)도 새로 녹음한다.
같은 바이트를 다시 보내도 칸이 비어 있어 같은 거절이므로 [다시 시도]는 두지 않는다. 음성이 아닌 id·모르는
id·X 자신은 거른다. 남는 것이 없으면 X만 다시 녹음하는 기존 재녹음으로 떨어진다(막다른 길 없음).

**웹 브라우저 경로** (`TestFlowScreen`의 `redoQueue`). 진행 상태 머신은 건드리지 않고 녹음 화면만 앞
문항으로 바꿔 끼운다. 진행률은 계속 X를 가리킨다. 앞 문항의 새 결과는 같은 `receiveResult`로 들어오지만,
진행 머신이 그 문항을 이미 제출된 것으로 보고 무시하므로 진행이 밀리지 않는다. 대기열은 앞 업로드가
성공해야 다음으로 넘어간다. 재녹음 중인 앞 문항이 다시 `VOICE_SLOT_MISSING`이면 기존 대기열(지금 문항
포함)에 새 `missingItems`를 합쳐 seq 순서로 다시 세운다. 재녹음 화면에서도 세션 만료는 기존
[다시 테스트하기] 갈래 그대로다.

**네이티브** (Android·iOS `TestFlowController`). 웹이 `startVoiceItem`으로 넘긴 요청을 itemId별로
기억해 두고(`voiceStarts`), 거절이 오면 그 요청으로 앞 문항 녹음 화면을 연다. 사슬 중에는 제출을 붙들지
않고 곧장 다음 녹음을 열며, X에서만 평소처럼 결과를 기다린다.

- 저장·복원: `voiceStarts`와 복구 대기열(itemId 목록)·사유 문구를 저장 형식에 싣는다. 회전이나 권한
  게이트에서 복원돼도 대기열이 남는다. 새 필드는 기본값이 있어 구버전 저장값도 그대로 복원된다.
- 앞 업로드의 늦은 거절: 사슬은 업로드를 기다리지 않으므로 앞 문항 재업로드의 거절이 다음 녹음 중에
  도착할 수 있다. 그 문항(과 새 `missingItems`)을 손에 든 녹음은 건드리지 않은 채 대기열에 번호 순으로
  넣는다. X를 녹음하는 중이었다면 X를 마친 뒤 그 문항을 열고 X를 다시 끝에 둔다. X를 제출하는 중에
  도착하면 그 문항 뒤에 X를 다시 연다. 칸이 빈 채로 올라간 X 업로드는 어차피 다시 거절된다.
- 재응시: 세션 교체가 성공하면 `onSessionReplaced()`로 `voiceStarts`와 대기열을 비운다. 이전 세션의
  itemId가 `missingItems`로 와도 모르는 id가 되어 X만 다시 녹음한다. 재응시가 실패하면 이전 세션이
  살아 있으므로 비우지 않는다.

**KAN-262가 맞춰 줘야 하는 가정.**

1. 빠진 문항을 새 멱등 키로 다시 올리면 그 칸이 채워진다.
2. 칸이 다 찬 뒤 X를 새 키로 올리면 접수된다.
3. 거절된 X의 키를 성공한 시도로 묶어 두지 않는다. 묶어 두면 새 키로 올린 X가 중복으로 보인다.

**알려진 한계.**

- X도 다시 녹음시킨다. KAN-262가 "칸이 찬 뒤 같은 키 재전송"을 보장하면 X는 재전송으로 바꿀 수 있다.
- 웹 브라우저 경로의 대기열은 메모리에만 있다. 새로고침하면 X만 다시 녹음하게 되고, 빠진 칸이 남았으면
  서버가 다시 알려 준다.
- 네이티브가 앞 문항을 다시 열려면 그 세션에서 웹이 해당 `startVoiceItem`을 한 번 보냈어야 한다. 기억이
  없는 문항(구버전 저장값에서 복원 등)은 걸러지고, 서버가 다음 거절에서 다시 알려 준다.

## 11. 계정 토큰 (KAN-255)

계약 버전은 2 그대로다 — 메서드 둘(`getAccessToken`·`refreshAccessToken`)과 수신 슬롯 하나
(`onAccessTokenRefreshed`)를 **추가**만 했다(§1). 이 셋을 모르는 앱에서는 래퍼가 null·false를 주고
단어 학습 화면이 로그인 안내로 내려간다. 단어 학습 하나 때문에 응시할 수 있는 앱을 업데이트
안내로 막을 이유가 없다.

### 왜 세션 토큰과 따로인가

`getSessionToken`은 레벨테스트 한 판의 권한이다. 단어 학습 API(서버 KAN-265)는 계정에 기록을
남기므로 전부 **계정 Access 토큰** Bearer를 요구하고, 세션 토큰을 실으면 401이다. 계정 토큰과
그 갱신(리프레시 토큰 회전)은 네이티브가 소유한다 — Android `auth/AuthHttp.kt`의 TokenRefresher.
웹은 토큰을 저장하지 않고 요청마다 브리지에서 읽는다.

### 401 → 갱신 1회 → 재시도 1회

`web/src/learning/wordApi.ts`의 공통 요청 함수가 이 규칙의 유일한 구현이다.

1. `getAccessToken()`이 null이면 네트워크 전에 `CLIENT_NOT_SIGNED_IN`(retryable false). 화면은
   「로그인하면 단어 학습을 할 수 있어요」 + [학습 종류로]를 보인다(3단계).
2. 401이면 `refreshAccessToken()`을 **한 번** 부른다. 결과가 true면 `getAccessToken()`을 다시 읽어
   같은 요청(같은 멱등 키·같은 본문)을 한 번 재시도한다.
3. 갱신 false·다시 읽은 토큰이 null·재시도도 401이면 `UNAUTHENTICATED`(retryable false).
   두 번째 401에서 다시 갱신하지 않는다.

### 갱신 회신과 타임아웃

| 항목 | 규칙 |
|---|---|
| 회신 | `window.AccenturyWeb.onAccessTokenRefreshed('ok' \| 'failed')`. `'ok'`만 성공이고 그 밖의 문자열은 실패로 본다 |
| 타임아웃 | 웹 래퍼가 10초 기다린다. 회신이 없으면 실패로 보고 슬롯을 해제한다 — 늦게 온 회신은 버려진다 |
| 동시 요청 | 진행 중인 갱신이 있으면 웹이 같은 Promise를 공유한다. 네이티브에는 갱신 요청이 겹쳐 가지 않는다 |
| 슬롯 | 갱신을 기다리는 동안만 설치하고, 끝나면 설치 전 값으로 되돌린다(§3 슬롯 단위 규칙) |

### 네이티브가 지킬 것 (4단계 Android 완료 · 5단계 iOS 완료)

- `getAccessToken()`: 현재 메모리의 Access 토큰을 동기로. 로그인 안 됨·로그인 기능을 끈 빌드·origin
  불허(§5)면 빈 문자열. 만료 여부는 보지 않는다 — 만료는 서버 401로 드러나고 그때 갱신한다.
- `refreshAccessToken()`: 즉시 반환하고 갱신은 백그라운드에서. 끝나면 **반드시 한 번**
  `onAccessTokenRefreshed`를 부른다(성공 `'ok'`, 리프레시 토큰 만료·네트워크 실패 등은 `'failed'`).
  10초 안에 회신하지 못하면 웹은 이미 실패로 처리했다.
- 갱신이 이미 진행 중이면(앱 자체 요청이 먼저 시작했어도) 새로 시작하지 말고 그 결과로 회신한다.
- origin 불허 문서에서 온 `refreshAccessToken()`은 조용히 버린다(회신도 없음 — 웹은 타임아웃으로 끝난다).

#### Android 구현 (KAN-255 4단계)

| 항목 | 내용 |
|---|---|
| 파일 | `web/AccenturyBridge.kt`(두 메서드) · `web/WebViewHost.kt`(전달) · `MainActivity.kt` TestFlow(`currentAccessToken()`·`refreshAccessToken()`) · `bridge/AccessTokenRefreshedDelivery.kt`(결말 → `'ok'\|'failed'`, 주입 JS) |
| origin | `getAccessToken`은 `getSessionToken`처럼 `isOriginAllowedNow` 플래그(동기 반환). `refreshAccessToken`은 postToMain 뒤 `isCurrentUrlAllowed` — 불허면 콜백도 회신도 없다 |
| 토큰 읽기 | `authClients.store.read()`를 `runBlocking`으로. JS 인터페이스 스레드라 메인을 막지 않는다 (`AccessTokenInterceptor` 선례). 저장소는 메모리 캐시 |
| 갱신 | TestFlow `rememberCoroutineScope`에서 `refresher.refresh(staleAccess = 지금 저장된 Access)`. 본체는 `NonCancellable` — 회전 도중 취소돼 회전된 Refresh를 잃지 않게. 앱 자체 OkHttp 갱신과 겹치면 TokenRefresher 뮤텍스가 줄 세우고 뒤쪽은 서버에 묻지 않는다 |
| 회신 | `Refreshed`만 `'ok'`, `SignedOut`·`Failed`·예외는 `'failed'`. 메인 스레드에서 `webDeliveryJs("onAccessTokenRefreshed", …)` 한 번. WebView가 없으면 웹 타임아웃 |
| SignedOut | TokenRefresher의 `onSignedOut`이 이미 게이트를 로그인 화면으로 돌린다 — 브리지 쪽 추가 처리 없음 |
| `LOGIN_ENABLED=false` | `authClients`를 깨우지 않는다. `getAccessToken`은 늘 `""`, `refreshAccessToken`은 즉시 `'failed'`. 예전 로그인 빌드가 Keystore에 남긴 토큰이 익명 빌드 웹으로 새지 않게 |

#### iOS 구현 (KAN-255 5단계)

| 항목 | 내용 |
|---|---|
| 파일 | `Web/BridgeUserScript.swift`(주입 JS 두 메서드 · 문서 변수 `accessToken` · `__accenturySetAccessToken` · `__accenturyPendingAccessToken` · `accessTokenPushJs`) · `Web/AccenturyBridge.swift`(디스패처 `case "refreshAccessToken"`) · `Web/WebViewHost.swift`(`pushAccessToken`·`refreshAccessTokenForWeb`·순서 함수 `accessTokenRefreshReplyScripts`) · `TestFlow/TestFlowView.swift`(`readAccessToken`·`refreshAccessToken` 클로저) · Core `Bridge/AccessTokenRefreshedDelivery.swift`(결말 → `'ok'\|'failed'`, 주입 JS) |
| origin | `getAccessToken`은 동기 반환이 없어 문서 변수를 읽는다. 미는 판정은 세션 토큰과 같은 `shouldPushToken`(커밋된 origin이 allowlist 안) — 불허 문서는 영영 `""`. `refreshAccessToken`은 디스패처의 처리 시점 URL 검사 — 불허면 콜백도 회신도 없다 |
| 토큰 읽기 | `AuthHub.clients.store.read()`가 `async`라 값이 아니라 읽기 클로저를 넘긴다. `didCommit`에서 든 값을 바로 밀고 저장소를 새로 읽어 다시 밀며, `didFinish`에서 강제 재주입(세션 토큰과 같은 이유) |
| 갱신 | 코디네이터에 매이지 않은 `Task`에서 `refresher.refresh(staleAccess: 지금 저장된 Access)`. 안드로이드 `NonCancellable`과 같은 이유 — 화면이 사라져도 회전된 Refresh 저장까지 끝까지 돈다 |
| 회신 | 메인 액터에서 한 번. **성공이면 새 토큰을 먼저 밀고(`accessTokenPushJs`) 그 뒤 `onAccessTokenRefreshed('ok')`** — 웹이 'ok'를 받자마자 `getAccessToken()`을 다시 읽기 때문(안드로이드엔 없는 단계). 순서는 `accessTokenRefreshReplyScripts`가 정하고 JSContext 테스트가 고정. `.refreshed`만 `'ok'`. WebView가 없으면 웹 타임아웃 |
| SignedOut | TokenRefresher의 로그아웃 신호가 게이트를 로그인 화면으로 돌린다 — 브리지 쪽 추가 처리 없음 |
| `loginEnabled=false` | `AuthHub`를 깨우지 않는다. 읽기는 늘 `""`, 갱신은 nil → 즉시 `'failed'`. 예전 로그인 빌드가 Keychain에 남긴 토큰이 익명 빌드 웹으로 새지 않게 |
