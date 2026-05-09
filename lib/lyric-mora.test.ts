import { describe, it, expect } from 'vitest'
import { splitMora, splitMoraLines } from './lyric-mora'

describe('splitMora', () => {
  it('単純なひらがなは 1 字 1 モーラ', () => {
    expect(splitMora('あいうえお')).toEqual(['あ', 'い', 'う', 'え', 'お'])
  })

  it('拗音は前のモーラに結合（きゃ・しゅ・ちょ）', () => {
    expect(splitMora('きゃしゅちょ')).toEqual(['きゃ', 'しゅ', 'ちょ'])
  })

  it('片仮名の拗音も結合（キャ・シュ・チョ）', () => {
    expect(splitMora('キャシュチョ')).toEqual(['キャ', 'シュ', 'チョ'])
  })

  it('促音は独立した 1 モーラ（っ）', () => {
    expect(splitMora('やった')).toEqual(['や', 'っ', 'た'])
  })

  it('長音は独立した 1 モーラ（ー）', () => {
    expect(splitMora('ハロー')).toEqual(['ハ', 'ロ', 'ー'])
  })

  it('句読点・スペースは除外', () => {
    expect(splitMora('こん、にちは。')).toEqual(['こ', 'ん', 'に', 'ち', 'は'])
    expect(splitMora('a b c')).toEqual(['a', 'b', 'c'])
  })

  it('漢字は 1 字 1 モーラ', () => {
    expect(splitMora('朝霧')).toEqual(['朝', '霧'])
  })

  it('ASCII / 全角英数も 1 字 1 モーラ', () => {
    expect(splitMora('Cafe')).toEqual(['C', 'a', 'f', 'e'])
  })

  it('混合文字列', () => {
    expect(splitMora('きょうの朝')).toEqual(['きょ', 'う', 'の', '朝'])
  })

  it('空文字は空配列', () => {
    expect(splitMora('')).toEqual([])
  })

  it('小書き仮名が先頭に来た場合は独立モーラ扱い（破綻させない）', () => {
    expect(splitMora('ゃ')).toEqual(['ゃ'])
  })
})

describe('splitMoraLines', () => {
  it('複数行をフラット配列に', () => {
    expect(splitMoraLines(['あい', 'うえ'])).toEqual(['あ', 'い', 'う', 'え'])
  })

  it('行ごとの拗音結合は維持', () => {
    expect(splitMoraLines(['きゃ', 'しゅ'])).toEqual(['きゃ', 'しゅ'])
  })
})
