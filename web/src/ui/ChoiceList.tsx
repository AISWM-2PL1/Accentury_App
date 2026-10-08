/**
 * 객관식 선택지 목록 (KAN-13에서 그리고 KAN-255에서 꺼냈다).
 *
 * 레벨테스트 어휘 문항과 단어 학습 치환 문항(W-3)이 카드·라디오·잠금 규칙을 같이 써야 해서
 * (KAN-255 AC) `VocabularyItemScreen`에서 이 목록만 옮겨 왔다. 문제 카드·제출 버튼은 두 화면의
 * 문구·흐름이 달라 각 화면에 남는다.
 *
 * 선택지는 네이티브 라디오(input type="radio")다. 진행바가 `<progress>`를 쓰는 것과 같은
 * 이유 — 단일 선택 보장·화살표 키 이동·radiogroup 의미론을 브라우저가 전부 주므로,
 * 버튼 배열에 aria를 손으로 채워 같은 것을 재현할 이유가 없다 (KAN-13 AC: 접근성 라벨).
 *
 * 정오 표시는 [ChoiceListProps.marks]가 있을 때만 그린다 (KAN-255 W-4). 레벨테스트는 정답을
 * 보이지 않으므로(KAN-13) marks를 넘기지 않고, 그때 DOM은 marks 도입 전과 같다 — 정오 클래스
 * 이름조차 나오지 않는다(`VocabularyItemScreen.test`가 그 클래스를 금지한다).
 */

import { haptic } from '../bridge/bridge'
import { CheckIcon, CrossIcon } from './icons'

export interface ChoiceListProps {
  /** 라디오 name. 한 화면 안의 그룹을 가르는 값이다 */
  name: string
  /** 그룹 이름이 될 요소의 id (문제 문구) */
  labelledBy: string
  choices: ReadonlyArray<{ choiceId: string; text: string }>
  selected: string | null
  /** 제출 중 잠금 — 요청이 나간 답과 화면의 답이 달라지는 순간을 만들지 않는다 */
  locked: boolean
  onSelect: (choiceId: string) => void
  /**
   * 제출 뒤 정오 표시 (KAN-255 W-4). 정답 보기는 'correct', 내가 고른 오답은 'wrong'.
   * 색만으로 가르지 않는다(NFR-US-03) — 서로 다른 아이콘(✓·✕)과 글자 라벨(「정답」·「내 답」)을 함께 단다.
   */
  marks?: Readonly<Record<string, 'correct' | 'wrong'>>
}

export function ChoiceList({ name, labelledBy, choices, selected, locked, onSelect, marks }: ChoiceListProps) {
  return (
    // 문제 문구가 곧 이 라디오 그룹의 이름이다 — 스크린 리더가 "그룹 진입"에서 문제를 읽는다
    <div className="choice-list" role="radiogroup" aria-labelledby={labelledBy}>
      {/* 정의의 choices 배열 순서 = 화면 순서. 정렬·섞기를 하지 않는 것이 요구사항이다 */}
      {choices.map((choice) => {
        const checked = selected === choice.choiceId
        const mark = marks?.[choice.choiceId]
        const classes = [
          'choice',
          checked ? 'choice--selected' : '',
          locked ? 'choice--locked' : '',
          mark !== undefined ? `choice--${mark}` : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <label key={choice.choiceId} className={classes}>
            <input
              className="choice__radio"
              type="radio"
              name={name}
              value={choice.choiceId}
              checked={checked}
              disabled={locked}
              // 객관식 선택은 가벼운 탭 햅틱 (KAN-258) — 고른 순간을 손끝으로도 알린다
              onChange={() => {
                haptic('tap')
                onSelect(choice.choiceId)
              }}
            />
            <span>{choice.text}</span>
            {/*
              고른 것을 색 말고도 알린다. 표식(라디오)을 눈에서 지우고 나면 선택/미선택의
              차이가 색상뿐인데, 두 상태의 명도 차이는 1.2 정도라 색각 이상에서는 구분이
              어렵다 (WCAG 1.4.1). 시안이 오른쪽에 아이콘을 두던 자리를 그대로 쓴다.
              정답이 아니라 "내가 고른 것" 표시라 정오 미노출(KAN-13)과는 무관하다.
            */}
            {/* 정오 표시가 있으면 그것이 고른 표시를 대신한다 — ✓가 둘이면 "고름"과 "정답"이 섞인다 */}
            {mark !== undefined ? (
              <span className={`choice__mark choice__mark--${mark}`}>
                {mark === 'correct' ? <CheckIcon /> : <CrossIcon />}
                <span>{mark === 'correct' ? '정답' : '내 답'}</span>
              </span>
            ) : (
              checked && (
                <span className="choice__check">
                  <CheckIcon />
                </span>
              )
            )}
          </label>
        )
      })}
    </div>
  )
}
