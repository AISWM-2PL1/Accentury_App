import Foundation

/// 세션 생성 한 번의 결과. 판정(무엇을 보여줄지)은 ``SessionGateController``가 한다.
public enum SessionResult: Equatable, Sendable {

    case created(Session)

    /// 서버가 응답은 했지만 세션을 주지 않았다. 필드는 공통 오류 봉투(§2.4) 그대로다.
    ///
    /// - `retryAfterMs`: 429가 알려주는 대기 시간 (§2.5). 그 외에는 nil이다.
    case rejected(code: String?, message: String?, retryable: Bool, retryAfterMs: Int64?)

    /// 응답이 아예 오지 않은 전송 실패. 의미상 항상 재시도 가능.
    case transportError(reason: String)
}

/// `POST /v0/sessions` 클라이언트 (KAN-34 결선, KAN-9 계약).
///
/// `previousToken`이 이 프로토콜에 있는 이유: 재응시도 같은 호출이다 (KAN-107, §3.1). 이전 세션의
/// 토큰을 함께 보내면 서버가 그 세션과 결과를 즉시 폐기하고 새 세션을 발급한다. 최초 응시와
/// 재응시가 다른 메서드로 갈리면 본문 필드 하나 차이인 두 경로가 따로 늙으므로 파라미터로 둔다.
///
/// 실제 URLSession 구현은 §6 결선 몫이다 — 여기 있는 것은 게이트 상태 머신이 의존하는 경계뿐이라,
/// 네트워크 없이 가짜 클라이언트로 테스트가 돈다.
public protocol SessionClient: Sendable {
    /// - Parameters:
    ///   - appVersion: 익명 집계용 앱 버전 (서버 상한 32자)
    ///   - previousToken: 재응시일 때 폐기할 이전 세션의 토큰. 최초 응시는 nil
    ///   - campaignToken: Universal Link로 들어온 공유 유입 계측 코드 (KAN-32).
    ///     링크 진입이 아니면 nil
    ///   - voiceConsentVersion: 익명 모드에서 음성 저장에 동의했을 때의 문안 버전 (KAN-270 6단계). 서버는 계정 세션에서는
    ///     이 필드를 무시한다 — 계정 모드는 nil로 둔다. 미동의도 nil
    ///   - region: 익명 모드의 출신 지역 코드 (KAN-270 7단계). 동의하고 지역을 골랐을 때만 — 계정 모드·미동의는 nil.
    ///     계정 세션의 지역은 서버가 프로필 값으로 채운다
    func create(
        appVersion: String,
        previousToken: String?,
        campaignToken: String?,
        voiceConsentVersion: String?,
        region: String?
    ) async -> SessionResult
}

public extension SessionClient {
    /// 안드로이드의 기본 인자(`region: String? = null`) 자리 (KAN-270 7단계).
    func create(
        appVersion: String,
        previousToken: String?,
        campaignToken: String?,
        voiceConsentVersion: String?
    ) async -> SessionResult {
        await create(
            appVersion: appVersion,
            previousToken: previousToken,
            campaignToken: campaignToken,
            voiceConsentVersion: voiceConsentVersion,
            region: nil
        )
    }

    /// 안드로이드의 기본 인자(`previousToken: String? = null`, `campaignToken: String? = null`,
    /// `voiceConsentVersion: String? = null`) 자리. 프로토콜 요구사항에는 기본값을 적을 수 없어 확장으로 둔다.
    func create(appVersion: String) async -> SessionResult {
        await create(appVersion: appVersion, previousToken: nil, campaignToken: nil, voiceConsentVersion: nil)
    }

    /// 안드로이드의 기본 인자(`campaignToken: String? = null`) 자리.
    func create(appVersion: String, previousToken: String?) async -> SessionResult {
        await create(appVersion: appVersion, previousToken: previousToken, campaignToken: nil, voiceConsentVersion: nil)
    }

    /// 안드로이드의 기본 인자(`voiceConsentVersion: String? = null`) 자리 — 계정 모드의 호출 모양이다.
    func create(appVersion: String, previousToken: String?, campaignToken: String?) async -> SessionResult {
        await create(
            appVersion: appVersion,
            previousToken: previousToken,
            campaignToken: campaignToken,
            voiceConsentVersion: nil
        )
    }

    /// 세션 생성 + 동의 버전 폴백 (KAN-270 6단계). 안드로이드 `createWithConsentFallback`, 웹 `App.tsx`
    /// startStandaloneTest와 같은 규칙이다.
    ///
    /// 동의를 실었는데 400 `VALIDATION_FAILED`면 이 빌드의 문안 버전이 서버 게시 버전보다 낡았다(서버가 버전을 먼저 올린
    /// 배포 사이). 동의 없이 **한 번만** 다시 만든다 — 선택 동의 하나 때문에 응시가 막히면 안 된다(팀 결정 2026-10-06).
    /// 이전 토큰은 그대로 싣는다: 400은 본문 검증에서 나므로 서버가 옛 세션을 폐기하기 전이고, 두 번째 요청이 그 폐기를
    /// 다시 맡는다. 미동의 요청의 400이나 다른 거절은 그대로 돌려준다.
    ///
    /// 재시도에서도 `region`은 그대로 싣는다 (KAN-274) — 지역은 동의와 무관하게 받는 값이고, 서버가 동의하지 않은 익명
    /// 세션도 음성 없이 점수와 지역을 남긴다. 웹 `App.tsx`의 폴백과 같다.
    func createWithConsentFallback(
        appVersion: String,
        previousToken: String?,
        campaignToken: String?,
        voiceConsentVersion: String?,
        region: String? = nil
    ) async -> SessionResult {
        let first = await create(
            appVersion: appVersion,
            previousToken: previousToken,
            campaignToken: campaignToken,
            voiceConsentVersion: voiceConsentVersion,
            region: region
        )
        guard voiceConsentVersion != nil,
              case .rejected(let code, _, _, _) = first,
              code == codeValidationFailed
        else { return first }
        return await create(
            appVersion: appVersion,
            previousToken: previousToken,
            campaignToken: campaignToken,
            voiceConsentVersion: nil,
            region: region
        )
    }
}

/// 동의 버전이 서버 게시 버전과 어긋났을 때 서버가 주는 코드 (§2.4)
public let codeValidationFailed = "VALIDATION_FAILED"
