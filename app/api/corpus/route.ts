import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { verifyAuth } from '@/lib/auth-server'
import { getEmbedding } from '@/lib/embedding'
import type { CorpusItem } from '@/lib/types'

export async function GET(req: NextRequest) {
  if (!db) return NextResponse.json([])
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  try {
    const snap = await db.collection('corpus')
      .where('uid', '==', uid)
      .get()
    // embedding はクライアントに送らない（サイズ削減）
    const data = snap.docs
      .map(d => {
        const { embedding, id: _omit, ...rest } = d.data() as CorpusItem
        void embedding; void _omit
        return { id: d.id, ...rest } as CorpusItem
      })
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
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
    const body = await req.json() as Omit<CorpusItem, 'id' | 'created_at'>

    // 採用時のみ embedding を生成（却下断片は RAG に使わない）
    let embedding: number[] | null = null
    if (body.verdict === 'accepted' && body.text) {
      embedding = await getEmbedding(body.text)
    }

    const doc: Record<string, unknown> = {
      uid,
      text: body.text,
      input: body.input ?? '',
      verdict: body.verdict,
      reason: body.reason ?? '',
      tags: body.tags ?? [],
      created_at: new Date().toISOString(),
    }
    if (embedding) doc.embedding = embedding

    const ref = await db.collection('corpus').add(doc)
    // クライアントへは embedding を返さない
    const { embedding: _, ...rest } = doc
    void _
    return NextResponse.json({ id: ref.id, ...rest }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
