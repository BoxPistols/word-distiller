import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { resolveModel } from '@/lib/models'
import { verifyAuth } from '@/lib/auth-server'
import { splitMoraLines } from '@/lib/lyric-mora'
import type { ApiType } from '@/lib/types'

// 歌詞 lines からメロディ JSON を生成する。Tone.js でそのまま再生できる形式
// モーラ単位で 1 文字 = 1 ノート、サーバー側で分割した moras を AI に渡し、ノート数を厳密一致させる
const COMPOSE_SYSTEM = `あなたは作曲家です。与えられたモーラ配列の各要素に対して、1 つずつ音符を割り当ててメロディを作ってください。

出力は厳密に以下の JSON のみ。説明・コードブロック・前置き不要:
{
  "bpm": 80,
  "key": "C major",
  "notes": [
    { "pitch": "C4", "duration": "4n", "lyric": "あ" }
  ]
}

絶対ルール:
- notes 配列の長さは入力 moras の長さと厳密に一致させる
- 各 note の lyric は対応する moras[i] をそのまま使う（順序を変えない、結合しない、削除しない）
- pitch は Tone.js 形式（例: "C4", "D#4", "F5"）。1 オクターブ程度の幅、跳躍は最小限
- duration は Tone.js 形式（"4n" 四分 / "8n" 八分 / "16n" 十六分 / "4n." 付点四分）。文字単位なので "8n" 中心が自然
- bpm は歌詞の感情に合わせる（静か 60〜70、標準 80〜100、躍動 110〜130）
- key は調号の文字列（"C major", "A minor", "G major" 等）
- メロディは順次進行が基本、フレーズの最後で主音または属音に着地
- 指定 bpm / key / mode が user メッセージに含まれる場合は必ずそれに従う`

// 旋法名 → 表示用文字列（AI への指示と key 表記の両方に使う）
const MODE_DISPLAY: Record<string, string> = {
  major: 'major',
  minor: 'minor',
  pentatonic: 'major pentatonic',
  in: 'in (Japanese minor pentatonic)',
  yo: 'yo (Japanese major pentatonic)',
  dorian: 'dorian',
}

// 旋法ごとの構成音メモ（AI への補助）
const MODE_NOTES_HINT: Record<string, string> = {
  major:      '長調（メジャースケール）: do re mi fa sol la ti do',
  minor:      '自然短音階: la ti do re mi fa sol la（暗く優しい）',
  pentatonic: 'メジャーペンタトニック: do re mi sol la（5 音、明るく素朴）',
  in:         '陰旋法（日本の暗い 5 音）: 主音から 半音・全音半・全音・半音・全音半（例: D / Eb / G / A / Bb）',
  yo:         '陽旋法（日本の明るい 5 音）: 主音から 全音・全音半・全音・全音半（例: D / E / G / A / B）',
  dorian:     'ドリアン旋法: re mi fa sol la ti do re（メジャーから 3rd と 7th を半音下げ）',
}

interface ComposeRequest {
  lines: string[]
  apiType: ApiType
  userApiKey?: string
  bpm?: number | null      // 指定があれば AI 出力を上書き
  key?: string | null      // "C" "D#" 等の音名。指定があれば
  mode?: string | null     // "major" "minor" "pentatonic" "in" "yo" "dorian"
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

function validateMelody(
  obj: unknown,
  moras: string[],
  override: { bpm?: number | null; key?: string | null; mode?: string | null },
): Melody {
  if (!obj || typeof obj !== 'object') throw new Error('melody not object')
  const m = obj as Record<string, unknown>
  // ユーザー指定があれば AI 出力より優先
  const aiBpm = typeof m.bpm === 'number' ? Math.max(40, Math.min(200, m.bpm)) : 80
  const bpm = typeof override.bpm === 'number' ? Math.max(40, Math.min(200, override.bpm)) : aiBpm
  const aiKey = typeof m.key === 'string' ? m.key : 'C major'
  const key = override.key && override.mode
    ? `${override.key} ${MODE_DISPLAY[override.mode] ?? override.mode}`
    : override.key
      ? `${override.key} major`
      : aiKey
  if (!Array.isArray(m.notes) || m.notes.length === 0) throw new Error('notes empty')
  // ノート数とモーラ数が一致しない場合は救済: 多ければ truncate、少なければ末尾を主音で補完
  const rawNotes: MelodyNote[] = m.notes.map((n, i) => {
    if (!n || typeof n !== 'object') return { pitch: 'C4', duration: '8n', lyric: moras[i] }
    const note = n as Record<string, unknown>
    return {
      pitch: typeof note.pitch === 'string' ? note.pitch : 'C4',
      duration: typeof note.duration === 'string' ? note.duration : '8n',
      // lyric は AI 出力よりサーバー側 moras を優先（順序ズレ防止）
      lyric: moras[i] ?? (typeof note.lyric === 'string' ? note.lyric : undefined),
    }
  })
  let notes: MelodyNote[]
  if (rawNotes.length === moras.length) {
    notes = rawNotes
  } else if (rawNotes.length > moras.length) {
    notes = rawNotes.slice(0, moras.length)
  } else {
    // 不足分は前ノートと同じピッチで補完
    const last = rawNotes[rawNotes.length - 1]
    notes = [...rawNotes]
    for (let i = rawNotes.length; i < moras.length; i++) {
      notes.push({ pitch: last.pitch, duration: '8n', lyric: moras[i] })
    }
  }
  return { bpm, key, notes }
}

export async function POST(req: NextRequest) {
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  try {
    const body = await req.json() as ComposeRequest
    const lines = (body.lines ?? []).map(l => String(l).trim()).filter(Boolean)
    if (lines.length === 0) return NextResponse.json({ error: 'empty input' }, { status: 400 })

    // モーラ分割: 1 文字 1 ノートの単位を確定。AI には JSON 配列で渡してノート数を厳密一致させる
    const moras = splitMoraLines(lines)
    if (moras.length === 0) return NextResponse.json({ error: 'no playable mora' }, { status: 400 })
    if (moras.length > 256) return NextResponse.json({ error: 'too many moras (max 256)' }, { status: 400 })

    const { model, apiKey } = resolveModel(body.apiType, body.userApiKey)
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

    // ユーザー指定の bpm / key / mode をプロンプトに反映
    const overrideBpm = typeof body.bpm === 'number' ? body.bpm : null
    const overrideKey = typeof body.key === 'string' && body.key ? body.key : null
    const overrideMode = typeof body.mode === 'string' && body.mode ? body.mode : null
    const overrideLines: string[] = []
    if (overrideBpm) overrideLines.push(`必ず bpm = ${overrideBpm} を使う`)
    if (overrideKey && overrideMode) {
      overrideLines.push(`必ず key = "${overrideKey} ${MODE_DISPLAY[overrideMode] ?? overrideMode}" を使う`)
      const hint = MODE_NOTES_HINT[overrideMode]
      if (hint) overrideLines.push(`旋法ヒント: ${hint}`)
    } else if (overrideKey) {
      overrideLines.push(`必ず key = "${overrideKey} major" を使う`)
    } else if (overrideMode) {
      overrideLines.push(`必ず ${MODE_DISPLAY[overrideMode] ?? overrideMode} 旋法を使う`)
      const hint = MODE_NOTES_HINT[overrideMode]
      if (hint) overrideLines.push(`旋法ヒント: ${hint}`)
    }
    const overrideBlock = overrideLines.length ? `\n\nユーザー指定（必ず守る）:\n- ${overrideLines.join('\n- ')}` : ''

    const userPrompt = `歌詞（参考）:\n${lines.join('\n')}\n\nモーラ配列（${moras.length} 個、これと厳密に同じ数の note を出力）:\n${JSON.stringify(moras)}${overrideBlock}\n\n各 note.lyric には対応する moras[i] をそのまま入れる。JSON のみを出力:`

    // LLM を 1 回呼んで JSON にパースしバリデートまで行う。失敗時は throw
    const callOnce = async (): Promise<Melody> => {
      let responseText: string
      if (body.apiType === 'openai') {
        const client = new OpenAI({ apiKey })
        const res = await client.chat.completions.create({
          model,
          max_completion_tokens: 6000,
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
            max_tokens: 6000,
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
      return validateMelody(parsed, moras, { bpm: overrideBpm, key: overrideKey, mode: overrideMode })
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
