import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FetchLike } from '../progress/fetchTestDefinition'
import type { WordApiDeps } from '../learning/wordApi'
import { shareResult } from '../share/shareResult'
import { TranslatorScreen, limitBody } from './TranslatorScreen'

/** 서버 429 문구 원문 (Accentury_Server `ErrorCode.TRANSLATION_DAILY_LIMIT_EXCEEDED`, `TranslationService.CALL_LIMIT_MESSAGE`). 서버가 바꾸면 같이 바꾼다 */
const SERVER_DAILY_LIMIT = '오늘 번역 횟수(5회)를 다 썼습니다. 내일 다시 시도해 주세요.'
const SERVER_CALL_LIMIT = '오늘 번역 요청 횟수(20회)를 다 썼습니다. 내일 다시 시도해 주세요.'
import { resetTranslatorConsentMemory, TRANSLATOR_CONSENT_KEY, writeTranslatorConsent } from './translatorConsentStore'

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
const goButton = () => screen.getByRole('button', { name: '번역하기' })
const submit = () => fireEvent.click(goButton())

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
  resetTranslatorConsentMemory()
  try {
    localStorage.clear()
  } catch {
    // localStorage가 없는 런타임(로컬 Node 26 jsdom) — 메모리 사본만으로 돈다
  }
  // 대부분의 케이스는 동의를 마친 화면을 본다. 미동의 흐름은 「Gemini 전송 동의」 describe가 다시 비우고 시작한다
  writeTranslatorConsent()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('입력 상태 (ux-ui 「사투리 번역기 화면」 상태 표)', () => {
  it('빈 입력·공백만이면 ↓ 비활성, 탭 바는 선다', () => {
    setup(vi.fn())
    expect(goButton()).toBeDisabled()
    type('   ')
    expect(goButton()).toBeDisabled()
    expect(screen.getByRole('navigation', { name: '주 메뉴' })).toBeInTheDocument()
  })

  it('규칙 줄 「하루 5번까지 번역할 수 있어요」, 빈 결과 「번역한 문장이 여기 나와요」, ↓ 버튼 이름은 「번역하기」 (KAN-347 6-1)', () => {
    setup(vi.fn())
    expect(screen.getByText('하루 5번까지 번역할 수 있어요')).toBeInTheDocument()
    expect(screen.getByText('번역한 문장이 여기 나와요')).toBeInTheDocument()
    expect(goButton()).toHaveAccessibleName('번역하기')
    expect(goButton()).toHaveTextContent('')
    // 입력 카드 라벨 「표준어」(빈 원), 결과 카드 라벨 「경남 사투리」(벽돌 원)
    expect(document.querySelector('.translator-card:not(.translator-card--output) .translator-card__label')).toHaveTextContent('표준어')
    expect(document.querySelector('.translator-card--output .translator-card__label--dialect')).toHaveTextContent('경남 사투리')
  })

  it('입력창 아래 상시 고지가 받는 곳(Google Gemini API)과 처리방침 링크를 말한다, AI 번역 고지도 늘 선다', () => {
    setup(vi.fn())
    expect(screen.getByText('AI 번역이라 실제 표현과 다를 수 있어요')).toBeInTheDocument()
    expect(screen.getByText(/입력한 문장은 번역을 위해 Google Gemini API로 보내요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '개인정보처리방침' })).toBeInTheDocument()
  })

  it('코드 포인트 100자(이모지 포함)는 통과, 101자는 비활성 + 안내 + 카운터', () => {
    setup(vi.fn())
    const hundred = '😀'.repeat(50) + '가'.repeat(50)
    type(hundred)
    expect(screen.getByText('100/100')).toBeInTheDocument()
    expect(goButton()).toBeEnabled()
    expect(screen.queryByText('100자까지 쓸 수 있어요')).toBeNull()

    type(hundred + '😀')
    expect(screen.getByText('101/100')).toHaveClass('translator-card__counter--over')
    expect(goButton()).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('100자까지 쓸 수 있어요')
    expect(input()).toHaveAttribute('aria-invalid', 'true')
    expect(input()).toHaveAccessibleDescription('100자까지 쓸 수 있어요')
  })
})

describe('요청과 결과', () => {
  it('대기 중엔 「번역 중이에요」 + 비활성, 다시 눌러도 요청은 한 번, 입력은 그대로', async () => {
    const { fetchImpl, resolve } = deferredFetch()
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('번역 중이에요')).toBeInTheDocument()
    expect(document.querySelectorAll('.translator-wait i')).toHaveLength(2)
    expect(screen.queryByText('번역한 문장이 여기 나와요')).toBeNull()
    expect(goButton()).toBeDisabled()
    submit()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(input()).toHaveValue('밥 먹었어?')

    await resolve(0, jsonResponse(200, { direction: 'toDialect', dialect: '밥 뭇나?', remaining: 4 }))
    expect(screen.getByText('밥 뭇나?')).toBeInTheDocument()
    expect(document.querySelectorAll('.translator-wait i')).toHaveLength(0)
    expect(screen.getByText('AI 번역이라 실제 표현과 다를 수 있어요')).toBeInTheDocument()
    expect(document.querySelector('.translator-result__meta')).toHaveTextContent('오늘 4번 남았어요')
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
    expect(screen.queryByText('번역 중이에요')).toBeNull()
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
    // 아이콘 버튼이라 같은 문구를 카드 왼쪽 아래에 눈으로도 보인다
    expect(screen.getAllByRole('status').some((el) => el.textContent === '복사했어요')).toBe(true)
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
      imageUrl: 'https://accentury.app/og-card-v3.png',
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
  it('TRANSLATION_REJECTED → 입력 카드 아래 한 줄 「올바른 문장을 넣어 주세요」, 대화상자·[다시 시도] 없음, 입력을 고치면 사라진다', async () => {
    setup(vi.fn<FetchLike>(async () => jsonResponse(422, envelope('TRANSLATION_REJECTED', false))))
    type('ㅁㄴㅇㄹ')
    submit()
    const line = await screen.findByRole('alert')
    expect(line).toHaveTextContent('올바른 문장을 넣어 주세요')
    expect(line).toHaveClass('translator-error')
    expect(line.querySelector('svg')).not.toBeNull()
    expect(input()).toHaveAccessibleDescription('올바른 문장을 넣어 주세요')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
    type('밥 먹었어?')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input()).not.toHaveAttribute('aria-invalid')
    expect(screen.getByRole('navigation', { name: '주 메뉴' })).toBeInTheDocument()
  })

  const FAILED_TITLE = '번역하지 못했어요'
  const FAILED_BODY = '인터넷 연결이 불안정하거나 잠시 사용량이 많아요. 잠시 뒤 다시 시도해 주세요'

  it('TRANSLATION_UNAVAILABLE → 가운데 대화상자(배경 inert), [다시 시도]가 같은 입력으로 재요청', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse(503, envelope('TRANSLATION_UNAVAILABLE', true)))
      .mockResolvedValueOnce(jsonResponse(200, { dialect: '밥 뭇나?' }))
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    const dialog = await screen.findByRole('dialog', { name: FAILED_TITLE })
    expect(dialog).toHaveAccessibleDescription(FAILED_BODY)
    expect(document.querySelector('main')).toHaveAttribute('inert')
    expect(screen.getByRole('navigation', { name: '주 메뉴' }).parentElement).toHaveAttribute('inert')
    expect(within(dialog).getByRole('button', { name: '다시 시도' })).toHaveFocus()
    fireEvent.click(within(dialog).getByRole('button', { name: '다시 시도' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('밥 뭇나?')).toBeInTheDocument()
    expect(fetchImpl.mock.calls[1][1]?.body).toBe(JSON.stringify({ text: '밥 먹었어?', direction: 'toDialect' }))
  })

  it('[닫기]·Escape는 대화상자만 닫는다 — 입력은 남고 요청은 다시 나가지 않으며 배경 inert가 풀린다', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(503, envelope('TRANSLATION_UNAVAILABLE', true)))
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    fireEvent.click(within(await screen.findByRole('dialog', { name: FAILED_TITLE })).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(input()).toHaveValue('밥 먹었어?')
    expect(document.activeElement).toBe(input()) // 닫으면 초점이 입력칸으로 돌아온다
    expect(document.querySelector('main')).not.toHaveAttribute('inert')
    expect(goButton()).toBeEnabled()

    submit()
    fireEvent.keyDown(await screen.findByRole('dialog', { name: FAILED_TITLE }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(input()).toHaveValue('밥 먹었어?')
    expect(document.activeElement).toBe(input())
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('네트워크 실패도 같은 대화상자 + [다시 시도]', async () => {
    setup(vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch')
    }))
    type('밥 먹었어?')
    submit()
    expect(await screen.findByRole('dialog', { name: FAILED_TITLE })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('TRANSLATION_TOO_LONG(방어) → 「100자까지 쓸 수 있어요」', async () => {
    setup(vi.fn<FetchLike>(async () => jsonResponse(422, envelope('TRANSLATION_TOO_LONG', false))))
    type('밥 먹었어?')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('100자까지 쓸 수 있어요')
  })

  it('VALIDATION_FAILED(방어) → 빈 입력과 같이 아무 문구 없음', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(400, envelope('VALIDATION_FAILED', false)))
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    await act(async () => {})
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('번역 중이에요')).toBeNull()
  })

  it('CLIENT_NOT_SIGNED_IN → 「로그인하면 사투리 번역기를 쓸 수 있어요」, 요청 없음', async () => {
    const fetchImpl = vi.fn<FetchLike>()
    setup(fetchImpl, { getToken: () => null })
    type('밥 먹었어?')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인하면 사투리 번역기를 쓸 수 있어요')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
    // 입력 오류가 아니다 — 결과 카드 자리에 서고 입력칸은 invalid가 아니다 (PR #76 리뷰)
    expect(screen.getByRole('alert')).toHaveClass('translator-card__empty')
    expect(document.getElementById('translator-input')).not.toHaveAttribute('aria-invalid')
    expect(document.getElementById('translator-input-error')).toBeNull()
  })

  it('UNAUTHENTICATED(401·갱신 실패) → 오류 문구 그대로', async () => {
    setup(vi.fn<FetchLike>(async () => jsonResponse(401, envelope('AUTH_TOKEN_INVALID', false))))
    type('밥 먹었어?')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인이 만료됐어요. 다시 로그인해 주세요')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
    expect(screen.getByRole('alert')).toHaveClass('translator-card__empty')
    expect(document.getElementById('translator-input')).not.toHaveAttribute('aria-invalid')
  })
})

describe('남은 횟수와 하루 한도 (KAN-347 6-4·6-6)', () => {
  const LIMIT = ['이용 안내', '하루 한도를 다 사용했어요.', '번역은 하루 5번까지예요.']
  const limitCard = () => document.querySelector('.translator-card--limit')

  it('응답 remaining이 없으면(구서버) 「오늘 n번 남았어요」를 숨긴다', async () => {
    setup(vi.fn<FetchLike>(async () => jsonResponse(200, { dialect: '밥 뭇나?' })))
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('밥 뭇나?')).toBeInTheDocument()
    expect(screen.queryByText(/남았어요/)).toBeNull()
  })

  it('remaining 0이면 결과는 그대로 보이고 ↓가 잠기며, 다음 시도(입력 수정·방향 전환) 전에 한도 카드로 바뀐다', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(200, { direction: 'toDialect', dialect: '밥 뭇나?', remaining: 0 }))
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('밥 뭇나?')).toBeInTheDocument()
    expect(document.querySelector('.translator-result__meta')).toHaveTextContent('오늘 0번 남았어요')
    expect(limitCard()).toBeNull()
    expect(goButton()).toBeDisabled()

    type('어디 가?')
    for (const text of LIMIT) expect(limitCard()).toHaveTextContent(text)
    expect(screen.queryByText('번역한 문장이 여기 나와요')).toBeNull()
    expect(goButton()).toBeDisabled()
    expect(goButton()).toHaveAccessibleDescription(LIMIT.join(' '))
    fireEvent.click(screen.getByRole('button', { name: /번역 방향 바꾸기/ }))
    expect(limitCard()).not.toBeNull()
    submit()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('429 TRANSLATION_DAILY_LIMIT_EXCEEDED → 결과 카드 자리에 한도 카드, ↓ 비활성, 대화상자·[다시 시도]·오류 줄 없음', async () => {
    setup(vi.fn<FetchLike>(async () => jsonResponse(429, envelope('TRANSLATION_DAILY_LIMIT_EXCEEDED', false))))
    type('밥 먹었어?')
    submit()
    await vi.waitFor(() => expect(limitCard()).not.toBeNull())
    expect(within(limitCard() as HTMLElement).getByRole('heading', { name: '하루 한도를 다 사용했어요.' })).toBeInTheDocument()
    // 한도 종류를 읽을 수 없는 문구('서버 문구')면 기본 본문이다 (KAN-361)
    for (const text of LIMIT) expect(limitCard()).toHaveTextContent(text)
    expect(limitCard()).toHaveAttribute('role', 'status')
    expect(goButton()).toBeDisabled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  it('LLM 호출 20번 소진(같은 429 코드, 서버 문구만 다름)은 「번역 요청은 하루 20번까지예요.」 - 「5번」이라고 하지 않는다 (KAN-361)', async () => {
    setup(
      vi.fn<FetchLike>(async () =>
        jsonResponse(429, { ...envelope('TRANSLATION_DAILY_LIMIT_EXCEEDED', false), message: SERVER_CALL_LIMIT }),
      ),
    )
    type('밥 먹었어?')
    submit()
    await vi.waitFor(() => expect(limitCard()).not.toBeNull())
    expect(limitCard()).toHaveTextContent('번역 요청은 하루 20번까지예요.')
    expect(limitCard()).not.toHaveTextContent('번역은 하루 5번까지예요.')
    expect(limitCard()).not.toHaveTextContent('습니다')
    expect(goButton()).toHaveAccessibleDescription('이용 안내 하루 한도를 다 사용했어요. 번역 요청은 하루 20번까지예요.')
  })

  it('한도 카드 본문은 서버 문구에서 한도 종류와 숫자만 읽어 해요체로 쓴다 (limitBody, KAN-361)', () => {
    expect(limitBody(SERVER_DAILY_LIMIT)).toBe('번역은 하루 5번까지예요.')
    expect(limitBody(SERVER_CALL_LIMIT)).toBe('번역 요청은 하루 20번까지예요.')
    expect(limitBody('')).toBe('번역은 하루 5번까지예요.')
    expect(limitBody('서버 문구')).toBe('번역은 하루 5번까지예요.')
  })

  it('한도는 이 화면 안에서만 기억한다 — 다시 열면 ↓가 다시 활성', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(429, envelope('TRANSLATION_DAILY_LIMIT_EXCEEDED', false)))
    const deps: WordApiDeps = { fetchImpl, getToken: () => 'acc', refreshToken: async () => false }
    const { unmount } = render(<TranslatorScreen apiBase="" deps={deps} />)
    type('밥 먹었어?')
    submit()
    await vi.waitFor(() => expect(limitCard()).not.toBeNull())
    unmount()
    render(<TranslatorScreen apiBase="" deps={deps} />)
    type('밥 먹었어?')
    expect(limitCard()).toBeNull()
    expect(goButton()).toBeEnabled()
  })
})

describe('방향 전환 (KAN-317)', () => {
  const toggle = () => screen.getByRole('button', { name: /번역 방향 바꾸기/ })
  const ok = (body: unknown) => vi.fn<FetchLike>(async () => jsonResponse(200, body))

  it('기본은 표준어 → 사투리, 누르면 입력 이름이 「경남 사투리 문장」으로, aria-label이 지금 방향을 읽고 두 언어 자리가 바뀐다', () => {
    setup(vi.fn())
    const pair = document.querySelector('.translator-pair')
    expect(toggle()).toHaveAccessibleName('번역 방향 바꾸기, 현재 표준어 → 사투리')
    expect(pair).not.toHaveClass('translator-pair--swapped')
    fireEvent.click(toggle())
    expect(screen.getByLabelText('경남 사투리 문장')).toBeInTheDocument()
    expect(screen.queryByLabelText('표준어 문장')).toBeNull()
    expect(toggle()).toHaveAccessibleName('번역 방향 바꾸기, 현재 사투리 → 표준어')
    expect(pair).toHaveClass('translator-pair--swapped')
    // 카드 라벨과 점도 바뀐다 — 입력 「경남 사투리」(벽돌 원), 결과 「표준어」(빈 원)
    expect(document.querySelector('.translator-card:not(.translator-card--output) .translator-card__label--dialect')).toHaveTextContent('경남 사투리')
    const output = document.querySelector('.translator-card--output .translator-card__label')
    expect(output).toHaveTextContent('표준어')
    expect(output).not.toHaveClass('translator-card__label--dialect')
  })

  it('요청 본문 direction — 기본 toDialect, 전환 뒤 toStandard', async () => {
    const fetchImpl = ok({ dialect: '밥 뭇나?' })
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('밥 뭇나?')).toBeInTheDocument()
    fireEvent.click(toggle())
    fetchImpl.mockResolvedValueOnce(jsonResponse(200, { direction: 'toStandard', standard: '밥 먹었어?', remaining: 3 }))
    submit()
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
    expect(fetchImpl.mock.calls[0][1]?.body).toBe(JSON.stringify({ text: '밥 먹었어?', direction: 'toDialect' }))
    expect(fetchImpl.mock.calls[1][1]?.body).toBe(JSON.stringify({ text: '밥 먹었어?', direction: 'toStandard' }))
  })

  it('사투리 → 표준어 성공 — 결과 라벨 「표준어」, 「오늘 3번 남았어요」, [복사]는 표준어 문장, [공유]는 「사투리 → 표준어」', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    setup(ok({ direction: 'toStandard', standard: '밥 먹었니?', remaining: 3 }))
    fireEvent.click(toggle())
    fireEvent.change(screen.getByLabelText('경남 사투리 문장'), { target: { value: '밥 뭇나?' } })
    submit()
    expect(await screen.findByText('밥 먹었니?')).toBeInTheDocument()
    expect(document.querySelector('.translator-card--result .translator-card__label')).toHaveTextContent('표준어')
    expect(document.querySelector('.translator-result__meta')).toHaveTextContent('오늘 3번 남았어요')
    fireEvent.click(screen.getByRole('button', { name: '복사' }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('밥 먹었니?'))
    fireEvent.click(screen.getByRole('button', { name: '공유' }))
    expect(vi.mocked(shareResult).mock.calls[0][0].text).toBe('밥 뭇나? → 밥 먹었니?')
  })

  it('표준어 → 사투리 결과의 라벨은 「경남 사투리」(벽돌 원)', async () => {
    setup(ok({ dialect: '밥 뭇나?' }))
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('밥 뭇나?')).toBeInTheDocument()
    expect(document.querySelector('.translator-card--result .translator-card__label--dialect')).toHaveTextContent('경남 사투리')
  })

  it('결과가 있을 때 바꾸면 결과는 지우고 입력은 그대로 둔다', async () => {
    setup(ok({ dialect: '밥 뭇나?' }))
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('밥 뭇나?')).toBeInTheDocument()
    fireEvent.click(toggle())
    expect(screen.queryByText('밥 뭇나?')).toBeNull()
    expect(screen.queryByRole('button', { name: '공유' })).toBeNull()
    expect(screen.getByLabelText('경남 사투리 문장')).toHaveValue('밥 먹었어?')
  })

  it('오류가 있을 때 바꾸면 오류를 지운다', async () => {
    setup(vi.fn<FetchLike>(async () => jsonResponse(422, envelope('TRANSLATION_REJECTED', false))))
    type('ㅁㄴㅇㄹ')
    submit()
    expect(await screen.findByText('올바른 문장을 넣어 주세요')).toBeInTheDocument()
    fireEvent.click(toggle())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('대기 중엔 전환 버튼이 비활성이고, 전환 뒤 도착한 앞 방향 응답은 버린다', async () => {
    const { fetchImpl, resolve } = deferredFetch()
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    expect(await screen.findByText('번역 중이에요')).toBeInTheDocument()
    expect(toggle()).toBeDisabled()
    // disabled 버튼은 click을 내지 않는다 — 대기 중 전환 경로는 막혀 있다. 늦은 응답 가드는 입력 수정으로 대기를 푼 뒤 본다
    type('밥 먹었어')
    fireEvent.click(toggle())
    await resolve(0, jsonResponse(200, { dialect: '밥 뭇나?' }))
    expect(screen.queryByText('밥 뭇나?')).toBeNull()
    expect(screen.getByLabelText('경남 사투리 문장')).toHaveValue('밥 먹었어')
  })

  it('구 서버가 toStandard에 {dialect}만 주면 「지금은 표준어로 바꾸기를 쓸 수 없어요」, [다시 시도] 없음', async () => {
    setup(ok({ dialect: '밥 뭇나?', remaining: 4 }))
    fireEvent.click(toggle())
    fireEvent.change(screen.getByLabelText('경남 사투리 문장'), { target: { value: '밥 뭇나?' } })
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('지금은 표준어로 바꾸기를 쓸 수 없어요')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull()
  })

  it('동의 시트가 뜬 동안 바꾸면 시트가 닫히고 요청은 없다', () => {
    resetTranslatorConsentMemory()
    try {
      localStorage.clear()
    } catch {
      // 맨 위 beforeEach와 같다
    }
    const fetchImpl = vi.fn<FetchLike>()
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // 시트가 뜬 동안 배경은 inert라 사용자는 못 누른다 — 그래도 상태가 바뀌면 시트가 닫히는지 본다
    fireEvent.click(toggle())
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('Gemini 전송 동의 (KAN-304)', () => {
  const ok = () => vi.fn<FetchLike>(async () => jsonResponse(200, { dialect: '밥 뭇나?' }))

  beforeEach(() => {
    resetTranslatorConsentMemory()
    try {
      localStorage.clear()
    } catch {
      // 위 beforeEach와 같다
    }
  })

  it('미동의 첫 ↓는 요청 대신 시트를 띄운다 — Google LLC·Gemini API·처리방침 링크', () => {
    const fetchImpl = ok()
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    const dialog = screen.getByRole('dialog', { name: '문장을 Google Gemini로 보내도 될까요?' })
    expect(dialog).toHaveTextContent('Google LLC의 Gemini API')
    expect(dialog).toHaveTextContent('자사 제품 개선에 쓸 수 있어요')
    // 보내지 않는 것도 같은 시트에서 말한다 (KAN-331)
    expect(dialog).toHaveTextContent('계정 정보·음성은 보내지 않아요')
    expect(within(dialog).getByRole('link', { name: '개인정보처리방침' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '동의하고 보내기' })).toHaveFocus()
    // [(보내기 아이콘) 동의하고 보내기] / [취소] (KAN-347 6-2)
    expect(within(dialog).getByRole('button', { name: '동의하고 보내기' }).querySelector('svg')).not.toBeNull()
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeInTheDocument()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('[취소]는 시트만 닫는다 — 요청 없음, 입력 그대로, ↓ 다시 활성', async () => {
    const fetchImpl = ok()
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await act(async () => {})
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(input()).toHaveValue('밥 먹었어?')
    expect(goButton()).toBeEnabled()
  })

  it('[동의하고 보내기]는 그 입력을 보내고 동의를 남긴다 — 다시 ↓해도 시트 없음', async () => {
    const fetchImpl = ok()
    setup(fetchImpl)
    type('  밥 먹었어?  ')
    submit()
    fireEvent.click(screen.getByRole('button', { name: '동의하고 보내기' }))
    expect(await screen.findByText('밥 뭇나?')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][1]?.body).toBe(JSON.stringify({ text: '밥 먹었어?', direction: 'toDialect' }))

    type('어디 가?')
    submit()
    expect(screen.queryByRole('dialog')).toBeNull()
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
  })

  it('시트가 뜬 동안 입력을 바꾸면 시트가 닫힌다 — 요청 없음, 다시 ↓하면 새 입력으로 시트', async () => {
    const fetchImpl = ok()
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    type('어디 가?')
    expect(screen.queryByRole('dialog')).toBeNull()
    submit()
    fireEvent.click(screen.getByRole('button', { name: '동의하고 보내기' }))
    expect(await screen.findByText('밥 뭇나?')).toBeInTheDocument()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][1]?.body).toBe(JSON.stringify({ text: '어디 가?', direction: 'toDialect' }))
  })

  it('시트가 뜬 동안 배경(main·탭 바)은 inert다 — 닫히면 풀린다', () => {
    setup(ok())
    type('밥 먹었어?')
    const main = document.querySelector('main')
    const tabBarWrapper = screen.getByRole('navigation', { name: '주 메뉴' }).parentElement
    expect(main).not.toHaveAttribute('inert')
    submit()
    expect(main).toHaveAttribute('inert')
    expect(tabBarWrapper).toHaveAttribute('inert')
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(main).not.toHaveAttribute('inert')
    expect(tabBarWrapper).not.toHaveAttribute('inert')
  })

  it('저장된 동의가 있으면 처음부터 시트 없이 바로 보낸다', async () => {
    const fetchImpl = ok()
    const storage = { getItem: (key: string) => (key === TRANSLATOR_CONSENT_KEY ? 'granted' : null), setItem: () => {} }
    vi.stubGlobal('localStorage', storage)
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('밥 뭇나?')).toBeInTheDocument()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('부적절한 결과 신고 (KAN-331·KAN-344)', () => {
  const REPORT = '부적절한 결과 신고'

  /** 번역은 성공, 신고는 [report]가 답한다. 호출을 경로별로 센다 */
  function server(report: () => Promise<Response>) {
    return vi.fn<FetchLike>(async (url) =>
      String(url).endsWith('/v0/translations/reports') ? report() : jsonResponse(200, { dialect: '밥 뭇나?' }),
    )
  }
  const reports = (fetchImpl: ReturnType<typeof server>) =>
    fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/reports'))

  it('신고는 그 결과의 방향·원문·결과를 보내고, 성공하면 버튼 대신 안내가 남는다', async () => {
    const fetchImpl = server(async () => jsonResponse(201, { reportId: 'r1' }))
    setup(fetchImpl)
    type('  밥 먹었어?  ')
    submit()
    await screen.findByText('밥 뭇나?')
    fireEvent.click(screen.getByRole('button', { name: REPORT }))
    expect(await screen.findByText('신고했어요. 확인해 볼게요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: REPORT })).toBeNull()
    const [[url, init]] = reports(fetchImpl)
    expect(url).toBe('/v0/translations/reports')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ direction: 'toDialect', text: '밥 먹었어?', result: '밥 뭇나?' }))
  })

  it('보내는 중에는 잠겨 연타해도 한 번만 보낸다', async () => {
    let finish: (r: Response) => void = () => {}
    const fetchImpl = server(() => new Promise<Response>((resolve) => (finish = resolve)))
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    await screen.findByText('밥 뭇나?')
    const button = screen.getByRole('button', { name: REPORT })
    fireEvent.click(button)
    fireEvent.click(button)
    await vi.waitFor(() => expect(reports(fetchImpl)).toHaveLength(1))
    expect(screen.getByRole('button', { name: REPORT })).toBeDisabled()
    await act(async () => finish(jsonResponse(201, { reportId: 'r1' })))
    expect(reports(fetchImpl)).toHaveLength(1)
  })

  it('실패하면 안내를 띄우고 다시 누를 수 있다', async () => {
    const fetchImpl = server(async () => jsonResponse(429, envelope('RATE_LIMITED', true)))
    setup(fetchImpl)
    type('밥 먹었어?')
    submit()
    await screen.findByText('밥 뭇나?')
    fireEvent.click(screen.getByRole('button', { name: REPORT }))
    expect(await screen.findByText('신고하지 못했어요. 잠시 뒤 다시 눌러 주세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: REPORT })).toBeEnabled()
  })

  it('게스트도 번역·신고를 보낸다 — 학습 API와 달리 미리 끊지 않는다 (KAN-330)', async () => {
    window.AccenturyBridge = {
      requestMicPermission: vi.fn(),
      startVoiceItem: vi.fn(),
      getContractVersion: () => 2,
      getAccountKind: () => 'guest',
    }
    try {
      const fetchImpl = server(async () => jsonResponse(201, { reportId: 'r1' }))
      setup(fetchImpl)
      type('밥 먹었어?')
      submit()
      await screen.findByText('밥 뭇나?')
      fireEvent.click(screen.getByRole('button', { name: REPORT }))
      expect(await screen.findByText('신고했어요. 확인해 볼게요')).toBeInTheDocument()
    } finally {
      delete window.AccenturyBridge
    }
  })
})
