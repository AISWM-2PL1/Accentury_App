/**
 * 사투리 번역기 T-1 (KAN-256 2단계, 디자인 개정 KAN-347 6단계). 정본은 code wiki ux-ui.md 「사투리 번역기 화면」 절이고
 * 서식은 시안 s-03·s-04·s-04-limit·s-09-translator-waiting·s-09-error-C·s-09-error-input·s-10-translator-consent-sheet다.
 * 상태는 문서를 다시 로드하지 않고 이 화면 안에서 바꾼다.
 *
 * - 글자 수는 서버와 같은 코드 포인트(`[...text].length`)로 센다. 이모지 하나가 1자다.
 * - 입력을 고치면 결과·오류를 지우고, 그 전에 보낸 요청의 늦은 응답도 버린다(`requestId` 가드 —
 *   단어 학습의 `attemptId` 가드와 같은 방식). 옛 결과가 새 입력의 번역처럼 보이면 안 된다.
 * - 입력은 어디에도 저장하지 않는다(localStorage 등 금지, ux-ui 결정 — Gemini 무료 등급 전송이라).
 *   localStorage에 남는 것은 Gemini 전송 동의 여부뿐이다(`translatorConsentStore`, KAN-304).
 * - 탭 바는 모든 상태에서 선다. `CLIENT_NOT_SIGNED_IN`이면 App의 `useAccountTabs`가 토큰이 없어 그리지 않는다.
 *
 * KAN-304: App Store 심사(1.0 빌드 13)가 5.1.1(i)·5.1.2(i)로 거절했다(2026-10-30) — 입력 문장이 Google LLC의
 * Gemini API로 가는데 누구에게 보내는지 밝히지 않고, 보내기 전 허락도 받지 않았다는 것이다. 그래서 미동의
 * 상태의 첫 번역(↓)은 요청 대신 동의 시트(`TranslatorConsentSheet`)를 띄우고, [동의하고 보내기]를 눌러야
 * 그 입력을 보낸다. 동의는 기기마다 한 번이다. 입력 아래 상시 고지도 받는 곳(Google Gemini API)을 말한다.
 * 방침 고지로 동의를 갈음한 2026-10-08 결정은 2026-11-02 팀장 결정으로 철회됐다. [다시 시도]는 이미 동의한
 * 뒤에만 닿는 자리라 다시 묻지 않는다.
 *
 * KAN-317: 방향 전환(표준어 → 사투리 / 사투리 → 표준어). 방향은 메모리에만 두고 화면을 다시 열면
 * 표준어 → 사투리로 돌아간다. 결과·오류가 있을 때 바꾸면 입력은 두고 결과·오류만 지운다 — 결과 문장을
 * 입력으로 올리지 않는다(팀 결정). 동의는 방향과 무관하게 한 번이다. 구 서버(KAN-316 전)가 toStandard에 사투리만
 * 주면 「지금은 표준어로 바꾸기를 쓸 수 없어요」, 재시도 없음(`translationApi` 주석).
 *
 * KAN-347 6단계: 「표준어 ⇄ 경남 사투리」 가운데 원형 ⇄ 버튼, 입력 카드와 결과 카드 사이 원형 ↓ 번역 버튼.
 * 오류는 셋으로 갈린다 — 다시 보내면 될 수 있는 것(503·네트워크 등 retryable)은 가운데 대화상자, 입력을 고쳐야 하는 것
 * (422·100자 초과·구서버 방향)은 입력 카드 아래 한 줄(`aria-invalid`), 그 밖의 재시도 불가(로그인 없음·401·응답 모양 오류)는
 * 결과 카드 자리에 문구만([다시 시도] 없음). 하루 한도(429, 또는 응답 `remaining` 0)는 결과 카드 자리를
 * 「이용 안내」 카드로 바꾸고 ↓를 잠근다. 한도는 이 화면 안에서만 기억한다(다음 날 판단은 서버 몫).
 * 상태가 바뀌어도 제목·입력 카드의 윗선은 그대로다(7장 공통 틀 6-1-1) — 상태마다 바뀌는 것은 카드 높이뿐이다.
 */

import { useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { PrivacyPolicyLink } from '../legal/PrivacyPolicyLink'
import { CLIENT_NOT_SIGNED_IN, WordLearningError, type WordApiDeps } from '../learning/wordApi'
import { shareResult } from '../share/shareResult'
import { Button, Dialog } from '../ui'
import { ArrowDownIcon, CopyIcon, RefreshIcon, ShareLineIcon, SwapLineIcon, WarningIcon } from '../ui/icons'
import { TranslatorConsentSheet } from './TranslatorConsentSheet'
import { readTranslatorConsent, writeTranslatorConsent } from './translatorConsentStore'
import { TRANSLATOR_NOTICE } from './translatorConsentText'
import {
  TRANSLATION_DAILY_LIMIT_EXCEEDED,
  TRANSLATION_DIRECTION_UNSUPPORTED,
  TRANSLATION_REJECTED,
  TRANSLATION_TOO_LONG,
  VALIDATION_FAILED,
  reportTranslation,
  translate,
  type TranslationDirection,
} from './translationApi'
import './translator.css'

export const MAX_CHARS = 100

const TOO_LONG_MESSAGE = '100자까지 쓸 수 있어요'
const SIGN_IN_MESSAGE = '로그인하면 사투리 번역기를 쓸 수 있어요'
/** 한도 카드 기본 본문 - 응답 `remaining` 0으로 닫혔거나 429 문구에서 한도 종류를 못 읽었을 때 (KAN-347 6-6) */
const LIMIT_BODY = '번역은 하루 5번까지예요.'

/**
 * 429 `TRANSLATION_DAILY_LIMIT_EXCEEDED`의 한도 카드 본문 (KAN-361). 서버는 같은 코드로 두 한도를 보내고 문구만 다르다 -
 * 성공 5건 소진은 「오늘 번역 횟수(5회)를 …」, LLM 호출 20번 소진은 「오늘 번역 요청 횟수(20회)를 …」(KAN-322). 서버 오류
 * 문구는 합쇼체라 카드 제목(해요체)과 한 카드에 섞이므로, 문구에서 한도 종류와 숫자만 읽어 해요체로 다시 쓴다. 읽지 못하면
 * 기본 본문이다 - 서버 문구를 바꾸면 이 판별과 `TranslatorScreen.test.tsx`의 서버 문구 상수를 같이 바꾼다.
 */
export function limitBody(serverMessage: string): string {
  const calls = /요청 횟수\((\d+)회\)/.exec(serverMessage)
  if (calls) return `번역 요청은 하루 ${calls[1]}번까지예요.`
  const translations = /번역 횟수\((\d+)회\)/.exec(serverMessage)
  if (translations) return `번역은 하루 ${translations[1]}번까지예요.`
  return LIMIT_BODY
}
const STANDARD = '표준어'
const DIALECT = '경남 사투리'
/** 입력을 고치면 풀리는 재시도 불가 오류. 이것만 입력 카드 아래 줄과 `aria-invalid`로 간다 */
const INPUT_ERROR_CODES = new Set<string>([TRANSLATION_REJECTED, TRANSLATION_TOO_LONG, TRANSLATION_DIRECTION_UNSUPPORTED])

/*
 * 공유 카드 자산. 링크는 서버가 결과 공유에 주는 `web-test-url` 기본값(`Accentury_Server`
 * `application.yml` `share.web-test-url`, KAN-30 확정) 그대로이고, 이미지는 사이트 OG 카드다
 * (`index.html` og:image). 네이티브 `parseSharePayload`가 https imageUrl을 요구해서 비울 수 없다 —
 * 번역기용 이미지 카드는 만들지 않기로 했다(2026-10-14 사용자 결정).
 */
const SHARE_LINK = 'https://accentury.app/t?c=kko_share'
const SHARE_IMAGE = 'https://accentury.app/og-card-v3.png'
/** 네이티브 `parseSharePayload` 문구 상한(UTF-16 200). 넘으면 네이티브가 조용히 버린다 */
const SHARE_TEXT_MAX = 200

type Status =
  | { kind: 'idle' }
  | { kind: 'waiting' }
  | { kind: 'done'; id: number; source: string; result: string; direction: TranslationDirection; remaining: number | null }
  /** 입력을 고쳐야 하는 실패 — 입력 카드 아래 한 줄 */
  | { kind: 'inputError'; message: string }
  /** 입력 탓이 아닌 재시도 불가 실패(로그인 없음·401·응답 모양 등) — 결과 카드 자리에 문구만, [다시 시도] 없음 */
  | { kind: 'blocked'; message: string }
  /** 다시 보내면 될 수 있는 실패 — 가운데 대화상자 */
  | { kind: 'failed'; retryText: string }

export interface TranslatorScreenProps {
  apiBase: string
  /** 하단 탭 바 (KAN-252). App이 앱 안에서만 넘긴다 */
  tabBar?: ReactNode
  /** 테스트 주입용 (fetch·토큰 대체) */
  deps?: WordApiDeps
}

export function TranslatorScreen({ apiBase, tabBar, deps }: TranslatorScreenProps) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [direction, setDirection] = useState<TranslationDirection>('toDialect')
  /** 동의 시트가 떠 있는 동안 보낼 입력. null이면 시트가 없다 */
  const [consentPending, setConsentPending] = useState<string | null>(null)
  /**
   * 오늘 한도를 다 썼을 때 한도 카드 본문(429 또는 응답 `remaining` 0). null이면 한도 전이다. 화면을 다시 열면 잊는다 - 다음 날
   * 판단은 서버가 한다. 429는 서버 문구에서 한도 종류를 읽는다(`limitBody`, KAN-361)
   */
  const [limitMessage, setLimitMessage] = useState<string | null>(null)
  const limitReached = limitMessage !== null
  const requestId = useRef(0)

  const length = [...text].length
  const tooLong = length > MAX_CHARS
  const canSubmit = text.trim() !== '' && !tooLong && status.kind !== 'waiting' && !limitReached
  const inlineError = tooLong ? TOO_LONG_MESSAGE : status.kind === 'inputError' ? status.message : null
  // 결과는 받은 그대로 보여 주고, 다음 시도(입력 수정·방향 전환)부터 한도 카드다 (확정된 결정 「번역 한도」)
  const showLimit = limitReached && status.kind !== 'done'

  /*
   * 입력을 고치면 대기 중 동의도 취소한다(시트를 닫는다). 결과·오류를 지우는 것과 같은 원리다 — 시트가 묻고
   * 있던 문장이 더는 화면의 문장이 아니다. Codex 교차 검증(2026-11-03)이 실브라우저에서 동의 버튼부터
   * Shift+Tab으로 배경 입력창에 닿아 B로 고친 뒤 [동의하고 보내기]를 누르면 옛 문장 A가 전송되는 것을 재현했다.
   * 배경 `inert`가 그 길을 막고, 이 취소는 그래도 입력이 바뀌는 경우의 두 번째 방어다.
   */
  const onChange = (next: string) => {
    requestId.current += 1
    setText(next)
    setStatus({ kind: 'idle' })
    setConsentPending(null)
  }

  /*
   * 방향을 바꾸면 결과·오류·대기 중 동의를 지우고 늦은 응답도 버린다(`onChange`와 같은 무효화). 앞 방향의
   * 결과가 새 방향의 번역처럼 보이면 안 된다. 입력은 그대로 둔다(팀 결정 — 같은 문장을 반대로 바꿔 보는 흐름).
   */
  const onToggleDirection = () => {
    requestId.current += 1
    setDirection(direction === 'toDialect' ? 'toStandard' : 'toDialect')
    setStatus({ kind: 'idle' })
    setConsentPending(null)
  }

  const run = (input: string) => {
    const id = ++requestId.current
    setStatus({ kind: 'waiting' })
    translate(apiBase, input, direction, deps).then(
      ({ result, remaining }) => {
        if (requestId.current !== id) return
        setStatus({ kind: 'done', id, source: input, result, direction, remaining })
        if (remaining === 0) setLimitMessage(LIMIT_BODY)
      },
      (error: unknown) => {
        if (requestId.current !== id) return
        const e = error instanceof WordLearningError ? error : new WordLearningError(String(error), null, true)
        if (e.code === TRANSLATION_DAILY_LIMIT_EXCEEDED) setLimitMessage(limitBody(e.message))
        // 400은 빈 입력과 같은 처리다 (ux-ui 상태 표) — FE 검증을 지나 왔다면 보일 것이 없다. 429 한도는 한도 카드가 말한다
        if (e.code === VALIDATION_FAILED || e.code === TRANSLATION_DAILY_LIMIT_EXCEEDED) setStatus({ kind: 'idle' })
        else if (e.retryable) setStatus({ kind: 'failed', retryText: input })
        else if (INPUT_ERROR_CODES.has(e.code ?? '')) setStatus({ kind: 'inputError', message: errorMessage(e) })
        else setStatus({ kind: 'blocked', message: errorMessage(e) })
      },
    )
  }

  const onSubmit = () => {
    const input = text.trim()
    if (readTranslatorConsent()) run(input)
    else setConsentPending(input)
  }

  const onAgree = () => {
    const input = consentPending
    writeTranslatorConsent()
    setConsentPending(null)
    if (input !== null) run(input)
  }

  const inputRef = useRef<HTMLTextAreaElement>(null)
  /*
   * [닫기]·Escape — 초점을 입력칸으로 돌린다(열 때 초점이 대화상자로 옮겨 가 닫으면 갈 곳이 없어진다). 배경 `inert`가 풀린
   * 뒤라야 초점이 들어가므로 상태를 먼저 그려(flushSync) 놓고 옮긴다. [다시 시도]는 재전송 흐름이라 여기를 거치지 않는다
   */
  const closeDialog = () => {
    flushSync(() => setStatus({ kind: 'idle' }))
    inputRef.current?.focus({ preventScroll: true })
  }

  // 시트·대화상자가 떠 있는 동안 배경은 키보드 초점도 못 받는다. aria-modal·배경 막은 포인터만 막는다(위 onChange 주석)
  const sheetOpen = consentPending !== null
  const modalOpen = sheetOpen || status.kind === 'failed'
  // 접근성 이름은 지금 방향을 글자로 말한다(KAN-317). 보이는 「표준어 ⇄ 경남 사투리」는 버튼 밖 글자다
  const directionLabel = direction === 'toDialect' ? '표준어 → 사투리' : '사투리 → 표준어'
  const inputLanguage = direction === 'toDialect' ? STANDARD : DIALECT
  const outputLanguage = direction === 'toDialect' ? DIALECT : STANDARD
  const stackClass = [
    'translator-stack',
    (status.kind === 'done' || showLimit) && 'translator-stack--compact',
    inlineError && 'translator-stack--error',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <main className="item-screen translator" inert={modalOpen}>
        {/* 탭 화면 제목 윗선 y=80, 입력 화면 제목 26 (KAN-347 1단계, 시안 s-03) */}
        <h1 className="type-headline tab-title">사투리 번역기</h1>
        {/* 두 언어 이름은 자리만 바꾼다(움직임 타일 7). 읽는 순서가 그림과 갈리지 않게 보조기기에는 버튼 이름 하나로 말한다 */}
        <div className={`translator-pair${direction === 'toStandard' ? ' translator-pair--swapped' : ''}`}>
          <span className="translator-pair__lang translator-pair__lang--standard" aria-hidden="true">
            {STANDARD}
          </span>
          <button
            type="button"
            className="translator-pair__toggle"
            disabled={status.kind === 'waiting'}
            aria-label={`번역 방향 바꾸기, 현재 ${directionLabel}`}
            onClick={onToggleDirection}
          >
            <SwapLineIcon />
          </button>
          <span className="translator-pair__lang translator-pair__lang--dialect" aria-hidden="true">
            {DIALECT}
          </span>
        </div>
        <p className="translator-rule">하루 5번까지 번역할 수 있어요</p>
        <div className={stackClass}>
          <div className="translator-card">
            <label className={languageLabelClass(inputLanguage)} htmlFor="translator-input">
              {inputLanguage}
            </label>
            {/* 접근성 이름이 보이는 라벨(「표준어」「경남 사투리」)을 품는다 — WCAG 2.5.3 */}
            <textarea
              ref={inputRef}
              id="translator-input"
              className="translator-card__input"
              aria-label={`${inputLanguage} 문장`}
              aria-invalid={inlineError ? true : undefined}
              aria-describedby={inlineError ? 'translator-input-error' : undefined}
              placeholder={`${inputLanguage} 문장을 적어 주세요`}
              value={text}
              onChange={(event) => onChange(event.target.value)}
            />
            <p className={`translator-card__counter${tooLong ? ' translator-card__counter--over' : ''}`}>{`${length}/${MAX_CHARS}`}</p>
          </div>
          {inlineError && (
            <p className="translator-error" id="translator-input-error" role="alert">
              <WarningIcon size={16} />
              {inlineError}
            </p>
          )}
          <Button
            className="translator-go"
            disabled={!canSubmit}
            aria-label="번역하기"
            aria-describedby={showLimit ? 'translator-limit' : undefined}
            onClick={onSubmit}
          >
            <ArrowDownIcon size={24} />
          </Button>
          {showLimit ? (
            <div className="translator-card translator-card--output translator-card--limit" id="translator-limit" role="status">
              <span className="translator-card__label translator-card__label--plain">이용 안내</span>
              <h2 className="translator-limit__title">하루 한도를 다 사용했어요.</h2>
              <p className="translator-limit__body">{limitMessage}</p>
            </div>
          ) : (
            <div className={`translator-card translator-card--output${status.kind === 'done' ? ' translator-card--result' : ''}`}>
              <span className={languageLabelClass(outputLanguage)}>{outputLanguage}</span>
              {status.kind === 'done' ? (
                <TranslatorResult key={status.id} source={status.source} result={status.result} remaining={status.remaining} />
              ) : status.kind === 'waiting' ? (
                <>
                  <div className="translator-wait" aria-hidden="true">
                    <i />
                    <i />
                  </div>
                  <p className="translator-card__empty" role="status">
                    번역 중이에요
                  </p>
                </>
              ) : status.kind === 'blocked' ? (
                <p className="translator-card__empty" role="alert">
                  {status.message}
                </p>
              ) : (
                <p className="translator-card__empty" role="status">
                  번역한 문장이 여기 나와요
                </p>
              )}
            </div>
          )}
        </div>
        {status.kind === 'done' && (
          <TranslatorReport
            key={status.id}
            onReport={() => reportTranslation(apiBase, { direction: status.direction, text: status.source, result: status.result }, deps)}
          />
        )}
        <div className="translator-notices">
          <p className="translator-notice">
            <InfoIcon />
            {TRANSLATOR_NOTICE}
            <PrivacyPolicyLink />
          </p>
          <p className="translator-notice">AI 번역이라 실제 표현과 다를 수 있어요</p>
        </div>
      </main>
      {/* 탭 바는 position: fixed라 래퍼 div가 레이아웃에 끼지 않는다. `body:has(.tab-bar)`도 후손 매칭이라 그대로다 */}
      {tabBar && <div inert={modalOpen}>{tabBar}</div>}
      {sheetOpen && <TranslatorConsentSheet onAgree={onAgree} onCancel={() => setConsentPending(null)} />}
      {status.kind === 'failed' && (
        <Dialog
          title="번역하지 못했어요"
          description="인터넷 연결이 불안정하거나 잠시 사용량이 많아요. 잠시 뒤 다시 시도해 주세요"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeDialog()
          }}
          actions={
            <>
              {/* [닫기]는 입력을 남긴다 — 고쳐서 보내거나 그대로 다시 누를 수 있다 */}
              <Button variant="secondary" onClick={closeDialog}>
                닫기
              </Button>
              <Button autoFocus onClick={() => run(status.retryText)}>
                <RefreshIcon />
                다시 시도
              </Button>
            </>
          }
        />
      )}
    </>
  )
}

/** 카드 라벨. 경남 사투리는 벽돌 점, 표준어는 빈 원 (시안 `.translator-card-label`) */
function languageLabelClass(language: string): string {
  return `translator-card__label${language === DIALECT ? ' translator-card__label--dialect' : ''}`
}

function errorMessage(error: WordLearningError): string {
  switch (error.code) {
    case CLIENT_NOT_SIGNED_IN:
      return SIGN_IN_MESSAGE
    case TRANSLATION_REJECTED:
      return '올바른 문장을 넣어 주세요'
    case TRANSLATION_TOO_LONG:
      return TOO_LONG_MESSAGE
    default:
      // TRANSLATION_DIRECTION_UNSUPPORTED·UNAUTHENTICATED·응답 모양 오류 등은 만든 쪽 문구 그대로 (ux-ui 상태 표 「오류 문구 그대로」)
      return error.message
  }
}

/** 상시 고지 앞 (i) — 시안 s-03 `.v13-notice` 그림. 공용 아이콘에 없어 번역기 안에만 둔다 */
function InfoIcon() {
  return (
    <svg
      className="translator-notice__icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6m0-10v1" />
    </svg>
  )
}

/*
 * 복사 안내는 토스트가 아니라 버튼 이름을 잠깐 「복사했어요」로 바꾼다 (KAN-256 2단계 결정, ux-ui 절). 버튼이 아이콘만
 * 남은 뒤로(KAN-347 6단계)는 같은 문구를 카드 왼쪽 아래 「오늘 n번 남았어요」 자리에 2초 보여 준다 — 눈으로도 보여야 한다.
 * 실패(비보안 컨텍스트라 clipboard가 없는 개발 WebView 등)는 같은 자리에 「복사하지 못했어요」.
 */
function TranslatorResult({ source, result, remaining }: { source: string; result: string; remaining: number | null }) {
  const [copyLabel, setCopyLabel] = useState('복사')

  const copy = () => {
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(result))
      .then(
        () => setCopyLabel('복사했어요'),
        () => setCopyLabel('복사하지 못했어요'),
      )
      .finally(() => setTimeout(() => setCopyLabel('복사'), 2000))
  }

  const share = () => {
    let shareText = `${source} → ${result}`
    if (shareText.length > SHARE_TEXT_MAX) {
      // 코드 포인트 단위로 잘라 서로게이트 쌍을 쪼개지 않는다
      const chars = [...shareText]
      while (chars.join('').length > SHARE_TEXT_MAX - 1) chars.pop()
      shareText = `${chars.join('')}…`
    }
    shareResult({ imageUrl: SHARE_IMAGE, text: shareText, webTestUrl: SHARE_LINK })
  }

  return (
    <>
      <p className="translator-result__text">{result}</p>
      <div className="translator-result__foot">
        {copyLabel !== '복사' ? (
          <p className="translator-result__meta" role="status">
            {copyLabel}
          </p>
        ) : (
          // 구서버(`remaining` 없음)면 숨긴다 (6-4)
          remaining !== null && (
            <p className="translator-result__meta">
              오늘 <span className="translator-result__count">{remaining}</span>번 남았어요
            </p>
          )
        )}
        <div className="translator-result__actions">
          <button type="button" className="translator-icon-button" aria-label={copyLabel} onClick={copy}>
            <CopyIcon />
          </button>
          <button type="button" className="translator-icon-button" aria-label="공유" onClick={share}>
            <ShareLineIcon />
          </button>
        </div>
      </div>
    </>
  )
}

/*
 * 신고 상태는 결과 하나에 묶인다 (KAN-331·KAN-344). 새로 바꾸면 결과가 대기 → 새 결과로 다시 그려져(`key`) 상태가 처음으로
 * 돌아간다 — 결과마다 한 번이다. 보내는 중엔 버튼을 잠가 연타가 두 번 보내지 않게 하고, 실패하면 다시 누를 수 있다.
 * KAN-347 6단계는 모양만 결과 카드 아래 글자 링크로 바꿨다(시안 s-04). 누르는 높이는 48을 지킨다.
 */
type ReportState = 'idle' | 'sending' | 'sent' | 'failed'

function TranslatorReport({ onReport }: { onReport: () => Promise<unknown> }) {
  const [report, setReport] = useState<ReportState>('idle')
  // state는 다음 렌더까지 안 바뀌어 같은 틱의 두 번째 클릭을 못 막는다 — ref로 한 번 더 잠근다
  const reporting = useRef(false)

  const sendReport = () => {
    if (reporting.current) return
    reporting.current = true
    setReport('sending')
    onReport().then(
      () => setReport('sent'),
      () => {
        reporting.current = false
        setReport('failed')
      },
    )
  }

  if (report === 'sent') {
    return (
      <p className="translator-report translator-report--note" role="status">
        신고했어요. 확인해 볼게요
      </p>
    )
  }
  return (
    <>
      <button type="button" className="translator-report" disabled={report === 'sending'} onClick={sendReport}>
        부적절한 결과 신고
      </button>
      {report === 'failed' && (
        <p className="translator-report-error" role="alert">
          신고하지 못했어요. 잠시 뒤 다시 눌러 주세요
        </p>
      )}
    </>
  )
}
