// "C4" + N半音 → "E4" のように移調。装飾音・ハーモニー・移調ヘルパー
//
// 仕様:
// - 入力: 'C4' / 'D#5' / 'Bb3' のような Tone.js 形式（音名 + 任意の # または b + オクターブ）
// - フラット (Bb 等) は対応する # 音（A#）に正規化して扱う
// - 出力は常に # 表記。負方向の移調も対応（半音単位で 12 を跨ぐオクターブ計算込み）
// - パース不能な文字列はそのまま返す（fail-safe）

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_MAP: Record<string, number> = { Db: 1, Eb: 3, Gb: 6, Ab: 8, Bb: 10 }

export function transposePitch(pitch: string, semitones: number): string {
  const m = pitch.match(/^([A-G])(#|b)?(-?\d+)$/)
  if (!m) return pitch
  const base = m[1] + (m[2] ?? '')
  const oct  = parseInt(m[3], 10)
  let idx = NAMES.indexOf(base)
  if (idx < 0) idx = FLAT_MAP[base] ?? 0
  const total = idx + oct * 12 + semitones
  const newIdx = ((total % 12) + 12) % 12
  const newOct = Math.floor(total / 12)
  return NAMES[newIdx] + newOct
}
