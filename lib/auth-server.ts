import { getAuth } from 'firebase-admin/auth'
import { getApps } from 'firebase-admin/app'
import type { NextRequest } from 'next/server'

// API ルートでリクエストヘッダから ID トークンを抽出して uid を返す
// トークン無し or 検証失敗時は null を返す
export async function verifyAuth(req: NextRequest): Promise<string | null> {
  if (!getApps().length) return null
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  if (!token) return null
  try {
    const decoded = await getAuth().verifyIdToken(token)
    return decoded.uid
  } catch {
    return null
  }
}
