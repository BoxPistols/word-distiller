export type ApiType = 'openai' | 'gemini'
export type Verdict = 'accepted' | 'rejected'

export interface CorpusItem {
  id: string
  text: string
  input: string
  verdict: Verdict
  reason: string
  tags: string[]
  created_at: string
  uid?: string         // 所有者（サーバーで付与）
  embedding?: number[] // 採用時にサーバーで生成
}

export interface GenerateRequest {
  input: string
  tempIdx: number
  apiType: ApiType
  userApiKey?: string
  accepted?: CorpusItem[]
}

export interface GenerateResponse {
  fragments: string[]
  model: string
}

export const ACCEPT_TAGS = [
  '空白', '散漫', '素材', '並置', '条件形', '体温なし', '物質化', '反復', '無目的',
] as const

export const REJECT_TAGS = [
  '意味づけ過剰', '感情説明', '比喩', '着地した', '接続詞', '形容詞過多', '既視感',
] as const

export const TEMP_LABELS = ['極めて密', 'やや密', '中', 'やや散漫', '極めて散漫'] as const

// 組詩 — 採用断片やランダム語を行として組み、清書・製本版へ昇華させる
// 歌詞構造（A メロ・サビ・ブリッジ等）を持つセクション化された詩作品
export type PoemStatus = 'draft' | 'fair_copy' | 'bound'

export const POEM_STATUS_LABELS: Record<PoemStatus, string> = {
  draft: '下書き',
  fair_copy: '清書',
  bound: '製本版',
}

export type PoemSectionKind =
  | 'intro' | 'verse_a' | 'verse_b' | 'pre_chorus'
  | 'chorus' | 'bridge' | 'outro' | 'free'

export const POEM_SECTION_KIND_LABELS: Record<PoemSectionKind, string> = {
  intro: 'イントロ',
  verse_a: 'A メロ',
  verse_b: 'B メロ',
  pre_chorus: 'プリサビ',
  chorus: 'サビ',
  bridge: 'ブリッジ',
  outro: 'アウトロ',
  free: '自由',
}

export interface PoemSection {
  id: string                  // クライアント生成 UUID（セクション内 drag&drop 用）
  kind: PoemSectionKind
  label?: string              // free のときの自由名、または kind の override
  lines: string[]
}

export interface Poem {
  id: string
  uid?: string
  title: string
  sections: PoemSection[]     // 歌詞セクション群（順序が並び）
  status: PoemStatus
  source_corpus_ids?: string[]
  random_words?: string[]
  note?: string
  created_at: string
  updated_at: string
}

// 旧形式（lines: string[]）の Poem を新形式に変換する
// 既存データのロード時に呼ぶ。保存時は新形式で上書きされるので 1 度開けば移行完了
export function migrateLegacyPoem(p: unknown): Poem {
  const obj = p as Record<string, unknown>
  if (Array.isArray(obj.sections)) return obj as unknown as Poem
  const legacyLines = Array.isArray(obj.lines) ? (obj.lines as string[]) : []
  return {
    ...(obj as object),
    sections: [{
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'migrated',
      kind: 'verse_a',
      lines: legacyLines,
    }],
  } as Poem
}
