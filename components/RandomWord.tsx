'use client'

// ランダム生成モード: 「意味を持たせない＝詩的」を体現する流し場
// AI/サーバー/Firebase 不要。固定辞書 lib/random-words.ts から純クライアント抽出。
// 採用/却下なし — ただ流れる場（流れた語は履歴として溜まる、コピー可能）。

import { useEffect, useRef, useState } from 'react'
import { concreteNouns } from '@/lib/random-words'

const SPEED_LABELS = ['遅', '中', '速'] as const
const SPEED_INTERVALS = [2000, 800, 250] as const  // ms

const LEVEL_LABELS = ['純ランダム', 'ほぼランダム', '中庸', '連想', '詩寄り'] as const
// Lv1〜Lv4 は未実装 (抽象語/形容詞辞書の追加後に対応)。現状は Lv0 と同等動作。

const MAX_WORDS = 32   // 流す場の同時表示上限
const MAX_POOL  = 500  // 履歴の保持上限（古いものから捨てる）

function pickRandom(): string {
  return concreteNouns[Math.floor(Math.random() * concreteNouns.length)]
}

export default function RandomWord() {
  const [running, setRunning]   = useState(false)
  const [speedIdx, setSpeedIdx] = useState(1)
  const [levelIdx, setLevelIdx] = useState(0)
  const [words, setWords]       = useState<string[]>([])
  const [pool, setPool]         = useState<string[]>([])
  const [copied, setCopied]     = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!running) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      return
    }
    const interval = SPEED_INTERVALS[speedIdx]
    timerRef.current = setInterval(() => {
      const w = pickRandom()
      setWords(prev => [w, ...prev].slice(0, MAX_WORDS))
      setPool(prev => [...prev, w].slice(-MAX_POOL))
    }, interval)
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
  }, [running, speedIdx])

  const handleClear     = () => setWords([])
  const handleClearPool = () => setPool([])
  const handleCopy = async () => {
    if (!pool.length) return
    try {
      await navigator.clipboard.writeText(pool.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <section style={sec}>
      <div style={lbl}>ランダム　——　ただ流れる</div>

      {/* 流れる場 */}
      <div style={field}>
        {words.length === 0 ? (
          <div style={empty}>——</div>
        ) : (
          words.map((w, i) => (
            <span key={`${i}-${w}`} style={wordStyle(i, words.length)}>{w}</span>
          ))
        )}
      </div>

      {/* 操作: 再生 / 停止 / 流れる場のクリア */}
      <div style={btnRow}>
        <button onClick={() => setRunning(r => !r)} style={running ? stopBtn : playBtn}>
          {running ? '停止' : '再生'}
        </button>
        <button onClick={handleClear} style={clearBtn} disabled={words.length === 0}>
          流す場を消す
        </button>
      </div>

      {/* 速度 */}
      <div style={ctrlRow}>
        <span style={ctrlLbl}>速度</span>
        <input type="range" min={0} max={2} step={1} value={speedIdx}
          onChange={e => setSpeedIdx(+e.target.value)}
          style={{ flex: 1, accentColor: 'var(--acc)', cursor: 'pointer' }} />
        <span style={ctrlDesc}>{SPEED_LABELS[speedIdx]}</span>
      </div>

      {/* 無意味度 (現状 Lv0 のみ。Lv1+ は将来対応) */}
      <div style={ctrlRow}>
        <span style={ctrlLbl}>無意味度</span>
        <input type="range" min={0} max={4} step={1} value={levelIdx}
          onChange={e => setLevelIdx(+e.target.value)}
          style={{ flex: 1, accentColor: 'var(--acc)', cursor: 'pointer' }} />
        <span style={ctrlDesc}>{LEVEL_LABELS[levelIdx]}</span>
      </div>
      {levelIdx > 0 && (
        <div style={note}>※ 現状 Lv0 のみ実装。Lv1 以降は仮動作（Lv0 と同等）。</div>
      )}

      {/* 溜まった言葉 — 流れた語の履歴 */}
      <div style={poolHead}>
        <span style={lbl}>溜まった言葉</span>
        <span style={poolCount}>{pool.length}　/ {MAX_POOL}</span>
      </div>
      <div style={poolField}>
        {pool.length === 0 ? (
          <div style={empty}>——</div>
        ) : (
          pool.map((w, i) => <span key={`${i}-${w}`}>{w}</span>)
        )}
      </div>
      <div style={btnRow}>
        <button onClick={handleCopy} style={copyBtn} disabled={!pool.length}>
          {copied ? 'コピーした' : 'コピー'}
        </button>
        <button onClick={handleClearPool} style={clearBtn} disabled={!pool.length}>
          溜まりを消す
        </button>
      </div>
    </section>
  )
}

const sec: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 }
const lbl: React.CSSProperties = { fontSize: 12, letterSpacing: '.4em', color: 'var(--dim)', fontFamily: 'var(--mono)' }
const field: React.CSSProperties = {
  background: 'var(--glass)',
  border: '1px solid var(--border)',
  padding: '22px 20px',
  minHeight: 180,
  fontFamily: 'var(--serif)',
  fontWeight: 300,
  fontSize: 18,
  lineHeight: 2.1,
  letterSpacing: '.18em',
  color: 'var(--bright)',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0 22px',
  alignContent: 'flex-start',
}
const empty: React.CSSProperties = {
  color: 'rgba(255,255,255,.18)', fontFamily: 'var(--mono)', fontSize: 13, letterSpacing: '.3em',
}
// 新しい語ほど明るく、古いほど消えていく
const wordStyle = (i: number, total: number): React.CSSProperties => {
  const t = total <= 1 ? 1 : 1 - i / (total - 1)
  const opacity = 0.15 + t * 0.85
  return { opacity, transition: 'opacity .8s ease' }
}
const btnRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14 }
const ctrlRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14 }
const ctrlLbl: React.CSSProperties = {
  fontSize: 12, letterSpacing: '.3em', color: 'var(--dim)',
  fontFamily: 'var(--mono)', whiteSpace: 'nowrap', minWidth: 56,
}
const ctrlDesc: React.CSSProperties = {
  fontSize: 12, letterSpacing: '.15em', color: 'rgba(255,255,255,.4)',
  fontFamily: 'var(--mono)', minWidth: 72,
}
const playBtn: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.4em',
  color: '#0a0a0a', background: 'var(--acc)', border: 'none', padding: '11px 28px', cursor: 'pointer',
}
const stopBtn: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.4em',
  color: 'var(--bright)', background: 'transparent',
  border: '1px solid var(--border)', padding: '10px 27px', cursor: 'pointer',
}
const clearBtn: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em',
  color: 'rgba(255,255,255,.4)', background: 'transparent',
  border: '1px solid var(--border)', padding: '9px 20px', cursor: 'pointer',
}
const copyBtn: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.3em',
  color: 'var(--bright)', background: 'transparent',
  border: '1px solid var(--acc)', padding: '9px 20px', cursor: 'pointer',
}
const note: React.CSSProperties = {
  fontSize: 11, color: 'rgba(255,255,255,.3)',
  fontFamily: 'var(--mono)', letterSpacing: '.15em',
}
const poolHead: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
  marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)',
}
const poolCount: React.CSSProperties = {
  fontSize: 11, letterSpacing: '.2em', color: 'rgba(255,255,255,.3)', fontFamily: 'var(--mono)',
}
const poolField: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  padding: '14px 16px',
  minHeight: 80,
  maxHeight: 240,
  overflowY: 'auto',
  fontFamily: 'var(--serif)',
  fontWeight: 300,
  fontSize: 14,
  lineHeight: 2,
  letterSpacing: '.12em',
  color: 'rgba(255,255,255,.6)',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0 16px',
  alignContent: 'flex-start',
}
