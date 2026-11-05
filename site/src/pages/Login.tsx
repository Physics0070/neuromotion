import { useEffect, useState, type FormEvent } from 'react'
import { post, refresh, safeNext, useAuth } from '../auth'
import { Footer, Header, Skip } from '../Layout'

const WAIT = 30 // seconds before another code can be asked for

const MESSAGES: Record<string, string> = {
  'google-failed': 'Google sign-in did not complete. Try again, or use an email code.',
  'google-denied': 'Google sign-in was cancelled. You can try again, or use an email code.',
}

export default function Login() {
  const auth = useAuth()
  const [next, setNext] = useState('/coach/')
  const [google, setGoogle] = useState(false)
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(0)

  useEffect(() => {
    const p = new URLSearchParams(location.search)
    setNext(safeNext(p.get('next')))
    setError(MESSAGES[p.get('error') ?? ''] ?? '')
    fetch('/api/auth/config').then((r) => r.json()).then((c) => setGoogle(!!c.google)).catch(() => {})
    void refresh()
  }, [])

  useEffect(() => {
    if (auth.status === 'in') location.replace(next)
  }, [auth.status, next])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const ask = async (e?: FormEvent) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    const r = await post('/api/auth/otp/request', { email }).catch(() => null)
    setBusy(false)
    if (!r) return setError('Could not reach the server. Check your connection and try again.')
    if (r.status === 400) return setError('Enter a valid email address.')
    if (r.status === 429) return setError('Too many codes were requested. Wait a while and try again.')
    if (!r.ok) return setError('Something went wrong. Try again in a moment.')
    setStep('code')
    setCode('')
    setWait(WAIT)
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const r = await post('/api/auth/otp/verify', { email, code }).catch(() => null)
    if (r?.ok) return location.assign(next)
    setBusy(false)
    if (!r) return setError('Could not reach the server. Check your connection and try again.')
    setError(r.status === 429 ? 'Too many attempts. Ask for a new code in a few minutes.' : 'That code is wrong or has expired.')
  }

  return (
    <div className="app page-login">
      <Skip to="#main" />
      <Header current="login" />
      <main id="main" className="login">
        <div className="login-card">
          <h1>Sign in</h1>
          <p className="lead">{step === 'email' ? 'Use your email or Google to open the coach.' : `We sent a 6-digit code to ${email}. It works for 10 minutes.`}</p>

          {step === 'email' && (
            <>
              {google && (
                <>
                  <a className="btn ghost big" href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}>
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>
                    Continue with Google
                  </a>
                  <div className="or">or</div>
                </>
              )}
              <form onSubmit={ask} noValidate>
                <div className="field">
                  <label className="flabel" htmlFor="email">Email address</label>
                  <input id="email" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <button type="submit" className="btn big" disabled={busy || email.trim() === ''}>{busy ? 'Sending…' : 'Email me a code'}</button>
              </form>
            </>
          )}

          {step === 'code' && (
            <form onSubmit={verify}>
              <div className="field">
                <label className="flabel" htmlFor="otp">6-digit code</label>
                <input id="otp" className="code-input" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
              </div>
              <button type="submit" className="btn big" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify and continue'}</button>
              <div className="row spaced">
                <button type="button" className="linkbtn" disabled={wait > 0 || busy} onClick={() => void ask()}>{wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</button>
                <button type="button" className="linkbtn" onClick={() => { setStep('email'); setError('') }}>Use a different email</button>
              </div>
            </form>
          )}

          {error && <p className="note-bad" role="alert">{error}</p>}
          <p className="fine">We keep your email and when you signed in, so you can sign back in. Your exercise sessions stay on this device. See the <a href="/legal/">privacy notice</a>.</p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
