# 소셜 로그인 로고 (KAN-224)

로그인 화면 IdP 버튼(Android: [Google 계정으로 계속하기]·[카카오 로그인]·[네이버 로그인])의 로고 출처와 버튼 규칙이다.

**2026-11-11 사용자 결정(KAN-311 시안 s-01-login, Android 반영 KAN-354)으로 버튼을 각 사 가이드대로 바꿨다.** 그 전에는
2026-09-28 팀장 결정(「Papercut 보조 버튼 유지」)대로 크림 면·잉크 테두리 보조 버튼에 로고만 공식 색이었다. 바꾼 근거:
그 결정 때문에 아래 「어긴 것」에 각 사 필수 규정(카카오 `#FEE500` 컨테이너·반경 12·문구, 구글 배경색)이 쌓여 있었고,
시안이 각 사 규격 버튼으로도 화면이 튀지 않는 것을 보였다. 구글 문구 「Google 계정으로 계속하기」는 2026-11-16 결정이다.

| | 면 | 로고 | 글자 | 문구 |
|---|---|---|---|---|
| 구글 | Neutral `#F2F2F2` | 공식 G 20 | `#1F1F1F` | Google 계정으로 계속하기 |
| 카카오 | `#FEE500` | 심볼 `#000000` 18×17 | `#000000` 85% | 카카오 로그인 |
| 네이버 | `#03C75A` | 흰 N 16 | `#FFFFFF` | 네이버 로그인 |

공통: 폭 전체·높이 44·반경 12·테두리·그림자 없음·시스템 글꼴 17 Medium(2026-11-17 시스템 Apple 버튼 높이·글자에 맞춤, 버튼 Jua 라벨 규칙 제외), 로고는 문구 앞 8에 붙어 함께 가운데(2026-11-17, 시스템 Apple 버튼과 같은 배치),
문구는 가운데. 눌림은 면 위 검정 10%, 비활성(방침 동의 전)은 버튼 전체 40% — 공용 비활성(그림자색 면)은 각 사 면색을 지워 쓰지 않는다.

다운로드일: 2026-09-28. 원본은 `docs/wiki/social-login-logos/`에 그대로 둔다.

## 파일과 출처

| 앱 리소스 | 원본 (이 폴더) | 받은 곳 |
|---|---|---|
| `res/drawable-nodpi/ic_idp_google.png` (160×160, 20dp로 그림) | `google_signin_light_square_icon.svg` (zip 안 `Android + Web/SVG/Light/Theme=Light, Show text=No, Shape=Square, Platform=Android+Web.svg`) | https://developers.google.com/static/identity/images/signin-assets.zip (안내: https://developers.google.com/identity/branding-guidelines) |
| `res/drawable/ic_idp_kakao.xml` (18×17dp로 그림, 심볼 `#000000`) | `kakao_login_light.svg` (zip 안 `Kakao Login/SVG/kakao_login_light.svg`) | https://developers.kakao.com/tool/download/Kakao%20Login.zip (도구 › 리소스 다운로드 › 카카오 로그인, 안내: https://developers.kakao.com/docs/latest/ko/kakaologin/design-guide) |
| `res/drawable/ic_idp_naver.xml` (16dp, 흰 N `#FFFFFF`) | `NAVER_login_Light_KR_white_icon_H56.png` (색 확인용) | 벡터: https://developers.naver.com/inc/devcenter/downloads/bi/NAVER_login_KR.ai (PDF 호환, 800KB라 커밋 안 함) · PNG: https://developers.naver.com/inc/devcenter/downloads/bi/NAVER_login_KR.zip (안내: https://developers.naver.com/docs/login/bi/bi.md) |

### 옮긴 방법 — 다시 그리지 않았다

- **구글**: 지금 공식 G는 4색 단색 조각이 아니라 그라데이션 "super G"다(conic-gradient `foreignObject` + 가우시안 블러 타원 6개). 벡터 드로어블은 블러를 못 그려서 XML로 옮기면 근사가 된다 — 그래서 PNG다. 공식 SVG에서 버튼 배경 `<path>` 두 줄(흰 면·회색 테두리)만 지우고 viewBox를 G 영역 `10 10 20 20`으로 잘라(`google_G_only.svg`) Playwright의 headless Chromium으로 투명 배경 160px 렌더링했다. 공식 PNG@4x와 눈으로 대조해 같다. 가이드는 옛 4색 G를 "outdated"로 금지한다.
- **카카오**: `kakao_login_light.svg`의 말풍선 `path`를 그대로 복사했다. 노란 원(`#FEE500`)만 뺐고, 심볼 경계로 자르려고 `group translate(-13,-14)`만 붙였다. 색은 처음엔 배포 SVG의 `#191919`였고, 2026-11-16(KAN-354)에 디자인 가이드 표의 심볼 색 `#000000`으로 바꿨다(도형은 그대로).
- **네이버**: 공개 SVG가 없다. `.ai`(PDF) 내용 스트림에서 H56 아이콘형 버튼의 N 도형(10점 다각형, `f*`)을 그대로 옮겼다. PDF는 y가 위로 자라므로 `scaleY=-1`로 뒤집었다. 색은 처음엔 같은 스트림의 `0.012 0.663 0.302`(= `#03A94D`, 밝은 면 위 녹색 N)였고, 2026-11-16(KAN-354)에 녹색 버튼 면 위 흰 N(`#FFFFFF`, 가이드의 녹색 배경 권장 조합)으로 바꿨다. 같은 도형이고 Android에서 녹색 N을 쓰는 곳이 없어 새 파일 없이 `fillColor`만 바꿨다.

## 가이드 규칙 — 지킨 것 / 남은 해석 (Android, 2026-11-16)

2026-09-28 결정 때 「어긴 것(팀 결정으로 유지)」에 있던 면색·반경·문구·테두리 항목은 2026-11-11 결정으로 모두 지키게 됐다.

| | 지킨 것 | 남은 해석 |
|---|---|---|
| 구글 | 공식 색 G(단색 금지), 비율 유지, Neutral 면 `#F2F2F2`·글자 `#1F1F1F`·테두리 없음, 문구 "Continue with Google" 현지화, 다른 IdP와 같은 크기·무게 | 글꼴이 Google Sans Medium 14/20이 아니라 시스템 글꼴 17(Apple 시스템 버튼에 맞춤) |
| 카카오 | 컨테이너 `#FEE500`, 반경 12, 심볼·레이블 `#000000`(레이블 85%), 문구 「카카오 로그인」, 심볼 형태·비율 유지, 심볼 좌측 | 없음 |
| 네이버 | 녹색 면 `#03C75A`·흰 N·흰 글자, N 형태 변경·조합 없음, 완성형 N 16dp(최소 16px), 로고 왼쪽, 문구 「네이버 로그인」 | 없음 |

## 앱 쪽 구현 (Android)

- `LoginScreen.kt` `IdpButton` — 공용 `AccenturyButton`을 쓰지 않는 전용 컴포저블. 색은 같은 파일의 `idpColors`(브랜드 고정값이라 테마 토큰이 아니다), 문구는 `providerLabel`(`LoginScreenStateTest`가 고정).
- `LoginScreen.kt` `IdpLogo` — `contentDescription = null`(버튼 글자가 이미 제공자를 말한다). 비활성은 `clickable(enabled = false)`라 눌리지 않고 스크린 리더가 「사용 중지됨」을 읽는다.

## iOS (KAN-224 3단계, 버튼 모양은 KAN-355 2단계)

2026-11-16 기준 iOS 버튼은 2026-09-28 팀장 결정(「Papercut 보조 버튼 유지」)이 아니라 이를 대체한 2026-11-11 사용자 결정(KAN-311, 「각 사 가이드 준수」)을 따른다.

순서는 구글 → 카카오 → 네이버 → **애플**이다(팀장 결정 "구글, 카카오, 네이버, iOS는 apple 추가"). 넷 다 폭 전체·높이 44·모서리 12·테두리
없음·그림자 없음이고 같은 크기다. 구글·카카오·네이버는 `ios/Accentury/Auth/LoginScreen.swift`의 `IdpButton`(시스템 글꼴 17 Medium,
로고+문구 묶음 가운데, 사이 8)이 그리고, 색·크기는 같은 파일 `IdpBrand` 한곳에 있다. 문구는 Core `loginButtonLabel`(테스트로 고정).

| 버튼 | 면 | 글자 | 문구 |
|---|---|---|---|
| 구글 | Neutral `#F2F2F2` | `#1F1F1F` | Google 계정으로 계속하기 (2026-11-16 결정) |
| 카카오 | `#FEE500` | `#000000` 85% | 카카오 로그인 |
| 네이버 | `#03C75A` | `#FFFFFF` | 네이버 로그인 |
| 애플 | 시스템 `ASAuthorizationAppleIDButton` `.black` | 시스템 | `.continue`(시스템 현지화 「Apple로 계속하기」) |

눌림은 면 위 검정 8% 덮개(75ms, 동작 줄이기면 즉시), 비활성(방침 동의 전)은 버튼 전체 불투명도 0.6이다 — 공용 버튼의 비활성 모양(종이 그림자 면)은
각 사 면색을 지워서 쓰지 않는다. 애플 시스템 버튼도 같은 0.6이다.

| 에셋 (`ios/Accentury/Assets.xcassets`) | 원본 |
|---|---|
| `IdpGoogle.imageset` PNG 20/40/60px (@1x/2x/3x, 20pt로 그림) | 안드로이드 `ic_idp_google.png`(= `google_G_only.svg`를 Chromium으로 160px 렌더링한 것)를 `sips`로 축소. 가이드 Neutral 면 위 공식 G 그대로 |
| `IdpKakao.imageset` SVG, Preserve Vector Data (18×17pt로 그림) | `kakao_login_light.svg`의 말풍선 path·`translate(-13 -14)` 그대로, 색만 가이드 표의 심볼 `#000000`(배포 SVG `#191919`에서 바꿈, KAN-355). 시안 `p1/img/idp-kakao.svg`와 바이트 일치 |
| `IdpNaverWhite.imageset` SVG, Preserve Vector Data (16pt) | `.ai`에서 옮긴 같은 10점 다각형·`translate(13.561 10.706) scale(1 -1)`, 색만 흰색 `#FFFFFF`(녹색 면 위 흰 N, KAN-355). 시안 `p1/img/idp-naver-white.svg`와 바이트 일치. 옛 초록 N `IdpNaver.imageset`은 사용처가 없어져 지웠다 |
| 애플 | 파일 없음 — 시스템 버튼이 로고까지 그린다 |

### Sign in with Apple — HIG 대조

App Review Guidelines 4.8은 다른 소셜 로그인을 주는 앱에 애플 로그인을 **같은 무게로** 요구한다 — 같은 크기·같은 모양의
버튼이라 충족한다. KAN-344-6부터 직접 그린 버튼이 아니라 시스템 버튼(`ASAuthorizationAppleIDButton`)을 쓴다
(https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple).

| | 지킨 것 | 어긴 것 |
|---|---|---|
| 애플 | 시스템 버튼 그대로(로고·글자·글자 비율은 시스템), 스타일 `.black`(HIG 기본 면), 문구 `continue`의 시스템 현지화, 높이 44·`cornerRadius` 12로 다른 셋과 같은 크기·반경(HIG가 반경 조정을 허용) | 없음 |
