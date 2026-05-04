import { describe, expect, test } from 'vitest'
import { splitForTts } from '../chunk'

describe('splitForTts', () => {
  test('空文字は空配列', () => {
    expect(splitForTts('')).toEqual([])
  })

  test('句点で分割される', () => {
    expect(splitForTts('一文目。二文目。三文目。'))
      .toEqual(['一文目。', '二文目。', '三文目。'])
  })

  test('改行で分割される', () => {
    expect(splitForTts('一行目\n二行目\n\n三行目'))
      .toEqual(['一行目', '二行目', '三行目'])
  })

  test('感嘆符・疑問符でも分割', () => {
    expect(splitForTts('はい！本当に？うん。'))
      .toEqual(['はい！', '本当に？', 'うん。'])
  })

  test('短文はそのまま', () => {
    expect(splitForTts('これは短文です'))
      .toEqual(['これは短文です'])
  })

  test('maxLen 超過は読点で再分割', () => {
    const long = 'あ'.repeat(50) + '、' + 'い'.repeat(50) + '、' + 'う'.repeat(50) + '。'
    const r = splitForTts(long, 60)
    expect(r.length).toBeGreaterThan(1)
    for (const c of r) expect(c.length).toBeLessThanOrEqual(120) // 1セグ自体が長い場合は分割不能で許容
  })

  test('前後空白は除去', () => {
    expect(splitForTts('  一文目。  二文目。  '))
      .toEqual(['一文目。', '二文目。'])
  })
})
