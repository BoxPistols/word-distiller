'use client'

import { useState, useEffect } from 'react'
import ApiSettings from '@/components/ApiSettings'
import FragmentCard from '@/components/FragmentCard'
import Corpus from '@/components/Corpus'
import Overlay from '@/components/Overlay'
import Auth from '@/components/Auth'
import RandomWord from '@/components/RandomWord'
import Poems from '@/components/Poems'
import { useAuth } from '@/lib/auth-context'
import { TEMP_LABELS } from '@/lib/types'
import type { ApiType, CorpusItem, GenerateResponse, Poem } from '@/lib/types'

const CORPUS_KEY = 'd_corpus'
const POEMS_KEY  = 'd_poems'

function loadCorpus(): CorpusItem[] {
  try { return JSON.parse(localStorage.getItem(CORPUS_KEY) || '[]') }
  catch { return [] }
}

function saveCorpus(items: CorpusItem[]) {
  localStorage.setItem(CORPUS_KEY, JSON.stringify(items))
}

function loadPoems(): Poem[] {
  try { return JSON.parse(localStorage.getItem(POEMS_KEY) || '[]') }
  catch { return [] }
}

function savePoems(items: Poem[]) {
  localStorage.setItem(POEMS_KEY, JSON.stringify(items))
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

type SyncState = 'unknown' | 'db' | 'local'

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
  const [poems, setPoems]       = useState<Poem[]>([])
  const [overlay, setOverlay]   = useState<{ label: string; text: string } | null>(null)
  const [syncState, setSyncState] = useState<SyncState>('unknown')

  const { user, idToken, loading: authLoading } = useAuth()

  // API 設定の読み込みは初回だけ
  useEffect(() => {
    const k = localStorage.getItem('d_key') || ''
    const t = (localStorage.getItem('d_type') || 'openai') as ApiType
    setUserKey(k); setApiType(t)
  }, [])

  // 認証状態に応じてコーパスを再ロード
  useEffect(() => {
    if (authLoading) return
    ;(async () => {
      // 未ログイン: localStorage のみ
      if (!user || !idToken) {
        setCorpus(loadCorpus())
        setSyncState('local')
        return
      }
      // ログイン済み: DB 優先、失敗時 localStorage にフォールバック
      try {
        const res = await fetch('/api/corpus', {
          headers: { Authorization: `Bearer ${idToken}` },
        })
        if (res.ok) {
          const data = await res.json() as CorpusItem[] | { error: string }
          if (Array.isArray(data)) {
            setCorpus(data)
            saveCorpus(data)
            setSyncState('db')
            return
          }
        }
      } catch {}
      setCorpus(loadCorpus())
      setSyncState('local')
    })()
  }, [user, idToken, authLoading])

  // 認証状態に応じて組詩を再ロード
  useEffect(() => {
    if (authLoading) return
    ;(async () => {
      if (!user || !idToken) {
        setPoems(loadPoems())
        return
      }
      try {
        const res = await fetch('/api/poems', {
          headers: { Authorization: `Bearer ${idToken}` },
        })
        if (res.ok) {
          const data = await res.json() as Poem[] | { error: string }
          if (Array.isArray(data)) {
            setPoems(data)
            savePoems(data)
            return
          }
        }
      } catch {}
      setPoems(loadPoems())
    })()
  }, [user, idToken, authLoading])

  // 生成
  // - サインイン中: サーバーが Firestore から uid scope の採用断片を top-k で取得（RAG）
  // - 未サインイン: クライアントが localStorage から最新 5 件を送信（フォールバック）
  const handleDistill = async () => {
    if (!input.trim() || loading) return
    setLoading(true); setError(''); setFragments([])
    const accepted = idToken ? [] : corpus.filter(c => c.verdict === 'accepted').slice(0, 5)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (idToken) headers.Authorization = `Bearer ${idToken}`
    try {
      const res = await fetch('/api/distill', {
        method: 'POST',
        headers,
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

  // 判定 → 楽観的更新 → ログイン中のみDB保存 → 成功時にFirestore IDで置換
  const handleVerdict = async (item: Omit<CorpusItem, 'id' | 'created_at'>) => {
    const tempId = crypto.randomUUID()
    const entry: CorpusItem = {
      ...item,
      id: tempId,
      created_at: new Date().toISOString(),
    }
    setCorpus(prev => {
      const next = [entry, ...prev]
      saveCorpus(next)
      return next
    })
    if (!idToken) return  // 未ログイン: localStorage のみで完結
    try {
      const res = await fetch('/api/corpus', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(item),
      })
      if (res.ok) {
        const saved = await res.json() as CorpusItem
        setCorpus(prev => {
          const next = prev.map(c => c.id === tempId ? saved : c)
          saveCorpus(next)
          return next
        })
      }
    } catch {}
  }

  // 部分更新 → 楽観的更新 → ログイン中のみDB更新 → 失敗時は復元
  const handleUpdate = async (
    id: string,
    patch: { text?: string; verdict?: 'accepted' | 'rejected'; reason?: string; tags?: string[] }
  ) => {
    let prevCorpus: CorpusItem[] = []
    setCorpus(prev => {
      prevCorpus = prev
      const next = prev.map(c => c.id === id ? { ...c, ...patch } : c)
      saveCorpus(next)
      return next
    })
    if (!idToken) return
    try {
      const res = await fetch(`/api/corpus/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(patch),
      })
      if (res.ok) {
        const updated = await res.json() as CorpusItem
        setCorpus(prev => {
          const next = prev.map(c => c.id === id ? updated : c)
          saveCorpus(next)
          return next
        })
      } else if (syncState === 'db') {
        setCorpus(prevCorpus); saveCorpus(prevCorpus)
      }
    } catch {
      if (syncState === 'db') {
        setCorpus(prevCorpus); saveCorpus(prevCorpus)
      }
    }
  }

  // 削除 → 楽観的削除 → ログイン中のみDB削除 → 失敗時は復元
  const handleRemove = async (id: string) => {
    let prevCorpus: CorpusItem[] = []
    setCorpus(prev => {
      prevCorpus = prev
      const next = prev.filter(c => c.id !== id)
      saveCorpus(next)
      return next
    })
    if (!idToken) return  // 未ログイン: localStorage のみで完結
    try {
      const res = await fetch(`/api/corpus/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok && syncState === 'db') {
        setCorpus(prevCorpus)
        saveCorpus(prevCorpus)
      }
    } catch {
      if (syncState === 'db') {
        setCorpus(prevCorpus)
        saveCorpus(prevCorpus)
      }
    }
  }

  // 組詩: 新規作成 → 楽観追加 → ログイン中のみDB作成 → 成功時にDB IDで置換
  const handlePoemCreate = async () => {
    const now = new Date().toISOString()
    const tempId = crypto.randomUUID()
    const entry: Poem = {
      id: tempId,
      title: '',
      lines: [],
      status: 'draft',
      source_corpus_ids: [],
      random_words: [],
      note: '',
      created_at: now,
      updated_at: now,
    }
    setPoems(prev => {
      const next = [entry, ...prev]
      savePoems(next)
      return next
    })
    if (!idToken) return
    try {
      const res = await fetch('/api/poems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const saved = await res.json() as Poem
        setPoems(prev => {
          const next = prev.map(p => p.id === tempId ? saved : p)
          savePoems(next)
          return next
        })
      }
    } catch {}
  }

  // 組詩: 部分更新 → 楽観 → DB → 失敗時ロールバック
  const handlePoemUpdate = async (
    id: string,
    patch: Partial<Pick<Poem, 'title' | 'lines' | 'status' | 'source_corpus_ids' | 'random_words' | 'note'>>
  ) => {
    let prev: Poem[] = []
    setPoems(p => {
      prev = p
      const next = p.map(x => x.id === id
        ? { ...x, ...patch, updated_at: new Date().toISOString() }
        : x)
      savePoems(next)
      return next
    })
    if (!idToken) return
    try {
      const res = await fetch(`/api/poems/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(patch),
      })
      if (res.ok) {
        const updated = await res.json() as Poem
        setPoems(p => {
          const next = p.map(x => x.id === id ? updated : x)
          savePoems(next)
          return next
        })
      } else if (syncState === 'db') {
        setPoems(prev); savePoems(prev)
      }
    } catch {
      if (syncState === 'db') { setPoems(prev); savePoems(prev) }
    }
  }

  // 組詩: ランダム流し場の溜まりから新規組詩を作る
  const handleSendPoolToPoem = async (words: string[]) => {
    if (!words.length) return
    const now = new Date().toISOString()
    const tempId = crypto.randomUUID()
    const entry: Poem = {
      id: tempId,
      title: '',
      lines: [...words],
      status: 'draft',
      source_corpus_ids: [],
      random_words: [...words],
      note: 'ランダム流し場から取り込み',
      created_at: now,
      updated_at: now,
    }
    setPoems(prev => {
      const next = [entry, ...prev]
      savePoems(next)
      return next
    })
    if (!idToken) return
    try {
      const res = await fetch('/api/poems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ lines: words, random_words: words, note: 'ランダム流し場から取り込み' }),
      })
      if (res.ok) {
        const saved = await res.json() as Poem
        setPoems(prev => {
          const next = prev.map(p => p.id === tempId ? saved : p)
          savePoems(next)
          return next
        })
      }
    } catch {}
  }

  // 組詩: 削除 → 楽観 → DB → 失敗時復元
  const handlePoemRemove = async (id: string) => {
    let prev: Poem[] = []
    setPoems(p => {
      prev = p
      const next = p.filter(x => x.id !== id)
      savePoems(next)
      return next
    })
    if (!idToken) return
    try {
      const res = await fetch(`/api/poems/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok && syncState === 'db') { setPoems(prev); savePoems(prev) }
    } catch {
      if (syncState === 'db') { setPoems(prev); savePoems(prev) }
    }
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
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
            <span style={title}>蒸留器</span>
            <span style={subtitle}>corpus builder / private</span>
          </div>
          <Auth />
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
          <Corpus corpus={corpus} onRemove={handleRemove} onUpdate={handleUpdate} onExport={handleExport} />

          {/* 組詩 — 採用断片やランダム語を行として組み、清書・製本版へ昇華させる */}
          <Poems
            poems={poems}
            acceptedCorpus={corpus.filter(c => c.verdict === 'accepted')}
            onCreate={handlePoemCreate}
            onUpdate={handlePoemUpdate}
            onRemove={handlePoemRemove}
          />

          {/* ランダム生成モード — 蒸留器の対極（意味を持たせない＝詩的） */}
          <RandomWord onSendToPoem={handleSendPoolToPoem} />

        </main>

        <footer style={foot}>
          <span>private / corpus builder</span>
          <span style={{ display: 'flex', gap: 18 }}>
            <span style={syncStyle(syncState)}>
              {syncState === 'db' ? 'DB同期' : syncState === 'local' ? 'ローカルのみ' : '——'}
            </span>
            <span>採用 {corpus.filter(c => c.verdict === 'accepted').length} / 組詩 {poems.length}</span>
          </span>
        </footer>
      </div>

      {overlay && (
        <Overlay label={overlay.label} text={overlay.text} onClose={() => setOverlay(null)} />
      )}
    </div>
  )
}

const wrap: React.CSSProperties = { maxWidth: 900, margin: '0 auto', padding: '0 28px' }
const header: React.CSSProperties = { padding: '48px 0 26px', borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }
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
const syncStyle = (s: SyncState): React.CSSProperties => ({
  color: s === 'db' ? 'var(--acc)' : s === 'local' ? 'rgba(220,180,90,.55)' : 'rgba(255,255,255,.15)',
})
