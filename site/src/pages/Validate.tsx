import { useEffect, useMemo, useRef, useState } from 'react'
import { Footer, Header, RequireAuth, Skip } from '../Layout'
import { VALIDATION_MAX_MAE, VALIDATION_MIN_PAIRS } from '../release.ts'
import { openCamera, isDenied, CAMERA_DENIED, type Camera } from '../tracker/camera.ts'
import { measure, measureWorld, type Side } from '../tracker/core.ts'
import type { Method } from '../tracker/profile.ts'
import { WINDOW, loadPairs, releaseSnippet, savePairs, stats, steadyReading, toCsv, verdict, type Joint, type Pair } from '../tracker/validation.ts'

const W = 640, H = 480

function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function ValidateApp() {
  const [pairs, setPairs] = useState<Pair[]>([])
  const [ok, setOk] = useState(false)
  const [on, setOn] = useState(false)
  const [joint, setJoint] = useState<Joint>('shoulder')
  const [side, setSide] = useState<Side>('right')
  const [method, setMethod] = useState<Method>('world3d')
  const [gonio, setGonio] = useState('')
  const [live, setLive] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frames = useRef<(number | null)[]>([])
  const cfg = useRef({ joint, side, method })
  cfg.current = { joint, side, method }

  useEffect(() => setPairs(loadPairs()), [])

  useEffect(() => {
    if (!on) return
    const video = videoRef.current!, canvas = canvasRef.current!, ctx = canvas.getContext('2d')!
    canvas.width = W
    canvas.height = H
    let alive = true, raf = 0, cam: Camera | null = null, shown: number | null = -1
    frames.current = []

    const tick = (now: number) => {
      if (!alive || !cam) return
      const pose = cam.detect(now)
      if (pose) {
        const c = cfg.current
        const m = c.method === 'world3d' && pose.world ? measureWorld(pose.world, c.side) : measure(pose.lm, c.side, cam.aspect())
        const v = m ? Math.round((c.joint === 'shoulder' ? m.shoulder : 180 - m.elbow) * 10) / 10 : null
        frames.current = [...frames.current.slice(-(WINDOW - 1)), v]
        if (v !== shown) setLive((shown = v))
        ctx.clearRect(0, 0, W, H)
        ctx.lineCap = 'round'
        for (const [a, b] of [['shoulder', 'elbow'], ['elbow', 'wrist'], ['shoulder', 'hip']] as const) {
          const p = pose.lm[`${c.side}_${a}`], q = pose.lm[`${c.side}_${b}`]
          if (!p || !q) continue
          ctx.strokeStyle = p[2] >= 0.6 && q[2] >= 0.6 ? '#f2a33a' : 'rgba(255,255,255,0.25)'
          ctx.lineWidth = 6
          ctx.beginPath()
          ctx.moveTo(p[0] * W, p[1] * H)
          ctx.lineTo(q[0] * W, q[1] * H)
          ctx.stroke()
        }
      }
      raf = requestAnimationFrame(tick)
    }
    ;(async () => {
      try {
        const opened = await openCamera(video, { w: W, h: H }, setStatus)
        if (!alive) return opened.stop()
        cam = opened
        setStatus('')
        raf = requestAnimationFrame(tick)
      } catch (e) {
        setError(isDenied(e) ? CAMERA_DENIED : `Could not start: ${e instanceof Error ? e.message : String(e)}`)
        setStatus('')
        setOn(false)
      }
    })()
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      cam?.stop()
    }
  }, [on])

  const record = () => {
    const g = Number(gonio)
    if (gonio.trim() === '' || !Number.isFinite(g) || g < 0 || g > 180) return setMsg('Type the goniometer reading, 0 to 180 degrees.')
    const r = steadyReading(frames.current)
    if ('error' in r) return setMsg(r.error)
    setPairs(savePairs([{ at: new Date().toISOString(), joint, side, method, app: r.value, gonio: g }, ...pairs]))
    setGonio('')
    setMsg(`Recorded: app ${r.value}°, goniometer ${g}°.`)
  }

  const s = useMemo(() => stats(pairs), [pairs])
  const v = verdict(s)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="app page-validate">
      <Skip to="#main" />
      <Header current="validate" />
      <main id="main" className="page">
        <p className="kicker">Validation</p>
        <h1 className="ptitle">Check the angles against a goniometer.</h1>
        <p className="lead">For the supervising physiotherapist. Hold the arm still at an angle, read the goniometer, type it in and record. The app keeps its own reading from the same half second. At least {VALIDATION_MIN_PAIRS} readings across low, middle and high angles, both arms, decide whether the on-screen angle can be trusted.</p>

        {!on && (
          <section className="card">
            <h2>Start</h2>
            <label className="check">
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
              <span>The person being measured agrees. The camera stays on this device, nothing is uploaded, and only the numbers you record are saved here.</span>
            </label>
            {error && <p className="note-bad" role="alert">{error}</p>}
            <button type="button" className="btn big" disabled={!ok} onClick={() => { setError(''); setOn(true) }}>Open the camera</button>
          </section>
        )}

        {on && (
          <div className="run">
            <div className="run-stage">
              <div>
                <video ref={videoRef} playsInline muted />
                <canvas ref={canvasRef} aria-label="Skeleton overlay of the tracked arm" />
                {status && <p className="stage-status" role="status">{status}</p>}
              </div>
            </div>
            <div className="panel">
              <div className="seg" role="group" aria-label="Measure">
                <button type="button" aria-pressed={joint === 'shoulder'} onClick={() => setJoint('shoulder')}>Shoulder angle</button>
                <button type="button" aria-pressed={joint === 'elbowBend'} onClick={() => setJoint('elbowBend')}>Elbow bend</button>
              </div>
              <div className="seg" role="group" aria-label="Arm">
                <button type="button" aria-pressed={side === 'right'} onClick={() => setSide('right')}>Right</button>
                <button type="button" aria-pressed={side === 'left'} onClick={() => setSide('left')}>Left</button>
              </div>
              <div className="seg" role="group" aria-label="Angle method">
                <button type="button" aria-pressed={method === 'world3d'} onClick={() => setMethod('world3d')}>3D</button>
                <button type="button" aria-pressed={method === 'image2d'} onClick={() => setMethod('image2d')}>2D image</button>
              </div>
              <div className="readout">
                <span className="big-num">{live === null ? '---' : live.toFixed(0)}<small>°</small></span>
                <span className="flabel">the app now</span>
              </div>
              <div className="field">
                <label className="flabel" htmlFor="gonio">Goniometer reading (°)</label>
                <input id="gonio" type="number" inputMode="decimal" min={0} max={180} value={gonio} onChange={(e) => setGonio(e.target.value)} />
              </div>
              <div className="row">
                <button type="button" className="btn" onClick={record}>Record reading</button>
                <button type="button" className="btn ghost" onClick={() => setOn(false)}>Close the camera</button>
              </div>
              {msg && <p className="hint" role="status">{msg}</p>}
            </div>
          </div>
        )}

        <section className="card" aria-labelledby="h-result">
          <h2 id="h-result">Result</h2>
          {!s ? <p className="hint">No readings yet.</p> : (
            <>
              <div className="stats">
                <div className="card"><span className="stat">{s.n}</span><span className="flabel">readings</span></div>
                <div className="card"><span className="stat">{s.mae}°</span><span className="flabel">mean error</span></div>
                <div className="card"><span className="stat">{s.bias > 0 ? '+' : ''}{s.bias}°</span><span className="flabel">bias (app minus goniometer)</span></div>
                <div className="card"><span className="stat">{s.maxAbs}°</span><span className="flabel">largest error</span></div>
              </div>
              <p className={v === 'pass' ? 'note-ok' : 'note-bad'} role="status">
                {v === 'more-readings' && `Need at least ${VALIDATION_MIN_PAIRS} readings (${s.n} so far).`}
                {v === 'pass' && `Passes: mean error ${s.mae}° is within ${VALIDATION_MAX_MAE}°. Paste the block below into src/release.json.`}
                {v === 'fail' && `Does not pass: mean error ${s.mae}° is above ${VALIDATION_MAX_MAE}°. Do not release. Try the other method, check the camera position, or ask for rep counting without angles.`}
              </p>
              {v === 'pass' && <pre className="code" tabIndex={0}>{releaseSnippet(s, pairs[0].method, today)}</pre>}
              <div className="table-wrap" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
                <table>
                  <thead><tr><th>Joint</th><th>Arm</th><th>Method</th><th>App</th><th>Goniometer</th><th>Error</th></tr></thead>
                  <tbody>
                    {pairs.map((p) => (
                      <tr key={p.at}><td>{p.joint === 'shoulder' ? 'Shoulder' : 'Elbow bend'}</td><td>{p.side}</td><td>{p.method === 'world3d' ? '3D' : '2D'}</td><td>{p.app}°</td><td>{p.gonio}°</td><td>{(p.app - p.gonio).toFixed(1)}°</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row">
                <button type="button" className="btn ghost" onClick={() => save('validation.csv', toCsv(pairs), 'text/csv')}>Download CSV</button>
                <button type="button" className="btn ghost" onClick={() => setPairs(savePairs(pairs.slice(1)))}>Delete last</button>
                <button type="button" className="btn ghost" onClick={() => { if (confirm('Delete every reading?')) setPairs(savePairs([])) }}>Clear all</button>
              </div>
            </>
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}

export default function Validate() {
  return <RequireAuth><ValidateApp /></RequireAuth>
}
