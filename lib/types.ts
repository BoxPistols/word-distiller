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
