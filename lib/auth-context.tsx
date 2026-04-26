'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onIdTokenChanged,
  User,
} from 'firebase/auth'
import { getClientAuth, isAuthAvailable } from './firebase-client'

type AuthState = {
  user: User | null
  idToken: string | null
  loading: boolean
  available: boolean // Firebase Auth が設定済みか
  signInGoogle: () => Promise<void>
  signInEmail: (email: string, password: string) => Promise<void>
  signUpEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [idToken, setIdToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const available = isAuthAvailable()

  useEffect(() => {
    const auth = getClientAuth()
    if (!auth) {
      setLoading(false)
      return
    }
    const unsub = onIdTokenChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        const t = await u.getIdToken()
        setIdToken(t)
      } else {
        setIdToken(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const signInGoogle = async () => {
    const auth = getClientAuth()
    if (!auth) throw new Error('Firebase Auth 未設定')
    await signInWithPopup(auth, new GoogleAuthProvider())
  }

  const signInEmail = async (email: string, password: string) => {
    const auth = getClientAuth()
    if (!auth) throw new Error('Firebase Auth 未設定')
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signUpEmail = async (email: string, password: string) => {
    const auth = getClientAuth()
    if (!auth) throw new Error('Firebase Auth 未設定')
    await createUserWithEmailAndPassword(auth, email, password)
  }

  const signOut = async () => {
    const auth = getClientAuth()
    if (!auth) return
    await fbSignOut(auth)
  }

  return (
    <AuthContext.Provider value={{
      user, idToken, loading, available,
      signInGoogle, signInEmail, signUpEmail, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth は AuthProvider 内で呼んでください')
  return ctx
}
