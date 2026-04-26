import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import { verifyAuth } from '@/lib/auth-server'

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
