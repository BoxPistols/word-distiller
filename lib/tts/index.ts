// TTS プロバイダの統一 entry
// 利用側は providers から id 指定で取得して speak/cancel を呼ぶ

import { browserProvider } from './browser'
import { xaiProvider } from './xai'
import type { TtsProvider, TtsProviderId } from './types'

export const providers: Record<TtsProviderId, TtsProvider> = {
  browser: browserProvider,
  xai: xaiProvider,
}

export function getProvider(id: TtsProviderId): TtsProvider {
  return providers[id]
}

export type { TtsProvider, TtsProviderId, TtsVoice, TtsSpeakOptions } from './types'
export { TTS_PROVIDER_LABELS } from './types'
