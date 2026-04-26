import { describe, it, expect } from 'vitest'
import { cosineSimilarity } from '../lib/embedding'

describe('cosineSimilarity', () => {
  it('同一ベクトルは 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6)
  })

  it('正反対ベクトルは -1', () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 6)
  })

  it('直交ベクトルは 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6)
  })

  it('長さが違うと 0 を返す', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })

  it('ゼロベクトルは 0 を返す', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
  })

  it('スカラ倍したベクトルは類似度 1', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6)
  })
})
