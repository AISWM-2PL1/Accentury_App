import SwiftUI

/// 대사 카드 (KAN-148, 형태는 KAN-161 2단계). 안드로이드 `ui/components/PromptCard.kt`의
/// 이식본이고 웹 `.prompt-card`와 같은 규격이다 — 어휘 문항(웹)과 녹음 화면(네이티브)이 번갈아
/// 나오므로 카드 크기·모서리·그림자가 다르면 전환마다 화면이 들썩인다.
///
/// 오려 낸 종이 카드다: 크림 면에 잉크 테두리 1.5를 두르고 그늘 한 겹을 오른쪽·아래에 깐다.
/// 카드와 배경이 같은 크림이라 카드를 세우는 것은 색이 아니라 테두리와 그늘이다.
///
/// 최소 높이를 ``Papercut/promptCardMinHeight``로 잡는 이유: 문항마다 글자 수가 달라도 카드가
/// 같은 크기여야 아래 요소가 제자리에 있는 것처럼 읽힌다.
///
/// ``caption``은 알약 배지가 아니라 카드 맨 위 캡션 한 줄이다 — 배지는 면을 하나 더 만드는데,
/// 카드가 이미 배경과 같은 크림이라 그 면이 카드 안에 또 카드를 그린 것처럼 보였다.
///
/// ``cue``는 위 원칙의 예외로 다시 둔 알약 칩이다 (KAN-283, 사용자 결정 2026-10-14). 감정 지시
/// ("부탁하는 느낌으로 말해주세요!")는 읽기 전에 말투를 먼저 정해야 쓸모가 있어서, 캡션처럼
/// 흐린 한 줄이 아니라 대사 위에 강조로 둔다. 면이 하나 더 생기는 비용보다 대사를 다 읽고 나서야
/// 말투를 알게 되는 비용이 크다고 봤다. nil이면 그리지 않는다. 색은 안드로이드 칩과 같은 값
/// (잉크 면 #1C1A17 + 크림 글자 #F3ECD9)이라 ``Papercut/ink``·``Papercut/cream``을 그대로 쓴다.
struct PromptCard: View {

    let caption: String
    let prompt: String
    /// 아트보드에는 없다. 목소리 점검처럼 아트보드가 없는 화면이 아직 쓴다.
    var supporting: String?
    /// 대사 위 감정 칩 (KAN-283). 레벨테스트에서 emotion이 있을 때만 온다.
    var cue: String? = nil

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Papercut.radiusXL, style: .continuous)

        return VStack(alignment: .leading, spacing: Papercut.space2) {
            Text(caption)
                .papercutType(.caption)
                .foregroundColor(Papercut.muted)
            if let cue {
                Text(cue)
                    .papercutType(.label)
                    .foregroundColor(Papercut.cream)
                    .padding(.horizontal, Papercut.space3)
                    .padding(.vertical, Papercut.space1)
                    .background(Capsule().fill(Papercut.ink))
            }
            Text(prompt)
                .papercutType(.headline)
                .foregroundColor(Papercut.ink)
                .fixedSize(horizontal: false, vertical: true)
            if let supporting {
                Text(supporting)
                    .papercutType(.label)
                    .foregroundColor(Papercut.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Papercut.promptCardPadding)
        .frame(minHeight: Papercut.promptCardMinHeight, alignment: .center)
        .background(shape.fill(Papercut.cream))
        .overlay(shape.stroke(Papercut.ink, lineWidth: Papercut.borderRegular))
        .paperShadow(cornerRadius: Papercut.radiusXL)
    }
}
