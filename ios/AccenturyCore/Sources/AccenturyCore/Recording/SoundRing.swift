import Foundation

/// 녹음 버튼 둘레 소리 원의 최대 배율 (KAN-355, 움직임 타일 2). 원은 버튼 테두리(1.0)에서 시작해 이 값까지 커진다.
public let soundRingMaxScale = 1.35

/// 녹음 중 청크 rms(원 스케일, ``RecordingUiState/Recording/rms``)를 소리 원의 0..1 크기로 (KAN-355).
///
/// **로그 스케일**이고 바닥이 무음 문턱(``AudioQuality/quietRmsThreshold``)이다 — 문턱 아래(숨소리·방 소음)는 0이라 원이
/// 버튼 테두리에 붙어 있고, 문턱부터 전체 스케일까지를 0..1로 편다. 선형으로 펴면 일상 발화(rms 수백~수천)가 전체 스케일
/// 32768 대비 바닥에 붙어 말해도 원이 거의 안 움직인다.
public func soundRingLevel(rms: Double) -> Double {
    let floor = AudioQuality.quietRmsThreshold
    guard rms > floor else { return 0 }
    return min(log10(rms / floor) / log10(AudioQuality.fullScale / floor), 1)
}

/// 0..1 크기를 원의 배율로 (KAN-355). 0이면 1.0(버튼 테두리), 1이면 ``soundRingMaxScale``이고 범위 밖 값은 끝으로 자른다 —
/// 원이 버튼 안으로 파고들거나 1.35배를 넘으면 안 된다(AC).
public func soundRingScale(level: Double) -> Double {
    1 + (soundRingMaxScale - 1) * min(max(level, 0), 1)
}
