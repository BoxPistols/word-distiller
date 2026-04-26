import { NextRequest, NextResponse } from 'next/server'
import { resolveModel } from '@/lib/models'
import { buildPrompt, parseFragments } from '@/lib/prompt'
import { callGemini }    from '@/lib/api/gemini'
import { callOpenAI }    from '@/lib/api/openai'
import { db } from '@/lib/firebase'
import { verifyAuth } from '@/lib/auth-server'
import { getEmbedding, cosineSimilarity } from '@/lib/embedding'
import type { GenerateRequest, ApiType, CorpusItem } from '@/lib/types'

const TOP_K = 5

// uid scope の採用断片から入力に意味的に近い top-k を返す
// embedding 失敗時 / 該当無し時は最新 TOP_K にフォールバック
async function fetchAcceptedTopK(uid: string, input: string): Promise<CorpusItem[]> {
  if (!db) return []
  const snap = await db.collection('corpus')
    .where('uid', '==', uid)
    .where('verdict', '==', 'accepted')
    .get()
  const items: CorpusItem[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<CorpusItem, 'id'>) }))
  if (items.length === 0) return []

  // 新しい順でソート（フォールバック用）
  items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

  const inputEmb = await getEmbedding(input)
  if (!inputEmb) return items.slice(0, TOP_K)

  const withEmb = items.filter(c => Array.isArray(c.embedding) && c.embedding.length > 0)
  const withoutEmb = items.filter(c => !Array.isArray(c.embedding) || c.embedding.length === 0)

  const scored = withEmb
    .map(c => ({ item: c, score: cosineSimilarity(inputEmb, c.embedding!) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K)
    .map(s => s.item)

  // top-k に満たない場合は embedding 無しの新しい順で埋める（移行期対応）
  const remainder = TOP_K - scored.length
  return remainder > 0 ? [...scored, ...withoutEmb.slice(0, remainder)] : scored
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as GenerateRequest
    const { input, tempIdx, apiType, userApiKey, accepted: clientAccepted } = body

    if (!input?.trim()) {
      return NextResponse.json({ error: 'input is required' }, { status: 400 })
    }

    // RAG: ログイン中かつ DB 利用可能なら top-k を取得、それ以外はクライアント送信を使う
    let accepted: CorpusItem[] = clientAccepted ?? []
    const uid = await verifyAuth(req)
    if (uid && db) {
      try {
        const topk = await fetchAcceptedTopK(uid, input)
        if (topk.length > 0) accepted = topk
      } catch {}
    }

    const prompt = buildPrompt(input, tempIdx, accepted)
    const { model, apiKey, tier } = resolveModel(apiType as ApiType, userApiKey)

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    let raw = ''
    if (apiType === 'gemini') {
      raw = await callGemini(prompt, model, apiKey)
    } else {
      raw = await callOpenAI(prompt, model, apiKey)
    }

    const fragments = parseFragments(raw)
    if (!fragments.length) {
      return NextResponse.json({ error: 'parse failed: ' + raw.slice(0, 100) }, { status: 500 })
    }

    return NextResponse.json({ fragments, model, tier })
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const msg = raw.replace(/sk-[a-zA-Z0-9_-]+|AIza[a-zA-Z0-9_-]+|eyJ[a-zA-Z0-9_-]+/g, '***')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
