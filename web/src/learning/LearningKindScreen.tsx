/**
 * 학습 종류 선택 L-1 (KAN-252). 앱 홈의 [학습] 카드가 `?screen=learn`으로 여는 화면이고, A-1·W-1의
 * [학습 종류로]도 여기로 돌아온다.
 *
 * 행은 단어 학습 세트 행(`.word-set-row`)을 그대로 쓴다 — 억양 학습이 주 선택지라 추천 행의 강조
 * (굵은 테두리·종이 그림자)를 입히고, 단어 학습은 같은 크기의 보통 행으로 둔다 (Primary 1개, ux-ui.md
 * Hick's law). 뒤로 버튼은 두지 않는다: 이 화면의 뒤로는 앱 홈으로 가는 네이티브 몫이다.
 */

export function LearningKindScreen({
  onIntonation,
  onWords,
}: {
  onIntonation: () => void
  onWords: () => void
}) {
  return (
    <main className="item-screen">
      <h1 className="type-title">어떤 학습을 할까요?</h1>
      <section className="word-level">
        <button type="button" className="word-set-row word-set-row--recommended" onClick={onIntonation}>
          <span className="intonation-row__text">
            <span className="type-body">억양 학습</span>
            <span className="type-caption intonation-row__topic">대사를 따라 말하고 억양 점수를 받아요</span>
          </span>
        </button>
        <button type="button" className="word-set-row" onClick={onWords}>
          <span className="intonation-row__text">
            <span className="type-body">단어 학습</span>
            <span className="type-caption intonation-row__topic">사투리 단어를 카드로 익히고 문제로 확인해요</span>
          </span>
        </button>
      </section>
    </main>
  )
}
