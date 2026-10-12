import { describe, expect, it } from 'vitest'
import { waitingStage } from './intonationWaiting'

describe('waitingStage', () => {
  it('경과 시간 경계: 2.5초·6초에서 다음 단계로', () => {
    expect([0, 2499, 2500, 5999, 6000].map(waitingStage)).toEqual([1, 1, 2, 2, 3])
  })
})
