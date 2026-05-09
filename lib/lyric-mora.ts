// 歌詞を「モーラ（拍）」単位に分割する。1 モーラ = 1 ノート対応の前提で使う。
//
// ルール:
// - 小書き仮名（ゃゅょぁぃぅぇぉゎ + 片仮名同種）は前のモーラに結合（拗音 きゃ = 1 モーラ）
// - 促音（っッ）は独立した 1 モーラ
// - 長音（ー）は独立した 1 モーラ
// - 句読点・記号・スペースは除外（休符にもしない、メロディ生成の対象外）
// - 漢字は読みが特定できないため 1 字 1 モーラ（厳密ではないが実用的）
// - ASCII / 全角英数も 1 字 1 モーラ

const SMALL_KANA = new Set([
  'ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゎ',
  'ャ', 'ュ', 'ョ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ヮ',
])

// 句読点・記号・空白（モーラとして数えない）
const PUNCT_RE = /[\s　、。「」『』（）()！？!?…\-—‥．・,.]/

export function splitMora(text: string): string[] {
  const moras: string[] = []
  // surrogate pair 対応のため [...text] で文字列を分解
  for (const ch of [...text]) {
    if (PUNCT_RE.test(ch)) continue
    if (SMALL_KANA.has(ch) && moras.length > 0) {
      moras[moras.length - 1] += ch
    } else {
      moras.push(ch)
    }
  }
  return moras
}

// 各行をモーラ分割し、フラットな 1 配列で返す（メロディ生成プロンプト用）
export function splitMoraLines(lines: string[]): string[] {
  return lines.flatMap(splitMora)
}

// 全行をフラットモーラ配列に変換しつつ、各行の開始モーラ index を返す
// 表示側で「行 i のモーラ開始位置 = startIdx[i]」として activeIdx と突合できる
export function splitMoraLinesWithOffsets(lines: string[]): { moras: string[]; startIdx: number[] } {
  const startIdx: number[] = []
  let cursor = 0
  const moras: string[] = []
  for (const line of lines) {
    startIdx.push(cursor)
    const ms = splitMora(line)
    moras.push(...ms)
    cursor += ms.length
  }
  return { moras, startIdx }
}
