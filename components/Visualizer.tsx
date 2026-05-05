'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Poem } from '@/lib/types'

interface Props {
  poems: Poem[]
}

interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number     // 0..1 (1 = newly born)
  hue: number
  size: number
}

const SEC_PER_LINE = 3.6
const PARTICLES_PER_FRAME = 6   // 各フレーム生成数
const MAX_PARTICLES = 600
const GHOST_ALPHA = 0.18         // 前フレーム残像の濃さ

export default function Visualizer({ poems }: Props) {
  const [poemId, setPoemId]     = useState('')
  const [sectionId, setSectionId] = useState('')
  const [playing, setPlaying]   = useState(false)
  const [activeLine, setActiveLine] = useState(-1)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef    = useRef<number | null>(null)
  const startedAtRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])

  const sortedPoems = useMemo(() => {
    const order: Record<Poem['status'], number> = { bound: 0, fair_copy: 1, draft: 2 }
    return [...poems].sort((a, b) => order[a.status] - order[b.status])
  }, [poems])

  const currentPoem = sortedPoems.find(p => p.id === poemId)
  const currentSection = currentPoem?.sections.find(s => s.id === sectionId)
  const lines = currentSection?.lines ?? []
  const totalDuration = lines.length * SEC_PER_LINE

  // 組詩切替時に先頭セクションを自動選択
  useEffect(() => {
    if (currentPoem && !currentPoem.sections.find(s => s.id === sectionId)) {
      setSectionId(currentPoem.sections[0]?.id ?? '')
      stopPlayback()
    }
  }, [poemId, currentPoem, sectionId])

  // unmount で停止
  useEffect(() => {
    return () => stopPlayback()
  }, [])

  function stopPlayback() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    setPlaying(false)
    setActiveLine(-1)
    particlesRef.current = []
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  function startPlayback() {
    if (!lines.length || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 高 DPI 対応
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width  = cssW * dpr
      canvas.height = cssH * dpr
      ctx.scale(dpr, dpr)
    }

    setPlaying(true)
    startedAtRef.current = performance.now()
    particlesRef.current = []

    const w = cssW
    const h = cssH

    const tick = (now: number) => {
      const elapsed = (now - startedAtRef.current) / 1000
      if (elapsed >= totalDuration) {
        stopPlayback()
        return
      }
      const lineIdx = Math.min(lines.length - 1, Math.floor(elapsed / SEC_PER_LINE))
      const lineProgress = (elapsed % SEC_PER_LINE) / SEC_PER_LINE  // 0..1
      setActiveLine(lineIdx)

      // 行ごとに色相シフト (全体で 240° → 30° の寒色レンジ)
      const baseHue = 200 + (lineIdx * 28) % 160 - 80  // 120..280 範囲

      // 残像 (薄く塗り重ねるとフェード効果)
      ctx.fillStyle = `rgba(10, 10, 12, ${GHOST_ALPHA})`
      ctx.fillRect(0, 0, w, h)

      // 行頭で粒子バースト (進行 0..0.15)
      const burst = lineProgress < 0.15 ? Math.floor((1 - lineProgress / 0.15) * 8) : 0
      const spawnCount = PARTICLES_PER_FRAME + burst
      for (let i = 0; i < spawnCount && particlesRef.current.length < MAX_PARTICLES; i++) {
        const x = Math.random() * w
        const y = h - 8 + Math.random() * 12
        particlesRef.current.push({
          x, y,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -(0.4 + Math.random() * 0.9),
          life: 1,
          hue: baseHue + (Math.random() - 0.5) * 30,
          size: 1 + Math.random() * 2.4,
        })
      }

      // 粒子更新 + 描画 (加算合成で霧の重なり感)
      ctx.globalCompositeOperation = 'lighter'
      const survivors: Particle[] = []
      const t = elapsed
      for (const p of particlesRef.current) {
        p.x += p.vx + Math.sin(t * 0.7 + p.y * 0.02) * 0.18
        p.y += p.vy
        p.vy *= 0.998
        p.life -= 0.0055
        if (p.life > 0 && p.y > -20) {
          const alpha = Math.max(0, p.life) * 0.55
          ctx.fillStyle = `hsla(${p.hue}, 70%, 70%, ${alpha})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          survivors.push(p)
        }
      }
      particlesRef.current = survivors
      ctx.globalCompositeOperation = 'source-over'

      // 中央に歌詞 (フェードイン → ホールド → フェードアウト)
      const fadeIn  = Math.min(1, lineProgress / 0.18)
      const fadeOut = lineProgress > 0.78 ? 1 - (lineProgress - 0.78) / 0.22 : 1
      const textAlpha = Math.max(0, Math.min(1, fadeIn * fadeOut))
      const line = lines[lineIdx] ?? ''
      ctx.font = "300 22px 'Noto Serif JP', 'Hiragino Mincho ProN', serif"
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = `rgba(232, 232, 232, ${textAlpha})`
      ctx.fillText(line, w / 2, h / 2)

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  return (
    <section style={sec}>
      <div style={lbl}>映像　——　歌詞に同期した抽象映像（朝霧モチーフ）</div>

      <div style={pickRow}>
        <select value={poemId} onChange={e => setPoemId(e.target.value)} style={selectStyle}>
          <option value="">組詩を選ぶ…</option>
          {sortedPoems.map(p => (
            <option key={p.id} value={p.id}>
              [{p.status === 'bound' ? '製' : p.status === 'fair_copy' ? '清' : '下'}] {p.title || '(無題)'}
            </option>
          ))}
        </select>
        <select
          value={sectionId}
          onChange={e => { setSectionId(e.target.value); stopPlayback() }}
          style={selectStyle}
          disabled={!currentPoem}
        >
          {currentPoem?.sections.length
            ? currentPoem.sections.map(s => (
                <option key={s.id} value={s.id}>{s.label || '(無題)'}</option>
              ))
            : <option value="">セクションなし</option>}
        </select>
      </div>

      <div style={canvasWrap}>
        <canvas ref={canvasRef} style={canvasStyle} />
        {!playing && lines.length > 0 && (
          <div style={overlayHint}>停止中　——　{lines.length} 行 / 約 {Math.round(totalDuration)} 秒</div>
        )}
      </div>

      <div style={actions}>
        <button
          onClick={() => playing ? stopPlayback() : startPlayback()}
          disabled={!lines.length}
          style={playing ? stopBtn : playBtn}
        >
          {playing ? '停止' : '再生'}
        </button>
        {playing && activeLine >= 0 && (
          <span style={progress}>
            行 {activeLine + 1} / {lines.length}
          </span>
        )}
      </div>
    </section>
  )
}

const sec: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 }
const lbl: React.CSSProperties = { fontSize: 12, letterSpacing: '.4em', color: 'var(--dim)', fontFamily: 'var(--mono)' }
const pickRow: React.CSSProperties = { display: 'flex', gap: 12, flexWrap: 'wrap' }
const selectStyle: React.CSSProperties = {
  flex: 1, minWidth: 220, background: 'var(--glass)', color: 'var(--bright)',
  border: '1px solid var(--border)', padding: '10px 12px', fontFamily: 'var(--mono)',
  fontSize: 12, letterSpacing: '.1em', outline: 'none', cursor: 'pointer',
}
const canvasWrap: React.CSSProperties = {
  position: 'relative', width: '100%', aspectRatio: '16 / 9',
  background: '#0a0a0c', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  overflow: 'hidden',
}
const canvasStyle: React.CSSProperties = { width: '100%', height: '100%', display: 'block' }
const overlayHint: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em',
  color: 'rgba(255,255,255,.35)', pointerEvents: 'none',
}
const actions: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }
const playBtn: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.4em',
  color: '#0a0a0a', background: 'var(--acc)',
  borderTopWidth: 0, borderRightWidth: 0, borderLeftWidth: 0, borderBottomWidth: 0,
  borderStyle: 'solid',
  borderTopColor: 'transparent', borderRightColor: 'transparent',
  borderLeftColor: 'transparent', borderBottomColor: 'transparent',
  padding: '11px 28px', cursor: 'pointer',
}
const stopBtn: React.CSSProperties = {
  ...playBtn, color: 'var(--bright)', background: 'transparent',
  // toggle 時の shorthand/longhand 混在警告を避けるため 4 辺すべて longhand で再指定
  borderTopWidth: 1, borderRightWidth: 1, borderLeftWidth: 1, borderBottomWidth: 1,
  borderTopColor: 'var(--acc)', borderRightColor: 'var(--acc)',
  borderLeftColor: 'var(--acc)', borderBottomColor: 'var(--acc)',
}
const progress: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.2em',
  color: 'rgba(255,255,255,.5)',
}
