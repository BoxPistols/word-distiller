'use client'

// 組詩 — 採用断片やランダム語を行として組み、清書・製本版へ昇華させる
// 段階: 下書き(draft) → 清書(fair_copy) → 製本版(bound、編集ロック)
// 採用コーパスから取り込み or ランダム辞書から引いて行を追加できる

import { useState } from 'react'
import { POEM_STATUS_LABELS } from '@/lib/types'
import type { Poem, PoemStatus, CorpusItem } from '@/lib/types'
import { concreteNouns } from '@/lib/random-words'

type PatchInput = Partial<Pick<Poem, 'title' | 'lines' | 'status' | 'source_corpus_ids' | 'random_words' | 'note'>>

interface Props {
  poems: Poem[]
  acceptedCorpus: CorpusItem[]
  onCreate:  () => void | Promise<void>
  onUpdate: (id: string, patch: PatchInput) => void | Promise<void>
  onRemove: (id: string) => void | Promise<void>
}

const STATUSES: PoemStatus[] = ['draft', 'fair_copy', 'bound']

function pickRandomWord(): string {
  return concreteNouns[Math.floor(Math.random() * concreteNouns.length)]
}

function formatPoemAsText(p: Poem): string {
  const head = p.title ? `【${p.title}】\n\n` : ''
  return head + p.lines.join('\n')
}

function formatPoemAsMarkdown(p: Poem): string {
  const lines: string[] = []
  if (p.title) lines.push(`# ${p.title}`, '')
  for (const l of p.lines) lines.push(l ? `> ${l}` : '>')
  lines.push('', '---', `status: ${POEM_STATUS_LABELS[p.status]}`,
    `created_at: ${p.created_at}`, `updated_at: ${p.updated_at}`)
  return lines.join('\n')
}

export default function Poems({ poems, acceptedCorpus, onCreate, onUpdate, onRemove }: Props) {
  const [tab, setTab]       = useState<PoemStatus>('draft')
  const [openId, setOpenId] = useState<string | null>(null)
  const items = poems.filter(p => p.status === tab)
  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = poems.filter(p => p.status === s).length
    return acc
  }, {} as Record<PoemStatus, number>)

  return (
    <div style={wrap}>
      <div style={hdr}>
        <span style={lbl}>組詩</span>
        <span style={stat}>
          {STATUSES.map(s => `${POEM_STATUS_LABELS[s]} ${counts[s]}`).join(' / ')}
        </span>
      </div>

      <div style={tabs}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setTab(s)}
            style={{ ...tabBtn, ...(tab === s ? tabActive : {}) }}>
            {POEM_STATUS_LABELS[s]}
          </button>
        ))}
        <button onClick={onCreate} style={createBtn}>新しく組む</button>
      </div>

      <div style={list}>
        {items.length === 0
          ? <div style={empty}>——</div>
          : items.map(p => (
            openId === p.id ? (
              <PoemEditor key={p.id} poem={p}
                acceptedCorpus={acceptedCorpus}
                onUpdate={patch => onUpdate(p.id, patch)}
                onRemove={() => { onRemove(p.id); setOpenId(null) }}
                onClose={() => setOpenId(null)} />
            ) : (
              <div key={p.id} style={row} onClick={() => setOpenId(p.id)}>
                <div style={rowBody}>
                  <div style={rowTitle}>{p.title || '無題'}</div>
                  <div style={rowMeta}>
                    {p.lines[0] || <span style={dimText}>——</span>}
                    <span style={rowCount}>{p.lines.length} 行</span>
                  </div>
                </div>
              </div>
            )
          ))
        }
      </div>
    </div>
  )
}

// 組詩エディタ
function PoemEditor({
  poem, acceptedCorpus, onUpdate, onRemove, onClose,
}: {
  poem: Poem
  acceptedCorpus: CorpusItem[]
  onUpdate: (patch: PatchInput) => void | Promise<void>
  onRemove: () => void
  onClose: () => void
}) {
  const [title, setTitle]     = useState(poem.title)
  const [status, setStatus]   = useState<PoemStatus>(poem.status)
  const [lines, setLines]     = useState<string[]>(poem.lines)
  const [note, setNote]       = useState(poem.note ?? '')
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [showCorpusPicker, setShowCorpusPicker] = useState(false)
  const [randomCount, setRandomCount] = useState(1)
  const [exportType, setExportType] = useState<'text' | 'markdown' | 'json' | null>(null)

  const locked = status === 'bound'

  const updateLine = (i: number, v: string) =>
    setLines(prev => prev.map((l, k) => k === i ? v : l))

  const removeLine = (i: number) =>
    setLines(prev => prev.filter((_, k) => k !== i))

  const moveLine = (i: number, dir: -1 | 1) => {
    setLines(prev => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const addBlankLine = () => setLines(prev => [...prev, ''])
  const addRandomLines = () => {
    const news: string[] = []
    for (let i = 0; i < randomCount; i++) news.push(pickRandomWord())
    setLines(prev => [...prev, ...news])
  }
  const addCorpusLine = (text: string) => setLines(prev => [...prev, text])

  // drag&drop
  const onDragStart = (i: number) => (e: React.DragEvent) => {
    if (locked) return
    setDragIdx(i)
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (i: number) => (e: React.DragEvent) => {
    if (locked || dragIdx === null) return
    e.preventDefault()
    setOverIdx(i)
  }
  const onDrop = (i: number) => (e: React.DragEvent) => {
    if (locked || dragIdx === null) return
    e.preventDefault()
    setLines(prev => {
      if (dragIdx === i) return prev
      const next = [...prev]
      const [moved] = next.splice(dragIdx, 1)
      next.splice(i, 0, moved)
      return next
    })
    setDragIdx(null); setOverIdx(null)
  }
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null) }

  const handleSave = async () => {
    const patch: PatchInput = {}
    if (title !== poem.title)             patch.title = title
    if (status !== poem.status)           patch.status = status
    if (note !== (poem.note ?? ''))       patch.note = note
    const linesChanged = lines.length !== poem.lines.length
      || lines.some((l, i) => l !== poem.lines[i])
    if (linesChanged) patch.lines = lines
    if (Object.keys(patch).length === 0) { onClose(); return }
    await onUpdate(patch)
    onClose()
  }

  const handleExport = (type: 'text' | 'markdown' | 'json') => {
    const tmp: Poem = { ...poem, title, lines, status, note }
    let body: string
    if (type === 'json') body = JSON.stringify(tmp, null, 2)
    else if (type === 'markdown') body = formatPoemAsMarkdown(tmp)
    else body = formatPoemAsText(tmp)
    navigator.clipboard.writeText(body).catch(() => {})
    setExportType(type)
    setTimeout(() => setExportType(null), 1500)
  }

  return (
    <div style={editWrap}>
      {/* タイトル */}
      <input value={title} onChange={e => setTitle(e.target.value)}
        placeholder="無題" disabled={locked} style={titleIn} />

      {/* ステータス */}
      <div style={editRow}>
        <span style={editLbl}>状態</span>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            style={{ ...statusBtn, ...(status === s ? statusOn : {}) }}>
            {POEM_STATUS_LABELS[s]}
          </button>
        ))}
        {locked && <span style={lockedNote}>※ 製本版は本文編集ロック中</span>}
      </div>

      {/* 行リスト */}
      <div style={linesBox}>
        {lines.length === 0 ? (
          <div style={empty}>—— 行を追加して組み始める</div>
        ) : (
          lines.map((line, i) => (
            <div key={i} style={{
              ...lineRow,
              ...(overIdx === i && dragIdx !== null ? lineRowOver : {}),
              ...(dragIdx === i ? lineRowDragging : {}),
            }}
              draggable={!locked}
              onDragStart={onDragStart(i)}
              onDragOver={onDragOver(i)}
              onDrop={onDrop(i)}
              onDragEnd={onDragEnd}>
              <span style={lineHandle} title="ドラッグで並べ替え">⋮⋮</span>
              <span style={lineNum}>{String(i + 1).padStart(2, '0')}</span>
              <input value={line}
                onChange={e => updateLine(i, e.target.value)}
                disabled={locked} style={lineIn} />
              <button onClick={() => moveLine(i, -1)} disabled={locked || i === 0} style={miniBtn} title="上へ">↑</button>
              <button onClick={() => moveLine(i, +1)} disabled={locked || i === lines.length - 1} style={miniBtn} title="下へ">↓</button>
              <button onClick={() => removeLine(i)} disabled={locked} style={miniBtnDel} title="削除">×</button>
            </div>
          ))
        )}
      </div>

      {/* 行追加導線 */}
      {!locked && (
        <div style={addRow}>
          <button onClick={addBlankLine} style={addBtn}>＋ 空行</button>
          <span style={addGroup}>
            <button onClick={addRandomLines} style={addBtn}>＋ ランダム</button>
            <select value={randomCount} onChange={e => setRandomCount(+e.target.value)} style={countSel}>
              {[1, 3, 5, 8, 12].map(n => <option key={n} value={n}>{n} 個</option>)}
            </select>
          </span>
          <button onClick={() => setShowCorpusPicker(s => !s)} style={addBtn}>
            ＋ 採用から　{showCorpusPicker ? '▲' : '▼'}
          </button>
        </div>
      )}

      {/* 採用コーパスピッカー */}
      {!locked && showCorpusPicker && (
        <div style={pickerBox}>
          {acceptedCorpus.length === 0
            ? <div style={empty}>採用断片がまだありません</div>
            : acceptedCorpus.map(c => (
              <button key={c.id} onClick={() => addCorpusLine(c.text)} style={pickerItem}>
                {c.text.length > 60 ? c.text.slice(0, 60) + '…' : c.text}
              </button>
            ))
          }
        </div>
      )}

      {/* メモ */}
      <div style={editRow}>
        <span style={editLbl}>メモ</span>
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="任意" disabled={locked} style={noteIn} />
      </div>

      {/* 書き出し */}
      <div style={exportRow}>
        <span style={editLbl}>書き出し</span>
        <button onClick={() => handleExport('text')} style={exportBtn}>
          {exportType === 'text' ? 'コピー済' : 'テキスト'}
        </button>
        <button onClick={() => handleExport('markdown')} style={exportBtn}>
          {exportType === 'markdown' ? 'コピー済' : 'Markdown'}
        </button>
        <button onClick={() => handleExport('json')} style={exportBtn}>
          {exportType === 'json' ? 'コピー済' : 'JSON'}
        </button>
      </div>

      {/* 操作 */}
      <div style={editBtnRow}>
        <button onClick={handleSave} style={saveBtn}>保存して閉じる</button>
        <button onClick={onClose} style={cancelBtn}>変更を捨てる</button>
        <button onClick={() => { if (confirm('この組詩を削除しますか？')) onRemove() }}
          style={deleteBtn}>削除</button>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = { borderTop: '1px solid var(--border)', paddingTop: 44, display: 'flex', flexDirection: 'column', gap: 14 }
const hdr: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }
const lbl: React.CSSProperties = { fontSize: 12, letterSpacing: '.4em', color: 'var(--dim)', fontFamily: 'var(--mono)' }
const stat: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.35)', fontFamily: 'var(--mono)', letterSpacing: '.2em' }
const tabs: React.CSSProperties = { display: 'flex', gap: 0, borderLeft: '1px solid var(--border)', flexWrap: 'wrap' }
const tabBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  background: 'transparent', border: '1px solid var(--border)', borderLeft: 'none',
  color: 'var(--dim)', padding: '6px 18px', cursor: 'pointer', transition: 'all .15s' }
const tabActive: React.CSSProperties = { color: 'var(--acc)', borderColor: 'rgba(200,168,122,.35)', background: 'rgba(200,168,122,.05)' }
const createBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em',
  background: 'transparent', border: '1px solid var(--border)', borderLeft: 'none',
  color: 'var(--bright)', padding: '6px 18px', cursor: 'pointer', marginLeft: 'auto' }
const list: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1 }
const row: React.CSSProperties = { background: 'var(--glass)', border: '1px solid var(--border)',
  padding: '13px 15px', display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }
const rowBody: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }
const rowTitle: React.CSSProperties = { fontSize: 14, color: 'var(--bright)', letterSpacing: '.08em' }
const rowMeta: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
  fontSize: 12, color: 'var(--dim)', letterSpacing: '.05em' }
const rowCount: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(255,255,255,.3)', letterSpacing: '.2em' }
const dimText: React.CSSProperties = { color: 'rgba(255,255,255,.18)', fontFamily: 'var(--mono)', letterSpacing: '.3em' }
const empty: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.18)', fontFamily: 'var(--mono)', letterSpacing: '.2em', padding: '12px 0' }

const editWrap: React.CSSProperties = { background: 'var(--glass)', border: '1px solid rgba(200,168,122,.35)',
  padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }
const titleIn: React.CSSProperties = { width: '100%', background: 'transparent', border: 'none',
  borderBottom: '1px solid var(--border)', color: 'var(--bright)',
  fontFamily: 'var(--serif)', fontSize: 18, padding: '8px 4px', outline: 'none', letterSpacing: '.1em' }
const editRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }
const editLbl: React.CSSProperties = { fontSize: 11, letterSpacing: '.3em', color: 'var(--dim)',
  fontFamily: 'var(--mono)', minWidth: 56 }
const statusBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.25em',
  background: 'transparent', border: '1px solid var(--border)', color: 'rgba(255,255,255,.4)',
  padding: '5px 14px', cursor: 'pointer' }
const statusOn: React.CSSProperties = { color: 'var(--acc)', borderColor: 'rgba(200,168,122,.45)', background: 'rgba(200,168,122,.06)' }
const lockedNote: React.CSSProperties = { fontSize: 11, color: 'rgba(220,180,90,.7)', fontFamily: 'var(--mono)', letterSpacing: '.15em' }
const linesBox: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4,
  border: '1px solid var(--border)', padding: '10px 8px', background: 'rgba(0,0,0,.2)' }
const lineRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px',
  background: 'transparent', transition: 'background .15s' }
const lineRowOver: React.CSSProperties = { background: 'rgba(200,168,122,.08)', outline: '1px dashed rgba(200,168,122,.4)' }
const lineRowDragging: React.CSSProperties = { opacity: 0.4 }
const lineHandle: React.CSSProperties = { color: 'rgba(255,255,255,.25)', fontFamily: 'var(--mono)',
  fontSize: 12, cursor: 'grab', userSelect: 'none', padding: '0 2px' }
const lineNum: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,.3)',
  letterSpacing: '.15em', minWidth: 22 }
const lineIn: React.CSSProperties = { flex: 1, background: 'transparent', border: 'none',
  borderBottom: '1px solid var(--border)', color: 'var(--bright)',
  fontFamily: 'var(--serif)', fontSize: 14, padding: '4px 6px', outline: 'none', letterSpacing: '.06em' }
const miniBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)',
  color: 'rgba(255,255,255,.5)', fontFamily: 'var(--mono)', fontSize: 11,
  width: 24, height: 24, cursor: 'pointer', padding: 0 }
const miniBtnDel: React.CSSProperties = { ...miniBtn, color: 'rgba(220,90,90,.6)' }
const addRow: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }
const addGroup: React.CSSProperties = { display: 'inline-flex', alignItems: 'stretch' }
const countSel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.15em',
  background: 'transparent', color: 'var(--dim)',
  border: '1px solid var(--border)', borderLeft: 'none',
  padding: '5px 8px', cursor: 'pointer', outline: 'none' }
const addBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
  padding: '5px 12px', cursor: 'pointer' }
const pickerBox: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2,
  maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', padding: '6px' }
const pickerItem: React.CSSProperties = { textAlign: 'left', background: 'transparent',
  border: '1px solid transparent', color: 'var(--mid)', fontFamily: 'var(--serif)',
  fontSize: 12, padding: '6px 8px', cursor: 'pointer', whiteSpace: 'pre-wrap', lineHeight: 1.6 }
const noteIn: React.CSSProperties = { flex: 1, minWidth: 200, background: 'transparent',
  border: '1px solid var(--border)', color: 'var(--bright)',
  fontFamily: 'var(--serif)', fontSize: 12, padding: '6px 10px', outline: 'none' }
const exportRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }
const exportBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
  padding: '5px 14px', cursor: 'pointer' }
const editBtnRow: React.CSSProperties = { display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }
const saveBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em',
  color: '#0a0a0a', background: 'var(--acc)', border: 'none', padding: '7px 20px', cursor: 'pointer' }
const cancelBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em',
  color: 'rgba(255,255,255,.4)', background: 'transparent',
  border: '1px solid var(--border)', padding: '6px 20px', cursor: 'pointer' }
const deleteBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em',
  color: 'var(--rej)', background: 'transparent',
  border: '1px solid rgba(220,90,90,.4)', padding: '6px 20px', cursor: 'pointer', marginLeft: 'auto' }
