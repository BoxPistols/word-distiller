import type { CorpusItem } from './types'

export const SYSTEM_PROMPT = `あなたは詩の断片を生成するエンジンだ。
以下のJSON形式のみで返せ。説明不要。マークダウン不要。

{"fragments":["断片A","断片B","断片C"]}

各断片は4〜8行。改行は\\nで表現する。3パターンは互いに異なること。
禁止: 感情語（悲しい・寂しい等）、比喩（〜のような）、接続詞（でも・だから・そして・しかし等）、動作への理由付け、希望の実現、意味の着地、形容詞の多用。`

const TEMP_PROMPTS = [
  '単語と単語の距離を最小にせよ。',
  '単語と単語の距離をやや狭くせよ。',
  '単語と単語の距離を意識するな。',
  '単語と単語の距離を開けよ。論理的な連鎖を避けよ。',
  '単語と単語を最大限に遠ざけよ。隣接する行に意味の関係があってはならない。',
]

export function buildPrompt(
  input: string,
  tempIdx: number,
  accepted: CorpusItem[]
): string {
  let rag = ''
  if (accepted.length > 0) {
    rag = '\n\n以下は過去に採用された断片の例だ。この詩的感覚に近いものを生成せよ:\n'
    rag += accepted.map(c => `——\n${c.text}`).join('\n\n')
  }
  return `入力: ${input}\n${TEMP_PROMPTS[tempIdx]}${rag}`
}

export function parseFragments(raw: string): string[] {
  try {
    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}')
    if (start !== -1 && end !== -1) {
      const p = JSON.parse(raw.slice(start, end + 1)) as { fragments?: unknown }
      if (Array.isArray(p.fragments) && p.fragments.length > 0) {
        return (p.fragments as string[]).map(f => f.replace(/\\n/g, '\n'))
      }
    }
  } catch {}
  const blocks = raw.split(/\n{2,}/).map(b => b.trim()).filter(b => b.length > 8)
  if (blocks.length >= 2) return blocks.slice(0, 3)
  if (raw.trim().length > 8) return [raw.trim()]
  return []
}
