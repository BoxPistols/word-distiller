// Firestore onSnapshot による uid scope のリアルタイム同期ヘルパー。
// 書き込みは既存の API ルート (Admin SDK) 経由のまま。読み取りだけクライアント listen に置換。
//
// LWW (Last Write Wins) は updated_at の文字列比較で実現。Firestore は doc 更新の度に
// listener が発火するので、別端末で書き込まれた値は数百ms 以内に各端末へ伝播する。

import {
  collection, query, where, onSnapshot, type Unsubscribe,
} from 'firebase/firestore'
import { getClientDb } from './firebase-client'
import { migrateLegacyPoem } from './types'
import type { CorpusItem, Poem } from './types'

type SyncCallback<T> = (items: T[]) => void
type SyncErrorCallback = (err: unknown) => void

interface SyncOptions {
  onError?: SyncErrorCallback
}

// uid scope の corpus を listen。返り値の関数を呼ぶと unsubscribe される
export function subscribeCorpus(uid: string, cb: SyncCallback<CorpusItem>, opts?: SyncOptions): Unsubscribe {
  const db = getClientDb()
  if (!db) return () => {}
  const q = query(collection(db, 'corpus'), where('uid', '==', uid))
  return onSnapshot(
    q,
    snap => {
      const items: CorpusItem[] = snap.docs.map(d => {
        const data = d.data() as Omit<CorpusItem, 'id'>
        return { ...(data as CorpusItem), id: d.id }
      })
      // updated_at がないコレクションなので created_at で降順
      items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      cb(items)
    },
    err => opts?.onError?.(err),
  )
}

// uid scope の poems を listen。スキーマ移行関数も適用
export function subscribePoems(uid: string, cb: SyncCallback<Poem>, opts?: SyncOptions): Unsubscribe {
  const db = getClientDb()
  if (!db) return () => {}
  const q = query(collection(db, 'poems'), where('uid', '==', uid))
  return onSnapshot(
    q,
    snap => {
      const items: Poem[] = snap.docs.map(d => {
        const data = d.data() as Omit<Poem, 'id'>
        return migrateLegacyPoem({ ...(data as Poem), id: d.id })
      })
      // 最新更新が上に来るように LWW 用の updated_at で降順
      items.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
      cb(items)
    },
    err => opts?.onError?.(err),
  )
}
