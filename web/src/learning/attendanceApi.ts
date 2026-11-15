/**
 * 월별 출석 API 클라이언트 (KAN-347 2-3) — 서버 KAN-314의 `GET /v0/learning/attendance?year=&month=`(명세서 §3.20).
 * 타입은 서버 DTO(`Accentury_Server` `backend/.../learning/MonthlyAttendanceResponse.java`)를 그대로 옮겼다. 홈 앱 바의
 * 출석 달력 시트가 쓴다. 인증·401 갱신·오류는 홈([fetchLearningHome])과 같이 `wordApi.ts`의 [request] 한 벌이다.
 */

import type { HomeStreak } from './homeApi'
import { hasFields, isArrayOf, request, shapeError, type WordApiDeps } from './wordApi'

/** `MonthlyAttendanceResponse.Item` — 그날 마친 학습 하나 */
export interface AttendanceItem {
  /** SET 단어 세트(시도마다 1건), COURSE 억양 코스(그날 마친 카드를 묶어 1건), LEVEL_TEST 레벨테스트 완주 */
  kind: 'SET' | 'COURSE' | 'LEVEL_TEST'
  /** 하루 안에서 유일 — 목록 키 */
  key: string
  /** 세트 id, 코스 id, 레벨테스트는 테스트 버전 */
  id: string
  /** 서버 제목. 화면은 쓰지 않는다(스탬프 이름 규칙, `stampNaming.ts`) */
  title: string
  /** 세트는 정답 수, 코스는 그날 마친 카드 수 */
  done: number
  /** 세트는 문항 수, 코스는 코스의 카드 수 */
  total: number
}

/** `MonthlyAttendanceResponse.Day` — 출석한 날 하나. 시도 기록이 없는 날은 빈 목록 */
export interface AttendanceDayRecord {
  /** KST `yyyy-MM-dd` */
  date: string
  items: AttendanceItem[]
}

/** `GET /v0/learning/attendance` */
export interface MonthlyAttendance {
  year: number
  month: number
  /** 그 달에 출석한 날, 오름차순 */
  days: AttendanceDayRecord[]
  monthCount: number
  lastMonthCount: number
  streak: HomeStreak
  /** 서버 기준 KST 오늘 `yyyy-MM-dd` — 달력의 「오늘」은 기기 시계가 아니라 이 값 */
  today: string
}

export async function fetchMonthlyAttendance(
  apiBase: string,
  year: number,
  month: number,
  deps: WordApiDeps = {},
): Promise<MonthlyAttendance> {
  const body = await request(apiBase, `/v0/learning/attendance?year=${year}&month=${month}`, 'GET', {}, deps)
  if (!isMonthlyAttendance(body)) throw shapeError()
  return body
}

const KINDS: readonly string[] = ['SET', 'COURSE', 'LEVEL_TEST']

function isMonthlyAttendance(v: unknown): v is MonthlyAttendance {
  return (
    hasFields(v, { year: 'number', month: 'number', monthCount: 'number', lastMonthCount: 'number', today: 'string' }) &&
    hasFields(v.streak, { currentDays: 'number', attendedToday: 'boolean' }) &&
    isArrayOf(v.days, { date: 'string' }, (day) =>
      isArrayOf(day.items, { kind: 'string', key: 'string', id: 'string', title: 'string', done: 'number', total: 'number' }, (item) =>
        KINDS.includes(item.kind as string),
      ),
    )
  )
}
