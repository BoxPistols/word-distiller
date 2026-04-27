import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { resolveModel } from '@/lib/models'
import { verifyAuth } from '@/lib/auth-server'
import type { ApiType } from '@/lib/types'

// 「素材集めから作品化」へ向けた意味付け生成
// 既存 distill とは別エンドポイント — 詩節断片の生成ではなく、与えられた語句を歌詞として繋ぐ用途
const POETIZE_SYSTEM = `あなたは詩の編集者です。与えられた語句を、歌詞のように 1 つにつながる短い詩節に編集してください。

ルール:
- 助詞や接続詞を最小限補って繋いでよい
- 語句の順序は変えてよい
- 出力する行数は元と同程度（必要なら ±2 行）
- 元の語句のニュアンスは保つ
- 比喩や修飾を新たに加えすぎない
- 体温なし、意味づけ過剰、説明的にならないこと
- 出力は行ごとに改行のみ。番号や鉤括弧、説明、コードブロック不要`

interface PoetizeRequest {
  lines: string[]
  apiType: ApiType
  userApiKey?: string
}

export async function POST(req: NextRequest) {
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  try {
    const body = await req.json() as PoetizeRequest
    const lines = (body.lines ?? []).map(l => String(l).trim()).filter(Boolean)
    if (lines.length === 0) return NextResponse.json({ error: 'empty input' }, { status: 400 })

    const { model, apiKey } = resolveModel(body.apiType, body.userApiKey)
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

    const userPrompt = `語句:\n${lines.join('\n')}\n\n出力（行ごとに改行のみ）:`
    let responseText: string

    if (body.apiType === 'openai') {
      const client = new OpenAI({ apiKey })
      const res = await client.chat.completions.create({
        model,
        max_completion_tokens: 600,
        messages: [
          { role: 'system', content: POETIZE_SYSTEM },
          { role: 'user', content: userPrompt },
        ],
      })
      responseText = res.choices[0]?.message?.content ?? ''
    } else {
      const url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 600,
          messages: [
            { role: 'system', content: POETIZE_SYSTEM },
            { role: 'user', content: userPrompt },
          ],
        }),
      })
      const data = await res.json() as {
        error?: { message: string }
        choices?: { message: { content: string } }[]
      }
      if (data.error) throw new Error(data.error.message)
      responseText = data.choices?.[0]?.message?.content ?? ''
    }

    // 行ごとに分割。番号や鉤括弧の混入を最小限クレンジング
    const poetized = responseText
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l =>
        l.replace(/^\d+[\.\)]\s*/, '')
         .replace(/^[「『・\-•]+\s*/, '')
         .replace(/[」』]+$/, '')
         .trim()
      )
      .filter(Boolean)

    return NextResponse.json({ poetized, model })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
