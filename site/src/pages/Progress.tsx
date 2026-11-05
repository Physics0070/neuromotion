import { useEffect, useState } from 'react'
import { deleteAccount, useAuth } from '../auth'
import { Footer, Header, RequireAuth, Skip } from '../Layout'
import { fhirBundle } from '../tracker/core.ts'
import { EXERCISES, EXERCISE_LIST } from '../tracker/exercises.ts'
import { AGE_LABEL } from '../tracker/profile.ts'
import { clearHistory, loadHistory, removeSession, totals, type SessionRecord } from '../tracker/history.ts'

function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Average peak per session for one exercise, oldest first, with the most recent target. */
function series(history: SessionRecord[], id: string) {
  const pts: { at: string; peak: number }[] = []
  let target = 0
  for (const r of [...history].reverse()) {
    const sets = r.log.filter((s) => s.exercise === id && s.reps.length > 0)
    if (sets.length === 0) continue
    const reps = sets.flatMap((s) => s.reps)
    pts.push({ at: r.at, peak: reps.reduce((a, x) => a + x.peak, 0) / reps.length })
    target = sets[sets.length - 1].target
  }
  return { pts, target }
}

function Trend({ id, history }: { id: string; history: SessionRecord[] }) {
  const { pts, target } = series(history, id)
  if (pts.length === 0) return null
  const ex = EXERCISES[id as keyof typeof EXERCISES]
  const all = [target, ...pts.map((p) => p.peak)]
  const lo = Math.max(0, Math.min(...all) * 0.6)
  const hi = Math.max(...all) * 1.12
  const x = (i: number) => (pts.length === 1 ? 150 : 24 + (i * 252) / (pts.length - 1))
  const y = (v: number) => 92 - ((v - lo) / (hi - lo)) * 76
  const latest = pts[pts.length - 1].peak
  return (
    <figure className="trend">
      <figcaption><strong>{ex.name}</strong><span>average peak per session, target {target}°</span></figcaption>
      <svg viewBox="0 0 320 110" role="img" aria-label={`${ex.name}: average peak across ${pts.length} sessions, latest ${Math.round(latest)} degrees, target ${target}`}>
        <line className="t-target" x1="8" x2="312" y1={y(target)} y2={y(target)} strokeDasharray="4 5" strokeWidth="1.5" />
        <text x="312" y={y(target) - 6} textAnchor="end" className="t-target-label" fontFamily="IBM Plex Mono, monospace" fontSize="11">target {target}°</text>
        {pts.length > 1 && <polyline className="t-line" fill="none" strokeWidth="2.5" points={pts.map((p, i) => `${x(i)},${y(p.peak)}`).join(' ')} />}
        {pts.map((p, i) => <circle key={p.at} className="t-dot" cx={x(i)} cy={y(p.peak)} r="4" />)}
        <text x={x(pts.length - 1)} y={y(latest) - 11} textAnchor="middle" className="t-value" fontFamily="IBM Plex Mono, monospace" fontSize="12">{Math.round(latest)}°</text>
      </svg>
    </figure>
  )
}

function ProgressApp() {
  const [list, setList] = useState<SessionRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const auth = useAuth()

  useEffect(() => {
    setList(loadHistory())
    setLoaded(true)
  }, [])

  const all = list.flatMap((r) => r.log)
  const t = totals(all)
  const pct = t.reps ? Math.round((t.reached / t.reps) * 100) : 0

  return (
    <div className="app page-progress">
      <Skip to="#main" />
      <Header current="progress" />
      <main id="main" className="page">
        <p className="kicker">Progress</p>
        <h1 className="ptitle">Every session, kept on this device.</h1>
        <p className="lead">Sessions are saved in this browser only. Nothing is uploaded. Export them or clear them whenever you like.</p>

        {/* reserve the height so the footer does not jump when saved sessions load */}
        <div className="progress-body">
        {loaded && list.length === 0 && (
          <div className="card empty">
            <h2>No sessions yet</h2>
            <p>Run a workout in the Coach and it will appear here, with a trend for each exercise.</p>
            <a className="btn" href="/coach/">Start a workout</a>
          </div>
        )}

        {list.length > 0 && (
          <>
            <div className="stats">
              <div className="card"><span className="stat">{list.length}</span><span className="flabel">sessions</span></div>
              <div className="card"><span className="stat">{t.reps}</span><span className="flabel">repetitions</span></div>
              <div className="card"><span className="stat">{pct}%</span><span className="flabel">reached target</span></div>
              <div className="card"><span className="stat">{t.flagged}</span><span className="flabel">flagged for review</span></div>
            </div>

            <h2>Trends</h2>
            <div className="trends">{EXERCISE_LIST.map((e) => <Trend key={e.id} id={e.id} history={list} />)}</div>

            <h2>Sessions</h2>
            <ul className="history">
              {list.map((r) => {
                const rt = totals(r.log)
                return (
                  <li key={r.id} className="card">
                    <div className="h-top">
                      <div>
                        <strong>{when(r.at)}</strong>
                        <span className="chip dim">{r.source === 'camera' ? 'Camera' : 'Practice mode'}</span>
                        {r.stoppedForPain && <span className="chip warn">Stopped for pain</span>}
                      </div>
                      <span className="hint">{Math.max(1, Math.round(r.durationS / 60))} min</span>
                    </div>
                    <p>{rt.sets} {rt.sets === 1 ? 'set' : 'sets'} · {rt.reps} reps · {rt.reached} reached target · {rt.flagged} flagged</p>
                    <details>
                      <summary>Set by set</summary>
                      <div className="table-wrap" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
                        <table>
                          <thead><tr><th>Exercise</th><th>Set</th><th>Reps</th><th>Target met</th><th>Flags</th></tr></thead>
                          <tbody>
                            {r.log.map((s, i) => (
                              <tr key={i}>
                                <td>{s.exerciseName} ({s.side})</td><td>{s.set}</td><td>{s.reps.length}</td>
                                <td>{s.reps.filter((x) => x.reachedTarget).length}/{s.reps.length}</td>
                                <td>{[...new Set(s.reps.flatMap((x) => x.reasons))].join(', ') || 'None'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                    <div className="row">
                      <button type="button" className="btn ghost" onClick={() => save(`session-${r.at.slice(0, 19).replace(/[:T]/g, '-')}.fhir.json`, JSON.stringify(fhirBundle(r.log, r.abha, r.shared, new Date(r.at), r.profile && { mode: r.profile.mode, ageBand: AGE_LABEL[r.profile.ageBand], method: r.profile.method }), null, 2), 'application/fhir+json')}>Download FHIR record</button>
                      <button type="button" className="btn ghost" onClick={() => setList(removeSession(r.id))}>Delete</button>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="row spaced">
              <button type="button" className="btn ghost" onClick={() => save('neuromotion-history.json', JSON.stringify(list, null, 2), 'application/json')}>Export all sessions</button>
              {!confirmClear ? (
                <button type="button" className="btn ghost" onClick={() => setConfirmClear(true)}>Clear all history</button>
              ) : (
                <>
                  <button type="button" className="btn danger" onClick={() => { setList(clearHistory()); setConfirmClear(false) }}>Yes, delete everything</button>
                  <button type="button" className="btn ghost" onClick={() => setConfirmClear(false)}>Keep it</button>
                </>
              )}
            </div>
          </>
        )}
        </div>

        {auth.status === 'in' && (
          <section className="card" aria-labelledby="h-account" style={{ marginTop: 48 }}>
            <h2 id="h-account">Account</h2>
            <p>Signed in as <strong>{auth.user.email}</strong>. The account holds only this address and when you signed in. Your sessions above are not part of it.</p>
            <div className="row">
              {!confirmDelete ? (
                <button type="button" className="btn ghost" onClick={() => setConfirmDelete(true)}>Delete my account</button>
              ) : (
                <>
                  <button type="button" className="btn danger" onClick={() => void deleteAccount().then((ok) => !ok && setDeleteError('Could not delete the account. Try again.'))}>Yes, delete my account</button>
                  <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
                </>
              )}
            </div>
            {deleteError && <p className="note-bad" role="alert">{deleteError}</p>}
          </section>
        )}
      </main>
      <Footer />
    </div>
  )
}

export default function Progress() {
  return <RequireAuth><ProgressApp /></RequireAuth>
}
