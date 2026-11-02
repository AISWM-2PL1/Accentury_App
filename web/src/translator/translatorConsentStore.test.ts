import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readTranslatorConsent,
  resetTranslatorConsentMemory,
  TRANSLATOR_CONSENT_KEY,
  writeTranslatorConsent,
  type TranslatorConsentStorage,
} from './translatorConsentStore'

function fakeStorage(seed: Record<string, string> = {}): TranslatorConsentStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed))
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  }
}

afterEach(() => {
  resetTranslatorConsentMemory()
})

describe('translatorConsentStore — Gemini 전송 동의 (KAN-304)', () => {
  it('저장된 것이 없으면 false, 동의를 남기면 granted로 저장되고 다시 읽힌다', () => {
    const storage = fakeStorage()
    expect(readTranslatorConsent(storage)).toBe(false)

    writeTranslatorConsent(storage)
    expect(storage.map.get(TRANSLATOR_CONSENT_KEY)).toBe('granted')
    resetTranslatorConsentMemory()
    expect(readTranslatorConsent(storage)).toBe(true)
  })

  it('계약 밖 문자열은 false — 다시 묻는다', () => {
    expect(readTranslatorConsent(fakeStorage({ [TRANSLATOR_CONSENT_KEY]: 'yes' }))).toBe(false)
  })

  it('읽기가 던지는 저장소(쿠키 차단)에서도 false로 끝난다', () => {
    const storage: TranslatorConsentStorage = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
      setItem: () => {},
    }
    expect(readTranslatorConsent(storage)).toBe(false)
  })

  it('쓰기가 던져도 이 문서 안에서는 메모리 사본으로 동의가 이어진다', () => {
    const setItem = vi.fn(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    const storage: TranslatorConsentStorage = { getItem: () => null, setItem }

    expect(() => writeTranslatorConsent(storage)).not.toThrow()
    expect(setItem).toHaveBeenCalledOnce()
    expect(readTranslatorConsent(storage)).toBe(true)
  })

  it('reset은 사본만 비운다 — 저장소에 없으면 다시 false', () => {
    const storage: TranslatorConsentStorage = { getItem: () => null, setItem: () => {} }
    writeTranslatorConsent(storage)
    expect(readTranslatorConsent(storage)).toBe(true)
    resetTranslatorConsentMemory()
    expect(readTranslatorConsent(storage)).toBe(false)
  })
})
