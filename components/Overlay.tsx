'use client'

import { useState } from 'react'

interface Props {
  label: string
  text: string
  onClose: () => void
}

export default function Overlay({ label, text, onClose }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.querySelector<HTMLTextAreaElement>('[data-overlay-ta]')
      ta?.select()
      document.execCommand('copy')
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleDownload = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `corpus_${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={hdr}>
          <span style={lbl}>{label}</span>
          <button style={closeBtn} onClick={onClose}>閉じる</button>
        </div>
        <textarea data-overlay-ta readOnly value={text} style={ta} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={cpBtn} onClick={handleCopy}>{copied ? '済' : 'コピー'}</button>
          <button style={dlBtn} onClick={handleDownload}>ダウンロード</button>
        </div>
      </div>
    </div>
  )
}

const backdrop: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 100,
  background: 'rgba(0,0,0,.92)', display: 'flex', alignItems: 'center',
  justifyContent: 'center', padding: 24 }
const box: React.CSSProperties = { background: '#0c0c0c', border: '1px solid var(--border)',
  width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 12, padding: 24 }
const hdr: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }
const lbl: React.CSSProperties = { fontSize: 12, letterSpacing: '.4em', color: 'var(--dim)', fontFamily: 'var(--mono)' }
const closeBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.2em',
  color: 'var(--dim)', background: 'transparent', border: 'none', cursor: 'pointer' }
const ta: React.CSSProperties = { width: '100%', height: 360, background: 'var(--glass)',
  border: '1px solid var(--border)', color: 'var(--mid)', fontFamily: 'var(--mono)',
  fontSize: 12, lineHeight: 1.8, padding: '12px 14px', resize: 'none', outline: 'none' }
const cpBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em',
  color: '#0a0a0a', background: 'var(--acc)', border: 'none', padding: '9px 22px', cursor: 'pointer' }
const dlBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  color: 'var(--dim)', background: 'transparent', border: '1px solid var(--border)',
  padding: '9px 22px', cursor: 'pointer' }
