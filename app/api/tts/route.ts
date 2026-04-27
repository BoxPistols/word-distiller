import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth-server'

// xAI Grok TTS proxy
// 認証: Firebase IDトークン (verifyAuth) で uid scope
// キー解決: クライアント `X-XAI-Key` ヘッダー (BYOK) 優先 → サーバー env XAI_API_KEY (Shared)
// 注意: xAI 公式 docs に /v1/tts は未掲載 (2026-04-27 時点)。experimental endpoint の可能性あり

const XAI_TTS_ENDPOINT = 'https://api.x.ai/v1/tts'

interface TtsRequestBody {
  text: string
  voice_id?: string
  language?: string
}

export async function POST(req: NextRequest) {
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const byokKey = req.headers.get('x-xai-key')?.trim() || ''
  const upstreamKey = byokKey || process.env.XAI_API_KEY || ''
  if (!upstreamKey) {
    return NextResponse.json(
      { error: 'xAI key 未設定。設定でキーを入力するか、サーバー env XAI_API_KEY を登録してください' },
      { status: 503 },
    )
  }

  let body: TtsRequestBody
  try {
    body = await req.json() as TtsRequestBody
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const text = (body.text ?? '').trim()
  if (!text) return NextResponse.json({ error: 'empty text' }, { status: 400 })

  try {
    const upstream = await fetch(XAI_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${upstreamKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id: body.voice_id || 'ara',
        language: body.language || 'ja',
        output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 },
      }),
    })

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      return NextResponse.json(
        { error: `xAI ${upstream.status}: ${detail.slice(0, 200)}` },
        { status: upstream.status },
      )
    }

    // upstream の MP3 stream をそのまま透過
    const headers = new Headers()
    headers.set('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg')
    return new NextResponse(upstream.body, { status: 200, headers })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
