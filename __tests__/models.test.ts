import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveModel, MODELS } from '../lib/models'

describe('resolveModel', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('ユーザーキーなしの場合はfreeモデルを返す', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-env-key')
    const r = resolveModel('openai')
    expect(r.model).toBe(MODELS.openai.free)
    expect(r.apiKey).toBe('sk-env-key')
    expect(r.tier).toBe('free')
  })

  it('ユーザーキーありの場合はpaidモデルを返す', () => {
    const r = resolveModel('openai', 'sk-user-key')
    expect(r.model).toBe(MODELS.openai.paid)
    expect(r.apiKey).toBe('sk-user-key')
    expect(r.tier).toBe('paid')
  })

  it('環境変数もユーザーキーもない場合はapiKeyが空', () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    const r = resolveModel('gemini')
    expect(r.apiKey).toBe('')
  })

  it('全APIタイプで正しいモデルを返す', () => {
    for (const type of ['openai', 'gemini'] as const) {
      const free = resolveModel(type)
      expect(free.model).toBe(MODELS[type].free)

      const paid = resolveModel(type, 'key')
      expect(paid.model).toBe(MODELS[type].paid)
    }
  })
})
