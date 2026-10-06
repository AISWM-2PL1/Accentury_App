# 소셜 로그인 로고 (KAN-224)

로그인 화면의 [Google로 계속하기]·[카카오로 계속하기]·[네이버로 계속하기] 버튼 왼쪽에 붙는 IdP 로고의 출처와 규칙이다.
버튼 자체는 Papercut 보조 버튼 그대로다(크림 면, 1.5px 잉크 테두리, 반경 16) — 2026-09-28 팀장 결정. 로고만 공식 색이다.
글자만으로는 어느 계정인지 한눈에 읽히지 않아서 넣었다.

다운로드일: 2026-09-28. 원본은 `docs/wiki/social-login-logos/`에 그대로 둔다.

## 파일과 출처

| 앱 리소스 | 원본 (이 폴더) | 받은 곳 |
|---|---|---|
| `res/drawable-nodpi/ic_idp_google.png` (160×160, 20dp로 그림) | `google_signin_light_square_icon.svg` (zip 안 `Android + Web/SVG/Light/Theme=Light, Show text=No, Shape=Square, Platform=Android+Web.svg`) | https://developers.google.com/static/identity/images/signin-assets.zip (안내: https://developers.google.com/identity/branding-guidelines) |
| `res/drawable/ic_idp_kakao.xml` (20dp) | `kakao_login_light.svg` (zip 안 `Kakao Login/SVG/kakao_login_light.svg`) | https://developers.kakao.com/tool/download/Kakao%20Login.zip (도구 › 리소스 다운로드 › 카카오 로그인, 안내: https://developers.kakao.com/docs/latest/ko/kakaologin/design-guide) |
| `res/drawable/ic_idp_naver.xml` (16dp) | `NAVER_login_Light_KR_white_icon_H56.png` (색 확인용) | 벡터: https://developers.naver.com/inc/devcenter/downloads/bi/NAVER_login_KR.ai (PDF 호환, 800KB라 커밋 안 함) · PNG: https://developers.naver.com/inc/devcenter/downloads/bi/NAVER_login_KR.zip (안내: https://developers.naver.com/docs/login/bi/bi.md) |

### 옮긴 방법 — 다시 그리지 않았다

- **구글**: 지금 공식 G는 4색 단색 조각이 아니라 그라데이션 "super G"다(conic-gradient `foreignObject` + 가우시안 블러 타원 6개). 벡터 드로어블은 블러를 못 그려서 XML로 옮기면 근사가 된다 — 그래서 PNG다. 공식 SVG에서 버튼 배경 `<path>` 두 줄(흰 면·회색 테두리)만 지우고 viewBox를 G 영역 `10 10 20 20`으로 잘라(`google_G_only.svg`) Playwright의 headless Chromium으로 투명 배경 160px 렌더링했다. 공식 PNG@4x와 눈으로 대조해 같다. 가이드는 옛 4색 G를 "outdated"로 금지한다.
- **카카오**: `kakao_login_light.svg`의 말풍선 `path`와 색 `#191919`를 그대로 복사했다. 노란 원(`#FEE500`)만 뺐고, 심볼 경계로 자르려고 `group translate(-13,-14)`만 붙였다.
- **네이버**: 공개 SVG가 없다. `.ai`(PDF) 내용 스트림에서 H56 아이콘형 버튼의 N 도형(10점 다각형, `f*`)과 색 `0.012 0.663 0.302`(= `#03A94D`, 가이드 표기 RGB 3/169/77, PNG 픽셀과 일치)을 그대로 옮겼다. PDF는 y가 위로 자라므로 `scaleY=-1`로 뒤집었다.

## 가이드 규칙 — 지킨 것 / 어긴 것

| | 지킨 것 | 어긴 것 (팀 결정으로 유지) |
|---|---|---|
| 구글 | 공식 색 G(단색 금지), 비율 유지, 버튼 테두리+문구와 함께("G만 단독" 금지), 문구 "Continue with Google" 현지화 허용, 다른 IdP와 같은 크기·무게 | G는 **흰 배경** 위여야 하고 light/dark/neutral 외 색 배경 금지 — 우리 면은 크림. 버튼 면·테두리·폰트(Google Sans Medium 14/20, fill `#FFFFFF`, stroke `#747775`)도 가이드 값이 아니다 |
| 카카오 | 심볼 형태·비율·색 유지, 심볼 없는 버튼 아님, 심볼 좌측 정렬 허용 | 컨테이너 **`#FEE500` 필수**("색상 규정을 벗어난 색 금지", "색을 지정하지 않아 타사 버튼을 강조해서는 안 됨"), 반경 12px, 레이블 `#000000` 85% · 문구 "카카오 로그인"/"로그인" — 우리는 크림·반경 16·"카카오로 계속하기". 가이드 표는 심볼 `#000000`인데 배포 SVG는 `#191919`라 파일 값을 따랐다 |
| 네이버 | 지정 컬러 유지, N 형태 변경·조합 없음, 완성형 N 최소 16px 이상(16dp), 로고만 왼쪽 정렬 허용, 문구 변경 허용 | 녹색 배경 **권장**(필수 아님) — 밝은 면 위 녹색 N은 공식 "white" 변형에도 있다. 흰 원·회색 테두리 없이 N만 쓴 것은 해석 여지 |

## 앱 쪽 구현

- `AccenturyButton(leading = …)` — 버튼 본체 안 왼쪽 안쪽 여백(`Spacing.x6`)에 붙는다. 라벨은 버튼 가운데 그대로. 본체 안이라 눌림(sink)과 비활성 0.6 흐림을 로고도 같이 탄다.
- `LoginScreen.kt` `IdpLogo` — `contentDescription = null`(버튼 글자가 이미 제공자를 말한다).

## iOS (KAN-224 3단계)

버튼은 안드로이드와 같은 Papercut 보조 버튼이고(`ios/Accentury/UI/Components/AccenturyButton.swift`의 `leading`), 순서는
구글 → 카카오 → 네이버 → **애플**이다(팀장 결정 "구글, 카카오, 네이버, iOS는 apple 추가"). 넷 다 같은 크기다.

| 에셋 (`ios/Accentury/Assets.xcassets`) | 원본 |
|---|---|
| `IdpGoogle.imageset` PNG 20/40/60px (@1x/2x/3x, 20pt로 그림) | 안드로이드 `ic_idp_google.png`(= `google_G_only.svg`를 Chromium으로 160px 렌더링한 것)를 `sips`로 축소 |
| `IdpKakao.imageset` SVG, Preserve Vector Data | `ic_idp_kakao.xml`과 같은 path·색·`translate(-13 -14)` — `kakao_login_light.svg`의 말풍선 그대로 |
| `IdpNaver.imageset` SVG, Preserve Vector Data | `ic_idp_naver.xml`과 같은 10점 다각형·`#03A94D`, `translate(13.561 10.706) scale(1 -1)` |
| 애플 | SF Symbol `apple.logo` (파일 없음) |

### Sign in with Apple — HIG 대조

App Review Guidelines 4.8은 다른 소셜 로그인을 주는 앱에 애플 로그인을 **같은 무게로** 요구한다 — 같은 크기·같은 모양의
버튼이라 충족한다. HIG 「Sign in with Apple › Buttons」는 시스템 버튼(`ASAuthorizationAppleIDButton`) 대신 **직접 만든
버튼**을 허용하되 조건을 건다 (https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple).

| | 지킨 것 | 어긴 것 (팀 결정으로 유지) |
|---|---|---|
| 애플 | 문구는 허용된 셋 중 "Continue with Apple"의 현지화("Apple로 계속하기"), 로고와 글자가 같은 색(잉크 `#1c1a17` ≈ 검정), 다른 버튼과 같은 반경·크기, 로고는 애플이 앱에 주는 글리프(SF Symbol `apple.logo`) | 버튼 면이 **흰색·검정이 아니라 크림**이고 1.5 잉크 테두리 — HIG는 흰색/검정(또는 그 위의 은은한 질감)을 요구한다. 로고를 HIG 다운로드 로고 파일이 아니라 SF Symbol로 그렸다. 글자 높이 비율(버튼 높이의 43%)은 맞추지 않았다(보조 버튼 15pt) |

심사에서 문제가 되면 애플 버튼만 흰 면(`#FFFFFF`)으로 바꾸는 것이 가장 작은 수정이다 — 나머지 셋과 모양·크기는 그대로다.
