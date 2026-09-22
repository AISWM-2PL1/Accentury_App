# App Store Connect 등록과 개인정보 라벨 (KAN-175)

App Store Connect에서 사람이 채워야 하는 값의 **정본**이다. Play 쪽 짝은
[`play-store-listing.md`](play-store-listing.md)(KAN-174)이고 절 구조를 일부러 맞췄다 —
두 스토어의 답이 갈리는 자리를 나란히 놓고 봐야 신고 불일치를 잡는다.

> **근거 문서와 코드가 두 레포에 나뉘어 있다.** 개인정보처리방침·이용 후기 문서와 서버·AI·
> 인프라 코드는 KAN-221 분리로 Accentury_Server에 있다. 이 문서는 그런 자리를 레포 이름을
> 앞에 붙여 가리키고 상대 링크를 걸지 않는다 (`README.md` 「다른 레포와 맞물린 파일」).

> **이 문서의 `play-store-listing.md` 링크는 KAN-174가 머지되기 전까지 죽어 있다.** 그 파일은
> 아직 브랜치 `feature/KAN-174-play-console-listing`에만 있고 Dev에 없다
> (Accentury_Server `docs/wiki/privacy-policy.md` §2가 같은 사정을 적고 있다). 인용한 내용은
> 2026-09-22 시점의 그 브랜치본이다.

콘솔 조작 자체는 자동화하지 않는다. 등록비 결제, 계약 동의, 심사 제출은 계정 소유자가 직접
하는 일이다. 레포가 맡는 몫은 **붙여 넣을 문안과 그 문안이 실제 동작과 맞는지의 근거**다.

Play와 갈리는 가장 큰 자리가 §6이다. Play의 데이터 안전에는 「일시적으로만 처리되며 저장되지
않음」 체크박스가 있지만 App Store 라벨에는 그런 칸이 없다. 애플은 그 사정을 **「수집」의 정의
자체**로 처리한다. 그래서 음성 항목의 답이 두 스토어에서 다르게 나온다.

## 1. 계정과 일정

| 항목 | 값 |
|---|---|
| 개발자 계정 | **이성주 개인 계정**. 팀 ID `559P9SYY57` |
| 등록비 | 연 99달러 (Apple Developer Program, 매년 갱신) |
| 번들 ID | `com.accentury.app` (`ios/Accentury/Config/Base.xcconfig`, Android `applicationId`와 같다) |
| 앱 레코드 | KAN-108에서 생성 완료. TestFlight에 1.0 빌드 5까지 올라가 있다 |
| 숫자 Apple ID | **아직 모른다** — `id<숫자>` 자리표시자. 앱 레코드 › 앱 정보 › 일반 정보 › Apple ID에서 확인해 이 표와 §3의 스토어 URL에 적는다 |
| 마케팅 버전 | `1.0` (`MARKETING_VERSION`) |
| 빌드 번호 | `CURRENT_PROJECT_VERSION` = **6** (3단계에서 올렸다). Android `versionCode`와 같은 값을 같은 커밋에서 올린다 — `AccenturyCoreTests/ReleaseVersionParityTests`가 대조한다 |

**개인 계정이라 나중에 옮기려면 App Transfer 절차를 밟는다.** 팀·법인 명의로 넘기는 것은
계정 사이의 앱 이전이고, 애플이 요구하는 조건(미해결 계약 없음, 양쪽 계정의 법적 동의 등)을
다 만족해야 통과한다. 지금 단계에서 막지는 않지만, 사업자 등록이 생기는 시점에 한 번은
지나가야 하는 길이라 여기 적어 둔다.

### Play와 다른 점 — 12명 x 14일이 없다

App Store에는 Play의 비공개 테스트 강제 요건에 해당하는 것이 **없다.** 개인 계정이어도
테스터 숫자나 기간이 프로덕션 제출을 막지 않는다. 그래서 KAN-174의 임계 경로였던
「테스터 12명 모으기」가 이 티켓에는 없다.

대신 다른 문이 하나 있다. **TestFlight 외부 테스트(External Testing)를 쓰려면 베타 앱 심사
(Beta App Review)를 통과해야 한다.** 내부 테스트(계정에 등록된 사용자 최대 100명)는 심사
없이 바로 돌지만, 링크나 이메일로 팀 밖 사람에게 뿌리려면 그 빌드가 한 번 심사를 받는다.
지금 TestFlight 확인은 전부 내부 테스트 경로였다(`docs/wiki/ios-port.md` §7).

일정의 변수는 **심사 대기 시간 하나**다. 신규 앱 심사는 보통 하루 안쪽이지만 보장된 값이
아니고, 반려되면 그 사이클이 한 번 더 돈다. §10의 선행 조건이 다 닫힌 날 제출하면 그 다음
주에 게시된다고 보면 큰 틀에서 맞는다.

## 2. 서명과 빌드 경로

**로컬과 CI가 같은 경로를 쓴다.** 무서명 아카이브를 만들고 export 단계에서 재서명한다
(`docs/wiki/ios-port.md` §7 「TestFlight 서명」).

```sh
xcodebuild archive … CODE_SIGNING_ALLOWED=NO
xcodebuild -exportArchive -exportOptionsPlist ios/ExportOptions.plist -allowProvisioningUpdates
```

export 설정은 `ios/ExportOptions.plist`가 정본이다 (KAN-175 3단계에 신설). 전체 명령과
아카이브에 같이 줘야 하는 값들(AdMob·카카오)은 `ios/README.md` 「릴리스 아카이브 · TestFlight」에 있다.

이 경로를 고른 이유는 **팀에 등록된 기기가 0대**라서다. 자동 서명 `archive`는 개발용
프로비저닝 프로파일을 만들려다 `Your team has no devices from which to generate a
provisioning profile`로 막힌다. export 단계는 기기 목록을 보지 않고 App ID·Apple
Distribution 인증서·`iOS Team Store Provisioning Profile`을 스스로 만들어 재서명하므로
기기 0대를 그대로 통과한다.

CI가 그 경로를 그대로 쓰려면 App Store Connect API 키가 필요하다. 4단계가 만드는
워크플로는 **아래 세 이름**을 쓴다.

| 시크릿 이름 | 값 |
|---|---|
| `ASC_API_KEY_BASE64` | `.p8` 개인키 파일을 base64로 인코딩한 문자열 |
| `ASC_API_KEY_ID` | 키 ID (10자 영숫자) |
| `ASC_API_ISSUER_ID` | Issuer ID (계정 단위 UUID) |

발급 위치는 App Store Connect › **사용자 및 액세스 › 통합 › App Store Connect API**다.
역할은 **App Manager** 이상이면 된다(Admin까지 줄 이유가 없다). `.p8` 파일은 **생성 직후
한 번만 내려받을 수 있고** 다시 받을 수 없다 — 잃으면 키를 폐기하고 새로 만든다.

보관 위치는 KAN-163의 안드로이드 키스토어와 같은 규칙이다: **레포 밖**, GitHub 시크릿과
계정 소유자 로컬 두 곳. `.p8`을 레포에 넣으면 그것만으로 TestFlight 업로드 권한이 새어 나간다
(`docs/wiki/android-release-signing.md`).

TestFlight 업로드는 워크플로의 `workflow_dispatch` 입력 `upload` 스위치로 켠다. **기본은
꺼짐**이다 — 아카이브가 되는지 보려고 돌린 CI가 TestFlight에 빌드를 밀어 올리면 빌드 번호만
버려진다.

### 릴리스 워크플로 (`.github/workflows/ios-release.yml`)

4단계에서 신설했다. 안드로이드 짝은 `.github/workflows/app-release.yml`이고
(`android-release-signing.md` §3) 러너가 갈려서(ubuntu / macos) 파일을 나눴다 — 한 잡에
두 플랫폼을 넣을 수 없고, 잡을 나눌 바에는 파일을 나누는 편이 `paths` 필터도 concurrency
그룹도 따로 잡힌다.

트리거는 **`Release` 브랜치 푸시**(`ios/**`와 이 워크플로 파일만) + **수동 실행**이다. 겹친
실행은 취소하지 않고 기다린다. 수동 실행에만 입력이 둘 있다 — app-release.yml이 입력을 하나도
두지 않은 것과 갈리는 자리인데, 그쪽은 늘 같은 일을 하고 이쪽은 실행마다 갈리는 결정이 둘이다.

| 입력 | 기본 | 무엇 |
|---|---|---|
| `upload` | **꺼짐** | 켜면 TestFlight까지 올린다. 기본을 끈 이유는 빌드 번호가 소모품이 아니어서다 — 아카이브가 되는지 보려고 돌린 실행이 올라가면 그 번호는 영영 다시 못 쓴다 |
| `allow_test_ads` | **꺼짐** | 켜면 AdMob 빗장을 풀고 `Base.xcconfig`의 Google 테스트 ID로 빌드한다. 광고 시크릿 셋이 없는 동안 「아카이브·서명 경로가 사는가」만 보려는 스위치다. `upload`와 함께 켜면 **첫 스텝에서 실패**한다 (테스트 광고 빌드를 TestFlight에 올리면 AdMob 정책 위반이고 빌드 번호만 버린다) |

11스텝: ① checkout ② 도구 버전 ③ **입력·시크릿 검사**(20분 아카이브를 태우기 전에) ④ 짧은 SHA
⑤ ASC `.p8`을 `$RUNNER_TEMP`에 base64 디코딩(체크아웃 밖 — 레포 안에 두면 아티팩트에 딸려 나갈 수
있다) ⑥ `xcodebuild archive … CODE_SIGNING_ALLOWED=NO` ⑦ `-exportArchive`로 재서명·`.ipa`
⑧ **산출물 검증** ⑨ 아티팩트 업로드 ⑩ TestFlight 업로드(`upload`가 켜진 실행만) ⑪ 실행 요약.

**⑥⑦은 `ios/README.md` 「아카이브 → export」와 같은 명령이다.** 로컬과 CI가 갈리면 한쪽에서만
재현되는 서명 문제를 쫓게 된다.

#### 시크릿

| 이름 | 값 | 어디서 얻나 | 누가 |
|---|---|---|---|
| `ASC_API_KEY_BASE64` | `.p8` 개인키를 base64 한 줄로 | App Store Connect › 사용자 및 액세스 › 통합 › App Store Connect API (역할 **App Manager**). `.p8`은 생성 직후 한 번만 받을 수 있다 | 계정 소유자 |
| `ASC_API_KEY_ID` | 키 ID (10자 영숫자) | 같은 화면의 키 목록 | 계정 소유자 |
| `ASC_API_ISSUER_ID` | Issuer ID (계정 단위 UUID) | 같은 화면 상단 | 계정 소유자 |
| `ADMOB_IOS_APP_ID` | AdMob **iOS 앱**의 앱 ID | AdMob 콘솔 › 앱 › 앱 설정 (`ads-admob.md` §7.2) | 계정 소유자 |
| `ADMOB_IOS_INTERSTITIAL_ID` | iOS 전면 광고 단위 ID | AdMob 콘솔 › 광고 단위 | 계정 소유자 |
| `ADMOB_IOS_REWARDED_ID` | iOS 보상형 광고 단위 ID | AdMob 콘솔 › 광고 단위 | 계정 소유자 |
| `KAKAO_NATIVE_APP_KEY` | 카카오 네이티브 앱 키 | **이미 등록돼 있다** (KAN-163에서 안드로이드용으로 등록한 것과 같은 값) | 등록 완료 |

**워크플로가 읽는 시크릿은 총 7개**다 — 새로 등록할 것이 6개(ASC 셋 + AdMob iOS 셋)이고,
`KAKAO_NATIVE_APP_KEY` 1개는 KAN-163에서 안드로이드용으로 등록해 둔 것을 그대로 쓴다.
카카오 키가 플랫폼별로 갈리지 않는 것은 카카오 콘솔이 앱 하나에 네이티브 앱 키 하나를 주고
iOS 번들 ID·안드로이드 패키지명을 그 아래 등록하기 때문이다. 안드로이드 릴리스 워크플로와
같은 시크릿을 공유한다.

**AdMob 셋에만 `_IOS_` 접두가 붙는 이유.** 저장소 시크릿은 평면 이름공간인데 AdMob 콘솔의 iOS
앱은 안드로이드 앱과 별개 레코드라 ID도 별개다. 안드로이드 쪽이 `ADMOB_APP_ID` 등으로 먼저
자리를 잡았으므로(`ads-admob.md` §3.1), 플랫폼을 이름에 박지 않으면 둘 중 하나가 남의 ID로
빌드된다. 워크플로 안에서는 이 셋을 `ADMOB_APP_ID` 등 xcconfig가 아는 이름으로 바꿔 넘긴다.

**ASC 키 셋은 `upload`를 꺼도 필요하다.** export 단계가 무서명 아카이브를 재서명하며 App ID·
Apple Distribution 인증서·프로비저닝 프로파일을 스스로 만드는데, 그 통신에 자격 증명이 있어야
한다 — 로컬에서는 Xcode에 로그인된 Apple ID가 그 자리를 채우지만 러너에는 계정이 없다.
`xcodebuild`에 넘기는 옵션은 `-authenticationKeyPath` · `-authenticationKeyID` ·
`-authenticationKeyIssuerID` 셋이고, `-allowProvisioningUpdates` 항목이 이 셋을 요구한다고
`xcodebuild -help`가 적고 있다 (Xcode 26.6 / 17F113).

#### AC 대응

| AC | 워크플로가 하는 일 |
|---|---|
| 배포 인증서로 서명됐다 | `.ipa`를 풀어 `codesign -dv --verbose=4`의 Authority가 `Apple Distribution`이고 팀이 `559P9SYY57`인지 본다. `Apple Development`면 실패 — TestFlight가 받지 않는다 |
| 프로덕션 주소를 본다 | 번들 `Info.plist`의 `WEB_URL`·`API_BASE_URL`이 `https://accentury.app`이 아니면 **실패**한다. 실기기 확인용 cloudflared 터널 URL이 박힌 빌드가 스토어로 나가는 것을 막는 빗장이다 |
| 카카오 키가 들어갔다 | 번들 `Info.plist`의 `KAKAO_NATIVE_APP_KEY`가 비어 있지 않은지 본다. 값은 찍지 않고 길이만 찍는다 |
| 테스트 광고가 아니다 | 번들 `Info.plist`의 `GADApplicationIdentifier`·`ADMOB_INTERSTITIAL_ID`·`ADMOB_REWARDED_ID`가 Google 테스트 퍼블리셔 ID(`ca-app-pub-3940256099942544`)가 아닌지 본다. `project.yml`의 `REQUIRE_ADMOB_IDS=YES` 빗장은 **빌드 입력**을 보므로, 이쪽은 산출물을 보는 두 번째 잠금이다 |
| 로그에 시크릿이 없다 | 값을 `echo`하는 곳이 없다. 존재 검사는 `-z`로 이름만, 광고 ID 검사는 패턴 매칭만, 카카오 키는 글자 수만 |

산출물은 아티팩트 `accentury-ios-release-<sha7>`(`.ipa` + 아카이브의 `dSYMs`, 90일 보관)이고,
실행 요약에 커밋·ref·트리거·버전/빌드 번호·`.ipa` 크기·서명 Authority·`WEB_URL`·광고 ID 종류·
업로드 여부가 표로 뜬다. 버전은 xcconfig가 아니라 **산출물 `Info.plist`에서 읽은 값**이다.

**업로드 방식.** `upload`가 켜지면 레포의 `ExportOptions.plist`를 `$RUNNER_TEMP`로 복사해
`plutil -replace destination -string upload`로 한 줄만 덮고 `-exportArchive`를 한 번 더 부른다.
`xcrun altool --upload-app`을 쓰지 않은 이유는 도구가 하나 더 늘고 인증 규칙이 갈려서다 — altool은
`.p8`이 `~/.private_keys/AuthKey_<키 ID>.p8`(또는 `API_PRIVATE_KEYS_DIR`)에 있어야 찾으므로 키 ID가
박힌 경로를 한 번 더 만들어야 하고 그 경로가 오류 메시지에 실린다. `-exportArchive` 쪽은 export
스텝이 이미 쓰는 같은 도구·같은 plist·같은 인증 옵션이고 `.p8`은 경로로만 넘어간다.
`destination`의 허용값이 `export`/`upload` 둘인 것은 `xcodebuild -help`의
「Available keys for -exportOptionsPlist」에서 확인했다.

#### 수동 대체

워크플로 없이도 같은 결과를 낼 수 있다. `ios/README.md` 「릴리스 아카이브 · TestFlight」의 명령을
그대로 돌려 `.ipa`를 만들고 Transporter나 `xcrun altool --upload-app`으로 올린다. 워크플로가 더
하는 일은 검증 스텝과 아티팩트 보관뿐이다.

#### 아직 러너에서 돌려 보지 않았다

시크릿 6개가 등록되기 전이라 실제 실행 기록이 없다. 대신 2026-09-22에 **로컬에서 워크플로의 셸
스텝을 그대로 떼어 돌렸다**: Release 아카이브(무서명) → `ExportOptions.plist`로 export →
검증 스크립트. 결과는 서명 `Apple Distribution: Seongju Lee (559P9SYY57)`, 버전 `1.0` 빌드 `6`,
`WEB_URL`·`API_BASE_URL` 모두 `https://accentury.app`, `.ipa` 6.2MB였고, 테스트 광고 ID가 든
번들에 `allow_test_ads=false` 경로를 물리자 검증이 의도대로 실패했다. 러너에서 처음 돌릴 때
갈릴 수 있는 것은 도구 버전(러너 Xcode)과 `-allowProvisioningUpdates`의 API 키 인증 경로다 —
로컬은 Xcode 계정으로 통과했고 러너는 `.p8`로 통과해야 한다.

## 3. 스토어 등록 정보 문안

콘솔에 그대로 붙여 넣는 값이다. 글자 수는 실제로 센 값이고 전부 제한 안에 든다.

| 필드 | 값 | 제한 |
|---|---|---|
| 앱 이름 | `Accentury - 사투리 억양 테스트` | 30자 (현재 **22자**) |
| 부제 | `목소리로 재는 경남 사투리 억양 등급` | 30자 (현재 **20자**) |
| 프로모션 텍스트 | 아래 블록 | 170자 (현재 **100자**), 선택 |
| 설명 | 아래 블록 | 4000자 (현재 **469자**) |
| 키워드 | `사투리,억양,경남,방언,말투,테스트,퀴즈,부산,경상도,목소리,발음,토박이,동남방언,사투리테스트,억양테스트` | 100자 (현재 **58자**) |
| 기본 카테고리 | 엔터테인먼트 | |
| 보조 카테고리 | **비워 둔다** | 선택 |
| 지원 URL | `https://accentury.app/` | 필수 |
| 마케팅 URL | `https://accentury.app/` | 선택 |
| 개인정보 처리방침 URL | `https://accentury.app/privacy.html` | 필수 — §10, 확장자 `.html` 필수 |
| 저작권 | `2026 Accentury` | (팀 확인) 권리자 표기는 지금 개인 계정 명의다 |
| 연락처 이메일 | `team2pl1@gmail.com` | 방침 13항 문의처와 같은 주소 |

### 앱 이름을 Play와 같게 둔 이유

`Accentury - 사투리 억양 테스트`는 KAN-174가 2026-09-22 Play Console에 실제로 등록한 순서
그대로다(`play-store-listing.md` §3). App Store에는 부제와 키워드 필드가 따로 있어서 검색어를
이름에 욱여넣을 필요가 Play보다 적지만, 그래도 같은 이름을 쓴다.

- 두 스토어에서 이름이 갈리면 같은 앱이 다른 물건으로 보인다. 공유 링크와 홍보 글이 두 벌이 된다
- `accentury`는 검색되지 않는 조어다. 이름에 「사투리」가 남아 있어야 브랜드를 모르는 사람이 닿는다
- 검색 결과에서 이름이 잘릴 때 남는 쪽이 브랜드다 — 브랜드를 앞에 둔 KAN-174의 판단을 그대로 잇는다

런처 아이콘 아래 표시되는 이름은 `CFBundleDisplayName = Accentury`
(`ios/Accentury/Info-Release.plist:14`)로 짧은 쪽을 그대로 둔다. 스토어 이름과 홈 화면
이름은 별개 값이고, 홈 화면에서는 짧은 쪽이 낫다.

### 보조 카테고리를 비우는 이유

교육을 넣고 싶은 유혹이 있는데, 이 앱에는 가르치는 기능이 없다. 사투리를 재 줄 뿐 배우게
하지 않는다. 교육 카테고리로 검색해 들어온 사람이 기대하는 것과 어긋나고, 그 어긋남은
평점으로 돌아온다. 학습 기능이 생기면 그때 넣는다.

### 키워드를 고른 근거

App Store의 키워드 필드는 **이용자에게 보이지 않고 검색에만 쓰인다.** 쉼표로 나누고 공백을
넣지 않는다(공백도 100자에 센다). 앱 이름과 부제에 이미 든 낱말은 검색에 반영되므로 키워드에
다시 적지 않아도 되지만, 애플이 그 규칙을 공표한 적은 없어 핵심어는 겹쳐 둔다.

고른 축은 셋이다 — **무엇을 재는가**(사투리·억양·방언·말투·발음·동남방언), **어디 말인가**
(경남·부산·경상도·토박이), **어떤 물건인가**(테스트·퀴즈·목소리·사투리테스트·억양테스트).
42자가 남지만 관련 없는 낱말로 채우지 않는다. 애플은 무관한 키워드를 메타데이터 거절
사유로 본다.

### 프로모션 텍스트 (170자, 현재 100자)

```
문장 다섯 개를 소리 내어 읽으면 경남 사투리 억양을 점수로 재 드려요. 어휘 문항까지 더해 다섯 등급 중 내 자리를 확인하고, 결과 카드를 카카오톡으로 친구에게 보낼 수 있어요.
```

프로모션 텍스트는 **심사 없이 아무 때나 바꿀 수 있는 유일한 문안**이다. 설명을 고치려면
새 버전을 제출해야 하지만 이 칸은 즉시 반영된다. 그래서 여기에는 버전을 타지 않는 말만
넣는다 — 이벤트나 한시적 안내를 넣을 자리로 남겨 둔다.

### 설명 (4000자, 현재 469자)

```
내 말투에 사투리가 얼마나 남아 있을까?

문장 몇 개를 소리 내어 읽으면 경남 사투리 억양을 점수로 재 드려요.
단어 문항까지 더해 억양과 어휘 두 축으로 보고, 다섯 등급 중 하나를 매겨요.

■ 이렇게 진행돼요
1. 마이크 권한을 허용하고 시작해요
2. 화면에 뜨는 문장을 소리 내어 읽어요 — 마음에 안 들면 다시 읽어도 돼요
3. 사투리 단어 문항에 답해요
4. 억양 점수, 어휘 점수, 그리고 내 등급을 확인해요

■ 결과는 이렇게 나와요
· 억양 점수와 어휘 점수를 따로 보여 줘요
· 다섯 등급 중 내 자리와 한 줄 총평을 받아요
· 결과 화면을 카카오톡으로 친구에게 보낼 수 있어요

■ 목소리는 남기지 않아요
녹음한 음성은 점수를 매기는 그 순간에만 쓰고 곧바로 지워요. 서버에 보관하지 않고
다른 곳에 보내지도 않아요. 회원가입도 로그인도 없어요.

경남 사투리로 먼저 시작해요. 다른 지역은 차차 넓혀 갈 계획이에요.
```

KAN-174 §3의 Play 문안과 **한 글자도 다르지 않다.** iOS에서 사실이 갈리는 줄이 있는지
전부 훑었고, 없다.

- 카카오톡 공유는 iOS에도 있다. `ios/Accentury/Share/ResultSharer.swift`가 `KakaoSDKShare`·
  `KakaoSDKTemplate`을 쓰고, `ios/project.yml:34-36`이 `KakaoOpenSDK` 2.29.0을 못 박는다
  (KAN-180). **지라 KAN-175의 Related에 적힌 「카카오 SDK 미탑재 상태로 제출」은 낡은 서술이다**
  — KAN-180이 탑재를 끝냈고, 이 문서가 그 정정 기록이다
- 마이크 권한, 회원가입 없음, 음성 즉시 삭제는 플랫폼과 무관하게 같다

「목소리는 남기지 않아요」 문단은 장식이 아니다. §5의 세 자리 대조와 §6의 오디오 항목 판단이
전부 이 문단과 같은 말을 해야 한다.

## 4. 그래픽 자산

| 콘솔 항목 | 파일 | 규격 |
|---|---|---|
| 6.7" 디스플레이 스크린샷 | `assets/screenshots/out/appstore-6.7/01-intro.png` · `02-recording.png` · `03-vocab.png` · `04-result.png` | 1290x2796 (실측 확인) |
| 6.1" 디스플레이 스크린샷 | `assets/screenshots/out/appstore-6.1/` 같은 네 장 | 1179x2556 (실측 확인) |
| 앱 아이콘 1024 | **업로드하지 않는다** — 빌드에 들어 있다 | 1024x1024, 알파 없음 |
| App Store 프리뷰 영상 | **없음** | 선택 항목이라 비워 둔다 |

아이콘을 따로 올리지 않는 이유는 애플이 몇 년 전 그 칸을 없앴기 때문이다. 이제 App Store에
표시되는 아이콘은 **빌드의 에셋 카탈로그에서 꺼내 쓴다** —
`ios/Accentury/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`(1024x1024, RGB, 알파 없음,
`assets/app-icon/README.md`). `assets/app-icon/store/app-store-icon-1024.png`는 그 사본이고
Play 쪽 512 아이콘과 나란히 두려고 남긴 편의 파일이다.

스크린샷은 6.7"만 올려도 6.1"에 자동으로 축소 적용되지만 **두 규격을 다 올린다.** 프레임
안의 기기 실루엣과 문구 크기가 규격마다 따로 렌더링되므로, 자동 축소보다 원본 렌더가 깨끗하다
(`assets/screenshots/README.md`).

원본 캡처는 시뮬레이터(iPhone 17 Pro)다. 실기기 캡처로 갈아 끼우면 더 낫고, 교체는
`raw/ios/`에 덮고 `assets/screenshots/build.py`를 다시 돌리는 것이 전부다
(`docs/wiki/app-icon-assets.md` §7 이월).

## 5. 마이크·ATT 고지 대조

앱이 띄우는 시스템 권한 프롬프트는 둘이다 — 마이크와 추적(ATT). 각 프롬프트의 문구,
스토어 설명, 방침, 라벨이 같은 말을 해야 한다.

### 마이크

| 자리 | 실제 문자열 |
|---|---|
| iOS 권한 프롬프트 | `억양 분석을 위해 마이크로 목소리를 녹음해요. 녹음은 분석 후 즉시 삭제돼요.` (`ios/Accentury/Info-Release.plist:349` `NSMicrophoneUsageDescription`) |
| 앱 내 권한 게이트 | `발음 분석에 마이크가 필요해요` / `음성은 분석 즉시 삭제돼요` (`ios/Accentury/Permission/PermissionGateView.swift:67-68`) |
| 스토어 설명 | `녹음한 음성은 점수를 매기는 그 순간에만 쓰고 곧바로 지워요` (§3) |
| 방침 1항 음성 행 | 분석이 끝나면 즉시 삭제 (Accentury_Server `docs/wiki/privacy-policy.md` §1, 근거 Accentury_Server `ai/app/tempstore.py:10-12`) |
| 개인정보 라벨 | 「오디오 데이터」 신고 없음 (§6) |

네 자리가 전부 **「분석 즉시 삭제」** 한 문장이다. 라벨이 비어 있는 것도 같은 사실의 다른
표현이고, §6이 그 연결을 설명한다.

심사 가이드라인 5.1.1(ii)는 목적 문자열이 데이터 사용을 「명확하고 완전하게」 설명할 것을
요구한다. 우리 문자열은 용도(억양 분석)와 처분(즉시 삭제)을 둘 다 담고 있어 그 기준을 넘는다.

### 추적 (ATT)

| 자리 | 실제 문자열·답 |
|---|---|
| ATT 프롬프트 | `허용하시면 관심사에 맞는 광고를 보여 드려요. 허용하지 않으셔도 광고는 나오지만 맞춤형이 아닌 일반 광고만 나와요.` (`ios/Accentury/Info-Release.plist:136` `NSUserTrackingUsageDescription`) |
| 앱 내 동의 시트 | 웹 `web/src/ads/adConsentText.ts`의 `AD_CONSENT_EFFECT`(`admob` 키) — 같은 취지 |
| 개인정보 라벨 | 「추적」 = **예**, 「추적에 사용되는 데이터」에 식별자 › 기기 ID (§6) |

**순서가 중요하다.** 앱 안 동의 시트에서 `granted`가 들어온 직후에만 ATT를 부른다
(`docs/wiki/ads-admob.md` §7.5, `AdsController.setConsent` → `preloadAfterTrackingSettled`).
시트가 먼저여야 ATT 프롬프트가 맥락을 가지고, 거부한 사람에게는 ATT를 아예 묻지 않는다 —
추적하지 않는데 추적 허용을 묻는 것은 심사관에게도 설명이 안 된다.

가이드라인 5.1.2는 **추적 허용을 앱 사용의 조건으로 걸지 못하게 한다.** 우리는 거부해도
비맞춤 광고(`npa=1`)로 전 기능이 그대로 돈다. 이 사실을 §8의 심사 노트에 명시한다.

## 6. 앱 개인정보 보호 세부사항 (Privacy Nutrition Label)

**이 절이 KAN-175의 무게중심이다.** Accentury_Server `docs/wiki/privacy-policy.md` §2의 App Store 표는
2026-09-11 시점 스냅샷이고, 지금부터 **이 절이 정본**이다. 코드가 바뀌면 여기부터 고치고
콘솔을 갱신한다 — 신고와 실제 동작이 어긋나는 것이 곧 정책 위반이다.

### 6.1 애플의 정의 — Play와 답이 갈리는 이유

출처: <https://developer.apple.com/app-store/app-privacy-details/> (2026-09-22 확인)

> **Collect** refers to transmitting data off the device in a way that allows you and/or your
> third-party partners to access it for a period longer than what is necessary to service the
> transmitted request in real time.
>
> Examples of data not collected: … Data sent to servers then immediately discarded after
> servicing the request.

> **Tracking** refers to linking data collected from your app about a particular end-user or
> device with Third-Party Data for targeted advertising or advertising measurement purposes,
> or sharing data collected from your app with a data broker.

Play의 데이터 안전에는 「일시적으로만 처리되며 저장되지 않음」 체크박스가 따로 있다.
애플에는 그 칸이 없고, 같은 사정이 **「수집」의 정의 안**에 들어 있다. 그래서 Play에서
「수집 + 일시 처리」로 신고한 음성이 App Store에서는 **신고 대상이 아니게** 된다. 두 표가
다르게 보이는 것은 실제 동작이 달라서가 아니라 두 스토어가 같은 사실을 다른 칸으로 받기
때문이다.

### 6.2 확정 답안

| # | 데이터 유형 | 수집 | 사용자와 연결 | 추적에 사용 | 목적 | 근거 |
|---|---|---|---|---|---|---|
| ① | 사용자 콘텐츠 › 오디오 데이터 | **아니요** | — | — | — | 6.3 ① |
| ② | 사용 데이터 › 제품 상호작용 | 예 | **연결됨** | 아니요 | 분석 · 제3자 광고 · 개발자 광고 · 앱 기능 | 6.3 ② |
| ③ | 진단 › 비정상 종료 데이터 | 예 | 연결되지 않음 | 아니요 | 분석 · 앱 기능 | 6.3 ③ |
| ④ | 진단 › 성능 데이터 | 예 | 연결되지 않음 | 아니요 | 분석 · 제3자 광고 · 개발자 광고 · 앱 기능 | 6.3 ③ |
| ⑤ | 진단 › 기타 진단 데이터 | 예 | 연결되지 않음 | 아니요 | 분석 · 앱 기능 · 제3자 광고 · 개발자 광고 | 6.3 ③ |
| ⑥ | 식별자 › 기기 ID | 예 | **연결됨** | **예** | 제3자 광고 · 개발자 광고 · 분석 | 6.3 ④ |
| ⑦ | 사용 데이터 › 광고 데이터 | 예 | **연결됨** | 아니요 | 제3자 광고 · 개발자 광고 · 분석 | 6.3 ④ |
| ⑧ | 위치 › 대략적 위치 | 예 | **연결됨** | 아니요 | 제3자 광고 · 개발자 광고 · 분석 · 앱 기능 | 6.3 ⑤ |
| ⑨ | 연락처 정보 › 이메일 주소 | 예 | **연결됨** | 아니요 | 앱 기능 | 6.3 ⑥ |
| ⑩ | 사용자 콘텐츠 › 기타 사용자 콘텐츠 | 예 | **연결됨** | 아니요 | 앱 기능 | 6.3 ⑦ |
| ⑪ | 기타 데이터 › 기타 데이터 유형 | 예 | **연결됨** | 아니요 | 앱 기능 | 6.3 ⑧ |

**「이 앱은 사용자를 추적합니까」 = 예.** ⑥ 하나 때문이고, 그 하나로 ATT 프롬프트가 필요해진다.

콘솔 답안의 1차 근거는 **각 SDK가 스스로 선언한 개인정보 매니페스트**(`PrivacyInfo.xcprivacy`)다.
Xcode가 아카이브 때 이것들을 합쳐 개인정보 보고서를 만들고, 애플이 그 보고서와 우리 라벨을
대조한다. 그래서 SDK 몫은 추측하지 않고 매니페스트를 읽어서 옮겼다.

대조 대상은 중간 산출물이 아니라 **최종 아카이브가 담은 앱 번들**이다. 스토어로 실제 올라가는
바이너리가 그것이고, 개인정보 보고서도 그 번들 안에 실린 매니페스트를 합친다. 중간 산출물
`…/ArchiveIntermediates/Accentury/BuildProductsPath/Release-iphoneos/`를 기준으로 삼으면 안
된다 — 거기 실체로 있는 것은 프레임워크 둘뿐이고 나머지 번들은 심볼릭 링크라 `find`가 두 개만
찾는다. SDK 넷을 통째로 놓친다.

```bash
find <아카이브>/Accentury.xcarchive/Products/Applications/Accentury.app \
  -name PrivacyInfo.xcprivacy
```

2026-09-23 아카이브에서 **21개**가 나왔다. 앱 번들 루트의 `*.bundle` 19개와 `Frameworks/` 밑
프레임워크 2개다. 그중 수집 항목을 실제로 선언하는 것은 아래 여섯이다.

| SDK | 앱 번들 안 경로 | 선언하는 라벨 행 |
|---|---|---|
| Google Mobile Ads 13.9.0 | `Frameworks/GoogleMobileAds.framework` | ②③④⑤⑥⑦⑧ |
| UserMessagingPlatform (AdMob 전이 의존) | `Frameworks/UserMessagingPlatform.framework` | ②④⑧ (전부 목적 앱 기능) |
| Firebase Crashlytics | `Firebase_FirebaseCrashlytics.bundle` | ③⑤ |
| Firebase Installations | `Firebase_FirebaseInstallations.bundle` | ⑤ |
| GoogleDataTransport | `GoogleDataTransport_GoogleDataTransport.bundle` | ⑤ |
| Kakao SDK 2.29.0 | `KakaoOpenSDK_KakaoSDKCommon.bundle` | ⑪ |

나머지 15개 — Alamofire · nanopb · Promises 둘 · GoogleUtilities 여덟 · FirebaseCore 계열 셋 —
은 매니페스트에 수집 항목을 하나도 싣지 않는다. 라벨에 보탤 몫이 없다.

읽는 명령은 `plutil -convert json -o - <경로>`다. **제출 전에 Xcode › Product › Archive ›
Generate Privacy Report를 한 번 돌려 위 표와 대조한다** — SDK를 올리면 매니페스트가 조용히
바뀌고, 그때 이 표가 낡는다.

### 6.3 항목별 근거

**목적 열은 링크된 모든 매니페스트의 합집합 + 우리 앱 자체 몫이다.** 애플이 우리 라벨과 대조하는
것은 Xcode 개인정보 보고서(Product › Archive › Generate Privacy Report)이고, 그 보고서는
**링크된** 매니페스트 전부를 기계적으로 합친다. 우리가 그 SDK를 부르는지는 보지 않는다. 그래서
UserMessagingPlatform이 문제가 된다 — AdMob의 전이 의존으로 따라 들어와 링크만 됐을 뿐
우리 코드는 한 줄도 호출하지 않는데, 매니페스트는 `CoarseLocation`·`PerformanceData`·
`ProductInteraction`을 목적 **앱 기능**으로 선언한다. 호출 여부와 무관하게 보고서에 그대로
뜨므로, 그 세 행의 목적에 「앱 기능」이 빠지면 보고서와 라벨이 어긋난다. 선언에 맞춘다.

좁게 신고해서 어긋나는 쪽이 넓게 신고하는 쪽보다 훨씬 나쁘다는 판단은 ②의 연결 여부와 같다.

**① 사용자 콘텐츠 › 오디오 데이터 — 수집하지 않는다고 신고한다.**

녹음은 서버로 나간다. 그런데도 「수집 아님」인 이유는 6.1의 정의 때문이다 — 서버가 요청을
처리하는 동안만 들고 있다가 즉시 버린다.

| 사실 | 근거 |
|---|---|
| 분석이 끝나면 `finally`에서 삭제. 성공·실패·예외·취소 네 경로 모두 | Accentury_Server `ai/app/tempstore.py:10-12` (KAN-27) |
| 소유자 전용(700) 디렉터리, 로그에 경로·파일명 없음 | 같은 파일 `:7-9`·`:16` |
| DB에 오디오 컬럼이 없음 | Accentury_Server `backend/src/main/java/app/accentury/backend/` 밑 `session/TestSession.java` · `result/TestResult.java` · `vocab/VocabAnswer.java` |
| S3·다른 저장소로도 가지 않음 | 2026-09-01 팀 회의 결정, Accentury_Server `infra/privacy/README.md` |

**반대 논거도 적어 둔다.** 프로세스가 kill돼 `finally`가 실행조차 못 한 경우를 대비한 30분
청소 잡이 있다(Accentury_Server `ai/app/config.py:18-19`, 같은 레포
`backend/src/main/resources/application.yml:161` `upload.temp-retention: 30m`). 그
실패 경로에서는 파일이 최대 30분 남는다. 「실시간 요청 처리에 필요한 시간」보다 길다고 읽으면
「수집」이 된다.

판단은 **「수집 아님」**이다. 30분 창은 설계된 보존이 아니라 사고에 대비한 청소 주기이고,
그 사이에도 우리가 그 파일을 읽어 쓰는 경로가 없다. 애플의 정의가 묻는 것은
「접근할 수 있게 두었는가」이지 「디스크에 몇 초 있었는가」가 아니다.

보수적으로 신고하기로 팀이 정하면 답은 이렇게 바뀐다 — **오디오 데이터, 수집, 사용자와
연결되지 않음, 추적 아님, 목적 앱 기능.** 한 칸만 고치면 되므로 되돌리기 쉽다.

**경보선:** 서버가 오디오를 요청 시간보다 오래 들고 있게 바뀌는 순간(모델 재학습용 적재,
품질 검수용 보관, 비동기 큐잉 등) 이 답은 즉시 「수집」으로 뒤집힌다. 그 변경은 Accentury_Server
`ai/app/tempstore.py`의 계약 테스트를 먼저 깨므로 신호가 온다(같은 레포
`docs/wiki/privacy-policy.md` §4).

**② 사용 데이터 › 제품 상호작용 — 수집, 연결됨, 추적 아님.**

두 출처가 겹친다.

- **GA4 계측** (KAN-33). 익명 이벤트다. `setUserID`를 부르는 곳이 없고 광고 식별자를 붙이지
  않는다(`google_analytics_adid_collection_enabled=false`, `docs/wiki/analytics.md` §3).
  계측만 보면 「연결되지 않음」이다
- **AdMob SDK**. 매니페스트가 `ProductInteraction`을 `Linked=true`, 목적 분석·개발자 광고·
  제3자 광고로 선언한다
- **UserMessagingPlatform**. 같은 유형을 `Linked=false`, 목적 **앱 기능**으로 선언한다

라벨은 데이터 유형당 한 답이라 **넓은 쪽을 쓴다** — 「연결됨」. 좁게 신고했다가 SDK 매니페스트와
어긋나는 것이 반대보다 훨씬 나쁘다.

목적은 세 출처의 합집합이라 넷 전부다 — **분석 · 제3자 광고 · 개발자 광고 · 앱 기능**. 마지막
하나가 UMP 몫이고, 우리가 UMP를 부르지 않아도 넣는 이유는 이 절 머리에 적었다.

추적 여부는 AdMob 매니페스트를 따라 **아니요**다. Google은 자기 SDK가 추적에 쓰는 것을
`DeviceID` 하나로만 선언한다(`Tracking=true`가 그것뿐이다). Accentury_Server
`docs/wiki/privacy-policy.md` §2의 2026-09-11 스냅샷은 「AdMob SDK 몫은 추적에 사용됨으로
별도 표기」라고 적어 두었는데, 그때는 매니페스트를 읽기 전이었다. **이 문서가 그 줄을 대체한다.**

**③ 진단 › 비정상 종료 데이터 · 성능 데이터 · 기타 진단 데이터 — 수집, 연결되지 않음, 추적 아님.**

| 출처 | 선언 |
|---|---|
| Firebase Crashlytics | `CrashData`·`OtherDiagnosticData`, 목적 앱 기능 |
| Firebase Installations | `OtherDiagnosticData`, 목적 분석 |
| GoogleDataTransport | `OtherDiagnosticData`, 목적 분석 |
| AdMob | `CrashData` 목적 분석 / `PerformanceData`·`OtherDiagnosticData` 목적 제3자 광고·개발자 광고·분석 |
| UserMessagingPlatform | `PerformanceData`, 목적 앱 기능 |

다섯 출처가 전부 「연결되지 않음」·「추적 아님」이라 그 두 칸은 다툼이 없다. 목적만 합집합으로
고르는데, 그 결과가 6.2 표의 세 행이다.

| 라벨 행 | 목적 합집합 |
|---|---|
| ③ 비정상 종료 데이터 | 앱 기능(Crashlytics) + 분석(AdMob) |
| ④ 성능 데이터 | 제3자 광고·개발자 광고·분석(AdMob) + 앱 기능(UMP) |
| ⑤ 기타 진단 데이터 | 앱 기능(Crashlytics) + 분석(Installations·GoogleDataTransport·AdMob) + 제3자 광고·개발자 광고(AdMob) |

**AdMob이 `CrashData`도 선언한다**는 것이 ③에 「분석」이 붙는 유일한 근거다. Crashlytics만
보면 ③은 「앱 기능」 한 칸이다.

**④ 식별자 › 기기 ID · 사용 데이터 › 광고 데이터 — 수집, 연결됨. 기기 ID만 추적.**

AdMob SDK가 광고 요청에 IDFA를 싣는다(`docs/wiki/ads-admob.md` §7.1 — 광고 SDK가
AdSupport·AppTrackingTransparency를 링크한다). 매니페스트 선언 그대로 옮겼다:
`DeviceID`는 `Linked=true`·`Tracking=true`, `AdvertisingData`는 `Linked=true`·`Tracking=false`.

**동의를 거부해도 이 항목은 남는다.** 비맞춤 광고(`npa=1`)도 식별자를 빈도 제한·집계 보고·
부정 사용 방지에 쓴다(Accentury_Server `docs/wiki/privacy-policy.md` §1 10항 근거 행).
그래서 「선택 수집」이 아니라 「광고가 나가는 한 수집」이고, Play 신고에서 ④를 선택사항으로
두지 않은 것과 같은 판단이다.

ATT를 거부하면 SDK가 IDFA를 읽지 못해 실제로는 값이 안 나간다. 그래도 라벨은 「어떤 이용자에게
일어날 수 있는가」를 묻는 것이지 「모든 이용자에게 일어나는가」가 아니다.

**⑤ 위치 › 대략적 위치 — 수집, 연결됨, 추적 아님.**

**앱은 위치 권한을 요구하지 않는다.** `NSLocationWhenInUseUsageDescription` 계열 키가
`Info-Release.plist`에 없고, 위치 API를 부르는 코드도 없다. 그런데도 신고한다.

근거는 셋이다.

- AdMob 매니페스트가 `CoarseLocation`을 `Linked=true`, 목적 제3자 광고·분석·개발자 광고로
  **직접 선언한다**. Xcode 개인정보 보고서에 그대로 들어가므로 라벨에 없으면 보고서와 어긋난다
- UserMessagingPlatform도 같은 유형을 `Linked=false`, 목적 **앱 기능**으로 선언한다. 연결
  여부는 넓은 쪽인 「연결됨」, 목적은 합집합이라 「앱 기능」이 한 칸 더 붙는다
- Google 문서가 그 출처를 밝힌다 — 「IP address, which may be used to estimate the general
  location of a device」 (<https://developers.google.com/admob/ios/privacy/data-disclosure>,
  2026-09-22 확인)

즉 GPS가 아니라 **IP에서 추정한 대략 위치**다. 애플의 「대략적 위치」 정의가
「위도·경도 소수점 셋째 자리보다 낮은 해상도」라 여기 들어맞는다.

Play 데이터 안전에는 위치를 신고하지 않았다(`play-store-listing.md` §5). 구글이 자기
서비스로 받는 IP를 Play 정의상 「서비스 제공업체」 몫으로 처리하기 때문이고, 애플에는 그
구분이 없다. **두 스토어의 답이 정당하게 갈리는 자리**라 양쪽 문서에 서로를 가리키는 줄을
남긴다.

**⑥ 연락처 정보 › 이메일 주소 — 수집, 연결됨, 추적 아님, 앱 기능.**

이용 후기의 회신 이메일이다(KAN-211, Accentury_Server `docs/wiki/feedback.md`). 결과 화면
후기 시트의 **선택 입력**이고, 안 적으면 수집이 없다. 서버 `session_feedback`에 1년 보관 뒤
자동 삭제 (Accentury_Server
`backend/src/main/java/app/accentury/backend/feedback/FeedbackRetention.java`).

- **이 기능은 iOS에도 있다.** 후기 시트는 웹(`web/src/feedback/FeedbackSheet.tsx`)에 있고
  iOS는 그 웹을 WebView로 띄운다. 네이티브 쪽에 별도 코드가 없어서 `ios/` 밑을 grep하면
  안 잡히는데, 화면에는 그대로 뜬다. **iOS 전용이라 빠진다고 읽지 말 것**
- 「연결됨」인 이유는 이메일 자체가 사람을 지목하는 값이어서다. 애플은 개인정보 보호법상
  개인정보에 해당하는 것을 **항상 연결됨으로 본다**(6.1 출처의 Linked 정의)

**선택적 공개 면제를 쓸 수 있는가 — 쓸 수 없다.** 애플은 네 조건을 **전부** 만족할 때만
면제한다. 우리는 셋을 만족하고 하나에서 걸린다.

| 조건 | 우리 |
|---|---|
| 추적에 쓰지 않는다 | 만족 |
| 제3자 광고·개발자 광고·기타 목적에 쓰지 않는다 | 만족 |
| 주요 기능이 아닌, 드문 경우에만 수집하고 이용자에게 선택이다 | 만족 (후기 시트, 선택 입력) |
| 이용자의 **이름 또는 계정이 눈에 띄게 표시된** 화면에서 이용자가 매번 직접 제공한다 | **불만족** — 계정이 없는 서비스라 표시할 이름이 없다 |

애플이 예시로 드는 「선택적 피드백 양식」이 우리 후기 시트와 거의 같은 물건인데도 마지막
조건에서 막힌다. 계정 없는 앱은 이 면제를 쓸 수 없다고 읽는 것이 맞다. 그래서 신고한다.

**⑦ 사용자 콘텐츠 › 기타 사용자 콘텐츠 — 수집, 연결됨, 추적 아님, 앱 기능.**

같은 후기의 별점(선택)과 본문(1~500자, 필수)이다(Accentury_Server `docs/wiki/feedback.md` §3).

「연결됨」인 이유는 **⑥과 같은 행에 저장되기 때문**이다. `session_feedback` 한 행에 이메일과
본문이 같이 들어가므로, 이메일을 적은 이용자의 본문은 그 이메일로 지목된다. 이메일을 안 적은
경우만 떼어 「연결되지 않음」으로 신고할 수도 있지만, 라벨은 유형당 한 답이고 넓은 쪽을 쓴다.

Play에서는 이 항목을 「선택사항」으로 표시했다. App Store 라벨에는 선택사항 칸이 없다 —
선택 여부는 면제 조건(⑥의 표)으로만 다루고, 면제에 못 들면 그냥 수집으로 신고한다.

**⑧ 기타 데이터 › 기타 데이터 유형 — 수집, 연결됨, 추적 아님, 앱 기능.**

Kakao SDK 2.29.0의 매니페스트가 `OtherDataTypes`를 `Linked=true`·`Tracking=false`·
목적 `AppFunctionality`로 선언한다. 무엇인지 더 좁혀 적지 않은 것은 카카오 쪽 선택이고,
우리가 그 이상을 알 방법이 없다.

결과 카드를 카카오톡으로 보낼 때만 SDK가 도는데, 매니페스트가 조건을 나누지 않으므로
그대로 신고한다. **⑤와 같은 성격의 항목이다** — 우리 코드가 모으는 것이 아니라 링크한 SDK가
선언한 몫이고, 개인정보 보고서에 뜨므로 라벨에 없으면 어긋난다.

### 6.4 수집하지 않는다고 신고하는 것

| 항목 | 왜 |
|---|---|
| 이름·전화번호 | 회원가입도 로그인도 없다 |
| 사용자 ID | `setUserID`를 부르는 곳이 없다 (`docs/wiki/analytics.md` §3) |
| 정확한 위치 | 위치 권한을 선언하지 않는다. ⑤는 IP 추정 몫이다 |
| 연락처·사진·파일 | 권한 자체를 선언하지 않는다 |
| 결제 정보 | 앱 내 구매가 없다 |
| 건강·피트니스 | 억양 점수는 의학적 판정이 아니다 |
| 검색 기록·브라우징 기록 | 그런 기능이 없다 |

서버가 저장하는 것은 세션 행(id, 토큰 **해시**, 테스트 버전, 플랫폼, 앱 버전, 캠페인 토큰,
만료 시각), 결과 행(점수 셋과 등급), 단어 답변 행, 후기 행이다. 세션·결과는 24시간 뒤
정리되고 후기만 1년 남는다(Accentury_Server `docs/wiki/privacy-policy.md` §1).

## 7. 연령 등급

| 설문 영역 | 답 |
|---|---|
| 앱 내 제어 (보호자 제어 · 연령 확인) | 없음 |
| 기능 — 무제한 웹 접근 | 없음. WebView는 allowlist로 묶여 있다 (`docs/wiki/webview-bridge.md`) |
| 기능 — 사용자 생성 콘텐츠 | 없음. 후기는 개발팀에만 가고 다른 이용자에게 보이지 않는다 |
| 기능 — 소셜 미디어 · 메시지·채팅 | 없음. 카카오톡 공유는 본인이 자기 결과를 밖으로 내보내는 행위다 |
| 기능 — **광고** | **있음** |
| 성숙한 주제 (욕설 · 공포 · 술·담배·약물) | 전부 없음 |
| 의료·웰니스 | 없음 |
| 성적 내용·노출 | 없음 |
| 폭력 (만화·사실적·장시간·무기) | 전부 없음 |
| 확률형 (도박·모의 도박·경연·루트 박스) | 전부 없음 |
| **예상 등급** | **4+** (콘솔 설문 결과로 확정) |

**「광고」는 설문 항목이다.** 애플이 2025년에 연령 등급 체계를 고치면서 「기능(Capabilities)」
영역에 광고·사용자 생성 콘텐츠·메시지·무제한 웹 접근을 넣었다
(<https://developer.apple.com/help/app-store-connect/reference/age-ratings/>, 2026-09-22 확인).
등급 구간도 4+·9+·13+·16+·18+ 다섯으로 늘었다. 광고가 있다고 자동으로 등급이 올라가지는
않지만 **체크는 반드시 한다** — 빠뜨린 항목이 나중에 드러나면 등급 재산정과 메타데이터
거절로 돌아온다.

콘텐츠 자체에 걸릴 것이 하나도 없어 **4+**로 떨어질 것으로 본다. 설문을 실제로 넘겨 봐야
확정되므로 그때 이 표를 고친다.

**Play의 「18세 이상만」과 다르다.** Play에서 하한을 18로 올린 것은 콘텐츠 때문이 아니라
가족 정책(Families Policy)에 걸리지 않으려는 선택이었다(`play-store-listing.md` §6).
애플에는 그에 해당하는 강제가 없고, 연령 등급은 「누구를 겨냥했나」가 아니라 「무엇이 들어
있나」만 묻는다. 그래서 같은 앱이 두 스토어에서 다른 숫자를 받는다.

「어린이」 카테고리(Kids Category)에는 **넣지 않는다.** 넣으면 제3자 분석·광고에 훨씬 센
제약이 붙고, 지금 구성으로는 통과하지 못한다.

## 8. 심사 노트 (App Review Information)

### 콘솔 필드

| 필드 | 값 |
|---|---|
| 로그인 필요 | **아니요** |
| 데모 계정 | 불필요 — 계정 개념이 없다 |
| 연락처 이름 | 이성주 |
| 연락처 이메일 | `team2pl1@gmail.com` |
| 연락처 전화 | (계정 소유자가 콘솔에서 직접 입력) |
| 첨부 파일 | 없음 |

### 메모 (한국어 원안)

```
이 앱은 경남 사투리 억양을 재는 테스트입니다. 회원가입과 로그인이 없어 데모 계정이 필요하지 않습니다.

[마이크가 필요합니다]
테스트의 핵심 기능이 목소리 분석이라 마이크 권한이 필수입니다. 조용한 곳에서 화면의 문장을
소리 내어 읽어 주세요. 시뮬레이터나 마이크가 없는 환경에서는 음성 문항을 통과할 수 없습니다.

[진행 경로 — 10문항, 약 3분]
인트로 → 광고 동의 시트(첫 실행) → 마이크 권한 → 목소리 점검 → 음성 5문항 → 어휘 5문항
→ 분석 대기 → 결과

[마이크 권한을 거부하면]
안내 화면과 [설정 열기] 버튼이 나오고, 설정에서 허용하고 돌아오면 앱을 다시 켜지 않아도
이어서 진행됩니다. 마이크 없이 테스트를 건너뛰는 경로는 없습니다. 목소리를 분석하는 것이
이 앱의 유일한 기능이기 때문입니다.

[추적 허용(ATT) 프롬프트]
첫 실행 동의 시트에서 맞춤형 광고를 허용한 경우에만 ATT 프롬프트가 뜹니다. 허용하지 않아도
앱의 모든 기능이 그대로 동작하며, 맞춤형이 아닌 일반 광고가 나옵니다. 추적 허용을 기능의
조건으로 걸지 않습니다.

[광고]
Google AdMob 전면 광고(분석 대기 화면)와 보상형 광고(재응시 전) 두 자리입니다.
실제 광고 단위 ID로 제출합니다.

[음성 데이터]
녹음한 음성은 점수를 매기는 동안에만 서버에서 쓰이고 요청이 끝나는 즉시 삭제됩니다.
저장하거나 다른 곳으로 보내지 않습니다.
```

### 메모 (영어 — 콘솔에 넣는 것은 이쪽)

```
This app measures how strongly a speaker's accent matches the Gyeongnam dialect of Korean.
There is no sign-up or login, so no demo account is required.

[Microphone is required]
Voice analysis is the core function, so microphone permission is mandatory. Please read the
on-screen sentences aloud in a quiet place. The voice questions cannot be completed on a
simulator or on a device without a working microphone.

[Walkthrough - 10 questions, about 3 minutes]
Intro -> ad consent sheet (first launch) -> microphone permission -> voice check ->
5 voice questions -> 5 vocabulary questions -> analysis wait -> result

[If microphone permission is denied]
An explanation screen appears with an "Open Settings" button. Granting permission in Settings
and returning to the app resumes the flow without a restart. There is no path that skips the
microphone, because analyzing the user's voice is the app's only function.

[App Tracking Transparency prompt]
The ATT prompt appears only if the user allows personalized ads in the first-launch consent
sheet. Declining changes nothing about app functionality; non-personalized ads are served
instead. Tracking permission is never a condition for using any feature.

[Advertising]
Google AdMob interstitial (on the analysis wait screen) and rewarded (before a retake).
The build is submitted with production ad unit IDs.

[Voice data]
Recorded audio is used on the server only while the request is being scored and is deleted as
soon as the request finishes. It is never stored or shared.
```

권한 거부 분기는 실제 코드 그대로 적었다 —
`ios/Accentury/Permission/PermissionGateView.swift:85-87`이 `permanentlyDenied` 상태에서
「설정에서 마이크를 허용해 주세요 / 권한 창을 더 띄울 수 없어요 · 설정에서 허용하면 이어서
시작할 수 있어요 / [설정 열기]」를 띄우고, `scenePhase`가 `active`로 돌아올 때마다 실제
권한을 다시 읽어 통과시킨다(같은 파일 94행 `onChange(of: scenePhase)`). **건너뛰기 경로는
없다**(2026-07-27 확정, FR-AD-01, 같은 파일 5행 주석). iOS는 권한 팝업이 설치당 한 번뿐이라 거부는 곧
`permanentlyDenied`로 접힌다(`MicPermission.swift` 머리주석).

심사관이 마이크를 막았다가 막다른 길로 읽을 여지를 없애려고 그 사실을 먼저 적는다.
가이드라인 5.1.1(iii) 데이터 최소화는 「핵심 기능에 필요한 데이터만 요청하라」인데, 마이크는
이 앱의 핵심 기능 그 자체라 이 구성이 그 기준에 맞는다.

## 9. 콘솔 작업 순서

- [ ] 앱 레코드 확인 (번들 `com.accentury.app`) — KAN-108에서 생성됨
- [ ] **숫자 Apple ID 확인해 §1 표와 §3 스토어 URL에 기록** — 앱 정보 › 일반 정보 › Apple ID
- [ ] 사용자 및 액세스 › 통합에서 App Store Connect API 키 발급 (App Manager), `.p8` 1회 다운로드 → GitHub 시크릿 3개 등록 (§2)
- [ ] 앱 정보 — 이름·부제·카테고리·저작권·개인정보 처리방침 URL (§3)
- [ ] 가격 및 사용 가능 여부 — 무료, 대한민국 (그 밖 지역은 팀 결정)
- [ ] 버전별 정보 — 프로모션 텍스트·설명·키워드·지원 URL·마케팅 URL (§3)
- [ ] 스크린샷 6.7"·6.1" 각 4장 업로드 (§4)
- [ ] **앱 개인정보 보호 — §6.2 표 그대로 입력.** 「추적」 = 예
- [ ] 연령 등급 설문 (§7) — 「광고」 체크 잊지 말 것
- [ ] 빌드 6 업로드 → TestFlight 처리 완료 대기 → 버전에 빌드 선택
- [ ] 수출 규정 — `ITSAppUsesNonExemptEncryption=false`가 plist에 있어 콘솔에서 다시 묻지 않는다 (`Info-Release.plist:11-12`)
- [ ] 앱 심사 정보 — §8 영어 메모, 연락처, 로그인 없음
- [ ] 심사 제출 (§10 선행 조건을 먼저 전부 닫는다)
- [ ] **게시 뒤** 숫자 Apple ID로 App Store URL 확정 → GitHub environment 변수 `APP_STORE_URL` 등록 + `STORE_LISTING_READY=true` (prod·staging **각각**) → 재배포

마지막 항목의 순서는 Play와 같은 이유로 조건부다. 게시 전에 `STORE_LISTING_READY`를 켜면
웹 [앱 다운로드] 버튼이 살아나면서 방문자를 없는 페이지로 보낸다 — 비활성 버튼보다 나쁜
상태다(`web/src/audio/storeLink.ts`의 `storeListingReady` 머리주석).

## 10. 심사 제출을 막는 선행 조건

| 막는 것 | 누가·어디서 | 티켓 | 상태 |
|---|---|---|---|
| prod 스택과 방침 본문 게시 | 인프라 · **Accentury_Server** `scripts/publish-privacy.sh prod` | KAN-176 · KAN-209 | **해결** — `https://accentury.app/privacy.html` 200 (2026-09-21 확인). 확장자 `.html` 필수, `/privacy`는 SPA 재작성에 걸린다 |
| 방침 시행일 자리표시자 | 계정 소유자 · **Accentury_Server** `infra/privacy/privacy.html` 102·710행 | KAN-176 | **미해결** — 게시 당일 날짜로 두 자리 모두 교체 (같은 레포 `docs/wiki/privacy-policy.md` §3 게이트 6행) |
| 방침의 스토어 답안 일치 | 개발 · **Accentury_Server** `docs/wiki/privacy-policy.md` §2 | KAN-175 | **이 문서가 닫는다** — §6이 정본 (같은 파일 §3 게이트 7행) |
| AdMob iOS 실 광고 단위 ID | 계정 소유자 · AdMob 콘솔 → GitHub 시크릿 `ADMOB_IOS_APP_ID`·`ADMOB_IOS_INTERSTITIAL_ID`·`ADMOB_IOS_REWARDED_ID` | KAN-196 | **미해결** — 지금 빌드는 Google 테스트 ID로 나간다. 테스트 ID가 스토어로 가면 AdMob 정책 위반이다. 아카이브에 `ADMOB_APP_ID=… ADMOB_INTERSTITIAL_ID=… ADMOB_REWARDED_ID=… REQUIRE_ADMOB_IDS=YES`를 준다 (`ads-admob.md` §3·§7.2) |
| 카카오 콘솔 iOS 플랫폼 등록 + `KAKAO_NATIVE_APP_KEY` | 계정 소유자 · 카카오 개발자 콘솔 | KAN-180 | **미해결(확인 필요)** — 키가 없으면 공유가 시스템 공유 시트로 떨어진다. 설명 §3이 카카오톡 공유를 약속하므로 키 없이 제출하면 문안과 동작이 갈린다 (`ResultSharer.swift:62`) |
| Universal Links AASA 게시 | 인프라 · **Accentury_Server** `infra/well-known/*/.well-known/apple-app-site-association` | KAN-32 | 게시됨. 심사를 막지는 않지만 딥링크가 조용히 죽는다 (`app-links.md`) |
| 빌드 번호 6 이상 | 개발 · `CURRENT_PROJECT_VERSION` | KAN-175 3단계 | **해결(2026-09-22)** — iOS·Android 둘 다 6. 규칙과 검사는 `ios/Accentury/Config/Base.xcconfig` 주석과 `AccenturyCoreTests/ReleaseVersionParityTests` |
| `APP_STORE_URL`·`STORE_LISTING_READY` 주입 | 계정 소유자 · GitHub environment 변수 (prod·staging **각각**) | KAN-175 2단계 | **미해결** — 배선은 끝났다 (`.github/workflows/web-deploy.yml`가 둘 다 빌드로 넘기고 `web/src/audio/storeLink.ts`가 받는다). 남은 것은 값 등록뿐 — `APP_STORE_URL=https://apps.apple.com/app/id<숫자>`, 게시 뒤 `STORE_LISTING_READY=true` (§9 마지막 항목) |
| 릴리스 워크플로 | 개발 · `.github/workflows/ios-release.yml` | KAN-175 4단계 | **부분 해결(2026-09-22)** — 워크플로는 있다(§2 「릴리스 워크플로」). 남은 것은 시크릿 6개 등록과 러너에서의 첫 실행이다 |

심사를 **직접** 막는 것은 AdMob 실 ID와 방침 시행일 둘이다. 나머지는 막지는 않되
제출 전에 닫아 두는 쪽이 낫다.

## 11. 관련

[`play-store-listing.md`](play-store-listing.md) (KAN-174 Play 짝, §5 데이터 안전 답안) ·
Accentury_Server `docs/wiki/privacy-policy.md` (§2 스토어 신고 대조표, §3 게시 게이트) ·
[`ads-admob.md`](ads-admob.md) (KAN-196 광고 ID·ATT 순서·릴리스 빗장) ·
[`analytics.md`](analytics.md) (KAN-33 계측 범위, §8 고지 표) ·
Accentury_Server `docs/wiki/feedback.md` (KAN-211 이메일·후기 수집 근거) ·
[`ios-port.md`](ios-port.md) (§7 TestFlight 서명 경로) ·
[`app-icon-assets.md`](app-icon-assets.md) · [`app-links.md`](app-links.md) ·
`assets/screenshots/README.md` · `web/README.md` 「배포 (KAN-127)」

KAN-108 앱 레코드 · KAN-133 방침 URL · KAN-163 안드로이드 서명 · KAN-176 방침 본문 ·
KAN-178 스토어 자산 · KAN-180 카카오 iOS · KAN-39 출시 검증
