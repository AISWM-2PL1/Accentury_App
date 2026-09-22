# Accentury_App

Accentury(경남 사투리 레벨 테스트)의 프론트 쪽 레포다. 2026-09-22에 모노레포 `Accentury`를 둘로 나눴다 (KAN-221).

| 레포 | 내용 |
| --- | --- |
| Accentury_App (여기) | `app/` Android 앱(루트 Gradle), `ios/` iOS 앱, `web/` 웹(Vite), `assets/` 아이콘, 캐릭터, 공유 이미지 원본 |
| [Accentury_Server](https://github.com/AISWM-2PL1/Accentury_Server) | backend(Spring Boot), ai(FastAPI), infra(Terraform), 배포와 게시 스크립트 |
| [Accentury_Prototype](https://github.com/AISWM-2PL1/Accentury_Prototype) | 분리 전 모노레포. 읽기 전용 아카이브. 커밋 메시지의 `#NNN`은 이 레포의 PR 번호다 |

브랜치 모델은 그대로다: `Dev` 병합이 staging 웹 배포, `Release` 병합이 prod 웹 배포와 앱 릴리스 빌드
(`.github/workflows/web-deploy.yml`, `app-release.yml`).

## 시작

| 무엇 | 어디 |
| --- | --- |
| Android | 루트에서 `./gradlew :app:testDebugUnitTest`. 서명과 릴리스는 [`docs/wiki/android-release-signing.md`](docs/wiki/android-release-signing.md) |
| iOS | [`ios/README.md`](ios/README.md) |
| 웹 | [`web/README.md`](web/README.md) |
| 로컬 풀스택 (DB + 가짜 AI + BE) | Accentury_Server를 옆에 받아 그 루트에서 `docker compose up -d --build`. 앱과 웹은 그 스택을 겨눈다 (`web/README.md` "스택 띄우기") |

## 다른 레포와 맞물린 파일 (사람이 지키는 규칙)

레포를 나누면서 서로 읽던 파일은 복사본으로 풀었다. 원본을 바꾸면 복사본도 같이 고친다.

| 원본 | 복사본 | 언제 갱신하나 |
| --- | --- | --- |
| Accentury_Server `backend/src/main/resources/db/migration/V1__baseline.sql` (정의 발행본) | `fixtures/definitions/<버전>/V1__baseline.sql` | 새 정의를 발행할 때 ([`fixtures/README.md`](fixtures/README.md)) |
| `app/src/main/AndroidManifest.xml`의 `android:path` | Accentury_Server `infra/modules/edge/app-link-paths.json` | App Link 진입 경로를 바꿀 때 |
| `assets/share/<tier>.png` | Accentury_Server `infra/share-assets/<tier>.png` | 등급 캐릭터 이미지를 다시 만들 때 ([`assets/share/README.md`](assets/share/README.md)) |

문서: [`docs/wiki`](docs/wiki)에 앱, iOS, 웹, 자산, 광고, 계측 주제가 있다. 관측성, 개인정보처리방침 근거, 이용 후기는 Accentury_Server에 있다.
