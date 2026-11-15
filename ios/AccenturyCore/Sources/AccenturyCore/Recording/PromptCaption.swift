import Foundation

/// 대사 카드 위 캡션. 아트보드는 "3 / 10 · 이 문장을 읽어주세요"다(10문항 시절 시안이라 숫자는
/// 예시, 분모는 정의가 주는 문항 수로 현재 7이다. KAN-261) — 진행 도트 아래 캡션이
/// 이미 같은 숫자를 말하지만 두 줄이 화면 위아래로 떨어져 있어, 대사 바로 위에 한 번 더
/// 있는 편이 "지금 읽을 것은 이것"으로 읽힌다.
///
/// 번호를 모르는 경우(구버전 웹이 문항 수를 안 실어 보냈다)에는 안내만 남긴다. `0 / 0 ·`으로
/// 시작하는 줄은 숫자가 있는 것보다 나쁘다 — 사용자가 자기가 몇 번째인지 잘못 읽는다.
///
/// 안드로이드는 이 함수가 `RecordingScreen.kt`(Composable 파일) 안에 있지만 화면 요소가 아니라
/// 갈림 하나라서, 여기서는 화면 밖 순수 계층에 둔다 — `PromptCaptionTest`가 보는 것도 그 갈림이다.
public func promptCaption(questionIndex: Int, totalQuestions: Int) -> String {
    if questionIndex > 0 && totalQuestions > 0 {
        return "\(questionIndex) / \(totalQuestions) · 이 문장을 읽어주세요"
    }
    return "이 문장을 읽어주세요"
}

/// 대사 아래 감정 칩 문구 (KAN-283, 문구는 KAN-355 시안 「(감정) 느낌으로 말해 주세요」 — 띄어쓰기, 느낌표 없음).
/// 정의의 emotion이 없거나 공백뿐이면 nil — 칩 없이 그린다. "  느낌으로 말해 주세요"처럼 빈 자리가 남은 칩은 없는 것보다 나쁘다.
public func emotionCue(_ emotion: String?) -> String? {
    guard let trimmed = emotion?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
    return "\(trimmed) 느낌으로 말해 주세요"
}

/// 대사 카드 한 줄에 Jua 30으로 들어가는 글자 수 (KAN-355). 카드 안 폭(390 기준 화면 302)을 한글 한 자 폭 30으로 나눈 값이다.
public let promptLineCapacity = 10

/// 대사가 Jua 30으로 3줄 이상이 되는가 (KAN-355, 시안 기준). 그렇다면 대사를 26으로 줄인다 — 레벨 테스트의 긴 문항
/// (「처마가 길게 뻗어서 …」 37자)이 30으로는 4줄이라 곡선 카드를 화면 밖으로 민다.
///
/// 글자 수로 가늠한다. 실제 줄 수는 낱말 단위 줄바꿈과 기기 폭에 달려 있지만, 갈림은 「두 줄에 들어가는가」 하나라
/// 두 줄 분량(``promptLineCapacity`` × 2)을 넘으면 긴 대사로 본다. 넘쳐도 카드가 늘어날 뿐 잘리지는 않는다.
public func isLongPrompt(_ prompt: String) -> Bool {
    prompt.trimmingCharacters(in: .whitespacesAndNewlines).count > promptLineCapacity * 2
}
