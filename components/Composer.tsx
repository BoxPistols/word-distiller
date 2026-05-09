'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Poem, ApiType } from '@/lib/types'
import type { Melody } from '@/app/api/compose/route'
import { splitMora, splitMoraLinesWithOffsets } from '@/lib/lyric-mora'

interface Props {
  poems: Poem[]
  apiType: ApiType
  userApiKey: string
  authToken?: string
}

// Tone.js は client only. dynamic import で SSR を避け、初回再生時に AudioContext を unlock
type ToneNS = typeof import('tone')

export default function Composer({ poems, apiType, userApiKey, authToken }: Props) {
  const [poemId, setPoemId]     = useState('')
  const [sectionId, setSectionId] = useState('')
  const [melody, setMelody]     = useState<Melody | null>(null)
  const [usedModel, setUsedModel] = useState('')
  const [loading, setLoading]   = useState(false)
  const [playing, setPlaying]   = useState(false)
  const [error, setError]       = useState('')
  const [activeIdx, setActiveIdx] = useState(-1)
  // 音楽設定（auto = AI 任せ）
  const [userBpm,  setUserBpm]  = useState<string>('auto')   // 'auto' | '60' | ...
  const [userKey,  setUserKey]  = useState<string>('auto')   // 'auto' | 'C' | 'C#' | ...
  const [userMode, setUserMode] = useState<string>('auto')   // 'auto' | 'major' | 'minor' | ...

  const toneRef    = useRef<ToneNS | null>(null)
  const synthRef   = useRef<InstanceType<ToneNS['PolySynth']> | null>(null)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // 完成度の高い組詩のみを候補に（清書/製本版優先、その他も選択可）
  const sortedPoems = useMemo(() => {
    const order: Record<Poem['status'], number> = { bound: 0, fair_copy: 1, draft: 2 }
    return [...poems].sort((a, b) => order[a.status] - order[b.status])
  }, [poems])

  const currentPoem = sortedPoems.find(p => p.id === poemId)
  const currentSection = currentPoem?.sections.find(s => s.id === sectionId)

  // 各行の開始モーラ index。activeIdx と突合して再生中文字をハイライトする
  const moraOffsets = useMemo(() => {
    if (!currentSection) return { moras: [], startIdx: [] }
    return splitMoraLinesWithOffsets(currentSection.lines)
  }, [currentSection])

  // 組詩選択時: 先頭セクションを自動選択
  useEffect(() => {
    if (currentPoem && !currentPoem.sections.find(s => s.id === sectionId)) {
      setSectionId(currentPoem.sections[0]?.id ?? '')
      setMelody(null)
      setActiveIdx(-1)
    }
  }, [poemId, currentPoem, sectionId])

  // unmount で synth を完全に dispose（scheduled note の停止と内部接続解放）
  // AudioContext (Tone.context) は close しない — ブラウザ singleton として再マウントで再利用
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
      synthRef.current?.releaseAll()
      synthRef.current?.dispose()
      synthRef.current = null
    }
  }, [])

  const handleGenerate = async () => {
    if (!currentSection || !currentSection.lines.length || loading) return
    setLoading(true); setError(''); setMelody(null); setActiveIdx(-1)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers.Authorization = `Bearer ${authToken}`
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          lines: currentSection.lines,
          apiType,
          userApiKey: userApiKey || undefined,
          bpm:  userBpm  === 'auto' ? null : Number(userBpm),
          key:  userKey  === 'auto' ? null : userKey,
          mode: userMode === 'auto' ? null : userMode,
        }),
      })
      const data = await res.json() as { melody?: Melody; model?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error || `${res.status}`)
      if (!data.melody) throw new Error('empty melody')
      setMelody(data.melody)
      setUsedModel(data.model ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }

  const stopPlayback = () => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
    synthRef.current?.releaseAll()
    setPlaying(false)
    setActiveIdx(-1)
  }

  const handlePlay = async () => {
    if (!melody) return
    if (playing) { stopPlayback(); return }
    setPlaying(true); setActiveIdx(-1)

    if (!toneRef.current) {
      toneRef.current = await import('tone')
    }
    const Tone = toneRef.current
    await Tone.start()  // ブラウザ autoplay policy
    if (!synthRef.current) {
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.4, release: 0.4 },
      }).toDestination()
      synthRef.current.volume.value = -8
    }
    const synth = synthRef.current

    // 各ノートの絶対秒オフセットを計算してスケジューリング
    let offsetSec = 0
    melody.notes.forEach((note, idx) => {
      const durSec = Tone.Time(note.duration).toSeconds()
      const startMs = offsetSec * 1000
      timeoutsRef.current.push(setTimeout(() => {
        try { synth.triggerAttackRelease(note.pitch, note.duration) } catch {}
        setActiveIdx(idx)
      }, startMs))
      offsetSec += durSec
    })
    // 最後のノート終了後に停止
    timeoutsRef.current.push(setTimeout(() => {
      setPlaying(false)
      setActiveIdx(-1)
    }, offsetSec * 1000 + 200))
  }

  return (
    <section style={sec}>
      <div style={lbl}>作曲　——　歌詞からメロディを起こして再生</div>

      {/* 組詩 + セクション選択 */}
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
          onChange={e => { setSectionId(e.target.value); setMelody(null); setActiveIdx(-1) }}
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

      {/* セクションのプレビュー — メロディ生成後はモーラ単位で再生中の文字をハイライト */}
      {currentSection && currentSection.lines.length > 0 && (
        <div style={preview}>
          {currentSection.lines.map((l, i) => {
            const startMora = moraOffsets.startIdx[i] ?? 0
            const lineMoras = splitMora(l)
            const localActive = activeIdx >= startMora && activeIdx < startMora + lineMoras.length
              ? activeIdx - startMora
              : -1
            return (
              <div key={i} style={previewLine}>
                {lineMoras.map((m, k) => (
                  <span key={k} style={k === localActive ? moraActive : moraNormal}>{m}</span>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* 音楽設定: テンポ / キー / 旋法 */}
      <div style={settingsRow}>
        <label style={settingLbl}>
          テンポ
          <select value={userBpm} onChange={e => setUserBpm(e.target.value)} style={settingSel}>
            <option value="auto">自動</option>
            <option value="60">60 BPM</option>
            <option value="80">80 BPM</option>
            <option value="100">100 BPM</option>
            <option value="120">120 BPM</option>
            <option value="140">140 BPM</option>
          </select>
        </label>
        <label style={settingLbl}>
          キー
          <select value={userKey} onChange={e => setUserKey(e.target.value)} style={settingSel}>
            <option value="auto">自動</option>
            {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label style={settingLbl}>
          旋法
          <select value={userMode} onChange={e => setUserMode(e.target.value)} style={settingSel}>
            <option value="auto">自動</option>
            <option value="major">長調</option>
            <option value="minor">短調</option>
            <option value="pentatonic">ペンタ（5 音）</option>
            <option value="in">陰旋法（日本短調系）</option>
            <option value="yo">陽旋法（日本長調系）</option>
            <option value="dorian">ドリアン</option>
          </select>
        </label>
      </div>

      {/* 操作 */}
      <div style={actions}>
        <button
          onClick={handleGenerate}
          disabled={!currentSection?.lines.length || loading}
          style={genBtn}
        >
          {loading ? '——' : 'メロディを生成'}
        </button>
        <button
          onClick={handlePlay}
          disabled={!melody}
          style={playing ? stopBtn : playBtn}
        >
          {playing ? '停止' : '再生'}
        </button>
        {usedModel && !loading && <span style={modelNote}>— {usedModel}</span>}
        {error && <span style={errStyle}>{error}</span>}
      </div>

      {/* メロディ表示 */}
      {melody && (
        <div style={meloBox}>
          <div style={meloMeta}>
            <span>♩ = {melody.bpm}</span>
            <span>{melody.key}</span>
            <span>{melody.notes.length} 音</span>
          </div>
          <div style={noteGrid}>
            {melody.notes.map((n, i) => (
              <div
                key={i}
                style={{ ...noteCell, ...(i === activeIdx ? noteCellActive : {}) }}
                title={`${n.pitch} / ${n.duration}`}
              >
                <div style={notePitch}>{n.pitch}</div>
                <div style={noteLyric}>{n.lyric ?? ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}
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
const preview: React.CSSProperties = {
  background: 'var(--glass)', border: '1px solid var(--border)',
  padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4,
  fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.9, color: 'rgba(255,255,255,.75)',
  letterSpacing: '.06em',
}
const previewLine: React.CSSProperties = {}
const actions: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }
const genBtn: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.4em',
  color: '#0a0a0a', background: 'var(--acc)',
  borderTopWidth: 0, borderRightWidth: 0, borderLeftWidth: 0, borderBottomWidth: 0,
  borderStyle: 'solid', padding: '11px 24px', cursor: 'pointer',
}
const playBtn: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.4em',
  color: 'var(--bright)', background: 'transparent',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--acc)',
  padding: '10px 24px', cursor: 'pointer',
}
const stopBtn: React.CSSProperties = { ...playBtn, color: '#0a0a0a', background: 'var(--acc)' }
const modelNote: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.3)', fontFamily: 'var(--mono)', letterSpacing: '.15em' }
const errStyle: React.CSSProperties = { fontSize: 12, color: 'var(--rej)', fontFamily: 'var(--mono)', letterSpacing: '.1em' }
const meloBox: React.CSSProperties = {
  background: 'var(--glass)', border: '1px solid var(--border)',
  padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12,
}
const meloMeta: React.CSSProperties = {
  display: 'flex', gap: 18, fontFamily: 'var(--mono)', fontSize: 12,
  letterSpacing: '.2em', color: 'rgba(255,255,255,.55)',
}
const noteGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6,
}
const noteCell: React.CSSProperties = {
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 4,
  alignItems: 'center', textAlign: 'center', transition: 'all .12s',
}
const noteCellActive: React.CSSProperties = {
  borderColor: 'var(--acc)',
  background: 'rgba(126,182,232,0.12)',
  transform: 'translateY(-1px)',
}
const notePitch: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.1em', color: 'var(--bright)',
}
const noteLyric: React.CSSProperties = {
  fontFamily: 'var(--serif)', fontSize: 12, color: 'rgba(255,255,255,.6)', minHeight: 12,
}
const moraNormal: React.CSSProperties = {
  display: 'inline-block', padding: '0 1px', transition: 'all .12s',
}
const moraActive: React.CSSProperties = {
  display: 'inline-block', padding: '0 1px',
  color: 'var(--acc)', textShadow: '0 0 12px var(--acc-dim)',
  transform: 'translateY(-1px)', transition: 'all .12s',
}
const settingsRow: React.CSSProperties = {
  display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center',
}
const settingLbl: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.2em', color: 'var(--dim)',
}
const settingSel: React.CSSProperties = {
  background: 'var(--glass)', color: 'var(--bright)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.1em',
  outline: 'none', cursor: 'pointer',
}
