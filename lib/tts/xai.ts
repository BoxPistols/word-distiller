// xAI Grok TTS provider
// /api/tts proxy 経由で MP3 を取得し audio element で再生。
// BYOK: localStorage の `d_xai_key`（または speakOptions.byokKey）。
// Shared: サーバー env XAI_API_KEY（proxy で透過）

import type { TtsProvider, TtsVoice, TtsSpeakOptions } from './types'

// xAI 公開ボイス（machining-fundamentals での使用実績ベース）
const XAI_VOICES: TtsVoice[] = [
  { id: 'ara', label: 'Ara（温かく親しみやすい）' },
  { id: 'eve', label: 'Eve（エネルギッシュ）' },
  { id: 'leo', label: 'Leo（権威的・力強い）' },
  { id: 'rex', label: 'Rex（自信・プロ）' },
  { id: 'sal', label: 'Sal（滑らか・汎用）' },
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

export const xaiProvider: TtsProvider = {
  id: 'xai',
  label: 'xAI Grok TTS（自然音声）',
  isAvailable: () => typeof window !== 'undefined' && typeof Audio !== 'undefined',

  async getVoices(): Promise<TtsVoice[]> {
    return XAI_VOICES
  },

  async speak(text: string, opts: TtsSpeakOptions): Promise<void> {
    disposeAudio()

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (opts.authToken) headers.Authorization = `Bearer ${opts.authToken}`
    if (opts.byokKey) headers['X-XAI-Key'] = opts.byokKey

    const res = await fetch('/api/tts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        text,
        voice_id: opts.voiceId || 'ara',
        language: 'ja',
      }),
    })
    if (!res.ok) {
      let detail = ''
      try { detail = (await res.text()).slice(0, 200) } catch {}
      throw new Error(`xAI TTS ${res.status}: ${detail}`)
    }
    const blob = await res.blob()
    if (blob.size === 0) throw new Error('empty audio')

    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    currentAudio = audio
    currentObjectUrl = url
    audio.playbackRate = opts.rate ?? 1.0

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
