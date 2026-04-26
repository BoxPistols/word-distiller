import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { verifyAuth } from '@/lib/auth-server'
import type { Poem, PoemStatus } from '@/lib/types'

const STATUSES: readonly PoemStatus[] = ['draft', 'fair_copy', 'bound']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!db) return NextResponse.json({ error: 'Firebase未設定' }, { status: 500 })
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  try {
    const { id } = await params
    const docRef = db.collection('poems').doc(id)
    const snap = await docRef.get()
    if (!snap.exists) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const cur = snap.data() as Poem | undefined
    if (!cur || cur.uid !== uid) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json() as Partial<Pick<Poem, 'title' | 'lines' | 'status' | 'source_corpus_ids' | 'random_words' | 'note'>>
    const update: Record<string, unknown> = {}
    if (typeof body.title === 'string') update.title = body.title
    if (Array.isArray(body.lines))      update.lines = body.lines.map(s => String(s))
    if (typeof body.status === 'string' && STATUSES.includes(body.status)) update.status = body.status
    if (Array.isArray(body.source_corpus_ids)) update.source_corpus_ids = body.source_corpus_ids.map(s => String(s))
    if (Array.isArray(body.random_words))      update.random_words = body.random_words.map(s => String(s))
    if (typeof body.note === 'string')  update.note = body.note

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    }
    update.updated_at = new Date().toISOString()

    await docRef.update(update)
    const after = (await docRef.get()).data() as Poem | undefined
    if (!after) return NextResponse.json({ error: 'not found after update' }, { status: 500 })
    const { id: _omit, ...rest } = after
    void _omit
    return NextResponse.json({ id, ...rest })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!db) return NextResponse.json({ error: 'Firebase未設定' }, { status: 500 })
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  try {
    const { id } = await params
    const docRef = db.collection('poems').doc(id)
    const snap = await docRef.get()
    if (!snap.exists) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (snap.data()?.uid !== uid) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    await docRef.delete()
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
