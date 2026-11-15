# 출신 지역 지도 SVG (KAN-347 7단계, KAN-354·KAN-355 3단계)

출신 지역 화면(웹 `RegionSelectScreen`, Android `auth/RegionSelectScreen.kt`, iOS 3단계)이 그리는 우리나라 지도의 정본과 사본, 출처를 적는다.

## 정본과 사본

| 자리 | 파일 | 같은지 보는 테스트 |
|---|---|---|
| 정본 | `docs/assets/region-map.svg` | — |
| 웹 사본 | `web/src/region/region-map.svg` (`?raw`로 읽어 `regionMap.ts`가 path를 푼다) | `web/src/region/regionMap.test.ts` 「웹 사본은 정본 docs/assets/region-map.svg와 바이트가 같다」 |
| Android 사본 | `app/src/main/assets/region-map.svg` | `RegionMapTest` 「앱 사본은 정본 docs assets region-map svg와 바이트가 같다」 |

- 정본 blob `7b96b73f152ec462098346be1627593e696aecb7`. KAN-354가 먼저 필요해 그 브랜치가 먼저 넣었고(커밋 57a7973), 웹은 같은 바이트를 가져왔다. 두 PR이 같은 내용의 같은 파일을 더하므로 머지 순서와 무관하게 충돌이 없다.
- 웹이 정본을 직접 import하지 않는 이유: Vite 개발 서버의 파일 접근 범위(`server.fs`)가 `web/` 밖을 막는다. 그래서 사본을 두고 테스트로 묶는다.
- 정본을 고치면 사본 둘을 같이 바꾼다. 하나라도 빠지면 위 테스트가 실패한다.

## 내용

- `viewBox="0 -8 300 335"`. 화면은 이 상자를 지도 칸(시안 342 × 420)에 늘려 채운다(시안 `preserveAspectRatio="none"`).
- path 25개: 지역 면 18개 + 광역시·세종 경계선 7개. 각 path에 `data-region`(서버 `Region` 코드 열 개), `data-name`(행정구역 이름), 광역시·세종은 `data-metro="1"`이 붙는다.
- 광역시·세종 path는 두 번 실린다(면 한 번, 그 위에 긋는 경계선 한 번 — 시안 `.metro-lines`). 같은 `d`라 그릴 때 겹침을 걷는다.
- 묶음: 경기 = 경기도 + 인천, 충남 = 충청남도 + 세종 + 대전, 전남 = 전라남도 + 광주, 경북 = 경상북도 + 대구 + 독도, 경남 = 경상남도 + 울산 + 부산. 화면의 광역시 포함 표기(「경남 · 부산·울산 포함」)는 세종을 적지 않는다(시안). 문구 정본은 웹 `region/regions.ts`의 `metro`다.
- 울릉도·독도는 실제 위치보다 본토 가까이 확대 배치돼 있다(시안 그대로).

## 출처와 변환

- 경계: 통계청 SGIS 2013 행정구역 경계. GitHub `southkorea/southkorea-maps`의 `kostat/2013` 데이터를 썼다.
- 가공: 시·도 경계를 10개 지역으로 묶고, 점을 줄여 단순화한 뒤 viewBox 0 -8 300 335 좌표로 옮겼다. 울릉도·독도는 따로 떼어 확대 배치했다.
- 가공 스크립트: 시안 작업 폴더 `v32-flow/`의 `krmap.mjs`(경계 읽기·지역 묶기), `simplify.mjs`(단순화), `rebuild.mjs`(좌표 변환·SVG 재구성), `isles.mjs`(울릉도·독도 배치). 괄호 안 역할은 파일 이름에서 짐작한 것이다.
- **스크립트 원본은 이 레포에 없다.** 2026-11-16 기준 이 기계의 시안 보관본(`~/Downloads/accentury-design-v34`)에도 없어 찾지 못했다. 경계를 다시 만들어야 하면 시안 작업 폴더에서 스크립트를 찾아 이 문서에 위치를 적는다. 정본 SVG를 직접 고치는 것은 바이트 일치 테스트가 막지 않으므로, 고칠 때는 사본 둘을 함께 바꾼다.
- 화면 표기: 지도 아래 「행정구역 경계: 통계청 SGIS(2013)」(사투리 여행 지도와 같은 출처).

## 웹 화면 규칙 (KAN-347 7단계)

- 칩 10개는 같은 `name`의 네이티브 라디오다. 단일 선택·방향키 이동·「고른 칩만 Tab 순서」를 브라우저가 준다. 그룹 이름은 제목(`aria-labelledby`), 칩 이름은 「경남, 부산·울산 포함」.
- 고르면 그 지역 면이 벽돌(`--color-point`)로 칠해지고 칩이 반전된다(150ms 색 전환). 지도 면을 눌러도 고른다.
- 큰 글자(`html[data-large-text]`)에서는 지도를 걷고 같은 칩을 2열 목록으로 편다. 칩 글자가 rem이라 표식이 서면 좁은 자리(충북·충남)부터 겹치므로, 칩을 재지 않고 표식 하나를 겹침 판정으로 쓴다. 확인은 E2E `smoke.spec.ts`의 출신 지역 지도 케이스.
