import Foundation

/// OS 글자 배율 → 웹 루트 글자 px (KAN-332). 16 × 배율이고 상한 2.0(32px, WCAG 1.4.4 기준), 하한은 두지 않고 OS 값을 따른다.
///
/// 안드로이드는 `webTextZoom`(WebViewHost.kt)이 같은 식·상한을 textZoom(%)으로 든다 — textZoom은 루트 computed font-size를
/// 직접 바꾸지만 WKWebView는 Dynamic Type을 루트에 반영하지 않아 iOS는 이 값을 스크립트로 주입한다.
public func webRootFontPx(scale: Double) -> Double {
    16 * min(scale, 2)
}

/// 루트 글자 크기를 심고 `resize`를 보내는 주입 스크립트 (KAN-332). 웹 `main.tsx`가 `resize`마다 `syncLargeText()`로
/// 루트 크기를 다시 재서 16.5px을 넘으면 `html[data-large-text]`를 단다 — 글자 크기 변경은 브라우저가 알려 주지 않는다.
///
/// px는 소수 4자리에서 자르고 끝의 0을 지운다(17.6 → "17.6px", 32 → "32px"). `String(format:)`은 로케일을 받지 않으면
/// POSIX 형식이라 소수점이 쉼표로 바뀌지 않는다.
public func webRootFontScript(px: Double) -> String {
    var text = String(format: "%.4f", px)
    while text.hasSuffix("0") { text.removeLast() }
    if text.hasSuffix(".") { text.removeLast() }
    return "document.documentElement.style.fontSize='\(text)px';window.dispatchEvent(new Event('resize'));"
}
