'use client'

// 組詩 — 採用断片やランダム語を行として組み、清書・製本版へ昇華させる
// 歌詞構造: イントロ / A メロ / B メロ / プリサビ / サビ / ブリッジ / アウトロ / 自由 のセクション群
// 行は各セクション内で並べ替え可能。セクション自体も上下移動可能
// 製本版は本文編集ロック（ステータス変更で解除）

import { useEffect, useMemo, useState } from 'react'
import {
  POEM_STATUS_LABELS,
  POEM_SECTION_KIND_LABELS,
} from '@/lib/types'
import type {
  Poem, PoemStatus, PoemSection, PoemSectionKind, CorpusItem,
} from '@/lib/types'
import { concreteNouns } from '@/lib/random-words'
import { findDuplicateLines, normalizeText } from '@/lib/dedupe'
import { getProvider, TTS_PROVIDER_LABELS } from '@/lib/tts'
import type { TtsProviderId, TtsVoice } from '@/lib/tts'

type PatchInput = Partial<Pick<Poem, 'title' | 'sections' | 'status' | 'source_corpus_ids' | 'random_words' | 'note'>>

interface Props {
  poems: Poem[]
  acceptedCorpus: CorpusItem[]
  authToken?: string                  // Firebase IDトークン (xAI TTS proxy で使用)
  onCreate:  () => void | Promise<void>
  onUpdate: (id: string, patch: PatchInput) => void | Promise<void>
  onRemove: (id: string) => void | Promise<void>
  onMergePoems?: (
    poems: Poem[],
    options: { dedupe: boolean; flatten?: boolean; status?: PoemStatus }
  ) => void | Promise<void>
  // 単独の下書きを清書化（sections を 1 セクションに結合 + status=fair_copy で新規作成、元 draft は保持）
  onPromoteToFairCopy?: (draft: Poem) => void | Promise<void>
  onPoetize?: (lines: string[]) => Promise<string[]>
}

const STATUSES: PoemStatus[] = ['draft', 'fair_copy', 'bound']
const SECTION_KINDS: PoemSectionKind[] =
  ['intro', 'verse_a', 'verse_b', 'pre_chorus', 'chorus', 'bridge', 'outro', 'free']

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

function pickRandomWord(): string {
  return concreteNouns[Math.floor(Math.random() * concreteNouns.length)]
}

function totalLineCount(p: Poem): number {
  return p.sections.reduce((acc, s) => acc + s.lines.length, 0)
}

function firstNonEmptyLine(p: Poem): string {
  for (const s of p.sections) for (const l of s.lines) if (l) return l
  return ''
}

function sectionLabel(s: PoemSection): string {
  return s.label || POEM_SECTION_KIND_LABELS[s.kind]
}

// リスト行で全セクションのラベルを 1 行に要約
function summarizeSections(p: Poem): string {
  if (p.sections.length === 0) return ''
  const labels = p.sections.map(sectionLabel)
  if (labels.length <= 4) return labels.join('　/　')
  return labels.slice(0, 3).join('　/　') + `　/　他 ${labels.length - 3} 部`
}

function formatPoemAsText(p: Poem): string {
  const parts: string[] = []
  if (p.title) parts.push(`【${p.title}】`, '')
  for (const s of p.sections) {
    parts.push(`【${sectionLabel(s)}】`)
    parts.push(...s.lines)
    parts.push('')
  }
  return parts.join('\n').replace(/\n+$/, '')
}

function formatPoemAsMarkdown(p: Poem): string {
  const parts: string[] = []
  if (p.title) parts.push(`# ${p.title}`, '')
  for (const s of p.sections) {
    parts.push(`## ${sectionLabel(s)}`, '')
    for (const l of s.lines) parts.push(l ? `> ${l}` : '>')
    parts.push('')
  }
  parts.push('---',
    `status: ${POEM_STATUS_LABELS[p.status]}`,
    `created_at: ${p.created_at}`,
    `updated_at: ${p.updated_at}`)
  return parts.join('\n')
}

export default function Poems({ poems, acceptedCorpus, authToken, onCreate, onUpdate, onRemove, onMergePoems, onPromoteToFairCopy, onPoetize }: Props) {
  const [tab, setTab]       = useState<PoemStatus>('draft')
  const [openId, setOpenId] = useState<string | null>(null)
  const [mergeMode, setMergeMode]     = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dedupeOnMerge, setDedupeOnMerge] = useState(true)
  const items = poems.filter(p => p.status === tab)
  // 清書タブにいる時は下書き候補も merge 操作の対象に含める。actions が見える poem を全部覆うように
  const candidates = tab === 'fair_copy' ? poems.filter(p => p.status === 'draft') : []
  const visiblePoems = candidates.length > 0 ? [...items, ...candidates] : items
  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = poems.filter(p => p.status === s).length
    return acc
  }, {} as Record<PoemStatus, number>)

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  const selectAll = () => setSelectedIds(new Set(visiblePoems.map(i => i.id)))
  const clearSelect = () => setSelectedIds(new Set())
  const exitMerge = () => { setMergeMode(false); clearSelect() }
  const handlePoemMerge = async () => {
    if (!onMergePoems) return
    const picked = visiblePoems.filter(i => selectedIds.has(i.id))
    if (picked.length < 2) return
    // 清書タブからの merge は 1 セクション結合 + 清書直行。下書き/製本版タブからは従来通り
    const isFairCopyMerge = tab === 'fair_copy'
    await onMergePoems(picked, {
      dedupe: dedupeOnMerge,
      flatten: isFairCopyMerge,
      status: isFairCopyMerge ? 'fair_copy' : 'draft',
    })
    exitMerge()
  }

  return (
    <div style={wrap}>
      <div style={hdr}>
        <span style={lbl}>組詩</span>
        <span style={stat}>
          {STATUSES.map(s => `${POEM_STATUS_LABELS[s]} ${counts[s]}`).join(' / ')}
        </span>
      </div>

      <div style={tabs}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setTab(s)}
            style={{ ...tabBtn, ...(tab === s ? tabActive : {}) }}>
            {POEM_STATUS_LABELS[s]}
          </button>
        ))}
        {onMergePoems && !mergeMode && visiblePoems.length >= 2 && (
          <button onClick={() => setMergeMode(true)} style={poemMergeBtn}>マージ</button>
        )}
        <button onClick={onCreate} style={createBtn}>新しく組む</button>
      </div>

      {/* マージモード操作バー */}
      {mergeMode && (
        <div style={poemMergeBar}>
          <span style={poemMergeBarLbl}>{selectedIds.size} 件選択中</span>
          <button onClick={selectAll} style={poemMergeMiniBtn}>全選択</button>
          <button onClick={clearSelect} style={poemMergeMiniBtn}>選択解除</button>
          <label style={poemMergeOpt}>
            <input type="checkbox" checked={dedupeOnMerge}
              onChange={e => setDedupeOnMerge(e.target.checked)} />
            重複行を統合
          </label>
          <span style={{ flex: 1 }} />
          <button onClick={handlePoemMerge} disabled={selectedIds.size < 2} style={poemMergeGoBtn}>
            組詩を作る
          </button>
          <button onClick={exitMerge} style={poemMergeCancelBtn}>閉じる</button>
        </div>
      )}

      <div style={list}>
        {items.length === 0
          ? <div style={empty}>——</div>
          : items.map(p => renderPoemEntry(p))
        }
      </div>

      {/* 清書タブにいる時、下書きを「清書化候補」として下段に表示。マージ後の自然な動線 */}
      {tab === 'fair_copy' && (() => {
        const drafts = poems.filter(p => p.status === 'draft')
        if (drafts.length === 0) return null
        return (
          <section style={promoteWrap}>
            <div style={promoteHdr}>
              <span style={promoteLbl}>下書きから清書化候補</span>
              <span style={promoteHint}>{drafts.length} 件</span>
            </div>
            <div style={list}>
              {drafts.map(p => renderPoemEntry(p, { promote: true }))}
            </div>
          </section>
        )
      })()}
    </div>
  )

  // row / editor のレンダリングを items と drafts で共有する。promote=true の時のみ「清書にする」ボタンを右端に
  function renderPoemEntry(p: Poem, options?: { promote?: boolean }) {
    if (openId === p.id) {
      return (
        <PoemEditor key={p.id} poem={p}
          acceptedCorpus={acceptedCorpus}
          authToken={authToken}
          onUpdate={patch => onUpdate(p.id, patch)}
          onRemove={() => { onRemove(p.id); setOpenId(null) }}
          onClose={() => setOpenId(null)}
          onPoetize={onPoetize} />
      )
    }
    return (
      <div key={p.id} style={{
        ...row,
        ...(mergeMode && selectedIds.has(p.id) ? rowSelected : {}),
      }}
        onClick={() => mergeMode ? toggleSelect(p.id) : setOpenId(p.id)}>
        {mergeMode && (
          <input type="checkbox" checked={selectedIds.has(p.id)}
            onChange={() => toggleSelect(p.id)}
            onClick={e => e.stopPropagation()}
            style={poemMergeCheck} />
        )}
        <div style={rowBody}>
          <div style={rowTitle}>{p.title || '無題'}</div>
          {p.sections.length > 1 && (
            <div style={rowSummary}>{summarizeSections(p)}</div>
          )}
          <div style={rowMeta}>
            {firstNonEmptyLine(p) || <span style={dimText}>——</span>}
            <span style={rowCount}>
              {p.sections.length} 部 / {totalLineCount(p)} 行
            </span>
          </div>
        </div>
        {options?.promote && (
          <button
            onClick={e => {
              e.stopPropagation()
              if (onPromoteToFairCopy) {
                onPromoteToFairCopy(p)
              } else {
                // フォールバック: section 構造維持で status だけ昇格
                onUpdate(p.id, { status: 'fair_copy' })
              }
            }}
            style={promoteBtn}
            title="sections を 1 つに結合した清書 poem を新規作成（元の下書きは残ります）"
          >
            清書にする
          </button>
        )}
      </div>
    )
  }
}

// 組詩エディタ
function PoemEditor({
  poem, acceptedCorpus, authToken, onUpdate, onRemove, onClose, onPoetize,
}: {
  poem: Poem
  acceptedCorpus: CorpusItem[]
  authToken?: string
  onUpdate: (patch: PatchInput) => void | Promise<void>
  onRemove: () => void
  onClose: () => void
  onPoetize?: (lines: string[]) => Promise<string[]>
}) {
  const [title, setTitle]       = useState(poem.title)
  const [status, setStatus]     = useState<PoemStatus>(poem.status)
  const [sections, setSections] = useState<PoemSection[]>(poem.sections)
  const [note, setNote]         = useState(poem.note ?? '')
  const [exportType, setExportType] = useState<'text' | 'markdown' | 'json' | null>(null)
  // 音声読み上げ — provider 抽象化対応
  const [providerId, setProviderId] = useState<TtsProviderId>('browser')
  const [speaking, setSpeaking]     = useState(false)
  const [speakRate, setSpeakRate]   = useState(1.0)
  const [voices, setVoices]         = useState<TtsVoice[]>([])
  const [voiceId, setVoiceId]       = useState<string>('')
  const [byokKey, setByokKey]       = useState<string>('')
  const [speakError, setSpeakError] = useState<string | null>(null)

  const provider = getProvider(providerId)
  const speechSupported = provider.isAvailable()

  // localStorage から xAI BYOK 取得
  useEffect(() => {
    if (typeof window === 'undefined') return
    setByokKey(localStorage.getItem('d_xai_key') || '')
  }, [])

  // provider 切替時に voices をリロード、現在の voiceId をリセット
  useEffect(() => {
    if (!speechSupported) { setVoices([]); return }
    let cancelled = false
    provider.getVoices().then(vs => {
      if (cancelled) return
      setVoices(vs)
      setVoiceId('')
    })
    return () => {
      cancelled = true
      provider.cancel()
      setSpeaking(false)
    }
  }, [providerId, speechSupported, provider])

  const saveByok = (k: string) => {
    setByokKey(k)
    if (typeof window === 'undefined') return
    if (k) localStorage.setItem('d_xai_key', k)
    else localStorage.removeItem('d_xai_key')
  }

  const locked = status === 'bound'

  // 全セクションの行を集計して、重複している正規化キー集合を作る
  const dupLineKeys = useMemo(() => {
    const all = sections.flatMap(s => s.lines)
    return findDuplicateLines(all)
  }, [sections])

  // セクション操作
  const updateSection = (idx: number, next: PoemSection) =>
    setSections(prev => prev.map((s, i) => i === idx ? next : s))

  const removeSection = (idx: number) =>
    setSections(prev => prev.filter((_, i) => i !== idx))

  const moveSection = (idx: number, dir: -1 | 1) => {
    setSections(prev => {
      const j = idx + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  const addSection = (kind: PoemSectionKind) => {
    setSections(prev => [...prev, {
      id: newId(),
      kind,
      lines: [],
      ...(kind === 'free' ? { label: '自由' } : {}),
    }])
  }

  // シャッフル: チューニング系の核
  // 「セクション内行」「全行（境界越え）」「セクション順」の 3 種
  const shuffleArray = <T,>(arr: T[]): T[] => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const shuffleLinesInSections = () => {
    setSections(prev => prev.map(s => ({ ...s, lines: shuffleArray(s.lines) })))
  }
  const shuffleAllLines = () => {
    setSections(prev => {
      const allLines = prev.flatMap(s => s.lines)
      const shuffled = shuffleArray(allLines)
      let idx = 0
      return prev.map(s => {
        const len = s.lines.length
        const next = shuffled.slice(idx, idx + len)
        idx += len
        return { ...s, lines: next }
      })
    })
  }
  const shuffleSectionOrder = () => {
    setSections(prev => shuffleArray(prev))
  }

  const handleSave = async () => {
    const patch: PatchInput = {}
    if (title !== poem.title)             patch.title = title
    if (status !== poem.status)           patch.status = status
    if (note !== (poem.note ?? ''))       patch.note = note
    // sections の変更検知（深い比較は重いので JSON.stringify 比較で簡略化）
    if (JSON.stringify(sections) !== JSON.stringify(poem.sections)) patch.sections = sections
    if (Object.keys(patch).length === 0) { onClose(); return }
    await onUpdate(patch)
    onClose()
  }

  const handleSpeak = async () => {
    if (speaking) {
      provider.cancel()
      setSpeaking(false)
      return
    }
    // 各セクションのラベル + 行を「、」「。」で繋いで読ませる
    const text = sections
      .filter(s => s.lines.some(l => l.trim()))
      .map(s => `${sectionLabel(s)}。${s.lines.filter(l => l.trim()).join('、')}。`)
      .join('　　')
    if (!text.trim()) return
    setSpeaking(true); setSpeakError(null)
    try {
      await provider.speak(text, {
        rate: speakRate,
        voiceId,
        authToken,
        byokKey: providerId === 'xai' ? byokKey : undefined,
        onEnd: () => setSpeaking(false),
      })
    } catch (e) {
      setSpeakError(e instanceof Error ? e.message : String(e))
      setSpeaking(false)
    }
  }

  const handleExport = (type: 'text' | 'markdown' | 'json') => {
    const tmp: Poem = { ...poem, title, sections, status, note }
    let body: string
    if (type === 'json') body = JSON.stringify(tmp, null, 2)
    else if (type === 'markdown') body = formatPoemAsMarkdown(tmp)
    else body = formatPoemAsText(tmp)
    navigator.clipboard.writeText(body).catch(() => {})
    setExportType(type)
    setTimeout(() => setExportType(null), 1500)
  }

  return (
    <div style={editWrap}>
      <input value={title} onChange={e => setTitle(e.target.value)}
        placeholder="無題" disabled={locked} style={titleIn} />

      <div style={editRow}>
        <span style={editLbl}>状態</span>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            style={{ ...statusBtn, ...(status === s ? statusOn : {}) }}>
            {POEM_STATUS_LABELS[s]}
          </button>
        ))}
        {locked && <span style={lockedNote}>※ 製本版は本文編集ロック中</span>}
      </div>

      {/* シャッフル — チューニング系 */}
      {!locked && sections.length > 0 && (
        <div style={editRow}>
          <span style={editLbl}>シャッフル</span>
          <button onClick={shuffleLinesInSections} style={shuffleBtn} title="各セクション内で行をランダム入れ替え">
            各部の行
          </button>
          <button onClick={shuffleAllLines} style={shuffleBtn} title="全行をセクション境界を跨いでシャッフル（行数は維持）">
            全行
          </button>
          <button onClick={shuffleSectionOrder} style={shuffleBtn} title="セクションの順序を入れ替え" disabled={sections.length < 2}>
            部の順
          </button>
        </div>
      )}

      {/* セクション群 */}
      <div style={sectionsWrap}>
        {sections.length === 0 ? (
          <div style={empty}>—— セクションを追加して組み始める</div>
        ) : (
          sections.map((sec, secIdx) => (
            <SectionBlock key={sec.id}
              section={sec}
              index={secIdx}
              total={sections.length}
              locked={locked}
              acceptedCorpus={acceptedCorpus}
              dupLineKeys={dupLineKeys}
              onUpdate={s => updateSection(secIdx, s)}
              onMove={dir => moveSection(secIdx, dir)}
              onRemove={() => removeSection(secIdx)}
              onPoetize={onPoetize}
            />
          ))
        )}
      </div>

      {!locked && <AddSectionRow onAdd={addSection} />}

      <div style={editRow}>
        <span style={editLbl}>メモ</span>
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="任意" disabled={locked} style={noteIn} />
      </div>

      <div style={exportRow}>
        <span style={editLbl}>書き出し</span>
        <button onClick={() => handleExport('text')} style={exportBtn}>
          {exportType === 'text' ? 'コピー済' : 'テキスト'}
        </button>
        <button onClick={() => handleExport('markdown')} style={exportBtn}>
          {exportType === 'markdown' ? 'コピー済' : 'Markdown'}
        </button>
        <button onClick={() => handleExport('json')} style={exportBtn}>
          {exportType === 'json' ? 'コピー済' : 'JSON'}
        </button>
      </div>

      {/* 音声読み上げ — Web Speech API (機械音声) と xAI Grok TTS (自然音声) を切替 */}
      <div style={exportRow}>
        <span style={editLbl}>読み上げ</span>
        <select value={providerId} onChange={e => setProviderId(e.target.value as TtsProviderId)} style={speakSel}>
          {(['browser', 'xai'] as TtsProviderId[]).map(id => (
            <option key={id} value={id}>{TTS_PROVIDER_LABELS[id]}</option>
          ))}
        </select>
        <button onClick={handleSpeak} disabled={!speechSupported}
          style={speaking ? speakStopBtn : speakBtn}>
          {speaking ? '停止' : '再生'}
        </button>
        <select value={speakRate} onChange={e => setSpeakRate(+e.target.value)} style={speakSel}>
          <option value={0.7}>遅 0.7x</option>
          <option value={1.0}>標準 1.0x</option>
          <option value={1.3}>速 1.3x</option>
        </select>
        {voices.length > 0 && (
          <select value={voiceId} onChange={e => setVoiceId(e.target.value)} style={speakSel}>
            <option value="">声 (自動)</option>
            {voices.map(v => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        )}
      </div>
      {/* xAI 選択時のみ BYOK key 入力欄 */}
      {providerId === 'xai' && (
        <div style={exportRow}>
          <span style={editLbl}></span>
          <input type="password" value={byokKey}
            onChange={e => saveByok(e.target.value)}
            placeholder="xAI API キー (任意 / 空ならサーバー設定使用)"
            style={xaiKeyIn}
            autoComplete="off" data-1p-ignore />
        </div>
      )}
      {speakError && <div style={poetizeErr}>読み上げ失敗: {speakError}</div>}

      <div style={editBtnRow}>
        <button onClick={handleSave} style={saveBtn}>保存して閉じる</button>
        <button onClick={onClose} style={cancelBtn}>変更を捨てる</button>
        <button onClick={() => { if (confirm('この組詩を削除しますか？')) onRemove() }}
          style={deleteBtn}>削除</button>
      </div>
    </div>
  )
}

// セクション 1 つ分の編集ブロック
function SectionBlock({
  section, index, total, locked, acceptedCorpus, dupLineKeys,
  onUpdate, onMove, onRemove, onPoetize,
}: {
  section: PoemSection
  index: number
  total: number
  locked: boolean
  acceptedCorpus: CorpusItem[]
  dupLineKeys: Set<string>
  onUpdate: (s: PoemSection) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onPoetize?: (lines: string[]) => Promise<string[]>
}) {
  const [showCorpusPicker, setShowCorpusPicker] = useState(false)
  const [randomCount, setRandomCount] = useState(1)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  // AI 意味付け: 生成中フラグ + 生成案 preview + エラー
  const [poetizing, setPoetizing] = useState(false)
  const [poetizedPreview, setPoetizedPreview] = useState<string[] | null>(null)
  const [poetizeError, setPoetizeError] = useState<string | null>(null)

  const updateLine = (i: number, v: string) =>
    onUpdate({ ...section, lines: section.lines.map((l, k) => k === i ? v : l) })

  const removeLine = (i: number) =>
    onUpdate({ ...section, lines: section.lines.filter((_, k) => k !== i) })

  const moveLine = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= section.lines.length) return
    const next = [...section.lines]
    ;[next[i], next[j]] = [next[j], next[i]]
    onUpdate({ ...section, lines: next })
  }

  const addBlankLine = () =>
    onUpdate({ ...section, lines: [...section.lines, ''] })

  const addRandomLines = () => {
    const news: string[] = []
    for (let i = 0; i < randomCount; i++) news.push(pickRandomWord())
    onUpdate({ ...section, lines: [...section.lines, ...news] })
  }

  const addCorpusLine = (text: string) =>
    onUpdate({ ...section, lines: [...section.lines, text] })

  const onDragStart = (i: number) => (e: React.DragEvent) => {
    if (locked) return
    setDragIdx(i)
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (i: number) => (e: React.DragEvent) => {
    if (locked || dragIdx === null) return
    e.preventDefault()
    setOverIdx(i)
  }
  const onDrop = (i: number) => (e: React.DragEvent) => {
    if (locked || dragIdx === null) return
    e.preventDefault()
    if (dragIdx === i) { setDragIdx(null); setOverIdx(null); return }
    const next = [...section.lines]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(i, 0, moved)
    onUpdate({ ...section, lines: next })
    setDragIdx(null); setOverIdx(null)
  }
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null) }

  const handlePoetize = async () => {
    if (!onPoetize) return
    const validLines = section.lines.filter(l => l.trim())
    if (!validLines.length) return
    setPoetizing(true); setPoetizeError(null)
    try {
      const result = await onPoetize(section.lines)
      if (result.length === 0) { setPoetizeError('生成結果が空でした'); return }
      setPoetizedPreview(result)
    } catch (e) {
      setPoetizeError(e instanceof Error ? e.message : String(e))
    } finally {
      setPoetizing(false)
    }
  }
  const acceptPoetized = () => {
    if (!poetizedPreview) return
    onUpdate({ ...section, lines: poetizedPreview })
    setPoetizedPreview(null)
  }
  const appendPoetized = () => {
    if (!poetizedPreview) return
    onUpdate({ ...section, lines: [...section.lines, ...poetizedPreview] })
    setPoetizedPreview(null)
  }
  const cancelPoetized = () => { setPoetizedPreview(null); setPoetizeError(null) }

  return (
    <div style={secBlock}>
      {/* セクションヘッダー: kind 選択 / 自由ラベル / 移動 / 削除 */}
      <div style={secHeader}>
        <select value={section.kind} disabled={locked}
          onChange={e => onUpdate({ ...section, kind: e.target.value as PoemSectionKind })}
          style={secKindSel}>
          {SECTION_KINDS.map(k => (
            <option key={k} value={k}>{POEM_SECTION_KIND_LABELS[k]}</option>
          ))}
        </select>
        {section.kind === 'free' && (
          <input value={section.label ?? ''} disabled={locked}
            onChange={e => onUpdate({ ...section, label: e.target.value })}
            placeholder="セクション名" style={secLabelIn} />
        )}
        <span style={secLineCount}>{section.lines.length} 行</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => onMove(-1)} disabled={locked || index === 0}
          style={miniBtn} title="セクションを上へ">↑</button>
        <button onClick={() => onMove(+1)} disabled={locked || index === total - 1}
          style={miniBtn} title="セクションを下へ">↓</button>
        <button onClick={() => { if (confirm('このセクションを削除しますか？')) onRemove() }}
          disabled={locked} style={miniBtnDel} title="セクション削除">×</button>
      </div>

      {/* 行リスト */}
      <div style={linesBox}>
        {section.lines.length === 0 ? (
          <div style={emptyDim}>—— 行を追加</div>
        ) : (
          section.lines.map((line, i) => {
            const isDup = dupLineKeys.has(normalizeText(line))
            return (
              <div key={i} style={{
                ...lineRow,
                ...(overIdx === i && dragIdx !== null ? lineRowOver : {}),
                ...(dragIdx === i ? lineRowDragging : {}),
                ...(isDup ? lineRowDup : {}),
              }}
                draggable={!locked}
                onDragStart={onDragStart(i)}
                onDragOver={onDragOver(i)}
                onDrop={onDrop(i)}
                onDragEnd={onDragEnd}>
                <span style={lineHandle} title="ドラッグで並べ替え">⋮⋮</span>
                <span style={lineNum}>{String(i + 1).padStart(2, '0')}</span>
                <input value={line}
                  onChange={e => updateLine(i, e.target.value)}
                  disabled={locked}
                  style={{ ...lineIn, ...(isDup ? lineInDup : {}) }} />
                {isDup && <span style={dupChip} title="他のセクションにも同じ行があります">重</span>}
                <button onClick={() => moveLine(i, -1)} disabled={locked || i === 0} style={miniBtn} title="上へ">↑</button>
                <button onClick={() => moveLine(i, +1)} disabled={locked || i === section.lines.length - 1} style={miniBtn} title="下へ">↓</button>
                <button onClick={() => removeLine(i)} disabled={locked} style={miniBtnDel} title="削除">×</button>
              </div>
            )
          })
        )}
      </div>

      {!locked && (
        <>
          <div style={addRow}>
            <button onClick={addBlankLine} style={addBtn}>＋ 空行</button>
            <span style={addGroup}>
              <button onClick={addRandomLines} style={addBtn}>＋ ランダム</button>
              <select value={randomCount} onChange={e => setRandomCount(+e.target.value)} style={countSel}>
                {[1, 3, 5, 8, 12].map(n => <option key={n} value={n}>{n} 個</option>)}
              </select>
            </span>
            <button onClick={() => setShowCorpusPicker(s => !s)} style={addBtn}>
              ＋ 採用から　{showCorpusPicker ? '▲' : '▼'}
            </button>
            {onPoetize && (
              <button onClick={handlePoetize} disabled={poetizing || !section.lines.some(l => l.trim())}
                style={poetizeBtn}>
                {poetizing ? '生成中…' : 'AI 意味付け'}
              </button>
            )}
          </div>
          {showCorpusPicker && (
            <div style={pickerBox}>
              {acceptedCorpus.length === 0
                ? <div style={empty}>採用断片がまだありません</div>
                : acceptedCorpus.map(c => (
                  <button key={c.id} onClick={() => addCorpusLine(c.text)} style={pickerItem}>
                    {c.text.length > 60 ? c.text.slice(0, 60) + '…' : c.text}
                  </button>
                ))
              }
            </div>
          )}
          {poetizeError && (
            <div style={poetizeErr}>意味付け失敗: {poetizeError}</div>
          )}
          {poetizedPreview && (
            <div style={poetizePreviewBox}>
              <div style={poetizePreviewLbl}>生成案</div>
              <div style={poetizePreviewLines}>
                {poetizedPreview.map((l, i) => <div key={i}>{l || '　'}</div>)}
              </div>
              <div style={addRow}>
                <button onClick={acceptPoetized} style={poetizeApplyBtn}>採用（置換）</button>
                <button onClick={appendPoetized} style={addBtn}>下に追加</button>
                <button onClick={cancelPoetized} style={addBtn}>取消</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// セクション追加ドロップダウン
function AddSectionRow({ onAdd }: { onAdd: (kind: PoemSectionKind) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={addSecWrap}>
      <button onClick={() => setOpen(o => !o)} style={addSecBtn}>
        ＋ セクション追加 {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={addSecMenu}>
          {SECTION_KINDS.map(k => (
            <button key={k} onClick={() => { onAdd(k); setOpen(false) }} style={addSecItem}>
              {POEM_SECTION_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const wrap: React.CSSProperties = { borderTop: '1px solid var(--border)', paddingTop: 44, display: 'flex', flexDirection: 'column', gap: 14 }
const hdr: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }
const lbl: React.CSSProperties = { fontSize: 12, letterSpacing: '.4em', color: 'var(--dim)', fontFamily: 'var(--mono)' }
const stat: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.35)', fontFamily: 'var(--mono)', letterSpacing: '.2em' }
const tabs: React.CSSProperties = { display: 'flex', gap: 0, borderLeft: '1px solid var(--border)', flexWrap: 'wrap' }
const tabBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  background: 'transparent',
  borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 0,
  borderStyle: 'solid', borderColor: 'var(--border)',
  color: 'var(--dim)', padding: '6px 18px', cursor: 'pointer', transition: 'all .15s' }
const tabActive: React.CSSProperties = { color: 'var(--acc)', borderColor: 'rgba(126,182,232,.35)', background: 'rgba(126,182,232,.05)' }
const createBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em',
  background: 'transparent', border: '1px solid var(--border)', borderLeft: 'none',
  color: 'var(--bright)', padding: '6px 18px', cursor: 'pointer', marginLeft: 'auto' }
const list: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1 }
const row: React.CSSProperties = { background: 'var(--glass)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
  padding: '13px 15px', display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }
const promoteWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8,
  marginTop: 24, paddingTop: 18,
  borderTopWidth: 1, borderTopStyle: 'dashed', borderTopColor: 'rgba(126,182,232,.18)' }
const promoteHdr: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 12 }
const promoteLbl: React.CSSProperties = { fontSize: 12, letterSpacing: '.3em', color: 'var(--dim)',
  fontFamily: 'var(--mono)' }
const promoteHint: React.CSSProperties = { fontSize: 12, letterSpacing: '.2em',
  color: 'rgba(255,255,255,.3)', fontFamily: 'var(--mono)' }
const promoteBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: 'rgba(126,182,232,.4)',
  color: 'var(--acc)', padding: '6px 14px', cursor: 'pointer', alignSelf: 'center', flexShrink: 0 }
const rowSelected: React.CSSProperties = { borderColor: 'rgba(126,182,232,.55)',
  background: 'rgba(126,182,232,.06)' }
const poemMergeBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em',
  background: 'transparent', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--acc)',
  borderLeft: 'none', color: 'var(--acc)',
  padding: '5px 16px', cursor: 'pointer' }
const poemMergeBar: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 12px', background: 'rgba(126,182,232,.06)',
  border: '1px solid rgba(126,182,232,.35)', flexWrap: 'wrap' }
const poemMergeBarLbl: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  color: 'var(--acc)' }
const poemMergeMiniBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.2em',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
  padding: '3px 10px', cursor: 'pointer' }
const poemMergeOpt: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em',
  color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }
const poemMergeGoBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em',
  color: '#0a0a0a', background: 'var(--acc)', border: 'none',
  padding: '6px 18px', cursor: 'pointer' }
const poemMergeCancelBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em',
  color: 'rgba(255,255,255,.4)', background: 'transparent',
  border: '1px solid var(--border)', padding: '5px 14px', cursor: 'pointer' }
const poemMergeCheck: React.CSSProperties = { width: 16, height: 16, accentColor: 'var(--acc)',
  cursor: 'pointer', flexShrink: 0, marginTop: 2 }
const rowBody: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }
const rowTitle: React.CSSProperties = { fontSize: 14, color: 'var(--bright)', letterSpacing: '.08em' }
const rowSummary: React.CSSProperties = { fontSize: 12, color: 'rgba(126,182,232,.7)',
  fontFamily: 'var(--mono)', letterSpacing: '.1em' }
const rowMeta: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
  fontSize: 12, color: 'var(--dim)', letterSpacing: '.05em' }
const rowCount: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, color: 'rgba(255,255,255,.3)', letterSpacing: '.2em' }
const dimText: React.CSSProperties = { color: 'rgba(255,255,255,.18)', fontFamily: 'var(--mono)', letterSpacing: '.3em' }
const empty: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.18)', fontFamily: 'var(--mono)', letterSpacing: '.2em', padding: '12px 0' }
const emptyDim: React.CSSProperties = { fontSize: 12, color: 'rgba(255,255,255,.15)', fontFamily: 'var(--mono)', letterSpacing: '.2em', padding: '6px 4px' }

const editWrap: React.CSSProperties = { background: 'var(--glass)', border: '1px solid rgba(126,182,232,.35)',
  padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }
const titleIn: React.CSSProperties = { width: '100%', background: 'transparent', border: 'none',
  borderBottom: '1px solid var(--border)', color: 'var(--bright)',
  fontFamily: 'var(--serif)', fontSize: 18, padding: '8px 4px', outline: 'none', letterSpacing: '.1em' }
const editRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }
const editLbl: React.CSSProperties = { fontSize: 12, letterSpacing: '.3em', color: 'var(--dim)',
  fontFamily: 'var(--mono)', minWidth: 56 }
const statusBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  background: 'transparent', border: '1px solid var(--border)', color: 'rgba(255,255,255,.4)',
  padding: '5px 14px', cursor: 'pointer' }
const statusOn: React.CSSProperties = { color: 'var(--acc)', borderColor: 'rgba(126,182,232,.45)', background: 'rgba(126,182,232,.06)' }
const lockedNote: React.CSSProperties = { fontSize: 12, color: 'rgba(140,220,200,.7)', fontFamily: 'var(--mono)', letterSpacing: '.15em' }

const sectionsWrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 }
const secBlock: React.CSSProperties = { border: '1px solid var(--border)', padding: 10,
  background: 'rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column', gap: 8 }
const secHeader: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const secKindSel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.2em',
  background: 'transparent', color: 'var(--acc)',
  border: '1px solid rgba(126,182,232,.35)', padding: '4px 8px', cursor: 'pointer', outline: 'none' }
const secLabelIn: React.CSSProperties = { background: 'transparent', color: 'var(--bright)',
  border: '1px solid var(--border)', padding: '4px 8px', fontFamily: 'var(--serif)',
  fontSize: 12, outline: 'none', minWidth: 100 }
const secLineCount: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12,
  color: 'rgba(255,255,255,.3)', letterSpacing: '.2em' }

const linesBox: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4,
  borderTop: '1px solid var(--border)', paddingTop: 6 }
const lineRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px',
  background: 'transparent', transition: 'background .15s' }
const lineRowOver: React.CSSProperties = { background: 'rgba(126,182,232,.08)', outline: '1px dashed rgba(126,182,232,.4)' }
const lineRowDragging: React.CSSProperties = { opacity: 0.4 }
const lineRowDup: React.CSSProperties = { background: 'rgba(140,220,200,.05)' }
const lineInDup: React.CSSProperties = { color: 'rgba(140,220,200,.95)' }
const dupChip: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.1em',
  color: '#0a0a0a', background: 'rgba(140,220,200,.85)',
  padding: '1px 5px', alignSelf: 'center' }
const lineHandle: React.CSSProperties = { color: 'rgba(255,255,255,.25)', fontFamily: 'var(--mono)',
  fontSize: 12, cursor: 'grab', userSelect: 'none', padding: '0 2px' }
const lineNum: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, color: 'rgba(255,255,255,.3)',
  letterSpacing: '.15em', minWidth: 22 }
const lineIn: React.CSSProperties = { flex: 1, background: 'transparent', border: 'none',
  borderBottom: '1px solid var(--border)', color: 'var(--bright)',
  fontFamily: 'var(--serif)', fontSize: 14, padding: '4px 6px', outline: 'none', letterSpacing: '.06em' }
const miniBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)',
  color: 'rgba(255,255,255,.5)', fontFamily: 'var(--mono)', fontSize: 12,
  width: 24, height: 24, cursor: 'pointer', padding: 0 }
const miniBtnDel: React.CSSProperties = { ...miniBtn, color: 'rgba(220,90,90,.6)' }
const addRow: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }
const addGroup: React.CSSProperties = { display: 'inline-flex', alignItems: 'stretch' }
const countSel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em',
  background: 'transparent', color: 'var(--dim)',
  border: '1px solid var(--border)', borderLeft: 'none',
  padding: '5px 8px', cursor: 'pointer', outline: 'none' }
const addBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.2em',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
  padding: '5px 12px', cursor: 'pointer' }
const pickerBox: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2,
  maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', padding: '6px' }
const pickerItem: React.CSSProperties = { textAlign: 'left', background: 'transparent',
  border: '1px solid transparent', color: 'var(--mid)', fontFamily: 'var(--serif)',
  fontSize: 12, padding: '6px 8px', cursor: 'pointer', whiteSpace: 'pre-wrap', lineHeight: 1.6 }

const addSecWrap: React.CSSProperties = { position: 'relative', display: 'flex', flexDirection: 'column' }
const addSecBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  background: 'transparent', border: '1px dashed var(--border)', color: 'var(--bright)',
  padding: '8px 16px', cursor: 'pointer', alignSelf: 'flex-start' }
const addSecMenu: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }
const addSecItem: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.2em',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
  padding: '5px 12px', cursor: 'pointer' }

const noteIn: React.CSSProperties = { flex: 1, minWidth: 200, background: 'transparent',
  border: '1px solid var(--border)', color: 'var(--bright)',
  fontFamily: 'var(--serif)', fontSize: 12, padding: '6px 10px', outline: 'none' }
const exportRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }
const exportBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.2em',
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
  padding: '5px 14px', cursor: 'pointer' }
const shuffleBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  background: 'transparent', border: '1px dashed rgba(126,182,232,.4)', color: 'var(--acc)',
  padding: '5px 14px', cursor: 'pointer' }
const poetizeBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  background: 'rgba(126,182,232,.08)', border: '1px solid rgba(126,182,232,.5)', color: 'var(--acc)',
  padding: '5px 14px', cursor: 'pointer' }
const poetizeErr: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.1em',
  color: 'var(--rej)', padding: '4px 0' }
const poetizePreviewBox: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8,
  border: '1px solid rgba(126,182,232,.4)', background: 'rgba(126,182,232,.05)',
  padding: '10px 12px', marginTop: 4 }
const poetizePreviewLbl: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em',
  color: 'var(--acc)' }
const poetizePreviewLines: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2,
  fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.9, color: 'var(--bright)',
  letterSpacing: '.06em', paddingLeft: 8 }
const poetizeApplyBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  color: '#0a0a0a', background: 'var(--acc)', border: 'none',
  padding: '5px 16px', cursor: 'pointer' }
const speakBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  color: '#0a0a0a', background: 'var(--acc)', border: 'none',
  padding: '6px 16px', cursor: 'pointer' }
const speakStopBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.25em',
  color: 'var(--rej)', background: 'transparent',
  border: '1px solid rgba(220,90,90,.4)', padding: '5px 16px', cursor: 'pointer' }
const speakSel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.15em',
  background: 'transparent', color: 'var(--dim)',
  border: '1px solid var(--border)', padding: '5px 8px', cursor: 'pointer', outline: 'none' }
const xaiKeyIn: React.CSSProperties = { flex: 1, minWidth: 240, background: 'var(--glass)',
  border: '1px solid var(--border)', color: 'var(--mid)', fontFamily: 'var(--mono)',
  fontSize: 12, padding: '5px 10px', outline: 'none' }
const editBtnRow: React.CSSProperties = { display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }
const saveBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em',
  color: '#0a0a0a', background: 'var(--acc)', border: 'none', padding: '7px 20px', cursor: 'pointer' }
const cancelBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em',
  color: 'rgba(255,255,255,.4)', background: 'transparent',
  border: '1px solid var(--border)', padding: '6px 20px', cursor: 'pointer' }
const deleteBtn: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 12, letterSpacing: '.3em',
  color: 'var(--rej)', background: 'transparent',
  border: '1px solid rgba(220,90,90,.4)', padding: '6px 20px', cursor: 'pointer', marginLeft: 'auto' }
