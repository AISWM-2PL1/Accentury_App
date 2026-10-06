import AccenturyCore
import SwiftUI

/// 2열 그리드의 나열 순서 — 웹 `RegionSelectScreen.tsx`의 DISPLAY_ORDER, 안드로이드 `REGION_DISPLAY_ORDER`와 같다. 왼쪽 열이
/// 서해안 축, 오른쪽 열이 동해안 축이고 행 우선이라 VoiceOver 순서가 보이는 순서와 같다. ``Region`` 선언 순서(계약 표)는
/// 건드리지 않는다.
let regionDisplayOrder: [Region] = [
    .SEOUL, .GANGWON,
    .GYEONGGI, .CHUNGBUK,
    .JEONBUK, .CHUNGNAM,
    .JEONNAM, .GYEONGBUK,
    .JEJU, .GYEONGNAM,
]

/// 익명 모드의 출신 지역 선택 (KAN-270 7단계). 안드로이드 `auth/AnonymousRegionScreen.kt`의 이식본이다. 시작 게이트에서
/// 동의 화면 다음, 아직 지역이 없을 때 선다(``AccenturyCore/needsAnonymousRegion(region:)``). 동의 화면에서 무엇을
/// 골랐든 모두에게 묻는다 (KAN-274). 고른 값은
/// ``AccenturyCore/AnonymousVoiceConsentStore/saveRegion(_:)``으로 남고 세션 body `region`이 된다.
///
/// 규칙은 웹 지역 화면과 같다 — 기본 선택이 없고(그냥 [다음]을 누른 녹음이 엉뚱한 라벨로 쌓이지 않게) 건너뛰기도 없다.
/// 질문 문장은 ``ProfileScreen``의 지역 칸과 같다.
struct AnonymousRegionScreen: View {

    /// 고른 지역 코드(``AccenturyCore/Region`` rawValue)
    let onDone: (String) -> Void

    @State private var selected: Region?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Papercut.space6) {
                VStack(alignment: .leading, spacing: Papercut.space2) {
                    Text("어느 지역 말씨가 몸에 배어 있나요?")
                        .papercutType(.headline)
                        .foregroundColor(Papercut.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text("본인이 사용한다고 생각하는 억양의 지역을 골라주시면 됩니다. 결과에는 영향이 없어요.")
                        .papercutType(.bodySmall)
                        .foregroundColor(Papercut.muted)
                }

                LazyVGrid(columns: [GridItem(.flexible(), spacing: Papercut.space3), GridItem(.flexible(), spacing: Papercut.space3)],
                          spacing: Papercut.space3) {
                    ForEach(regionDisplayOrder, id: \.self) { region in
                        ChoiceButton(label: region.label, selected: selected == region) { selected = region }
                    }
                }
                .accessibilityElement(children: .contain)

                AccenturyButton(text: "다음", enabled: selected != nil, fillsWidth: true) {
                    if let selected { onDone(selected.rawValue) }
                }
                Text("이 정보는 억양 분석 모델을 다듬는 데만 써요")
                    .papercutType(.caption)
                    .foregroundColor(Papercut.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, Papercut.space6)
            .padding(.top, Papercut.screenPaddingTop)
            .padding(.bottom, Papercut.space8)
        }
        // 아래 WebView를 완전히 가린다 (VoiceConsentScreen과 같다).
        .background(Papercut.cream.ignoresSafeArea())
    }
}
