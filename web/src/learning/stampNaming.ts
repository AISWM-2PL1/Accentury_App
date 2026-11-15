/**
 * 스탬프 이름·순서 규칙 (KAN-347 3-2, 확정된 결정 2026-11-16). 출석 달력(2단계)·사투리 여행 지도(3단계)·결과 화면(4·5단계)이
 * 모두 이 파일 하나를 쓴다 — 화면마다 따로 세면 같은 스탬프가 곳마다 다른 번호로 불린다.
 *
 * - 코스 = 서버 `level`(1~5). 단어 세트와 억양 코스가 같은 `level`이면 같은 코스의 스탬프다.
 * - 이름: 「단어 학습 n」「억양 학습 n」. n은 코스 안 그 종류의 순번(같은 `level` 안 `seq` 오름차순 1부터). 서버 `title`
 *   (「코스 N 억양 M」)은 쓰지 않는다.
 * - 코스 안 순서: 단어 1 · 억양 1 · 단어 2 · 억양 2 · … 처럼 번갈아 두고 단어가 먼저, 남는 쪽은 맨 뒤.
 */

export type StampKind = 'word' | 'intonation'

/** 목록 API(`WordSetSummary`·`IntonationCourseSummary`)에서 필요한 세 값 */
export interface StampSource {
  id: string
  level: number
  seq: number
}

export interface Stamp {
  kind: StampKind
  id: string
  /** 코스 번호 (서버 `level`) */
  course: number
  /** 코스 안 그 종류의 순번, 1부터 */
  n: number
}

/** 예상 시간 — 앱 상수다(3-2). 서버는 시간을 주지 않는다 */
export const STAMP_MINUTES: Record<StampKind, string> = { word: '약 1분', intonation: '약 3분' }

/** 단위 표기 「3문항 · 약 1분」「대사 3개 · 약 3분」. 「n장」은 쓰지 않는다 */
export function stampUnit(kind: StampKind): string {
  return `${kind === 'word' ? '3문항' : '대사 3개'} · ${STAMP_MINUTES[kind]}`
}

/** 「단어 학습 n」「억양 학습 n」. n을 모르면(지금 발행본에 없는 옛 세트) 번호 없이 종류만 */
export function stampName(kind: StampKind, n?: number): string {
  const base = kind === 'word' ? '단어 학습' : '억양 학습'
  return n === undefined ? base : `${base} ${n}`
}

/** 코스 번호 → 그 코스의 스탬프를 순서대로. 코스 번호 오름차순으로 넣는다 */
export function courseStamps(words: StampSource[], intonations: StampSource[]): Map<number, Stamp[]> {
  const byCourse = new Map<number, { word: Stamp[]; intonation: Stamp[] }>()
  const add = (kind: StampKind, sources: StampSource[]) => {
    for (const source of [...sources].sort((a, b) => a.seq - b.seq)) {
      const course = byCourse.get(source.level) ?? { word: [], intonation: [] }
      byCourse.set(source.level, course)
      course[kind].push({ kind, id: source.id, course: source.level, n: course[kind].length + 1 })
    }
  }
  add('word', words)
  add('intonation', intonations)

  const result = new Map<number, Stamp[]>()
  for (const level of [...byCourse.keys()].sort((a, b) => a - b)) {
    const { word, intonation } = byCourse.get(level)!
    const ordered: Stamp[] = []
    for (let i = 0; i < Math.max(word.length, intonation.length); i++) {
      if (i < word.length) ordered.push(word[i])
      if (i < intonation.length) ordered.push(intonation[i])
    }
    result.set(level, ordered)
  }
  return result
}

/** 종류와 id로 스탬프를 찾는다. 출석 항목처럼 id만 들고 온 값에 이름을 붙일 때 쓴다 */
export function findStamp(courses: Map<number, Stamp[]>, kind: StampKind, id: string): Stamp | undefined {
  for (const stamps of courses.values()) {
    const found = stamps.find((stamp) => stamp.kind === kind && stamp.id === id)
    if (found !== undefined) return found
  }
  return undefined
}
