# 디자인 토큰 정본

Accentury 네이티브(Compose)와 웹(WebView)이 공유하는 색·타이포·간격·모션·반경의 **단일 정본**이다.
이 문서의 표가 원본이고, `Color.kt`·`Type.kt`·`tokens.css`는 그 값을 각 런타임 형태로 옮겨 적은 사본이다.

- 티켓: KAN-148(구조) · **KAN-161**(Papercut 팔레트 교체) · **KAN-288**(디자인 3 — 반경·그림자·버튼 위계, §7)
- 설계 근거: `ux-ui.md` §2(설계 원칙)·§5(비주얼·모션·접근성 최소선)
- 시안 출처
  - **Papercut** (현행) — Claude Code 아티팩트 「Accentury Papercut」, 정본은 그 안의 `build.mjs`
  - Figma Make 코드 번들 (KAN-148 당시, 로컬 `prototype/`) — 배치·간격·타이포는 아직 여기서 온다

## 1. 정본과 사본의 관계

| 위치 | 역할 |
|---|---|
| `docs/wiki/design-tokens.md` (이 문서) | **정본.** 값을 바꾸려면 여기부터 고친다 |
| `app/src/main/java/com/accentury/app/ui/theme/Color.kt` | 사본 — 색 |
| `app/src/main/java/com/accentury/app/ui/theme/Type.kt` | 사본 — 타이포 |
| `app/src/main/java/com/accentury/app/ui/theme/Dimens.kt` | 사본 — 간격·반경·터치 타겟·모션 |
| `web/src/tokens.css` | 사본 — 전체 (CSS 커스텀 프로퍼티) |
| `tools/check_tokens.py` | 정본과 두 사본의 색 값, 타이포 크기(sp와 웹 rem)와 굵기가 일치하는지 검사. iOS `PapercutTheme.swift`의 팔레트 여섯 색과 타이포 슬롯(크기, 굵기, Jua 여부)도 대조한다 |
| `tools/check_contrast.py` | §2 표의 값으로 §6 대비 표를 생성(`--write`)하고, 문서가 낡았는지 검사 |

두 스크립트는 PR에서 `test.yml`의 `tokens-check` job이 돈다(이 문서, Android theme 폴더, iOS Theme 폴더, `tokens.css`, 스크립트가 바뀐 PR만). 대비 검사는 §2 표를 직접 읽으므로, 정본과 사본을 함께 바꾸면 대비 회귀도 같은 PR에서 걸린다. 레포 분리(KAN-221) 뒤 Accentury_Server에 남아 있다가 KAN-361에서 이 레포로 옮겼다. `Dimens.kt`의 간격과 반경은 아직 기계 대조가 없다.

### 갱신 절차

1. 이 문서의 값 표(§2 색, §3 타이포, §4 간격)를 고친다. §6 대비 표는 손대지 않는다 — 4번이 대신 쓴다.
2. 같은 커밋에서 `Color.kt`·`Type.kt`·`Dimens.kt`·`tokens.css`를 함께 고친다. **한쪽만 고친 커밋은 리뷰에서 반려한다** — 네이티브와 웹이 한 테스트 안에서 번갈아 나오므로 값이 갈라지면 화면 경계에서 색이 튄다.
3. `python3 tools/check_tokens.py`로 정본과 두 사본의 색 값과 타이포가 일치하는지 확인한다. 한쪽만 고쳤으면 여기서 걸린다. PR에서는 CI가 같은 검사를 돈다.
4. 색을 새로 추가하거나 바꿨으면 `tools/check_contrast.py`의 `PAIRS`를 같이 고치고 `python3 tools/check_contrast.py --write`를 돌린다. **§6 표는 손으로 고치지 않는다** — 스크립트가 쓰고, 인자 없이 돌리면 문서가 낡았는지까지 검사해 종료 코드 1로 떨어진다.
5. 팔레트를 다시 손봤으면 §7 "결정 기록"에 근거를 남긴다.

## 2. 색

**Papercut** — 크림 종이 위에 잉크로 그린 그림이고, 두 번째 잉크로 테라코타 한 색을 더 쓴다.
값은 여섯이고 semantic 토큰은 전부 이 여섯 중 하나로 접힌다 (PAPER는 KAN-354에서 더했다).

| 역할 | 값 | 하는 일 |
|---|---|---|
| INK | `#1c1a17` | 텍스트·선·버튼 면·곡선. 화면에서 "그려진 것"은 대부분 이 색이다 |
| CREAM | `#f3ecd9` | 배경·카드·잉크 위 글자. 종이 자체 |
| PAPER | `#f8f3e6` | 크림 위에 한 장 더 얹은 면 — 카드·입력 칸·확인 창 (KAN-311 시안 `--color-paper`, KAN-354). Android `LightPaper` |
| PAPER_SHADOW | `#cfc5aa` | 오프셋 그림자(`3px 4px 0`)와 장식 면. 종이 그늘 |
| MUTED | `#6b6459` | 흐린 텍스트. 잉크를 옅게 쓴 것이지 회색이 아니다 |
| TERRACOTTA | `#a8503a` | **포인트 컬러.** 화면당 한 자리 — 지금 눌러야 할 것과 지금 여기를 짚는다 (§7) |

일러스트는 테마와 무관하게 종이 `#f3ecd9` / 잉크 `#1c1a17` 고정값을 직접 쓴다 (§7의 `ILLO`).
모든 조합은 §6에서 확인했고, KAN-148에서 감수했던 여덟 자리는 이 팔레트로 전부 해소됐다.

### 라이트

| 토큰 | 값 | 용도 |
|---|---|---|
| `primary` | `#1c1a17` | 잉크. 주버튼, F0 곡선, 선택 상태 |
| `primary-foreground` | `#f3ecd9` | primary 위 텍스트 |
| `primary-dim` | `#cfc5aa` | 오프셋 종이 그림자 |
| `background` | `#f3ecd9` | 화면 배경 |
| `foreground` | `#1c1a17` | 본문 텍스트 |
| `card` | `#f3ecd9` | 카드 표면. 배경과 같은 색이고 테두리·그림자로 갈린다 |
| `paper` | `#f8f3e6` | 크림 위에 한 장 더 얹은 밝은 종이. 크림과 1.06:1이라 면만으로 갈리지 않고 잉크 테두리가 경계를 맡는다. Android는 카드·입력 칸·확인 창 면(`LightPaper`, KAN-354), 웹은 선택지·바텀 시트·대화상자 면(`--color-paper`, KAN-347 1단계) |
| `press-dim` | `rgba(0, 0, 0, 0.05)` | 누르는 동안 요소 위에 얹는 덧칠(KAN-367). 자체 눌림(종이가 내려감)이 없는 줄·닫기 버튼·아이콘 버튼 등이 손가락 아래 반응을 보이게 한다. 글자 버튼은 덧칠 대신 누르는 동안 밑줄이다(웹·Android). 웹 SVG 지도 지역은 같은 5%를 `brightness(0.95)`로 낸다. Android는 키보드 포커스 중에도 같은 덧칠 |
| `card-foreground` | `#1c1a17` | 카드 위 텍스트 |
| `secondary` | `#f3ecd9` | 보조 면 |
| `secondary-foreground` | `#1c1a17` | 보조 면 위 텍스트 |
| `muted` | `#cfc5aa` | 장식·비활성 면 **전용**. 상태 표시에는 쓰지 않는다 — 크림 위 1.46:1 (§7) |
| `muted-foreground` | `#6b6459` | 보조 텍스트 |
| `accent` | `#1c1a17` | 강조 배지 면 |
| `accent-foreground` | `#f3ecd9` | accent 위 텍스트 |
| `success` | `#1c1a17` | 정답 표시. 색이 아니라 문구·아이콘이 정답을 알린다 (§7) |
| `success-foreground` | `#f3ecd9` | success 위 텍스트 |
| `success-surface` | `#f3ecd9` | 정답 선택지 배경 |
| `success-on-surface` | `#1c1a17` | 정답 선택지 텍스트 |
| `destructive` | `#1c1a17` | 오답·오류 |
| `destructive-foreground` | `#f3ecd9` | destructive 위 텍스트 |
| `destructive-surface` | `#f3ecd9` | 오답 선택지 배경 |
| `destructive-on-surface` | `#1c1a17` | 오답 선택지 텍스트 |
| `border` | `#1c1a17` | 구분선 |
| `control-border` | `#1c1a17` | 선택 가능한 컨트롤 경계 (선택지·입력) |
| `ring` | `#1c1a17` | 포커스 링 |
| `prompt-card-start` | `#f3ecd9` | 대사 카드 면. 그라디언트가 아니라 단색이라 start·end가 같다 |
| `prompt-card-end` | `#f3ecd9` | 대사 카드 면 |
| `prompt-card-foreground` | `#1c1a17` | 대사 본문 |
| `prompt-card-muted` | `#6b6459` | 대사 카드 보조 텍스트(뜻·안내) |
| `prompt-card-badge` | `#f3ecd9` | 대사 카드 위 배지 면 |
| `guide-curve` | `#1c1a17` | 가이드 F0 곡선 (점선) |
| `user-curve` | `#a8503a` | 사용자 F0 곡선 (실선 + 망점 채움). 포인트 컬러 — 녹음 화면의 한 자리 (§7) |
| `curve-lane-surface` | `#f3ecd9` | 곡선 레인 안쪽 면 |
| `hero-start` | `#f3ecd9` | 히어로 아이콘 면. 잉크 테두리를 두른 크림 원이다 (§7) |
| `hero-end` | `#f3ecd9` | 히어로 아이콘 면 |
| `curve-lane-border` | `#1c1a17` | 곡선 레인 테두리 |
| `point` | `#a8503a` | **포인트 컬러.** 인트로 제목 아치, 녹음 화면 내 억양 곡선, 결과 점수 도넛 호·막대. 화면당 한 자리 규칙과 화면별 표는 §7 |
| `point-foreground` | `#f3ecd9` | point 면 위 텍스트. **지금 쓰는 곳이 없다** — 색이 면이 아니라 선으로만 서 있다 (§7) |

### 다크

**이번 티켓(KAN-161)은 다크 분기를 라이트로 고정했다. 다크 전용 팔레트는 후속 티켓이다** —
아래 표는 라이트와 값이 같고, 런타임에서 이 표를 고르는 코드는 없다 (§7).

| 토큰 | 값 |
|---|---|
| `primary` | `#1c1a17` |
| `primary-foreground` | `#f3ecd9` |
| `primary-dim` | `#cfc5aa` |
| `background` | `#f3ecd9` |
| `foreground` | `#1c1a17` |
| `card` | `#f3ecd9` |
| `card-foreground` | `#1c1a17` |
| `secondary` | `#f3ecd9` |
| `secondary-foreground` | `#1c1a17` |
| `muted` | `#cfc5aa` |
| `muted-foreground` | `#6b6459` |
| `accent` | `#1c1a17` |
| `accent-foreground` | `#f3ecd9` |
| `success` | `#1c1a17` |
| `success-foreground` | `#f3ecd9` |
| `success-surface` | `#f3ecd9` |
| `success-on-surface` | `#1c1a17` |
| `destructive` | `#1c1a17` |
| `destructive-foreground` | `#f3ecd9` |
| `destructive-surface` | `#f3ecd9` |
| `destructive-on-surface` | `#1c1a17` |
| `border` | `#1c1a17` |
| `control-border` | `#1c1a17` |
| `ring` | `#1c1a17` |
| `prompt-card-start` | `#f3ecd9` |
| `prompt-card-end` | `#f3ecd9` |
| `prompt-card-foreground` | `#1c1a17` |
| `prompt-card-muted` | `#6b6459` |
| `prompt-card-badge` | `#f3ecd9` |
| `guide-curve` | `#1c1a17` |
| `user-curve` | `#a8503a` |
| `curve-lane-surface` | `#f3ecd9` |
| `hero-start` | `#f3ecd9` |
| `hero-end` | `#f3ecd9` |
| `curve-lane-border` | `#1c1a17` |
| `point` | `#a8503a` |
| `point-foreground` | `#f3ecd9` |
| `paper` | `#f8f3e6` |
| `press-dim` | `rgba(0, 0, 0, 0.05)` |

## 3. 타이포

두 벌을 쓴다.

- **Jua** — 제목·대사·등급. 번들 필수(어느 기기에도 없는 디스플레이 폰트). `app/src/main/res/font/jua_regular.ttf`(2.0MB), `web/public/fonts/Jua-Regular.woff2`(360KB), `ios/Accentury/Resources/Fonts/Jua-Regular.ttf`(2.0MB, KAN-178 — `UIAppFonts`로 등록하고 `Font.custom`에 PostScript 이름 `Jua-Regular`를 준다). 라이선스 `LICENSES/Jua-OFL.txt`(SIL OFL 1.1) 하나를 세 런타임이 공유한다.
- **본문 — 시스템 기본 산세리프.** Android 시스템 폰트가 이미 Noto Sans CJK KR이고 WebView의 `sans-serif`도 같은 폰트로 해석되므로, 네이티브와 웹이 저절로 같은 글꼴로 수렴한다. 9.9MB짜리 Noto Sans KR 가변폰트를 번들해도 타깃 기기에서 보이는 글자는 같아서 넣지 않는다. iOS도 같은 규칙을 그쪽 글꼴로 지킨다 — 네이티브 `.system`과 WKWebView의 `sans-serif`가 둘 다 Apple SD Gothic Neo로 풀린다.

| 토큰 | 크기 | 웹 | 굵기 | 폰트 | 용도 |
|---|---|---|---|---|---|
| `display` | 40sp | `2.5rem` | 400 | Jua | 결과 등급 |
| `headline` | 26sp | `1.625rem` | 400 | Jua | **대사 카드**·대기 제목 (§5 최소선 24sp 충족) |
| `title` | 30sp | `1.875rem` | 400 | Jua | 단어 문항·인트로 제목 |
| `titleSmall` | 20sp | `1.25rem` | 400 | Jua | 앱바 워드마크 |
| `timer` | 16sp | `1rem` | 400 | Jua | 녹음 타이머·8초 경고 캡슐 (자간 0.04em) |
| `body` | 16sp | `1rem` | 400 | 시스템 | 본문 |
| `bodySmall` | 15sp | `0.9375rem` | 400 | 시스템 | 선택지, 예외 화면 설명 |
| `label` | 14sp | `0.875rem` | 500 | 시스템 | 부가 설명 |
| `caption` | 13sp | `0.8125rem` | 500 | 시스템 | 카드 위 캡션, 레인 라벨, 진행 표기 |

행간은 대사·등급이 `1.15`, 나머지가 `1.5`.

**버튼 라벨·화면 제목 (KAN-354, 2026-11-12 결정 · KAN-347 1단계).** 버튼 라벨은 Jua다 — 주·보조·위험 확인 17, 글자 버튼 16이고
굵기 400·자간 0.01em이다(본문 14/500에서 올렸다). 한 줄로 쓰고, 큰 글자에서 칸을 넘으면 줄을 바꾼다(낱말 단위). Android는
M3 슬롯 밖의 `ButtonLabel.Regular`(17/22)·`ButtonLabel.Text`(16/20)이고 `AccenturyButton`만 읽는다. 웹은 `--text-button`
`1.0625rem` / `--text-button-text` `1rem`(`.btn`). 소셜 로그인 버튼(네이티브)은 이 규칙 밖이다. 두 분석 대기 화면(레벨 테스트
s-09·억양 학습 s-18)은 공통 규칙에서 빠져 옛 라벨(본문 14/500)을 지킨다(웹 `.screen--analysis-wait`). 화면 제목은 화면이
하는 일로 두 크기다: 안내·예외·대기 Jua 30(`title`, Android `ScreenTitle.Notice`), 입력·동의·설정·시트·확인 창 Jua 26
(`headline`, Android `ScreenTitle.Form`). 두 이름은 슬롯을 가리킬 뿐 새 크기가 아니다. 탭 화면(홈·학습·번역기) 제목 윗선은
y=80으로 같다(웹 `.tab-title`).

웹 열은 `tokens.css`의 값이다. 웹 크기는 rem(16px = 1rem)이라 루트 글자 크기를 따르고, rem과 px를 가르는 규칙은 [ux-ui.md 「크기 단위 규칙」](ux-ui.md#크기-단위-규칙-rempx-구분-kan-313)이 정본이다 (KAN-313).

`timer`만 자간을 벌린다(`0.04em`). 자리가 고정된 숫자라 그 값이 없으면 `00:04`의 두 자리가
서로 붙어 보인다. 네이티브에서는 M3에 타이머 슬롯이 없어 남아 있던 `titleSmall` **슬롯**이
이 값을 든다 — 이름은 M3 것이고 뜻은 이 표의 `timer`이며, 대응은 `check_tokens.py`의
`TYPE_SLOTS`가 정본이다. 웹은 `--text-timer` / `.type-timer`다.

**굵기는 400과 500 둘뿐이다** (KAN-161 2단계). 번들한 Jua에는 굵기가 400 하나뿐이라
700·900을 요청하면 런타임이 획을 부풀린 합성 볼드를 만든다 — 곡선이 뭉개져 손으로 오린
글씨가 아니라 두껍게 인쇄한 글씨가 된다. 잉크 한 색 화면에서 굵기를 더 올려 봤자
위계가 아니라 얼룩이 되므로, 위계는 크기와 폰트(Jua/시스템)가 만든다.
`tools/check_tokens.py`가 이 표의 크기와 굵기를 두 사본과 대조한다.

## 4. 간격 · 반경 · 터치 타겟

4dp 배수. `space-1`=4 / `space-2`=8 / `space-3`=12 / `space-4`=16 / `space-6`=24 / `space-8`=32. 웹은 같은 값을 rem으로 적는다(`0.25rem`~`2rem`, ÷16). 아래 표의 웹 열은 `tokens.css` 값이고, 단위 규칙은 [ux-ui.md 「크기 단위 규칙」](ux-ui.md#크기-단위-규칙-rempx-구분-kan-313)을 따른다 (KAN-313).

| 토큰 | 값 | 웹 | 용도 |
|---|---|---|---|
| `radius-sm` | **4dp** | `4px` | 칩·별점 칸·선택지 번호 상자 (KAN-288, 이전 12) |
| `radius-md` | **6dp** | `6px` | 버튼, 선택지, 입력 칸, 학습 목록 행 (KAN-288, 이전 16) |
| `radius-lg` | **10dp** | `10px` | 카드·대사 카드·선택지 (KAN-288, 이전 18. 선택지는 KAN-347에서 6 → 10). 시트·확인 창은 `radius-sheet` |
| `radius-sheet` | **16dp** | `16px` | 바텀 시트 위 두 모서리·가운데 대화상자(확인 창) (KAN-347 1단계·KAN-354, 시안 `.sheet` 16). Android `Radius.sheet`, 웹 `--radius-sheet` |
| `radius-xl` | **10dp** | `10px` | `radius-lg`와 같은 값으로 접었다 (KAN-288, 이전 24). 시트·대화상자는 위 `radius-sheet`다 |
| `radius-full` | 9999 | `9999px` | 원형·캡슐 (녹음 버튼, 히어로 아이콘, 진행 도트) |
| `touch-target-min` | **48dp** | `max(48px, 3rem)` | 모든 탭 가능 요소의 최소 높이·너비 |
| `control-height-lg` | **48dp** | `max(48px, 3rem)` | 주 버튼 높이 (KAN-288, 이전 56). 보조 버튼과 같은 높이이고 위계는 면 색(벽돌/크림)이 말한다 |
| `control-height-choice` | 54dp | `max(48px, 3.375rem)` | 선택지 한 칸 (KAN-288). 글 한 줄 + 위아래 여백 |
| `text-tab-label` | 12dp | `0.75rem` | 하단 탭 바 라벨·선택지 번호 상자. 최소 글자 11 규칙 위의 값 (KAN-288 디자인 검수 HIG-A) |
| `prompt-card-min-height` | 152dp | `9.5rem` | 대사 카드 (문항 길이가 달라도 카드 크기 고정) |
| `screen-padding-top` | 64dp (= 앱바 56 + 8) | 앱바 `3.5rem` + `0.5rem` + 안전 영역 | 화면 위쪽 여백. 좌우 24·아래 32와 다른 값이고, 첫 요소를 내려 그림·제목이 세로 가운데에 앉게 한다. **웹 4화면·네이티브 녹음 화면 반영 완료** (`Dimens.screenPaddingTop`). 디자인 3(KAN-288)부터 웹은 그 자리를 고정 워드마크 앱바(`--app-bar-height` 56, `ui/AppBar`)가 채우고, 브라우저에서 24로 내리던 분기(§7 KAN-199)는 걷었다 — 앱바 아래로 본문이 들어가면 안 돼서다 |
| `screen-padding-x` | 24dp | `24px` | 화면 좌우 여백(`.screen`·`.item-screen`·앱바·하단 시트 패널). 값은 `space-6`과 같고 웹만 px로 고정한다 — 200%에서 48px이 되면 360 폭 본문이 312→264px로 준다 (KAN-313, PR #68 리뷰 2026-11-10) |
| `content-max-width` | 320dp | `20rem` | 본문 최대 폭. **웹 공통 화면 틀에서는 풀었다** (KAN-347 1단계) — 390 폭에서 좌우가 35가 되던 것을 좌우 여백 24로 맞춘다. 웹에 남은 쓰임은 지금 모양을 지키는 두 분석 대기 화면(`.screen--analysis-wait`)뿐이다 |
| `opacity-disabled` | 0.6 | `0.6` | 비활성·제출 중 요소 |
| `prompt-card-padding` | 24dp | `1.5rem` | 대사·질문 카드 안쪽 여백. Android 녹음 화면 대사 카드는 KAN-354에서 위아래 18·좌우 20(시안 `.p2-record .prompt-card`) |
| `progress-bar-height` | **8dp** | `8px` | 막대 두께 (결과 점수 막대·입력 레벨 바·남은 시간 게이지). 12에서 내렸다 — §7 |
| `progress-dot-height` | 8dp | `8px` | 진행 도트 하나의 두께. 막대와 값은 같지만 뜻이 다르다 — 저쪽은 그릇, 이쪽은 칸 하나다 |
| `paper-shadow-x` / `paper-shadow-y` | **4dp / 5dp** | `4px / 5px` | 오프셋 종이 그림자가 어긋난 거리. 눌림도 이 값만큼 내려간다 (§5). KAN-288에서 3/4 → 4/5 |
| `choice-shadow-x` / `choice-shadow-y` | 3dp / 4dp | `3px / 4px` | 선택지 그림자만의 거리 (KAN-347 1단계). 선택지 눌림도 이 값만큼 내려간다 |
| `hero-icon-size` | 112dp | `112px` | 인트로·권한 화면의 원형 아이콘 (w-28) |
| `record-button-size` | 80dp | — (웹 토큰 없음) | 원형 녹음 버튼 지름 (시안: w-20) |
| `curve-lane-height` | 120dp | `7.5rem` | F0 곡선 레인 하나. 시안(72px)보다 키웠다 — 실제 기기에서는 아래가 비어 곡선이 납작했다. Android는 KAN-354에서 112(시안 `.p2-lane`, `Dimens.curveLaneHeight`) |
| `text-intro-hero` | 56dp | `3.5rem` | 인트로 제목 전용 크기. §3의 `title`(30)보다 크다 — 첫 화면에서 이 두 줄이 화면의 주인공이라 다른 화면 제목과 같은 슬롯을 쓰면 무게가 안 선다. 웹 전용(`--text-intro-hero`) |
| `intro-emphasis-line-width` | 7dp | `7px` | 제목 아래 포인트 컬러 아치의 두께. SVG `stroke-width`로 들어가고 `non-scaling-stroke`라 폭이 변해도 굵기가 일정하다 |

## 5. 모션

`ux-ui.md` §5의 ease-out 100~300ms를 따른다. easing은 전부 `cubic-bezier(0, 0, 0.2, 1)`.

| 토큰 | 값 | 용도 |
|---|---|---|
| `duration-press` | 75ms | 버튼 눌림 |
| `duration-fast` | 150ms | 상태 색 전환 |
| `duration-base` | 300ms | 화면 전환 |
| `duration-reveal` | 600ms | 결과 리빌 (§5가 허용한 예외) |

**오프셋 종이 그림자** — 이 앱의 시각 정체성 (KAN-161). 기본 상태에서 오른쪽·아래로
`paper-shadow-x` `paper-shadow-y`(4dp 5dp, KAN-288 전 3dp 4dp) 어긋난 자리에 `primary-dim` 단색 면이 깔려 종이
한 장이 떠 있는 것처럼 보이고, 누르면 그림자가 사라지면서 본체가 **정확히 그만큼** 내려가
종이가 바닥에 닿는다. 전환은 `duration-press`.

내려가는 거리와 그림자가 어긋난 거리는 같은 토큰을 읽는다. 두 값이 갈리면 본체가 그림자
자리를 덮지 못하고 어긋난 채로 멈춘다.

| | 웹 | 네이티브 |
|---|---|---|
| 그림자 | `box-shadow: var(--shadow-card)` | `Modifier.paperShadow(color, cornerRadius)` |
| 눌림 | `:active`에서 `transform: translate(x, y)` + `box-shadow: none` | 본체에 `offset(x, y)` — 그림자를 덮는다 |
| 자리 | transform·box-shadow 둘 다 레이아웃을 안 건드린다 | `paperShadow`가 `padding`으로 (4dp, 5dp)를 먼저 비운다 |

두 런타임 모두 **총 차지 높이가 눌림 전후로 같다.** 높이가 같이 변하면 옆 요소가 밀려
화면이 들썩인다. Material `elevation`과 CSS `filter: blur`는 사방으로 번지는 그림자라
이 모양이 나오지 않는다 — 알파를 섞은 흐림은 Papercut에 없는 재질이다.

**바텀 시트 (KAN-347 1단계, 움직임 타일 4)**: 덮개 `duration-fast` 150ms로 나타나고 시트가 `duration-base` 300ms로 아래에서
올라온다(`ease-out`). **점수 원 count-up**: 0 → N점을 `duration-reveal` 600ms로 센다. 웹은 이 시간을 토큰에서 읽어
JS로 돌리고, 동작 줄이기면 끝 값을 바로 그린다.

움직임 시간은 이 네 값만 쓴다 (KAN-355). iOS `Papercut.Motion`은 `press`·`fast`·`base`·`reveal`이다.

**모션 축소 대응**: 웹은 `@media (prefers-reduced-motion: reduce)`에서 모든 duration을 `0.01ms`로 덮는다. 네이티브는 `Settings.Global.ANIMATOR_DURATION_SCALE`이 0이면 애니메이션을 건너뛴다. iOS는 `accessibilityReduceMotion`(동작 줄이기)이면 버튼 눌림 이동이 없고 확인 대화상자가 페이드 없이 바로 뜬다 (KAN-355). 축소 상태에서도 **최종 상태는 동일** — 사라지는 정보가 없어야 한다.

### 그림자

번지지도, 흐려지지도, 비쳐 보이지도 않는다. 어긋난 자리에 `PAPER_SHADOW` 단색 면이
그대로 깔릴 뿐이다 — 오려 낸 종이가 바닥에 드리우는 그늘이다.

| 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| `shadow-card` | `4px 5px 0 #cfc5aa` | 일반 카드 |
| `shadow-prompt` | `4px 5px 0 #cfc5aa` | 대사·질문 카드 |
| `shadow-hero` | `4px 5px 0 #cfc5aa` | 원형 히어로 아이콘 |
| `shadow-choice` | `3px 4px 0 #cfc5aa` | 선택지 (KAN-347 1단계, 이전 `4px 5px 0`) |

그림자는 `4px 5px 0 #cfc5aa` 하나이고 선택지만 `3px 4px 0`이다 (KAN-347 1단계) — 한 화면에 네 장이 쌓이는 선택지는
한 칸 얇아야 그림자가 줄무늬로 보이지 않는다. 나머지가 같은 값인 것은 미처리가 아니라 규칙이다. 종이 한 장의 두께는
카드든 버튼이든 같고, 깊이로 위계를 만들려면 그림자가 아니라 크기·잉크 굵기를 쓴다.

바텀 시트·대화상자는 그림자를 두지 않는다. 덮개(종이 그림자색 단색, 불투명도 .6)가 이미 "떠 있다"를 말한다 (KAN-347).

## 6. 대비 검증 결과

<!-- check_contrast:begin -->
WCAG 2.1 AA 일반 텍스트 기준 4.5:1. `python3 tools/check_contrast.py --write`가 쓴 표이고,
48건 전부 기준을 넘는다. 감수한 자리는 없다.

| 조합 | 비율 | |
|---|---|---|
| `foreground` / `background` (라이트) | 14.73 |  |
| `foreground` / `card` (라이트) | 14.73 |  |
| `muted-foreground` / `background` (라이트) | 4.96 |  |
| `muted-foreground` / `card` (라이트) | 4.96 |  |
| `primary-foreground` / `primary` (라이트) | 14.73 |  |
| `secondary-foreground` / `secondary` (라이트) | 14.73 |  |
| `accent-foreground` / `accent` (라이트) | 14.73 |  |
| `destructive-foreground` / `destructive` | 14.73 |  |
| `destructive-on-surface` / `destructive-surface` (라이트) | 14.73 |  |
| `success-foreground` / `success` | 14.73 |  |
| `success-on-surface` / `success-surface` (라이트) | 14.73 |  |
| `prompt-card-foreground` / `prompt-card-start` | 14.73 |  |
| `prompt-card-muted` / `prompt-card-start` | 4.96 |  |
| `prompt-card-foreground` / `prompt-card-end` | 14.73 |  |
| `prompt-card-muted` / `prompt-card-end` | 4.96 |  |
| `point-foreground` / `point` (라이트) | 4.60 |  |
| `point` / `background` (라이트) | 4.60 |  |
| `foreground` / `background` (다크) | 14.73 |  |
| `foreground` / `card` (다크) | 14.73 |  |
| `muted-foreground` / `background` (다크) | 4.96 |  |
| `muted-foreground` / `card` (다크) | 4.96 |  |
| `primary-foreground` / `primary` (다크) | 14.73 |  |
| `secondary-foreground` / `secondary` (다크) | 14.73 |  |
| `accent-foreground` / `accent` (다크) | 14.73 |  |
| `success-on-surface` / `success-surface` (다크) | 14.73 |  |
| `destructive-on-surface` / `destructive-surface` (다크) | 14.73 |  |
| `prompt-card-muted` / `prompt-card-start` (다크) | 4.96 |  |
| `prompt-card-muted` / `prompt-card-end` (다크) | 4.96 |  |
| `point-foreground` / `point` (다크) | 4.60 |  |
| `point` / `background` (다크) | 4.60 |  |
| `foreground` / `paper` (라이트) | 15.67 |  |
| `muted-foreground` / `paper` (라이트) | 5.28 |  |
| `point` / `paper` (라이트) | 4.89 |  |
| `foreground` / `paper` (다크) | 15.67 |  |
| `muted-foreground` / `paper` (다크) | 5.28 |  |
| `point` / `paper` (다크) | 4.89 |  |

### 그래픽 오브젝트 (3:1)

F0 곡선·컨트롤 경계는 텍스트가 아니라 WCAG 2.1 **1.4.11 비텍스트 대비 3:1**이 기준이다.

| 조합 | 비율 | |
|---|---|---|
| `guide-curve` / `curve-lane-surface` (라이트) | 14.73 |  |
| `user-curve` / `curve-lane-surface` (라이트) | 4.60 |  |
| `guide-curve` / `curve-lane-surface` (다크) | 14.73 |  |
| `user-curve` / `curve-lane-surface` (다크) | 4.60 |  |
| `point`(점수 호) / `background` | 4.60 |  |
| `control-border` / `background` (라이트) | 14.73 |  |
| `control-border` / `card` (라이트) | 14.73 |  |
| `control-border` / `background` (다크) | 14.73 |  |
| `control-border` / `card` (다크) | 14.73 |  |
| `control-border` / `paper` (라이트) | 15.67 |  |
| `muted-foreground` / `paper` 선택지 테두리 (라이트) | 5.28 |  |
| `control-border` / `paper` (다크) | 15.67 |  |

### 기준 대상이 아닌 장식 면

`muted`는 진척도의 남은 구간처럼 "없는 것"을 그리는 면이다. 여기에 상태를 실으면
아래 비율 그대로 안 보이게 되므로, 상태는 잉크로만 알린다 (정본 §7).

| 조합 | 비율 | |
|---|---|---|
| `muted` / `background` | 1.46 |  |
<!-- check_contrast:end -->

## 7. 결정 기록

### KAN-161 — Papercut 팔레트

시그니처 파랑(`#2563eb`)을 버리고 크림 종이 + 잉크 단색으로 갈았다. 값 넷은 §2에 있다.

**왜 넷인가.** KAN-148 팔레트는 파랑 계열 열 몇 개에 초록·빨강·노랑·주황을 더해 쓰고 있었고,
그중 여덟 조합이 최소선을 못 넘겨 "시안 채택으로 감수"라는 이름으로 남아 있었다. 잉크 하나로
접으면 그 여덟이 한꺼번에 사라진다 — 크림 위 잉크는 14.73:1이라 어디에 놓든 기준을 넘는다.
남는 문제는 "색이 하던 구분을 무엇이 대신하는가"뿐이고, 아래 셋이 그 답이다.

**일러스트 고정색 (`ILLO`).** 종이 `#f3ecd9` / 잉크 `#1c1a17`. 테마 토큰을 참조하지 않고
값을 직접 박는다. 일러스트는 그림 한 장이라 부분만 테마를 따라 바뀌면 선과 면이 어긋나고,
`ILLO`를 §2 표에 넣으면 화면 코드가 `--color-illo-paper` 같은 이름으로 끌어다 쓰기 시작해
"일러스트 전용"이라는 경계가 무너진다. 그래서 토큰이 아니라 상수다.

**다크 분기를 라이트로 고정.** `Theme.kt`는 `isSystemInDarkTheme()`을 보지 않고,
`tokens.css`에는 `prefers-color-scheme` 블록이 없다. iOS는 `Info-*.plist`의
`UIUserInterfaceStyle = Light`로 같은 고정을 건다(KAN-224 — 없으면 시스템 컨트롤만 다크 글자색이 된다). 이유는 둘이다. 한 세션 안에서
네이티브와 WebView 화면이 번갈아 나오는데 한쪽만 뒤집히면 화면 경계에서 색이 튄다.
그리고 Papercut은 크림 종이에 잉크를 얹은 그림이라 명암을 뒤집으면 같은 디자인의 어두운
판이 아니라 다른 물건이 된다 — 검은 종이에 크림 잉크는 종이가 아니라 칠판이다.
정본 §2의 다크 표와 `Color.kt`의 `Dark*` 상수는 라이트와 같은 값으로 남겨 뒀다:
`tools/check_tokens.py`가 그 짝으로 대조하고, 다크 전용 팔레트를 만드는 후속 티켓이
채워 넣을 자리이기도 하다.

**`success`·`destructive`를 잉크로 접었다.** 정답 초록·오답 빨강이 사라졌다. 단일 잉크
팔레트에서 두 색만 되살리면 그 둘이 화면에서 유일한 색조가 되어 그림이 깨진다.
정오답과 오류는 색이 아니라 **문구와 아이콘**으로 가른다 — WCAG 1.4.1이 원래 요구하는 것도
"색만으로 알리지 않기"이므로 색을 빼는 쪽이 기준에는 오히려 가깝다. 정답 선택지는
✓ 표시와 문구가, 오류 블록은 `role="alert"`로 읽히는 문장이 상태를 나른다.
같은 이유로 곡선 둘도 잉크 하나이고, 가이드는 점선·사용자는 실선으로 갈린다.

**히어로 아이콘 면을 크림으로 뒤집었다 (2단계).** `hero-start`·`hero-end`가 잉크였는데
크림이 됐다. 잉크로 꽉 찬 원은 화면에서 주 버튼과 무게가 같아져 어느 쪽을 눌러야 하는지가
흐려진다 — 아이콘은 누르는 것이 아니다. 지금은 오려 낸 크림 동그라미에 잉크 테두리 1.5dp를
두르고 오프셋 그림자로 띄운다. 그라디언트가 아니라 단색이라 start·end는 같은 값이다.

**`#cfc5aa`(`muted`)는 상태를 나르지 않는다.** 크림 위 1.46:1이다. 진척도의 남은 구간,
비활성 면처럼 "아직 없는 것·지금 못 누르는 것"을 그리는 자리에만 쓴다. 비활성은 이 색의 면과
흐린 잉크 글자가 함께 알리고(KAN-355, 이전에는 `opacity-disabled`), 진척은 채워진 잉크 쪽이 알린다. 이 값으로 무언가를
"표시"하면 그 표시는 보이지 않는다.

### 포인트 컬러 — 테라코타 `#a8503a` (2026-09-09)

잉크 하나이던 팔레트에 **두 번째 잉크**를 더했다. 리소그래피가 판을 두 번 미는 것과 같은
자리다 — 종이는 그대로 크림이고, 잉크 위에 색을 덧칠하는 것이 아니라 색이 자기 자리를 따로 갖는다.

**왜 테라코타인가.** 후보를 크림 위 대비와 **잉크 옆 대비** 두 축으로 재고 골랐다. 크림 대비만
높은 색(남색 `#26406b` 8.78, 자주 `#7d3350` 7.24)은 잉크 옆에 놓으면 1.7~2.1까지 떨어져
"색"이 아니라 "또 하나의 진한 잉크"로 읽힌다 — 포인트 컬러 노릇을 못 한다.

| 후보 | 크림 위 | 잉크 옆 | |
|---|---|---|---|
| **테라코타 `#a8503a`** | **4.60** | **3.20** | 채택 — 잉크 옆에서 가장 잘 갈린다 |
| 버밀리언 `#b3341f` | 5.20 | 2.83 | 크림 위 대비는 더 높지만 종이의 온기보다 세다 |
| 청록 `#1f6b63` | 5.33 | 2.76 | 유일한 한색 대안. 크림의 온기와 어긋난다 |
| 짙은 초록 `#2f6b3a` | 5.42 | 2.72 | 정답 초록으로 오해된다 — 아래 금지 규칙과 충돌 |
| 남색·자주·보라·버건디 | 6.9~8.8 | **1.7~2.1** | 잉크에 흡수 |

테라코타는 크림 위 4.60:1로 본문 기준(4.5:1)을 넘으므로 글자에도 쓸 수 있고, 위에 크림 글자를
얹어도 같은 4.60:1이라 주버튼 면이 된다 (§6). 잉크 옆 3.20은 후보 중 가장 높다 — 흙빛이라
크림 종이와 한 계열로 앉으면서도 잉크와는 또렷이 갈린다.

**쓰는 자리는 화면당 하나다.** 망점을 "화면당 한 곳"으로 묶어 둔 것과 같은 규칙이고, 이유도
같다 — 두 곳이 되는 순간 어느 쪽을 보라는 것인지가 흐려진다.

**화면마다 그 한 자리는 다르다** (2026-09-09). "한 자리"는 요소 하나가 아니라 **한 가지 뜻**이다 —
결과 화면의 총점 도넛과 두 막대는 같은 결과를 세 값으로 나눠 적은 것이라 한 자리로 센다.
총점만 색이고 내역이 잉크면 도넛과 막대가 다른 것을 재는 것처럼 보인다.

| 화면 | 색이 서는 자리 |
|---|---|
| 인트로 | 제목 아치 |
| 음성 문항(녹음) | 내 억양 곡선 — 실선과 그 아래 망점 채움 |
| 결과 | 점수 표시 묶음 — 총점 도넛의 호와 억양·단어 막대의 채운 몫 |
| 나머지 | 없다. 주버튼은 전부 잉크다 |

**주버튼에는 쓰지 않는다.** 화면 바닥에 하나뿐인 채운 면이라 잉크만으로도 누를 것이 무엇인지
읽힌다 — 색을 거기 쓰면 화면마다 색이 하나씩 더 생기고, 정작 색이 필요한 자리와 경쟁한다.

**색을 되살려도 색만으로 가르지는 않는다.** KAN-161이 정오답을 잉크로 접은 근거(WCAG 1.4.1)는
그대로다. 곡선 둘은 가이드가 점선·사용자가 실선이라 색이 빠져도 갈리고, 점수 도넛은 잉크 파선
트랙 위에 실선 호가 겹쳐 채운 몫과 남은 몫이 모양으로 갈린다. 색이 하는 일은 **어느 쪽이
내 것인지, 어디까지 찼는지를 한눈에 잡아 주는 것**이지 정보를 혼자 나르는 것이 아니다.

**인트로에서 그 한 자리는 제목 아치다** (2026-09-09). 처음에는 주버튼 면도 포인트 컬러였는데
그러면 첫 화면부터 색이 둘이었다. 버튼을 잉크로 되돌린 것은 **잉크만으로도 이미 분명하기
때문이다** — 화면 바닥에 하나뿐인 채운 면이라 누를 것이 무엇인지 색 없이도 읽힌다. 아치는
반대다: 색이 빠지면 잉크 곡선 하나가 제목 밑에 남을 뿐이라 강조가 사라진다. 색은 그것이
없으면 뜻이 사라지는 쪽에 준다.

**정오답·오류에는 쓰지 않는다.** `success`·`destructive`는 잉크 그대로다. 여기에 색을 되살리면
KAN-161이 세운 근거(색만으로 상태를 알리지 않는다, WCAG 1.4.1)가 무너지고, 팔레트에 색이
하나뿐인 화면에서 그 하나가 "오류"를 뜻하게 되어 주버튼이 경고처럼 보인다.

### KAN-161 4단계 — 네이티브 녹음 화면 이식에서 정한 것

**막대는 전부 8이다.** `progress-bar-height`가 12였는데 8로 내렸다. 아트보드의 막대(대기 화면
상단·결과 점수)가 전부 8이고 2단계에서 만든 진행 도트도 8이라, 한 화면 안에 12와 8이 섞이면
같은 "막대"인데 무게가 달라 보인다. 굵기로 위계를 만들지 않는 팔레트라(위의 굵기 400·500 결정과
같은 이유) 막대의 굵기는 뜻을 나르지 않는다. 결과 점수 막대·입력 레벨 바·녹음 남은 시간 게이지가
한 값을 읽으므로 세 곳이 함께 얇아진다.

**`timer` 슬롯을 새로 뒀다 (Jua 16 · 자간 0.04em).** 녹음 타이머 `00:04 / 10초`와 경고 캡슐
`2초 남음`이 쓴다. `body`(시스템 16)로 적으면 초마다 바뀌는 숫자가 문단의 한 낱말처럼 읽히고,
`titleSmall`(Jua 20)은 바로 아래 녹음 버튼과 무게가 겹친다 — 크기는 본문에 맞추고 글꼴만 대사와
같게 두는 자리가 필요했다. 자간을 주는 슬롯은 이것 하나다: 자리가 고정된 숫자라 그 값이 없으면
`00:04`의 두 자리가 서로 붙어 보인다. 네이티브에서는 M3에 타이머 슬롯이 없어 남아 있던
`titleSmall` **슬롯**에 얹었고, 이름과 뜻의 대응은 `check_tokens.py`의 `TYPE_SLOTS`가 든다.

**Jua 24와 시스템 17 슬롯은 만들지 않는다.** 아트보드에 그 두 크기가 몇 군데 나오지만 각각
`headline`(26)과 `body`(16)로 대체한다. 슬롯 하나를 더 두면 화면 코드가 26과 24 중 무엇을 골라야
하는지 매번 판단해야 하고, 그 판단은 사람마다 갈려 결국 같은 성격의 글자가 화면마다 다른 크기로
남는다. 2px 차이가 만드는 것보다 "이 자리에는 이 슬롯"이 분명한 쪽이 두 런타임에 이롭다.
`radius-sm`·`radius-lg`가 쓰는 곳 없이 남아 있는 것도 같은 이야기의 뒷면이다 — 슬롯은 늘리기는
쉽고 줄이기는 어렵다.

**이모지를 잉크로 걷어냈다.** 대사 카드 배지의 `🎤 음성 문항`, 목소리 점검의 `🎤 목소리 점검`,
권한 화면의 히어로 `🎤`와 안심 문구 `📊 🏆 🔒`가 전부 사라졌다. 잉크 한 색 화면에서 이모지는
색을 가진 유일한 물건이라, 오려 낸 종이 위에 붙인 스티커처럼 그림 밖으로 튄다. 히어로는 이미
갖고 있던 마이크 선화(`outline_mic_24`)로 바꿔 녹음 버튼 안의 그림과 같아졌고, 안심 문구 세 줄은
잉크 점 하나를 줄머리로 쓴다 — 그 세 줄이 나르는 정보는 전부 글에 있어서 그림이 없어도 잃는 것이
없다. `grep`으로 렌더 문자열의 이모지가 0건인지 확인한다.

**`screen-padding-top` 64가 네이티브에도 붙었다.** 3단계에서 웹 4화면에만 있던 값이고,
녹음 화면이 `Dimens.screenPaddingTop`으로 같은 값을 쓴다. 좌우 24·아래 32는 그대로다.

### KAN-354 — 버튼 라벨은 Jua (2026-11-12, KAN-311)

디자인 3(KAN-288)의 「Jua는 제목·대사·점수·등급 전용이고 버튼 라벨은 본문 산세리프」 규칙을 바꿨다. 버튼 라벨은
Jua다 — 주·보조·위험 확인 17, 글자 버튼 16 (이성주, 2026-11-12). Android 앱 주 버튼이 본문 산세리프 15·높이 50,
iOS가 Jua 20·높이 56이라 두 앱 버튼이 서로 달랐고, KAN-311 시안이 한 규칙(Jua 17·높이 48)으로 묶었다.
Jua에는 굵기가 400 하나뿐이라 라벨에도 굵기를 주지 않는다(§3). Android 반영은 KAN-354 1단계.

### 시안에서 조정한 값

배치·간격·타이포는 아직 KAN-148 시안(`prototype/`)에서 오고, 아래 둘만 조정한 채로 유지된다.

| 항목 | 시안 | 정본 | 이유 |
|---|---|---|---|
| 주버튼 높이 | 40px (`h-10`, App.tsx:115·199·390·443·474·535) | **48dp** | §5 터치 타겟 최소선 미달 |
| 웹 음성 문항 대사 | 20px | 26px | §5 "대사 카드 24sp 이상" 미달. 네이티브 대사 카드와 같은 크기로 맞춘다 |

정본은 semantic 토큰 이름 한 벌로만 정의한다 — 그래야 "같은 의미의 색이 네이티브와 웹에서
같은 값"이 성립한다. 화면 코드가 원시 색값을 직접 적으면 그 순간 두 런타임이 갈라진다.

### 기준 미달을 감수한 것 — KAN-161로 전부 해소

KAN-148은 시안 색을 그대로 쓰기로 하고 여덟 자리에서 최소선을 감수했다.
Papercut 팔레트가 그 여덟을 전부 없앴다.

| 감수했던 항목 | KAN-148 값 | 당시 대비 | 지금 | 지금 대비 |
|---|---|---|---|---|
| 대사 카드 본문 | `#ffffff` on `#3b82f6` | 3.68 | `#1c1a17` on `#f3ecd9` | 14.73 |
| 대사 카드 보조·배지 | `#eff6ff` on `#3b82f6` | 3.38 | `#6b6459` on `#f3ecd9` | 4.96 |
| 가이드 곡선 | `#93c5fd` on `#ecf4ff` | 1.63 | `#1c1a17` on `#f3ecd9` | 14.73 |
| 사용자 곡선 | `#fb923c` on `#ecf4ff` | 2.04 | `#1c1a17` on `#f3ecd9` | 14.73 |
| 선택지 테두리(미선택) | `rgba(37,99,235,.13)` on `#ffffff` | 1.20 | `#1c1a17` on `#f3ecd9` | 14.73 |
| 컨트롤 경계 3종 (배경·카드·다크) | 같은 반투명 파랑 | 1.15~1.19 | `#1c1a17` on `#f3ecd9` | 14.73 |

`tools/check_contrast.py`의 `WAIVED`는 비어 있다. 비운 채로 유지한다 — 거기에 이름을 하나
넣는 것은 그 화면을 검사에서 빼는 것과 같고, 한 번 비어 본 목록은 다시 채우기 어렵다.
KAN-148의 AC "텍스트 대비 4.5:1"은 이제 예외 없이 지켜진다.

## 8. 공통 컴포넌트

화면들이 실제로 반복해서 쓰는 것만 둔다. 쓰지 않는 컴포넌트는 만들지 않는다.

| 컴포넌트 | 네이티브 | 웹 |
|---|---|---|
| 버튼 | `ui/components/AccenturyButton.kt` | `web/src/ui/Button.tsx` + `.btn` |
| 진척도 | `ui/components/ProgressIndicator.kt` | `web/src/ui/ProgressIndicator.tsx` |
| 대기·오류 블록·예외 화면 서식 | `ui/components/StatusBlock.kt` | `web/src/ui/StatusBlock.tsx` (`icon`을 주면 예외 서식, KAN-347) |
| 점수 원 | — | `web/src/ui/ScoreDonut.tsx` (KAN-347) |
| 별 칸 | — | `web/src/ui/Stars.tsx` (KAN-347) |
| 바텀 시트 | — | `web/src/ui/BottomSheet.tsx` + `.sheet` (KAN-347) |
| 가운데 대화상자 | iOS `UI/Components/ConfirmDialog.swift` (KAN-355) | `web/src/ui/Dialog.tsx` + `.dialog` (KAN-347) |
| 대사·질문 카드 | `ui/components/PromptCard.kt` | `.prompt-card` |
| 선택지 | `ui/components/ChoiceButton.kt` (KAN-224 성별·출신지역) · iOS `UI/Components/ChoiceButton.swift` | `.choice` |
| 입력 칸 | `ui/components/AccenturyTextField.kt` (KAN-224 추가 정보) · iOS `UI/Components/AccenturyTextField.swift` | — |
| 곡선 레인 | `ui/components/CurveLane.kt` | `web/src/recording/CurveLane.tsx` |
| 녹음 버튼 | `ui/components/RecordButton.kt` | — (웹은 `.btn`으로 녹음한다) |
| 히어로 아이콘 | `ui/components/HeroIcon.kt` | `.hero-icon` |
| 예외 화면 서식 | iOS `UI/Components/ExceptionScreen.swift` (KAN-355) — 아이콘 원 112·선화 56, 원 윗선 y=200, 제목 Jua 30, 설명 15 흐린 잉크 | `.p3-status` (시안) |
| 오프셋 그림자 | `ui/components/PaperShadow.kt` | `--shadow-*` 토큰 (§5) |

### 컷아웃 카드

> **KAN-288 디자인 3에서 바뀐 값 (웹 반영, 네이티브는 KAN-288 Android·iOS 단계).** 테두리는 1px로 내렸다 —
> 카드는 1px 잉크, 대사·질문 카드는 1px 종이 그림자색(그림자가 윤곽을 맡는다), 고르지 않은 선택지·학습
> 목록 행·별점 칸은 1px 흐린 잉크(`#6b6459`), 고른 선택지만 2px 잉크다. 반경은 10(카드·시트) / 6(버튼·선택지·
> 입력·행) / 4(칩·번호 상자). 대사·질문 카드 위쪽 파선은 넣지 않는다(사용자 결정). 아래 문단은 KAN-161 당시 값이다.

카드·선택지·버튼·곡선 레인 상자가 전부 같은 규칙을 쓴다: **`1.5px` 잉크 테두리 + 크림 면
+ 오프셋 그림자 한 겹.** 주 CTA와 선택된 선택지만 테두리가 `2px`다 — 두께가 "지금 이것"을
뜻하는 유일한 자리다. 반경은 24(대사·질문 카드, 결과 점수 카드) / 16(버튼, 선택지, 곡선 레인
상자) 둘뿐이다.

카드와 배경이 같은 크림이라 **카드를 세우는 것은 색이 아니라 테두리와 그늘이다.** 면을 하나
더 만들어 구분하려 들면(배지 알약, 색 면 블록) 크림 위에 크림이 겹쳐 카드 안에 또 카드가
그려진 것처럼 보인다.

### 버튼

무게 네 가지(`Primary`·`Secondary`·`Destructive`·`Text`).

> **KAN-347 1단계 (웹 반영, 네이티브는 KAN-354·KAN-355):** 라벨이 Primary·Secondary Jua 17, Text Jua 16(굵기 400)으로
> 바뀌었다(§3 「버튼 라벨」). 아래 표의 라벨 열은 그 전 값이다. 큰 글자에서 넘치면 줄을 바꾼다.

| | 높이 | 테두리 | 면 | 그림자 | 라벨 |
|---|---|---|---|---|---|
| Primary | `control-height-lg` 48 | 1px 벽돌 | **벽돌 `point`** | 있음 | Jua 17, 크림 글자 |
| Secondary | `touch-target-min` 48 | 1px 잉크 | 크림 | **없음** | Jua 17, 잉크 글자 |
| Text | `touch-target-min` 48 | 없음 | 없음 | 없음 | Jua 16, 흐린 잉크 글자. 밑줄은 눌린 동안만 |
| Destructive | `touch-target-min` 48 | 1.5px 벽돌 | 크림 | 없음 | Jua 17, 벽돌 글자 — 확인 창의 [그만두기]·[탈퇴] (2026-11-16 결정) |

위 표의 라벨 열은 2026-11-12 결정(§7 KAN-354)이고 Android는 KAN-354 1단계에서 반영했다(`AccenturyButton`, `ButtonLabel`).
라벨 앞뒤에 20dp 아이콘을 8dp 사이로 붙일 수 있다(Android `leading`·`trailing`, 색은 라벨 색). 눌림은 `duration-press` 75ms에
주 버튼만 그림자 자리로 내려가고, 움직임 줄이기면 내려가지 않는다. 그 밖의 값은 KAN-288 디자인 3이다. 이전(KAN-161)에는 Primary가 56 높이·2px 잉크 테두리·잉크 면·Jua 20
라벨, Secondary가 1.5px 잉크 테두리였다. 비활성 Primary는 종이 그림자 면 + 흐린 잉크 글자·테두리다.

**화면당 주 행동은 벽돌 면 하나다 (KAN-288).** 주 버튼이 벽돌이 되면서 보조 행동은 Secondary·Text로 둔다.
**예외 하나** (사용자 결정 2026-10-18, 2단계에서 한때 내렸다가 원복): 결과 화면 [다시 테스트하기]는 벽돌 채움
(2026-09-15 결정, `.result-retest__button`). 그림자는 주버튼에만 남아 떠 있는 종이는 하나다. 억양 학습 피드백의 예외
([다시 시도] 벽돌·[결과 목록으로] 배경색 바탕, 2026-10-12)는 2026-11-05 사용자 결정으로 없어졌다 — [다시 말해 보기]가 주 버튼,
「결과 목록으로」는 글자 버튼이다(KAN-347 5-3). 동의처럼 어느 쪽도 "다음 단계"가 아닌 두 선택지는 둘 다
Secondary다 — 맞춤형 광고 시트 [맞춤형 광고 받기]·[일반 광고만 보기] (HIG-A).

그림자는 주 버튼에만 있다. 그림자는 "떠 있다"는 뜻이라 화면에 떠 있는 종이가 둘이면 어느
쪽을 눌러야 하는지가 흐려진다. 보조 버튼은 자리만 같게 비워 눌림 거리를 맞추고 그림자를
그리지 않는다. 글자만 있는 버튼은 눌러도 움직이지 않는다 — 종이가 아니라 글씨라 내려갈
바닥이 없다.

비활성은 면이 있는 버튼이면 종이 그림자 면 + 흐린 잉크 글자·테두리, 글자 버튼이면 `opacity-disabled` 0.6이다 (KAN-355, 그 전에는
모든 버튼이 0.6뿐이었다).

iOS(KAN-355)는 `UI/Components/AccenturyButton.swift`다. 라벨 슬롯은 `Papercut.TextStyle.button` 17·`textButton` 16(자간 0.01em),
앞뒤 선화 20·간격 8이고, 라벨은 어떤 폭에서도 한 줄이다(`lineLimit(1)`, 좁으면 `buttonLabelMinScale` 0.8배까지 줄어든다).
확인 대화상자(`UI/Components/ConfirmDialog.swift`)는 폭 320·안쪽 20·모서리 16·`paper` 면·잉크 1 테두리, 덮개 `#cfc5aa` 0.6,
버튼 둘을 12 사이로 나란히 두고 버튼 좌우 여백은 24가 아니라 16(`dialogButtonPaddingX`)이다 — 버튼 폭 134에 [로그아웃]
(선화 20 + 간격 8 + Jua 17 네 글자)이 24 여백으로는 들어가지 않는다. 바깥 탭·VoiceOver escape는 왼쪽 버튼과 같다.

로그인 IdP 버튼은 이 버튼 위계 밖이다(2026-11-11 결정, KAN-354). Android는 `auth/LoginScreen.kt` `IdpButton`이 각 사
가이드의 면·글자·문구로 따로 그린다(높이 48·반경 12·테두리 없음·시스템 글꼴 15, 로고 왼쪽 고정). 출처·규칙은
[social-login-logos.md](social-login-logos.md).

### 선택지 (웹, KAN-347 1단계)

paper 면, 높이 56, 반경 10, 잉크 1px, 그림자 `3px 4px 0`, 번호 원 28(Jua 14), 글자 Jua 20. 고른 칸 = 잉크 2px + 번호 원이
잉크로 찬다. 제출 뒤 내 오답 = 벽돌 2px 실선, 정답 = 잉크 2px이고 둘 다 SVG 체크·엑스 + 글자 꼬리표(「정답」「내 답」)가 붙는다 —
색 말고 기호로도 가른다(WCAG 1.4.1). 잠긴 칸 중 정오와 무관한 칸만 흐린 잉크다(흐리게 하지 않는다). 출신 지역은 선택지가 아니라
7단계의 지도 위 칩이다 — paper 면·잉크 1px·반경 `radius-sm`·Jua 14(`--text-label`), 고른 칩은 벽돌 면·종이색 글자로 반전하고 큰 글자에서는
같은 칩을 2열 목록으로 편다(`region/RegionSelectScreen.css`, `region-map.md`).

### 선택지 (네이티브, KAN-224)

`ChoiceButton` — Android는 고르지 않은 칸이 흐린 잉크(`muted-foreground`) 1 테두리 + `paper` 면 + 반경 6(`radius-md`),
최소 높이 `control-height-lg` 48이다(KAN-288 디자인 3·KAN-354). **고른 칸만 잉크 2 테두리·✓·오프셋 그림자**가 붙고 면 색은
바뀌지 않는다. 그림자 자리는 고르지 않은 칸도 비워 둬서 고를 때 격자가 들썩이지 않는다. 라벨은 버튼 글자와 같은 Jua 16
(`ButtonLabel.Text`, KAN-354 시안 s-02-profile). 스크린 리더에는 라디오 버튼(`Role.RadioButton` + `selected`)으로 읽히고,
묶음은 부모가 `selectableGroup`으로 감싼다.

### 입력 칸 (KAN-224)

`AccenturyTextField` — Android는 흐린 잉크(`muted-foreground`) 1 테두리 + `paper` 면 + 반경 6(`radius-md`), 최소 높이 48,
**그림자 없음**(떠 있는 종이는 주 버튼 하나다)이다(KAN-288 디자인 3·KAN-354). 포커스는 테두리가 잉크 2로 굵어지는 것뿐이다.
이름표는 칸 위 `labelLarge`이고 칸 안 글자는 `bodyLarge`, 칸의 접근성 이름도 이름표와 같은 글자다. `onClick`을 주면 치는 칸이
아니라 누르는 칸(생년월일 → 달력)이 되고 버튼으로 읽힌다.

### 진척도

> **KAN-347 1단계 (웹 반영):** 알약 칸이다. 왼쪽 라벨(「단어」「억양」)과 오른쪽 「n / N」이 13px 흐린 잉크로 위 한 줄에
> 서고, 아래 알약 칸(높이 8, 간격 6, 반경 full)은 끝난 칸 벽돌 · 지금 칸 왼쪽 절반 벽돌 · 남은 칸 종이 그림자색이다. 테두리와
> 그라디언트는 없어졌다(지금 칸 반쪽은 `::before`). progressbar 한 줄로만 값을 읽는 구조는 그대로다. 아래 KAN-288 인용과
> 본문은 그 전 값이다.

> **KAN-288 디자인 3 (웹 반영):** 칸은 모서리 없는 띠, 지나온 칸·현재 칸은 벽돌, 남은 칸은 종이 그림자 면 + 1px 흐린
> 잉크다. 이름(「문항 진행률」)과 "3 / 10"이 도트 **위** 한 줄에 선다 — 이름 왼쪽, 숫자 오른쪽(시안 `.card-progress`).
> 둘 다 눈으로만 읽고 값은 progressbar 한 줄이 말하는 것은 그대로다. 아래 문단은 KAN-161 당시 값이다.

도트 줄과 "3 / 10" 표기가 한 덩어리다. 둘이 떨어져 있으면 한쪽만 고쳐 어긋난다.
막대 하나가 아니라 **문항 수만큼의 캡슐**이다 — 남은 문항을 세어 볼 수 있고, 칸 하나가
채워지는 것이 막대가 조금 자라는 것보다 "한 문항 넘어갔다"로 읽힌다.

캡슐은 높이 `progress-dot-height` 8, 사이 간격 `space-1` 4, 반경 `radius-full`, 남는 폭을
균등하게 나눠 갖는다. 세 상태를 **색이 아니라 형태**로 가른다.

| 상태 | 그림 |
|---|---|
| 완료 | 잉크로 채운 캡슐 + 1px 잉크 테두리 |
| 현재 | **2px** 잉크 테두리 + 왼쪽 절반만 잉크 |
| 미완료 | 크림 + 1px 잉크 테두리 |

`primary-dim`(#cfc5aa)으로 남은 칸을 칠하지 않는다 — 크림 위 1.46:1이라 표시가 보이지
않는다 (§7). 절반 채움은 웹이 `linear-gradient(90deg, ink 50%, cream 50%)`, 네이티브가
캔버스 사각형이다. **Papercut에서 그라디언트를 쓰는 자리는 여기 하나뿐이고**, 50%에서 딱
끊기므로 결과는 번지는 면이 아니라 잉크와 크림이 맞닿은 경계 하나다.

스크린 리더에는 줄 전체가 `progressbar` 하나로 읽히고(웹 `role="progressbar"` +
`aria-valuenow`/`aria-valuemax`, 네이티브 `clearAndSetSemantics`), 도트 하나하나와 아래
숫자는 의미론에서 뺀다 — 같은 정보를 열한 번 말하지 않게. 상태는 웹에서 `data-state`
속성으로도 드러나 테스트가 색을 보지 않고 확인한다.

Android는 KAN-354에서 시안 s-06·s-17(`.progress-indicator`)대로 그린다 (`ProgressIndicator.kt`). 머리줄은 왼쪽 「억양」·오른쪽
`n / N`(둘 다 13 흐린 잉크, 「문항 진행률」·「카드 진행률」·「· 음성」은 걷었다), 칸은 알약 높이 8(`Dimens.progressDotHeight`)·간격 6,
지난 칸 벽돌·지금 칸 왼쪽 절반 벽돌·남은 칸 `primary-dim` 면(테두리 없음)이다. 머리줄·칸 덩어리 전체가 한 문장으로 한 번만
읽힌다 — 레벨 테스트 「억양 · 7문항 중 1번째」, 억양 학습 「억양 · 대사 3개 중 1번째」(`progressDescription`).

### 대사 카드 — Android (KAN-354)

`PromptCard.kt` (시안 s-06·s-17·s-05-voicecheck-app `.prompt-card`). `paper` 면·잉크 1 테두리·반경 10·종이 그림자, 안쪽 위아래 18·좌우 20,
요소 사이 10, 최소 높이 152. 대사는 Jua 30/1.3이고 세 줄 이상으로 접히면 26/1.3으로 줄인다(첫 배치의 줄 수로 판정, 넘치면 카드가
자란다). 칩은 잉크 면·크림 글자 알약(반경 4·본문 12/18)이고 대사 **아래**에 선다 — 레벨 테스트 감정 칩 「(감정) 느낌으로 말해 주세요」,
억양 학습 「사투리로 따라 말해 보세요」. 목소리 점검만 시안대로 캡션 「목소리 점검」 아래·대사 위에 「편하게 말해 주세요」를 둔다.
대사 위 흐린 13 캡션은 억양 학습 「표준어 · …」, 감정 칩이 없는 레벨 테스트 문항 「n / N · 이 문장을 읽어주세요」다.
웹 대사 카드의 감정 칩 `.prompt-card__cue`(`VoiceItemScreen.tsx`, PR #85)와 iOS `PromptCard.swift`도 같은 칩 규격·같은 캡션 생략 규칙이다.

### 대기·오류 블록

> **예외 화면 서식 (KAN-347 1단계, 웹):** 아이콘 원 112(아이콘 56, 잉크 1px, 그림자 없음), 원 윗선 y=200, 제목 Jua 30, 설명 15
> 흐린 잉크, 버튼은 내용 너비(위 32), 그 아래 오류 코드 13 흐린 잉크. 하단 고정 버튼(마이크 차단의 스토어 링크)은 전체 너비를
> 유지한다. 대상: 학습 로딩·학습 탭 게스트 안내·로그인 안내·목록 오류·마이크 차단. 웹은 `StatusBlock`에 `icon`을 주면
> 이 서식(`.exception`)이다.
>
> **바텀 시트·대화상자 (KAN-347 1단계, 웹):** 시트는 paper 면, 위 모서리 16, 잉크 1px(아래 없음), 제목 26, 덮개 `#cfc5aa`
> 불투명도 .6. 대화상자는 폭 320, 모서리 16, 같은 면·덮개, 제목 26, 설명 15 흐린 잉크, 버튼 세로 쌓기.

문구 + 부연 + 선택적 복구 동작. 오류일 때만 스스로 읽힌다 (웹 `role="alert"`, 네이티브
`liveRegion`). 대기 문구는 곧 바뀔 상태라 매번 읽으면 소음이 된다.

**색 면도, 빨강도 없다.** 오류를 색으로 알리던 규칙이 사라졌으니 두 톤에 다른 색을 줄
이유도 없다 — 무엇이 잘못됐는지는 잉크 문구가 말하고 부연은 양쪽 다 흐린 잉크다.
복구 동작은 보조 버튼으로 들어온다.

### 확인 창 (KAN-354)

Android `ui/components/ConfirmDialog.kt` (시안 s-11-confirm-logout·s-11-confirm-withdraw·s-06-confirm-quit). 폭 320(좁은
화면은 좌우 16을 남기고 준다)·모서리 `radius-sheet` 16·`paper` 면·잉크 1 테두리·그림자 없음·안쪽 20, 제목 Jua 26, 본문,
바닥에 버튼 둘을 12 사이로 나란히 — 왼쪽 보조(머무는 쪽), 오른쪽 확인. 확인 버튼은 [그만두기]·[탈퇴]가 Destructive,
[로그아웃]이 Primary다(`confirmVariant`). 덮개는 `primary-dim` `#cfc5aa` 불투명도 0.6 — 토큰이 아니라 이 자리에만 쓰는
값이다. 덮개는 상태 바·내비게이션 바 뒤까지 화면 전체를 덮는다(`DialogProperties(decorFitsSystemWindows = false)`). 창 바깥·시스템 뒤로가기는 왼쪽 버튼과 같고, 진행 중(`busy`)이면 두 버튼과 바깥·뒤로가기가 모두 막힌다.
덮개와 종이는 `duration-fast` 150ms에 함께 나타나고 움직임 줄이기면 처음부터 다 보인다.
본문 글자는 창이 기본값으로 준다(`ProvideTextStyle`, 시안 `.quit-dialog p` 본문 13/1.8 흐린 잉크) — 그만두기·로그아웃·탈퇴 창이 같은 값이다.

### 설정 목록 (KAN-354)

Android `auth/SettingsScreen.kt` (시안 s-11-settings 「B 목록형」). 회원(`SettingsScreen`)·게스트·익명 빌드(`AnonymousSettingsScreen`)가
같은 틀이다. 머리는 왼쪽 「설정」 Jua 26(`ScreenTitle.Form`)·오른쪽 48 ✕(높이 56, 스크롤하지 않음)이고 워드마크 앱바·바닥 고정
버튼은 없다. 목록은 좌우 24 안에서 스크롤한다. 묶음 이름은 12/18 흐린 잉크(위 8·아래 4), 행은 높이 56 이상에 앞 선화 20·라벨
13·오른쪽 흐린 값 13, 누르는 행은 끝에 꺾쇠 14이고 행 전체가 눌린다. 행 사이는 `primary-dim` 1 실선이다. 회원은 계정(이름·이메일·
로그인 방식 세 행 + 바로 아래 폭 전체 [로그아웃] 보조·[회원 탈퇴] 글자 버튼, 버튼 사이 4) · 광고(「맞춤형 광고 설정」·「광고 신고」) ·
개인정보(음성 저장 동의 스위치 행·안내 12/18·「개인정보처리방침」 밑줄 행과 외부 링크 16) 순서다. 게스트는 계정 묶음에 안내 「로그인하면 억양 학습과 단어 학습 기록을 남길 수 있어요」(12/18 흐린 잉크)와 그 아래
[로그인] 주 버튼, 익명 빌드는 계정 묶음이 없다. 스위치는 시안 `.switch` 38×24 모서리 4 — 꺼짐 `paper` 트랙·잉크 손잡이, 켜짐 벽돌
트랙·`paper` 손잡이와 체크 — 이고 읽기·누름은 행의 `toggleable`(`Role.Switch`)이 맡는다. 설정을 열고 닫을 때는 전환 없이 바로
바뀐다. 확인 창은 위 「확인 창」 절이고 [탈퇴]는 Destructive에 휴지통 앞 아이콘이다.

### 예외 화면 서식 (KAN-354)

Android `PaperExceptionScreen`·`PaperFailureScreen` (`ui/components/PaperScreen.kt`, 시안 s-15-session-gate·s-15-webview-failed).
앱바 아래 가운데 정렬로 아이콘 원 112(안의 선화 56), 제목 Jua 30, 설명 15 흐린 잉크, 내용 너비 버튼(주 버튼 아래 글자 버튼).
원 윗선은 화면 위에서 200(앱바 56 + 144), 제목 위 24·설명 위 8·버튼 위 32. 슬롯은 아이콘·제목·설명·본문(선택)·버튼들·
바닥 고정 버튼(선택)이다. 세션 확인 실패([다시 시도]·[처음으로])·웹뷰 연결 실패(앱바에 설정 톱니)·앱 업데이트 안내
([업데이트하기]·[나중에])·로그인 확인 실패가 이 서식이고, 마이크 권한 화면이 본문 슬롯·바닥 버튼을 쓰는 변형이다(KAN-354 4단계,
시안 s-04-mic-permission-gate·-denied: 원 안 마이크 선화 `ic_mic_24`, 본문은 `paper` 면·잉크 1 테두리·종이 그림자 상자 안 둥근 불릿 세 줄
14, 바닥 버튼 [계속 →]·[다시 허용하기]·[설정 열기](톱니 앞 그림), 앱바는 워드마크만).
연결 실패는 offline 선화, 그 밖은 느낌표 선화다.

### 곡선 레인

상자 하나가 레인 하나 또는 둘을 담는다. **테두리와 모서리는 상자가 갖고 레인은 갖지
않는다** — 레인마다 테두리를 두르면 상자 안에 상자가 겹쳐 선이 두 겹으로 보인다.
레인 사이는 1px `muted-foreground` 한 줄이 가른다(상자 테두리보다 얇고 흐리다).
레인 높이는 `curve-lane-height` 120, 라벨은 좌상단 `caption` 13 흐린 잉크.

두 곡선을 색으로는 가를 수 없다(둘 다 잉크). 셋이 함께 가른다.

| | 굵기 | 선 | 아래 |
|---|---|---|---|
| 가이드 | 2 | 점선 `6 5` | 비어 있음 |
| 내 억양 | 3 | 실선 | **망점(halftone) 채움** |

망점은 5×5 격자에 반지름 1인 잉크 점, 진하기 0.5다. 웹은 SVG `<pattern patternUnits=
"userSpaceOnUse">`, 네이티브는 닫은 도형에 `clipPath`를 걸고 같은 격자로 점을 찍는다 —
무늬를 화면 좌표에 고정하는 것이 요점이다. 곡선을 기준으로 찍으면 곡선이 자랄 때 이미 찍힌
점이 함께 움직여 무늬가 살아 있는 것처럼 보인다.

**망점은 화면당 한 곳.** 곡선 레인이 그 한 곳이라 다른 컴포넌트에는 망점이 없다.
종이 오리기에서 망점은 "회색"을 만드는 유일한 수단이라 여러 곳에 쓰면 화면이 지저분해진다.

Android는 KAN-354에서 시안 `.p2-lanes`대로 상자를 `paper` 면·잉크 1 테두리·반경 10으로, 레인을 높이 112, 레인 사이 선을 `primary-dim` 1,
라벨을 본문 12/18 흐린 잉크(위 4·왼쪽 12)로 그린다. 목소리 점검은 「내 억양」 레인 하나에 두 칸 높이(224)를 쓰고, 곡선은 왼쪽부터
실시간으로 자란다(보간 애니메이션 없음 — 움직임 줄이기에서도 같은 그림, 움직임 타일 9).

### 녹음 버튼

지름 `record-button-size` 80, 2px 잉크 테두리, 크림 면, 오프셋 그림자. 다른 버튼이 모두
알약꼴인데 이것만 원형이라 눌러야 할 것이 무엇인지 모양만으로 읽힌다.

iOS는 KAN-355부터 시안 `.p2-record-button` 값이다 (`UI/Components/RecordButton.swift`): 지름 80, `paper` 면, 잉크 1 테두리,
원형 종이 그림자. 시간 반복 파문 대신 녹음 중에만 **소리 원** 하나 — 종이 그림자 색 2 선이 녹음 RMS를 따라 버튼 지름의 최대
1.35배까지 커지고, 값이 바뀔 때 150ms로 따라간다(선 굵기가 같이 커지지 않게 지름을 바꾼다). 동작 줄이기면 원을 그리지 않는다. 아래 문단의 크림 면·2px·파문은 iOS에 해당하지 않는다.

상태는 **안쪽 도형**이 말한다 — 대기는 마이크 선화, 녹음 중은 28dp 잉크 정사각형(반경 6,
정지의 관용 기호)이다. 녹음 중에는 잉크 테두리 파문이 퍼지며 옅어진다. 면이 아니라 선인
이유는 반투명한 면이 크림 위에서 회색 얼룩이 되기 때문이다. 파문은 모션 축소에서 멈추고
(WCAG 2.3.3), 도형과 접근성 라벨은 그대로라 상태 정보는 잃지 않는다.

Android는 KAN-354에서 시안 `.p2-record-button`과 움직임 타일 2대로 그린다 (`RecordButton.kt`). 지름 80, `paper` 면, 잉크 1 테두리,
대기 중에만 종이 그림자(녹음 중에는 없음), 안의 그림은 잉크 — 대기 마이크 선화 34(`ic_mic_24`), 녹음 중 잉크 정사각형 22(반경 2).
시간 반복 파문 대신 **소리 원** 하나를 녹음 중에만 그린다: `primary-dim` 2 선, 버튼 테두리에서 소리 크기에 따라 최대 1.35배,
값이 바뀔 때 `duration-fast` 150ms 보간. 크기는 녹음 rms를 목소리 점검 입력 레벨 바와 같은 로그 눈금으로 0~1에 맞추고 통과선
(`QUIET_RMS_THRESHOLD`) 아래는 0이다(`soundRingLevel`). 움직임 줄이기면 원을 그리지 않는다.

### 히어로 아이콘

지름 `hero-icon-size` 112, 1.5px 잉크 테두리, 크림 면, 오프셋 그림자 (§7).
Android는 KAN-354에서 시안(`.p3-status-symbol`·`.hero-icon`)대로 1dp 잉크 테두리·크림 면·**그림자 없음**, 안의 선화 56dp
(`Dimens.heroIconGlyph`, 잉크)로 그린다(`HeroIcon`). KAN-288의 기울인 벽돌 점선 사각형(76)을 바꿨다.
마이크 권한 화면(KAN-354 4단계)도 같은 원에 마이크 선화(`ic_mic_24`) 56을 넣는다.
안에 들어가는 이모지는 아직 시안 이전 상태다 — 시안의 히어로는 손으로 오린 일러스트인데
이모지는 색을 갖고 있어 화면에서 유일한 색조로 남는다. 일러스트 자산은 화면 이식 몫이다.

결과 화면의 등급별 캐릭터(KAN-162)는 SVG가 아니라 래스터 WebP다 — 정본·생성·파생 규칙은
`character-assets.md`.

### 텍스트 히어로

화면을 여는 자리에 그림 대신 서는 글자 한 줄이다 (`ui/TextHero.tsx`, `.text-hero`). 인트로
(`사투리 좀 치나?`)와 분석 대기 화면(`분석 중입니다`)이 쓴다 — KAN-178에서 두 화면의 종이
일러스트를 걷어낸 자리다. 스토어 캡처 크기로 줄면 오려 낸 선이 뭉개져 무엇을 그린 것인지
읽히지 않았고, 읽히더라도 앱이 무엇을 하는 곳인지는 말하지 않았다.

**면이 없다.** 처음에는 대사 카드(`.prompt-card`)의 테두리·크림 면·오프셋 그림자를 그대로
빌렸는데, 히어로 바로 아래에 같은 두께의 카드가 서니 한 화면에 종이가 두 장 겹쳐 보였다 —
히어로가 카드의 예고편처럼 읽히는 자리다. 테두리·그림자·면을 다 걷고 잉크 글자만 남긴다.
남긴 것은 좌우 여백(`space-6`)뿐이고, 긴 문구가 화면 가장자리에 붙지 않게 하는 몫이다.
글자는 `font-display` `text-display`(40) 400이다: 대기 화면은 바로 아래 제목이 30·26이라
이보다 작으면 히어로가 아니라 제목이 둘인 화면이 된다.

**접근성 트리에서 맡는 역할은 두 화면이 반대다.** 기본값은 `<p aria-hidden>`이고, 전제는
화면 이름을 말하는 제목이 따로 있다는 것이다 — 분석 대기 화면이 그렇다. 그쪽 h1은 진행
상태(`결과를 만들고 있어요` · 폴링 퍼센트)를 실어 나르므로 히어로까지 라벨을 가지면 스크린
리더가 같은 화면을 두 번 소개한다.

인트로는 `heading`을 준다. 히어로 밑에 있던 제목 `사투리 억양 테스트`가 같은 말을 되풀이해
걷어냈고(KAN-178), 그러면 화면 이름을 말하는 것이 히어로뿐이라 `<h1>`으로 서야 한다 —
`aria-hidden`을 그대로 두면 인트로가 접근 가능한 이름과 유일한 h1을 함께 잃는다. 두 갈래를
태그와 `aria-hidden`으로 따로 받지 않고 boolean 하나로 가른 것은 "h1인데 숨겨진 히어로"라는
조합을 못 만들게 하려는 것이다.

바깥 슬롯(`.illustration--waiting` 176)의 높이는 건드리지 않았다. 글자 한 줄이 그림보다 낮아도
아래 제목·카드는 있던 자리에 그대로 남는다. 인트로만 슬롯에서 히어로를 꺼내 부제와 8px로 묶은
`.intro-hero`를 쓴다 — 제목이 빠진 지금 부제는 히어로에 딸린 줄이라 한 덩어리로 읽혀야 하는데,
192px 안에 40px 글자를 가운데 세우면 아래로 ~73px이 깔려 부제가 도리어 카드 쪽에 붙어 보였다.

네이티브 로그인 화면(KAN-224, `auth/LoginScreen.kt`)도 이 인트로 히어로 블록(워드마크 + 두 줄 히어로 + 포인트 컬러 곡선 밑줄 + 부제)을
그대로 옮겨 쓴다 — 앱 첫 화면이 테스트 인트로와 같은 얼굴이어야 해서다. 56·7dp 밑줄은 네이티브 토큰이 없어 정본 값을 화면에 직접 적었다.
iOS(`Auth/LoginScreen.swift`)도 같은 블록이고, 밑줄 색은 `Papercut.point`(`UI/Theme/PapercutTheme.swift`, 안드로이드 `LightPoint`)다.

## 9. 접근성 최소선 검증

| 항목 | 어떻게 보장하나 |
|---|---|
| 터치 타겟 48dp | 버튼 컴포넌트의 최소 높이가 `touch-target-min`이다. 화면이 버튼을 직접 그리지 않으므로 개별 화면에서 빠뜨릴 수 없다 |
| 텍스트 대비 4.5:1 | `tools/check_contrast.py`가 팔레트 조합 전부를 검사한다. 감수(`WAIVED`) 항목은 KAN-161로 전부 사라져 목록이 비어 있다 (§7) |
| 그래픽 대비 3:1 | 같은 스크립트의 그래픽 그룹 — F0 곡선·컨트롤 경계 |
| 대사 24sp 이상 | `tools/check_tokens.py`가 정본 §3의 `headline` 값이 24 미만이면 실패한다 |
| 모션 축소 | 웹 `prefers-reduced-motion`, 네이티브 `isReducedMotionEnabled()`. 축소 상태에서도 최종 상태는 같다 |
| 색에 의존하지 않기 | 팔레트가 잉크 한 색이라 색으로는 아무것도 구분하지 않는다. 선택지는 ✓ 표시, 정오답·오류는 문구와 아이콘, 곡선 둘은 점선/실선으로 갈린다 (WCAG 1.4.1) |

## 10. 범위 밖

- 개별 화면의 픽셀 맞추기 — 시안이 확정된 화면부터 각 화면 티켓에서 이 토큰을 써서 붙인다.
- 시안의 Tailwind·shadcn 의존성 — 앱 레포 `web/`은 순수 CSS 커스텀 프로퍼티만 쓴다. 값만 옮기고 빌드 체인은 옮기지 않는다.

### 네이티브 녹음 화면의 상태별 문구 (KAN-161 4단계)

아트보드 ②·②b가 정본이다. 화면 틀은 위 64 · 좌우 24 · 아래 32이고, 본문(진행 도트 → 대사 카드
→ 곡선 카드)은 스크롤하며 하단(타이머 → 녹음 버튼 → 캡션)은 고정이다. 글꼴을 200%로 키운 기기에서
밀려야 할 쪽은 본문이다 — 이 화면에서 버튼이 안 보이는 것은 곧 녹음을 못 하는 것이다.

카드 위에는 캡션 한 줄만 둔다(`3 / 10 · 이 문장을 읽어주세요`). 배지도, 이모지도, 대사 아래
부연도 없다. 카드는 **읽을 문장**을 내밀고, 어떻게 하라는 말은 버튼 밑 캡션이 한다 — 한 카드가
둘을 함께 내밀면 26sp와 14sp의 차이만으로는 어느 쪽을 소리 내야 하는지가 즉시 갈리지 않는다.

> **Android (KAN-354 4단계, 시안 s-06·s-17):** 앱바는 워드마크와 ✕뿐(톱니 없음, 억양 학습도 같은 앱바 ✕). 본문은 진척도 「억양」
> `n / N` → 대사 카드(칩은 대사 아래, §8 대사 카드) → 곡선 카드(위 28)다. 하단은 본문과 24, 요소 사이 12이고 캡션은 본문 14
> 흐린 잉크, 타이머는 Jua 20(`/ 10초`만 본문 14 흐린 잉크)이다. 완료는 판정 한 줄(본문 16)·길이 한 줄(14 흐린 잉크) 다음 20 아래에
> [재녹음](보조, 되돌리기 그림 `ic_retry_24`)·[다음 →](주)을 14 사이로 나란히 둔다 — 점선 상태 상자는 걷었다. 억양 학습만 길이 줄
> 아래에 글자 버튼 [내 녹음 듣기]가 선다. 상태 전환은 바로 바뀐다(150ms 이하 규칙). 8초 경고 캡슐은 아래 표 그대로다.

| 상태 | 버튼 위 | 버튼 | 버튼 아래 캡션 |
|---|---|---|---|
| 대기 | — | 마이크 선화 | `버튼을 눌러 녹음` |
| 녹음 중 | `00:04 / 10초` (`timer`, `/ 10초`만 `muted-foreground`) | 정지 사각형 | `녹음 중 · 탭해서 멈추기` |
| 8초 경고 (남은 2초 이하) | 잉크 캡슐 `2초 남음` (높이 32 · 가로 패딩 14 · `radius-full` · `timer` 크림 글자) | 정지 사각형 | `10초가 되면 자동으로 멈춰요` |
| 완료 | `녹음 상태가 좋아요` (`body`) + `녹음 길이 2.5초` (`caption`) | — | [재녹음](보조) [다음](주), 같은 폭 |

경고는 **같은 숫자를 다르게 그리는 것이 아니라 다른 것을 말한다.** 위 표기는 "얼마나 읽었나",
캡슐은 "곧 끊긴다"다. 그래서 문장을 맺어야 하는 순간에만 나타나고, 나타났다는 사실 자체가 신호가
된다. 팔레트에 빨강이 없어 위급함을 색으로 말할 수 없는데(§7), 애초에 색보다 문구와 등장이 강하다.

- **경계는 남은 시간 2초 이하다** — 상한의 비율이 아니다. 비율로 두면 상한이 짧은 문항에서 경고가
  시작하자마자 녹음이 끝난다. 사람이 문장을 맺는 데 필요한 시간은 상한과 무관하게 2초쯤이다.
  두 런타임이 같은 값과 같은 부등호를 쓴다: 네이티브 `RecordingCountdown.kt`, 웹 `WebVoiceRecorder.tsx`.
  캡슐의 초는 **올림**이라 남은 시간을 실제보다 짧게 말하지 않는다.
- **캡슐 자리는 미리 비워 둔다** — 타이머 한 줄과 캡슐(32dp)은 높이가 달라, 자리를 안 잡으면 경고가
  뜨는 순간 아래 녹음 버튼이 내려앉는다. 사용자는 그때 버튼을 누르려던 참이다.
- **접근성** — 캡슐은 `liveRegion = Polite`(웹은 `role="status" aria-live="polite"`)다. 끼어드는
  쪽으로 두면 매초 바뀌는 값이 사용자가 지금 소리 내어 읽는 대사를 가로챈다.
- **모션** — 캡슐은 `duration-base`(300ms) ease-out으로 살짝 커지며 나타난다. 자리에 원래 있던 것이
  바뀐 게 아니라 새로 놓였다는 뜻이다. 모션 축소에서는 0ms로 접히고 최종 상태는 같다.
- **웹 녹음 화면(KAN-347 7단계, 시안 s-06-recording-*)** — 위 표는 네이티브 기준이다. 브라우저(`WebVoiceRecorder.tsx`)는
  남은 시간 게이지(채워지는 막대)와 「10초가 되면 자동으로 멈춰요」 안내를 지웠다. 마지막 2초 캡슐(`n초 남음`, 경계·올림·
  `role="status" aria-live="polite"`)은 그대로이고, 그동안 버튼 아래 캡션은 녹음 중 캡션 「녹음 중 · 탭해서 멈추기」를 유지한다.
  상한에 닿으면 자동으로 멈추는 동작(FR-RC-02)은 바뀌지 않았다.

### KAN-199 #3 — 화면 위쪽 여백은 브라우저에서 24다

`--screen-padding-top`이 브라우저 단독 실행에서만 64에서 24(좌우와 같은 값)로 내려간다.
`<html data-runtime="browser">`가 그 분기를 켜고, 표식은 `web/src/ui/runtime.ts`가
렌더 전에 심는다. 판정 근거는 브리지 객체·`?bridge=`의 부재(`bridge.ts`의 `isStandaloneWeb`)라
구버전 앱을 브라우저로 오인하지 않는다. 표식이 없으면 앱 기준 64가 그대로 선다.

**64는 앱 기준값이다.** 앱은 화면 꼭대기부터가 우리 자리라 첫 요소를 그만큼 내려야 그림과
제목이 세로 가운데에 앉는다(§4). 브라우저에서는 그 위를 브라우저 크롬이 이미 차지하고 있고,
뷰포트는 그 크롬만큼 짧다 — 같은 값이 크롬 아래에 한 번 더 얹히는 꼴이다.

실측(2026-09-09, 폭 393px 고정, 문항 화면):

| 런타임 | 뷰포트 | 문서 높이 | |
|---|---|---|---|
| iOS Safari | 659 | 732 | 넘침 73 |
| Android Chrome | 719 | 732 | 넘침 13 |
| iOS 앱 (WKWebView) | 812 | 812 | 들어감 |
| Android 앱 (WebView) | 803 | 803 | 들어감 |

**넘치는 것은 브라우저뿐이다.** 그 화면에서 상단 64는 배치가 아니라 손실이라 24로 내려
40을 돌려준다. 남는 넘침은 스크롤이 받는다 — 조작부가 `position: sticky`로 바닥에 붙어
있어(`.item-screen__footer`) 넘쳐도 [녹음]이 화면 밖으로 나가지 않는다.

같이 확인해 둔 것 — **`env(safe-area-inset-*)`는 이 레포의 웹 어디에도 쓰이지 않는다.**
`index.html`의 viewport에 `viewport-fit=cover`가 없어 iOS Safari에서 값 자체가 0이다.
상단 여백을 만드는 규칙은 이 토큰 하나뿐이므로, "안전 영역 패딩이 이중으로 잡힌다"는
설명은 이 코드베이스에 해당하지 않는다.

인트로 화면의 상단 여백은 이 티켓이 겨눈 문제가 아니다. 저쪽은 넘치지 않고, 화면 꼭대기부터
제목까지의 거리는 **앱이 브라우저보다 크다**(2026-09-09 실측: Android 앱 308 CSS px,
Android Chrome 336, iOS Safari 258 — 크롬 높이를 뺀 페이지 안쪽 여백은 앱 277 / Chrome 249 /
Safari 208). `.screen__body`의 `flex: 1` + 세로 가운데 정렬이 남는 높이를 위아래로 반씩
나눠 주기 때문이고, 뷰포트가 클수록 위쪽 빈자리가 커진다. 배치를 바꿀지는 별도 결정이다.
