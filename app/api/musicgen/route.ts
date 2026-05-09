import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth-server'

// Replicate MusicGen 連携 — 歌詞・気分から短いインスト BGM を生成して音源 URL を返す
// 認証: localStorage の Replicate API トークン (X-Replicate-Key) を BYOK として優先、
//       未指定時は env REPLICATE_API_TOKEN を fallback
//
// 仕様:
// - meta/musicgen の `large` モデルを使用 (mood/楽器を自然言語で指示できる)
// - duration は最大 30 秒（コストと待ち時間の現実的上限）
// - prediction 作成 → polling 完成待ち → output (.wav URL) を返す
// - polling は最大 90 秒、500ms 間隔。タイムアウト時は 504

interface MusicgenRequest {
  prompt?: string
  duration?: number   // 秒、5〜30
  bpm?: number | null
  key?: string | null
  mode?: string | null
}

const MUSICGEN_VERSION = 'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb'

export async function POST(req: NextRequest) {
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const apiKey = req.headers.get('X-Replicate-Key') || process.env.REPLICATE_API_TOKEN
  if (!apiKey) return NextResponse.json({ error: 'Replicate API key not configured' }, { status: 500 })

  try {
    const body = await req.json() as MusicgenRequest
    const userPrompt = (body.prompt ?? '').trim()
    if (!userPrompt) return NextResponse.json({ error: 'empty prompt' }, { status: 400 })
    const duration = Math.max(5, Math.min(30, body.duration ?? 12))

    // 補助情報を prompt に追加（モデルが解釈する自然言語ヒント）
    const hints: string[] = []
    if (body.bpm) hints.push(`${body.bpm} BPM`)
    if (body.key && body.mode) hints.push(`${body.key} ${body.mode}`)
    else if (body.key) hints.push(`${body.key} major`)
    else if (body.mode) hints.push(`${body.mode} mode`)
    const finalPrompt = hints.length ? `${userPrompt}, ${hints.join(', ')}` : userPrompt

    // 1) prediction 作成
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: MUSICGEN_VERSION,
        input: {
          prompt: finalPrompt,
          duration,
          model_version: 'large',
          normalization_strategy: 'peak',
          output_format: 'mp3',
        },
      }),
    })
    const created = await createRes.json() as { id?: string; urls?: { get?: string }; error?: string }
    if (!createRes.ok || created.error) {
      return NextResponse.json({ error: created.error || `replicate create failed: ${createRes.status}` }, { status: 500 })
    }
    const pollUrl = created.urls?.get
    if (!pollUrl) return NextResponse.json({ error: 'no poll url returned' }, { status: 500 })

    // 2) polling — 最大 90 秒、500ms 間隔
    const start = Date.now()
    while (Date.now() - start < 90_000) {
      await new Promise(r => setTimeout(r, 500))
      const pollRes = await fetch(pollUrl, { headers: { Authorization: `Bearer ${apiKey}` } })
      const data = await pollRes.json() as {
        status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
        output?: string | string[]
        error?: string
      }
      if (data.status === 'succeeded') {
        const url = Array.isArray(data.output) ? data.output[0] : data.output
        if (!url) return NextResponse.json({ error: 'empty output' }, { status: 500 })
        return NextResponse.json({ audioUrl: url, prompt: finalPrompt, duration })
      }
      if (data.status === 'failed' || data.status === 'canceled') {
        return NextResponse.json({ error: data.error || `replicate ${data.status}` }, { status: 500 })
      }
    }
    return NextResponse.json({ error: 'timeout (90s)' }, { status: 504 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
