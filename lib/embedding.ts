// OpenAI text-embedding-3-small (1536 dim) を使う
// 失敗時は null を返す（呼び出し側でフォールバック）
const EMBEDDING_MODEL = 'text-embedding-3-small'

export async function getEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || !text.trim()) return null
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: text, model: EMBEDDING_MODEL }),
    })
    if (!res.ok) return null
    const data = await res.json() as { data?: { embedding: number[] }[] }
    return data.data?.[0]?.embedding ?? null
  } catch {
    return null
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}
