// VOICEVOX provider — ローカル / セルフホストの voicevox_engine と直接通信。
// プロトコル: POST /audio_query?text=...&speaker=N → JSON, POST /synthesis?speaker=N (JSON body) → WAV
// 既定エンドポイント http://localhost:50021。本番 (HTTPS) で localhost を叩くと mixed content で blocked される。
// ユーザーが HTTPS リバースプロキシまたは VOICEVOX Cloud を使う場合は localStorage `d_voicevox_url` で差し替え。

import type { TtsProvider, TtsVoice, TtsSpeakOptions } from './types'

const URL_KEY = 'd_voicevox_url'
const DEFAULT_URL = 'http://localhost:50021'

// 代表的なスタイルのみ列挙。ユーザーは voicevox_engine の `/speakers` で全スタイルを確認できる
// id は voicevox_engine 0.x 系の style id 表記
const VOICEVOX_VOICES: TtsVoice[] = [
  { id: '3',  label: 'ずんだもん（ノーマル）' },
  { id: '1',  label: 'ずんだもん（あまあま）' },
  { id: '5',  label: 'ずんだもん（セクシー）' },
  { id: '7',  label: 'ずんだもん（ツンツン）' },
  { id: '22', label: 'ずんだもん（ささやき）' },
  { id: '38', label: 'ずんだもん（ヒソヒソ）' },
  { id: '2',  label: '四国めたん（ノーマル）' },
  { id: '0',  label: '四国めたん（あまあま）' },
  { id: '8',  label: '春日部つむぎ' },
  { id: '10', label: '雨晴はう' },
  { id: '12', label: '白上虎太郎' },
  { id: '13', label: '青山龍星' },
  { id: '14', label: '冥鳴ひまり' },
  { id: '16', label: '九州そら（あまあま）' },
]

let currentAudio: HTMLAudioElement | null = null
let currentObjectUrl: string | null = null

function disposeAudio() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

export function getVoicevoxUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_URL
  return localStorage.getItem(URL_KEY) || DEFAULT_URL
}

export function setVoicevoxUrl(url: string): void {
  if (typeof window === 'undefined') return
  const trimmed = url.trim()
  if (trimmed) localStorage.setItem(URL_KEY, trimmed)
  else localStorage.removeItem(URL_KEY)
}

export const voicevoxProvider: TtsProvider = {
  id: 'voicevox',
  label: 'VOICEVOX（ずんだもん 等）',
  isAvailable: () => typeof window !== 'undefined' && typeof Audio !== 'undefined',

  async getVoices(): Promise<TtsVoice[]> {
    return VOICEVOX_VOICES
  },

  async speak(text: string, opts: TtsSpeakOptions): Promise<void> {
    disposeAudio()
    const baseUrl = getVoicevoxUrl().replace(/\/$/, '')
    const speaker = opts.voiceId || '3'

    // Step 1: audio_query で韻律を生成
    const queryUrl = `${baseUrl}/audio_query?speaker=${encodeURIComponent(speaker)}&text=${encodeURIComponent(text)}`
    const queryRes = await fetch(queryUrl, { method: 'POST' })
    if (!queryRes.ok) {
      let detail = ''
      try { detail = (await queryRes.text()).slice(0, 200) } catch {}
      throw new Error(`VOICEVOX audio_query ${queryRes.status}: ${detail}`)
    }
    const audioQuery = await queryRes.json()
    // 速度パラメータを rate に合わせて反映 (VOICEVOX は 0.5〜2.0 が安全領域)
    if (typeof opts.rate === 'number' && audioQuery && typeof audioQuery === 'object') {
      audioQuery.speedScale = Math.max(0.5, Math.min(2.0, opts.rate))
    }

    // Step 2: synthesis で WAV 化
    const synthUrl = `${baseUrl}/synthesis?speaker=${encodeURIComponent(speaker)}`
    const synthRes = await fetch(synthUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(audioQuery),
    })
    if (!synthRes.ok) {
      let detail = ''
      try { detail = (await synthRes.text()).slice(0, 200) } catch {}
      throw new Error(`VOICEVOX synthesis ${synthRes.status}: ${detail}`)
    }
    const blob = await synthRes.blob()
    if (blob.size === 0) throw new Error('empty audio')

    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentAudio = audio
    currentObjectUrl = url
    // VOICEVOX 側で速度反映済みなので playbackRate は 1.0 のまま
    audio.playbackRate = 1.0

    return new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        if (currentAudio === audio) disposeAudio()
        opts.onEnd?.()
        resolve()
      }
      audio.onerror = () => {
        if (currentAudio === audio) disposeAudio()
        reject(new Error('audio playback failed'))
      }
      audio.play().catch(reject)
    })
  },

  cancel() { disposeAudio() },
}
