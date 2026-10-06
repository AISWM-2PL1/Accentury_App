/**
 * 지역 코드 표 (KAN-202). 확인하는 것은 **표가 백엔드 `Region.java`와 같은 열 개인가**다. 빌드
 * 스위치는 KAN-274가 걷어냈다 — 화면이 늘 선다는 것은 `App.test.tsx`가 본다.
 *
 * 표 검사는 코드 하나하나가 아니라 개수·중복·양 끝 순서를 본다. 코드를 전부 다시 적으면 표를
 * 복사한 것일 뿐이라 실수를 잡지 못한다 — 백엔드와의 실제 대조는 E2E(3단계)가 한다.
 */

import { describe, expect, it } from 'vitest'
import { isRegionCode, REGIONS } from './regions'

describe('REGIONS — 백엔드 Region.java의 거울', () => {
  it('서버가 받아 주는 코드는 열 개이고 겹치지 않는다', () => {
    const codes = REGIONS.map((region) => region.code)

    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
  })

  it('순서가 KAN-202 표를 따른다 — 화면 나열 순서가 이 배열이다', () => {
    expect(REGIONS[0].code).toBe('SEOUL')
    expect(REGIONS.at(-1)?.code).toBe('JEJU')
  })

  it('모든 항목에 화면에 보일 한글 표기가 있다', () => {
    for (const region of REGIONS) {
      expect(region.label.trim()).not.toBe('')
    }
  })
})

describe('isRegionCode — 서버가 400으로 돌려줄 값을 미리 거른다', () => {
  it('표의 코드는 통과한다', () => {
    expect(isRegionCode('SEOUL')).toBe(true)
    expect(isRegionCode('JEJU')).toBe(true)
  })

  it('대소문자가 다르면 코드가 아니다 — 서버는 name().equals로 비교한다', () => {
    expect(isRegionCode('seoul')).toBe(false)
  })

  it('UNKNOWN은 서버 저장 전용이라 요청 코드가 아니다 — 실어 보내면 400이다', () => {
    expect(isRegionCode('UNKNOWN')).toBe(false)
  })

  it('빈 문자열과 문자열 아닌 값은 코드가 아니다', () => {
    expect(isRegionCode('')).toBe(false)
    expect(isRegionCode(null)).toBe(false)
    expect(isRegionCode(undefined)).toBe(false)
    expect(isRegionCode(0)).toBe(false)
  })
})
