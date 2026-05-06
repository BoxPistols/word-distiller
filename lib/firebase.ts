import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

let _db: Firestore | null = null

try {
  if (!getApps().length && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
    const rawKey = process.env.FIREBASE_PRIVATE_KEY
    const keyHasLiteralBackslashN = rawKey.includes('\\n')
    const keyHasActualNewline = rawKey.includes('\n')
    const privateKey = rawKey.replace(/\\n/g, '\n')
    console.log('[firebase-admin] key fmt — literal\\n:', keyHasLiteralBackslashN, 'actual\\n:', keyHasActualNewline, 'len:', rawKey.length, 'projectId:', process.env.FIREBASE_PROJECT_ID, 'clientEmail set:', !!process.env.FIREBASE_CLIENT_EMAIL)
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    })
    console.log('[firebase-admin] initialized OK')
  } else if (!getApps().length) {
    console.error('[firebase-admin] env missing — projectId:', !!process.env.FIREBASE_PROJECT_ID, 'privateKey:', !!process.env.FIREBASE_PRIVATE_KEY)
  }
  if (getApps().length) _db = getFirestore()
} catch (e) {
  console.error('[firebase-admin] init failed:', e instanceof Error ? e.message : String(e))
}

export const db = _db
