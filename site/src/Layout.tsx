import type { ReactNode } from 'react'
import { signOut, useAuth } from './auth'
import { release } from './release-data'
import ThemeToggle from './ThemeToggle'

export type PageId = 'home' | 'coach' | 'progress' | 'validate' | 'review' | 'legal' | 'login'

const NAV: { id: PageId; href: string; label: string }[] = [
  { id: 'home', href: '/', label: 'Story' },
  { id: 'coach', href: '/coach/', label: 'Coach' },
  { id: 'progress', href: '/progress/', label: 'Progress' },
]
const CLINIC: { id: PageId; href: string; label: string }[] = [
  { id: 'legal', href: '/legal/', label: 'Privacy and terms' },
  { id: 'review', href: '/review/', label: 'Clinical review' },
  { id: 'validate', href: '/validate/', label: 'Validation' },
]

export function Skip({ to }: { to: string }) {
  return <a className="skip" href={to}>Skip to the content</a>
}

function AuthNav() {
  const a = useAuth()
  if (a.status === 'in') {
    return (
      <div className="authnav">
        <span className="who" title={a.user.email}>{a.user.email}</span>
        <button type="button" className="btn ghost sm" onClick={() => void signOut()}>Sign out</button>
      </div>
    )
  }
  if (a.status === 'out') return <div className="authnav"><a className="btn sm" href="/login/">Sign in</a></div>
  return <div className="authnav" />
}

export function Header({ current, children }: { current: PageId; children?: ReactNode }) {
  return (
    <header className="top">
      <a className="mark" href="/" aria-label="NeuroMotion, home">
        <span className="mark-full">NeuroMotion</span>
        <span className="mark-short" aria-hidden="true">NM</span>
      </a>
      <nav aria-label="Pages">
        {NAV.map((n) => (
          <a key={n.id} href={n.href} className={n.id === 'home' ? 'nav-story' : undefined} aria-current={n.id === current ? 'page' : undefined}>{n.label}</a>
        ))}
      </nav>
      <div className="tools">
        {children}
        <ThemeToggle />
        <AuthNav />
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="foot">
      <p>NeuroMotion is an exercise-counting aid, not a medical device. It does not diagnose or treat anything. In an emergency call 108 or 112.</p>
      <nav aria-label="Footer">
        {NAV.map((n) => <a key={n.id} href={n.href}>{n.label}</a>)}
        {CLINIC.map((n) => <a key={n.id} href={n.href}>{n.label}</a>)}
        {release.contactEmail && <a href={`mailto:${release.contactEmail}`}>Contact</a>}
      </nav>
      <p className="ver">Version {release.version}</p>
    </footer>
  )
}

/** Wraps the pages that need an account. While the answer is pending the page shows a short notice; signed out goes to /login/. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const a = useAuth()
  if (a.status === 'out') {
    if (typeof window !== 'undefined') location.replace(`/login/?next=${encodeURIComponent(location.pathname)}`)
    return null
  }
  if (a.status === 'loading') return <main className="page" id="main"><p className="hint" role="status">Checking your sign-in…</p></main>
  return <>{children}</>
}
