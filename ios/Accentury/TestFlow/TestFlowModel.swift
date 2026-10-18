import AccenturyCore
import Combine
import Foundation

/// 인트로(웹) → 시작 게이트(마이크 권한 → 목소리 점검 → 세션 생성) → 테스트 진입(웹) →
/// VOICE 문항마다 녹음 오버레이 (KAN-100, KAN-34)의 **상태 보유자**.
///
/// 안드로이드 `MainActivity.TestFlow` 컴포저블이 `rememberSaveable` 네 칸과 두 컨트롤러로
/// 들고 있던 것을 여기로 옮겼다. 판정은 전부 Core의 순수 컨트롤러
/// (``AccenturyCore/TestFlowController``·``AccenturyCore/SessionGateController``)가 하고,
/// 이 클래스는 그 값을 SwiftUI가 볼 수 있는 `@Published`로 옮기고 디스크에 적는다 —
/// `PermissionGateModel`이 `MicPermissionController`에 하는 일과 같은 구조다.
///
/// ## 저장이 여기 있는 이유
///
/// Compose의 `rememberSaveable`은 OS가 들고 있는 봉투(Bundle)에 값을 넣어 프로세스 사망까지
/// 넘겨준다. iOS에는 그 자리가 없어서 직접 `UserDefaults`에 적는다. 무엇을 적는지는
/// 두 컨트롤러의 `saved()`가 정하고(각각 JSON 한 줄), 이 클래스는 그 문자열을 나르기만 한다.
///
/// ## 새 실행은 저장을 버린다 (KAN-252 4단계 보완)
///
/// 봉투는 **시스템이 죽인 프로세스를 되살릴 때만** 돌아온다 — 사용자가 앱을 새로 실행하면 비어 있어 홈부터다(지라 AC 「로그인
/// 뒤 첫 화면이 홈」). `UserDefaults`는 그 구분 없이 남아, 테스트를 마치거나 도중에 앱을 끈 뒤 다시 열면 지난 테스트·결과가
/// 열렸다. 그래서 "이번 실행이 복원인가"를 ``init(restoresSavedState:defaults:sessionClient:isMicGranted:onProfileIncomplete:anonymousConsent:tabBarEntry:)``가
/// 받아, 아니면 저장분을 먼저 지운다. 그 표시는 화면이 SwiftUI `@SceneStorage`로 든다(``TestFlowView/sceneRestorationKey``).
/// 값 자체를 장면 저장소로 옮기지 않은 이유는 세션 토큰이다 — 애플은 장면 저장소에 민감한 값을 두지 말라고 한다.
/// https://developer.apple.com/documentation/swiftui/restoring-your-app-s-state-with-swiftui
/*
 * 업로드가 뒷받침하지 않는 붙들기를 걷는 상한 (KAN-146). 안드로이드
 * `MainActivity.ORPHANED_SUBMIT_TIMEOUT_MS`(2_000L)와 같은 값이고, iOS 타이머 API가 초 단위
 * `TimeInterval`을 받으므로 단위만 바꿔 담는다 (Core `loadTimeout`이 8초로 담긴 것과 같은 방식).
 *
 * 업로드가 진행 중인 동안에는 시간으로 걷지 않는다. 진행 중이 아닌데도 화면이 붙들려 있다면
 * 그건 곧 끝나야 할 짧은 창이거나(주입 완료 통지를 기다리는 몇 십 ms) 영영 끝나지 않을
 * 상태(프로세스 사망 복원으로 업로드가 메모리와 함께 사라진 경우)다. 앞엣것은 이 상한이 오기
 * 전에 스스로 풀리고, 뒤엣것은 이 상한만이 풀 수 있다.
 */
let orphanedSubmitTimeout: TimeInterval = 2

@MainActor
final class TestFlowModel: ObservableObject {

    // MARK: 저장 키

    /// ``AccenturyCore/TestFlowController/saved()``의 자리. 안드로이드 `TestFlowController.saver()`.
    static let flowStorageKey = "test_flow_state"
    /// ``AccenturyCore/SessionGateController/saved()``의 자리. 안드로이드 `SessionGateController.saver()`.
    static let gateStorageKey = "session_gate_state"
    /// 안드로이드 `var startRequested by rememberSaveable`.
    static let startRequestedKey = "test_flow_start_requested"
    /// 안드로이드 `var micPassed by rememberSaveable`.
    static let micPassedKey = "test_flow_mic_passed"
    /// 안드로이드 `var voiceCenterHz by rememberSaveable`. 없으면 아직 점검 전이다.
    static let voiceCenterKey = "test_flow_voice_center_hz"
    /// Universal Link가 실어 온 유입 계측 코드 (KAN-32). 안드로이드에는 대응 키가 없다 —
    /// 아래 ``campaignToken`` 주석 참고.
    static let campaignTokenKey = "test_flow_campaign_token"
    /// 안드로이드 `var introRequested by rememberSaveable` (KAN-252).
    static let introRequestedKey = "test_flow_intro_requested"
    /// 앱 링크로 들어왔는가 (KAN-252, PR #33 리뷰 P1). 아래 ``appLinkEntered`` 주석 참고.
    static let appLinkEnteredKey = "test_flow_app_link_entered"

    // MARK: 시작 게이트의 네 칸 (KAN-34, KAN-105)

    /// 웹의 [시작하기]를 눌렀는가. 세션만으로 진입을 정하지 않는 이유는 재응시다 (KAN-34 2단계) —
    /// 재응시는 새 세션을 **손에 든 채** 인트로로 돌아가는 흐름이라, 세션의 존재만으로 진입 URL을
    /// 만들면 인트로가 뜰 새도 없이 테스트가 다시 열린다.
    @Published var startRequested: Bool { didSet { defaults.set(startRequested, forKey: Self.startRequestedKey) } }

    /// 시작 게이트의 마이크 칸을 지났는가. 세션을 기다리는 동안 권한 화면으로 되돌아가지 않게 하는 표시다.
    @Published var micPassed: Bool { didSet { defaults.set(micPassed, forKey: Self.micPassedKey) } }

    /// 목소리 점검(KAN-105)이 잰 중심 음높이. 통과의 결과물이 곧 통과 표시다 —
    /// 통과 여부를 따로 들면 "지났는데 중심이 없다"가 표현 가능해진다.
    @Published var voiceCenterHz: Double? {
        didSet {
            if let voiceCenterHz {
                defaults.set(voiceCenterHz, forKey: Self.voiceCenterKey)
            } else {
                defaults.removeObject(forKey: Self.voiceCenterKey)
            }
        }
    }

    /// Universal Link가 실어 온 공유 유입 계측 코드 (KAN-32 3단계). 두 곳으로 간다 —
    /// 웹 진입 URL의 `&c=`(``webUrl``)와 `POST /v0/sessions`의 `campaignToken`이다. 앱이 세션을
    /// 직접 만드는 구조라(KAN-34) URL만으로는 서버 세션에 유입 경로가 남지 않아 둘 다 필요하다.
    ///
    /// **안드로이드와 갈리는 유일한 자리다.** 그쪽은 진입시킨 VIEW Intent를 OS가 들고 있다가
    /// 프로세스 사망 복원 때 `onCreate`로 다시 배달하므로 저장이 필요 없다. iOS는 앱을 띄운
    /// `NSUserActivity`를 다시 주지 않는다 — 그런데 세션도 흐름도 `UserDefaults`에서 복원되므로
    /// (``flowStorageKey``·``gateStorageKey``), 코드만 사라지면 복원된 진입 URL과 재응시 세션이
    /// 링크로 들어온 사람의 것인데도 유입 없는 것으로 남는다. 그래서 여기만 직접 적는다.
    @Published private(set) var campaignToken: String? {
        didSet {
            if let campaignToken {
                defaults.set(campaignToken, forKey: Self.campaignTokenKey)
            } else {
                defaults.removeObject(forKey: Self.campaignTokenKey)
            }
        }
    }

    /*
     * 첫 문서를 홈이 아니라 인트로로 열어야 하는가 (KAN-252). 홈 시작은 ``tabBarEntry`` 빌드의 **앱을 연 첫 문서**에만 해당한다.
     * 재응시는 "새 세션을 든 채 인트로로 돌아가는" 흐름이라(``startRetest()``) 거기서 세운다 — 세우지 않으면 재응시가 홈으로
     * 떨어진다. 앱 링크 진입(``appLinkEntered``)도 예전처럼 인트로로 가야 해서 진입 URL 쪽에서 함께 본다. 진입 URL 문자열이 곧
     * 로드라(``WebViewHost``) 이 값이 바뀌는 순간이 곧 리로드다. ``startRequested``와 같이 `UserDefaults`에 적어 시스템 종료 뒤
     * 장면 복원을 넘긴다 — 사라지면 재응시 직후 복원에서 인트로 대신 홈이 뜬다. 새 실행에서는 다른 저장분과 함께 지워진다(타입 주석).
     */
    @Published private(set) var introRequested: Bool {
        didSet { defaults.set(introRequested, forKey: Self.introRequestedKey) }
    }

    /// 이번 실행이 앱 링크로 들어왔는가 (KAN-252, PR #33 리뷰 P1). 안드로이드는 `appLink` StateFlow가 null이 아닌 것으로 같은 판정을
    /// 한다. ``campaignToken``과 따로 드는 이유는 코드 없는 링크(`/t`)·무효 코드 링크다 — 파서는 링크로 인정하고 코드만 nil로 주므로,
    /// 코드로 판정하면 그 링크가 홈으로 열린다. ``campaignToken``과 같은 이유로 `UserDefaults`에 적고, 새 실행에서는 함께 지워진다
    /// (``clearSavedState(in:)``) — 링크는 그 뒤 씬이 붙으면서 ``applyAppLink(_:)``로 오므로 지우기가 새 링크를 먹지 않는다.
    @Published private(set) var appLinkEntered: Bool {
        didSet { defaults.set(appLinkEntered, forKey: Self.appLinkEnteredKey) }
    }

    // MARK: 컨트롤러가 정하는 값

    @Published private(set) var phase: TestFlowPhase
    @Published private(set) var gateState: SessionGateState

    /// 세션 생성 재실행 키 (``AccenturyCore/SessionGateController/attempt``).
    /// [다시 시도]는 상태를 `.creating`으로 되돌리기만 해서 값이 그대로일 수 있는데,
    /// 그러면 이미 한 번 돈 이펙트가 다시 돌 이유가 없어 화면이 준비 중인 채로 멈춘다.
    @Published private(set) var gateAttempt: Int

    /// 업로드 한 건씩의 상태. ``UploadModel``이 매니저의 상태 스트림에서 받아 ``setUploads(_:)``로
    /// 흘려 넣는다 — 이 자리가 "결과가 언제 웹으로 나가는가"의 유일한 통로다.
    ///
    /// 업로드 계층을 이 클래스가 직접 알지 않는 이유는 Core `TestFlowController`가 그러지 않는
    /// 이유와 같다: 알면 단위 테스트가 불가능해진다. 여기는 값만 받는다.
    @Published private(set) var uploads: [String: UploadState] = [:]

    /// 공유 시트를 띄울 카드. 화면이 소비하면 nil로 되돌린다 (``consumeShare()``).
    @Published private(set) var pendingShare: SharePayload?

    // MARK: 파생값

    var session: Session? { sessionGate.session }

    /// 브리지 `getSessionToken`이 웹에 건넬 값 (KAN-13). 세션이 없으면 빈 문자열이다 —
    /// 웹 래퍼가 빈 값을 null로 정규화한다.
    var bridgeToken: String { session?.sessionToken ?? "" }

    /// WebView가 로드할 URL. 세션이 곧 진입 URL이다 (KAN-34).
    var webUrl: String {
        buildWebUrl(
            base: AppConfig.webURL,
            appVersionName: AppConfig.appVersionName,
            testEntry: startRequested
                ? session.map { TestEntry(testVersion: $0.testVersion, voiceSet: $0.voiceSet, sessionId: $0.sessionId) }
                : nil,
            bridgeVersion: Self.urlBridgeVersion,
            /*
             * 링크가 실어 온 계측 코드 (KAN-32). 응시 도중에 새 링크가 들어오면 이 URL 문자열이
             * 바뀌어 WebViewHost가 다시 로드한다 — 웹이 sessionId 스냅샷에서 진행을 복원하고,
             * 응시 중에 자기 링크를 다시 누르는 일 자체가 드물어 그 리로드를 감수한다
             * (KAN-32 결정, 안드로이드와 같은 판단).
             */
            campaignToken: campaignToken,
            // 홈 시작 (KAN-252). testEntry가 서면 무시되므로 테스트 진입 URL은 그대로다. 앱 링크로 들어왔으면 코드가 없거나
            // 무효여도 예전처럼 인트로다 — 판정은 Core ``AccenturyCore/startsAtHome(tabBarEntry:introRequested:appLinkEntered:)``.
            home: startsAtHome(tabBarEntry: tabBarEntry, introRequested: introRequested, appLinkEntered: appLinkEntered)
        )
    }

    /// URL에 실어 보낼 브리지 버전. 릴리스에서는 상수 하나이고, 디버그에서만
    /// `-BridgeVersionOverride <n>`이 끼어든다 (KAN-108 §8 스큐 검증).
    ///
    /// 웹의 «앱 업데이트가 필요해요» 화면은 앱이 **자기보다 낮은** 버전을 실어 보낼 때만 뜬다
    /// (`web/src/bridge/bridge.ts`의 `isBridgeCompatible`). 그 화면을 한 번도 확인하지 않으면
    /// 계약 버전을 올리는 날 구버전 앱이 어떤 화면을 만나는지 아무도 본 적이 없게 된다.
    private static var urlBridgeVersion: Int {
        #if DEBUG
        // `object(forKey:)`로 먼저 묻는 이유: `integer(forKey:)`는 키가 없을 때도 0을 돌려줘
        // "0을 지정했다"와 "지정하지 않았다"가 구분되지 않는다. 0이야말로 이 스모크가 쓰는 값이다.
        if UserDefaults.standard.object(forKey: "BridgeVersionOverride") != nil {
            return UserDefaults.standard.integer(forKey: "BridgeVersionOverride")
        }
        #endif
        return bridgeContractVersion
    }

    /// allowlist (§7). 우리가 여는 주소의 origin 하나뿐이다.
    var allowedOrigins: Set<String> { Set([webOrigin(AppConfig.webURL)].compactMap { $0 }) }

    // MARK: 내부

    private let flow: TestFlowController
    private let sessionGate: SessionGateController
    private let defaults: UserDefaults
    private let sessionClient: SessionClient?
    private let isMicGranted: () -> Bool
    private let onProfileIncomplete: @MainActor () -> Void

    /// 웹 하단 탭 바로 들어가는 빌드인가 (KAN-252, 로그인 빌드). 켜면 첫 문서가 홈(`screen=home`)이다. 끄면(익명 빌드)
    /// 예전 그대로 인트로로 시작한다 — 학습이 로그인 필수라 그 빌드엔 탭 바가 보이지 않는다.
    let tabBarEntry: Bool

    /// 익명 모드의 로컬 동의·지역 (KAN-270 6·7단계). nil이면 계정 모드 — 동의·지역 단계가 없고 body에 버전·지역을 싣지 않는다.
    let anonymousConsent: AnonymousVoiceConsentStore?
    /// 저장소가 바뀌면 이 모델도 바뀐 것으로 알린다 — 시작 게이트의 동의 단계가 ``TestFlowView``에서 이 모델만 보고 걷힌다.
    private var anonymousConsentChange: AnyCancellable?

    /// - Parameters:
    ///   - sessionClient: `POST /v0/sessions` 클라이언트. 기본값이 실제 `URLSession` 구현이고,
    ///     Debug 빌드에서 `-StubSession 1`을 주면 서버 없이 고정 세션을 주는 스텁으로 바뀐다
    ///     (``TestFlowModel/defaultSessionClient()``).
    ///   - isMicGranted: 지금의 실제 마이크 권한. 문항 진입마다 다시 묻는다 — 시작 게이트에서
    ///     한 번 허용받았어도 설정에서 회수될 수 있다.
    ///   - onProfileIncomplete: 세션 생성이 403 `AUTH_PROFILE_INCOMPLETE`로 막혔다 — 추가 정보 화면으로 (KAN-224).
    ///     기본값이 로그인 관문(``AuthHub/gate``)이다.
    ///   - anonymousConsent: 익명 모드의 로컬 동의·지역 (KAN-270 6·7단계). 주면 시작 게이트가 권한 → 동의(설치당 1회) →
    ///     지역(아직 없을 때, 동의와 무관, 설치당 1회) → 점검 → 세션이 되고, 세션 생성 body에 동의 버전·지역을 싣는다.
    ///     nil이 계정 모드다.
    ///   - tabBarEntry: 홈으로 시작하는 로그인 빌드인가 (KAN-252, ``tabBarEntry``).
    ///   - restoresSavedState: 이번 실행이 시스템 종료 뒤 장면 복원인가 (KAN-252 4단계 보완). false면 저장분을 지우고 새로 시작한다 —
    ///     안드로이드에서 새 실행의 `rememberSaveable`이 비어 있는 것과 같은 결과다. 기본값 true는 단위 테스트가 쓰는 예전 의미다.
    init(
        restoresSavedState: Bool = true,
        defaults: UserDefaults = .standard,
        sessionClient: SessionClient? = TestFlowModel.defaultSessionClient(),
        isMicGranted: @escaping () -> Bool = { MicPermission.currentStatus().granted },
        onProfileIncomplete: @escaping @MainActor () -> Void = { AuthHub.gate.onProfileIncomplete() },
        anonymousConsent: AnonymousVoiceConsentStore? = nil,
        tabBarEntry: Bool = false
    ) {
        self.defaults = defaults
        self.tabBarEntry = tabBarEntry
        self.sessionClient = sessionClient
        self.isMicGranted = isMicGranted
        self.onProfileIncomplete = onProfileIncomplete
        self.anonymousConsent = anonymousConsent

        /*
         * 새 실행이면 지난 실행의 흐름·세션·진입 상태를 읽기 전에 버린다 (KAN-252 4단계 보완). 이 갈래가 곧 마이그레이션이다 —
         * 업데이트 전 빌드가 남긴 키도 업데이트 뒤 첫 실행(장면 복원 표시가 없다)에서 함께 지워진다.
         */
        if !restoresSavedState { Self.clearSavedState(in: defaults) }

        let flow = TestFlowController.restored(from: defaults.string(forKey: Self.flowStorageKey) ?? "")
            ?? TestFlowController()
        let gate = SessionGateController.restored(from: defaults.string(forKey: Self.gateStorageKey) ?? "")
        self.flow = flow
        self.sessionGate = gate
        self.phase = flow.phase
        self.gateState = gate.state
        self.gateAttempt = gate.attempt

        self.startRequested = defaults.bool(forKey: Self.startRequestedKey)
        self.micPassed = defaults.bool(forKey: Self.micPassedKey)
        self.voiceCenterHz = defaults.object(forKey: Self.voiceCenterKey) as? Double
        self.campaignToken = defaults.string(forKey: Self.campaignTokenKey)
        self.introRequested = defaults.bool(forKey: Self.introRequestedKey)
        self.appLinkEntered = defaults.bool(forKey: Self.appLinkEnteredKey)

        /*
         * 대응 업로드가 없는 대기 시도를 한 번 걷어낸다 (안드로이드의 첫 LaunchedEffect).
         *
         * 여기서 넘기는 키가 **늘 비어 있는 것이 규칙 그 자체다**. 업로드는 메모리에만 산다
         * (PCM을 디스크에 남기지 않는 것이 FR-DP-02) — 이 모델이 만들어지는 순간은 프로세스가
         * 막 뜬 뒤라 살아 있는 업로드가 있을 수 없고, 그러면 저장에서 복원된 대기 시도는 전부
         * 영영 조립되지 않을 가짜 대기다. 안드로이드가 `uploadViewModel?.uploads?.value?.keys`를
         * 넘기는 자리인데, 그쪽도 프로세스 사망 복원에서는 같은 빈 집합이다(회전에서만 값이
         * 있고, iOS에는 회전으로 인한 재생성이 없다 — 세로 고정이고 모델은 `@StateObject`다).
         */
        flow.pruneAttemptsWithoutUpload([])
        syncFlow()

        anonymousConsentChange = anonymousConsent?.objectWillChange.sink { [weak self] _ in
            self?.objectWillChange.send()
        }
    }

    // MARK: App Link

    /// 앱을 연(또는 앱이 살아 있는 동안 눌린) URL이 우리 공유 링크일 때만 ``campaignToken``을
    /// 갈아 끼운다 (KAN-32 3단계). 안드로이드 `MainActivity.applyAppLink` 자리다.
    ///
    /// **링크가 아니면 지우지 않는다.** 안드로이드가 런처 아이콘 탭의 MAIN Intent에 값을
    /// 비우지 않는 것과 같은 이유다 — 링크로 들어와 응시하다 홈으로 나갔다 오거나, 결과 화면의
    /// `https://accentury.app/privacy` 같은 다른 링크를 누르고 돌아오는 흐름에서 유입 계측이
    /// 사라지면 안 된다.
    ///
    /// origin 목록에 이 빌드의 웹 origin을 더하는 쪽(``AccenturyCore/appLinkOrigins(webUrl:)``)이
    /// 디버그 실행 인자 `-AppLinkURL`이 쓰는 통로다.
    func applyAppLink(_ url: URL?) {
        guard let entry = parseAppLink(url?.absoluteString, allowedOrigins: appLinkOrigins(webUrl: AppConfig.webURL)) else {
            return
        }
        campaignToken = entry.campaignToken
        appLinkEntered = true
        #if DEBUG
        smokeLog("APPLINK: campaignToken=\(entry.campaignToken ?? "(none)")")
        #endif
    }

    // MARK: 브리지 콜백

    /// 웹의 [시작하기] → 시작 게이트를 연다.
    func onRequestMicPermission() {
        startRequested = true
        #if DEBUG
        smokeLog("FLOW: startRequested=true")
        #endif
    }

    /// 웹이 VOICE 문항에 진입했다 (KAN-100).
    func onStartVoiceItem(_ start: VoiceItemStart) {
        // 시작 게이트를 통과했어도 설정에서 회수됐을 수 있어 진입마다 다시 확인한다.
        flow.onStartVoiceItem(start, micGranted: isMicGranted())
        syncFlow()
        #if DEBUG
        smokeLog("FLOW: startVoiceItem item=\(start.itemId) number=\(start.itemNumber)/\(start.totalItems)")
        #endif
    }

    /// 결과 화면의 [친구에게 공유하기] (KAN-30).
    func onShareResult(_ payload: SharePayload) {
        pendingShare = payload
    }

    func consumeShare() {
        pendingShare = nil
    }

    // MARK: 게이트

    /// 시작 게이트의 마이크 칸을 통과했다.
    func onStartGateMicPassed() {
        micPassed = true
    }

    /// 목소리 점검이 끝났다 (KAN-105).
    func onVoiceCheckDone(centerHz: Double) {
        voiceCenterHz = centerHz
    }

    /// 문항 진입 게이트를 통과했다 — 기다리던 문항의 녹음으로 곧장 들어간다.
    func onPermissionGranted() {
        flow.onPermissionGranted()
        syncFlow()
    }

    /// 결과 없이 웹으로 돌아간다 (PCM 없는 제출 경로 — KAN-147).
    func onRecordingExit() {
        flow.onRecordingExit()
        syncFlow()
    }

    /// 녹음 화면 ✕ → [그만두기] (KAN-288, 2026-10-18 사용자 결정). 안드로이드 RecordingOverlay `onQuit`의 자리다 — 컨트롤러가
    /// 응시를 버리면(``AccenturyCore/TestFlowController/onTestQuit()``) 세션 실패 [처음으로]와 같은 ``backToIntro()``로 되감는다:
    /// 세션을 버리고(서버 폐기는 다음 생성이 이전 토큰을 실어 한다, KAN-107) `startRequested`가 내려가 진입 URL이 인트로
    /// (탭 바 빌드는 홈)로 다시 로드된다. 웹에 따로 알리는 브리지는 없다 — 문서가 통째로 다시 서므로 알릴 상대가 남지 않는다.
    ///
    /// - Returns: 받아들였는가. 제출을 기다리는 중이면 false이고 아무것도 바뀌지 않는다.
    @discardableResult
    func onTestQuit() -> Bool {
        guard flow.onTestQuit() else { return false }
        syncFlow()
        backToIntro()
        return true
    }

    /// 시작 게이트를 인트로 앞으로 되감는다. 세션 게이트 실패 화면의 [처음으로]와, 프로필 미완료로 추가 정보 화면에
    /// 다녀오는 경우(KAN-224, ``leaveForProfile()``)가 같은 되감기를 쓴다.
    func backToIntro() {
        startRequested = false
        micPassed = false
        // 점검도 함께 되돌린다 — 다시 시작하면 마이크를 새로 열게 되므로, 그 마이크가 잘 잡히는지는
        // 그때 다시 확인해야 맞다.
        voiceCenterHz = nil
        sessionGate.restart()
        syncGate()
    }

    /// 프로필 미완료 (KAN-224). 되감은 뒤 추가 정보 화면으로 넘긴다 — 넘기는 순간 이 흐름 화면이 내려가고 저장 상태도
    /// 지워지므로(``clearSavedState(in:)``, ``AuthGateView``) 되감기는 이중 안전장치다. 안드로이드 `leaveForProfile`과
    /// 같은 이유로 명시해 둔다: 화면 구조가 바뀌어도 완료 뒤에 인트로로 떨어진다는 약속이 남게.
    func leaveForProfile() {
        backToIntro()
        onProfileIncomplete()
    }

    // MARK: 익명 모드의 음성 저장 동의 (KAN-270 6단계)

    /// 시작 게이트의 동의 단계를 세울까. 설치당 한 번이라 통과 표시는 이 모델이 아니라 저장소가 든다.
    var needsAnonymousConsent: Bool { anonymousConsent.map { !$0.asked() } ?? false }

    /// 동의 화면의 선택. 저장소가 asked를 세워 단계가 걷힌다.
    func onAnonymousConsentChosen(consented: Bool) {
        anonymousConsent?.save(consented: consented)
    }

    /// 세션 생성 순간의 값을 읽는다 — 설정에서 바꾸면 다음 생성(재응시 포함)부터 반영된다.
    private var sessionVoiceConsentVersion: String? {
        anonymousConsent.flatMap { anonymousVoiceConsentVersion(consented: $0.consented()) }
    }

    // MARK: 익명 모드의 출신 지역 (KAN-270 7단계)

    /// 동의 화면 다음에 지역 단계를 세울까. 아직 안 골랐으면 동의 화면에서 무엇을 골랐든 세운다 (KAN-274).
    var needsAnonymousRegion: Bool {
        anonymousConsent.map { AccenturyCore.needsAnonymousRegion(region: $0.region()) } ?? false
    }

    /// 지역 화면의 [다음]. 저장소에 region이 생겨 단계가 걷힌다.
    func onAnonymousRegionChosen(_ code: String) {
        anonymousConsent?.saveRegion(code)
    }

    /// 세션 body의 `region`. 지역이 있으면 동의와 무관하게 싣는다 (KAN-274) — 계정 모드는 nil.
    private var sessionRegion: String? {
        anonymousConsent.flatMap { $0.region() }
    }

    /// 재응시 직전의 출신 지역 단계 (KAN-270, PR #22 리뷰). 안드로이드 `retestRegionPending` 자리다.
    ///
    /// 시작 게이트의 지역 칸은 `session == nil`일 때만 서는데, 재응시는 세션을 든 채 결과 화면에서 새 세션을 만든다.
    /// 그래서 처음에 건너뛴 사람이 설정에서 동의를 켠 뒤 재응시하면 지역을 묻지 못하고 라벨이 UNKNOWN으로 남았다.
    /// ``startRetest()``가 세션 요청 앞에서 이 값을 세우고, 지역 화면의 [다음](``onRetestRegionChosen(_:)``)이 내린다.
    ///
    /// 디스크에는 적지 않는다. 프로세스가 죽으면 웹 결과 화면이 다시 로드되어 버튼이 열리므로 잠긴 채 남지 않는다.
    @Published private(set) var retestRegionPending = false

    /// 재응시 직전 지역 화면의 [다음]. 지역을 남기고 단계를 걷는다. 재응시는 호출자가 ``startRetest()``를 다시 불러 잇는다.
    func onRetestRegionChosen(_ code: String) {
        anonymousConsent?.saveRegion(code)
        retestRegionPending = false
    }

    /// 저장해 둔 흐름·세션·시작 게이트를 전부 지운다 (KAN-224).
    ///
    /// 안드로이드는 TestFlow 컴포저블이 로그인 상태(SignedIn)일 때만 살아 있어, 로그아웃·추가 정보로 넘어가면
    /// rememberSaveable 저장분이 컴포지션과 함께 버려진다. iOS는 저장이 `UserDefaults`에 있어 화면이 내려가도 남는다 —
    /// 그대로 두면 다른 계정(또는 프로필을 다시 채운 계정)이 앞 응시의 세션을 복원해 이어 간다. 그래서 관문이 SignedIn을
    /// 벗어날 때 여기서 같은 결과를 만든다. 프로세스 사망 뒤 복원(SignedIn → SignedIn)은 건드리지 않는다.
    static func clearSavedState(in defaults: UserDefaults = .standard) {
        for key in [flowStorageKey, gateStorageKey, startRequestedKey, micPassedKey, voiceCenterKey, campaignTokenKey, introRequestedKey,
                    appLinkEnteredKey] {
            defaults.removeObject(forKey: key)
        }
    }

    // MARK: 세션

    /// 세션 게이트가 화면에 서 있는 동안 한 번 건다. 이미 확보됐거나 실패 화면이면 아무 일도 하지 않는다.
    func createSessionIfNeeded() async {
        guard case .creating = sessionGate.state else { return }
        guard let sessionClient else { return }
        // 익명 모드의 동의 버전도 싣는다 (KAN-270 6단계). 낡은 버전의 400은 동의 없이 한 번 더 만든다.
        let result = await sessionClient.createWithConsentFallback(
            appVersion: AppConfig.appVersionName,
            previousToken: sessionGate.pendingPreviousToken,
            /*
             * 유입 코드는 세션에도 실어 보낸다 (KAN-32). 앱이 세션을 직접 만드는 구조라(KAN-34)
             * 진입 URL의 `?c=`만으로는 서버 쪽 세션에 유입 경로가 남지 않는다 — 링크에서 온 것이
             * URL과 세션 양쪽에 같은 값으로 실려야 공유 유입이 끝까지 이어진다.
             */
            campaignToken: campaignToken,
            voiceConsentVersion: sessionVoiceConsentVersion,
            region: sessionRegion
        )
        sessionGate.onResult(result)
        syncGate()
        #if DEBUG
        smokeLog("SESSION: \(Self.describe(result))")
        #endif
        // 실패 화면이 아니라 추가 정보 화면으로 간다 (KAN-224).
        if sessionGate.state == .profileIncomplete { leaveForProfile() }
    }

    /// 세션 게이트 실패 화면의 [다시 시도].
    func retrySession() {
        sessionGate.restart()
        syncGate()
    }

    /// 결과 화면의 [다시 테스트하기] (KAN-34 2단계, KAN-107).
    ///
    /// - Returns: 실패했으면 웹에 회신할 payload. 성공(교체)이거나 걸 요청이 없으면 nil이다 —
    ///   성공은 회신하지 않는다. 새 세션을 든 채 인트로로 돌아가므로 회신을 받을 페이지가 사라진다.
    func startRetest() async -> RetestFailure? {
        /*
         * 지역이 아직 없으면 세션을 만들기 전에 지역부터 묻는다 (KAN-270, PR #22 리뷰. KAN-274부터 동의와 무관). 잠금
         * (`beginRetest()`)보다 앞이라 지역 화면이 떠 있는 동안 세션 요청도 진행 중 플래그도 없다. 웹 결과 화면은
         * 광고를 볼 때처럼 pending으로 기다리고(시간 기반 해제가 없다), 지역을 고르면 화면이 이 함수를 다시 부른다.
         * 회신할 실패가 아니라서 nil이다.
         */
        if needsAnonymousRegion {
            retestRegionPending = true
            return nil
        }
        // nil이면 이미 요청이 나가 있거나 버릴 세션이 없다 — 어느 쪽이든 할 일은 없다.
        guard let previousToken = sessionGate.beginRetest() else { return nil }
        guard let sessionClient else {
            /*
             * 클라이언트를 nil로 주입한 경우(테스트)뿐이다 — 앱은 늘 실제 클라이언트를 든다.
             * 그래도 **웹에는 회신해야 한다** — 결과 화면은 [다시 테스트하기]를 누른 뒤 버튼을
             * 잠그고 실패 회신만 기다린다(시간 기반 해제는 금지, §8). 여기서 조용히 돌아서면
             * 그 버튼이 영영 잠긴 채로 남는다.
             *
             * 진행 중 플래그를 푸는 것도 같은 호출이 한다 — 안 풀면 다시 누를 수도 없다.
             */
            let outcome = sessionGate.onRetestResult(
                .transportError(reason: "세션 클라이언트 없음")
            )
            syncGate()
            guard case .failed(let failure) = outcome else { return nil }
            return retestFailurePayload(failure)
        }
        let result = await sessionClient.createWithConsentFallback(
            appVersion: AppConfig.appVersionName,
            previousToken: previousToken,
            // 재응시도 같은 유입이다 (KAN-32) — 공유 링크로 들어온 사람이 한 번 더 보는 것까지가
            // 그 링크가 만든 응시라, 코드를 그대로 물려준다.
            campaignToken: campaignToken,
            voiceConsentVersion: sessionVoiceConsentVersion,
            region: sessionRegion
        )
        let outcome = sessionGate.onRetestResult(result)
        syncGate()
        switch outcome {
        case .replaced:
            // 새 세션을 든 채 인트로로 돌린다. 진입 URL은 startRequested를 함께 보므로
            // (`webUrl`) 이 한 줄이 곧 인트로 리로드다. micPassed는 되돌리지 않는다 —
            // 권한이 이미 허용이면 다시 묻지 않는 것이 KAN-34 AC다.
            startRequested = false
            // 홈 시작 빌드에서도 재응시 뒤는 인트로다 (KAN-252).
            introRequested = true
            // 이전 세션의 음성 문항 요청이 새 세션 복구에 섞이지 않게 비운다 (KAN-261 리뷰 P1-4).
            flow.onSessionReplaced()
            return nil
        case .failed(let failure):
            return retestFailurePayload(failure)
        case .profileIncomplete:
            // 결과 화면에 회신할 실패가 아니다 — 추가 정보를 받으러 간다 (KAN-224). 결과 화면은 흐름과 함께 내려간다.
            leaveForProfile()
            return nil
        }
    }

    // MARK: 업로드

    /// ``UploadModel``이 매니저의 상태 스트림에서 받은 값을 흘려 넣는다.
    ///
    /// 값이 그대로면 아무것도 하지 않는다 — 스트림은 라벨 등록 같은 화면과 무관한 변화에도
    /// 울리는데, 같은 값을 다시 발행하면 결과 전달 이펙트가 헛돈다.
    func setUploads(_ next: [String: UploadState]) {
        guard uploads != next else { return }
        #if DEBUG
        // 바뀐 칸만 찍는다 — 스트림은 진행 중 업로드가 있는 동안 자주 울리는데, 매번 전부
        // 찍으면 스모크 출력에서 "방금 무엇이 달라졌는가"가 묻힌다.
        for (attemptId, state) in next where uploads[attemptId] != state {
            smokeLog("UPLOAD: attempt=\(attemptId) state=\(Self.describe(state))")
        }
        #endif
        uploads = next
    }

    /// 녹음이 끝났다 — 대기 시도로 등록하고 화면을 제출 중으로 붙든다 (KAN-146).
    ///
    /// - Returns: 같은 문항의 앞 시도 중 이 녹음에 밀려난 attemptId들. 호출자가 그 업로드를
    ///   폐기한다 (KAN-147) — 남겨두면 상태 바의 [재시도]가 그대로 서 있고, 그걸 누르면 같은
    ///   문항에 분석 작업이 둘 생겨 웹이 결과를 두 번 받는다.
    @discardableResult
    func onRecordingFinished(attemptId: String, durationMs: Int64, quality: QualityStatus) -> [String] {
        let superseded = flow.onRecordingFinished(
            attemptId: attemptId,
            durationMs: durationMs,
            quality: quality
        )
        syncFlow()
        return superseded
    }

    /// 이 시도의 업로드를 포기하고 녹음부터 다시 한다 — 서버가 녹음 자체를 거절해
    /// `rerecord`가 선 경우다 (KAN-147, 2026-08-25 B안).
    ///
    /// - Returns: 컨트롤러가 시도를 거둬갔는가. true면 호출자가 그 업로드의 바이트를 폐기한다.
    @discardableResult
    func onUploadGivenUp(attemptId: String, message: String?, missingItems: [String] = []) -> Bool {
        // 권한이 그새 회수됐을 수 있다 — 다시 열 화면이 녹음인지 권한 게이트인지를 이 값이 가른다.
        let taken = flow.onUploadGivenUp(
            attemptId: attemptId,
            micGranted: isMicGranted(),
            message: message,
            missingItems: missingItems
        )
        syncFlow()
        return taken
    }

    /// 지금 페이즈가 업로드 실패로 스스로 다시 열린 녹음 화면인가 (KAN-147). 제출을 기다리는
    /// 중에는 뜻이 없는 값이라 Recording일 때만 참이다.
    var recordingAfterUploadFailure: Bool {
        if case .recording(let recording) = phase { return recording.afterUploadFailure }
        return false
    }

    /// 그 전환에서 서버가 준 문구. nil이면 화면이 기본 안내를 쓴다.
    var recordingFailureMessage: String? {
        if case .recording(let recording) = phase { return recording.failureMessage }
        return nil
    }

    // MARK: 결과 전달

    /// 업로드가 끝난 시도를 ``AccenturyCore/ItemResult``로 조립해 돌려준다 (KAN-100).
    /// 실제 주입(`evaluateJavaScript`)은 화면 몫이다 — 여기서 WebKit을 부르면 이 클래스가
    /// 시뮬레이터 없이 검증 불가능해진다.
    func takeResultsForDelivery() -> [ItemResult] {
        let delivered = flow.onUploadsChanged(uploads)
        syncFlow()
        return delivered
    }

    /// 웹에 알릴 재전송 가능한 실패 (KAN-288, webview-bridge.md §14). 판정은 Core
    /// ``AccenturyCore/TestFlowController/failedUploads(_:)``가 하고, 주입은 화면 몫이다(``takeResultsForDelivery()``와 같은 이유).
    func failedUploads() -> [UploadFailed] {
        flow.failedUploads(uploads)
    }

    /// 결과 주입이 끝났다 — 웹이 받아 다음 문항을 그리기 시작했다는 뜻이다 (KAN-146).
    func onResultDelivered(attemptId: String) {
        flow.onResultDelivered(attemptId: attemptId)
        syncFlow()
    }

    /// 붙들어 둔 화면의 상한이 찼다 (KAN-146). 안드로이드의
    /// `LaunchedEffect { delay(ORPHANED_SUBMIT_TIMEOUT_MS); flow.onSubmitTimeout(...) }` 자리다.
    ///
    /// **발화 시점의** 업로드 상태를 넘긴다 — 타이머를 걸 때는 아직 목록에 안 올라와 있을 수 있고
    /// (등록과 화면 반영 사이 한 프레임), 그 사이 채워졌으면 걷지 않는 것이 맞다. 걷을지 말지의
    /// 판정 자체는 Core가 한다.
    func onSubmitTimeout(attemptId: String) {
        flow.onSubmitTimeout(attemptId: attemptId, uploads: uploads)
        syncFlow()
    }

    /// 지금 제출 결과를 기다리는 시도. 없으면 nil이다.
    var submittingAttemptId: String? {
        if case .submitting(let submitting) = phase { return submitting.attemptId }
        return nil
    }

    /// 붙들린 화면을 **업로드가 뒷받침하지 않는다** (KAN-146).
    ///
    /// 업로드가 진행 중인 동안에는 시간으로 걷지 않는다 — 끝나면 결과가 나가 다음 문항이 그려지고,
    /// 실패하면 ``takeResultsForDelivery()``가 그것도 종료로 보고 놓는다. 시간이 개입하면 느린
    /// 망에서 업로드가 아직 도는데 화면을 놓아 버려, 이 티켓이 없애려던 대기 화면이 바로 그
    /// 구간에 다시 생긴다.
    var submitHoldIsUnbacked: Bool {
        guard let submittingAttemptId else { return false }
        if case .inFlight? = uploads[submittingAttemptId] { return false }
        return true
    }

    // MARK: 반영·저장

    private func syncFlow() {
        if phase != flow.phase { phase = flow.phase }
        defaults.set(flow.saved(), forKey: Self.flowStorageKey)
    }

    /// 진입 URL(``webUrl``)과 브리지 토큰(``bridgeToken``)은 계산 프로퍼티라 그 자체로는
    /// 관측 대상이 아니다. 둘의 재료가 전부 여기서 바뀌는 값(세션)이므로, 이 발행이 곧 그 둘의
    /// 갱신 신호다.
    private func syncGate() {
        if gateState != sessionGate.state { gateState = sessionGate.state }
        if gateAttempt != sessionGate.attempt { gateAttempt = sessionGate.attempt }
        defaults.set(sessionGate.saved(), forKey: Self.gateStorageKey)
    }

    /// 이 앱이 쓸 세션 클라이언트. 안드로이드 `remember { OkHttpSessionClient(BuildConfig.API_BASE_URL) }`
    /// 자리이고, 기본은 **실제 서버**다.
    ///
    /// `nonisolated`인 이유는 이 함수가 ``init(defaults:sessionClient:isMicGranted:)``의 기본
    /// 인자이기 때문이다 — 기본 인자 식은 언제나 격리 밖에서 평가된다
    /// (`PermissionGateView`의 모델 주입 생성자가 갈린 것과 같은 제약).
    nonisolated private static func defaultSessionClient() -> SessionClient? {
        #if DEBUG
        /*
         * 백엔드 없이 게이트 뒤 화면을 보려면 `-StubSession 1`을 준다. 기본이 아니라 인자인
         * 것이 요점이다 — 스텁이 기본이면 "세션이 실패하는 화면"을 개발 중에 한 번도 못 본다.
         * 릴리스 바이너리에는 이 분기도, `DebugStubSessionClient`라는 문자열도 없다.
         */
        if UserDefaults.standard.bool(forKey: "StubSession") { return DebugStubSessionClient() }
        #endif
        /*
         * 로그인을 끈 빌드(익명 모드, KAN-270 6단계)는 plain 클라이언트다. 예전 로그인 빌드가 남긴 토큰이 Keychain에
         * 있어도 Bearer가 실리지 않게 하려는 것이다 — 실리면 서버가 계정 세션으로 보고 voiceConsentVersion을 무시한다.
         * ``AuthHub``도 깨우지 않는다. 안드로이드 `AnonymousFlow`의 `remember { OkHttpClient() }` 자리다.
         */
        guard AppConfig.loginEnabled else { return URLSessionSessionClient(baseURL: AppConfig.apiBaseURL) }
        /*
         * 세션 생성만 계정 토큰을 싣는다 (KAN-224) — 서버가 세션을 계정에 묶고 출신지역을 계정 값으로 채운다.
         * 업로드·결과 등 세션 범위 API는 `st_` 세션 토큰을 쓰는 기존 클라이언트 그대로다 (AuthorizedSession 주석).
         */
        return AuthHub.clients.sessionClient()
    }

    #if DEBUG
    /// 세션 결과 한 줄 (KAN-108 §8 스모크). **토큰은 절대 찍지 않는다** — 브리지가 토큰 값을
    /// 로그에 남기지 않는 규칙(`TOKEN:` 줄)과 같은 이유다. 세션 식별자와 버전만으로 백엔드
    /// 로그의 같은 요청을 찾을 수 있다.
    private static func describe(_ result: SessionResult) -> String {
        switch result {
        case .created(let session):
            return "created sessionId=\(session.sessionId) testVersion=\(session.testVersion)"
                + " voiceSet=\(session.voiceSet) scoreVersion=\(session.scoreVersion)"
        case .rejected(let code, _, let retryable, let retryAfterMs):
            // message는 사용자용 한국어 문구라 찍지 않는다 — 코드가 진단에 쓰는 값이다.
            return "rejected code=\(code ?? "(none)") retryable=\(retryable) retryAfterMs=\(retryAfterMs.map(String.init) ?? "(none)")"
        case .transportError(let reason):
            return "transportError reason=\(reason)"
        }
    }

    /// 업로드 상태 한 칸.
    private static func describe(_ state: UploadState) -> String {
        switch state {
        case .inFlight:
            return "inFlight"
        case .done(let analysisJobId):
            return "done analysisJobId=\(analysisJobId)"
        case .failed(let failure):
            return "failed retryable=\(failure.retryable) rerecord=\(failure.rerecord) message=\(failure.message ?? "(none)")"
        }
    }
    #endif
}

#if DEBUG
/// 백엔드 없이 시작 게이트를 통과시키는 디버그 스텁 (`-StubSession 1`). 고정 세션을 즉시 돌려줘
/// 웹이 `?screen=test`로 넘어가는 것까지를 시뮬레이터에서 확인할 수 있게 한다.
///
/// **네트워크를 타지 않는다** — 그래서 이 세션의 `sessionId`·`sessionToken`은 서버가 모르는
/// 값이고, 웹이 이어서 부르는 `GET /v0/tests/{testVersion}`은 백엔드가 붙는 8단계 전에는 실패한다.
/// 여기까지가 이 스텁이 확인해 주는 범위다. 업로드도 같은 이유로 거절된다 — 서버가 모르는
/// 세션이라 401이 온다.
struct DebugStubSessionClient: SessionClient {
    func create(
        appVersion: String,
        previousToken: String?,
        campaignToken: String?,
        voiceConsentVersion: String?,
        region: String?
    ) async -> SessionResult {
        .created(
            Session(
                sessionId: "s_debug_stub",
                sessionToken: "st_debug_stub",
                // 웹 테스트가 쓰는 정의 버전 표기와 같은 꼴 (web/src/App.test.tsx).
                testVersion: "gn-2026.08.1",
                // 서버가 고르는 값이지만 이 스텁은 서버를 타지 않는다 (KAN-205). 세트 1이면
                // 진입 URL이 세트를 싣는지까지는 확인된다.
                voiceSet: 1,
                scoreVersion: "sv-debug",
                expiresAt: "2099-01-01T00:00:00Z"
            )
        )
    }
}
#endif
