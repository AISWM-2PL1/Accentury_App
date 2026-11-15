import AccenturyCore
import SwiftUI

/// 대사 카드 (KAN-148, 형태는 KAN-355 시안 s-05·s-06·s-17). 안드로이드 `ui/components/PromptCard.kt`의
/// 이식본이고 웹 `.prompt-card`와 같은 규격이다 — 어휘 문항(웹)과 녹음 화면(네이티브)이 번갈아
/// 나오므로 카드 크기·모서리·그림자가 다르면 전환마다 화면이 들썩인다.
///
/// 오려 낸 종이 카드다: paper 면에 잉크 테두리 1을 두르고 그늘 한 겹을 오른쪽·아래에 깐다 (시안 `.p2-record .prompt-card`).
/// 최소 높이를 ``Papercut/promptCardMinHeight``로 잡는 이유: 문항마다 글자 수가 달라도 카드가
/// 같은 크기여야 아래 요소가 제자리에 있는 것처럼 읽힌다.
///
/// 위에서부터 ``caption``(흐린 한 줄) · 대사 · ``cue``(칩) 순이다. 칩은 대사 **아래**다 (KAN-355, 2026-10-14의 「대사 위」를 시안이
/// 바꿨다) — 목소리 점검만 시안이 칩을 대사 위에 둬서 ``cueAbovePrompt``로 받는다.
/// - 레벨 테스트: 대사 + 감정 칩(KAN-283 「… 느낌으로 말해 주세요」). 감정이 없는 문항만 캡션 줄이 대신 선다
/// - 억양 학습: 「표준어 · …」 캡션 + 대사 + 「사투리로 따라 말해 보세요」 칩
/// - 목소리 점검: 「목소리 점검」 캡션 + 「편하게 말해 주세요」 칩 + 대사
///
/// 대사는 Jua 30이고, 30으로 3줄 이상이 될 긴 대사(``AccenturyCore/isLongPrompt(_:)``)만 26이다.
/// 칩은 잉크 면·크림 글자·모서리 4다 — 긴 문구는 칩 안에서 줄을 바꾼다(한 줄로 고집하면 카드 폭을 넘어 잘린다).
struct PromptCard: View {

    var caption: String?
    let prompt: String
    var cue: String?
    var cueAbovePrompt: Bool = false

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Papercut.radiusXL, style: .continuous)

        return VStack(alignment: .leading, spacing: promptCardSpacing) {
            if let caption {
                Text(caption)
                    .papercutType(.caption)
                    .foregroundColor(Papercut.muted)
            }
            if cueAbovePrompt { cueChip }
            Text(prompt)
                .papercutType(isLongPrompt(prompt) ? .headline : .titleLarge)
                .foregroundColor(Papercut.ink)
                .fixedSize(horizontal: false, vertical: true)
            if !cueAbovePrompt { cueChip }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, promptCardPaddingX)
        .padding(.vertical, promptCardPaddingY)
        .frame(minHeight: Papercut.promptCardMinHeight, alignment: .center)
        .background(shape.fill(Papercut.paper))
        .overlay(shape.strokeBorder(Papercut.ink, lineWidth: Papercut.borderHairline))
        .paperShadow(cornerRadius: Papercut.radiusXL)
    }

    @ViewBuilder
    private var cueChip: some View {
        if let cue {
            Text(cue)
                .papercutType(.caption)
                .foregroundColor(Papercut.cream)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, Papercut.space2)
                .padding(.vertical, Papercut.space1)
                .background(RoundedRectangle(cornerRadius: Papercut.radiusSM).fill(Papercut.ink))
        }
    }

    /// 시안 `.p2-record .prompt-card`: 안쪽 여백 위아래 18 · 좌우 20, 요소 사이 10.
    private let promptCardPaddingX: CGFloat = 20
    private let promptCardPaddingY: CGFloat = 18
    private let promptCardSpacing: CGFloat = 10
}
