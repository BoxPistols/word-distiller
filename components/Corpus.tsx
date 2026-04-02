'use client'

import { useState } from 'react'
import type { CorpusItem } from '@/lib/types'

interface Props {
  corpus: CorpusItem[]
  onRemove: (id: string) => void
  onExport: (type: 'text' | 'json') => void
}

export default function Corpus({ corpus, onRemove, onExport }: Props) {
  const [tab, setTab] = useState<'accepted' | 'rejected'>('accepted')
  const accepted = corpus.filter(c => c.verdict === 'accepted')
  const rejected = corpus.filter(c => c.verdict === 'rejected')
  const items = tab === 'accepted' ? accepted : rejected

  return (
    <div style={wrap}>
      <div style={hdr}>
        <span style={lbl}>コーパス</span>
        <span style={stat}>採用 {accepted.length} / 却下 {rejected.length}</span>
      </div>

      <div style={tabs}>
        {(['accepted', 'rejected'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...tabBtn, ...(tab === t ? tabActive : {}) }}>
            {t === 'accepted' ? '採用' : '却下'}
          </button>
        ))}
      </div>

      <div style={list}>
        {items.length === 0
          ? <div style={empty}>——</div>
          : items.map(item => (
            <div key={item.id} style={{ ...row, ...(item.verdict === 'rejected' ? rowRej : {}) }}>
              <div style={body}>
                <div style={txt}>{item.text}</div>
                <div style={meta}>
                  {item.reason && <span style={reason}>{item.reason}</span>}
                  {item.tags?.length > 0 && (
                    <div style={tagWrap}>
                      {item.tags.map(t => <span key={t} style={tag}>{t}</span>)}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => onRemove(item.id)} style={rmBtn}>×</button>
            </div>
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
const row: React.CSSProperties = { background: 'var(--glass)', border: '1px solid var(--border)',
  padding: '13px 15px', display: 'flex', gap: 12, alignItems: 'flex-start' }
const rowRej: React.CSSProperties = { borderColor: 'rgba(220,90,90,.15)' }
const body: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }
const txt: React.CSSProperties = { fontSize: 13, lineHeight: 1.9, color: 'var(--mid)', letterSpacing: '.06em', whiteSpace: 'pre-wrap' }
const meta: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }
const reason: React.CSSProperties = { fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }
const tagWrap: React.CSSProperties = { display: 'flex', gap: 3, flexWrap: 'wrap' }
const tag: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, color: 'rgba(255,255,255,.3)',
  border: '1px solid var(--border)', padding: '1px 6px' }
const rmBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: 'rgba(255,255,255,.2)',
  cursor: 'pointer', fontSize: 14, padding: 2, flexShrink: 0 }
const empty: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.12)', fontFamily: 'var(--mono)', letterSpacing: '.2em', padding: '18px 0' }
const botRow: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }
const tbtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  color: 'var(--dim)', background: 'transparent', border: '1px solid var(--border)',
  padding: '7px 18px', cursor: 'pointer', transition: 'all .2s' }
