'use client'

import { useState } from 'react'
import { MODELS } from '@/lib/models'
import type { ApiType } from '@/lib/types'

interface Props {
  apiType: ApiType
  userKey: string
  onApiTypeChange: (t: ApiType) => void
  onUserKeyChange: (k: string) => void
}

export default function ApiSettings({ apiType, userKey, onApiTypeChange, onUserKeyChange }: Props) {
  const [status, setStatus] = useState('')
  const [statusOk, setStatusOk] = useState(true)
  const [testing, setTesting] = useState(false)
  const hasPaid = userKey.trim().length > 0
  const m = MODELS[apiType]

  const save = () => {
    localStorage.setItem('d_key', userKey)
    localStorage.setItem('d_type', apiType)
    setStatus('記憶済み'); setStatusOk(true)
  }

  const test = async () => {
    if (!userKey.trim()) { setStatus('キーを入力してください'); setStatusOk(false); return }
    setTesting(true); setStatus('接続中…'); setStatusOk(true)
    try {
      const res = await fetch('/api/distill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: 'test', tempIdx: 2, apiType, userApiKey: userKey }),
      })
      const d = await res.json() as { error?: string }
      if (d.error) throw new Error(d.error)
      setStatus('接続成功'); setStatusOk(true)
    } catch (e) {
      setStatus('失敗: ' + (e instanceof Error ? e.message.slice(0, 50) : ''))
      setStatusOk(false)
    } finally { setTesting(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={bar}>
        <select value={apiType} onChange={e => onApiTypeChange(e.target.value as ApiType)} style={sel}>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Gemini</option>
          <option value="openai">OpenAI</option>
        </select>
        <input
          type="text"
          value={userKey}
          onChange={e => onUserKeyChange(e.target.value)}
          placeholder="APIキー（任意）"
          autoComplete="off"
          data-1p-ignore
          style={{ ...keyIn, WebkitTextSecurity: 'disc' } as React.CSSProperties}
        />
        <button onClick={save} style={tbtn}>記憶する</button>
        <button onClick={test} disabled={testing} style={tbtn}>{testing ? '——' : '接続テスト'}</button>
        {status && (
          <span style={{ fontSize: 12, fontFamily: 'var(--mono)', letterSpacing: '.15em',
            color: statusOk ? 'rgba(200,168,122,.9)' : 'var(--rej)' }}>
            — {status}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
        <span style={{ ...badge, ...(hasPaid ? dimmed : active) }}>
          {m.labels.free}{!hasPaid ? ' (使用中)' : ''}
        </span>
        <span style={{ ...badge, ...(hasPaid ? active : dimmed) }}>
          {m.labels.paid}{hasPaid ? ' (使用中)' : ''}
        </span>
        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '.12em', color: 'rgba(255,255,255,.3)' }}>
          {hasPaid ? '— 自分のキーで上位モデルを使用中' : '— APIキーを入力すると上位モデルが解放されます'}
        </span>
      </div>
    </div>
  )
}

const bar: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }
const sel: React.CSSProperties = { background: 'var(--glass)', border: '1px solid var(--border)',
  color: 'var(--mid)', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em',
  padding: '7px 10px', outline: 'none', cursor: 'pointer', appearance: 'none' as const }
const keyIn: React.CSSProperties = { flex: 1, minWidth: 220, background: 'var(--glass)',
  border: '1px solid var(--border)', color: 'var(--mid)', fontFamily: 'var(--mono)',
  fontSize: 13, padding: '7px 12px', outline: 'none' }
const tbtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  color: 'var(--dim)', background: 'transparent', border: '1px solid var(--border)',
  padding: '7px 16px', cursor: 'pointer' }
const badge: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11,
  letterSpacing: '.15em', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', padding: '3px 10px' }
const active: React.CSSProperties = { color: 'var(--acc)', borderColor: 'rgba(200,168,122,.4)',
  background: 'rgba(200,168,122,.06)' }
const dimmed: React.CSSProperties = { color: 'rgba(255,255,255,.25)', opacity: .5 }
