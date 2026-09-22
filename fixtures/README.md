# fixtures - 다른 레포에서 온 테스트 고정물 (KAN-221)

레포 분리 전에는 앱, iOS, 웹 테스트가 같은 레포의 backend 마이그레이션을 직접 읽었다. 이제
backend는 Accentury_Server에 있으므로 그 파일의 복사본을 여기 둔다.

| 복사본 | 원본 (Accentury_Server) | 읽는 테스트 |
| --- | --- | --- |
| `definitions/gn-2026.09.4/V1__baseline.sql` | `backend/src/main/resources/db/migration/V1__baseline.sql` | `PublishedGuideF0Test.kt`, `PublishedGuideF0Tests.swift`, `publishedGuideF0.test.ts` |

새 정의를 발행하면(Accentury_Server에 `V<n>__publish_<버전>.sql`이 들어오면) 그 파일을
`definitions/<버전>/`에 복사하고 세 테스트의 경로 상수를 새 버전으로 바꾼다. 발행본은 발행 후
불변이라(KAN-26) 같은 버전의 복사본이 원본과 갈라질 일은 없다. `cmp`로 원본과 바이트 단위로 같은지
확인한 뒤 커밋한다.
