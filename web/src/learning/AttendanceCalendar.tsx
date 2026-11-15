/**
 * 홈 출석 배지와 출석 달력 시트 (KAN-347 2-3, 시안 s-02·s-02-b, 움직임 타일 4·8).
 *
 * 배지는 앱 바 오른쪽에 앉는다. 앱 바(`ui/AppBar`)는 `main.tsx`가 `App` 밖에 한 번 그려서 화면이 손댈 수 없으므로,
 * 닫기 ✕(`ui/CloseButton`)처럼 고정 위치로 그 띠 위에 얹는다. 홈만 이 배지를 그리므로 다른 탭에는 없다.
 *
 * 시트는 1단계 바텀 시트(`ui/BottomSheet`)다. 연 달의 `GET /v0/learning/attendance`를 부르고, 상세 카드 행의 스탬프
 * 이름(「단어 학습 n」)은 출석 응답에 번호가 없어 단어 세트·억양 코스 목록을 한 번 받아 `stampNaming`으로 붙인다.
 * 목록에 없는 id(지금 발행본이 아닌 옛 세트)는 번호 없이 종류 이름만 쓴다. 서버 `title`은 쓰지 않는다.
 */

import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { BottomSheet } from '../ui'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, CloseLineIcon, MicLineIcon, ToneLineIcon, WordLineIcon } from '../ui/icons'
import { fetchMonthlyAttendance, type AttendanceItem, type MonthlyAttendance } from './attendanceApi'
import { fetchIntonationCourses } from './intonationApi'
import { courseStamps, findStamp, stampName, type Stamp } from './stampNaming'
import { fetchWordSets, type WordApiDeps } from './wordApi'

const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** 앱 바 오른쪽 배지 — 달력 아이콘 + 연속 출석 일수(Jua) */
export function AttendanceBadge({ days, onOpen, ref }: { days: number; onOpen: () => void; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={ref} type="button" className="streak-badge" aria-label={`연속 출석 ${days}일, 출석 달력 열기`} onClick={onOpen}>
      <CalendarIcon />
      <span aria-hidden="true">{days}</span>
    </button>
  )
}

/** 달 하나 (month는 1~12) */
interface YearMonth {
  year: number
  month: number
}

/**
 * 한 달을 일요일 시작 주 단위로 자른다. 칸은 그 달 날짜(1~말일)이고 앞뒤 빈칸은 null.
 * `Date.UTC`로만 셈해 기기 시간대와 무관하다.
 */
export function monthWeeks({ year, month }: YearMonth): (number | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cells: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: last }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = ({ year, month }: YearMonth, day: number) => `${year}-${pad(month)}-${pad(day)}`
const parseMonth = (iso: string): YearMonth => ({ year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) })
const shiftMonth = ({ year, month }: YearMonth, by: number): YearMonth => {
  const index = year * 12 + (month - 1) + by
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** 상세 카드 한 행의 이름·단위 (KAN-347 2-3·3-2). 코스를 알면 「n코스 」를 앞에 붙인다(시안 s-02-b) */
export function attendanceRow(item: AttendanceItem, courses: Map<number, Stamp[]>): { name: string; meta: string } {
  if (item.kind === 'LEVEL_TEST') return { name: '레벨 테스트', meta: '완료' }
  const kind = item.kind === 'SET' ? 'word' : 'intonation'
  const stamp = findStamp(courses, kind, item.id)
  const name = stamp === undefined ? stampName(kind) : `${stamp.course}코스 ${stampName(kind, stamp.n)}`
  return { name, meta: item.kind === 'SET' ? `${item.total}문항 완료` : `대사 ${item.done}개 완료` }
}

export interface AttendanceSheetProps {
  apiBase: string
  onClose: () => void
  deps?: WordApiDeps
}

export function AttendanceSheet({ apiBase, onClose, deps }: AttendanceSheetProps) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  // 첫 요청은 기기 시계의 KST 달로 연다. 그 뒤 「오늘」·다음 달 상한은 응답의 서버 `today`를 쓴다
  const [view, setView] = useState<YearMonth>(() => parseMonth(KST_DAY.format(new Date())))
  const [data, setData] = useState<MonthlyAttendance | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [courses, setCourses] = useState<Map<number, Stamp[]>>(() => new Map())

  useEffect(() => closeRef.current?.focus({ preventScroll: true }), [])

  // 스탬프 번호용 목록은 시트를 열 때 한 번. 실패하면 번호 없는 이름으로 남는다
  useEffect(() => {
    let alive = true
    void Promise.all([
      fetchWordSets(apiBase, deps).then((list) => list.sets, () => []),
      fetchIntonationCourses(apiBase, deps).then((list) => list.courses, () => []),
    ]).then(([sets, intonations]) => {
      if (!alive) return
      setCourses(
        courseStamps(
          sets.map((s) => ({ id: s.setId, level: s.level, seq: s.seq })),
          intonations.map((c) => ({ id: c.courseId, level: c.level, seq: c.seq })),
        ),
      )
    })
    return () => {
      alive = false
    }
  }, [apiBase, deps])

  useEffect(() => {
    let alive = true
    setFailed(false)
    fetchMonthlyAttendance(apiBase, view.year, view.month, deps).then(
      (result) => {
        if (!alive) return
        setData(result)
        // 이번 달을 열면 오늘을 고른 채로 연다. 다른 달은 누를 때까지 상세 카드가 없다
        setSelected((current) => current ?? (result.today.startsWith(isoDate(view, 1).slice(0, 8)) ? result.today : null))
      },
      () => {
        if (alive) setFailed(true)
      },
    )
    return () => {
      alive = false
    }
  }, [apiBase, deps, view, attempt])

  const shown = data !== null && data.year === view.year && data.month === view.month ? data : null
  const today = data?.today ?? null
  const atCurrentMonth = today !== null && isoDate(view, 1).slice(0, 7) >= today.slice(0, 7)
  const recordOf = (date: string) => shown?.days.find((day) => day.date === date)

  const move = (by: number) => {
    setSelected(null)
    setView((current) => shiftMonth(current, by))
  }

  const selectedRecord = selected === null ? undefined : recordOf(selected)
  const selectedDay = selected === null ? null : Number(selected.slice(8, 10))

  return (
    <BottomSheet
      labelledBy={titleId}
      overlayClassName="attendance-sheet"
      className="attendance-panel"
      onOverlayClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onOverlayKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
    >
      <h2 id={titleId} className="sr-only">
        출석 달력
      </h2>
      <button ref={closeRef} type="button" className="attendance-panel__close" aria-label="출석 달력 닫기" onClick={onClose}>
        <CloseLineIcon />
      </button>
      <div className="attendance-panel__streak">
        <p className="attendance-panel__days">{data === null ? '-' : `${data.streak.currentDays}일`}</p>
        <p className="attendance-panel__days-label">연속 출석</p>
      </div>
      <div className="attendance-panel__month">
        <h3>
          {view.year}년 {view.month}월
        </h3>
        <div className="attendance-panel__nav">
          <button type="button" aria-label="이전 달" onClick={() => move(-1)}>
            <ChevronLeftIcon />
          </button>
          <button type="button" aria-label="다음 달" disabled={atCurrentMonth || today === null} onClick={() => move(1)}>
            <ChevronRightIcon />
          </button>
        </div>
      </div>
      {failed ? (
        <div className="attendance-panel__failed">
          <p>출석 기록을 불러오지 못했어요</p>
          <button type="button" className="btn btn--text" onClick={() => setAttempt((n) => n + 1)}>
            다시 시도
          </button>
        </div>
      ) : (
        <div
          className="attendance-calendar"
          role="group"
          aria-label={`${view.year}년 ${view.month}월 출석 기록, 날짜를 누르면 그날 학습이 보여요`}
          aria-busy={shown === null}
        >
          <div className="attendance-calendar__row" aria-hidden="true">
            {WEEKDAYS.map((label) => (
              <span key={label} className={label === '일' ? 'attendance-calendar__dow is-sunday' : 'attendance-calendar__dow'}>
                {label}
              </span>
            ))}
          </div>
          {monthWeeks(view).map((week, w) => (
            <div key={w} className="attendance-calendar__row">
              {week.map((day, d) => {
                if (day === null) return <span key={d} className="attendance-cell" aria-hidden="true" />
                const date = isoDate(view, day)
                const attended = recordOf(date) !== undefined
                const isToday = date === today
                const future = today !== null && date > today
                const state = attended ? '출석' : future ? '예정' : '미출석'
                const classes = ['attendance-cell', attended && 'is-attended', isToday && 'is-today', future && 'is-future']
                return (
                  <button
                    key={d}
                    type="button"
                    className={classes.filter(Boolean).join(' ')}
                    aria-pressed={date === selected}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={`${view.month}월 ${day}일, ${isToday ? '오늘, ' : ''}${state}`}
                    onClick={() => setSelected(date)}
                  >
                    <span className="attendance-cell__day" aria-hidden="true">
                      {day}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
      <div aria-live="polite">
        {selected !== null && selectedDay !== null && shown !== null && (
          <div className="attendance-day-card">
            <h4>
              {view.month}월 {selectedDay}일 ({WEEKDAYS[new Date(Date.UTC(view.year, view.month - 1, selectedDay)).getUTCDay()]})
            </h4>
            {selectedRecord === undefined || selectedRecord.items.length === 0 ? (
              <p className="attendance-day-card__empty">학습 기록이 없어요</p>
            ) : (
              <ul>
                {selectedRecord.items.map((item) => {
                  const row = attendanceRow(item, courses)
                  return (
                    <li key={item.key}>
                      {item.kind === 'SET' ? <WordLineIcon size={16} /> : item.kind === 'COURSE' ? <ToneLineIcon size={16} /> : <MicLineIcon size={16} />}
                      <span className="attendance-day-card__name">{row.name}</span>
                      <span className="attendance-day-card__meta">{row.meta}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="attendance-legend" aria-hidden="true">
        <span>
          <i className="attendance-legend__attended" />
          출석
        </span>
        <span>
          <i className="attendance-legend__today" />
          오늘
        </span>
        <span>
          <i className="attendance-legend__selected" />
          선택
        </span>
      </div>
      {shown !== null && (
        <p className="attendance-panel__stats">
          이번 달 {shown.monthCount}일 · 지난달 {shown.lastMonthCount}일
        </p>
      )}
    </BottomSheet>
  )
}
