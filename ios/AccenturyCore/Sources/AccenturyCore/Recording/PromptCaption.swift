import Foundation

/// 대사 카드 위 캡션 — 감정 칩이 없는 레벨 테스트 문항에서 칩 자리를 대신하는 읽기 안내.
///
/// 예전 아트보드는 "3 / 10 · 이 문장을 읽어주세요"였지만 KAN-355 4단계부터 진행 표시(「억양 … 2 / 7」)가 카드 바로 위에 서서
/// 번호가 두 번 보였다 — 번호는 진행 표시가 맡고 여기는 안내만 남긴다. 시안 카드에는 캡션이 없지만 칩도 캡션도 없으면 무엇을
/// 하라는지 사라지므로 안내 문구는 둔다.
///
/// 안드로이드는 이 문구가 `RecordingScreen.kt`(Composable 파일) 안에 있지만 화면 요소가 아니라 문구 하나라서, 여기서는 화면 밖
/// 순수 계층에 둔다 — `PromptCaptionTests`가 그 문구를 고정한다.
public let promptCaption = "이 문장을 읽어주세요"

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
