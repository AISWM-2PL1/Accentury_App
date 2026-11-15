import XCTest
@testable import AccenturyCore

/// 출신 지역 지도 (KAN-355 3단계) — path 파서, 지도 면 탭 판정, 결과 줄 문구, 앱 사본과 정본의 일치.
final class RegionMapTests: XCTestCase {

    // MARK: path 파서

    func test직선_명령을_절대_상대_가로_세로로_읽는다() throws {
        let rings = try parseSVGPath("M10 10L20 10 20 20Z m5 5 h10 v10 l-10 0 z M0 0H4V4")
        XCTAssertEqual([
            [MapPoint(10, 10), MapPoint(20, 10), MapPoint(20, 20)],
            // Z가 시작점(10,10)으로 돌아간 뒤의 m이라 (15,15)에서 시작한다
            [MapPoint(15, 15), MapPoint(25, 15), MapPoint(25, 25), MapPoint(15, 25)],
            [MapPoint(0, 0), MapPoint(4, 0), MapPoint(4, 4)],
        ], rings)
    }

    func test붙은_음수와_쉼표를_나눈다() throws {
        XCTAssertEqual([[MapPoint(1, -2), MapPoint(3.5, -4), MapPoint(-1, 0)]], try parseSVGPath("M1-2L3.5,-4-1,0Z"))
    }

    /// SVG 문법대로 구분자 없이 붙은 숫자를 부호·두 번째 소수점에서 끊는다. 지수의 부호는 그 숫자 안이다.
    func test구분자_없이_붙은_숫자를_부호와_소수점에서_끊는다() throws {
        XCTAssertEqual([[MapPoint(0.5, 0.6), MapPoint(1, 1)]], try parseSVGPath("M.5.6L1 1Z"))
        XCTAssertEqual([[MapPoint(1, 2), MapPoint(3, 4)]], try parseSVGPath("M1+2L3 4Z"))
        XCTAssertEqual([[MapPoint(1, -2), MapPoint(3, 4)]], try parseSVGPath("M1-2L3 4Z"))
        XCTAssertEqual([[MapPoint(0.1, 20), MapPoint(1.5, -0.25)]], try parseSVGPath("M1e-1 2E1L1.5-.25Z"))
        XCTAssertEqual([[MapPoint(150, 0.5), MapPoint(1, 1)]], try parseSVGPath("M1.5e2.5L1 1Z"))
    }

    func test곡선_명령은_조용히_넘기지_않고_오류다() {
        for command in ["C", "c", "Q", "A", "S", "T"] {
            XCTAssertThrowsError(try parseSVGPath("M0 0\(command)1 1 2 2 3 3Z")) { error in
                XCTAssertEqual(RegionMapError.unsupportedCommand(Character(command)), error as? RegionMapError)
            }
        }
    }

    func test깨진_좌표는_오류다() {
        XCTAssertThrowsError(try parseSVGPath("M0 0L1Z"))
        XCTAssertThrowsError(try parseSVGPath("L1 1Z"))
        XCTAssertThrowsError(try parseSVGPath("1 1"))
        XCTAssertThrowsError(try parseSVGPath("M0 0L1 x Z"))
    }

    func test모르는_지역_코드와_viewBox_없음은_오류다() {
        XCTAssertThrowsError(try parseRegionMap(svg: #"<svg viewBox="0 0 1 1"><path data-region="UNKNOWN" d="M0 0L1 1Z"/></svg>"#)) {
            XCTAssertEqual(RegionMapError.unknownRegion("UNKNOWN"), $0 as? RegionMapError)
        }
        XCTAssertThrowsError(try parseRegionMap(svg: #"<svg><path data-region="SEOUL" d="M0 0L1 1Z"/></svg>"#)) {
            XCTAssertEqual(RegionMapError.missingViewBox, $0 as? RegionMapError)
        }
    }

    // MARK: 정본 SVG

    func test정본_25개_path가_전부_파싱되고_열_지역이_다_있다() throws {
        let map = try parseRegionMap(svg: Self.read(Self.canonicalPath))
        XCTAssertEqual(MapViewBox(minX: 0, minY: -8, width: 300, height: 335), map.viewBox)
        XCTAssertEqual(25, map.shapes.count)
        XCTAssertTrue(map.shapes.allSatisfy { !$0.rings.isEmpty && $0.rings.allSatisfy { $0.count >= 3 } })
        XCTAssertEqual(Set(Region.allCases), Set(map.areaShapes.map(\.region)))
        XCTAssertEqual(18, map.areaShapes.count)
        // 광역시 경계선 반복분은 광역시 조각만이다 (시안 `.metro-lines`)
        XCTAssertEqual(7, map.metroLineShapes.count)
        XCTAssertTrue(map.metroLineShapes.allSatisfy(\.isMetro))
        // 세종은 충남 묶음 (화면에 적지 않는 데이터 메모)
        XCTAssertEqual(.CHUNGNAM, map.areaShapes.first { $0.name == "세종특별자치시" }?.region)
    }

    func test지도_면을_누른_점이_그_지역이다() throws {
        let map = try parseRegionMap(svg: Self.read(Self.canonicalPath))
        // 점은 SVG 좌표다. 칩 자리(시안 좌표를 viewBox로 되돌린 값) 대부분이 자기 지역 위에 선다
        let cases: [(MapPoint, Region)] = [
            (MapPoint(189.5, 43.8), .GANGWON),
            (MapPoint(132.5, 43.8), .GYEONGGI),
            (MapPoint(112, 62), .SEOUL),          // 경기 안이지만 서울이 위에 있다
            (MapPoint(156.1, 110), .CHUNGBUK),
            (MapPoint(102.6, 133.2), .CHUNGNAM),
            (MapPoint(132, 133), .CHUNGNAM),      // 대전
            (MapPoint(122.8, 173.9), .JEONBUK),
            (MapPoint(106.1, 222.5), .JEONNAM),
            (MapPoint(205.3, 135.6), .GYEONGBUK),
            (MapPoint(184.2, 203.4), .GYEONGNAM),
            (MapPoint(92, 307), .JEJU),
        ]
        for (point, region) in cases {
            XCTAssertEqual(region, map.region(at: point), "\(point)")
        }
        XCTAssertNil(map.region(at: MapPoint(5, 5)))       // 바다
        XCTAssertNil(map.region(at: MapPoint(136, 307)))   // 제주 칩 자리는 섬 밖
    }

    /// 앱 번들 사본이 레포 정본과 바이트까지 같다 (2026-11-16 결정: 플랫폼별 사본 일치 테스트).
    /// 정본을 고치면 `cp docs/assets/region-map.svg ios/Accentury/Resources/region-map.svg`.
    func test앱_사본이_정본과_같다() throws {
        let canonical = try Data(contentsOf: URL(fileURLWithPath: Self.canonicalPath))
        let copy = try Data(contentsOf: URL(fileURLWithPath: Self.appCopyPath))
        XCTAssertEqual(canonical, copy)
    }

    // MARK: 결과 줄 (정본은 웹 regions.ts)

    func test결과_줄은_묶인_광역시를_적고_나머지는_이름만이다() {
        XCTAssertEqual([
            "서울", "경기 · 인천 포함", "강원", "충북", "충남 · 대전 포함", "전북", "전남 · 광주 포함",
            "경북 · 대구 포함", "경남 · 부산·울산 포함", "제주",
        ], Region.allCases.map(\.selectionLine))
        XCTAssertFalse(Region.allCases.contains { $0.selectionLine.contains("세종") })
        XCTAssertEqual("경남, 부산·울산 포함", Region.GYEONGNAM.chipAccessibilityLabel)
        XCTAssertEqual("서울", Region.SEOUL.chipAccessibilityLabel)
    }

    // MARK: 파일 자리

    private static var iosDirectory: URL {
        var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while directory.path != "/", directory.lastPathComponent != "ios" {
            directory = directory.deletingLastPathComponent()
        }
        return directory
    }

    private static var canonicalPath: String {
        iosDirectory.deletingLastPathComponent().appendingPathComponent("docs/assets/region-map.svg").path
    }

    private static var appCopyPath: String {
        iosDirectory.appendingPathComponent("Accentury/Resources/region-map.svg").path
    }

    private static func read(_ path: String) throws -> String {
        try String(contentsOfFile: path, encoding: .utf8)
    }
}
