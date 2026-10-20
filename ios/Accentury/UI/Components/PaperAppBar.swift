import SwiftUI

/// 앱바 — 왼쪽 「Accentury」 워드마크(Jua 20), `onClose`가 있으면 오른쪽에 48pt 닫기 ✕ (KAN-288 디자인 3, 시안 `.appbar`·
/// `.close`, HIG 수정: 닫기 48×48). 안드로이드 `ui/components/PaperScreen.kt`의 `PaperAppBar` 이식본이다 — 웹 전 화면이
/// 같은 앱바를 그리므로(4단계 `main.tsx`) 네이티브 화면만 빠지면 화면 경계에서 위쪽 줄이 튄다.
///
/// 워드마크는 브랜드 표기라 머리말(header) 특성을 주지 않는다. 높이 48 = 위 8 + 48 + 아래 8이 예전 위 여백 64
/// (``Papercut/screenPaddingTop``)와 같아, 앱바를 얹어도 본문 시작 높이는 그대로다.
struct PaperAppBar: View {

    var onClose: (() -> Void)?
    /// 제출을 기다리는 녹음 화면처럼 ✕를 잠시 막을 때 (안드로이드 `closeEnabled`)
    var closeEnabled: Bool = true

    var body: some View {
        HStack(spacing: 0) {
            Text("Accentury")
                .papercutType(.title)
                .foregroundColor(Papercut.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let onClose {
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 20, weight: .regular))
                        .foregroundColor(Papercut.ink)
                        .frame(width: Papercut.touchTargetMin, height: Papercut.touchTargetMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!closeEnabled)
                .opacity(closeEnabled ? 1 : Papercut.opacityDisabled)
                .accessibilityLabel("닫기")
            }
        }
        .frame(height: Papercut.touchTargetMin)
    }
}

extension View {
    /// 화면 위에 앱바를 얹는다 — 안드로이드 `PaperScreen`이 화면마다 그리는 앱바 줄 자리(좌 24·우 12·위 8). 배경도 함께 깐다:
    /// 이 화면들은 WebView를 덮는 자리라 앱바 줄이 비치면 아래 웹 화면이 드러난다.
    func paperAppBar(onClose: (() -> Void)? = nil, closeEnabled: Bool = true) -> some View {
        VStack(spacing: 0) {
            PaperAppBar(onClose: onClose, closeEnabled: closeEnabled)
                .padding(.top, Papercut.space2)
                .padding(.leading, Papercut.space6)
                .padding(.trailing, Papercut.space3)
            self.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Papercut.cream.ignoresSafeArea())
    }
}
