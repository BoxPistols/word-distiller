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
  char?: string    // 文字粒子モードのみ使用
}

type VizStyle = 'mist' | 'rain' | 'snow' | 'chars'
type VizDensity = 'low' | 'normal' | 'high'
type VizSpeed = 'slow' | 'normal' | 'fast'

const STYLE_LABELS: Record<VizStyle, string> = { mist: '朝霧', rain: '雨', snow: '雪', chars: '文字' }
const DENSITY_LABELS: Record<VizDensity, string> = { low: '疎', normal: '中', high: '密' }
const SPEED_LABELS: Record<VizSpeed, string> = { slow: '遅', normal: '中', fast: '速' }

const SEC_PER_LINE_BASE = 3.6
const SPEED_MUL: Record<VizSpeed, number> = { slow: 2.0, normal: 1.0, fast: 0.55 }
const DENSITY_MUL: Record<VizDensity, number> = { low: 0.5, normal: 1.0, high: 2.0 }
const PARTICLES_PER_FRAME_BASE = 6
const MAX_PARTICLES = 800
const GHOST_ALPHA = 0.18         // 前フレーム残像の濃さ

export default function Visualizer({ poems }: Props) {
  const [poemId, setPoemId]     = useState('')
  const [sectionId, setSectionId] = useState('')
  const [playing, setPlaying]   = useState(false)
  const [activeLine, setActiveLine] = useState(-1)
  const [style, setStyle]       = useState<VizStyle>('mist')
  const [density, setDensity]   = useState<VizDensity>('normal')
  const [speed, setSpeed]       = useState<VizSpeed>('normal')

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef    = useRef<number | null>(null)
  const startedAtRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  // tick 内で stale 参照を避けるため ref に同期
  const styleRef    = useRef(style)
  const densityRef  = useRef(density)
  const speedRef    = useRef(speed)
  useEffect(() => { styleRef.current = style }, [style])
  useEffect(() => { densityRef.current = density }, [density])
  useEffect(() => { speedRef.current = speed }, [speed])

  const sortedPoems = useMemo(() => {
    const order: Record<Poem['status'], number> = { bound: 0, fair_copy: 1, draft: 2 }
    return [...poems].sort((a, b) => order[a.status] - order[b.status])
  }, [poems])

  const currentPoem = sortedPoems.find(p => p.id === poemId)
  const currentSection = currentPoem?.sections.find(s => s.id === sectionId)
  const lines = currentSection?.lines ?? []
  // 表示用: 現在の speed で割った想定時間（再生中の totalDuration は tick 内で再計算）
  const totalDuration = lines.length * SEC_PER_LINE_BASE * SPEED_MUL[speed]

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

  async function startPlayback() {
    if (!lines.length || !canvasRef.current) return
    // ボタン状態を先行で切替（フォント待ちで応答遅延しても無反応に見えないように）
    setPlaying(true)

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) { setPlaying(false); return }

    // フォント読み込み完了を待つ。Canvas fillText は読み込み前だと fallback されるため
    // document.fonts は全モダンブラウザでサポート、未対応環境ではそのまま続行
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      try { await document.fonts.ready } catch {}
    }

    // 高 DPI 対応
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width  = cssW * dpr
      canvas.height = cssH * dpr
      ctx.scale(dpr, dpr)
    }

    startedAtRef.current = performance.now()
    particlesRef.current = []

    const w = cssW
    const h = cssH

    const tick = (now: number) => {
      const elapsed = (now - startedAtRef.current) / 1000
      // 速度変更で totalDuration が伸縮するため、tick 内でも再計算（state 変更時は停止せず追随）
      const curSpeed = speedRef.current
      const curStyle = styleRef.current
      const curDensity = densityRef.current
      const sec = SEC_PER_LINE_BASE * SPEED_MUL[curSpeed]
      const total = lines.length * sec
      if (elapsed >= total) {
        stopPlayback()
        return
      }
      const lineIdx = Math.min(lines.length - 1, Math.floor(elapsed / sec))
      const lineProgress = (elapsed % sec) / sec  // 0..1
      setActiveLine(lineIdx)

      // 行ごとに色相シフト (寒色レンジ)
      const baseHue = 200 + (lineIdx * 28) % 160 - 80

      // 残像
      ctx.fillStyle = `rgba(10, 10, 12, ${GHOST_ALPHA})`
      ctx.fillRect(0, 0, w, h)

      // 行頭バースト + 通常 spawn
      const burst = lineProgress < 0.15 ? Math.floor((1 - lineProgress / 0.15) * 8) : 0
      const spawnCount = Math.round((PARTICLES_PER_FRAME_BASE + burst) * DENSITY_MUL[curDensity])
      const currentLine = lines[lineIdx] ?? ''

      for (let i = 0; i < spawnCount && particlesRef.current.length < MAX_PARTICLES; i++) {
        particlesRef.current.push(spawnParticle(curStyle, w, h, baseHue, currentLine))
      }

      // 粒子更新 + 描画
      ctx.globalCompositeOperation = curStyle === 'chars' ? 'source-over' : 'lighter'
      const survivors: Particle[] = []
      const t = elapsed
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const p of particlesRef.current) {
        updateParticle(p, curStyle, t)
        if (p.life > 0 && p.y > -30 && p.y < h + 30) {
          drawParticle(ctx, p, curStyle)
          survivors.push(p)
        }
      }
      particlesRef.current = survivors
      ctx.globalCompositeOperation = 'source-over'

      // 中央に歌詞 (chars モードでは粒子自体が文字なので非表示)
      if (curStyle !== 'chars') {
        const fadeIn  = Math.min(1, lineProgress / 0.18)
        const fadeOut = lineProgress > 0.78 ? 1 - (lineProgress - 0.78) / 0.22 : 1
        const textAlpha = Math.max(0, Math.min(1, fadeIn * fadeOut))
        ctx.font = "300 22px 'Noto Serif JP', 'Hiragino Mincho ProN', serif"
        ctx.fillStyle = `rgba(232, 232, 232, ${textAlpha})`
        ctx.fillText(currentLine, w / 2, h / 2)
      }

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

      {/* スタイル / 密度 / 速度の切替 */}
      <div style={ctrlRow}>
        <div style={ctrlGroup}>
          <span style={ctrlLbl}>スタイル</span>
          {(['mist', 'rain', 'snow', 'chars'] as VizStyle[]).map(s => (
            <button key={s} onClick={() => setStyle(s)}
              style={{ ...optBtn, ...(style === s ? optBtnOn : {}) }}>
              {STYLE_LABELS[s]}
            </button>
          ))}
        </div>
        <div style={ctrlGroup}>
          <span style={ctrlLbl}>密度</span>
          {(['low', 'normal', 'high'] as VizDensity[]).map(d => (
            <button key={d} onClick={() => setDensity(d)}
              style={{ ...optBtn, ...(density === d ? optBtnOn : {}) }}>
              {DENSITY_LABELS[d]}
            </button>
          ))}
        </div>
        <div style={ctrlGroup}>
          <span style={ctrlLbl}>速度</span>
          {(['slow', 'normal', 'fast'] as VizSpeed[]).map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              style={{ ...optBtn, ...(speed === s ? optBtnOn : {}) }}>
              {SPEED_LABELS[s]}
            </button>
          ))}
        </div>
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
const ctrlRow: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center',
}
const ctrlGroup: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 }
const ctrlLbl: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.2em',
  color: 'var(--dim)', marginRight: 4,
}
const optBtn: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em',
  color: 'var(--mid)', background: 'transparent',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  padding: '6px 12px', cursor: 'pointer', minWidth: 44,
}
const optBtnOn: React.CSSProperties = {
  color: 'var(--bright)', borderColor: 'var(--acc)',
  background: 'rgba(126,182,232,0.12)',
}

// — 粒子のスタイル別実装 —

function spawnParticle(style: VizStyle, w: number, h: number, baseHue: number, line: string): Particle {
  switch (style) {
    case 'rain': {
      // 上から細い線が斜めに降る
      return {
        x: Math.random() * (w + 80) - 40,
        y: -20,
        vx: 0.5 + Math.random() * 0.4,
        vy: 6 + Math.random() * 4,
        life: 1,
        hue: baseHue,
        size: 1 + Math.random() * 0.6,
      }
    }
    case 'snow': {
      // 上から白い粒がゆっくり
      return {
        x: Math.random() * w,
        y: -10,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.4 + Math.random() * 0.6,
        life: 1,
        hue: 210,
        size: 1.4 + Math.random() * 2.2,
      }
    }
    case 'chars': {
      // 歌詞の 1 文字を抽出して落とす
      const chars = [...line].filter(c => !/\s/.test(c))
      const ch = chars[Math.floor(Math.random() * Math.max(1, chars.length))] || '・'
      return {
        x: Math.random() * w,
        y: h + 20,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(0.6 + Math.random() * 1.0),
        life: 1,
        hue: baseHue,
        size: 14 + Math.random() * 12,
        char: ch,
      }
    }
    case 'mist':
    default: {
      // 朝霧（既存挙動）— 下から上、揺らぎ
      return {
        x: Math.random() * w,
        y: h - 8 + Math.random() * 12,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(0.4 + Math.random() * 0.9),
        life: 1,
        hue: baseHue + (Math.random() - 0.5) * 30,
        size: 1 + Math.random() * 2.4,
      }
    }
  }
}

function updateParticle(p: Particle, style: VizStyle, t: number) {
  switch (style) {
    case 'rain':
      p.x += p.vx
      p.y += p.vy
      p.life -= 0.02
      break
    case 'snow':
      p.x += p.vx + Math.sin(t * 1.2 + p.y * 0.04) * 0.4
      p.y += p.vy
      p.life -= 0.004
      break
    case 'chars':
      p.x += p.vx + Math.sin(t * 0.5 + p.y * 0.01) * 0.3
      p.y += p.vy
      p.vy *= 0.999
      p.life -= 0.0045
      break
    case 'mist':
    default:
      p.x += p.vx + Math.sin(t * 0.7 + p.y * 0.02) * 0.18
      p.y += p.vy
      p.vy *= 0.998
      p.life -= 0.0055
      break
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, style: VizStyle) {
  const alpha = Math.max(0, p.life)
  switch (style) {
    case 'rain': {
      ctx.strokeStyle = `hsla(${p.hue}, 30%, 70%, ${alpha * 0.6})`
      ctx.lineWidth = p.size
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - 4, p.y - 12)
      ctx.stroke()
      break
    }
    case 'snow': {
      ctx.fillStyle = `hsla(${p.hue}, 20%, 92%, ${alpha * 0.7})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'chars': {
      ctx.font = `${Math.round(p.size)}px 'Noto Serif JP', 'Hiragino Mincho ProN', serif`
      ctx.fillStyle = `hsla(${p.hue}, 50%, 80%, ${alpha * 0.85})`
      ctx.fillText(p.char ?? '', p.x, p.y)
      break
    }
    case 'mist':
    default: {
      ctx.fillStyle = `hsla(${p.hue}, 70%, 70%, ${alpha * 0.55})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      break
    }
  }
}
