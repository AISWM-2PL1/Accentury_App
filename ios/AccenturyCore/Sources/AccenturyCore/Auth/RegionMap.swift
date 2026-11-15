import Foundation

/*
 * 출신 지역 지도 (KAN-355 3단계, 시안 s-13-region-select-maponly). 경계 데이터는 레포 `docs/assets/region-map.svg`(정본,
 * 통계청 SGIS 2013 경계를 10개 지역으로 묶어 단순화)의 앱 번들 사본이다. 이 파일은 그 SVG를 읽어 지역별 다각형으로 바꾸고,
 * 지도 면을 누른 점이 어느 지역인지 판정한다. SwiftUI `Path`로 바꾸는 일은 앱 타깃이 한다 — 여기는 플랫폼 중립 점 목록까지다.
 *
 * 경계 path는 직선 명령뿐이다(정본은 M·L·Z). 곡선 명령이 들어오면 조용히 건너뛰지 않고 오류를 낸다 — 건너뛰면 지역 모양이
 * 소리 없이 찌그러진다.
 */

/// SVG 좌표의 점
public struct MapPoint: Equatable, Sendable {
    public let x: Double
    public let y: Double

    public init(_ x: Double, _ y: Double) {
        self.x = x
        self.y = y
    }
}

/// SVG `viewBox` (minX minY width height)
public struct MapViewBox: Equatable, Sendable {
    public let minX: Double
    public let minY: Double
    public let width: Double
    public let height: Double

    public init(minX: Double, minY: Double, width: Double, height: Double) {
        self.minX = minX
        self.minY = minY
        self.width = width
        self.height = height
    }
}

public enum RegionMapError: Error, Equatable {
    /// 받지 않는 path 명령(곡선 등)
    case unsupportedCommand(Character)
    /// 숫자 자리에 숫자가 아닌 것, 좌표 짝이 맞지 않음, 첫 명령이 M이 아님
    case malformedPath(String)
    /// 루트 `viewBox`가 없거나 숫자 넷이 아님
    case missingViewBox
    /// `data-region`이 ``Region`` 코드가 아님
    case unknownRegion(String)
}

/// 지역 하나의 경계 조각. 한 지역이 여러 조각이다(경남 = 경남·부산·울산, 경북 = 경북·대구·독도 …).
public struct RegionShape: Equatable, Sendable {
    public let region: Region
    /// `data-name` (예: 「부산광역시」). 화면에 쓰지 않는 데이터 메모다
    public let name: String
    /// 광역시·특별자치시 조각인가 (`data-metro="1"`). 지도는 이 조각의 경계를 옅은 선으로 한 번 더 긋는다
    public let isMetro: Bool
    /// 닫힌 고리들. 고리마다 첫 점으로 돌아가는 선은 생략돼 있다(Z)
    public let rings: [[MapPoint]]
}

/// 파싱한 지도 한 장
public struct RegionMap: Equatable, Sendable {
    public let viewBox: MapViewBox
    /// SVG에 적힌 순서(그리는 순서). 정본은 지역 면 18조각 다음에 광역시 경계선용 7조각을 한 번 더 싣는다
    public let shapes: [RegionShape]

    /// 지역 면(광역시 경계선 반복분을 뺀 앞쪽 조각들). 정본은 지역끼리 묶여 연속으로 나온다
    public var areaShapes: [RegionShape] {
        var seen = Set<String>()
        return shapes.filter { seen.insert("\($0.region.rawValue)/\($0.name)").inserted }
    }

    /// 광역시 경계를 옅게 다시 긋는 조각들 (시안 `.metro-lines`)
    public var metroLineShapes: [RegionShape] {
        var seen = Set<String>()
        return shapes.filter { !seen.insert("\($0.region.rawValue)/\($0.name)").inserted }
    }

    /// SVG 좌표의 점이 어느 지역 면 안인가. 나중에 그린 조각이 위에 있으므로 뒤에서부터 본다. 고리 판정은 짝홀 규칙이다
    /// (SVG `fill-rule` 기본값 nonzero와 정본 데이터에서 결과가 같다 — 겹치거나 구멍 난 고리가 없다).
    public func region(at point: MapPoint) -> Region? {
        for shape in areaShapes.reversed() where Self.contains(shape.rings, point) {
            return shape.region
        }
        return nil
    }

    static func contains(_ rings: [[MapPoint]], _ p: MapPoint) -> Bool {
        var inside = false
        for ring in rings where ring.count >= 3 {
            var j = ring.count - 1
            for i in ring.indices {
                let a = ring[i], b = ring[j]
                if (a.y > p.y) != (b.y > p.y), p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x {
                    inside.toggle()
                }
                j = i
            }
        }
        return inside
    }
}

/// SVG 문서 → ``RegionMap``. `<path>`마다 `data-region`·`data-name`·`data-metro`·`d`를 읽는다.
public func parseRegionMap(svg: String) throws -> RegionMap {
    guard let viewBoxText = attribute("viewBox", in: svg) else { throw RegionMapError.missingViewBox }
    let numbers = viewBoxText.split(whereSeparator: { $0 == " " || $0 == "," }).compactMap { Double($0) }
    guard numbers.count == 4 else { throw RegionMapError.missingViewBox }
    let viewBox = MapViewBox(minX: numbers[0], minY: numbers[1], width: numbers[2], height: numbers[3])

    var shapes: [RegionShape] = []
    var rest = svg[...]
    while let open = rest.range(of: "<path") {
        guard let close = rest[open.upperBound...].range(of: ">") else { break }
        let tag = String(rest[open.upperBound..<close.lowerBound])
        rest = rest[close.upperBound...]
        let code = attribute("data-region", in: tag) ?? ""
        guard let region = Region(rawValue: code) else { throw RegionMapError.unknownRegion(code) }
        shapes.append(RegionShape(
            region: region,
            name: attribute("data-name", in: tag) ?? "",
            isMetro: attribute("data-metro", in: tag) == "1",
            rings: try parseSVGPath(attribute("d", in: tag) ?? "")
        ))
    }
    return RegionMap(viewBox: viewBox, shapes: shapes)
}

/// `name="값"` 하나. 앞 글자가 공백이어야 한다 — `d`를 찾다가 `data-…`의 `d`에 걸리지 않게.
private func attribute(_ name: String, in text: String) -> String? {
    guard let start = text.range(of: " \(name)=\"") else { return nil }
    guard let end = text[start.upperBound...].firstIndex(of: "\"") else { return nil }
    return String(text[start.upperBound..<end])
}

/// SVG path `d` → 닫힌 고리 목록. 직선 명령 M·m·L·l·H·h·V·v·Z·z만 받는다(대문자 절대, 소문자 상대).
/// 명령 뒤 좌표가 여러 벌이면 SVG 규칙대로 같은 명령을 되풀이한다(M 뒤의 추가 좌표는 L). 그 밖의 명령은
/// ``RegionMapError/unsupportedCommand(_:)``다.
public func parseSVGPath(_ d: String) throws -> [[MapPoint]] {
    var rings: [[MapPoint]] = []
    var ring: [MapPoint] = []
    var current = MapPoint(0, 0)
    var start = MapPoint(0, 0)
    var command: Character?
    var numbers: [Double] = []

    func flush() throws {
        guard let command else {
            if !numbers.isEmpty { throw RegionMapError.malformedPath("명령 없는 좌표") }
            return
        }
        let relative = command.isLowercase
        switch command.uppercased() {
        case "M", "L":
            guard !numbers.isEmpty, numbers.count % 2 == 0 else { throw RegionMapError.malformedPath("\(command) 좌표 짝") }
            for pair in stride(from: 0, to: numbers.count, by: 2) {
                let p = relative
                    ? MapPoint(current.x + numbers[pair], current.y + numbers[pair + 1])
                    : MapPoint(numbers[pair], numbers[pair + 1])
                if command.uppercased() == "M", pair == 0 {
                    if ring.count > 1 { rings.append(ring) }
                    ring = [p]
                    start = p
                } else {
                    guard !ring.isEmpty else { throw RegionMapError.malformedPath("M 없이 시작") }
                    ring.append(p)
                }
                current = p
            }
        case "H", "V":
            guard !numbers.isEmpty, !ring.isEmpty else { throw RegionMapError.malformedPath("\(command) 좌표") }
            for value in numbers {
                let horizontal = command.uppercased() == "H"
                let p = horizontal
                    ? MapPoint(relative ? current.x + value : value, current.y)
                    : MapPoint(current.x, relative ? current.y + value : value)
                ring.append(p)
                current = p
            }
        case "Z":
            guard numbers.isEmpty else { throw RegionMapError.malformedPath("Z 뒤 좌표") }
            if ring.count > 1 { rings.append(ring) }
            ring = []
            current = start
        default:
            throw RegionMapError.unsupportedCommand(command)
        }
        numbers = []
    }

    var token = ""
    func endNumber() throws {
        guard !token.isEmpty else { return }
        guard let value = Double(token) else { throw RegionMapError.malformedPath("숫자 \(token)") }
        numbers.append(value)
        token = ""
    }

    for ch in d {
        if ch.isLetter, ch != "e", ch != "E" {
            try endNumber()
            try flush()
            command = ch
        } else if ch == " " || ch == "," || ch == "\n" || ch == "\t" {
            try endNumber()
        } else if ch == "-", !token.isEmpty, token.last != "e", token.last != "E" {
            // `10-5`처럼 붙은 음수는 새 숫자다
            try endNumber()
            token = "-"
        } else {
            token.append(ch)
        }
    }
    try endNumber()
    try flush()
    if ring.count > 1 { rings.append(ring) }
    return rings
}

extension Region {

    /// 지역 코드 묶음에 들어간 광역시 (결과 줄 「경남 · 부산·울산 포함」). **정본은 웹 `web/src/region/regions.ts`다**
    /// (2026-11-16 결정, KAN-347 7단계가 그쪽에 둔다) — 앱은 옮겨 쓴다. 웹에 아직 이 값이 없을 때(2026-11-16 origin/Dev)는
    /// KAN-355 티켓 문구를 따랐다. 세종은 충남 묶음에 들어가지만 화면에 적지 않는다(데이터 메모만, 지도 SVG의 `data-name`).
    public var includedMetros: String? {
        switch self {
        case .GYEONGGI: return "인천"
        case .CHUNGNAM: return "대전"
        case .JEONNAM: return "광주"
        case .GYEONGBUK: return "대구"
        case .GYEONGNAM: return "부산·울산"
        case .SEOUL, .GANGWON, .CHUNGBUK, .JEONBUK, .JEJU: return nil
        }
    }

    /// 고른 뒤 지도 아래 결과 줄. 묶인 광역시가 없으면 이름만이다.
    public var selectionLine: String {
        includedMetros.map { "\(label) · \($0) 포함" } ?? label
    }

    /// 칩을 스크린 리더가 읽는 이름 (시안 `aria-label` 「경남, 부산·울산 포함」).
    public var chipAccessibilityLabel: String {
        includedMetros.map { "\(label), \($0) 포함" } ?? label
    }
}
