// テキスト重複検知のユーティリティ
// 用途: コーパス採用断片の重複警告 / 組詩内の行重複ハイライト

export function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

// 複数の text 持ちアイテムから、同一 text のグループを返す（空文字列は除く）
export function groupByText<T extends { id: string; text: string }>(
  items: T[],
): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const it of items) {
    const key = normalizeText(it.text)
    if (!key) continue
    const arr = m.get(key)
    if (arr) arr.push(it)
    else m.set(key, [it])
  }
  return m
}

// 重複しているアイテムの ID 集合
export function findDuplicateIds<T extends { id: string; text: string }>(items: T[]): Set<string> {
  const groups = groupByText(items)
  const dup = new Set<string>()
  for (const arr of groups.values()) {
    if (arr.length > 1) for (const it of arr) dup.add(it.id)
  }
  return dup
}

// 文字列配列から、2 回以上現れる正規化キーの集合
export function findDuplicateLines(lines: string[]): Set<string> {
  const count = new Map<string, number>()
  for (const l of lines) {
    const key = normalizeText(l)
    if (!key) continue
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  const dup = new Set<string>()
  for (const [k, c] of count) if (c > 1) dup.add(k)
  return dup
}
