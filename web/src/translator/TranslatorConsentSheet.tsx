/**
 * 사투리 번역기 Google Gemini 전송 동의 시트 (KAN-304). 미동의 상태의 첫 [바꾸기]에서 T-1 위를 덮는다.
 * 문안 정본은 `translatorConsentText.ts`, 동의 저장은 `translatorConsentStore.ts`다.
 *
 * 구조·접근성은 광고 동의 시트(`ads/AdConsentSheet.tsx`)를 그대로 따른다. `role="dialog"` +
 * `aria-modal`로 뒤의 입력 화면을 보조기기에서 떼어 놓고, 배경 막(`.ad-consent-sheet`의 `fixed; inset: 0`)이
 * 입력창·[바꾸기]를 덮어 시트가 떠 있는 동안 입력을 고칠 수 없다. 제목이 h2인 것도 같은 이유다 —
 * 화면 이름(h1 「사투리 번역기」)은 하나여야 한다.
 *
 * 클래스는 `.ad-consent-*`를 다시 쓴다. 이름이 광고 전용으로 읽히지만 종이 시트 한 장의 모양은 같고,
 * 새 CSS를 두 벌 두면 디자인을 고칠 때 한쪽이 빠진다.
 *
 * Escape는 듣지 않는다(광고 시트와 같은 판단). [취소]가 곧 닫는 길이고, 취소해도 잃는 것이 없다.
 *
 * ## 버튼 무게가 광고 시트와 다르다
 *
 * 광고 시트는 두 버튼이 같은 보조 버튼이다 — 두 선택이 모두 끝 상태라 한쪽만 주버튼이면 그쪽으로
 * 기울이는 화면이 된다(App Store 5.1.1의 "동등한 선택"). 여기는 사정이 다르다. [동의하고 보내기]는
 * 사용자가 방금 누른 [바꾸기]의 연장이고, [취소]는 아무것도 보내지 않고 입력 화면으로 돌아가는 것이다.
 * 취소해도 기능을 못 쓰게 되는 것이 아니라 보내지 않을 뿐이라, 동의 쪽을 주버튼으로 두는 것은 기울임이
 * 아니다. 초점도 그 버튼에서 시작한다.
 */

import { PrivacyPolicyLink } from '../legal/PrivacyPolicyLink'
import { Button } from '../ui'
import {
  TRANSLATOR_CONSENT_AGREE,
  TRANSLATOR_CONSENT_CANCEL,
  TRANSLATOR_CONSENT_DETAIL_LEAD,
  TRANSLATOR_CONSENT_DETAIL_TAIL,
  TRANSLATOR_CONSENT_GOOGLE_NOTE,
  TRANSLATOR_CONSENT_LEAD,
  TRANSLATOR_CONSENT_TITLE,
} from './translatorConsentText'

export interface TranslatorConsentSheetProps {
  /** 동의했다. 저장·전송·닫기는 호출자 몫이다 */
  onAgree: () => void
  /** 보내지 않고 닫는다. 입력은 호출자가 그대로 둔다 */
  onCancel: () => void
}

const TITLE_ID = 'translator-consent-title'

export function TranslatorConsentSheet({ onAgree, onCancel }: TranslatorConsentSheetProps) {
  return (
    <div className="ad-consent-sheet">
      <div className="ad-consent-panel" role="dialog" aria-modal="true" aria-labelledby={TITLE_ID}>
        <h2 id={TITLE_ID} className="type-title ad-consent-title">
          {TRANSLATOR_CONSENT_TITLE}
        </h2>
        <div className="type-body-sm ad-consent-body">
          <p>{TRANSLATOR_CONSENT_LEAD}</p>
          <p className="ad-consent-muted">{TRANSLATOR_CONSENT_GOOGLE_NOTE}</p>
          <p className="ad-consent-muted">
            {TRANSLATOR_CONSENT_DETAIL_LEAD}
            <PrivacyPolicyLink />
            {TRANSLATOR_CONSENT_DETAIL_TAIL}
          </p>
        </div>
        <div className="ad-consent-actions">
          <Button autoFocus onClick={onAgree}>
            {TRANSLATOR_CONSENT_AGREE}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            {TRANSLATOR_CONSENT_CANCEL}
          </Button>
        </div>
      </div>
    </div>
  )
}
