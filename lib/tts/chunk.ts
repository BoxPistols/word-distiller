// TTS 用に長文を文単位に分割するヘルパ
// xAI/ブラウザ TTS とも 1 chunk=1 リクエスト/発話単位として扱う。
// 句点（。！？）と改行を境界にし、maxLen 超過分はさらに読点で分割する。

export function splitForTts(text: string, maxLen = 160): string[] {
  if (!text) return []
  const sentences = text
    .split(/(?<=[。！？])|\n+/g)
    .map(s => s.trim())
    .filter(Boolean)

  const out: string[] = []
  for (const s of sentences) {
    if (s.length <= maxLen) {
      out.push(s)
      continue
    }
    // 長文は読点でさらに分割。1 chunk が maxLen を超えないように貪欲に詰める
    const parts = s.split(/(?<=、)/g)
    let buf = ''
    for (const p of parts) {
      if ((buf + p).length > maxLen && buf) {
        out.push(buf.trim())
        buf = p
      } else {
        buf += p
      }
    }
    if (buf.trim()) out.push(buf.trim())
  }
  return out
}
