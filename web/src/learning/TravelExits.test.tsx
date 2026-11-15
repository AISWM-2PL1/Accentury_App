/**
 * 스탬프 흐름에서 나가는 길 (KAN-347 3-8) — [StampExits]의 `toMap`·`toNextStamp`. 4·5단계 결과 화면이 [다음 스탬프]·「지도로」로
 * 부른다. 흐름 화면은 가짜로 갈아끼워 라우트가 넘긴 출구만 잡는다(흐름 자체는 `WordLearningScreens.test.tsx`).
 */

import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import type { StampExits } from './travel'

const captured: { stamp?: { id: string }; courseId?: string; exits?: StampExits }[] = []

vi.mock('./WordLearningScreens', () => ({
  WordLearningRoute: (props: { stamp: { id: string }; exits: StampExits }) => {
    captured.push(props)
    return <p>단어 흐름 {props.stamp.id}</p>
  },
}))
vi.mock('./IntonationLearningScreens', () => ({
  IntonationLearningRoute: (props: { courseId: string; exits: StampExits }) => {
    captured.push(props)
    return <p>억양 흐름 {props.courseId}</p>
  },
}))

const { TravelRoute } = await import('./TravelScreens')

function lists(done: string[]) {
  return {
    '/v0/learning/word-sets': {
      contentVersion: 'v',
      sets: [1, 2].map((seq) => ({ setId: `w${seq}`, seq, level: 1, category: '', title: '', cardCount: 3, itemCount: 3, completed: done.includes(`w${seq}`) })),
    },
    '/v0/learning/intonation-courses': {
      contentVersion: 'v',
      courses: [1, 2].map((seq) => ({
        courseId: `k${seq}`, seq, level: 1, topic: null, title: '', cardCount: 3, completedCardCount: 0, completed: done.includes(`k${seq}`), recommended: false,
      })),
    },
  } as Record<string, unknown>
}

/** 목록 응답을 차례로 바꿔 낀다 — 부를 때마다 progress의 다음 칸 */
function renderWith(progress: string[][]) {
  let round = 0
  const fetchImpl: FetchLike = async (input) => {
    const path = new URL(input).pathname
    const body = lists(progress[Math.min(round, progress.length - 1)])[path]
    if (path === '/v0/learning/intonation-courses') round += 1
    return (body === undefined
      ? { ok: false, status: 404, json: async () => ({ code: 'NOT_FOUND', message: '', retryable: false }) }
      : { ok: true, status: 200, json: async () => body }) as Response
  }
  render(<TravelRoute apiBase="http://api" resume deps={{ fetchImpl, getToken: () => 'acc', refreshToken: async () => false }} />)
}

const last = () => captured[captured.length - 1]

describe('StampExits', () => {
  it('toNextStamp은 진행을 다시 받아 지도를 거치지 않고 다음 지금 스탬프로 바로 들어간다', async () => {
    renderWith([[], ['w1']])
    expect(await screen.findByText('단어 흐름 w1')).toBeInTheDocument()
    await act(async () => last().exits!.toNextStamp())
    expect(await screen.findByText('억양 흐름 k1')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '사투리 여행' })).toBeNull()
  })

  it('같은 스탬프가 다시 지금이면(완료가 안 됨) 흐름을 새로 세운다', async () => {
    renderWith([[], []])
    await screen.findByText('단어 흐름 w1')
    const before = captured.length
    const first = last()
    await act(async () => first.exits!.toNextStamp())
    expect(await screen.findByText('단어 흐름 w1')).toBeInTheDocument()
    expect(captured.length).toBeGreaterThan(before)
    expect(last().exits).not.toBe(first.exits)
  })

  it('열린 스탬프를 다 끝냈으면 toNextStamp은 지도로 간다', async () => {
    renderWith([['w1', 'k1', 'w2'], ['w1', 'k1', 'w2', 'k2']])
    await screen.findByText('억양 흐름 k2')
    await act(async () => last().exits!.toNextStamp())
    expect(await screen.findByRole('heading', { level: 1, name: '사투리 여행' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '1코스 완주' })).toBeInTheDocument()
  })

  it('toMap은 지도로 가며 방금 마친 스탬프에 도장을 찍는다', async () => {
    renderWith([[], ['w1']])
    await screen.findByText('단어 흐름 w1')
    await act(async () => last().exits!.toMap())
    expect(await screen.findByRole('heading', { level: 1, name: '사투리 여행' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '지금 코스' })).toHaveClass('is-stamped')
  })
})
