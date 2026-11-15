/**
 * 출석 달력 시트 (KAN-347 2-3, 시안 s-02-b). 서버 응답 그대로 칸·통계를 그리는지, 상세 카드 행 이름이 스탬프 규칙을 따르는지,
 * 달을 넘기면 다시 조회하는지를 본다. 날짜는 응답의 `today`가 정하므로 기기 시계를 고정할 필요가 없다 — 첫 요청 달만
 * 기기 KST 달이라 그 값으로 응답을 만든다.
 */

import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import { AttendanceSheet, attendanceRow, monthWeeks } from './AttendanceCalendar'
import { courseStamps } from './stampNaming'
import type { WordApiDeps } from './wordApi'

const [YEAR, MONTH] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
  .format(new Date())
  .split('-')
  .map(Number)
const pad = (n: number) => String(n).padStart(2, '0')
const day = (d: number, y = YEAR, m = MONTH) => `${y}-${pad(m)}-${pad(d)}`
const prev = MONTH === 1 ? { y: YEAR - 1, m: 12 } : { y: YEAR, m: MONTH - 1 }

const WORD_SETS = {
  contentVersion: 'wd-1',
  sets: [1, 2, 3, 4, 5].map((seq) => ({
    setId: `ws-${seq}`, seq, level: seq <= 4 ? 1 : 2, category: '종합', title: `코스 ? 단어 ${seq}`, cardCount: 3, itemCount: 3,
  })),
}
const COURSES = {
  contentVersion: 'in-1',
  courses: [1, 2].map((seq) => ({
    courseId: `ic-${seq}`, seq, level: 1, topic: null, title: `코스 1 억양 ${seq}`, cardCount: 3, completedCardCount: 0,
    completed: false, recommended: false,
  })),
}

const THIS_MONTH = {
  year: YEAR,
  month: MONTH,
  days: [
    {
      date: day(1),
      items: [
        { kind: 'SET', key: 'att-1', id: 'ws-5', title: '코스 2 단어 1', done: 2, total: 3 },
        { kind: 'COURSE', key: 'in-1:ic-2', id: 'ic-2', title: '코스 1 억양 2', done: 3, total: 3 },
      ],
    },
    { date: day(2), items: [{ kind: 'SET', key: 'att-2', id: 'ws-old', title: '옛 세트', done: 3, total: 3 }] },
  ],
  monthCount: 2,
  lastMonthCount: 7,
  streak: { currentDays: 2, attendedToday: true, lastAttendedDate: day(2) },
  today: day(2),
}
const LAST_MONTH = {
  ...THIS_MONTH,
  year: prev.y,
  month: prev.m,
  days: [{ date: day(3, prev.y, prev.m), items: [] }],
  monthCount: 1,
  lastMonthCount: 0,
}

function json(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response
}

function setup() {
  const fetchImpl = vi.fn<FetchLike>(async (url) => {
    const path = String(url)
    if (path.endsWith('/v0/learning/word-sets')) return json(WORD_SETS)
    if (path.endsWith('/v0/learning/intonation-courses')) return json(COURSES)
    if (path.endsWith(`year=${YEAR}&month=${MONTH}`)) return json(THIS_MONTH)
    if (path.endsWith(`year=${prev.y}&month=${prev.m}`)) return json(LAST_MONTH)
    return { ok: false, status: 404, json: async () => ({}) } as Response
  })
  const deps: WordApiDeps = { fetchImpl, getToken: () => 'acc', refreshToken: async () => false }
  const onClose = vi.fn()
  const view = render(<AttendanceSheet apiBase="http://api" onClose={onClose} deps={deps} />)
  return { fetchImpl, onClose, ...view }
}

const cell = (d: number, m = MONTH) => screen.getByRole('button', { name: new RegExp(`^${m}월 ${d}일, `) })

describe('출석 달력 시트 (KAN-347 2-3)', () => {
  it('연속 출석·출석 칸·오늘·통계가 응답대로 서고, 오늘을 고른 채로 연다', async () => {
    const { container } = setup()
    expect(await screen.findByText('2일')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '출석 달력' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: `${YEAR}년 ${MONTH}월` })).toBeInTheDocument()
    expect(screen.getByText('이번 달 2일 · 지난달 7일')).toBeInTheDocument()

    expect(cell(1)).toHaveClass('is-attended')
    expect(cell(2)).toHaveAccessibleName(`${MONTH}월 2일, 오늘, 출석`)
    expect(cell(2)).toHaveAttribute('aria-current', 'date')
    expect(cell(2)).toHaveAttribute('aria-pressed', 'true')
    // 칸은 33px 그림(.attendance-cell__day)이고 버튼이 누르는 영역이다
    expect(cell(2).querySelector('.attendance-cell__day')).not.toBeNull()
    expect(container.querySelector('.attendance-calendar__dow.is-sunday')).toHaveTextContent('일')
    // 서버 title은 쓰지 않는다
    expect(screen.queryByText('옛 세트')).toBeNull()
    expect(screen.getByText('단어 학습')).toBeInTheDocument()
    expect(screen.getByText('3문항 완료')).toBeInTheDocument()
    // 이번 달에서 다음 달로는 가지 않는다
    expect(screen.getByRole('button', { name: '다음 달' })).toBeDisabled()
  })

  it('출석한 날을 누르면 스탬프 이름 + 단위, 기록 없는 날은 「학습 기록이 없어요」', async () => {
    setup()
    await screen.findByText('2일')
    fireEvent.click(cell(1))
    // 스탬프 번호는 목록 두 개가 도착한 뒤 붙는다
    expect(await screen.findByText('2코스 단어 학습 1')).toBeInTheDocument()
    expect(screen.getByText('1코스 억양 학습 2')).toBeInTheDocument()
    expect(screen.getByText('대사 3개 완료')).toBeInTheDocument()

    fireEvent.click(cell(5))
    expect(screen.getByText('학습 기록이 없어요')).toBeInTheDocument()
  })

  it('지난달로 넘기면 그 달을 조회해 출석 칸과 통계가 바뀐다', async () => {
    const { fetchImpl } = setup()
    await screen.findByText('2일')
    fireEvent.click(screen.getByRole('button', { name: '이전 달' }))

    expect(await screen.findByText('이번 달 1일 · 지난달 0일')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: `${prev.y}년 ${prev.m}월` })).toBeInTheDocument()
    expect(cell(3, prev.m)).toHaveClass('is-attended')
    expect(cell(1, prev.m)).not.toHaveClass('is-attended')
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toContain(
      `http://api/v0/learning/attendance?year=${prev.y}&month=${prev.m}`,
    )
    // 다른 달은 누를 때까지 상세 카드가 없다
    expect(screen.queryByText('학습 기록이 없어요')).toBeNull()
    fireEvent.click(cell(3, prev.m))
    expect(screen.getByText('학습 기록이 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 달' })).toBeEnabled()
  })

  it('닫기 ×·Escape·막 탭으로 닫는다', async () => {
    const { onClose, container } = setup()
    await screen.findByText('2일')
    fireEvent.click(screen.getByRole('button', { name: '출석 달력 닫기' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.click(container.querySelector('.attendance-sheet')!)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('조회가 실패하면 문구와 [다시 시도], 누르면 다시 조회한다', async () => {
    let fail = true
    const fetchImpl = vi.fn<FetchLike>(async (url) => {
      if (String(url).includes('/attendance') && fail) return { ok: false, status: 503, json: async () => ({}) } as Response
      return json(String(url).includes('/attendance') ? THIS_MONTH : String(url).includes('word') ? WORD_SETS : COURSES)
    })
    render(<AttendanceSheet apiBase="http://api" onClose={vi.fn()} deps={{ fetchImpl, getToken: () => 'acc', refreshToken: async () => false }} />)
    expect(await screen.findByText('출석 기록을 불러오지 못했어요')).toBeInTheDocument()
    fail = false
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '다시 시도' })))
    expect(await screen.findByText('이번 달 2일 · 지난달 7일')).toBeInTheDocument()
  })
})

describe('달력 계산', () => {
  it('일요일 시작 주로 자르고 앞뒤는 빈칸', () => {
    // 2026년 11월 1일은 일요일, 30일까지
    const weeks = monthWeeks({ year: 2026, month: 11 })
    expect(weeks[0]).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(weeks.at(-1)).toEqual([29, 30, null, null, null, null, null])
    // 2026년 2월 1일도 일요일, 28일 = 딱 4주
    expect(monthWeeks({ year: 2026, month: 2 })).toHaveLength(4)
    expect(monthWeeks({ year: 2026, month: 10 })[0]).toEqual([null, null, null, null, 1, 2, 3])
  })

  it('상세 행 — 코스·번호를 아는 스탬프, 모르는 옛 세트, 레벨 테스트', () => {
    const courses = courseStamps([{ id: 'ws-1', level: 3, seq: 9 }], [{ id: 'ic-1', level: 3, seq: 9 }])
    const item = { key: 'k', title: '서버 제목', done: 2, total: 3 }
    expect(attendanceRow({ ...item, kind: 'SET', id: 'ws-1' }, courses)).toEqual({ name: '3코스 단어 학습 1', meta: '3문항 완료' })
    expect(attendanceRow({ ...item, kind: 'COURSE', id: 'ic-1' }, courses)).toEqual({ name: '3코스 억양 학습 1', meta: '대사 2개 완료' })
    expect(attendanceRow({ ...item, kind: 'COURSE', id: 'ic-x' }, courses)).toEqual({ name: '억양 학습', meta: '대사 2개 완료' })
    expect(attendanceRow({ ...item, kind: 'LEVEL_TEST', id: 'gn-1' }, courses)).toEqual({ name: '레벨 테스트', meta: '완료' })
  })
})
