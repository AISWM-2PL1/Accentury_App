import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import { fetchMonthlyAttendance } from './attendanceApi'
import { WordLearningError } from './wordApi'

const BODY = {
  year: 2026,
  month: 11,
  days: [{ date: '2026-11-12', items: [{ kind: 'SET', key: 'a-1', id: 'ws-1', title: '코스 1 단어 1', done: 3, total: 3 }] }],
  monthCount: 1,
  lastMonthCount: 4,
  streak: { currentDays: 1, attendedToday: false, lastAttendedDate: '2026-11-12' },
  today: '2026-11-13',
}

const deps = (fetchImpl: FetchLike) => ({ fetchImpl, getToken: () => 'acc', refreshToken: async () => false })
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response

describe('GET /v0/learning/attendance (KAN-347 2-3)', () => {
  it('연·월 쿼리와 계정 Bearer로 부르고 응답을 그대로 준다', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json(BODY))
    expect(await fetchMonthlyAttendance('http://api/', 2026, 11, deps(fetchImpl))).toEqual(BODY)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('http://api/v0/learning/attendance?year=2026&month=11')
    expect(init?.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer acc' })
  })

  it.each([
    ['모르는 kind', { ...BODY, days: [{ date: '2026-11-12', items: [{ ...BODY.days[0].items[0], kind: 'QUIZ' }] }] }],
    ['streak 없음', { ...BODY, streak: undefined }],
    ['today 없음', { ...BODY, today: undefined }],
    ['streak.currentDays 음수', { ...BODY, streak: { ...BODY.streak, currentDays: -1 } }],
    ['streak.currentDays 소수', { ...BODY, streak: { ...BODY.streak, currentDays: 1.5 } }],
  ])('계약과 다른 응답(%s)은 재시도 없는 오류', async (_name, body) => {
    const error = await fetchMonthlyAttendance('http://api', 2026, 11, deps(async () => json(body))).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(WordLearningError)
    expect((error as WordLearningError).retryable).toBe(false)
  })
})
