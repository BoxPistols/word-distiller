import { describe, it, expect } from 'vitest'
import { buildPrompt, parseFragments } from '../lib/prompt'
import type { CorpusItem } from '../lib/types'

describe('parseFragments', () => {
  it('正常なJSON応答をパースできる', () => {
    const raw = '{"fragments":["行A\\n行B","行C\\n行D","行E\\n行F"]}'
    const result = parseFragments(raw)
    expect(result).toHaveLength(3)
    expect(result[0]).toBe('行A\n行B')
  })

  it('JSON前後にゴミがあってもパースできる', () => {
    const raw = 'はい、以下です。\n{"fragments":["断片1","断片2","断片3"]}\n以上です。'
    const result = parseFragments(raw)
    expect(result).toHaveLength(3)
    expect(result[0]).toBe('断片1')
  })

  it('JSONが壊れている場合はブロック分割にフォールバック', () => {
    const raw = '最初のブロックです。9文字以上。\n\n二番目のブロックです。9文字以上。\n\n三番目のブロック。9文字以上。'
    const result = parseFragments(raw)
    expect(result.length).toBeGreaterThanOrEqual(2)
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('ブロック分割もできない場合は全体を1つの断片として返す', () => {
    const raw = 'これは十分に長い単一の断片テキストです'
    const result = parseFragments(raw)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(raw)
  })

  it('短すぎるテキストは空配列を返す', () => {
    expect(parseFragments('短い')).toEqual([])
    expect(parseFragments('')).toEqual([])
  })

  it('fragments配列が空のJSONはフォールバックし全体を返す', () => {
    const raw = '{"fragments":[]}'
    const result = parseFragments(raw)
    // JSONパースは成功するが空配列→フォールバック→全体が9文字以上なので1断片
    expect(result).toEqual([raw])
  })
})

describe('buildPrompt', () => {
  it('入力と散漫度をプロンプトに含める', () => {
    const result = buildPrompt('雪', 0, [])
    expect(result).toContain('入力: 雪')
    expect(result).toContain('距離を最小')
  })

  it('散漫度が高い場合は対応する指示を含める', () => {
    const result = buildPrompt('雪', 4, [])
    expect(result).toContain('最大限に遠ざけよ')
  })

  it('採用コーパスがあればRAGとして含める', () => {
    const corpus: CorpusItem[] = [
      { id: '1', text: '採用された断片', input: '雪', verdict: 'accepted', reason: '', tags: [], created_at: '' },
    ]
    const result = buildPrompt('氷', 2, corpus)
    expect(result).toContain('過去に採用された断片')
    expect(result).toContain('採用された断片')
  })

  it('採用コーパスが空ならRAGを含めない', () => {
    const result = buildPrompt('氷', 2, [])
    expect(result).not.toContain('過去に採用された断片')
  })
})
