import { NextRequest, NextResponse } from 'next/server'
import { resolveModel } from '@/lib/models'
import { buildPrompt, parseFragments } from '@/lib/prompt'
import { callAnthropic } from '@/lib/api/anthropic'
import { callGemini }    from '@/lib/api/gemini'
import { callOpenAI }    from '@/lib/api/openai'
import { db } from '@/lib/firebase'
import type { GenerateRequest, ApiType, CorpusItem } from '@/lib/types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as GenerateRequest
    const { input, tempIdx, apiType, userApiKey } = body

    if (!input?.trim()) {
      return NextResponse.json({ error: 'input is required' }, { status: 400 })
    }

    // 採用コーパスをRAGとして取得
    let accepted: CorpusItem[] = []
    if (db) {
      const snap = await db.collection('corpus')
        .where('verdict', '==', 'accepted')
        .orderBy('created_at', 'desc')
        .limit(5)
        .get()
      accepted = snap.docs.map(d => ({ id: d.id, ...d.data() })) as CorpusItem[]
    }

    const prompt = buildPrompt(input, tempIdx, (accepted ?? []) as CorpusItem[])
    const { model, apiKey, tier } = resolveModel(apiType as ApiType, userApiKey)

    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    let raw = ''
    if (apiType === 'anthropic') {
      raw = await callAnthropic(prompt, model, apiKey)
    } else if (apiType === 'gemini') {
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
    // APIキーやトークンがエラーメッセージに含まれる場合はサニタイズ
    const msg = raw.replace(/sk-[a-zA-Z0-9_-]+|AIza[a-zA-Z0-9_-]+|eyJ[a-zA-Z0-9_-]+/g, '***')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
