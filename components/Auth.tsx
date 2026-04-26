'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'

export default function Auth() {
  const { user, available, signInGoogle, signInEmail, signUpEmail, signOut, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <span style={dim}>——</span>

  if (!available) {
    return <span style={dim} title="NEXT_PUBLIC_FIREBASE_* 未設定">ローカル専用</span>
  }

  if (user) {
    return (
      <div style={row}>
        <span style={mailLabel}>{user.email ?? user.uid.slice(0, 8)}</span>
        <button onClick={() => signOut()} style={linkBtn}>サインアウト</button>
      </div>
    )
  }

  const submit = async () => {
    setErr(''); setBusy(true)
    try {
      if (mode === 'signin') await signInEmail(email, pw)
      else await signUpEmail(email, pw)
      setOpen(false); setEmail(''); setPw('')
    } catch (e) {
      setErr(e instanceof Error ? e.message.replace(/^Firebase: /, '') : String(e))
    } finally { setBusy(false) }
  }

  const google = async () => {
    setErr(''); setBusy(true)
    try {
      await signInGoogle()
      setOpen(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message.replace(/^Firebase: /, '') : String(e))
    } finally { setBusy(false) }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={linkBtn}>サインイン</button>
  }

  return (
    <div style={modalWrap} onClick={() => setOpen(false)}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={modalHdr}>
          <span style={modalTitle}>{mode === 'signin' ? 'サインイン' : '新規登録'}</span>
          <button onClick={() => setOpen(false)} style={closeBtn}>×</button>
        </div>

        <button onClick={google} disabled={busy} style={googleBtn}>
          Google でサインイン
        </button>

        <div style={divider}>or</div>

        <input
          type="email" placeholder="メールアドレス"
          value={email} onChange={e => setEmail(e.target.value)}
          style={inp} autoComplete="email"
        />
        <input
          type="password" placeholder="パスワード"
          value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          style={inp} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        />

        <button onClick={submit} disabled={busy || !email || !pw} style={primaryBtn}>
          {mode === 'signin' ? 'サインイン' : '登録'}
        </button>

        <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr('') }} style={switchBtn}>
          {mode === 'signin' ? '新規登録はこちら' : 'サインインに戻る'}
        </button>

        {err && <div style={errStyle}>{err}</div>}
      </div>
    </div>
  )
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 }
const dim: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,.3)', fontFamily: 'var(--mono)', letterSpacing: '.2em' }
const mailLabel: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,.5)', fontFamily: 'var(--mono)', letterSpacing: '.1em' }
const linkBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.25em',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
  padding: '5px 14px', cursor: 'pointer' }
const modalWrap: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const modal: React.CSSProperties = { background: '#0a0a0a', border: '1px solid var(--border)',
  padding: 32, width: 'min(420px, 90vw)', display: 'flex', flexDirection: 'column', gap: 14 }
const modalHdr: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }
const modalTitle: React.CSSProperties = { fontSize: 12, letterSpacing: '.4em', color: 'var(--acc)', fontFamily: 'var(--mono)' }
const closeBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: 'rgba(255,255,255,.4)',
  cursor: 'pointer', fontSize: 18, padding: 0 }
const googleBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', color: 'var(--bright)',
  padding: '11px 18px', cursor: 'pointer' }
const divider: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.3em',
  color: 'rgba(255,255,255,.2)', textAlign: 'center', padding: '4px 0' }
const inp: React.CSSProperties = { background: 'var(--glass)', border: '1px solid var(--border)',
  color: 'var(--bright)', fontFamily: 'var(--mono)', fontSize: 13,
  padding: '10px 12px', outline: 'none', letterSpacing: '.05em' }
const primaryBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.4em',
  color: '#0a0a0a', background: 'var(--acc)', border: 'none', padding: '11px 18px', cursor: 'pointer',
  marginTop: 4 }
const switchBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.2em',
  background: 'transparent', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer',
  padding: '4px 0' }
const errStyle: React.CSSProperties = { fontSize: 11, color: 'var(--rej)', fontFamily: 'var(--mono)', letterSpacing: '.05em' }
