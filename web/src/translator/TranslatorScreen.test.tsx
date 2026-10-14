import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import type { WordApiDeps } from '../learning/wordApi'
import { shareResult } from '../share/shareResult'
import { TranslatorScreen } from './TranslatorScreen'

vi.mock('../share/shareResult', () => ({ shareResult: vi.fn(() => 'bridge') }))

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

function envelope(code: string, retryable: boolean) {
  return { code, message: '서버 문구', retryable, retryAfterMs: null, correlationId: 'c_test' }
}

function setup(fetchImpl: FetchLike, overrides: Partial<WordApiDeps> = {}) {
  const deps: WordApiDeps = { fetchImpl, getToken: () => 'acc', refreshToken: async () => false, ...overrides }
  render(<TranslatorScreen apiBase="" tabBar={<nav aria-label="주 메뉴" />} deps={deps} />)
}

const input = () => screen.getByLabelText('표준어 문장')
const type = (value: string) => fireEvent.change(input(), { target: { value } })
const submit = () => fireEvent.click(screen.getByRole('button', { name: '바꾸기' }))

/** 응답을 손으로 풀어 주는 fetch — 대기·늦은 응답을 본다 */
function deferredFetch() {
  const pending: Array<(r: Response) => void> = []
  const fetchImpl = vi.fn<FetchLike>(() => new Promise<Response>((resolve) => pending.push(resolve)))
  const resolve = async (i: number, r: Response) => {
    // 토큰을 기다린 뒤에 fetch가 불리므로 i번째 요청이 실제로 나갈 때까지 기다린다
    await vi.waitFor(() => expect(pending[i]).toBeTypeOf('function'))
    await act(async () => pending[i](r))
  }
  return { fetchImpl, resolve }
}

beforeEach(() => {
  vi.mocked(shareResult).mockClear()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('입력 상태 (ux-ui 「사투리 번역기 화면」 상태 표)', () => {
  it('빈 입력·공백만이면 [바꾸기] 비활성, 탭 바는 선다', () => {
    setup(vi.fn())
    expect(screen.getByRole('button', { name: '바꾸기' })).toBeDisabled()
    type('   ')
    expect(screen.getByRole('button', { name: '바꾸기' })).toBeDisabled()
    expect(screen.getByRole('navigation', { name: '주 메뉴' })).toBeInTheDocument()
  })

  it('개인정보 안내와 처리방침 링크가 입력창 아래에 있다', () => {
    setup(vi.fn())
    expect(screen.getByText(/개인정보나 민감한 내용은 넣지 마세요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '개인정보처리방침' })).toBeInTheDocument()
  })

  it('코드 포인트 100자(이모지 포함)는 통과, 101자는 비활성 + 안내 + 카운터', () => {
    setup(vi.fn())
    const hundred = '😀'.repeat(50) + '가'.repeat(50)
    type(hundred)
    expect(screen.getByText('100/100')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '바꾸기' })).toBeEnabled()
    expect(screen.queryByText('100자까지 쓸 수 있어요')).toBeNull()

    type(hundred + '😀')
    expect(screen.getByText('101/100')).toHaveClass('feedback-message')
    expect(screen.getByRole('button', { name: '바꾸기' })).toBeDisabled()
    expect(screen.getByText('100자까지 쓸 수 있어요')).toBeInTheDocument()
  })
})

describe('요청과 결과', () => {
  it('대기 중엔 「바꾸는 중이에요」 + 비활성, 다시 눌러도 요청은 한 번, 입력은 그대로', async () => {
    const { fetchImpl, resolve } = deferredFetch()
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('바꾸는 중이에요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '바꾸기' })).toBeDisabled()
    submit()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(input()).toHaveValue('밥 먹었어?')

    await resolve(0, jsonResponse(200, { dialect: '밥 뭇나?' }))
    expect(screen.getByText('밥 뭇나?')).toBeInTheDocument()
    expect(screen.getByText('AI 번역이라 실제 표현과 다를 수 있어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '복사' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '공유' })).toBeInTheDocument()
  })

  it('입력을 고치면 결과가 지워진다', async () => {
    setup(vi.fn<FetchLike>(async () => jsonResponse(200, { dialect: '밥 뭇나?' })))
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('밥 뭇나?')).toBeInTheDocument()
    type('밥 먹었어')
    expect(screen.queryByText('밥 뭇나?')).toBeNull()
    expect(screen.queryByRole('button', { name: '공유' })).toBeNull()
  })

  it('입력을 고친 뒤 도착한 옛 응답은 버린다', async () => {
    const { fetchImpl, resolve } = deferredFetch()
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    type('어디 가?')
    expect(screen.queryByText('바꾸는 중이에요')).toBeNull()
    await resolve(0, jsonResponse(200, { dialect: '밥 뭇나?' }))
    expect(screen.queryByText('밥 뭇나?')).toBeNull()

    submit()
    await resolve(1, jsonResponse(200, { dialect: '오데 가노?' }))
    expect(screen.getByText('오데 가노?')).toBeInTheDocument()
  })

  it('[복사]는 사투리 문장을 클립보드에 쓰고 라벨을 잠깐 「복사했어요」로', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    setup(vi.fn<FetchLike>(async () => jsonResponse(200, { dialect: '밥 뭇나?' })))
    type('밥 먹었어?')
    submit()
    fireEvent.click(await screen.findByRole('button', { name: '복사' }))
    expect(await screen.findByRole('button', { name: '복사했어요' })).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith('밥 뭇나?')
  })

  it('클립보드가 없으면 「복사하지 못했어요」', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    setup(vi.fn<FetchLike>(async () => jsonResponse(200, { dialect: '밥 뭇나?' })))
    type('밥 먹었어?')
    submit()
    fireEvent.click(await screen.findByRole('button', { name: '복사' }))
    expect(await screen.findByRole('button', { name: '복사하지 못했어요' })).toBeInTheDocument()
  })

  it('[공유]는 「표준어 → 사투리」와 앱 링크를 결과 공유 채널로 넘긴다', async () => {
    setup(vi.fn<FetchLike>(async () => jsonResponse(200, { dialect: '밥 뭇나?' })))
    type('  밥 먹었어?  ')
    submit()
    fireEvent.click(await screen.findByRole('button', { name: '공유' }))
    expect(shareResult).toHaveBeenCalledWith({
      imageUrl: 'https://accentury.app/og-card-v2.png',
      text: '밥 먹었어? → 밥 뭇나?',
      webTestUrl: 'https://accentury.app/t?c=kko_share',
    })
  })

  it('공유 문구가 네이티브 상한(UTF-16 200)을 넘으면 잘라 맞춘다', async () => {
    setup(vi.fn<FetchLike>(async () => jsonResponse(200, { dialect: '😀'.repeat(100) })))
    type('가'.repeat(100))
    submit()
    fireEvent.click(await screen.findByRole('button', { name: '공유' }))
    const text = vi.mocked(shareResult).mock.calls[0][0].text
    expect(text.length).toBeLessThanOrEqual(200)
    expect(text.endsWith('…')).toBe(true)
    expect(text).not.toMatch(/[\uD800-\uDBFF]…$/)
  })
})

describe('오류 상태', () => {
  it('TRANSLATION_REJECTED → 「올바른 문장을 넣어주세요」, [다시 시도] 없음', async () => {
    setup(vi.fn<FetchLike>(async () => jsonResponse(422, envelope('TRANSLATION_REJECTED', false))))
    type('ㅁㄴㅇㄹ')
    submit()
    expect(await screen.findByText('올바른 문장을 넣어주세요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
    expect(screen.getByRole('navigation', { name: '주 메뉴' })).toBeInTheDocument()
  })

  it('TRANSLATION_UNAVAILABLE → 문구 + [다시 시도]가 같은 입력으로 재요청', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(503, envelope('TRANSLATION_UNAVAILABLE', true)))
      .mockResolvedValueOnce(jsonResponse(200, { dialect: '밥 뭇나?' }))
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('지금은 바꿀 수 없어요. 잠시 뒤 다시 시도해 주세요')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('밥 뭇나?')).toBeInTheDocument()
    expect(fetchImpl.mock.calls[1][1]?.body).toBe(JSON.stringify({ text: '밥 먹었어?' }))
  })

  it('네트워크 실패 → 문구 + [다시 시도]', async () => {
    setup(vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch')
    }))
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('네트워크 오류로 요청하지 못했어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('TRANSLATION_TOO_LONG(방어) → 「100자까지 쓸 수 있어요」', async () => {
    setup(vi.fn<FetchLike>(async () => jsonResponse(422, envelope('TRANSLATION_TOO_LONG', false))))
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('100자까지 쓸 수 있어요')).toBeInTheDocument()
  })

  it('VALIDATION_FAILED(방어) → 빈 입력과 같이 아무 문구 없음', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(400, envelope('VALIDATION_FAILED', false)))
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    await act(async () => {})
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('바꾸는 중이에요')).toBeNull()
  })

  it('CLIENT_NOT_SIGNED_IN → 「로그인하면 사투리 번역기를 쓸 수 있어요」, 요청 없음', async () => {
    const fetchImpl = vi.fn<FetchLike>()
    setup(fetchImpl, { getToken: () => null })
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('로그인하면 사투리 번역기를 쓸 수 있어요')).toBeInTheDocument()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  it('UNAUTHENTICATED(401·갱신 실패) → 오류 문구 그대로', async () => {
    setup(vi.fn<FetchLike>(async () => jsonResponse(401, envelope('AUTH_TOKEN_INVALID', false))))
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('로그인이 만료됐어요. 다시 로그인해 주세요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })
})
