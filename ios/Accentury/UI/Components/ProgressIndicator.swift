import SwiftUI

/// 도트 하나의 상태. 안드로이드 `ProgressDotState`의 이식본이다.
enum ProgressDotState: Equatable {
    case done
    case current
    case todo
}

/// 몇 번째 칸이 어떤 상태인가. 계산을 화면에서 떼어 둔 이유는 경계다 — `position == current`가
/// 현재 칸이고 그보다 앞이 완료인데, 부등호를 한 칸 잘못 쓰면 진행이 통째로 밀린다. 화면에서는
/// "진행이 한 칸 밀렸다"로만 드러나 원인을 찾기 어려운 종류라 테스트가 경계를 고정한다
/// (`ProgressDotStateTests`, 안드로이드 `ui/ProgressDotStateTest.kt`).
func progressDotState(position: Int, current: Int) -> ProgressDotState {
    if position < current { return .done }
    if position == current { return .current }
    return .todo
}

/// 진행 표시가 세는 것 (KAN-355). 스크린 리더 문장의 단위만 갈린다.
enum ProgressUnit: Equatable {
    /// 레벨 테스트 — 7문항 전체 번호
    case items
    /// 억양 학습 — 카드의 대사 수
    case lines
}

/// 진행 표시를 스크린 리더가 한 번에 읽을 문장 (KAN-355, 시안 `aria-label`). 「억양 · 7문항 중 1번째」 꼴이다 — 눈에 보이는
/// 「억양」·「1 / 7」을 그대로 읽으면 「일 슬래시 칠」이 되어 몇 번째인지가 귀에 안 남는다.
func progressAccessibilityLabel(label: String, current: Int, total: Int, unit: ProgressUnit) -> String {
    switch unit {
    case .items: return "\(label) · \(total)문항 중 \(current)번째"
    case .lines: return "\(label) · 대사 \(total)개 중 \(current)번째"
    }
}

/// 진행 표시 (KAN-148, 형태는 KAN-355 시안 s-06·s-17). 위 줄 왼쪽에 라벨 「억양」, 오른쪽에 「1 / 7」(둘 다 캡션 13 흐린 잉크),
/// 그 아래 8 띄워 알약 칸 줄(높이 8·간격 6)이다. 숫자와 칸을 한 덩어리로 묶는다 — 떨어져 있으면 한쪽만 고쳐 어긋나는 날이 온다.
///
/// 칸 색은 시안 값이다: 지난 칸 벽돌(``Papercut/point``), 지금 칸 종이 그림자 면에 왼쪽 절반 벽돌, 남은 칸 종이 그림자. 테두리는 없다.
///
/// ``current``가 1부터 시작하는 건 호출자 몫이자 의도다 — 첫 문항을 0/7로 보이면 아직
/// 시작도 안 한 느낌이라 이탈이 는다 (`ux-ui.md` §3 Goal-Gradient).
struct ProgressIndicator: View {

    let current: Int
    let total: Int
    var unit: ProgressUnit = .items
    var label: String = "억양"

    var body: some View {
        VStack(spacing: Papercut.space2) {
            HStack {
                Text(label)
                Spacer(minLength: Papercut.space3)
                Text("\(current) / \(total)")
            }
            .papercutType(.caption)
            .foregroundColor(Papercut.muted)

            HStack(spacing: progressDotGap) {
                ForEach(0..<max(total, 0), id: \.self) { index in
                    dot(progressDotState(position: index + 1, current: current))
                }
            }
        }
        .frame(maxWidth: .infinity)
        // 줄 전체를 한 번만 읽는다 — 칸마다, 라벨·숫자마다 읽히면 같은 정보를 칸 수만큼 되풀이한다.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(progressAccessibilityLabel(label: label, current: current, total: total, unit: unit))
    }

    private func dot(_ state: ProgressDotState) -> some View {
        Capsule()
            .fill(state == .done ? Papercut.point : Papercut.paperShadow)
            // 지금 칸만 왼쪽 절반이 벽돌이다. 바깥 clipShape가 알약 모양으로 잘라 준다(시안 `::before` inset 0 50% 0 0).
            .overlay(alignment: .leading) {
                if state == .current {
                    GeometryReader { proxy in
                        Papercut.point.frame(width: proxy.size.width / 2)
                    }
                }
            }
            .clipShape(Capsule())
            .frame(height: Papercut.progressDotHeight)
    }

    /// 칸 사이 (시안 `.progress-indicator__dots` gap 6). 4·8 눈금 밖 값이라 이 화면 상수로 둔다.
    private let progressDotGap: CGFloat = 6
}
