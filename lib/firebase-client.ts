import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { getAuth, Auth } from 'firebase/auth'

// クライアント側Firebase（Auth用）。NEXT_PUBLIC_FIREBASE_* が揃っていない場合は null を返す
let _app: FirebaseApp | null = null
let _auth: Auth | null = null

function ensureApp(): FirebaseApp | null {
  if (typeof window === 'undefined') return null
  if (_app) return _app
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }
  if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId) return null
  _app = getApps().length ? getApps()[0] : initializeApp(cfg)
  return _app
}

export function getClientAuth(): Auth | null {
  if (_auth) return _auth
  const app = ensureApp()
  if (!app) return null
  _auth = getAuth(app)
  return _auth
}

export function isAuthAvailable(): boolean {
  return getClientAuth() !== null
}
