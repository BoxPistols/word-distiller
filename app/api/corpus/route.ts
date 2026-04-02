import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/firebase'
import type { CorpusItem } from '@/lib/types'

export async function GET() {
  if (!db) return NextResponse.json([])
  try {
    const snap = await db.collection('corpus').orderBy('created_at', 'desc').get()
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as CorpusItem[]
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!db) return NextResponse.json({ error: 'Firebase未設定' }, { status: 500 })
  try {
    const body = await req.json() as Omit<CorpusItem, 'id' | 'created_at'>
    const doc = {
      text: body.text,
      input: body.input ?? '',
      verdict: body.verdict,
      reason: body.reason ?? '',
      tags: body.tags ?? [],
      created_at: new Date().toISOString(),
    }
    const ref = await db.collection('corpus').add(doc)
    return NextResponse.json({ id: ref.id, ...doc }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
