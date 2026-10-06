# 음성 저장 선택 동의 (KAN-270)

> **미결 3: 문안 검토 병행 중.** 확정되면 `web/src/legal/voiceConsent.ts`·`app/src/main/java/com/accentury/app/auth/VoiceConsentText.kt`·`ios/AccenturyCore/Sources/AccenturyCore/Auth/VoiceConsentText.swift` 세 파일을 같은 커밋에서 교체한다.

구현 기록 (2026-10-06, 1단계 웹). 서버 KAN-269가 세션 생성 본문의 `voiceConsentVersion`을 받아
**동의한 세션의 음성만** AI 학습용으로 보관한다. 동의를 받는 화면이 없으면 보관되는 음성이 0건이라
웹에 화면을 하나 더했다.

## 웹 흐름

[내 억양 테스트하기](마이크 권한) → **동의 화면** → 출신 지역(staging) → 목소리 점검 → 세션 생성.

- 별도 화면이다 (`web/src/legal/VoiceConsentScreen.tsx`). 네트워크를 쓰지 않으므로 지역·점검과
  같은 근거로 세션 앞에 둔다 — 어디서 멈추든 고아 세션이 남지 않는다.
- 선택 동의다. 기본은 미체크이고, [다음]은 체크와 무관하게 늘 눌린다(미체크 [다음] = 거부).
  거부해도 응시·결과에 제한이 없다.
- 웹은 익명이라 세션마다 묻는다. 값은 `App`의 문서 상태(`voiceConsent`)로만 살고, 재응시는
  `goToIntro`가 문서를 다시 로드하므로 매번 미동의로 시작한다. 따로 초기화하는 코드는 없다.
- 체크한 세션만 본문에 `voiceConsentVersion`이 실린다. 미동의는 키 자체가 없다(`region`과 같은 규칙).
- 앱 WebView에서는 이 화면이 없다 — 세션을 네이티브가 만든다.

## 상수와 버전 올리는 절차

문안과 버전은 전부 `web/src/legal/voiceConsent.ts` 한 파일이다. 개인정보 담당 검토가 병행 중이라
문장을 바꿀 때 그 파일만 고친다. 빠지면 안 되는 요소는 파일 헤더에 적었다(선택 동의, 거부 시 무제한,
보관 항목·기간, 만 14세 확인, 웹 익명 세션의 삭제 요청 한계).

문안을 바꿔 버전을 올릴 때는 셋을 함께 올린다.

1. 서버 `AccenturyProperties.VOICE_CONSENT_VERSION` (`Accentury_Server` 레포)
2. `privacy.html`의 `accentury-policy-version`
3. `VOICE_CONSENT_VERSION` (`voiceConsent.ts`)
4. Android `VOICE_CONSENT_VERSION` (`app/src/main/java/com/accentury/app/auth/VoiceConsentText.kt`, 익명 모드 세션용 — 5단계)
5. iOS `VoiceConsentText.swift`의 같은 상수 (6단계에서 추가)

인트로 고지(`PrivacyNotice`)는 "따로 동의하지 않으면 녹음한 음성은 분석이 끝나면 바로 지워요."로
조건부 문장이 됐다. 앱 WebView에도 그대로 보이는데, 조건을 단 문장이라 플랫폼 공통으로 맞다.

## 400 폴백

서버는 게시 버전과 다른 값을 400 `VALIDATION_FAILED`로 거절한다. 검증은 이전 세션 폐기 트랜잭션보다
먼저라(서버 `SessionService`) 거절된 요청은 아무것도 지우지 않는다.

`startStandaloneTest`가 **동의를 실은 요청이 이 코드로 실패했을 때만** 동의 없이 한 번 더 만든다.
같은 이전 토큰을 그대로 싣고, 두 번째도 실패하면 평소의 시작 실패 문구로 간다. 미동의 요청의 400은
다시 보내도 같은 400이라 재시도하지 않는다. 폴백 세션의 음성은 보관되지 않는다 — 낡은 문안으로 받은
동의로 보관하는 것보다 그쪽이 맞다.

## Android (2단계)

웹과 달리 동의가 **계정**에 묶인다. 서버 `PUT|DELETE /v0/users/me/voice-consent`로 켜고 끄고, 세션 생성은
계정 동의를 쓰므로(본문 `voiceConsentVersion` 무시) 계정 모드는 본문에 버전을 싣지 않는다. 로그인을 끈 빌드는
아래 「익명 모드」.

### 상태 흐름

`AuthGateState.SignedIn(user, voiceConsent)`. `voiceConsent == null`은 "모른다"다. SignedIn에 닿는 세 경로
모두 동의 상태를 싣는다.

| 경로 | 동의 상태를 어디서 |
|---|---|
| 부트스트랩 (갱신 → `me()`) | `me()` 응답 |
| 추가 정보 제출 | `PUT /profile` 응답 |
| 로그인이 곧장 COMPLETE | **`me()`를 한 번 더** 부른다 |

로그인 응답(LoginResponse)에는 `voiceConsent`가 없어서 셋째 경로만 호출이 하나 늘었다. 그 `me()`가 실패하면
`voiceConsent = null`로 들어간다. 동의는 선택 항목이라 로그인을 막지 않는다. 갱신 거절로 저장소가 비면
로그인 화면이 이긴다.

`setVoiceConsent(true)`는 서버가 준 `currentVersion`을 PUT에 싣는다. 앱에 버전 상수를 두지 않으니 서버가 문안
버전을 올려도 앱 배포 없이 맞는 버전으로 나간다. 상태를 모르면 `me()`로 먼저 읽는다. 성공일 때만 상태를
바꾸고, 결과는 화면에 그대로 돌려준다.

### 동의 화면과 로컬 플래그

`shouldPromptVoiceConsent(state, wasPrompted)`가 판정한다. SignedIn이고 `consented == false`이고 이 기기에서
아직 묻지 않았을 때만 띄운다. null이면 띄우지 않는다.

서버에 "건너뜀" 상태가 없어서 표시 기록은 로컬 SharedPreferences `voice_consent_prompt`(키 = 사용자 id)에 둔다.
[동의하고 계속] 성공과 [건너뛰기] 모두 기록을 남긴다. 건너뛴 사용자에게 다시 띄우지 않는다는 팀 결정
(2026-10-06)을 따른 것이다. 재설치하면 한 번 더 뜨는 것은 허용한다. 화면은 설정 화면처럼 TestFlow 위에 덮는다.
설정 토글로 바꾼 것도 성공하면 표시 기록을 남긴다. 다른 기기에서 동의했거나 재설치한 계정이 설정에서 끄자마자
동의 화면이 다시 뜨던 문제(PR #22 리뷰) 때문이다. iOS도 같다.

### 설정 토글

설정 화면 「개인정보」 섹션의 「음성 저장 동의 (선택)」 스위치가 유일하게 켜고 끄는 자리다. 서버 값을 따르고,
누르는 동안만 새 값을 먼저 보여 준다. 실패하면 원래 값으로 돌아가고 한 줄 안내를 남긴다. 동의 상태를 모르면
스위치 대신 「상태를 불러오지 못했어요」와 [다시 시도](`reloadVoiceConsent`)가 보인다. 캡션은 이미 저장된
음성의 처리 요청을 방침 13항의 개인정보 보호책임자에게 안내한다.

### 문구 정본

화면 문안은 `app/src/main/java/com/accentury/app/auth/VoiceConsentText.kt` 한 파일이고 상수 이름은 웹과 같다.
DETAILS 셋째 줄만 다르다. 웹은 익명 세션의 삭제 요청 한계를 말하고, 앱은 "설정에서 언제든 철회"를 말한다.

권한 안내 세 곳(`MainActivity.kt`)도 조건부 문장으로 바꿨다.

- 권한 설명(Rationale): 따로 동의하지 않으면 음성은 분석 뒤 바로 삭제돼요
- 권한 거부(Denied): 발음을 들어야 분석할 수 있어요 · 음성은 따로 동의한 경우에만 보관돼요
- 인트로 안심 문구 셋째 줄: 음성은 따로 동의한 경우에만 보관

## 익명 모드 (로그인 끈 빌드, 5·6단계)

앱은 로그인 관문이 늘 켜져 있었다. 계정 세션은 서버가 본문 `voiceConsentVersion`을 무시하므로, 로그인을 끈
빌드에서 익명 세션으로는 동의를 실을 길이 없었다. 5단계(Android)에서 플래그를 두고 웹과 같은 방식으로 본문에
버전을 싣는다. 서버 변경은 없다. iOS는 6단계에서 같은 계약을 옮긴다.

- **플래그 `LOGIN_ENABLED`**: 기본 `false`(익명 모드). `-PloginEnabled=true` 또는 `local.properties`
  `loginEnabled=true`로 켠다. `FAKE_IDP`와 달리 debug·release 모두 이 값을 보고, 두 값 다 릴리스에 허용된다
  (`app-release.yml`의 `FAKE_IDP` 가드와 무관). 레시피는 `social-login.md` §5.
- **설치당 한 번**: 시작 게이트가 권한 → **동의** → 점검 → 세션 순서로 선다(웹 순서). 선택은
  SharedPreferences `voice_consent_anonymous`(키 `asked`·`consented`, `AnonymousVoiceConsentStore`)에 남고, 이후
  첫 응시·재응시마다 `anonymousVoiceConsentVersion(consented)`로 본문을 정한다. 기본은 미동의다.
- **본문과 폴백**: `SessionClient.create(..., voiceConsentVersion)`. null이면 키째 빠진다. 첫 응시
  (`SessionGateScreen`)와 재응시(`proceedRetest`) 둘 다 `createWithConsentFallback`을 탄다. 동의를 실은 요청이
  400 `VALIDATION_FAILED`면 동의 없이 한 번 더 만든다(위 「400 폴백」과 같은 규칙).
- **세션 클라이언트는 plain `OkHttpClient`**: 예전 로그인 빌드의 토큰이 Keystore에 남아 있어도 Bearer가 실리지
  않게 한다. 실리면 서버가 계정 세션으로 보고 동의를 무시한다. TestFlow에서 계정 클라이언트를 쓰던 곳은 세션
  생성 하나뿐이었다.
- **철회**: 톱니는 그대로이고 `AnonymousSettingsScreen`이 「개인정보」(로컬 스위치 + 방침 링크)만 보인다.
  설정에서 바꾼 것도 "물어봤다"로 친다. 시작 전에 설정에서 켠 사람에게 동의 화면을 또 띄우지 않는다.
- 문안은 `VOICE_CONSENT_DETAILS_ANONYMOUS`다. 1·2줄은 계정과 같고, 셋째 줄이 웹처럼 세션 만료 뒤 삭제 불가를
  말한다.

| | 계정 모드 (`LOGIN_ENABLED=true`) | 익명 모드 (기본) |
|---|---|---|
| 첫 화면 | 로그인 관문, 스플래시가 Refresh 확인을 기다림 | 곧장 인트로, 앱 시작 확인 없음 |
| 동의 저장 | 서버 계정 (`PUT\|DELETE /v0/users/me/voice-consent`) | 기기 로컬 prefs |
| 묻는 때 | 로그인 뒤 TestFlow 위 오버레이, 계정당 한 번 | 시작 게이트 권한 뒤, 설치당 한 번 |
| 세션 본문 `voiceConsentVersion` | 보내지 않음 (서버가 계정 값 사용) | 동의면 `VOICE_CONSENT_VERSION` |
| 버전 출처 | 서버 `currentVersion` | 앱 상수 (400이면 폴백) |
| 설정 화면 | 계정·개인정보·로그아웃 | 개인정보만 |

계측 전용이라 단위 테스트가 덮지 못하는 곳: 시작 게이트의 동의 단계, `AnonymousFlow`, 익명 설정 화면 결선.

## iOS (3단계)

Android와 같은 상태 모양, 메서드 이름, 문안을 옮겼다. 상태 흐름·로컬 플래그·설정 토글의 규칙은 위 Android 절과
같다. 판정과 저장소는 `AccenturyCore`에 두어 `swift test`로 돈다.

| Android | iOS |
|---|---|
| `AuthApi.kt` `VoiceConsent`·`consentToVoice`·`withdrawVoiceConsent` | `AccenturyCore/Auth/AuthApi.swift` 같은 이름 (`consentToVoice(version:)`) |
| `AuthGateState.SignedIn(user, voiceConsent)` | `.signedIn(AuthUser, voiceConsent: VoiceConsent?)` |
| `AuthGateController.kt` `withVoiceConsent`·`setVoiceConsent`·`reloadVoiceConsent` | `AuthGateController.swift` 같은 이름 |
| `VoiceConsentPromptStore.kt` (prefs 파일 `voice_consent_prompt`, 키 = id) | `AccenturyCore/Auth/VoiceConsentPrompt.swift` `UserDefaultsVoiceConsentPromptStore` (키 `voice_consent_prompt.<id>`) |
| `shouldPromptVoiceConsent(state, wasPrompted)` | `shouldPromptVoiceConsent(state:wasPrompted:)` (같은 파일) |
| `VoiceConsentText.kt` `VOICE_CONSENT_*` | `AccenturyCore/Auth/VoiceConsentText.swift` `voiceConsent*` (낙타 표기, 문장은 같다) |
| `VoiceConsentScreen.kt` | `ios/Accentury/Auth/VoiceConsentScreen.swift` |
| `MainActivity.kt` `AuthGate` 오버레이 | `AuthGateView.swift` `SignedInScreen`의 `ZStack` |
| `SettingsScreen.kt` `VoiceConsentSection` | `SettingsScreen.swift` `VoiceConsentSection` |
| `MainActivity.kt` 권한 안내 세 곳 | `Permission/PermissionGateView.swift` 세 곳 (문장 같음) |

UserDefaults 키 이름은 광고 동의(`ad_consent.state`)와 같은 규칙이다. iOS에는 prefs 파일 단위가 없어 파일명과
키를 점으로 이었다.

### 체크 칸

동의 화면의 체크 칸은 `Toggle`이 아니다. 로그인 화면 필수 동의 줄과 같은 그림(`ConsentCheckMark`, 잉크 테두리 칸에
크림 체크)을 단 `Button`이다. iOS `Toggle`은 스위치로 그려져 "이 문장에 동의한다"는 뜻이 흐려진다. 한 앱에서
동의 칸이 두 모양이 되는 것도 피했다. 접근성은 로그인 `ConsentRow`와 같다. 줄 전체가 한 요소로 읽히고 체크하면
"선택됨"이 붙는다. 설정 화면의 켜고 끄기는 Android `Switch` 자리라 `Toggle`(잉크 색)을 그대로 쓴다.

### 마이크 권한 설명 (plist)

`Info-Release.plist`·`Info-Debug.plist`의 `NSMicrophoneUsageDescription`을 조건부 문장으로 바꿨다.

```
억양 분석을 위해 마이크로 목소리를 녹음해요. 따로 동의하지 않으면 녹음은 분석 뒤 바로 삭제돼요.
```

심사 가이드라인 5.1.1(ii)의 목적 문자열이라 처분이 사실과 맞아야 한다(`app-store-listing.md` §5).

## 검증

### 로컬 (2026-10-06)

| 대상 | 결과 |
|---|---|
| 웹 vitest | 76 파일 1184 passed |
| 웹 `tsc --noEmit` · `tsc -p e2e --noEmit` | 오류 0 |
| Android `:app:testDebugUnitTest` | 635 tests, 실패 0 |
| iOS `swift test` (`AccenturyCore`) | XCTest 628 tests, 실패 0 |
| e2e 전체 (격리 스택) | 7 passed, 1 skipped(retake) · `E2E_VOICE_CONSENT=true` full-run 2 passed |

e2e는 서버 origin/Dev(KAN-269 포함)를 `git archive`로 풀어 띄운 격리 스택에서 돌렸다. 로컬 서버 체크아웃의 작업
트리를 바꾸지 않으려고 그렇게 했다. DB·Redis는 서버 `backend/docker-compose.yml`을 compose 프로젝트 이름
`kan270e2e`로, AI는 가짜 엔진 uvicorn(8000), 백엔드는 bootRun(CORS 5174, `ai-token` 인자)이다. 새 DB의 활성 정의는
`gn-2026.09.4`(10문항)라 완주 스펙이 7문항 캡션을 못 찾아 깨진다. **`active_test_version`을 `gn-2026.10.1`로 돌려야
통과한다**(운영은 `PUT /admin/v0/active-version`). 로컬 서버에는 training 버킷을 설정하지 않는다. 그래서 동의 판도
실 S3에 아무것도 쓰지 않고, 로컬 판이 보는 것은 동의 본문·201·완주·sessionId 로그까지다. 끝나면
`docker compose -p kan270e2e down -v`.

동의 판과 미동의 판을 한 번씩 돌린 뒤 DB `test_session.voice_consent_version`을 직접 봤다. 동의 판 세션에는
`2026-10-04`가 들어갔고 미동의 판 세션은 비어 있었다. 서버가 체크 여부를 세션에 그대로 남긴다는 뜻이다.

### staging 저장 (AC 6, Dev 머지 뒤)

`staging.accentury.app`은 미사용 시 destroy되는 환경이라(KAN-140) 이 브랜치가 Dev에 머지돼 staging 웹이 배포된
뒤에만 돌릴 수 있다. staging 서버에는 KAN-269가 이미 배포돼 있고 SSM에 training 버킷(`accentury-voice-325771561913`)과
key-prefix `staging`이 들어 있다.

S3 키 모양은 다음과 같다. 분석이 종결된 음성 문항마다 WAV와 라벨 JSON이 한 쌍으로 남는다.

```
<prefix>/<region|UNKNOWN>/<testVersion>/<sessionId>/<itemId>/<analysisJobId>.{wav,json}
예) staging/<지역코드 또는 UNKNOWN>/gn-2026.09.4/s_…/v116/a_….json
```

`UNKNOWN`은 세션에 저장된 region이 없거나 코드 10개 밖일 때다. 지역 선택이 꺼진 빌드, 앱 WebView 응시, 전송 오류로
값이 빠진 세션이 여기로 모인다(서버 `Region.forStorage`가 접고 `TrainingSample.keyPrefix`가 키 첫 조각으로 쓴다).

세션 id와 작업 id는 원래 값이 `s_`·`a_`로 시작한다. 키 조각은 그 값 그대로다(서버 `TrainingSample.keyPrefix`). 그래서
스펙 로그의 `sessionId=s_…`를 그대로 grep하면 된다.

순서는 이렇다. staging 웹 주소는 GitHub environment 변수 `APP_DOMAIN`이다.

1. Dev 머지 뒤 웹·서버 배포가 성공했는지 확인한다(Actions).
2. 동의 판으로 완주하고, 로그의 `[e2e] sessionId=<id> voiceConsent=true`에서 id를 얻는다.
3. 그 id로 S3를 조회해 음성 문항 수만큼 `.wav`·`.json` 쌍이 있는지 본다. 저장은 분석 종결 뒤 비동기라 첫 `aws s3 ls`가
   비면 30초~1분 뒤 다시 조회한다. staging은 지역 화면이 켜진 빌드라
   `<region>` 자리는 스펙이 고른 지역 코드다.
4. 대조군으로 `E2E_VOICE_CONSENT` 없이 한 번 더 완주한다. 그 sessionId는 S3에 **없어야** 한다.
5. 앱 계정 경로는 수동이다. staging 빌드(Android staging 플레이버 또는 TestFlight)에서 로그인하고 동의한 뒤
   완주하고, 같은 방식으로 조회한다. 앱 세션 id는 기기 로그나 서버 로그에서 얻는다.

AWS 자격 증명 전제: 버킷 읽기 권한이 있는 프로필이어야 한다(`aws sts get-caller-identity`로 계정 325771561913 확인).

```bash
cd web
E2E_BASE_URL=https://<APP_DOMAIN> E2E_VOICE_CONSENT=true npx playwright test full-run -g "웹 단독 완주"
aws s3 ls s3://accentury-voice-325771561913/staging/ --recursive | grep "/<sessionId>/"

# 대조군 — grep 결과가 비어야 한다
E2E_BASE_URL=https://<APP_DOMAIN> npx playwright test full-run -g "웹 단독 완주"
aws s3 ls s3://accentury-voice-325771561913/staging/ --recursive | grep "/<sessionId>/"
```

