'use client'

// 集約 / 歌集 — 完成品の組詩を 1 ページに連続展示する読書モード
// ステータスフィルタ（製本版のみ / 清書以上 / 全て）で絞り込み、
// 全曲を Markdown / テキスト / JSON で一括書き出し、TTS で全曲連続再生

import { useEffect, useMemo, useRef, useState } from 'react'
import { POEM_STATUS_LABELS, POEM_SECTION_KIND_LABELS } from '@/lib/types'
import type { Poem, PoemSection } from '@/lib/types'
import { getProvider, TTS_PROVIDER_LABELS } from '@/lib/tts'
import type { TtsProviderId, TtsVoice } from '@/lib/tts'
import { splitForTts } from '@/lib/tts/chunk'
import { TtsQueue } from '@/lib/tts/queue'
import { getVoicevoxUrl, setVoicevoxUrl } from '@/lib/tts/voicevox'

interface Props {
  poems: Poem[]
  authToken?: string
}

type FilterMode = 'bound' | 'fair_copy_or_above' | 'all'

const FILTER_LABELS: Record<FilterMode, string> = {
  bound: '製本版のみ',
  fair_copy_or_above: '清書以上',
  all: '全て',
}

function sectionLabel(s: PoemSection): string {
  return s.label || POEM_SECTION_KIND_LABELS[s.kind]
}

function passesFilter(p: Poem, mode: FilterMode): boolean {
  if (mode === 'all') return true
  if (mode === 'bound') return p.status === 'bound'
  return p.status === 'bound' || p.status === 'fair_copy'
}

function formatAsText(poems: Poem[]): string {
  return poems.map(p => {
    const head = `【${p.title || '無題'}】（${POEM_STATUS_LABELS[p.status]}）`
    const body = p.sections.map(s =>
      `【${sectionLabel(s)}】\n${s.lines.join('\n')}`
    ).join('\n\n')
    return `${head}\n\n${body}`
  }).join('\n\n────────\n\n')
}

function formatAsMarkdown(poems: Poem[]): string {
  const blocks: string[] = []
  for (const p of poems) {
    const lines: string[] = []
    lines.push(`# ${p.title || '無題'}`, '')
    lines.push(`*${POEM_STATUS_LABELS[p.status]}*`, '')
    for (const s of p.sections) {
      lines.push(`## ${sectionLabel(s)}`, '')
      for (const l of s.lines) lines.push(l ? `> ${l}` : '>')
      lines.push('')
    }
    blocks.push(lines.join('\n'))
  }
  return blocks.join('\n---\n\n')
}

function poemToSpeechText(p: Poem): string {
  return p.sections
    .filter(s => s.lines.some(l => l.trim()))
    .map(s => `${sectionLabel(s)}。${s.lines.filter(l => l.trim()).join('、')}。`)
    .join('　　')
}

export default function Anthology({ poems, authToken }: Props) {
  const [filter, setFilter]         = useState<FilterMode>('fair_copy_or_above')
  const [exportType, setExportType] = useState<'text' | 'markdown' | 'json' | null>(null)

  // TTS — Phase 2: chunk 単位 queue + pause/resume + 進捗
  const [providerId, setProviderId] = useState<TtsProviderId>('browser')
  const [speakState, setSpeakState] = useState<'idle' | 'playing' | 'paused'>('idle')
  const [speakRate, setSpeakRate]   = useState(1.0)
  const [voices, setVoices]         = useState<TtsVoice[]>([])
  const [voiceId, setVoiceId]       = useState<string>('')
  const [byokKey, setByokKey]       = useState<string>('')
  const [vvUrl, setVvUrl]           = useState<string>('')
  const [speakError, setSpeakError] = useState<string | null>(null)
  const [nowPlaying, setNowPlaying] = useState<string | null>(null)
  const [chunkProgress, setChunkProgress] = useState<{ current: number; total: number } | null>(null)
  const queueRef = useRef<TtsQueue | null>(null)
  const provider = getProvider(providerId)

  const items = useMemo(() => poems.filter(p => passesFilter(p, filter)), [poems, filter])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setByokKey(localStorage.getItem('d_xai_key') || '')
    setVvUrl(getVoicevoxUrl())
  }, [])

  useEffect(() => {
    if (!provider.isAvailable()) { setVoices([]); return }
    let cancelled = false
    provider.getVoices().then(vs => { if (!cancelled) setVoices(vs) })
    return () => {
      cancelled = true
      queueRef.current?.stop()
      queueRef.current = null
      setSpeakState('idle'); setNowPlaying(null); setChunkProgress(null)
    }
  }, [providerId, provider])

  const handleExport = (type: 'text' | 'markdown' | 'json') => {
    if (items.length === 0) return
    let body: string
    if (type === 'json') body = JSON.stringify(items, null, 2)
    else if (type === 'markdown') body = formatAsMarkdown(items)
    else body = formatAsText(items)
    navigator.clipboard.writeText(body).catch(() => {})
    setExportType(type)
    setTimeout(() => setExportType(null), 1500)
  }

  // playing → pause、paused → resume、それ以外 → 新規開始（全曲を chunk 列に分割し queue へ）
  const handleSpeakAll = async () => {
    if (speakState === 'playing') {
      queueRef.current?.pause()
      setSpeakState('paused')
      return
    }
    if (speakState === 'paused') {
      setSpeakState('playing')
      await queueRef.current?.resume()
      return
    }
    if (items.length === 0) return

    // 全曲を chunk 列に展開。chunk → 元 poem の対応表も同時に作る
    const allChunks: string[] = []
    const chunkMap: { poemId: string }[] = []
    for (const p of items) {
      const text = poemToSpeechText(p)
      if (!text.trim()) continue
      const chunks = splitForTts(text)
      for (const c of chunks) {
        allChunks.push(c)
        chunkMap.push({ poemId: p.id })
      }
    }
    if (allChunks.length === 0) return

    setSpeakError(null)
    setSpeakState('playing')
    setChunkProgress({ current: 0, total: allChunks.length })

    const queue = new TtsQueue({
      chunks: allChunks,
      provider,
      speakOpts: {
        rate: speakRate,
        voiceId,
        authToken,
        byokKey: providerId === 'xai' ? byokKey : undefined,
      },
      onChunkStart: (idx) => {
        setNowPlaying(chunkMap[idx]?.poemId ?? null)
      },
      onProgress: (completed, total) => {
        setChunkProgress({ current: completed, total })
      },
      onComplete: () => {
        setSpeakState('idle'); setNowPlaying(null); setChunkProgress(null)
        queueRef.current = null
      },
      onError: (e) => {
        setSpeakError(e instanceof Error ? e.message : String(e))
        setSpeakState('idle'); setNowPlaying(null); setChunkProgress(null)
        queueRef.current = null
      },
    })
    queueRef.current = queue
    await queue.start()
  }

  const handleSpeakStop = () => {
    queueRef.current?.stop()
    queueRef.current = null
    setSpeakState('idle'); setNowPlaying(null); setChunkProgress(null)
  }

  return (
    <div style={wrap}>
      <div style={hdr}>
        <span style={lbl}>集約　・　歌集</span>
        <span style={stat}>{items.length} 曲</span>
      </div>

      <div style={tabs}>
        {(['bound', 'fair_copy_or_above', 'all'] as FilterMode[]).map(m => (
          <button key={m} onClick={() => setFilter(m)}
            style={{ ...tabBtn, ...(filter === m ? tabActive : {}) }}>
            {FILTER_LABELS[m]}
          </button>
        ))}
      </div>

      <div style={readArea}>
        {items.length === 0 ? (
          <div style={empty}>—— 該当する組詩がありません</div>
        ) : (
          items.map((p, idx) => (
            <article key={p.id} style={{
              ...articleStyle,
              ...(nowPlaying === p.id ? articlePlaying : {}),
            }}>
              <header style={poemHeader}>
                <h2 style={poemTitle}>{p.title || '無題'}</h2>
                <span style={poemStatus}>{POEM_STATUS_LABELS[p.status]}</span>
              </header>
              {p.sections.map(s => (
                <section key={s.id} style={poemSection}>
                  <h3 style={sectionHeading}>{sectionLabel(s)}</h3>
                  <div style={linesView}>
                    {s.lines.map((line, i) => (
                      <div key={i} style={lineView}>{line || ' '}</div>
                    ))}
                  </div>
                </section>
              ))}
              {idx < items.length - 1 && <div style={divider} />}
            </article>
          ))
        )}
      </div>

      {/* 書き出し */}
      <div style={ctrlRow}>
        <span style={ctrlLbl}>書き出し</span>
        <button onClick={() => handleExport('text')} disabled={items.length === 0} style={exportBtn}>
          {exportType === 'text' ? 'コピー済' : 'テキスト'}
        </button>
        <button onClick={() => handleExport('markdown')} disabled={items.length === 0} style={exportBtn}>
          {exportType === 'markdown' ? 'コピー済' : 'Markdown'}
        </button>
        <button onClick={() => handleExport('json')} disabled={items.length === 0} style={exportBtn}>
          {exportType === 'json' ? 'コピー済' : 'JSON'}
        </button>
      </div>

      {/* 読み上げ — 全曲連続再生（chunk 単位 queue + 一時停止 / 再開 / 進捗） */}
      <div style={ctrlRow}>
        <span style={ctrlLbl}>読み上げ</span>
        <select value={providerId} onChange={e => setProviderId(e.target.value as TtsProviderId)} style={speakSel}>
          {(['browser', 'xai'] as TtsProviderId[]).map(id => (
            <option key={id} value={id}>{TTS_PROVIDER_LABELS[id]}</option>
          ))}
        </select>
        <button onClick={handleSpeakAll} disabled={items.length === 0}
          style={speakState === 'playing' ? speakStopBtn : speakBtn}>
          {speakState === 'playing' ? '一時停止' : speakState === 'paused' ? '再開' : '全曲再生'}
        </button>
        {speakState !== 'idle' && (
          <button onClick={handleSpeakStop} style={speakStopBtn}>停止</button>
        )}
        <select value={speakRate} onChange={e => setSpeakRate(+e.target.value)} style={speakSel}>
          <option value={0.7}>遅 0.7x</option>
          <option value={1.0}>標準 1.0x</option>
          <option value={1.3}>速 1.3x</option>
        </select>
        {voices.length > 0 && (
          <select value={voiceId} onChange={e => setVoiceId(e.target.value)} style={speakSel}>
            <option value="">声 (自動)</option>
            {voices.map(v => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        )}
        {chunkProgress && (
          <span style={progressStyle}>
            {chunkProgress.current} / {chunkProgress.total} 文
          </span>
        )}
      </div>
      {/* VOICEVOX エンドポイント設定 — 既定 http://localhost:50021、本番 HTTPS では HTTPS 化したエンドポイントが必要 */}
      {providerId === 'voicevox' && (
        <div style={ctrlRow}>
          <span style={ctrlLbl}>VOICEVOX URL</span>
          <input
            type="text"
            value={vvUrl}
            onChange={e => setVvUrl(e.target.value)}
            onBlur={() => setVoicevoxUrl(vvUrl)}
            placeholder="http://localhost:50021"
            style={vvInput}
            spellCheck={false}
          />
          <span style={vvHint}>
            voicevox_engine をローカルで起動 (port 50021) または HTTPS リバースプロキシ
          </span>
        </div>
      )}
      {speakError && <div style={errStyle}>読み上げ失敗: {speakError}</div>}
    </div>
  )
}

const wrap: React.CSSProperties = { borderTop: '1px solid var(--border)', paddingTop: 44, display: 'flex', flexDirection: 'column', gap: 14 }
const hdr: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }
const lbl: React.CSSProperties = { fontSize: 12, letterSpacing: '.4em', color: 'var(--dim)', fontFamily: 'var(--mono)' }
const stat: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.35)', fontFamily: 'var(--mono)', letterSpacing: '.2em' }
const tabs: React.CSSProperties = { display: 'flex', borderLeft: '1px solid var(--border)', flexWrap: 'wrap' }
const tabBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  background: 'transparent',
  borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 0,
  borderStyle: 'solid', borderColor: 'var(--border)',
  color: 'var(--dim)', padding: '6px 18px', cursor: 'pointer', transition: 'all .15s' }
const tabActive: React.CSSProperties = { color: 'var(--acc)', borderColor: 'rgba(126,182,232,.35)', background: 'rgba(126,182,232,.05)' }

const readArea: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12,
  background: 'rgba(0,0,0,.18)', border: '1px solid var(--border)', padding: '32px 36px',
  maxHeight: 700, overflowY: 'auto' }
const empty: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.18)', fontFamily: 'var(--mono)', letterSpacing: '.2em', padding: '12px 0' }

const articleStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 18,
  paddingBottom: 8, transition: 'background .3s' }
const articlePlaying: React.CSSProperties = { background: 'rgba(126,182,232,.06)',
  outline: '1px solid rgba(126,182,232,.3)', outlineOffset: 8 }
const poemHeader: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }
const poemTitle: React.CSSProperties = { fontSize: 20, fontWeight: 300, color: 'var(--bright)',
  letterSpacing: '.12em', fontFamily: 'var(--serif)', margin: 0 }
const poemStatus: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  color: 'rgba(126,182,232,.7)', border: '1px solid rgba(126,182,232,.3)', padding: '2px 8px' }
const poemSection: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8,
  paddingLeft: 8, borderLeft: '1px solid rgba(126,182,232,.2)' }
const sectionHeading: React.CSSProperties = { fontSize: 12, fontWeight: 400, letterSpacing: '.3em',
  color: 'var(--acc)', fontFamily: 'var(--mono)', margin: 0 }
const linesView: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const lineView: React.CSSProperties = { fontSize: 16, fontFamily: 'var(--serif)', fontWeight: 300,
  lineHeight: 1.95, letterSpacing: '.08em', color: 'var(--bright)' }
const divider: React.CSSProperties = { height: 1, background: 'rgba(255,255,255,.08)', margin: '24px 0' }

const ctrlRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }
const ctrlLbl: React.CSSProperties = { fontSize: 12, letterSpacing: '.3em', color: 'var(--dim)',
  fontFamily: 'var(--mono)', minWidth: 56 }
const exportBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.2em',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
  padding: '5px 14px', cursor: 'pointer' }
const speakSel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em',
  background: 'transparent', color: 'var(--dim)',
  border: '1px solid var(--border)', padding: '5px 8px', cursor: 'pointer', outline: 'none' }
const speakBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  color: '#0a0a0a', background: 'var(--acc)', border: 'none',
  padding: '6px 16px', cursor: 'pointer' }
const speakStopBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  color: 'var(--rej)', background: 'transparent',
  border: '1px solid rgba(220,90,90,.4)', padding: '5px 16px', cursor: 'pointer' }
const errStyle: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.1em',
  color: 'var(--rej)', padding: '4px 0' }
const progressStyle: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em',
  color: 'rgba(255,255,255,.45)', marginLeft: 4 }
const vvInput: React.CSSProperties = { flex: 1, minWidth: 220, background: 'var(--glass)',
  border: '1px solid var(--border)', color: 'var(--mid)',
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.05em',
  padding: '6px 10px', outline: 'none' }
const vvHint: React.CSSProperties = { fontSize: 12, fontFamily: 'var(--mono)',
  letterSpacing: '.1em', color: 'rgba(255,255,255,.3)' }
