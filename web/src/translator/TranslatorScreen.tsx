/**
 * 사투리 번역기 T-1 (KAN-256 2단계). 정본은 code wiki ux-ui.md 「사투리 번역기 화면 (KAN-256)」 절이다 —
 * 배치·상태 표를 그대로 옮겼다. 상태는 문서를 다시 로드하지 않고 이 화면 안에서 바꾼다.
 *
 * - 글자 수는 서버와 같은 코드 포인트(`[...text].length`)로 센다. 이모지 하나가 1자다.
 * - 입력을 고치면 결과·오류를 지우고, 그 전에 보낸 요청의 늦은 응답도 버린다(`requestId` 가드 —
 *   단어 학습의 `attemptId` 가드와 같은 방식). 옛 결과가 새 입력의 번역처럼 보이면 안 된다.
 * - 입력은 어디에도 저장하지 않는다(localStorage 등 금지, ux-ui 결정 — Gemini 무료 등급 전송이라).
 * - 탭 바는 모든 상태에서 선다. `CLIENT_NOT_SIGNED_IN`이면 App의 `useAccountTabs`가 토큰이 없어 그리지 않는다.
 */

import { useRef, useState, type ReactNode } from 'react'
import { PrivacyPolicyLink } from '../legal/PrivacyPolicyLink'
import { CLIENT_NOT_SIGNED_IN, WordLearningError, type WordApiDeps } from '../learning/wordApi'
import { shareResult } from '../share/shareResult'
import { Button } from '../ui'
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
  const requestId = useRef(0)

  const length = [...text].length
  const tooLong = length > MAX_CHARS
  const canSubmit = text.trim() !== '' && !tooLong && status.kind !== 'waiting'

  const onChange = (next: string) => {
    requestId.current += 1
    setText(next)
    setStatus({ kind: 'idle' })
  }

  const run = (input: string) => {
    const id = ++requestId.current
    setStatus({ kind: 'waiting' })
    translate(apiBase, input, deps).then(
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

  return (
    <>
      <main className="item-screen">
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
            개인정보나 민감한 내용은 넣지 마세요 · <PrivacyPolicyLink />
          </p>
          <Button disabled={!canSubmit} onClick={() => run(text.trim())}>
            바꾸기
          </Button>
          <TranslatorStatus status={status} onRetry={run} />
        </div>
      </main>
      {tabBar}
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
