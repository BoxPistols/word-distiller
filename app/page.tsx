'use client'

import { useState, useEffect } from 'react'
import ApiSettings from '@/components/ApiSettings'
import FragmentCard from '@/components/FragmentCard'
import Corpus from '@/components/Corpus'
import Overlay from '@/components/Overlay'
import { TEMP_LABELS } from '@/lib/types'
import type { ApiType, CorpusItem, GenerateResponse } from '@/lib/types'

const CORPUS_KEY = 'd_corpus'

function loadCorpus(): CorpusItem[] {
  try { return JSON.parse(localStorage.getItem(CORPUS_KEY) || '[]') }
  catch { return [] }
}

function saveCorpus(items: CorpusItem[]) {
  localStorage.setItem(CORPUS_KEY, JSON.stringify(items))
}

function corpusToText(corpus: CorpusItem[]): string {
  const fmt = (c: CorpusItem) => {
    let s = `——\n${c.text}`
    if (c.reason) s += `\n理由: ${c.reason}`
    if (c.tags?.length) s += `\nタグ: ${c.tags.join(' / ')}`
    return s
  }
  const acc = corpus.filter(c => c.verdict === 'accepted')
  const rej = corpus.filter(c => c.verdict === 'rejected')
  return `=== 採用 ===\n\n${acc.map(fmt).join('\n\n')}\n\n\n=== 却下 ===\n\n${rej.map(fmt).join('\n\n')}`
}

export default function Page() {
  const [apiType, setApiType]   = useState<ApiType>('openai')
  const [userKey, setUserKey]   = useState('')
  const [input, setInput]       = useState('')
  const [tempIdx, setTempIdx]   = useState(2)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [fragments, setFragments] = useState<string[]>([])
  const [usedModel, setUsedModel] = useState('')
  const [sessionKey, setSessionKey] = useState(0)
  const [corpus, setCorpus]     = useState<CorpusItem[]>([])
  const [overlay, setOverlay]   = useState<{ label: string; text: string } | null>(null)

  // 初期化
  useEffect(() => {
    const k = localStorage.getItem('d_key') || ''
    const t = (localStorage.getItem('d_type') || 'openai') as ApiType
    setUserKey(k); setApiType(t)
    setCorpus(loadCorpus())
  }, [])

  // 生成（採用コーパスをRAGとして送信）
  const handleDistill = async () => {
    if (!input.trim() || loading) return
    setLoading(true); setError(''); setFragments([])
    const accepted = corpus.filter(c => c.verdict === 'accepted').slice(0, 5)
    try {
      const res = await fetch('/api/distill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, tempIdx, apiType, userApiKey: userKey || undefined, accepted }),
      })
      const data = await res.json() as GenerateResponse & { error?: string }
      if (data.error) throw new Error(data.error)
      setFragments(data.fragments)
      setUsedModel(data.model)
      setSessionKey(k => k + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }

  // 判定 → localStorageに保存
  const handleVerdict = (item: Omit<CorpusItem, 'id' | 'created_at'>) => {
    const entry: CorpusItem = {
      ...item,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    }
    const next = [entry, ...corpus]
    setCorpus(next)
    saveCorpus(next)
  }

  // 削除
  const handleRemove = (id: string) => {
    const next = corpus.filter(c => c.id !== id)
    setCorpus(next)
    saveCorpus(next)
  }

  // 書き出し
  const handleExport = (type: 'text' | 'json') => {
    if (!corpus.length) return
    const text = type === 'json' ? JSON.stringify(corpus, null, 2) : corpusToText(corpus)
    const label = type === 'json' ? 'JSON' : 'コーパス'
    setOverlay({ label, text })
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <div style={wrap}>

        {/* ヘッダー */}
        <header style={header}>
          <span style={title}>蒸留器</span>
          <span style={subtitle}>corpus builder / private</span>
        </header>

        <main style={main}>

          {/* API設定 */}
          <section style={sec}>
            <div style={lbl}>API 設定</div>
            <ApiSettings
              apiType={apiType} userKey={userKey}
              onApiTypeChange={setApiType} onUserKeyChange={setUserKey}
            />
          </section>

          {/* 入力 */}
          <section style={sec}>
            <div style={lbl}>断片を投げる</div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleDistill() }}
              placeholder="単語、断片、矛盾　——　何でも"
              style={ta}
            />
            <div style={tempRow}>
              <span style={tempLbl}>散漫度</span>
              <input type="range" min={0} max={4} step={1} value={tempIdx}
                onChange={e => setTempIdx(+e.target.value)}
                style={{ flex: 1, accentColor: 'var(--acc)', cursor: 'pointer' }} />
              <span style={tempDesc}>{TEMP_LABELS[tempIdx]}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={handleDistill} disabled={loading} style={distillBtn}>
                {loading ? '——' : '蒸留する'}
              </button>
              {usedModel && !loading && (
                <span style={modelNote}>— {usedModel}</span>
              )}
              {error && <span style={errStyle}>{error}</span>}
            </div>
          </section>

          {/* 断片出力 */}
          {fragments.length > 0 && (
            <section style={sec}>
              <div style={lbl}>断片　——　判定して記録する</div>
              <div style={grid}>
                {fragments.map((text, i) => (
                  <FragmentCard
                    key={`${sessionKey}-${i}`}
                    index={i} text={text} inputWord={input}
                    onAccept={handleVerdict} onReject={handleVerdict}
                  />
                ))}
              </div>
            </section>
          )}

          {/* コーパス */}
          <Corpus corpus={corpus} onRemove={handleRemove} onExport={handleExport} />

        </main>

        <footer style={foot}>
          <span>private / corpus builder</span>
          <span>採用 {corpus.filter(c => c.verdict === 'accepted').length} 件蓄積</span>
        </footer>
      </div>

      {overlay && (
        <Overlay label={overlay.label} text={overlay.text} onClose={() => setOverlay(null)} />
      )}
    </div>
  )
}

const wrap: React.CSSProperties = { maxWidth: 900, margin: '0 auto', padding: '0 28px' }
const header: React.CSSProperties = { padding: '48px 0 26px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'baseline', gap: 20 }
const title: React.CSSProperties = { fontSize: 13, letterSpacing: '.45em', color: 'var(--dim)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }
const subtitle: React.CSSProperties = { fontSize: 11, letterSpacing: '.2em', color: 'rgba(255,255,255,.25)', fontFamily: 'var(--mono)' }
const main: React.CSSProperties = { padding: '48px 0', display: 'flex', flexDirection: 'column', gap: 56 }
const sec: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 }
const lbl: React.CSSProperties = { fontSize: 12, letterSpacing: '.4em', color: 'var(--dim)', fontFamily: 'var(--mono)' }
const ta: React.CSSProperties = { width: '100%', minHeight: 72, background: 'var(--glass)',
  border: '1px solid var(--border)', color: 'var(--bright)', fontFamily: 'var(--serif)',
  fontWeight: 300, fontSize: 15, lineHeight: 1.9, padding: '14px 16px', resize: 'none', outline: 'none', letterSpacing: '.06em' }
const tempRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14 }
const tempLbl: React.CSSProperties = { fontSize: 12, letterSpacing: '.3em', color: 'var(--dim)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }
const tempDesc: React.CSSProperties = { fontSize: 12, letterSpacing: '.15em', color: 'rgba(255,255,255,.4)', fontFamily: 'var(--mono)', minWidth: 64 }
const distillBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.4em',
  color: '#0a0a0a', background: 'var(--acc)', border: 'none', padding: '11px 28px', cursor: 'pointer' }
const modelNote: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,.3)', fontFamily: 'var(--mono)', letterSpacing: '.15em' }
const errStyle: React.CSSProperties = { fontSize: 11, color: 'var(--rej)', fontFamily: 'var(--mono)', letterSpacing: '.1em' }
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }
const foot: React.CSSProperties = { padding: '22px 0 44px', borderTop: '1px solid var(--border)',
  fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em',
  color: 'rgba(255,255,255,.15)', display: 'flex', justifyContent: 'space-between' }
