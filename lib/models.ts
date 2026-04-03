import type { ApiType } from './types'

export const MODELS = {
  openai: {
    free:  'gpt-5.4-nano',
    paid:  'gpt-5.4-mini',
    labels: { free: 'GPT-5.4 Nano', paid: 'GPT-5.4 Mini' },
  },
  gemini: {
    free:  'gemini-2.5-flash',
    paid:  'gemini-2.5-flash',
    labels: { free: 'Gemini 2.5 Flash', paid: 'Gemini 2.5 Flash' },
  },
} as const

export function resolveModel(apiType: ApiType, userKey?: string) {
  const m = MODELS[apiType]
  const envKey = process.env[`${apiType.toUpperCase()}_API_KEY`] ?? ''
  return {
    model:  userKey ? m.paid : m.free,
    apiKey: userKey || envKey,
    tier:   (userKey ? 'paid' : 'free') as 'paid' | 'free',
  }
}
