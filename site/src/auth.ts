// Who is signed in. The server owns the session (an httpOnly cookie); the page only asks.
import { useEffect, useState } from 'react'

export interface User { email: string; name: string | null }
/** 'offline': the server could not be reached. Exercise data lives on the device, so the app keeps working. */
export type AuthState = { status: 'loading' } | { status: 'out' } | { status: 'offline' } | { status: 'in'; user: User }

let current: AuthState = { status: 'loading' }
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()
const set = (s: AuthState) => {
  current = s
  listeners.forEach((l) => l())
}

export function refresh(): Promise<void> {
  inflight ??= fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(async (r) => set(r.ok ? { status: 'in', user: (await r.json()).user } : { status: 'out' }))
    .catch(() => set({ status: 'offline' }))
    .finally(() => { inflight = null })
  return inflight
}

export async function post(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }
}

export async function signOut() {
  await post('/api/auth/logout').catch(() => {})
  location.assign('/login/') // the page unloads; marking the state signed-out first would race the route guard
}

export async function deleteAccount(): Promise<boolean> {
  const r = await post('/api/auth/delete').catch(() => null)
  if (!r?.ok) return false
  location.assign('/login/')
  return true
}

export function useAuth(): AuthState {
  const [, tick] = useState(0)
  useEffect(() => {
    const l = () => tick((n) => n + 1)
    listeners.add(l)
    if (current.status === 'loading') void refresh()
    return () => { listeners.delete(l) }
  }, [])
  return current
}

/** Only same-site paths: the same rule the server applies. */
export const safeNext = (n: string | null) => (n && /^\/[a-z0-9/_-]*$/i.test(n) && !n.startsWith('//') && n.length < 80 ? n : '/coach/')
