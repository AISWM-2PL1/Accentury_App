/**
 * 사투리 번역기 T-1 (KAN-256 2단계). 정본은 code wiki ux-ui.md 「사투리 번역기 화면 (KAN-256)」 절이다 —
 * 배치·상태 표를 그대로 옮겼다. 상태는 문서를 다시 로드하지 않고 이 화면 안에서 바꾼다.
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
 * 상태의 첫 [바꾸기]는 요청 대신 동의 시트(`TranslatorConsentSheet`)를 띄우고, [동의하고 보내기]를 눌러야
 * 그 입력을 보낸다. 동의는 기기마다 한 번이다. 입력창 아래 상시 고지도 받는 곳(Google Gemini API)을 말한다.
 * 방침 고지로 동의를 갈음한 2026-10-08 결정은 2026-11-02 팀장 결정으로 철회됐다. [다시 시도]는 이미 동의한
 * 뒤에만 닿는 자리라 다시 묻지 않는다.
 */

import { useRef, useState, type ReactNode } from 'react'
import { PrivacyPolicyLink } from '../legal/PrivacyPolicyLink'
import { CLIENT_NOT_SIGNED_IN, WordLearningError, type WordApiDeps } from '../learning/wordApi'
import { shareResult } from '../share/shareResult'
import { Button } from '../ui'
import { TranslatorConsentSheet } from './TranslatorConsentSheet'
import { readTranslatorConsent, writeTranslatorConsent } from './translatorConsentStore'
import { TRANSLATOR_NOTICE } from './translatorConsentText'
import {
  TRANSLATION_REJECTED,
  TRANSLATION_TOO_LONG,
  TRANSLATION_UNAVAILABLE,
  VALIDATION_FAILED,
  translate,
} from './translationApi'

export const MAX_CHARS = 100

const TOO_LONG_MESSAGE = '100자까지 쓸 수 있어요'
const SIGN_IN_MESSAGE = '로그인하면 사투리 번역기를 쓸 수 있어요'

/*
 * 공유 카드 자산. 링크는 서버가 결과 공유에 주는 `web-test-url` 기본값(`Accentury_Server`
 * `application.yml` `share.web-test-url`, KAN-30 확정) 그대로이고, 이미지는 사이트 OG 카드다
 * (`index.html` og:image). 네이티브 `parseSharePayload`가 https imageUrl을 요구해서 비울 수 없다 —
 * 번역기용 이미지 카드는 만들지 않기로 했다(2026-10-14 사용자 결정).
 */
const SHARE_LINK = 'https://accentury.app/t?c=kko_share'
const SHARE_IMAGE = 'https://accentury.app/og-card-v2.png'
/** 네이티브 `parseSharePayload` 문구 상한(UTF-16 200). 넘으면 네이티브가 조용히 버린다 */
const SHARE_TEXT_MAX = 200

type Status =
  | { kind: 'idle' }
  | { kind: 'waiting' }
  | { kind: 'done'; standard: string; dialect: string }
  | { kind: 'error'; error: WordLearningError; retryText: string }

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
  /** 동의 시트가 떠 있는 동안 보낼 입력. null이면 시트가 없다 */
  const [consentPending, setConsentPending] = useState<string | null>(null)
  const requestId = useRef(0)

  const length = [...text].length
  const tooLong = length > MAX_CHARS
  const canSubmit = text.trim() !== '' && !tooLong && status.kind !== 'waiting'

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

  const run = (input: string) => {
    const id = ++requestId.current
    setStatus({ kind: 'waiting' })
    translate(apiBase, input, 'toDialect', deps).then(
      (dialect) => {
        if (requestId.current === id) setStatus({ kind: 'done', standard: input, dialect })
      },
      (error: unknown) => {
        if (requestId.current !== id) return
        const e = error instanceof WordLearningError ? error : new WordLearningError(String(error), null, true)
        // 400은 빈 입력과 같은 처리다 (ux-ui 상태 표) — FE 검증을 지나 왔다면 보일 것이 없다
        setStatus(e.code === VALIDATION_FAILED ? { kind: 'idle' } : { kind: 'error', error: e, retryText: input })
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

  // 시트가 떠 있는 동안 배경은 키보드 초점도 못 받는다. aria-modal·배경 막은 포인터만 막는다(위 onChange 주석)
  const sheetOpen = consentPending !== null

  return (
    <>
      <main className="item-screen" inert={sheetOpen}>
        <h1 className="type-title">사투리 번역기</h1>
        <div className="item-screen__body">
          <label className="type-label" htmlFor="translator-input">
            표준어 문장
          </label>
          <textarea
            id="translator-input"
            className="feedback-textarea"
            value={text}
            onChange={(event) => onChange(event.target.value)}
          />
          <p className={`type-caption ${tooLong ? 'feedback-message' : 'feedback-counter'}`}>{`${length}/${MAX_CHARS}`}</p>
          {tooLong && <p className="type-caption feedback-message">{TOO_LONG_MESSAGE}</p>}
          <p className="type-caption feedback-hint">
            {TRANSLATOR_NOTICE}
            <PrivacyPolicyLink />
          </p>
          <Button disabled={!canSubmit} onClick={onSubmit}>
            바꾸기
          </Button>
          <TranslatorStatus status={status} onRetry={run} />
        </div>
      </main>
      {/* 탭 바는 position: fixed라 래퍼 div가 레이아웃에 끼지 않는다. `body:has(.tab-bar)`도 후손 매칭이라 그대로다 */}
      {tabBar && <div inert={sheetOpen}>{tabBar}</div>}
      {sheetOpen && <TranslatorConsentSheet onAgree={onAgree} onCancel={() => setConsentPending(null)} />}
    </>
  )
}

function TranslatorStatus({ status, onRetry }: { status: Status; onRetry: (input: string) => void }) {
  switch (status.kind) {
    case 'idle':
      return null
    case 'waiting':
      return <p className="type-body">바꾸는 중이에요</p>
    case 'done':
      return <TranslatorResult standard={status.standard} dialect={status.dialect} />
    case 'error': {
      const { error, retryText } = status
      return (
        <div className="feedback-actions" role="alert">
          <p className="type-body">{errorMessage(error)}</p>
          {error.retryable && (
            <Button variant="secondary" onClick={() => onRetry(retryText)}>
              다시 시도
            </Button>
          )}
        </div>
      )
    }
  }
}

function errorMessage(error: WordLearningError): string {
  switch (error.code) {
    case CLIENT_NOT_SIGNED_IN:
      return SIGN_IN_MESSAGE
    case TRANSLATION_REJECTED:
      return '올바른 문장을 넣어주세요'
    case TRANSLATION_TOO_LONG:
      return TOO_LONG_MESSAGE
    case TRANSLATION_UNAVAILABLE:
      return '지금은 바꿀 수 없어요. 잠시 뒤 다시 시도해 주세요'
    default:
      // UNAUTHENTICATED·네트워크·그 밖은 request가 만든 문구 그대로 (ux-ui 상태 표 「오류 문구 그대로」)
      return error.message
  }
}

/*
 * 복사 안내는 토스트가 아니라 버튼 라벨을 잠깐 「복사했어요」로 바꾼다 (KAN-256 2단계 결정, ux-ui 절) —
 * 화면에 토스트 자리가 없고, 누른 자리에서 바로 보인다. 실패(비보안 컨텍스트라 clipboard가 없는 개발
 * WebView 등)는 같은 자리에 「복사하지 못했어요」.
 */
function TranslatorResult({ standard, dialect }: { standard: string; dialect: string }) {
  const [copyLabel, setCopyLabel] = useState('복사')

  const copy = () => {
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(dialect))
      .then(
        () => setCopyLabel('복사했어요'),
        () => setCopyLabel('복사하지 못했어요'),
      )
      .finally(() => setTimeout(() => setCopyLabel('복사'), 2000))
  }

  const share = () => {
    let shareText = `${standard} → ${dialect}`
    if (shareText.length > SHARE_TEXT_MAX) {
      // 코드 포인트 단위로 잘라 서로게이트 쌍을 쪼개지 않는다
      const chars = [...shareText]
      while (chars.join('').length > SHARE_TEXT_MAX - 1) chars.pop()
      shareText = `${chars.join('')}…`
    }
    shareResult({ imageUrl: SHARE_IMAGE, text: shareText, webTestUrl: SHARE_LINK })
  }

  return (
    <div className="feedback-actions">
      <p className="type-body">{dialect}</p>
      <Button variant="secondary" onClick={copy}>
        {copyLabel}
      </Button>
      <Button variant="secondary" onClick={share}>
        공유
      </Button>
      <p className="type-caption feedback-hint">AI 번역이라 실제 표현과 다를 수 있어요</p>
    </div>
  )
}
