import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { resolveModel } from '@/lib/models'
import { verifyAuth } from '@/lib/auth-server'
import type { ApiType } from '@/lib/types'

// 歌詞 lines からメロディ JSON を生成する。Tone.js でそのまま再生できる形式
const COMPOSE_SYSTEM = `あなたは作曲家です。与えられた歌詞の各行に対して、シンプルなメロディを作曲してください。

出力は厳密に以下の JSON のみ。説明・コードブロック・前置き不要:
{
  "bpm": 80,
  "key": "C major",
  "notes": [
    { "pitch": "C4", "duration": "4n", "lyric": "対応する行" }
  ]
}

ルール:
- pitch は Tone.js 形式（例: "C4", "D#4", "Eb4", "F5"）。1 オクターブ程度の幅に収め、極端な跳躍は避ける
- duration は Tone.js 形式（"1n" 全音符 / "2n" 二分 / "4n" 四分 / "8n" 八分 / "4n." 付点四分）
- 各歌詞行に 1 つの音符を割り当てる（短く 1〜2 行程度）。長い行は 2〜4 音に分けて lyric にも反映
- bpm は歌詞の感情に合わせる（静か=60〜70、標準=80〜90、躍動=100〜120）
- key は調号の文字列（"C major", "A minor", "G major" 等）
- メロディは順次進行を基本に、フレーズの最後で主音または属音に着地
- 最大 32 音まで`

interface ComposeRequest {
  lines: string[]
  apiType: ApiType
  userApiKey?: string
}

export interface MelodyNote {
  pitch: string
  duration: string
  lyric?: string
}

export interface Melody {
  bpm: number
  key: string
  notes: MelodyNote[]
}

function extractJson(text: string): string {
  // ```json ... ``` の囲い、前後の余計な散文を取り除く
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

function validateMelody(obj: unknown): Melody {
  if (!obj || typeof obj !== 'object') throw new Error('melody not object')
  const m = obj as Record<string, unknown>
  const bpm = typeof m.bpm === 'number' ? Math.max(40, Math.min(200, m.bpm)) : 80
  const key = typeof m.key === 'string' ? m.key : 'C major'
  if (!Array.isArray(m.notes) || m.notes.length === 0) throw new Error('notes empty')
  const notes: MelodyNote[] = m.notes.slice(0, 64).map((n) => {
    if (!n || typeof n !== 'object') throw new Error('note not object')
    const note = n as Record<string, unknown>
    const pitch = typeof note.pitch === 'string' ? note.pitch : 'C4'
    const duration = typeof note.duration === 'string' ? note.duration : '4n'
    const lyric = typeof note.lyric === 'string' ? note.lyric : undefined
    return { pitch, duration, lyric }
  })
  return { bpm, key, notes }
}

export async function POST(req: NextRequest) {
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  try {
    const body = await req.json() as ComposeRequest
    const lines = (body.lines ?? []).map(l => String(l).trim()).filter(Boolean)
    if (lines.length === 0) return NextResponse.json({ error: 'empty input' }, { status: 400 })

    const { model, apiKey } = resolveModel(body.apiType, body.userApiKey)
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

    const userPrompt = `歌詞:\n${lines.join('\n')}\n\n上記をメロディ化した JSON のみを出力:`

    // LLM を 1 回呼んで JSON にパースしバリデートまで行う。失敗時は throw
    const callOnce = async (): Promise<Melody> => {
      let responseText: string
      if (body.apiType === 'openai') {
        const client = new OpenAI({ apiKey })
        const res = await client.chat.completions.create({
          model,
          max_completion_tokens: 1500,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: COMPOSE_SYSTEM },
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
            max_tokens: 1500,
            messages: [
              { role: 'system', content: COMPOSE_SYSTEM },
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
      const json = extractJson(responseText)
      let parsed: unknown
      try { parsed = JSON.parse(json) }
      catch { throw new Error(`failed to parse JSON: ${json.slice(0, 200)}`) }
      return validateMelody(parsed)
    }

    // 1 回失敗したらリトライ（LLM の確率的揺れに備える、Gemini は json_object 強制不可のため特に有効）
    let melody: Melody
    try {
      melody = await callOnce()
    } catch (firstErr) {
      try {
        melody = await callOnce()
      } catch (secondErr) {
        throw new Error(`compose failed after retry: ${secondErr instanceof Error ? secondErr.message : String(secondErr)}`)
      }
    }

    return NextResponse.json({ melody, model })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
