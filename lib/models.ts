import type { ApiType } from './types'

export const MODELS = {
  anthropic: {
    free:  'claude-haiku-4-5-20251001',
    paid:  'claude-sonnet-4-6',
    labels: { free: 'Claude Haiku', paid: 'Claude Sonnet' },
  },
  gemini: {
    free:  'gemini-2.5-flash',
    paid:  'gemini-2.5-pro',
    labels: { free: 'Gemini 2.5 Flash', paid: 'Gemini 2.5 Pro' },
  },
  openai: {
    free:  'gpt-5.4-nano',
    paid:  'gpt-4o',
    labels: { free: 'GPT-5.4 Nano', paid: 'gpt-4o' },
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
