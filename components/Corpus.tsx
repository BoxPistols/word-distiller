'use client'

import { useMemo, useState } from 'react'
import { ACCEPT_TAGS, REJECT_TAGS } from '@/lib/types'
import type { CorpusItem, Poem, Verdict } from '@/lib/types'
import { findDuplicateIds } from '@/lib/dedupe'

interface UpdatePatch {
  text?: string
  verdict?: Verdict
  reason?: string
  tags?: string[]
}

interface Props {
  corpus: CorpusItem[]
  poems?: Poem[]   // 「組詩で使用中」バッジ用に逆引きする
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: UpdatePatch) => void | Promise<void>
  onExport: (type: 'text' | 'json') => void
  onMergeToPoem?: (items: CorpusItem[], options: { dedupe: boolean }) => void | Promise<void>
}

export default function Corpus({ corpus, poems, onRemove, onUpdate, onExport, onMergeToPoem }: Props) {
  const [tab, setTab]                 = useState<'accepted' | 'rejected'>('accepted')
  const [editId, setEditId]           = useState<string | null>(null)
  const [mergeMode, setMergeMode]     = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dedupeOnMerge, setDedupeOnMerge] = useState(true)
  const accepted = corpus.filter(c => c.verdict === 'accepted')
  const rejected = corpus.filter(c => c.verdict === 'rejected')
  const items = tab === 'accepted' ? accepted : rejected
  // 採用 / 却下 それぞれの中で同じ text が複数あるものを重複として検出
  const dupIds = useMemo(() => findDuplicateIds(items), [items])

  // 組詩のどれかで使われている corpus.id を逆引き → 「使用中」バッジ
  const usedCorpusIds = useMemo(() => {
    const s = new Set<string>()
    for (const p of poems ?? []) {
      for (const cid of p.source_corpus_ids ?? []) s.add(cid)
    }
    return s
  }, [poems])

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  const selectAll = () => setSelectedIds(new Set(items.map(i => i.id)))
  const clearSelect = () => setSelectedIds(new Set())
  const exitMerge = () => { setMergeMode(false); clearSelect() }
  const handleMerge = async () => {
    if (!onMergeToPoem) return
    const picked = items.filter(i => selectedIds.has(i.id))
    if (picked.length === 0) return
    await onMergeToPoem(picked, { dedupe: dedupeOnMerge })
    exitMerge()
  }

  return (
    <div style={wrap}>
      <div style={hdr}>
        <span style={lbl}>コーパス</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          {onMergeToPoem && tab === 'accepted' && !mergeMode && (
            <button onClick={() => setMergeMode(true)} style={mergeBtn}>マージ</button>
          )}
          <span style={stat}>採用 {accepted.length} / 却下 {rejected.length}</span>
        </div>
      </div>

      <div style={tabs}>
        {(['accepted', 'rejected'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...tabBtn, ...(tab === t ? tabActive : {}) }}>
            {t === 'accepted' ? '採用' : '却下'}
          </button>
        ))}
      </div>

      {/* マージモード: 操作バー */}
      {mergeMode && (
        <div style={mergeBar}>
          <span style={mergeBarLbl}>{selectedIds.size} 件選択中</span>
          <button onClick={selectAll} style={mergeMiniBtn}>全選択</button>
          <button onClick={clearSelect} style={mergeMiniBtn}>選択解除</button>
          <label style={mergeOpt}>
            <input type="checkbox" checked={dedupeOnMerge}
              onChange={e => setDedupeOnMerge(e.target.checked)} />
            重複行を統合
          </label>
          <span style={{ flex: 1 }} />
          <button onClick={handleMerge} disabled={selectedIds.size === 0} style={mergeGoBtn}>
            組詩を作る
          </button>
          <button onClick={exitMerge} style={mergeCancelBtn}>閉じる</button>
        </div>
      )}

      <div style={list}>
        {items.length === 0
          ? <div style={empty}>——</div>
          : items.map(item => (
            editId === item.id ? (
              <EditRow
                key={item.id}
                item={item}
                onSave={async patch => { await onUpdate(item.id, patch); setEditId(null) }}
                onCancel={() => setEditId(null)}
              />
            ) : (
              <div key={item.id} style={{
                ...row,
                ...(item.verdict === 'rejected' ? rowRej : {}),
                ...(dupIds.has(item.id) ? rowDup : {}),
                ...(mergeMode && selectedIds.has(item.id) ? rowSelected : {}),
                ...(mergeMode ? { cursor: 'pointer' } : {}),
              }}
                onClick={mergeMode ? () => toggleSelect(item.id) : undefined}>
                {mergeMode && (
                  <input type="checkbox" checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    onClick={e => e.stopPropagation()}
                    style={mergeCheck} />
                )}
                <div style={body}>
                  <div style={txt}>{item.text}</div>
                  <div style={meta}>
                    {usedCorpusIds.has(item.id) && <span style={usedBadge}>組詩使用中</span>}
                    {dupIds.has(item.id) && <span style={dupBadge}>重複</span>}
                    {item.reason && <span style={reason}>{item.reason}</span>}
                    {item.tags?.length > 0 && (
                      <div style={tagWrap}>
                        {item.tags.map(t => <span key={t} style={tag}>{t}</span>)}
                      </div>
                    )}
                  </div>
                </div>
                {!mergeMode && (
                  <div style={actions}>
                    <button onClick={() => setEditId(item.id)} style={editBtn} title="編集">編集</button>
                    <button onClick={() => onRemove(item.id)} style={rmBtn} title="削除">×</button>
                  </div>
                )}
              </div>
            )
          ))
        }
      </div>

      <div style={botRow}>
        <button onClick={() => onExport('text')} style={tbtn} disabled={!corpus.length}>書き出す</button>
        <button onClick={() => onExport('json')} style={tbtn} disabled={!corpus.length}>JSON</button>
      </div>
    </div>
  )
}

// 編集行
function EditRow({
  item, onSave, onCancel,
}: {
  item: CorpusItem
  onSave: (patch: UpdatePatch) => void | Promise<void>
  onCancel: () => void
}) {
  const [text, setText]       = useState(item.text)
  const [verdict, setVerdict] = useState<Verdict>(item.verdict)
  const [reason, setReason]   = useState(item.reason ?? '')
  const [tags, setTags]       = useState<string[]>(item.tags ?? [])
  const [saving, setSaving]   = useState(false)

  const candidateTags = verdict === 'accepted' ? ACCEPT_TAGS : REJECT_TAGS
  const toggleTag = (t: string) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    const patch: UpdatePatch = {}
    if (text !== item.text)         patch.text = text
    if (verdict !== item.verdict)   patch.verdict = verdict
    if (reason !== (item.reason ?? '')) patch.reason = reason
    const tagsChanged = tags.length !== (item.tags?.length ?? 0)
      || tags.some((t, i) => t !== item.tags?.[i])
    if (tagsChanged) patch.tags = tags
    if (Object.keys(patch).length === 0) { onCancel(); return }
    try { await onSave(patch) } finally { setSaving(false) }
  }

  return (
    <div style={editWrap}>
      <textarea value={text} onChange={e => setText(e.target.value)} style={editTa} rows={4} />
      <div style={editRow}>
        <span style={editLbl}>判定</span>
        <button onClick={() => setVerdict('accepted')}
          style={{ ...verdictBtn, ...(verdict === 'accepted' ? verdictAcc : {}) }}>採用</button>
        <button onClick={() => setVerdict('rejected')}
          style={{ ...verdictBtn, ...(verdict === 'rejected' ? verdictRej : {}) }}>却下</button>
      </div>
      <div style={editRow}>
        <span style={editLbl}>理由</span>
        <input value={reason} onChange={e => setReason(e.target.value)}
          placeholder="任意" style={editIn} />
      </div>
      <div>
        <span style={editLbl}>タグ</span>
        <div style={chipWrap}>
          {candidateTags.map(t => (
            <button key={t} onClick={() => toggleTag(t)}
              style={{ ...chip, ...(tags.includes(t) ? chipOn : {}) }}>{t}</button>
          ))}
        </div>
      </div>
      <div style={editBtnRow}>
        <button onClick={handleSave} disabled={saving} style={saveBtn}>
          {saving ? '——' : '保存'}
        </button>
        <button onClick={onCancel} disabled={saving} style={cancelBtn}>取消</button>
      </div>
    </div>
  )
}

const wrap: React.CSSProperties = { borderTop: '1px solid var(--border)', paddingTop: 44, display: 'flex', flexDirection: 'column', gap: 14 }
const hdr: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }
const lbl: React.CSSProperties = { fontSize: 12, letterSpacing: '.4em', color: 'var(--dim)', fontFamily: 'var(--mono)' }
const stat: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.35)', fontFamily: 'var(--mono)', letterSpacing: '.2em' }
const tabs: React.CSSProperties = { display: 'flex', borderLeft: '1px solid var(--border)' }
const tabBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  background: 'transparent', border: '1px solid var(--border)', borderLeft: 'none',
  color: 'var(--dim)', padding: '6px 18px', cursor: 'pointer', transition: 'all .15s' }
const tabActive: React.CSSProperties = { color: 'var(--acc)', borderColor: 'rgba(200,168,122,.35)', background: 'rgba(200,168,122,.05)' }
const list: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1 }
const row: React.CSSProperties = { background: 'var(--glass)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  padding: '13px 15px', display: 'flex', gap: 12, alignItems: 'flex-start' }
const rowRej: React.CSSProperties = { borderColor: 'rgba(220,90,90,.15)' }
const rowDup: React.CSSProperties = { borderColor: 'rgba(220,180,90,.4)', background: 'rgba(220,180,90,.04)' }
const dupBadge: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.25em',
  color: '#0a0a0a', background: 'rgba(220,180,90,.85)',
  padding: '1px 8px', borderRadius: 0 }
const usedBadge: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.2em',
  color: 'var(--acc)', background: 'transparent',
  border: '1px solid rgba(200,168,122,.5)', padding: '0 7px' }

const mergeBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em',
  background: 'transparent', border: '1px solid var(--acc)', color: 'var(--acc)',
  padding: '4px 14px', cursor: 'pointer' }
const mergeBar: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 12px', background: 'rgba(200,168,122,.06)',
  border: '1px solid rgba(200,168,122,.35)', flexWrap: 'wrap' }
const mergeBarLbl: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.25em',
  color: 'var(--acc)' }
const mergeMiniBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.2em',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
  padding: '3px 10px', cursor: 'pointer' }
const mergeOpt: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em',
  color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }
const mergeGoBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em',
  color: '#0a0a0a', background: 'var(--acc)', border: 'none',
  padding: '6px 18px', cursor: 'pointer' }
const mergeCancelBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em',
  color: 'rgba(255,255,255,.4)', background: 'transparent',
  border: '1px solid var(--border)', padding: '5px 14px', cursor: 'pointer' }
const mergeCheck: React.CSSProperties = { width: 16, height: 16, accentColor: 'var(--acc)',
  cursor: 'pointer', flexShrink: 0, marginTop: 2 }
const rowSelected: React.CSSProperties = { borderColor: 'rgba(200,168,122,.55)',
  background: 'rgba(200,168,122,.06)' }
const body: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }
const txt: React.CSSProperties = { fontSize: 13, lineHeight: 1.9, color: 'var(--mid)', letterSpacing: '.06em', whiteSpace: 'pre-wrap' }
const meta: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }
const reason: React.CSSProperties = { fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }
const tagWrap: React.CSSProperties = { display: 'flex', gap: 3, flexWrap: 'wrap' }
const tag: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,.3)',
  border: '1px solid var(--border)', padding: '1px 6px' }
const actions: React.CSSProperties = { display: 'flex', gap: 4, flexShrink: 0, alignItems: 'flex-start' }
const editBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)',
  color: 'rgba(255,255,255,.4)', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.2em',
  padding: '3px 9px', cursor: 'pointer' }
const rmBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: 'rgba(255,255,255,.2)',
  cursor: 'pointer', fontSize: 14, padding: 2 }
const empty: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.12)', fontFamily: 'var(--mono)', letterSpacing: '.2em', padding: '18px 0' }
const botRow: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }
const tbtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  color: 'var(--dim)', background: 'transparent', border: '1px solid var(--border)',
  padding: '7px 18px', cursor: 'pointer', transition: 'all .2s' }

const editWrap: React.CSSProperties = { background: 'var(--glass)', border: '1px solid var(--acc-dim, rgba(200,168,122,.35))',
  padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }
const editTa: React.CSSProperties = { width: '100%', background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--bright)', fontFamily: 'var(--serif)', fontWeight: 300, fontSize: 14, lineHeight: 1.9,
  padding: '10px 12px', resize: 'vertical', outline: 'none', letterSpacing: '.06em' }
const editRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }
const editLbl: React.CSSProperties = { fontSize: 11, letterSpacing: '.3em', color: 'var(--dim)',
  fontFamily: 'var(--mono)', minWidth: 36 }
const editIn: React.CSSProperties = { flex: 1, minWidth: 180, background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--bright)', fontFamily: 'var(--serif)', fontSize: 12, padding: '6px 10px', outline: 'none' }
const verdictBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.25em',
  background: 'transparent', border: '1px solid var(--border)', color: 'rgba(255,255,255,.4)',
  padding: '5px 14px', cursor: 'pointer' }
const verdictAcc: React.CSSProperties = { color: 'var(--acc)', borderColor: 'rgba(200,168,122,.45)', background: 'rgba(200,168,122,.06)' }
const verdictRej: React.CSSProperties = { color: 'var(--rej)', borderColor: 'rgba(220,90,90,.45)', background: 'rgba(220,90,90,.06)' }
const chipWrap: React.CSSProperties = { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }
const chip: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.2em',
  color: 'rgba(255,255,255,.4)', background: 'transparent',
  border: '1px solid var(--border)', padding: '3px 9px', cursor: 'pointer' }
const chipOn: React.CSSProperties = { color: 'var(--acc)', borderColor: 'rgba(200,168,122,.45)', background: 'rgba(200,168,122,.06)' }
const editBtnRow: React.CSSProperties = { display: 'flex', gap: 10, marginTop: 4 }
const saveBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em',
  color: '#0a0a0a', background: 'var(--acc)', border: 'none', padding: '7px 20px', cursor: 'pointer' }
const cancelBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em',
  color: 'rgba(255,255,255,.4)', background: 'transparent',
  border: '1px solid var(--border)', padding: '6px 20px', cursor: 'pointer' }
