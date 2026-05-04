// TTS 順次再生 queue。
// chunks を 1 つずつ provider.speak に渡し、完走を待ってから次へ。
// pause で provider.cancel + idx 保持、resume で同 idx から再開、stop で終了。

import type { TtsProvider, TtsSpeakOptions } from './types'

export type TtsQueueState = 'idle' | 'playing' | 'paused' | 'stopped'

export interface TtsQueueOptions {
  chunks: string[]
  provider: TtsProvider
  speakOpts: Omit<TtsSpeakOptions, 'onEnd'>
  onChunkStart?: (idx: number, text: string) => void
  onProgress?: (completed: number, total: number) => void
  onComplete?: () => void
  onError?: (err: unknown, idx: number) => void
}

export class TtsQueue {
  private idx = 0
  private state: TtsQueueState = 'idle'
  private readonly opts: TtsQueueOptions

  constructor(opts: TtsQueueOptions) {
    this.opts = opts
  }

  get currentIndex(): number { return this.idx }
  get total(): number { return this.opts.chunks.length }
  get currentState(): TtsQueueState { return this.state }

  async start(): Promise<void> {
    if (this.state === 'playing') return
    this.idx = 0
    this.state = 'playing'
    await this.runFromCurrent()
  }

  pause(): void {
    if (this.state !== 'playing') return
    this.state = 'paused'
    this.opts.provider.cancel()
  }

  async resume(): Promise<void> {
    if (this.state !== 'paused') return
    this.state = 'playing'
    await this.runFromCurrent()
  }

  stop(): void {
    if (this.state === 'idle' || this.state === 'stopped') return
    this.state = 'stopped'
    this.opts.provider.cancel()
  }

  private async runFromCurrent(): Promise<void> {
    while (this.state === 'playing' && this.idx < this.opts.chunks.length) {
      const text = this.opts.chunks[this.idx]
      this.opts.onChunkStart?.(this.idx, text)
      try {
        await this.opts.provider.speak(text, this.opts.speakOpts)
      } catch (e) {
        // pause/stop による cancel 起因の reject は state 遷移済みなので無視
        if (this.state !== 'playing') return
        this.state = 'stopped'
        this.opts.onError?.(e, this.idx)
        return
      }
      // 1 chunk 完走後にも状態を再チェック（途中で pause/stop された場合）
      if (this.state !== 'playing') return
      this.idx++
      this.opts.onProgress?.(this.idx, this.opts.chunks.length)
    }
    if (this.state === 'playing') {
      this.state = 'stopped'
      this.opts.onComplete?.()
    }
  }
}
