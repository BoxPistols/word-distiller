'use client'

import { useState } from 'react'
import { ACCEPT_TAGS, REJECT_TAGS } from '@/lib/types'
import type { CorpusItem } from '@/lib/types'

interface Props {
  index: number
  text: string
  inputWord: string
  onAccept: (item: Omit<CorpusItem, 'id' | 'created_at'>) => void
  onReject: (item: Omit<CorpusItem, 'id' | 'created_at'>) => void
}

export default function FragmentCard({ index, text, inputWord, onAccept, onReject }: Props) {
  const [verdict, setVerdict] = useState<'accepted' | 'rejected' | null>(null)
  const [acceptReason, setAcceptReason] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [acceptTags, setAcceptTags] = useState<Record<string, boolean>>({})
  const [rejectTags, setRejectTags] = useState<Record<string, boolean>>({})

  const toggleTag = (tag: string, isReject: boolean) => {
    if (isReject) setRejectTags(p => ({ ...p, [tag]: !p[tag] }))
    else setAcceptTags(p => ({ ...p, [tag]: !p[tag] }))
  }

  const handleAccept = () => {
    if (verdict) return
    setVerdict('accepted')
    onAccept({ text, input: inputWord, verdict: 'accepted', reason: acceptReason,
      tags: Object.keys(acceptTags).filter(t => acceptTags[t]) })
  }
  const handleReject = () => {
    if (verdict) return
    setVerdict('rejected')
    onReject({ text, input: inputWord, verdict: 'rejected', reason: rejectReason,
      tags: Object.keys(rejectTags).filter(t => rejectTags[t]) })
  }

  return (
    <div style={{ ...card, ...(verdict === 'accepted' ? cardAcc : verdict === 'rejected' ? cardRej : {}) }}>
      <div style={idx}>0{index + 1}</div>
      <div style={fragTxt}>{text}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input value={acceptReason} onChange={e => setAcceptReason(e.target.value)}
          placeholder="採用理由（任意）" style={vin} />
        <div style={tagsRow}>
          {ACCEPT_TAGS.map(t => (
            <button key={t} onClick={() => toggleTag(t, false)}
              style={{ ...tagBtn, ...(acceptTags[t] ? tagOn : {}) }}>{t}</button>
          ))}
        </div>
        <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
          placeholder="却下理由（任意）" style={{ ...vin, marginTop: 4 }} />
        <div style={tagsRow}>
          {REJECT_TAGS.map(t => (
            <button key={t} onClick={() => toggleTag(t, true)}
              style={{ ...tagBtn, ...(rejectTags[t] ? tagRejOn : {}) }}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleAccept} disabled={!!verdict} style={abtn}>
          {verdict === 'accepted' ? '済' : '採用'}
        </button>
        <button onClick={handleReject} disabled={!!verdict} style={rbtn}>却下</button>
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--glass)', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  padding: '18px 15px', display: 'flex', flexDirection: 'column', gap: 11, transition: 'border-color .2s' }
const cardAcc: React.CSSProperties = { borderColor: 'rgba(200,168,122,.4)' }
const cardRej: React.CSSProperties = { opacity: .22, pointerEvents: 'none' }
const idx: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em', color: 'rgba(255,255,255,.3)' }
const fragTxt: React.CSSProperties = { fontSize: 14, lineHeight: 2.05, color: 'var(--bright)', letterSpacing: '.07em', whiteSpace: 'pre-wrap', flex: 1 }
const vin: React.CSSProperties = { width: '100%', background: 'transparent', border: 'none',
  borderBottom: '1px solid var(--border)', color: 'var(--mid)', fontFamily: 'var(--serif)',
  fontSize: 12, padding: '4px 2px', outline: 'none' }
const tagsRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }
const tagBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em',
  background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)', color: 'var(--dim)',
  padding: '2px 7px', cursor: 'pointer', transition: 'all .15s' }
const tagOn: React.CSSProperties = { color: 'var(--acc)', borderColor: 'rgba(200,168,122,.4)', background: 'rgba(200,168,122,.06)' }
const tagRejOn: React.CSSProperties = { color: 'var(--rej)', borderColor: 'var(--rej-b)', background: 'var(--rej-bg)' }
const abtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em',
  background: 'transparent', border: '1px solid rgba(200,168,122,.3)', color: 'var(--acc)',
  padding: '5px 12px', cursor: 'pointer' }
const rbtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
  padding: '5px 12px', cursor: 'pointer' }
