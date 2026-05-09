'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Poem, ApiType } from '@/lib/types'
import type { Melody } from '@/app/api/compose/route'
import { splitMora, splitMoraLinesWithOffsets } from '@/lib/lyric-mora'
import { transposePitch } from '@/lib/pitch'

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
  const [randomLevel, setRandomLevel] = useState<number>(1)  // 0..4 ランダム度

  // 生成モード: melody (LLM の JSON メロディ) / bgm (Replicate MusicGen) / suno (Suno API 歌入り)
  const [genMode, setGenMode] = useState<'melody' | 'bgm' | 'suno'>('melody')
  const [bgmPrompt, setBgmPrompt]   = useState<string>('')
  const [bgmDuration, setBgmDuration] = useState<number>(12)
  const [bgmUrl, setBgmUrl]         = useState<string>('')
  const [replicateKey, setReplicateKey] = useState<string>('')
  // Suno BYOK + endpoint
  const [sunoKey, setSunoKey]               = useState<string>('')
  const [sunoEndpoint, setSunoEndpoint]     = useState<string>('')
  const [sunoStyle, setSunoStyle]           = useState<string>('gentle ballad, piano')
  const [sunoResult, setSunoResult]         = useState<unknown>(null)
  const [sunoExtractedUrls, setSunoExtractedUrls] = useState<string[]>([])
  // localStorage から Replicate / Suno BYOK
  useEffect(() => {
    if (typeof window === 'undefined') return
    setReplicateKey(localStorage.getItem('d_replicate_key') || '')
    setSunoKey(localStorage.getItem('d_suno_key') || '')
    setSunoEndpoint(localStorage.getItem('d_suno_endpoint') || '')
  }, [])
  const saveReplicateKey = (k: string) => {
    setReplicateKey(k)
    if (typeof window === 'undefined') return
    if (k) localStorage.setItem('d_replicate_key', k)
    else localStorage.removeItem('d_replicate_key')
  }
  const saveSunoKey = (k: string) => {
    setSunoKey(k)
    if (typeof window === 'undefined') return
    if (k) localStorage.setItem('d_suno_key', k)
    else localStorage.removeItem('d_suno_key')
  }
  const saveSunoEndpoint = (u: string) => {
    setSunoEndpoint(u)
    if (typeof window === 'undefined') return
    if (u) localStorage.setItem('d_suno_endpoint', u)
    else localStorage.removeItem('d_suno_endpoint')
  }

  const toneRef    = useRef<ToneNS | null>(null)
  const synthRef   = useRef<InstanceType<ToneNS['PolySynth']> | null>(null)   // リード旋律
  const bassRef    = useRef<InstanceType<ToneNS['Synth']> | null>(null)        // ベース（単音）
  const padRef     = useRef<InstanceType<ToneNS['PolySynth']> | null>(null)    // コード（和音）
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  // playing の最新値を ref で同期（stale closure 対策、停止ボタン即応性）
  const playingRef = useRef(false)
  useEffect(() => { playingRef.current = playing }, [playing])

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

  // メロディの自動保存・呼び出し: localStorage `d_melody_{poemId}_{sectionId}` に JSON 保存
  // セクション選択時に該当キーを読み込み、生成時に上書き保存
  const melodyStorageKey = poemId && sectionId ? `d_melody_${poemId}_${sectionId}` : ''
  useEffect(() => {
    if (typeof window === 'undefined' || !melodyStorageKey) return
    const saved = localStorage.getItem(melodyStorageKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Melody
        setMelody(parsed)
        setActiveIdx(-1)
      } catch { /* 破損時は無視 */ }
    } else {
      setMelody(null)
    }
  }, [melodyStorageKey])
  useEffect(() => {
    if (typeof window === 'undefined' || !melodyStorageKey) return
    if (melody) {
      try { localStorage.setItem(melodyStorageKey, JSON.stringify(melody)) } catch {}
    }
  }, [melody, melodyStorageKey])

  const handleClearMelody = () => {
    if (typeof window !== 'undefined' && melodyStorageKey) {
      localStorage.removeItem(melodyStorageKey)
    }
    setMelody(null)
    setActiveIdx(-1)
  }

  // unmount で synth を完全に dispose（scheduled note の停止と内部接続解放）
  // AudioContext (Tone.context) は close しない — ブラウザ singleton として再マウントで再利用
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
      synthRef.current?.releaseAll()
      synthRef.current?.dispose()
      synthRef.current = null
      bassRef.current?.dispose()
      bassRef.current = null
      padRef.current?.releaseAll()
      padRef.current?.dispose()
      padRef.current = null
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
          randomLevel,
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

  const handleGenerateBgm = async () => {
    if (!currentSection || !currentSection.lines.length || loading) return
    setLoading(true); setError(''); setBgmUrl('')
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers.Authorization = `Bearer ${authToken}`
      if (replicateKey) headers['X-Replicate-Key'] = replicateKey
      // ユーザー指定の prompt 優先、未入力なら歌詞先頭 2 行 + 旋法を自然言語化
      const fallback = currentSection.lines.slice(0, 2).join(' / ')
      const prompt = bgmPrompt.trim() || `quiet ambient piece inspired by: ${fallback}`
      const res = await fetch('/api/musicgen', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt,
          duration: bgmDuration,
          bpm:  userBpm  === 'auto' ? null : Number(userBpm),
          key:  userKey  === 'auto' ? null : userKey,
          mode: userMode === 'auto' ? null : userMode,
        }),
      })
      const data = await res.json() as { audioUrl?: string; error?: string }
      if (!res.ok || data.error) throw new Error(data.error || `${res.status}`)
      if (!data.audioUrl) throw new Error('empty audio url')
      setBgmUrl(data.audioUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }

  const handleGenerateSuno = async () => {
    if (!currentSection || !currentSection.lines.length || loading) return
    setLoading(true); setError(''); setSunoResult(null); setSunoExtractedUrls([])
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers.Authorization = `Bearer ${authToken}`
      if (sunoKey) headers['X-Suno-Key'] = sunoKey
      const lyrics = currentSection.lines.join('\n')
      const res = await fetch('/api/suno', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          lyrics,
          style: sunoStyle,
          title: currentPoem?.title || 'untitled',
          customEndpoint: sunoEndpoint || undefined,
        }),
      })
      const data = await res.json() as { result?: unknown; error?: string }
      if (!res.ok || data.error) throw new Error(data.error || `${res.status}`)
      setSunoResult(data.result)
      // よくある形式から audio URL を抽出（ベストエフォート）
      setSunoExtractedUrls(extractAudioUrls(data.result))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setLoading(false) }
  }

  const stopPlayback = () => {
    // 1) スケジュール済み setTimeout を全キャンセル → 未来の triggerAttackRelease 呼び出しが止まる
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
    // 2) 既に発音中のノートを release（synth は維持して次回再利用）
    try { synthRef.current?.releaseAll() } catch {}
    try { bassRef.current?.triggerRelease() } catch {}
    try { padRef.current?.releaseAll() } catch {}
    // 3) Tone.Draw / Transport の予約も保険でクリア
    try { toneRef.current?.Draw.cancel() } catch {}
    try { toneRef.current?.Transport.stop() } catch {}
    try { toneRef.current?.Transport.cancel() } catch {}
    // 4) ref 即時 + state 反映
    playingRef.current = false
    setPlaying(false)
    setActiveIdx(-1)
  }

  const handlePlay = async () => {
    if (!melody) return
    // ref で即時判定（state の非同期更新で止まらない問題の対策）
    if (playingRef.current) { stopPlayback(); return }
    playingRef.current = true
    setPlaying(true); setActiveIdx(-1)

    if (!toneRef.current) {
      toneRef.current = await import('tone')
    }
    const Tone = toneRef.current
    await Tone.start()  // ブラウザ autoplay policy
    if (!synthRef.current) {
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        // attack を 0.005 まで詰めて立ち上がりを瞬時に（ハイライト同期感を高める）
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.4, release: 0.4 },
      }).toDestination()
      synthRef.current.volume.value = -8
    }
    if (!bassRef.current) {
      // ベース: 低音域、丸みのある triangle、長めの release
      bassRef.current = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.5 },
      }).toDestination()
      bassRef.current.volume.value = -12
    }
    if (!padRef.current) {
      // パッド（コード）: 柔らかい sine、長い attack/release で和音を支える
      padRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.3, decay: 0.3, sustain: 0.6, release: 0.8 },
      }).toDestination()
      padRef.current.volume.value = -18
    }
    const synth = synthRef.current
    const bass  = bassRef.current
    const pad   = padRef.current

    // BPM を Tone.Transport に反映（Tone.Time の "8n" 等が melody.bpm 連動で正確に秒換算される）
    Tone.Transport.bpm.value = melody.bpm

    // ランダム度: 再生時の揺らぎ
    const jitterMs    = randomLevel * 12              // 0 / 12 / 24 / 36 / 48 ms
    const graceProb   = Math.max(0, randomLevel - 1) * 0.10
    const harmonyProb = Math.max(0, randomLevel - 2) * 0.18

    // setTimeout ベースで実時間スケジュール。triggerAttackRelease は引数なしで「今」発音
    // ハイライトは setActiveIdx を同コールバック内で更新（数十ms 差で実用上同期）
    let offsetSec = 0
    melody.notes.forEach((note, idx) => {
      const durSec = Tone.Time(note.duration).toSeconds()
      const jitter = (Math.random() - 0.5) * 2 * jitterMs
      const startMs = offsetSec * 1000 + jitter

      // 装飾音（前打音）
      if (graceProb > 0 && Math.random() < graceProb) {
        const gracePitch = transposePitch(note.pitch, Math.random() < 0.5 ? 1 : 2)
        timeoutsRef.current.push(setTimeout(() => {
          try { synth.triggerAttackRelease(gracePitch, '32n') } catch {}
        }, Math.max(0, startMs - 60)))
      }
      timeoutsRef.current.push(setTimeout(() => {
        try { synth.triggerAttackRelease(note.pitch, note.duration) } catch {}
        if (harmonyProb > 0 && Math.random() < harmonyProb) {
          const harmPitch = transposePitch(note.pitch, Math.random() < 0.5 ? 4 : 7)
          try { synth.triggerAttackRelease(harmPitch, note.duration) } catch {}
        }
        setActiveIdx(idx)
      }, startMs))
      offsetSec += durSec
    })

    // ベース
    let bassOffsetSec = 0
    if (melody.bass && melody.bass.length > 0) {
      melody.bass.forEach(b => {
        const durSec = Tone.Time(b.duration).toSeconds()
        const startMs = bassOffsetSec * 1000
        timeoutsRef.current.push(setTimeout(() => {
          try { bass.triggerAttackRelease(b.pitch, b.duration) } catch {}
        }, startMs))
        bassOffsetSec += durSec
      })
    }

    // コード（pad）
    let chordOffsetSec = 0
    if (melody.chords && melody.chords.length > 0) {
      melody.chords.forEach(c => {
        const durSec = Tone.Time(c.duration).toSeconds()
        const startMs = chordOffsetSec * 1000
        timeoutsRef.current.push(setTimeout(() => {
          try { pad.triggerAttackRelease(c.pitches, c.duration) } catch {}
        }, startMs))
        chordOffsetSec += durSec
      })
    }

    // 停止タイマー
    const totalSec = Math.max(offsetSec, bassOffsetSec, chordOffsetSec)
    timeoutsRef.current.push(setTimeout(() => {
      playingRef.current = false
      setPlaying(false)
      setActiveIdx(-1)
    }, totalSec * 1000 + 200))
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
          onChange={e => { setSectionId(e.target.value); setActiveIdx(-1) }}
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

      {/* 生成方式: メロディ (LLM) / インスト BGM (Replicate) / 歌入り (Suno) */}
      <div style={settingsRow}>
        <label style={settingLbl}>
          生成方式
          <select value={genMode} onChange={e => setGenMode(e.target.value as 'melody' | 'bgm' | 'suno')} style={settingSel}>
            <option value="melody">メロディ（LLM・歌詞同期）</option>
            <option value="bgm">インスト BGM（Replicate MusicGen）</option>
            <option value="suno">歌入り音源（Suno API）</option>
          </select>
        </label>
      </div>

      {/* Suno モードのみ: style + endpoint + Suno キー */}
      {genMode === 'suno' && (
        <div style={settingsRow}>
          <label style={{ ...settingLbl, flex: 1, minWidth: 240 }}>
            スタイル
            <input value={sunoStyle} onChange={e => setSunoStyle(e.target.value)}
              placeholder="例: sad piano ballad / J-pop, female vocal, bright"
              style={{ ...settingSel, flex: 1, fontFamily: 'var(--serif)', minWidth: 220 }} />
          </label>
          <label style={settingLbl}>
            Endpoint
            <input value={sunoEndpoint} onChange={e => saveSunoEndpoint(e.target.value)}
              placeholder="任意（既定: sunoaiapi.com）"
              style={{ ...settingSel, fontFamily: 'var(--mono)', minWidth: 200 }} />
          </label>
          <label style={settingLbl}>
            Suno Key
            <input type="password" value={sunoKey} onChange={e => saveSunoKey(e.target.value)}
              placeholder="API token（端末ローカル保存）"
              style={{ ...settingSel, fontFamily: 'var(--mono)', minWidth: 180 }} />
          </label>
        </div>
      )}

      {/* BGM モードのみ: prompt 入力 + duration + Replicate キー */}
      {genMode === 'bgm' && (
        <div style={settingsRow}>
          <label style={{ ...settingLbl, flex: 1, minWidth: 280 }}>
            雰囲気
            <input value={bgmPrompt} onChange={e => setBgmPrompt(e.target.value)}
              placeholder="例: quiet ambient piano, foggy morning（空欄なら歌詞から自動生成）"
              style={{ ...settingSel, flex: 1, fontFamily: 'var(--serif)', minWidth: 240 }} />
          </label>
          <label style={settingLbl}>
            長さ
            <select value={String(bgmDuration)} onChange={e => setBgmDuration(Number(e.target.value))} style={settingSel}>
              {[8, 12, 20, 30].map(d => <option key={d} value={d}>{d} 秒</option>)}
            </select>
          </label>
          <label style={settingLbl}>
            Replicate Key
            <input type="password" value={replicateKey} onChange={e => saveReplicateKey(e.target.value)}
              placeholder="r8_...（端末ローカル保存）"
              style={{ ...settingSel, fontFamily: 'var(--mono)', minWidth: 180 }} />
          </label>
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
        <label style={settingLbl}>
          ランダム度
          <input type="range" min={0} max={4} step={1} value={randomLevel}
            onChange={e => setRandomLevel(Number(e.target.value))}
            style={rangeSel}
            title="0 規則的 / 1 標準 / 2 揺らぎ / 3 自由 / 4 アバンギャルド" />
          <span style={rangeVal}>{['規則', '標準', '揺らぎ', '自由', '奔放'][randomLevel]}</span>
        </label>
      </div>

      {/* 操作 */}
      <div style={actions}>
        {genMode === 'melody' && (
          <>
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
          </>
        )}
        {genMode === 'bgm' && (
          <button
            onClick={handleGenerateBgm}
            disabled={!currentSection?.lines.length || loading}
            style={genBtn}
            title="Replicate MusicGen で 5〜30 秒のインスト BGM を生成（30〜60 秒待機）"
          >
            {loading ? '生成中（30〜60 秒）——' : 'インスト BGM を生成'}
          </button>
        )}
        {genMode === 'suno' && (
          <button
            onClick={handleGenerateSuno}
            disabled={!currentSection?.lines.length || loading}
            style={genBtn}
            title="Suno API で歌入り音源を生成（API のベンダーや時刻によって 30 秒〜数分）"
          >
            {loading ? '生成中——' : '歌入り音源を生成'}
          </button>
        )}
        {usedModel && !loading && genMode === 'melody' && <span style={modelNote}>— {usedModel}</span>}
        {error && <span style={errStyle}>{error}</span>}
      </div>

      {/* Suno 結果: audio URL 自動抽出 + 生 JSON */}
      {genMode === 'suno' && sunoResult !== null && (
        <div style={meloBox}>
          <div style={meloMeta}>
            <span>Suno 結果</span>
            <span>{sunoExtractedUrls.length} 件の音源 URL を検出</span>
          </div>
          {sunoExtractedUrls.length > 0 ? (
            sunoExtractedUrls.map((u, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <audio controls src={u} style={{ width: '100%' }} />
                <a href={u} target="_blank" rel="noreferrer" style={modelNote}>{u}</a>
              </div>
            ))
          ) : (
            <span style={errStyle}>音源 URL が応答から見つかりませんでした。下の生レスポンスを確認</span>
          )}
          <details>
            <summary style={modelNote}>生レスポンス（JSON）</summary>
            <pre style={{ fontSize: 12, color: 'var(--dim)', overflow: 'auto', maxHeight: 240,
              fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(sunoResult, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* BGM の音源プレーヤー */}
      {genMode === 'bgm' && bgmUrl && (
        <div style={meloBox}>
          <div style={meloMeta}>
            <span>インスト BGM</span>
            <span>{bgmDuration} 秒</span>
          </div>
          <audio controls src={bgmUrl} style={{ width: '100%' }} />
          <a href={bgmUrl} target="_blank" rel="noreferrer" style={modelNote}>音源 URL</a>
        </div>
      )}

      {/* メロディ表示 */}
      {genMode === 'melody' && melody && (
        <div style={meloBox}>
          <div style={meloMeta}>
            <span>♩ = {melody.bpm}</span>
            <span>{melody.key}</span>
            <span>リード {melody.notes.length} 音</span>
            {melody.bass && melody.bass.length > 0 && <span>ベース {melody.bass.length} 音</span>}
            {melody.chords && melody.chords.length > 0 && <span>コード {melody.chords.length} 個</span>}
            <span style={{ flex: 1 }} />
            <button onClick={handleClearMelody} style={clearBtn} title="保存済みメロディを破棄して再生成可能にする">
              クリア
            </button>
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
// Suno wrapper のレスポンスから audio_url を再帰抽出。ベンダー差を吸収するため
// audio_url / audioUrl / mp3_url 系のキーを広めに拾う
function extractAudioUrls(obj: unknown): string[] {
  const found: string[] = []
  const visit = (v: unknown) => {
    if (!v) return
    if (typeof v === 'string') {
      if (/^https?:\/\/.+\.(mp3|m4a|wav|ogg)(\?|$)/i.test(v)) found.push(v)
      return
    }
    if (Array.isArray(v)) { v.forEach(visit); return }
    if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (typeof val === 'string' && /audio.*url|mp3.*url|stream.*url|song.*url/i.test(k)) {
          if (val.startsWith('http')) found.push(val)
        } else {
          visit(val)
        }
      }
    }
  }
  visit(obj)
  return Array.from(new Set(found))
}

const settingSel: React.CSSProperties = {
  background: 'var(--glass)', color: 'var(--bright)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.1em',
  outline: 'none', cursor: 'pointer',
}
const rangeSel: React.CSSProperties = { width: 100, accentColor: 'var(--acc)' }
const rangeVal: React.CSSProperties = {
  fontFamily: 'var(--serif)', fontSize: 12, color: 'var(--bright)',
  minWidth: 48, letterSpacing: '.05em',
}
const clearBtn: React.CSSProperties = {
  fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em',
  color: 'var(--rej)', background: 'transparent',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--rej-b)',
  padding: '4px 10px', cursor: 'pointer',
}
