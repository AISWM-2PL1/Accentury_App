import AccenturyCore
import SwiftUI

/// 출신 지역 선택 화면 (KAN-355 3단계, 시안 s-13-region-select-maponly). 우리나라 지도 위 칩 10개 중 하나를 고른다 — 칩을 눌러도,
/// 지도 면을 눌러도 같다. 회원은 프로필 다음(``ProfileScreen``이 띄우고 [다음]에서 저장한다), 둘러보기·익명 빌드는 시작 게이트와
/// 재응시 직전(``AnonymousRegionScreen``)에서 같은 화면을 쓴다.
///
/// 규칙은 예전 2열 칩 화면과 같다 — 기본 선택이 없고(그냥 [다음]을 누른 녹음이 엉뚱한 라벨로 쌓이지 않게) 건너뛰기도 없다.
/// 지역 코드·요청 본문은 ``AccenturyCore/Region`` 그대로다.
///
/// 지도는 네이티브가 직접 그린다: 이 화면은 WebView가 아직 없는 자리(로그인 직후)에도 선다. 경계는 번들 `region-map.svg`
/// (레포 `docs/assets/` 정본의 사본)를 ``AccenturyCore/parseRegionMap(svg:)``로 읽은 것이다. 스크린 리더는 칩만 읽고 지도 면은 숨긴다.
struct RegionSelectScreen: View {

    let selected: Region?
    let onSelect: (Region) -> Void
    /// 저장이 나가 있다 — [다음]과 뒤로 가기를 막는다
    var busy: Bool = false
    /// 방금 실패한 저장의 안내 (회원, ``ProfileScreen``)
    var failure: AuthFailure?
    /// 왼쪽 가장자리 스와이프·VoiceOver 두 손가락 문지르기로 돌아갈 곳 (회원은 프로필). nil이면 돌아갈 곳이 없다
    var onBack: (() -> Void)?
    let onNext: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("어느 지역 말씨가 몸에 배어 있나요?")
                        .papercutType(.headline)
                        .foregroundColor(Papercut.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    Text("본인이 쓴다고 생각하는 억양의 지역을 골라 주세요")
                        .papercutType(.caption)
                        .foregroundColor(Papercut.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, Papercut.space2)

                    RegionMapBoard(selected: selected, onSelect: onSelect)
                        .padding(.top, Papercut.space3)

                    Group {
                        if let selected {
                            Text(selected.selectionLine)
                                .font(.custom(Papercut.juaFamily, fixedSize: RegionMapLayout.resultFontSize))
                                .foregroundColor(Papercut.ink)
                        } else {
                            Text("지도에서 지역을 눌러 주세요")
                                .papercutType(.body)
                                .foregroundColor(Papercut.muted)
                        }
                    }
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, minHeight: RegionMapLayout.resultLineHeight)
                    .padding(.top, Papercut.space4)
                    // 칩이 이미 이름과 선택 상태를 말한다 — 같은 말을 두 번 듣지 않게 결과 줄은 읽지 않는다.
                    .accessibilityHidden(true)

                    if let failure {
                        AuthFailureBlock(failure: failure, verb: "저장").padding(.top, Papercut.space4)
                    }
                }
                .padding(.horizontal, Papercut.space6)
                .padding(.top, Papercut.space2)
                .padding(.bottom, Papercut.space4)
            }

            // 하단 고정 (``ExceptionScreen``의 footer 자리와 같은 좌우 24·아래 32)
            VStack(spacing: Papercut.space3) {
                AccenturyButton(text: "다음", enabled: selected != nil && !busy, fillsWidth: true, trailingIcon: "arrow.right", action: onNext)
                Text("이 정보는 억양 분석 모델을 다듬는 데만 써요")
                    .papercutType(.caption)
                    .foregroundColor(Papercut.muted)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, Papercut.space6)
            .padding(.top, Papercut.space4)
            .padding(.bottom, Papercut.space8)
        }
        // 워드마크 앱바 (KAN-288 디자인 3). 아래 WebView를 완전히 가린다.
        .paperAppBar()
        .overlay(alignment: .leading) {
            if onBack != nil { edgeSwipeStrip }
        }
        .accessibilityAction(.escape) { back() }
    }

    /// 왼쪽 가장자리 스와이프 = 뒤로 (KAN-252 웹 화면의 가장자리 스와이프와 같은 몸짓). 화면 왼쪽 띠에서 시작해 오른쪽으로 끌면 돌아간다.
    private var edgeSwipeStrip: some View {
        Color.clear
            .frame(width: RegionMapLayout.edgeSwipeWidth)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: Papercut.space2).onEnded { drag in
                    if drag.translation.width > RegionMapLayout.edgeSwipeDistance,
                       abs(drag.translation.height) < drag.translation.width {
                        back()
                    }
                }
            )
            .accessibilityHidden(true)
    }

    private func back() {
        guard !busy else { return }
        onBack?()
    }
}

/// 지도 화면 값 한곳 (시안 s-13-region-select-maponly). 시안 좌표는 폭 342(390 - 좌우 24) × 높이 420 판 위의 px이고, 지도 SVG는 이 판에
/// 가로세로 따로 늘려 깐다(시안 `preserveAspectRatio="none"`). 화면 폭이 다르면 판 전체를 폭에 맞춰 같은 비율로 늘이거나 줄인다.
enum RegionMapLayout {
    static let board = CGSize(width: 342, height: 420)
    /// 칩 가운데 (시안 `--x`·`--y`). 서울은 수도권이 좁아 서쪽으로 빼고 연결선을 긋는다
    static let chipCenters: [Region: CGPoint] = [
        .SEOUL: CGPoint(x: 70, y: 87),
        .GYEONGGI: CGPoint(x: 151, y: 65),
        .GANGWON: CGPoint(x: 216, y: 65),
        .CHUNGBUK: CGPoint(x: 178, y: 148),
        .CHUNGNAM: CGPoint(x: 117, y: 177),
        .JEONBUK: CGPoint(x: 140, y: 228),
        .JEONNAM: CGPoint(x: 121, y: 289),
        .GYEONGBUK: CGPoint(x: 234, y: 180),
        .GYEONGNAM: CGPoint(x: 210, y: 265),
        .JEJU: CGPoint(x: 155, y: 395),
    ]
    /// 서울 칩 → 서울 면 연결선 (시안 `.region-connector` `M92 87 L128 87`, 흐린 잉크 1)
    static let seoulConnector = (from: CGPoint(x: 92, y: 87), to: CGPoint(x: 128, y: 87))
    /// 지역 묶음 윤곽 (시안 `feMorphology dilate 1.3` 잉크) — 면 아래에 두께 3으로 그어 바깥 1.5가 보인다
    static let outlineWidth: CGFloat = 3
    /// 지도 전체 그림자 (시안 `drop-shadow(3px 4px 0 #cfc5aa)`)
    static let shadowOffset = CGSize(width: 3, height: 4)
    /// 광역시 안쪽 경계 (시안 `.metro-lines` 종이 그림자색 0.75)
    static let metroLineWidth: CGFloat = 0.75
    /// 칩: 글자 상자 높이 28·좌우 8·Jua 14, 누르는 자리 44(위아래 8)·최소 폭 60 (시안 `.region-chip`)
    static let chipLabelHeight: CGFloat = 28
    static let chipFontSize: CGFloat = 14
    static let chipHitHeight: CGFloat = 44
    static let chipMinWidth: CGFloat = 60
    /// 결과 줄 Jua 18·줄 높이 28 (시안 `.region-selection`)
    static let resultFontSize: CGFloat = 18
    static let resultLineHeight: CGFloat = 28
    /// 출처 표기 글자 크기 (시안에 자리가 없어 지도 판 오른쪽 아래에 작게 둔다)
    static let sourceFontSize: CGFloat = 11
    /// 뒤로 가기 몸짓: 왼쪽 띠 폭과 끌어야 하는 거리
    static let edgeSwipeWidth: CGFloat = 20
    static let edgeSwipeDistance: CGFloat = 60
}

/// 번들 지도. 한 번만 읽는다. 읽지 못하면(번들 누락·파싱 오류) 지도 면 없이 칩만 서고 고르기는 그대로 된다 — 사본 일치와 파싱은
/// `RegionMapTests`(swift test)가 지킨다.
private let bundledRegionMap: RegionMap? = {
    guard let url = Bundle.main.url(forResource: "region-map", withExtension: "svg"),
          let svg = try? String(contentsOf: url, encoding: .utf8)
    else { return nil }
    return try? parseRegionMap(svg: svg)
}()

/// 지도 판: 지도 면(장식, 탭으로 고르기) + 서울 연결선 + 칩 10개(라디오 그룹) + 출처 표기.
private struct RegionMapBoard: View {

    let selected: Region?
    let onSelect: (Region) -> Void

    var body: some View {
        Color.clear
            .aspectRatio(RegionMapLayout.board.width / RegionMapLayout.board.height, contentMode: .fit)
            .overlay {
                GeometryReader { geo in
                    let scale = geo.size.width / RegionMapLayout.board.width
                    ZStack(alignment: .topLeading) {
                        if let map = bundledRegionMap {
                            RegionGeography(map: map, selected: selected)
                        }
                        Path { path in
                            path.move(to: scaled(RegionMapLayout.seoulConnector.from, scale))
                            path.addLine(to: scaled(RegionMapLayout.seoulConnector.to, scale))
                        }
                        .stroke(Papercut.muted, lineWidth: Papercut.borderHairline)
                        .accessibilityHidden(true)

                        // 칩 순서 = ``Region`` 선언 순서(기획표 순서)라 VoiceOver가 서울 → 제주로 읽는다.
                        ForEach(Region.allCases, id: \.self) { region in
                            RegionChip(region: region, selected: selected == region) { onSelect(region) }
                                .position(scaled(RegionMapLayout.chipCenters[region] ?? .zero, scale))
                        }
                    }
                    .frame(width: geo.size.width, height: geo.size.height)
                    // 지도 면 탭 = 그 지역 고르기. 판 전체에서 받고(칩 버튼이 먼저 가져간다) 누른 점은 Core가 지역으로 바꾼다.
                    .contentShape(Rectangle())
                    .gesture(SpatialTapGesture().onEnded { tap in
                        guard let map = bundledRegionMap else { return }
                        let point = MapPoint(
                            map.viewBox.minX + tap.location.x / geo.size.width * map.viewBox.width,
                            map.viewBox.minY + tap.location.y / geo.size.height * map.viewBox.height
                        )
                        if let region = map.region(at: point) {
                            HapticPlayer.play(.tap)
                            onSelect(region)
                        }
                    })
                }
            }
            .overlay(alignment: .bottomTrailing) {
                Text("행정구역 경계: 통계청 SGIS(2013)")
                    .font(.system(size: RegionMapLayout.sourceFontSize))
                    .foregroundColor(Papercut.muted)
            }
            // 칩 열 개가 하나만 고르는 묶음이다 (SwiftUI에는 라디오 역할이 없어 칩마다 `.isSelected`가 상태를 말한다).
            .accessibilityElement(children: .contain)
            .accessibilityLabel("출신 지역")
    }

    private func scaled(_ point: CGPoint, _ scale: CGFloat) -> CGPoint {
        CGPoint(x: point.x * scale, y: point.y * scale)
    }
}

/// 지도 면. 지역 묶음마다 잉크 윤곽 → 면 순서로 그리고(시안의 묶음별 `feMorphology` 윤곽), 광역시 안쪽 경계를 옅게 다시 긋는다.
/// 고른 지역은 벽돌로 칠한다(150ms 색 전환, 동작 줄이기면 바로). 장식이라 스크린 리더에서 숨긴다. 탭은 판(``RegionMapBoard``)이 받는다.
private struct RegionGeography: View {

    let map: RegionMap
    let selected: Region?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// 같은 지역이 이어지는 조각 묶음 (SVG 그리는 순서 그대로)
    private var groups: [[RegionShape]] {
        map.areaShapes.reduce(into: [[RegionShape]]()) { groups, shape in
            if groups.last?.first?.region == shape.region { groups[groups.count - 1].append(shape) } else { groups.append([shape]) }
        }
    }

    var body: some View {
        let groups = groups
        ZStack {
            ZStack {
                ForEach(map.areaShapes.indices, id: \.self) { index in
                    let shape = MapShape(rings: map.areaShapes[index].rings, viewBox: map.viewBox)
                    shape.fill(Papercut.paperShadow)
                    shape.stroke(Papercut.paperShadow, lineWidth: RegionMapLayout.outlineWidth)
                }
            }
            .offset(RegionMapLayout.shadowOffset)

            ForEach(groups.indices, id: \.self) { index in
                let group = groups[index]
                let fill = group[0].region == selected ? Papercut.point : Papercut.paper
                ZStack {
                    ForEach(group.indices, id: \.self) { piece in
                        MapShape(rings: group[piece].rings, viewBox: map.viewBox)
                            .stroke(Papercut.ink, lineWidth: RegionMapLayout.outlineWidth)
                    }
                    ForEach(group.indices, id: \.self) { piece in
                        MapShape(rings: group[piece].rings, viewBox: map.viewBox).fill(fill)
                    }
                }
                .animation(reduceMotion ? nil : .easeOut(duration: Papercut.Motion.fast), value: fill)
            }

            ForEach(map.metroLineShapes.indices, id: \.self) { index in
                MapShape(rings: map.metroLineShapes[index].rings, viewBox: map.viewBox)
                    .stroke(Papercut.paperShadow, lineWidth: RegionMapLayout.metroLineWidth)
            }
        }
        .accessibilityHidden(true)
    }
}

/// SVG 좌표의 고리들을 판 크기로 늘려 그린다 (가로세로 따로 — 시안 `preserveAspectRatio="none"`).
private struct MapShape: Shape {
    let rings: [[MapPoint]]
    let viewBox: MapViewBox

    func path(in rect: CGRect) -> Path {
        let sx = rect.width / viewBox.width
        let sy = rect.height / viewBox.height
        var path = Path()
        for ring in rings {
            path.addLines(ring.map { CGPoint(x: rect.minX + ($0.x - viewBox.minX) * sx, y: rect.minY + ($0.y - viewBox.minY) * sy) })
            path.closeSubpath()
        }
        return path
    }
}

/// 지역 칩 (시안 `.region-chip`): 종이 면·잉크 1 테두리·반경 4·Jua 14, 고르면 벽돌 면·종이 글자(테두리는 잉크 그대로).
private struct RegionChip: View {

    let region: Region
    let selected: Bool
    let action: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Papercut.radiusSM, style: .continuous)
        Button {
            HapticPlayer.play(.tap)
            action()
        } label: {
            Text(region.label)
                .font(.custom(Papercut.juaFamily, fixedSize: RegionMapLayout.chipFontSize))
                .foregroundColor(selected ? Papercut.paper : Papercut.ink)
                .lineLimit(1)
                .padding(.horizontal, Papercut.space2)
                .frame(height: RegionMapLayout.chipLabelHeight)
                .background(shape.fill(selected ? Papercut.point : Papercut.paper))
                .overlay(shape.strokeBorder(Papercut.ink, lineWidth: Papercut.borderHairline))
                .animation(reduceMotion ? nil : .easeOut(duration: Papercut.Motion.fast), value: selected)
                .frame(minWidth: RegionMapLayout.chipMinWidth, minHeight: RegionMapLayout.chipHitHeight)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(region.chipAccessibilityLabel)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// 둘러보기·익명 빌드의 출신 지역 (KAN-270 7단계, 지도는 KAN-355). 시작 게이트에서 동의 화면 다음, 아직 지역이 없을 때
/// (``AccenturyCore/needsAnonymousRegion(region:)``)와 재응시 직전에 선다. 동의 화면에서 무엇을 골랐든 모두에게 묻는다 (KAN-274).
/// 고른 값은 ``AccenturyCore/AnonymousVoiceConsentStore/saveRegion(_:)``으로 남고 세션 body `region`이 된다. 돌아갈 앞 화면이 없어
/// 뒤로 가기 몸짓은 없다(지금 동작 그대로).
struct AnonymousRegionScreen: View {

    /// 고른 지역 코드(``AccenturyCore/Region`` rawValue)
    let onDone: (String) -> Void

    @State private var selected: Region?

    var body: some View {
        RegionSelectScreen(selected: selected, onSelect: { selected = $0 }, onNext: {
            if let selected { onDone(selected.rawValue) }
        })
    }
}
