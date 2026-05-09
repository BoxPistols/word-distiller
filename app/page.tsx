'use client'

import { useState, useEffect } from 'react'
import ApiSettings from '@/components/ApiSettings'
import FragmentCard from '@/components/FragmentCard'
import Corpus from '@/components/Corpus'
import Overlay from '@/components/Overlay'
import Auth from '@/components/Auth'
import RandomWord from '@/components/RandomWord'
import Poems from '@/components/Poems'
import Anthology from '@/components/Anthology'
import Composer from '@/components/Composer'
import Visualizer from '@/components/Visualizer'
import HelpGuide from '@/components/HelpGuide'
import { useAuth } from '@/lib/auth-context'
import { subscribeCorpus, subscribePoems } from '@/lib/sync'
import { TEMP_LABELS } from '@/lib/types'
import { migrateLegacyPoem } from '@/lib/types'
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
  try {
    const raw = JSON.parse(localStorage.getItem(POEMS_KEY) || '[]')
    return Array.isArray(raw) ? raw.map(migrateLegacyPoem) : []
  } catch { return [] }
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
type Mode = 'anthology' | 'poems' | 'compose' | 'video' | 'corpus' | 'distill' | 'random' | 'help'

const MODE_TABS: { id: Mode; label: string; hint: string }[] = [
  { id: 'anthology', label: '歌集',     hint: '完成品を通読' },
  { id: 'poems',     label: '組詩',     hint: '清書・推敲' },
  { id: 'compose',   label: '作曲',     hint: '歌詞→旋律' },
  { id: 'video',     label: '映像',     hint: '歌詞→朝霧' },
  { id: 'corpus',    label: 'コーパス', hint: '採用断片' },
  { id: 'distill',   label: '蒸留',     hint: '断片を生成' },
  { id: 'random',    label: 'ランダム', hint: '流し場' },
  { id: 'help',      label: '使い方',   hint: 'ヘルプ' },
]

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
  const [mode, setMode]         = useState<Mode>('anthology')

  const { user, idToken, loading: authLoading } = useAuth()

  // API 設定の読み込みは初回だけ
  useEffect(() => {
    const k = localStorage.getItem('d_key') || ''
    const t = (localStorage.getItem('d_type') || 'openai') as ApiType
    setUserKey(k); setApiType(t)
  }, [])

  // 認証状態に応じて corpus を購読 (Firestore onSnapshot による複数端末リアルタイム同期)
  // 未ログイン: localStorage のみ
  // ログイン済み: onSnapshot を試行、ルール未デプロイ等で失敗したら既存 API fetch にフォールバック
  // 書き込みは既存 API ルート (Admin SDK) のままで、ここは「読み取り listener」のみ
  useEffect(() => {
    if (authLoading) return
    if (!user || !idToken) {
      setCorpus(loadCorpus())
      setSyncState('local')
      return
    }
    const fetchViaApi = async () => {
      try {
        const res = await fetch('/api/corpus', { headers: { Authorization: `Bearer ${idToken}` } })
        if (res.ok) {
          const data = await res.json() as CorpusItem[] | { error: string }
          if (Array.isArray(data)) {
            setCorpus(data); saveCorpus(data); setSyncState('db')
            return
          }
        }
      } catch {}
      setCorpus(loadCorpus()); setSyncState('local')
    }
    const unsub = subscribeCorpus(user.uid, items => {
      setCorpus(items); saveCorpus(items); setSyncState('db')
    }, {
      onError: () => {
        // ルール未デプロイ等で listener が拒否されたら API fetch (Admin SDK 経由) で取得
        fetchViaApi()
      },
    })
    return () => unsub()
  }, [user, idToken, authLoading])

  // 認証状態に応じて poems を購読 (corpus と同じ三段構え)
  useEffect(() => {
    if (authLoading) return
    if (!user || !idToken) {
      setPoems(loadPoems())
      return
    }
    const fetchViaApi = async () => {
      try {
        const res = await fetch('/api/poems', { headers: { Authorization: `Bearer ${idToken}` } })
        if (res.ok) {
          const data = await res.json() as Poem[] | { error: string }
          if (Array.isArray(data)) {
            const migrated = data.map(migrateLegacyPoem)
            setPoems(migrated); savePoems(migrated)
            return
          }
        }
      } catch {}
      setPoems(loadPoems())
    }
    const unsub = subscribePoems(user.uid, items => {
      setPoems(items); savePoems(items)
    }, {
      onError: () => fetchViaApi(),
    })
    return () => unsub()
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
      sections: [],
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
    patch: Partial<Pick<Poem, 'title' | 'sections' | 'status' | 'source_corpus_ids' | 'random_words' | 'note'>>
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

  // 組詩: 採用断片を複数選択して 1 つの組詩にマージ
  // 各採用断片が個別セクション（free/採用素材ラベル）として並ぶ。dedupe ON で重複行は統合
  const handleMergeCorpusToPoem = async (
    items: CorpusItem[],
    options: { dedupe: boolean }
  ) => {
    if (!items.length) return
    const seen = new Set<string>()
    const buildLines = (text: string): string[] => {
      const ls = text.split('\n').map(s => s.trim()).filter(Boolean)
      if (!options.dedupe) return ls
      const out: string[] = []
      for (const l of ls) {
        const key = l.replace(/\s+/g, ' ')
        if (seen.has(key)) continue
        seen.add(key)
        out.push(l)
      }
      return out
    }
    const initSections = items
      .map((it, i) => {
        const lines = buildLines(it.text)
        const head = lines[0]?.slice(0, 12) ?? ''
        return {
          id: crypto.randomUUID(),
          kind: 'free' as const,
          label: head ? `素材 ${i + 1}: ${head}` : `素材 ${i + 1}`,
          lines,
        }
      })
      .filter(s => s.lines.length > 0)
    if (!initSections.length) return

    // 自動タイトル: 各素材の最初の行(6文字)を連結。「素材 4 件: 日差し / 塩気 / 雨 / 塹壕」のような可読タイトル
    const heads = initSections.map(s => s.lines[0]?.slice(0, 6) ?? '').filter(Boolean)
    const autoTitle = `素材 ${initSections.length} 件: `
      + heads.slice(0, 4).join(' / ')
      + (heads.length > 4 ? ' …' : '')

    const now = new Date().toISOString()
    const tempId = crypto.randomUUID()
    const entry: Poem = {
      id: tempId,
      title: autoTitle,
      sections: initSections,
      status: 'draft',
      source_corpus_ids: items.map(i => i.id),
      random_words: [],
      note: `${items.length} 件の採用断片からマージ${options.dedupe ? '（重複統合）' : ''}`,
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
        body: JSON.stringify({
          sections: initSections,
          source_corpus_ids: items.map(i => i.id),
          note: entry.note,
        }),
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

  // 組詩: ランダム流し場の溜まりから新規組詩を作る
  // pool 全体を 1 つの「自由」セクションとして取り込む
  const handleSendPoolToPoem = async (words: string[]) => {
    if (!words.length) return
    const now = new Date().toISOString()
    const tempId = crypto.randomUUID()
    const sectionId = crypto.randomUUID()
    const initSections = [{
      id: sectionId,
      kind: 'free' as const,
      label: 'ランダム取り込み',
      lines: [...words],
    }]
    const entry: Poem = {
      id: tempId,
      title: '',
      sections: initSections,
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
        body: JSON.stringify({ sections: initSections, random_words: words, note: 'ランダム流し場から取り込み' }),
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

  // 組詩: AI 意味付け — セクションの行を歌詞らしく繋ぎ直す
  const handlePoetize = async (lines: string[]): Promise<string[]> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (idToken) headers.Authorization = `Bearer ${idToken}`
    const res = await fetch('/api/poetize', {
      method: 'POST',
      headers,
      body: JSON.stringify({ lines, apiType, userApiKey: userKey || undefined }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(err.error || `${res.status}`)
    }
    const data = await res.json() as { poetized: string[] }
    return data.poetized
  }

  // 組詩: 既存の複数組詩をマージして 1 つの新組詩を作る
  // 各組詩の sections を順次連結。dedupe ON で全体を通して重複行を統合
  const handleMergePoems = async (
    selectedPoems: Poem[],
    options: { dedupe: boolean; flatten?: boolean; status?: 'draft' | 'fair_copy' | 'bound' }
  ) => {
    if (selectedPoems.length < 2) return
    const seenLines = new Set<string>()
    const buildLines = (lines: string[]): string[] => {
      if (!options.dedupe) return [...lines]
      const out: string[] = []
      for (const l of lines) {
        const key = l.trim().replace(/\s+/g, ' ')
        if (!key) { out.push(l); continue }
        if (seenLines.has(key)) continue
        seenLines.add(key)
        out.push(l)
      }
      return out
    }
    // flatten=true（清書化マージ）は全行を 1 つの section に結合。1 つの TextArea で扱える形へ
    const mergedSections = options.flatten
      ? (() => {
          const allLines = buildLines(
            selectedPoems.flatMap(p => p.sections.flatMap(s => s.lines))
          )
          if (allLines.length === 0) return []
          return [{
            id: crypto.randomUUID(),
            kind: 'free' as const,
            label: '清書',
            lines: allLines,
          }]
        })()
      : selectedPoems
          .flatMap(p => p.sections.map(s => ({
            ...s,
            id: crypto.randomUUID(),
            lines: buildLines(s.lines),
          })))
          .filter(s => s.lines.length > 0)
    if (!mergedSections.length) return

    const titles = selectedPoems.map(p => p.title).filter(Boolean)
    const autoTitle = titles.length > 0
      ? `${titles.slice(0, 3).join(' + ')}${titles.length > 3 ? ' …' : ''}${options.flatten ? ' (清書)' : ' (マージ)'}`
      : `${options.flatten ? '清書' : '組詩マージ'} ${selectedPoems.length} 件`
    const sourceIds = Array.from(new Set(
      selectedPoems.flatMap(p => p.source_corpus_ids ?? [])
    ))

    const status = options.status ?? 'draft'
    const noteSuffix = options.flatten ? '結合フラット化' : (options.dedupe ? '重複統合' : '')
    const now = new Date().toISOString()
    const tempId = crypto.randomUUID()
    const entry: Poem = {
      id: tempId,
      title: autoTitle,
      sections: mergedSections,
      status,
      source_corpus_ids: sourceIds,
      random_words: [],
      note: `${selectedPoems.length} 件の組詩を${options.flatten ? '結合して清書化' : 'マージ'}${noteSuffix ? `（${noteSuffix}）` : ''}`,
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
        body: JSON.stringify({
          title: autoTitle,
          sections: mergedSections,
          status,
          source_corpus_ids: sourceIds,
          note: entry.note,
        }),
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

  // 単独の下書きを清書化: sections を 1 つに結合、status='fair_copy' で新規 poem として並列生成（元 draft は無傷）
  const handlePromoteToFairCopy = async (draft: Poem) => {
    const allLines = draft.sections.flatMap(s => s.lines.filter(l => l.trim()))
    if (allLines.length === 0) return
    const now = new Date().toISOString()
    const tempId = crypto.randomUUID()
    const entry: Poem = {
      id: tempId,
      title: draft.title || '清書',
      sections: [{
        id: crypto.randomUUID(),
        kind: 'free',
        label: '清書',
        lines: allLines,
      }],
      status: 'fair_copy',
      source_corpus_ids: draft.source_corpus_ids ?? [],
      random_words: draft.random_words ?? [],
      note: `「${draft.title || '無題'}」を清書化（結合フラット化、元下書きは保持）`,
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
        body: JSON.stringify({
          title: entry.title,
          sections: entry.sections,
          status: 'fair_copy',
          source_corpus_ids: entry.source_corpus_ids,
          random_words: entry.random_words,
          note: entry.note,
        }),
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
            <span style={title}>詠 — yomu</span>
            <span style={subtitle}>言葉と音声の総合クリエイティブツール</span>
          </div>
          <Auth />
        </header>

        {/* mode タブ — ゴール (歌集 = 製本完成品) を最左に配置し作品化を視覚的に強調 */}
        <nav style={tabBar} role="tablist" aria-label="モード切替">
          {MODE_TABS.map(t => {
            const active = mode === t.id
            return (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setMode(t.id)}
                style={{ ...tabBtn, ...(active ? tabBtnActive : {}) }}
                title={t.hint}
              >
                <span style={tabLabel}>{t.label}</span>
                <span style={tabHint}>{t.hint}</span>
              </button>
            )
          })}
        </nav>

        <main style={main}>

          {/* 歌集 — 完成品の組詩を一箇所に集めて通読・全曲書き出し・全曲読み上げ */}
          {mode === 'anthology' && (
            <div id="panel-anthology" role="tabpanel" aria-labelledby="tab-anthology">
              <Anthology poems={poems} authToken={idToken ?? undefined} />
            </div>
          )}

          {/* 組詩 — 採用断片やランダム語を行として組み、清書・製本版へ昇華させる */}
          {mode === 'poems' && (
            <div id="panel-poems" role="tabpanel" aria-labelledby="tab-poems">
              <Poems
                poems={poems}
                acceptedCorpus={corpus.filter(c => c.verdict === 'accepted')}
                authToken={idToken ?? undefined}
                onCreate={handlePoemCreate}
                onUpdate={handlePoemUpdate}
                onRemove={handlePoemRemove}
                onMergePoems={handleMergePoems}
                onPromoteToFairCopy={handlePromoteToFairCopy}
                onPoetize={handlePoetize}
              />
            </div>
          )}

          {/* 作曲 — 組詩のセクションを選んで AI でメロディ化、Tone.js でライブ再生 */}
          {mode === 'compose' && (
            <div id="panel-compose" role="tabpanel" aria-labelledby="tab-compose">
              <Composer
                poems={poems}
                apiType={apiType}
                userApiKey={userKey}
                authToken={idToken ?? undefined}
              />
            </div>
          )}

          {/* 映像 — 組詩の各行に同期した抽象映像（Canvas 2D + 粒子＋残像、朝霧モチーフ） */}
          {mode === 'video' && (
            <div id="panel-video" role="tabpanel" aria-labelledby="tab-video">
              <Visualizer poems={poems} />
            </div>
          )}

          {/* コーパス */}
          {mode === 'corpus' && (
            <div id="panel-corpus" role="tabpanel" aria-labelledby="tab-corpus">
              <Corpus corpus={corpus} poems={poems} onRemove={handleRemove} onUpdate={handleUpdate} onExport={handleExport} onMergeToPoem={handleMergeCorpusToPoem} />
            </div>
          )}

          {/* 蒸留 — API 設定 + 断片投入 + 出力をまとめる */}
          {mode === 'distill' && (
            <div id="panel-distill" role="tabpanel" aria-labelledby="tab-distill">
              <section style={sec}>
                <div style={lbl}>API 設定</div>
                <ApiSettings
                  apiType={apiType} userKey={userKey}
                  onApiTypeChange={setApiType} onUserKeyChange={setUserKey}
                />
              </section>

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
            </div>
          )}

          {/* ランダム生成モード — 蒸留の対極（意味を持たせない＝詩的） */}
          {mode === 'random' && (
            <div id="panel-random" role="tabpanel" aria-labelledby="tab-random">
              <RandomWord onSendToPoem={handleSendPoolToPoem} />
            </div>
          )}

          {mode === 'help' && (
            <div id="panel-help" role="tabpanel" aria-labelledby="tab-help">
              <HelpGuide />
            </div>
          )}

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
const tabBar: React.CSSProperties = { display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
  paddingTop: 18, overflowX: 'auto' }
const tabBtn: React.CSSProperties = {
  background: 'transparent',
  borderTopWidth: 0, borderRightWidth: 0, borderLeftWidth: 0, borderBottomWidth: 2,
  borderStyle: 'solid',
  // shorthand と longhand 混在を避けるため 4 辺別々に色指定（active 時の borderBottomColor 上書きで警告が出るのを防ぐ）
  borderTopColor: 'transparent', borderRightColor: 'transparent',
  borderLeftColor: 'transparent', borderBottomColor: 'transparent',
  color: 'rgba(255,255,255,.45)', cursor: 'pointer',
  padding: '12px 18px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
  fontFamily: 'var(--mono)', minWidth: 80, transition: 'color .15s',
}
const tabBtnActive: React.CSSProperties = {
  color: 'var(--bright)',
  borderBottomColor: 'var(--acc)',
}
const tabLabel: React.CSSProperties = { fontSize: 13, letterSpacing: '.3em' }
const tabHint: React.CSSProperties = { fontSize: 12, letterSpacing: '.1em', color: 'rgba(255,255,255,.3)' }
const title: React.CSSProperties = { fontSize: 13, letterSpacing: '.45em', color: 'var(--dim)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }
const subtitle: React.CSSProperties = { fontSize: 12, letterSpacing: '.2em', color: 'rgba(255,255,255,.25)', fontFamily: 'var(--mono)' }
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
const modelNote: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.3)', fontFamily: 'var(--mono)', letterSpacing: '.15em' }
const errStyle: React.CSSProperties = { fontSize: 12, color: 'var(--rej)', fontFamily: 'var(--mono)', letterSpacing: '.1em' }
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }
const foot: React.CSSProperties = { padding: '22px 0 44px', borderTop: '1px solid var(--border)',
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.2em',
  color: 'rgba(255,255,255,.15)', display: 'flex', justifyContent: 'space-between' }
const syncStyle = (s: SyncState): React.CSSProperties => ({
  color: s === 'db' ? 'var(--acc)' : s === 'local' ? 'rgba(140,220,200,.55)' : 'rgba(255,255,255,.15)',
})
