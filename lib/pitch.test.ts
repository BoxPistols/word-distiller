import { describe, it, expect } from 'vitest'
import { transposePitch } from './pitch'

describe('transposePitch', () => {
  it('C4 + 0 = C4', () => {
    expect(transposePitch('C4', 0)).toBe('C4')
  })

  it('C4 + 4 半音 = E4', () => {
    expect(transposePitch('C4', 4)).toBe('E4')
  })

  it('C4 + 7 半音 = G4', () => {
    expect(transposePitch('C4', 7)).toBe('G4')
  })

  it('C4 + 12 = C5（オクターブ繰り上がり）', () => {
    expect(transposePitch('C4', 12)).toBe('C5')
  })

  it('B4 + 1 = C5（オクターブ境界）', () => {
    expect(transposePitch('B4', 1)).toBe('C5')
  })

  it('C4 - 1 = B3（負方向、オクターブ繰り下がり）', () => {
    expect(transposePitch('C4', -1)).toBe('B3')
  })

  it('C4 - 12 = C3', () => {
    expect(transposePitch('C4', -12)).toBe('C3')
  })

  it('シャープ表記の入力 (D#4 + 2 = F4)', () => {
    expect(transposePitch('D#4', 2)).toBe('F4')
  })

  it('フラット表記の入力 (Bb3 + 2 = C4、出力は # 系)', () => {
    expect(transposePitch('Bb3', 2)).toBe('C4')
  })

  it('フラット表記 (Eb4 + 0 = D#4 に正規化)', () => {
    expect(transposePitch('Eb4', 0)).toBe('D#4')
  })

  it('A4 + 14（全 + 半 + 全）= B5', () => {
    expect(transposePitch('A4', 14)).toBe('B5')
  })

  it('パース不能な文字列はそのまま返す', () => {
    expect(transposePitch('invalid', 5)).toBe('invalid')
    expect(transposePitch('', 5)).toBe('')
  })

  it('負の大きい移調 (C5 - 25 = B2)', () => {
    expect(transposePitch('C5', -25)).toBe('B2')
  })
})
