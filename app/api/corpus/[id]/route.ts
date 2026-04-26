import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { db } from '@/lib/firebase'
import { verifyAuth } from '@/lib/auth-server'
import { getEmbedding } from '@/lib/embedding'
import type { CorpusItem, Verdict } from '@/lib/types'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!db) return NextResponse.json({ error: 'Firebase未設定' }, { status: 500 })
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  try {
    const { id } = await params
    const docRef = db.collection('corpus').doc(id)
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

// 部分更新: text / verdict / reason / tags のいずれか
// embedding の同期:
//   採用 → 却下: embedding を削除（RAG 検索対象から外す）
//   却下 → 採用: embedding を新規生成
//   採用維持 + text 変更: embedding を再生成
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!db) return NextResponse.json({ error: 'Firebase未設定' }, { status: 500 })
  const uid = await verifyAuth(req)
  if (!uid) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  try {
    const { id } = await params
    const docRef = db.collection('corpus').doc(id)
    const snap = await docRef.get()
    if (!snap.exists) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const cur = snap.data() as CorpusItem | undefined
    if (!cur || cur.uid !== uid) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json() as Partial<Pick<CorpusItem, 'text' | 'verdict' | 'reason' | 'tags'>>
    const update: Record<string, unknown> = {}
    if (typeof body.text === 'string')      update.text = body.text
    if (body.verdict === 'accepted' || body.verdict === 'rejected') update.verdict = body.verdict
    if (typeof body.reason === 'string')    update.reason = body.reason
    if (Array.isArray(body.tags))           update.tags = body.tags

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
    }

    const oldVerdict: Verdict = cur.verdict
    const oldText = cur.text ?? ''
    const newVerdict: Verdict = (update.verdict as Verdict | undefined) ?? oldVerdict
    const newText = (update.text as string | undefined) ?? oldText

    if (newVerdict === 'accepted') {
      const needsEmbed = oldVerdict !== 'accepted' || newText !== oldText
      if (needsEmbed && newText) {
        update.embedding = await getEmbedding(newText)
      }
    } else if (oldVerdict === 'accepted') {
      update.embedding = FieldValue.delete()
    }

    await docRef.update(update)

    const after = (await docRef.get()).data() as CorpusItem | undefined
    if (!after) return NextResponse.json({ error: 'not found after update' }, { status: 500 })
    const { embedding, id: _omit, ...rest } = after
    void embedding; void _omit
    return NextResponse.json({ id, ...rest })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
