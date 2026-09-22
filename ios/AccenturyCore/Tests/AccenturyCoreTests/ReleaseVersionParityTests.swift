import XCTest

/// 두 플랫폼의 버전 번호가 같은 커밋에서 같이 올라갔는지 (KAN-175 3단계).
///
/// iOS `CURRENT_PROJECT_VERSION`이 안드로이드 `versionCode`고, `MARKETING_VERSION`이
/// `versionName`이다. 한쪽만 올려도 두 빌드는 멀쩡히 나오고 테스트도 조용한데, 스토어에는
/// 서로 다른 버전의 같은 앱이 올라간다 — 그 어긋남을 커밋 전에 잡으라고 두 레포 파일을
/// **직접 읽어** 대조하는 검사다.
///
/// `AccenturyCoreTests/Web/AppLinkTests`가 entitlements를 읽어 코드와 대조하는 것과 같은 방식이고,
/// 같은 이유로 번들 리소스가 아니라 사람이 고치는 원본을 읽는다.
final class ReleaseVersionParityTests: XCTestCase {
    /// 6 미만은 App Store Connect가 업로드를 거절한다 — 1.0 빌드 5까지 TestFlight에 올라가 있고
    /// 같은 마케팅 버전 안에서는 빌드 번호가 단조 증가해야 한다 (`docs/wiki/ios-port.md` §7).
    private static let minimumBuildNumber = 6

    private static let xcconfigRelativePath = "ios/Accentury/Config/Base.xcconfig"
    private static let gradleRelativePath = "app/build.gradle.kts"

    /// 한쪽만 올린 상태를 만들면 여기서 걸린다.
    func testIosAndAndroidShipTheSameVersionNumbers() throws {
        let xcconfig = try Self.contents(of: Self.xcconfigRelativePath)
        let gradle = try Self.contents(of: Self.gradleRelativePath)

        let marketingVersion = try Self.firstMatch(#"^MARKETING_VERSION\s*=\s*(\S+)\s*$"#, in: xcconfig,
                                                   key: "MARKETING_VERSION", file: Self.xcconfigRelativePath)
        let currentProjectVersion = try Self.firstMatch(#"^CURRENT_PROJECT_VERSION\s*=\s*(\S+)\s*$"#, in: xcconfig,
                                                        key: "CURRENT_PROJECT_VERSION", file: Self.xcconfigRelativePath)
        let versionName = try Self.firstMatch(#"^\s*versionName\s*=\s*"([^"]+)"\s*$"#, in: gradle,
                                              key: "versionName", file: Self.gradleRelativePath)
        let versionCode = try Self.firstMatch(#"^\s*versionCode\s*=\s*(\S+)\s*$"#, in: gradle,
                                              key: "versionCode", file: Self.gradleRelativePath)

        XCTAssertEqual(
            marketingVersion, versionName,
            """
            마케팅 버전이 갈렸다 — iOS MARKETING_VERSION=\(marketingVersion), \
            Android versionName=\(versionName).
            \(Self.ruleMessage)
            """
        )
        XCTAssertEqual(
            currentProjectVersion, versionCode,
            """
            빌드 번호가 갈렸다 — iOS CURRENT_PROJECT_VERSION=\(currentProjectVersion), \
            Android versionCode=\(versionCode).
            \(Self.ruleMessage)
            """
        )

        let build = try XCTUnwrap(Int(currentProjectVersion), "빌드 번호가 정수가 아니다: \(currentProjectVersion)")
        XCTAssertGreaterThanOrEqual(
            build, Self.minimumBuildNumber,
            """
            빌드 번호 \(build)은 App Store Connect가 받지 않는다 — 1.0 빌드 5까지 TestFlight에 \
            올라가 있어 \(Self.minimumBuildNumber) 이상이라야 한다 (docs/wiki/ios-port.md §7).
            \(Self.ruleMessage)
            """
        )
    }

    private static let ruleMessage = """
    규칙: 두 값은 **같은 커밋에서 같이 올린다** (KAN-175).
      iOS     \(xcconfigRelativePath)
      Android \(gradleRelativePath)
    """

    // MARK: - 레포 파일 읽기

    /// 이 테스트 파일에서 레포 루트(`ios/`와 `app/`을 함께 가진 디렉터리)까지 거슬러 올라간다.
    private static func repositoryRoot() -> URL? {
        var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while directory.path != "/" {
            let fm = FileManager.default
            if fm.fileExists(atPath: directory.appendingPathComponent("ios").path),
               fm.fileExists(atPath: directory.appendingPathComponent("app").path) {
                return directory
            }
            directory = directory.deletingLastPathComponent()
        }
        return nil
    }

    private static func contents(of relativePath: String) throws -> String {
        // 건너뛰지 않는다 — 파일을 못 읽으면 검사 자체가 없던 일이 되고, 그게 이 테스트가 막으려는 상태다.
        let root = try XCTUnwrap(repositoryRoot(), "#filePath=\(#filePath)에서 레포 루트를 찾지 못했다")
        let path = root.appendingPathComponent(relativePath).path
        return try XCTUnwrap(
            FileManager.default.contents(atPath: path).flatMap { String(data: $0, encoding: .utf8) },
            "\(relativePath)를 읽지 못했다: \(path)"
        )
    }

    /// 줄 머리에 앵커를 걸어 주석 줄(`//` 로 시작한다)은 걸리지 않게 한다.
    private static func firstMatch(_ pattern: String, in text: String, key: String, file: String) throws -> String {
        let regex = try NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines])
        let range = NSRange(text.startIndex..., in: text)
        let match = try XCTUnwrap(
            regex.firstMatch(in: text, range: range),
            "\(file)에서 \(key) 줄을 찾지 못했다 — 값을 옮겼다면 이 테스트의 정규식도 같이 고친다"
        )
        return try XCTUnwrap(Range(match.range(at: 1), in: text).map { String(text[$0]) })
    }
}
