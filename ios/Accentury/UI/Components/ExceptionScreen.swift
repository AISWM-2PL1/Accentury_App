import SwiftUI
import UIKit

/// 예외 화면 서식 (KAN-355, 시안 s-15-session-gate·s-15-webview-failed). 세션 확인 실패·웹뷰 연결 실패·앱 업데이트 안내·로그인 확인
/// 실패가 같은 서식을 타고, 4단계 마이크 권한 두 화면이 같은 글자·아이콘 규칙의 변형으로 쓴다.
///
/// 앱바(``View/paperAppBar(onClose:closeEnabled:)``) **아래**에 서는 것을 전제로 한다 — 원 윗선이 앱바 아래 144, 곧 안전 영역 위에서
/// y=200에 앉는다. 가운데 정렬로 아이콘 원 112(선화 56) · 제목 Jua 30 · 설명 15 흐린 잉크가 서고, 그 아래가 슬롯 둘이다.
///
/// - ``content`` 본문 슬롯. 설명 아래 32에 선다. 예외 화면은 내용 너비 버튼(주 버튼 + 글자 버튼, 사이 8)을, 마이크 권한은 쓰임 목록
///   박스를 넣는다
/// - ``footer`` 하단 고정 슬롯. 화면 바닥(좌우 24·아래 32)에 붙는다. 마이크 권한의 주 버튼 자리다
///
/// 오류 화면은 뜰 때와 제목이 바뀔 때 제목·설명을 스크린 리더에 스스로 알린다 (``StatusBlock``의 오류 톤과 같은 판단).
struct ExceptionScreen<Content: View, Footer: View>: View {

    let systemImage: String
    let title: String
    var message: String?
    /// 뜨자마자 읽어 줄지. 오류 화면은 true, 안내 화면(마이크 권한)은 false다.
    var announces: Bool = true
    @ViewBuilder var content: () -> Content
    @ViewBuilder var footer: () -> Footer

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 0) {
                    ExceptionSymbol(systemImage: systemImage)
                    Text(title)
                        .papercutType(.titleLarge)
                        .foregroundColor(Papercut.ink)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .padding(.top, Papercut.space6)
                    if let message {
                        Text(message)
                            .papercutType(.bodySmall)
                            .foregroundColor(Papercut.muted)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, Papercut.space2)
                    }
                    VStack(spacing: Papercut.space2) { content() }
                        .padding(.top, Papercut.space8)
                }
                .frame(maxWidth: .infinity)
                .padding(.horizontal, Papercut.space6)
                .padding(.top, Papercut.exceptionContentTop)
                .padding(.bottom, Papercut.space8)
            }
            footer()
                .padding(.horizontal, Papercut.space6)
                .padding(.bottom, Papercut.space8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Papercut.cream.ignoresSafeArea())
        .onAppear { announce() }
        .onChange(of: title) { _ in announce() }
    }

    private func announce() {
        guard announces else { return }
        let text = message.map { "\(title). \($0)" } ?? title
        UIAccessibility.post(notification: .announcement, argument: text)
    }
}

extension ExceptionScreen where Footer == EmptyView {
    /// 하단 고정 버튼이 없는 예외 화면 (세션·웹뷰·로그인 확인 실패).
    init(systemImage: String, title: String, message: String? = nil, announces: Bool = true,
         @ViewBuilder content: @escaping () -> Content) {
        self.init(systemImage: systemImage, title: title, message: message, announces: announces,
                  content: content, footer: { EmptyView() })
    }
}

/// 예외 화면의 아이콘 원 (시안 `.p3-status-symbol`): 지름 112, 잉크 1 테두리, 그림자 없음, 잉크 선화 56. 원은 장식이라 읽지 않는다 —
/// 바로 아래 제목이 같은 말을 한다. 그림자를 그리는 ``HeroIcon``과 달리 떠 있는 종이가 아니라 종이에 그린 동그라미다.
private struct ExceptionSymbol: View {

    let systemImage: String

    var body: some View {
        Circle()
            .strokeBorder(Papercut.ink, lineWidth: Papercut.borderHairline)
            .overlay {
                Image(systemName: systemImage)
                    .font(.system(size: Papercut.heroIconGlyphSize * 0.8, weight: .light))
                    .frame(width: Papercut.heroIconGlyphSize, height: Papercut.heroIconGlyphSize)
                    .foregroundColor(Papercut.ink)
            }
            .frame(width: Papercut.heroIconSize, height: Papercut.heroIconSize)
            .accessibilityHidden(true)
    }
}
