import XCTest
@testable import AccenturyCore

/// 안드로이드 `auth/ProfileFormStateTest.kt`의 이식본 (KAN-224). 날짜 풀이만 iOS 달력 규칙(그 달력 시간대의 자정)으로 바꿨다.
@MainActor
final class ProfileFormStateTests: XCTestCase {

    private func complete() -> ProfileFormState {
        ProfileFormState(email: "a@b.co", name: "이름", birthDate: "2000-01-02", gender: .FEMALE, region: .JEJU)
    }

    private func calendar(_ zone: String) -> Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: zone)!
        return calendar
    }

    // 성별은 선택이라 빠진다 (KAN-330) — 성별 없는 완료는 StoreReviewFixTests.
    // 지역은 다음 화면이라 프로필 [다음]은 세 칸만 본다 (KAN-355).
    func test프로필_다음은_성별을_뺀_세_칸이_차야_켜지고_지역은_보지_않는다() {
        XCTAssertTrue(complete().basicsComplete)
        let cases: [(ProfileFormState) -> Void] = [{ $0.email = "" }, { $0.name = "" }, { $0.birthDate = nil }]
        for clear in cases {
            let form = complete()
            clear(form)
            XCTAssertFalse(form.basicsComplete)
            XCTAssertFalse(form.isComplete)
            XCTAssertNil(form.toInput())
        }

        let noRegion = complete()
        noRegion.region = nil
        XCTAssertTrue(noRegion.basicsComplete)
    }

    func test지역_없이는_저장_본문을_만들지_않는다() {
        let form = complete()
        form.region = nil
        XCTAssertFalse(form.isComplete)
        XCTAssertNil(form.toInput())
    }

    /// 프로필 화면 값과 지역 화면에서 고른 값이 한 본문으로 나간다 (KAN-355 — 저장은 지역 화면 [다음] 한 번).
    func test두_화면의_값을_합쳐_저장_본문을_만든다() {
        let form = ProfileFormState(email: "a@b.co", name: "이름", birthDate: "2000-01-02", gender: .MALE)
        XCTAssertTrue(form.basicsComplete)
        XCTAssertNil(form.toInput())

        form.region = .GYEONGNAM
        XCTAssertEqual(
            ProfileInput(email: "a@b.co", name: "이름", birthDate: "2000-01-02", gender: "MALE", region: "GYEONGNAM"),
            form.toInput()
        )
    }

    func test공백뿐인_이메일과_이름_골뱅이_없는_이메일은_빈칸이다() {
        let cases: [(ProfileFormState) -> Void] = [{ $0.email = "   " }, { $0.name = "  \t" }, { $0.email = "ab.co" }]
        for mutate in cases {
            let form = complete()
            mutate(form)
            XCTAssertFalse(form.isComplete)
        }
    }

    func test보낼_때_앞뒤_공백을_걷고_코드는_서버_이름_그대로다() {
        let form = complete()
        form.email = "  a@b.co "
        form.name = " 이름 "
        XCTAssertEqual(
            ProfileInput(email: "a@b.co", name: "이름", birthDate: "2000-01-02", gender: "FEMALE", region: "JEJU"),
            form.toInput()
        )
    }

    func test서버_계정_값으로_칸을_미리_채운다_애플_릴레이_이메일도_그대로() {
        let form = ProfileFormState(
            user: AuthUser(id: "u-1", provider: .APPLE, email: "x1y2@privaterelay.appleid.com", name: "홍길동", region: "GYEONGNAM")
        )

        XCTAssertEqual("x1y2@privaterelay.appleid.com", form.email)
        XCTAssertEqual("홍길동", form.name)
        XCTAssertEqual(.GYEONGNAM, form.region)
        XCTAssertNil(form.gender)
        XCTAssertFalse(form.isComplete)
    }

    func test모르는_코드는_빈칸으로_둔다() {
        let form = ProfileFormState(user: AuthUser(id: "u", provider: .GOOGLE, gender: "OTHER", region: "UNKNOWN"))
        XCTAssertNil(form.gender)
        XCTAssertNil(form.region)
    }

    /// 달력은 고른 날의 그 달력 시간대 자정을 준다. 같은 달력으로 풀면 KST든 서쪽 시간대든 그날이다.
    func test달력의_자정은_시간대와_무관하게_그날이다_KST와_서쪽_시간대() throws {
        for zone in ["Asia/Seoul", "America/Los_Angeles", "UTC"] {
            let calendar = calendar(zone)
            let picked = try XCTUnwrap(calendar.date(from: DateComponents(year: 2000, month: 1, day: 2)))
            XCTAssertEqual("2000-01-02", birthDateString(of: picked, calendar: calendar), zone)
        }
    }

    /// UTC로 풀면 KST 자정은 전날 15시라 하루 밀린다 — 이 함수가 달력을 인자로 받는 이유다.
    func testKST_자정을_UTC로_풀면_전날이_된다() throws {
        let picked = try XCTUnwrap(calendar("Asia/Seoul").date(from: DateComponents(year: 2000, month: 1, day: 2)))
        XCTAssertEqual("2000-01-01", birthDateString(of: picked, calendar: calendar("UTC")))
    }

    func test날짜_왕복과_깨진_형식() throws {
        let calendar = calendar("Asia/Seoul")
        let date = try XCTUnwrap(birthDate(from: "1999-12-31", calendar: calendar))
        XCTAssertEqual("1999-12-31", birthDateString(of: date, calendar: calendar))
        XCTAssertNil(birthDate(from: "2000/01/02", calendar: calendar))
        XCTAssertNil(birthDate(from: "2000-02-30", calendar: calendar))
    }

    func test지역은_웹_regions_ts와_같은_순서_같은_표기다() {
        XCTAssertEqual(["서울", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"], Region.allCases.map(\.label))
        XCTAssertEqual(["MALE", "FEMALE"], Gender.allCases.map(\.rawValue))
    }

    // 프로필 칸이 원인인 실패만 프로필 화면으로 되돌린다 (KAN-355 리뷰).
    func test만14세_거절과_재시도불가는_프로필로_되돌리고_다시_누르면_되는_실패는_머문다() {
        XCTAssertTrue(profileFieldFailure(AuthFailure(.underAge)))
        XCTAssertTrue(profileFieldFailure(AuthFailure(.unsupported)))
        XCTAssertFalse(profileFieldFailure(AuthFailure(.retry)))
        XCTAssertFalse(profileFieldFailure(AuthFailure(.retryLater)))
        XCTAssertFalse(profileFieldFailure(AuthFailure(.rateLimited, retryAfterSeconds: 3)))
        XCTAssertFalse(profileFieldFailure(nil))
    }
}
