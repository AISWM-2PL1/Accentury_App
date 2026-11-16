import AccenturyCore
import SwiftUI

/// 원형 녹음 버튼 (KAN-148, 형태는 KAN-355 시안 `.p2-record-button`). 안드로이드 `ui/components/RecordButton.kt`의
/// 이식본이다. 다른 버튼은 모두 모서리 6의 사각인데 녹음만 원형이라, 화면에서 눌러야 할 것이 무엇인지 모양만으로 읽힌다.
///
/// 지름 80의 paper 동그라미에 잉크 테두리 1을 두르고 그늘을 깐다. 누르면 다른 버튼과 같은 거리만큼 내려가 그늘을 덮는다.
///
/// 색으로는 상태를 말하지 않는다 (정본 §7). 녹음 중이라는 것은 **안쪽 도형**이 말한다 —
/// 대기는 마이크 선화, 녹음 중은 잉크 정사각형(정지의 관용 기호)이다. 여기에 둘레의 소리 원과
/// 접근성 라벨이 겹쳐 세 신호가 같은 것을 알린다.
///
/// 소리 원은 움직임 줄이기에서 그리지 않는다 (WCAG 2.3.3). 도형과 라벨은 그대로라 상태 정보는 잃지 않는다.
struct RecordButton: View {

    let accessibilityLabel: String
    var recording: Bool = false
    /// 녹음 중 청크 rms(원 스케일). 소리 원의 크기가 이 값을 따른다 (``AccenturyCore/soundRingLevel(rms:)``).
    var rms: Double = 0
    let action: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button {
            // 시작·정지 모두 가벼운 탭 (KAN-258). 결과의 성공·실패는 녹음 화면이 따로 낸다
            HapticPlayer.play(.tap)
            action()
        } label: {
            ZStack {
                if recording {
                    /*
                     * 정지는 아이콘 자산 없이 사각형 하나로 그린다 — 재생/정지의 관용 기호라
                     * 따로 설명하지 않아도 읽히고, 마이크에 사선을 그은 그림보다 "지금 누르면
                     * 멈춘다"가 분명하다. 시안 값(28·모서리 6) 그대로다.
                     */
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Papercut.ink)
                        .frame(width: 28, height: 28)
                } else {
                    Image(systemName: "mic")
                        .font(.system(size: 34, weight: .light))
                        .foregroundColor(Papercut.ink)
                }
            }
        }
        .buttonStyle(RecordButtonStyle(
            ringScale: recording && !reduceMotion ? soundRingScale(level: soundRingLevel(rms: rms)) : nil,
            reduceMotion: reduceMotion
        ))
        .accessibilityLabel(accessibilityLabel)
    }
}

/// 녹음 버튼의 면·테두리·눌림·소리 원.
private struct RecordButtonStyle: ButtonStyle {

    /// 소리 원의 배율. nil이면 원을 그리지 않는다(대기·움직임 줄이기).
    let ringScale: Double?
    /// 동작 줄이기면 눌림 이동이 없다 (``PaperButtonBody``와 같다).
    let reduceMotion: Bool

    func makeBody(configuration: Configuration) -> some View {
        let sink: CGFloat = configuration.isPressed && !reduceMotion ? 1 : 0

        return configuration.label
            .frame(width: Papercut.recordButtonSize, height: Papercut.recordButtonSize)
            .background(Circle().fill(Papercut.paper))
            .overlay(Circle().stroke(Papercut.ink, lineWidth: Papercut.borderHairline))
            // 소리 원은 본체 뒤에 둔다 — 앞에 두면 커지는 선이 아이콘 위를 지나간다.
            // 그늘(paperCircleShadow)보다 먼저 붙어야 본체와 같은 지름의 원으로 잡힌다.
            .background { if let ringScale { SoundRing(scale: ringScale) } }
            .contentShape(Circle())
            .offset(x: sink * Papercut.paperShadowX, y: sink * Papercut.paperShadowY)
            .paperCircleShadow()
            .animation(reduceMotion ? nil : .easeOut(duration: Papercut.Motion.press), value: configuration.isPressed)
    }
}

/// 녹음 중 버튼 둘레의 소리 원 (KAN-355, 움직임 타일 2). 선 2의 종이 그림자 색 원 하나가 버튼 테두리에서 시작해
/// 소리 크기를 따라 최대 1.35배까지 커지고, 값이 바뀔 때마다 150ms로 따라간다. 시간으로 도는 파문이 아니라
/// 사용자의 목소리가 움직이는 원이라, 말을 멈추면 버튼 테두리로 돌아온다.
///
/// 크기를 `scaleEffect`가 아니라 지름으로 바꾼다 — 확대하면 선 굵기도 같이 1.35배가 된다.
private struct SoundRing: View {

    let scale: Double

    var body: some View {
        Circle()
            .stroke(Papercut.paperShadow, lineWidth: Papercut.borderStrong)
            .frame(width: Papercut.recordButtonSize * scale, height: Papercut.recordButtonSize * scale)
            .animation(.linear(duration: Papercut.Motion.fast), value: scale)
            .accessibilityHidden(true)
    }
}
