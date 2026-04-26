import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { verifyAuth } from '@/lib/auth-server'
import type { Poem } from '@/lib/types'

export async function GET(req: NextRequest) {
  if (!db) return NextResponse.json([])
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  try {
    const snap = await db.collection('poems')
      .where('uid', '==', uid)
      .get()
    const data = snap.docs
      .map(d => {
        const { id: _omit, ...rest } = d.data() as Poem
        void _omit
        return { id: d.id, ...rest } as Poem
      })
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!db) return NextResponse.json({ error: 'Firebase未設定' }, { status: 500 })
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  try {
    const body = await req.json() as Partial<Omit<Poem, 'id' | 'uid' | 'created_at' | 'updated_at'>>
    const now = new Date().toISOString()
    const doc: Record<string, unknown> = {
      uid,
      title: body.title ?? '',
      lines: Array.isArray(body.lines) ? body.lines : [],
      status: body.status === 'fair_copy' || body.status === 'bound' ? body.status : 'draft',
      source_corpus_ids: Array.isArray(body.source_corpus_ids) ? body.source_corpus_ids : [],
      random_words: Array.isArray(body.random_words) ? body.random_words : [],
      note: body.note ?? '',
      created_at: now,
      updated_at: now,
    }
    const ref = await db.collection('poems').add(doc)
    return NextResponse.json({ id: ref.id, ...doc }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
