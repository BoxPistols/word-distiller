// Web Speech API のラッパー — 純クライアント、サーバー不要
// 用途: 組詩を声に出して聴くことでリズム感や口当たりを確かめる

export interface SpeakOptions {
  rate?: number      // 0.1 - 10.0（推奨 0.7 - 1.3）
  pitch?: number     // 0.0 - 2.0
  voice?: SpeechSynthesisVoice | null
  lang?: string
  onEnd?: () => void
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

// 日本語ボイスのみ取得。初回は voiceschanged を待つ必要があるため Promise 化
export function getJapaneseVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise(resolve => {
    if (!isSpeechSupported()) return resolve([])
    const fetch = () => speechSynthesis.getVoices().filter(v => v.lang.startsWith('ja'))
    const initial = fetch()
    if (initial.length > 0) return resolve(initial)
    speechSynthesis.addEventListener('voiceschanged', () => resolve(fetch()), { once: true })
    // 念のためタイムアウト
    setTimeout(() => resolve(fetch()), 500)
  })
}

export function speak(text: string, options: SpeakOptions = {}): void {
  if (!isSpeechSupported() || !text.trim()) return
  const u = new SpeechSynthesisUtterance(text)
  u.rate = options.rate ?? 1.0
  u.pitch = options.pitch ?? 1.0
  u.lang = options.lang ?? 'ja-JP'
  if (options.voice) u.voice = options.voice
  if (options.onEnd) u.addEventListener('end', options.onEnd)
  speechSynthesis.speak(u)
}

export function cancelSpeak(): void {
  if (!isSpeechSupported()) return
  speechSynthesis.cancel()
}
