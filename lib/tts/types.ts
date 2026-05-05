// 音声合成プロバイダの抽象化
// browser:  Web Speech API（既存 lib/speech.ts のラッパー、機械音声、無料・オフライン）
// xai:      xAI Grok TTS（/api/tts 経由、自然音声、課金あり）
// voicevox: VOICEVOX（ずんだもん等、ローカル/自前ホスト voicevox_engine と直接通信、無料）

export type TtsProviderId = 'browser' | 'xai' | 'voicevox'

export interface TtsVoice {
  id: string
  label: string
}

export interface TtsSpeakOptions {
  rate?: number
  voiceId?: string
  authToken?: string         // Firebase IDトークン（xAI proxy 用）
  byokKey?: string           // xAI BYOK キー（任意、優先される）
  onEnd?: () => void
}

export interface TtsProvider {
  id: TtsProviderId
  label: string
  isAvailable(): boolean
  getVoices(): Promise<TtsVoice[]>
  speak(text: string, opts: TtsSpeakOptions): Promise<void>
  cancel(): void
}

export const TTS_PROVIDER_LABELS: Record<TtsProviderId, string> = {
  browser:  'ブラウザ標準（機械音声）',
  xai:      'xAI Grok TTS（自然音声）',
  voicevox: 'VOICEVOX（ずんだもん 等）',
}
