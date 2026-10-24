# 안드로이드 R8 축소·난독화 (KAN-292)

2026-10-24 Play Console 「다음 출시 버전을 위한 발견 항목」이 세 건을 냈다. 그중 둘을 이 티켓 1단계에서
고쳤다. 릴리스 빌드에 R8을 켜고, 네이버 로그인 SDK가 넣는 화면 방향 고정을 매니페스트 병합에서 뺐다.

## 1. Play Console 발견 항목

| 항목 | 원인 | 조치 |
|---|---|---|
| DEX 난독화 1% (기한 2027-02) | release가 `optimization { enable = false }`라 R8이 돌지 않았다 | `enable = true` + `src/main/keepRules/app.keep` |
| fragment 1.1.0 구버전 | 콘솔 표시와 달리 현재 해석 버전은 1.5.7이다 | 코드 변경 없음 |
| Android 15 큰 화면 deprecated | 네이버 로그인 SDK 5.12.0 매니페스트가 `NidOAuthCustomTabActivity`에 `android:screenOrientation="behind"`를 넣는다 | 앱 매니페스트에서 `tools:remove="android:screenOrientation"` |

방향 고정 제거는 [매니페스트 병합 문서의 attribute marker](https://developer.android.com/build/manage-manifests#attribute_markers)를
따른다. 병합 보고서(`app/build/outputs/logs/manifest-merger-release-report.txt`)에 SDK 값이 `REJECTED`로 남는다.
앱 매니페스트의 해당 주석에는 속성 이름을 일부러 쓰지 않았다. 주석도 병합 결과에 실려서, 아래 grep 검증이
주석에 걸리기 때문이다.

## 2. R8 설정 (AGP 9.3 새 DSL)

```kotlin
release {
    optimization {
        enable = true
    }
}
```

AGP 9.3부터 `optimization` 블록 하나가 코드 축소·난독화·최적화와 리소스 축소를 함께 켠다. 구 DSL의
`isMinifyEnabled`·`isShrinkResources`·`proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), ...)`
세 줄에 해당한다. 기본 Android 규칙(구 `proguard-android-optimize.txt` 상당)도 자동으로 붙는다.

**keep 규칙 위치가 바뀌었다.** 새 DSL은 `src/<variant>/keepRules/` 아래 `.keep` 파일만 읽는다.
`app/proguard-rules.pro`를 만들어도 걸리지 않는다. 그래서 규칙은 `app/src/main/keepRules/app.keep`에 있다.

- https://developer.android.com/topic/performance/app-optimization/enable-app-optimization
- https://developer.android.com/build/releases/agp-9-3-0-release-notes

## 3. keep 규칙 근거

규칙은 최소로 둔다. `com.accentury.**` 전체 keep 같은 광범위 규칙은 쓰지 않는다.

| 대상 | 규칙 | 근거 |
|---|---|---|
| 크래시 스택 | `-keepattributes SourceFile,LineNumberTable`, `-renamesourcefileattribute SourceFile` | 줄 번호를 남겨야 매핑으로 스택을 되돌린다 |
| 카카오 SDK 2.24.0 | 공식 문서 규칙 그대로 (모델 필드 keep, okhttp·retrofit 경고·keep) | v2-share·common·auth·network AAR에 규칙이 없다(v2-user만 두 줄). [카카오 시작하기 › ProGuard](https://developers.kakao.com/docs/latest/ko/android/getting-started#project-pro-guard) |
| kotlinx-serialization 1.9.0 | 없음 | JAR이 `META-INF/com.android.tools/r8/` 규칙을 동봉한다. 이름 붙은 companion을 가진 `@Serializable` 클래스가 없어 [README Android 절](https://github.com/Kotlin/kotlinx.serialization/blob/master/README.md#android)의 추가 규칙도 필요 없다 |
| WebView JS 브리지 | 없음 | 기본 규칙에 `-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }`가 있다(`mapping/release/configuration.txt`에서 확인) |
| 네이버 oauth 5.12.0, OkHttp, Credential Manager 1.6.0, googleid 1.2.1 | 없음 | 각 AAR이 `proguard.txt`를 동봉한다 |
| Room (WorkManager 내부 DB) | `-keep class * extends androidx.room.RoomDatabase { <init>(); }` | play-services-ads-api 25.4.0 → work-runtime 2.7.0 → room-runtime 2.2.5로 옛 Room이 들어온다. 2.2.5 동봉 규칙은 클래스만 keep해 R8 full mode가 `WorkDatabase_Impl.<init>()`을 지웠다(`mapping/release/usage.txt`에 기록). Room이 리플렉션으로 생성자를 부르다 실패해 릴리스 APK가 시작 직후 크래시했다(2026-10-24 에뮬레이터 스모크) |

규칙 동봉 여부는 Gradle 캐시의 아티팩트를 열어 확인했다(2026-10-24). SDK 버전을 올리면 다시 본다.

```bash
unzip -l ~/.gradle/caches/modules-2/files-2.1/<group>/<artifact>/<ver>/*/<artifact>-<ver>.aar | grep proguard.txt
```

## 4. 검증 지표 (2026-10-24, 1단계)

| 항목 | 값 |
|---|---|
| R8 이름 변경 클래스 비율 (mapping.txt 전체) | 96.4% (12,069개 중 437개만 원래 이름) |
| `com.accentury` 클래스 | 432개 중 2개만 원래 이름 (`AccenturyApplication`, `MainActivity` — 매니페스트 진입점) |
| JS 브리지 메서드 | 19개 모두 DEX에 원래 이름으로 남음 |
| 릴리스 merged manifest의 `screenOrientation` | 0건 |

확인 명령:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew :app:bundleRelease :app:assembleRelease
ls -la app/build/outputs/mapping/release/mapping.txt
grep -c screenOrientation app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml  # 0
```

## 5. 매핑 파일과 크래시 역난독화

| 위치 | 내용 |
|---|---|
| 로컬 | `app/build/outputs/mapping/release/mapping.txt` |
| CI | 아티팩트 `accentury-app-release-<sha7>-mapping` (90일). 없으면 워크플로가 실패한다 |
| AAB 안 | `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map` — Play Console이 업로드된 AAB에서 읽어 ANR·비정상 종료 스택을 자동으로 되돌린다 |

매핑은 **그 빌드의 것**만 맞는다. 같은 커밋을 다시 빌드한 매핑으로 스택을 되돌릴 수 있다는 보장이 없다.

손으로 되돌리는 법. 이 맥에는 SDK cmdline-tools의 `retrace`가 없어서, AGP가 Gradle 캐시에 받아 둔
builder JAR 안의 R8 Retrace를 직접 부른다(2026-10-24 동작 확인):

```bash
JAVA="/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java"
J=$(ls ~/.gradle/caches/modules-2/files-2.1/com.android.tools.build/builder/9.3.1/*/builder-9.3.1.jar)
"$JAVA" -cp "$J" com.android.tools.r8.retrace.Retrace \
  app/build/outputs/mapping/release/mapping.txt stacktrace.txt
```

**Crashlytics는 아직 자동 업로드가 안 된다.** Crashlytics Gradle 플러그인 3.0.8은 새 `optimization` DSL을
축소 켜짐으로 인식하지 못해 `uploadCrashlyticsMappingFileRelease` 태스크를 등록하지 않는다(2026-10-24 확인).
Crashlytics 콘솔 스택은 지금 난독화된 채로 보인다. 해결은 KAN-292 후속에서 정한다.
