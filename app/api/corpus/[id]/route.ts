import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!db) return NextResponse.json({ error: 'Firebase未設定' }, { status: 500 })
  try {
    const { id } = await params
    await db.collection('corpus').doc(id).delete()
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
