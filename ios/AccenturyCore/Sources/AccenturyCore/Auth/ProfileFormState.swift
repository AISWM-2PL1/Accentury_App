import Combine
import Foundation

/// 출신지역 (KAN-224 추가 정보, KAN-202 표). `web/src/region/regions.ts`의 REGIONS, 서버 `session/Region.java`,
/// 안드로이드 `auth/Regions.kt`의 거울이다 — `rawValue`가 그대로 요청 본문의 코드이고, 선언 순서가 화면의 나열
/// 순서다(기획표 순서). 코드나 순서를 바꾸면 웹·서버·안드로이드와 함께 바꾼다. 서버 저장 전용 `UNKNOWN`은 없다.
public enum Region: String, CaseIterable, Sendable {
    case SEOUL, GYEONGGI, GANGWON, CHUNGBUK, CHUNGNAM, JEONBUK, JEONNAM, GYEONGBUK, GYEONGNAM, JEJU

    public var label: String {
        switch self {
        case .SEOUL: return "서울"
        case .GYEONGGI: return "경기"
        case .GANGWON: return "강원"
        case .CHUNGBUK: return "충북"
        case .CHUNGNAM: return "충남"
        case .JEONBUK: return "전북"
        case .JEONNAM: return "전남"
        case .GYEONGBUK: return "경북"
        case .GYEONGNAM: return "경남"
        // 지라 표는 '제주도'였다 - 2026-09-11 다른 지역과 표기를 통일해 '제주'로 (웹 regions.ts와 같은 결정).
        case .JEJU: return "제주"
        }
    }
}

/// 성별 (§3.10). `rawValue`가 요청 본문의 값이다.
public enum Gender: String, CaseIterable, Sendable {
    case MALE, FEMALE

    public var label: String {
        switch self {
        case .MALE: return "남성"
        case .FEMALE: return "여성"
        }
    }
}

/// 달력이 고른 날을 `YYYY-MM-DD`로 (KAN-224).
///
/// SwiftUI `DatePicker`의 값은 **고른 날의 그 달력 시간대 자정**이다(안드로이드 Material3는 UTC 자정이라 거기서는
/// UTC로 풀었다). 그래서 같은 달력(같은 시간대)으로 풀어야 날짜가 맞는다 — UTC로 풀면 KST 자정은 전날 15시라 하루 밀린다.
/// 화면은 달력과 이 함수에 같은 `Calendar`를 준다.
public func birthDateString(of date: Date, calendar: Calendar = .current) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
}

/// ``birthDateString(of:calendar:)``의 역 — 이미 고른 날짜를 달력의 초기 선택으로 되돌린다. 형식이 깨졌으면 nil.
public func birthDate(from string: String, calendar: Calendar = .current) -> Date? {
    let parts = string.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    let components = DateComponents(year: parts[0], month: parts[1], day: parts[2])
    guard components.isValidDate(in: calendar) else { return nil }
    return calendar.date(from: components)
}

/// 추가 정보 화면의 입력 (KAN-224, §3.10). 안드로이드 `ProfileFormState`의 이식본이다. 다섯 칸이 다 차야 [완료]가
/// 켜진다 — 건너뛰기는 없다.
///
/// 서버가 이미 아는 값은 미리 채운다: IdP가 준 이메일·이름, 그리고 다른 기기에서 입력했다가 서버가 미완료로
/// 되돌린 경우(403 `AUTH_PROFILE_INCOMPLETE`)의 나머지 값. 애플 릴레이 이메일도 고치지 않고 그대로 둔다.
@MainActor
public final class ProfileFormState: ObservableObject {
    @Published public var email: String
    @Published public var name: String
    /// `YYYY-MM-DD`. 달력에서만 고른다 — 손으로 치는 칸이 아니다.
    @Published public var birthDate: String?
    @Published public var gender: Gender?
    @Published public var region: Region?
    /// 제출이 나가 있다 — [완료]를 다시 누를 수 없다.
    @Published public var submitting = false

    public init(email: String = "", name: String = "", birthDate: String? = nil, gender: Gender? = nil, region: Region? = nil) {
        self.email = email
        self.name = name
        self.birthDate = birthDate
        self.gender = gender
        self.region = region
    }

    /// 서버가 준 계정 값으로 채운다. 모르는 코드(서버가 값을 늘린 경우)는 빈칸으로 두고 다시 고르게 한다.
    public convenience init(user: AuthUser) {
        self.init(
            email: user.email ?? "",
            name: user.name ?? "",
            birthDate: user.birthDate,
            gender: user.gender.flatMap(Gender.init(rawValue:)),
            region: user.region.flatMap(Region.init(rawValue:))
        )
    }

    /// 이메일 검증은 '@'가 있는지까지만 본다. 형식의 정본은 서버 검증(400 `VALIDATION_FAILED`)이다.
    public var isComplete: Bool {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmedEmail.isEmpty && trimmedEmail.contains("@")
            && !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && birthDate != nil && gender != nil && region != nil
    }

    /// ``isComplete``일 때만 부른다. 앞뒤 공백은 서버로 보내지 않는다.
    public func toInput() -> ProfileInput? {
        guard isComplete, let birthDate, let gender, let region else { return nil }
        return ProfileInput(
            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            birthDate: birthDate,
            gender: gender.rawValue,
            region: region.rawValue
        )
    }
}
