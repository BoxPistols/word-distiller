// ブラウザ標準 (Web Speech API) provider
// 既存 lib/speech.ts のラッパー。機械音声、無料・オフライン。

import {
  speak as legacySpeak,
  cancelSpeak,
  isSpeechSupported,
  getJapaneseVoices,
} from '@/lib/speech'
import type { TtsProvider, TtsVoice } from './types'

export const browserProvider: TtsProvider = {
  id: 'browser',
  label: 'ブラウザ標準（機械音声）',
  isAvailable: () => isSpeechSupported(),

  async getVoices(): Promise<TtsVoice[]> {
    const voices = await getJapaneseVoices()
    return voices.map(v => ({ id: v.voiceURI, label: v.name }))
  },

  speak(text, opts) {
    return new Promise<void>((resolve) => {
      const setup = async () => {
        let voice: SpeechSynthesisVoice | null = null
        if (opts.voiceId) {
          const all = await getJapaneseVoices()
          voice = all.find(v => v.voiceURI === opts.voiceId) ?? null
        }
        legacySpeak(text, {
          rate: opts.rate,
          voice,
          onEnd: () => { opts.onEnd?.(); resolve() },
        })
      }
      setup()
    })
  },

  cancel() { cancelSpeak() },
}
