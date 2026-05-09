import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth-server'

// Suno API 連携 — 歌詞 + style から歌入り音源を生成
//
// 認証: localStorage の Suno API キー (X-Suno-Key) を BYOK として優先
// endpoint: ユーザー指定の URL を優先（公式 API / sunoaiapi.com / セルフホスト suno-api 等）
//          未指定時は env SUNO_API_URL を fallback、それも無ければ community default
//
// 注意: Suno 公式 API は 2026 年現在仕様が流動的。複数ベンダーで形式が異なるため、
//       本ルートは suno-api (gcui-art) 互換形式を default にしているが、ベンダー差で動かない場合は
//       ユーザー側で endpoint 上書きが必要。エラーは原則そのまま透過する。

interface SunoRequest {
  lyrics?: string          // 歌詞本文
  style?: string           // ジャンル/ムード ("sad piano ballad" 等)
  title?: string
  customEndpoint?: string  // ユーザー指定の Suno wrapper URL
  makeInstrumental?: boolean
}

const DEFAULT_ENDPOINT = 'https://api.sunoaiapi.com/api/v1/gateway/generate/music'

export async function POST(req: NextRequest) {
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const apiKey = req.headers.get('X-Suno-Key') || process.env.SUNO_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Suno API key not configured (X-Suno-Key or SUNO_API_KEY)' }, { status: 500 })

  try {
    const body = await req.json() as SunoRequest
    const lyrics = (body.lyrics ?? '').trim()
    const style  = (body.style ?? '').trim() || 'gentle ballad'
    const title  = (body.title ?? '').trim() || 'untitled'
    if (!lyrics) return NextResponse.json({ error: 'lyrics required' }, { status: 400 })

    const endpoint = body.customEndpoint || process.env.SUNO_API_URL || DEFAULT_ENDPOINT

    // suno-api (gcui-art) 互換形式
    const payload = {
      prompt: lyrics,
      tags: style,
      title,
      make_instrumental: !!body.makeInstrumental,
      mv: 'chirp-v3-5',
      custom: true,
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const text = await res.text()
    let data: unknown
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    if (!res.ok) {
      return NextResponse.json({ error: `suno endpoint ${res.status}`, response: data }, { status: 500 })
    }
    // 結果は wrapper ごとに形式が違うのでそのまま透過。
    // よくある形: [{ id, audio_url, video_url, ... }] / { data: [...] } / { id }
    return NextResponse.json({ result: data, endpoint })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
