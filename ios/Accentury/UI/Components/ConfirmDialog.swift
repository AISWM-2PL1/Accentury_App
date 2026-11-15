import SwiftUI

/// 확인 대화상자의 버튼 하나 (KAN-355).
struct ConfirmDialogButton {
    let text: String
    var variant: ButtonVariant = .secondary
    var leadingIcon: String?
    var trailingIcon: String?
    let action: () -> Void
}

/// 공용 확인 대화상자 (KAN-355, 시안 s-11-confirm-logout·s-11-confirm-withdraw·s-06-confirm-quit). 시스템 `.alert`를 대신한다.
///
/// 덮개(종이 그림자 단색 0.6) 위 가운데에 폭 320·모서리 16·paper 면·잉크 1 테두리 상자를 세우고, 제목(Jua 26)·본문·바닥 버튼 둘을
/// 가로로 나란히 둔다. 왼쪽은 물러서는 쪽([취소]·[계속하기]), 오른쪽은 확인 쪽이다.
///
/// 물러서는 길은 셋이 모두 왼쪽 버튼과 같다 — 왼쪽 버튼, 상자 바깥 탭, VoiceOver 두 손가락 문지르기(escape). 시스템 `.alert`의
/// cancel 역할이 하던 일이다. ``inProgress``이면 두 버튼이 비활성이고 바깥 탭·escape도 먹지 않는다(요청 중에 창이 닫히면 결과를
/// 받을 자리가 사라진다).
///
/// 띄우는 쪽은 ``View/confirmDialog(isPresented:dialog:)``다. 이 뷰는 화면 전체를 차지하는 덮개까지 그린다.
struct ConfirmDialog<Footer: View>: View {

    let title: String
    /// 본문 문단. 한 줄이 한 문단이다 (탈퇴 창은 셋).
    let message: [String]
    let cancel: ConfirmDialogButton
    let confirm: ConfirmDialogButton
    var inProgress: Bool = false
    /// 본문 아래·버튼 위 한 줄 (탈퇴 실패 안내 같은 오류 문구 자리).
    @ViewBuilder var footer: () -> Footer

    var body: some View {
        ZStack {
            Papercut.paperShadow
                .opacity(Papercut.dialogScrimOpacity)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture(perform: dismiss)
                // 덮개는 만질 수만 있고 읽을 것은 없다. 바깥 탭과 같은 일은 escape가 한다.
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .papercutType(.headline)
                    .foregroundColor(Papercut.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)

                VStack(alignment: .leading, spacing: Papercut.dialogParagraphSpacing) {
                    ForEach(Array(message.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .papercutType(.caption)
                            .foregroundColor(Papercut.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    footer()
                }
                .padding(.top, Papercut.space4)

                HStack(spacing: Papercut.space3) {
                    dialogButton(cancel)
                    dialogButton(confirm)
                }
                .padding(.top, Papercut.space6)
            }
            .padding(Papercut.dialogPadding)
            .frame(maxWidth: Papercut.dialogWidth, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: Papercut.radiusSheet, style: .continuous).fill(Papercut.paper))
            .overlay(
                RoundedRectangle(cornerRadius: Papercut.radiusSheet, style: .continuous)
                    .strokeBorder(Papercut.ink, lineWidth: Papercut.borderHairline)
            )
            .padding(.horizontal, Papercut.space6)
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isModal)
            .accessibilityAction(.escape, dismiss)
        }
    }

    private func dialogButton(_ button: ConfirmDialogButton) -> some View {
        AccenturyButton(
            text: button.text,
            variant: button.variant,
            enabled: !inProgress,
            fillsWidth: true,
            leadingIcon: button.leadingIcon,
            trailingIcon: button.trailingIcon,
            action: button.action
        )
    }

    private func dismiss() {
        guard !inProgress else { return }
        cancel.action()
    }
}

extension ConfirmDialog where Footer == EmptyView {
    init(title: String, message: [String], cancel: ConfirmDialogButton, confirm: ConfirmDialogButton, inProgress: Bool = false) {
        self.init(title: title, message: message, cancel: cancel, confirm: confirm, inProgress: inProgress, footer: { EmptyView() })
    }
}

extension View {
    /// 화면 위에 ``ConfirmDialog``를 띄운다 (KAN-355). 닫는 것은 대화상자 버튼의 동작이 `isPresented`를 내려서 한다 —
    /// 바깥 탭·escape도 왼쪽 버튼 동작을 부르므로 그 동작이 닫기를 맡아야 한다.
    ///
    /// 덮개와 상자가 함께 150ms 페이드로 들고 난다. 동작 줄이기면 바로 끝 상태다.
    func confirmDialog<Dialog: View>(isPresented: Bool, @ViewBuilder dialog: @escaping () -> Dialog) -> some View {
        modifier(ConfirmDialogPresenter(isPresented: isPresented, dialog: dialog))
    }
}

private struct ConfirmDialogPresenter<Dialog: View>: ViewModifier {

    let isPresented: Bool
    let dialog: () -> Dialog

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay {
                if isPresented {
                    dialog().transition(.opacity)
                }
            }
            .animation(reduceMotion ? nil : .easeOut(duration: Papercut.Motion.fast), value: isPresented)
    }
}
