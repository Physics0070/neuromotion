import { useEffect, useRef, useState } from 'react'
import { CONSENT, LANGS, SAFETY, type Lang } from '../content'
import { Footer, Header, RequireAuth, Skip } from '../Layout'
import { openCamera, isDenied, CAMERA_DENIED, type Camera } from '../tracker/camera.ts'
import { cueText } from '../tracker/cues.ts'
import Pic from '../Pic'
import { fhirBundle, measure, measureWorld, type Cue, type Lm, type Lm3, type Side } from '../tracker/core.ts'
import { EXERCISES, EXERCISE_LIST, type ExerciseId } from '../tracker/exercises.ts'
import { addSession, newId, totals, type SessionRecord } from '../tracker/history.ts'
import { AGE_LABEL, AGE_RANGE, MODES, ageBand, clampBlock, defaultsFor, limitsFor, modeName, parseAge, warnings, type Method, type Mode } from '../tracker/profile.ts'
import { LIMITS, SessionRunner, parsePlan, planToJson, validateBlock, type Block, type Phase } from '../tracker/session.ts'
import { simulatedPose } from '../tracker/simulate.ts'
import { silence, speak, voiceFor } from '../tracker/speak.ts'

type Source = 'camera' | 'practice'
type Screen = 'profile' | 'workout' | 'check' | 'running' | 'done'
const STEPS = ['Who', 'Workout', 'Safety and start']
const STEP_SCREEN: Screen[] = ['profile', 'workout', 'check']

const BAD = new Set<Cue>(['reposition', 'lean', 'elbow', 'still', 'stop'])
const W = 640, H = 480
const ABHA = /^[a-z0-9._-]{3,40}@(abdm|sbx)$/i // the ABHA address format: name@abdm
const MAX_PLAN_BYTES = 100_000

interface Hud {
  value: number | null; cue: Cue; phase: Phase
  rep: number; reps: number; set: number; sets: number; block: number; blocks: number
  rest: number; exId: ExerciseId | ''; name: string; metric: string; target: number; side: Side; view: string
  next: string; flagged: number; stopped: boolean; cal: number
}
const hudKey = (h: Hud) => JSON.stringify(h)
const EMPTY_HUD: Hud = {
  value: null, cue: 'ready', phase: 'active', rep: 0, reps: 0, set: 1, sets: 1, block: 1, blocks: 1,
  rest: 0, exId: '', name: '', metric: '', target: 0, side: 'right', view: '', next: '', flagged: 0, stopped: false, cal: 0,
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string; lang?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span className="flabel" id={`l-${label}`}>{label}</span>
      <div className="seg" role="group" aria-labelledby={`l-${label}`}>
        {options.map((o) => (
          <button key={o.id} type="button" lang={o.lang} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
        ))}
      </div>
    </div>
  )
}

function Num({ id, label, value, min, max, step = 1, onChange }: { id: string; label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <div className="field">
      <label className="flabel" htmlFor={id}>{label}</label>
      <input id={id} type="number" inputMode="numeric" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Math.round(Number(e.target.value) || min))))} />
    </div>
  )
}

const describe = (b: Block) => `${b.sets} ${b.sets === 1 ? 'set' : 'sets'} × ${b.reps} reps · rest ${b.rest} s · target ${b.target}° · ${b.side} arm`
const newDraft = (exercise: ExerciseId = 'shoulder-flexion', d: Pick<Block, 'sets' | 'reps' | 'rest'> = { sets: 2, reps: 5, rest: 30 }): Block => ({ exercise, side: 'right', ...d, target: EXERCISES[exercise].defaultTarget })

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function CoachApp() {
  const [screen, setScreen] = useState<Screen>('profile')
  const [mode, setMode] = useState<Mode>('stroke')
  const [ageText, setAgeText] = useState('')
  const [guardian, setGuardian] = useState(false)
  const [screened, setScreened] = useState(false)
  const [method, setMethod] = useState<Method>('world3d')
  const [lang, setLang] = useState<Lang>('en')
  const [source, setSource] = useState<Source>('camera')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [draft, setDraft] = useState<Block>(newDraft())
  const [planError, setPlanError] = useState('')
  const [abha, setAbha] = useState('')
  const [agreed, setAgreed] = useState<boolean | null>(null)
  const [share, setShare] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [voiceOk, setVoiceOk] = useState(true)
  const [hud, setHud] = useState<Hud>(EMPTY_HUD)
  const [summary, setSummary] = useState<SessionRecord | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const consentRef = useRef<HTMLDialogElement>(null)
  const runnerRef = useRef<SessionRunner | null>(null)
  const stopRef = useRef(false)
  const endRef = useRef<() => void>(() => {})
  const langRef = useRef(lang)
  langRef.current = lang

  useEffect(() => {
    window.scrollTo(0, 0) // the setup page is long; the session and summary should open at the top
  }, [screen])

  useEffect(() => {
    const s = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    const update = () => setVoiceOk(!!voiceFor(lang))
    update()
    s?.addEventListener('voiceschanged', update)
    return () => s?.removeEventListener('voiceschanged', update)
  }, [lang])

  useEffect(() => {
    if (screen !== 'running') return
    const video = videoRef.current!, canvas = canvasRef.current!, ctx = canvas.getContext('2d')!
    canvas.width = W
    canvas.height = H
    let alive = true, raf = 0, last: Cue | null = null
    let cam: Camera | null = null
    let lastLm: Lm = {}
    let lastWorld: Lm3 | null = null
    const runner = new SessionRunner(blocks, { calibrate: true })
    runnerRef.current = runner
    stopRef.current = false
    const t0 = performance.now()
    let simT0 = t0, speakAfter = 0, doneAt = 0

    const cleanup = () => {
      alive = false
      cancelAnimationFrame(raf)
      cam?.stop() // safe to run twice (finish, then effect teardown)
      cam = null
      silence()
    }
    endRef.current = () => {
      const log = runner.finish()
      cleanup()
      const rec: SessionRecord = {
        id: newId(), at: new Date().toISOString(), durationS: Math.round((performance.now() - t0) / 1000),
        source, plan: blocks, log, stoppedForPain: runner.stoppedForPain, shared: share && !!abha, abha: share && abha ? abha : undefined,
        profile: { mode, ageBand: ageBand(parseAge(ageText) ?? 30), method: source === 'camera' ? method : 'image2d' },
      }
      if (log.length > 0) addSession(rec) // numbers only, kept on this device
      setSummary(rec)
      setScreen('done')
    }

    const draw = (lm: Lm, cue: Cue, side: Side, resting: boolean) => {
      ctx.clearRect(0, 0, W, H)
      if (source === 'practice') {
        ctx.fillStyle = '#10131a'
        ctx.fillRect(0, 0, W, H)
      }
      const color = BAD.has(cue) ? '#ff4d4d' : cue === 'good' ? '#5bd6a0' : '#f2a33a'
      const px = (n: string): [number, number, boolean] | null => (lm[n] ? [lm[n][0] * W, lm[n][1] * H, lm[n][2] >= 0.6] : null)
      ctx.lineCap = 'round'
      ctx.globalAlpha = resting ? 0.35 : 1
      for (const [a, b] of [['shoulder', 'elbow'], ['elbow', 'wrist'], ['shoulder', 'hip']] as const) {
        const p = px(`${side}_${a}`), q = px(`${side}_${b}`)
        if (!p || !q) continue
        ctx.strokeStyle = p[2] && q[2] ? color : 'rgba(255,255,255,0.25)'
        ctx.lineWidth = 6
        ctx.beginPath()
        ctx.moveTo(p[0], p[1])
        ctx.lineTo(q[0], q[1])
        ctx.stroke()
      }
      for (const n of Object.keys(lm)) {
        const p = px(n)!
        ctx.fillStyle = p[2] ? '#fff' : 'rgba(255,255,255,0.25)'
        ctx.beginPath()
        ctx.arc(p[0], p[1], 5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    const tick = (now: number) => {
      if (!alive) return
      const before = runner.current
      const side = before.side
      let lm: Lm = lastLm
      if (source === 'practice') {
        lm = simulatedPose(runner.phase === 'active' ? (now - simT0) / 1000 : 0, before.exercise, side)
      } else if (cam) {
        const pose = cam.detect(now)
        if (pose) {
          lastLm = lm = pose.lm
          lastWorld = pose.world
        }
      }
      const aspect = cam?.aspect() ?? W / H
      const m = source === 'camera' && method === 'world3d' && lastWorld ? measureWorld(lastWorld, side) : measure(lm, side, source === 'camera' ? aspect : 1)
      const before0 = runner.phase
      const cue: Cue = stopRef.current ? 'stop' : runner.step(m, now)
      if ((before0 === 'resting' || before0 === 'calibrating') && runner.phase === 'active') simT0 = now // practice mode: each set starts from the top of a rep
      const b = runner.current
      const ex = EXERCISES[b.exercise]
      draw(lm, cue, side, runner.phase === 'resting')

      if (cue !== last && now >= speakAfter) {
        last = cue
        speak(langRef.current, cueText(langRef.current, cue, ex))
        if (cue === 'set_done') speakAfter = now + 1800 // let "set complete" finish before the next cue
      }

      const flagged = runner.log.reduce((n, s) => n + s.reps.filter((r) => r.flagged).length, 0)
      const up = runner.upNext
      const next: Hud = {
        value: runner.adj ? Math.round(ex.metric === 'shoulder' ? runner.adj.shoulder : 180 - runner.adj.elbow) : null, cal: Math.round(runner.calProgress * 100),
        cue, phase: runner.phase, rep: Math.min(runner.repsDone, b.reps), reps: b.reps, set: runner.set + 1, sets: b.sets,
        block: runner.block + 1, blocks: blocks.length, rest: runner.restLeft(now), exId: ex.id, name: ex.name, metric: ex.metricLabel, target: b.target,
        side: b.side, view: ex.view, flagged, stopped: stopRef.current,
        next: up ? `Set ${up.set} of ${up.block.sets} · ${EXERCISES[up.block.exercise].name}` : '',
      }
      setHud((h) => (hudKey(h) === hudKey(next) ? h : next))

      if (runner.phase === 'done') {
        doneAt ||= now
        if (now - doneAt > 1600) return endRef.current()
      }
      raf = requestAnimationFrame(tick)
    }

    ;(async () => {
      try {
        if (source === 'camera') {
          const opened = await openCamera(video, { w: W, h: H }, setStatus)
          if (!alive) return opened.stop()
          cam = opened
        }
        if (!alive) return cleanup()
        setStatus('')
        simT0 = performance.now()
        raf = requestAnimationFrame(tick)
      } catch (e) {
        cleanup()
        setError(isDenied(e) ? CAMERA_DENIED : `Could not start: ${e instanceof Error ? e.message : String(e)}`)
        setStatus('')
        setScreen('check')
      }
    })()
    return cleanup
    // The session is configured once, when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  const consentText = CONSENT[lang].use
  const shareText = CONSENT[lang].share.replace('{abha}', abha || '…')
  const age = parseAge(ageText)
  const band = age === null ? null : ageBand(age)
  const limits = band ? limitsFor(mode, band) : null
  const person = MODES.find((m) => m.id === mode)!.person
  const warn = mode === 'prescribed' ? warnings(blocks, limits) : []
  const abhaOk = abha === '' || ABHA.test(abha)
  const canStart = screened && abhaOk && blocks.length > 0 && !!limits && (band !== 'teen' || guardian)
  const ex = EXERCISES[draft.exercise]
  const L = limits ?? { sets: LIMITS.sets[1], reps: LIMITS.reps[1], minRest: LIMITS.rest[0] }

  const continueProfile = () => {
    if (!band || !limits) return
    const d = defaultsFor(mode, band)
    setDraft(newDraft('shoulder-flexion', d))
    setBlocks(mode === 'prescribed' ? [] : [newDraft('shoulder-flexion', d)])
    setGuardian(false)
    setPlanError('')
    setScreen('workout')
  }

  const addBlock = () => {
    try {
      setBlocks((b) => (b.length >= 12 ? b : [...b, validateBlock(clampBlock(draft, L))]))
      setPlanError('')
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : String(e))
    }
  }
  const loadPlan = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_PLAN_BYTES) return setPlanError('That file is too large to be a prescription.')
    try {
      const { blocks: loaded } = parsePlan(await file.text())
      const clamped = mode === 'prescribed' || !limits ? loaded : loaded.map((b) => clampBlock(b, limits))
      setBlocks(clamped)
      setPlanError(clamped.some((b, i) => JSON.stringify(b) !== JSON.stringify(loaded[i])) ? 'Some sets, reps or rest times were changed to the gentler limit for this age and mode.' : '')
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : String(e))
    }
  }
  const answer = (yes: boolean) => {
    consentRef.current?.close()
    setAgreed(yes)
    if (yes) begin()
  }
  const begin = () => {
    setError('')
    setHud(EMPTY_HUD)
    setPlanError('')
    setScreened(false) // the check is repeated before every session
    setScreen('running')
  }

  const first = blocks[0] ? EXERCISES[blocks[0].exercise] : null
  const resting = hud.phase === 'resting'
  const stepNo = screen === 'profile' ? 0 : screen === 'workout' ? 1 : 2
  const inSetup = screen === 'profile' || screen === 'workout' || screen === 'check'
  const why = blocks.length === 0 ? (mode === 'prescribed' ? 'Load a prescription first.' : 'Add at least one exercise.') : !screened ? 'Complete the safety check.' : band === 'teen' && !guardian ? 'A parent or guardian must agree.' : 'Fix the ABHA address or clear it.'

  return (
    <div className="app page-coach">
      <Skip to="#main" />
      <Header current="coach" />
      <main id="main" className="coach">
        {inSetup && (
          <ol className="steps" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} data-s={i === stepNo ? 'now' : i < stepNo ? 'done' : 'todo'}>
                {i < stepNo ? (
                  <button type="button" onClick={() => setScreen(STEP_SCREEN[i])}><i aria-hidden="true">✓</i>{s}</button>
                ) : (
                  <span className="s" aria-current={i === stepNo ? 'step' : undefined}><i aria-hidden="true">{i + 1}</i>{s}</span>
                )}
              </li>
            ))}
          </ol>
        )}

        {screen === 'profile' && (
          <section className="stepcard" aria-labelledby="h-step">
            <header>
              <h1 id="h-step">Who is exercising?</h1>
              <p className="lead">Pick a mode and enter the age. The age sets how many sets, reps and how much rest the app allows. Your exact age is not saved.</p>
            </header>
            <p className="note-bad" role="note" lang={lang}>{SAFETY[lang].emergency}</p>
            <h2 className="sub">Mode</h2>
            <div className="modes" role="group" aria-label="Mode">
              {MODES.map((m) => (
                <button key={m.id} type="button" className="tile" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                  <strong>{m.name}</strong>
                  <span>{m.blurb}</span>
                </button>
              ))}
            </div>
            <div className="field">
              <label className="flabel" htmlFor="age">Age of the person exercising (years)</label>
              <input id="age" type="number" inputMode="numeric" min={AGE_RANGE[0]} max={AGE_RANGE[1]} placeholder="for example 64" value={ageText} onChange={(e) => setAgeText(e.target.value)} />
            </div>
            {ageText !== '' && age === null && <p className="note-bad" role="alert">Enter a whole number from {AGE_RANGE[0]} to {AGE_RANGE[1]}.</p>}
            {band === 'child' && <p className="note-bad" role="alert">This app is not for children under 12. Please ask a paediatric physiotherapist for a programme.</p>}
            {band && limits && (
              <p className="hint">Age band {AGE_LABEL[band]}. Up to {limits.sets} sets, {limits.reps} reps per set, at least {limits.minRest} s rest.{band === 'teen' ? ' A parent or guardian must be present.' : ''} These are cautious defaults chosen for this prototype, not medical advice.</p>
            )}
            {!limits && band !== 'child' && <p className="hint">Enter the age to continue.</p>}
            <div className="actions">
              <span />
              <button type="button" className="btn" disabled={!limits} onClick={continueProfile}>Continue</button>
            </div>
          </section>
        )}

        {screen === 'workout' && (
          <section className="stepcard" aria-labelledby="h-step">
            <header>
              <h1 id="h-step">{mode === 'prescribed' ? 'Load the prescription.' : 'Build the workout.'}</h1>
              <p className="lead">{mode === 'prescribed' ? 'Load the file your physiotherapist saved. The camera then counts every repetition, set by set.' : 'Choose an exercise, set the sets, reps and rest, and add it. The camera counts every repetition, set by set.'}</p>
            </header>
            <div className="two">
              <div>
                {mode === 'prescribed' ? (
                  <p className="hint">The exercises, sets, reps and targets come from the file. They cannot be edited here. Use &ldquo;Load prescription&rdquo; on the right.</p>
                ) : (
                  <>
                    <div className="field">
                      <label className="flabel" htmlFor="exercise">Exercise</label>
                      <select id="exercise" value={draft.exercise} onChange={(e) => setDraft(newDraft(e.target.value as ExerciseId, { sets: draft.sets, reps: draft.reps, rest: draft.rest }))}>
                        {EXERCISE_LIST.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                    <div className="expreview">
                      <Pic id={ex.id} />
                      <div>
                        <span className="chip dim">{ex.view}</span>
                        <p>{ex.blurb}</p>
                      </div>
                    </div>
                    <Seg label="Arm" value={draft.side} options={[{ id: 'right', label: 'Right' }, { id: 'left', label: 'Left' }]} onChange={(side) => setDraft({ ...draft, side })} />
                    <div className="nums">
                      <Num id="sets" label="Sets" value={draft.sets} min={LIMITS.sets[0]} max={L.sets} onChange={(sets) => setDraft({ ...draft, sets })} />
                      <Num id="reps" label="Reps per set" value={draft.reps} min={LIMITS.reps[0]} max={L.reps} onChange={(reps) => setDraft({ ...draft, reps })} />
                      <Num id="rest" label="Rest (seconds)" value={draft.rest} min={L.minRest} max={LIMITS.rest[1]} step={5} onChange={(rest) => setDraft({ ...draft, rest })} />
                      <Num id="target" label={`Target ${ex.metricLabel} (°)`} value={draft.target} min={ex.targetRange[0]} max={ex.targetRange[1]} step={5} onChange={(target) => setDraft({ ...draft, target })} />
                    </div>
                    <p className="hint">The target is the physiotherapist&rsquo;s setting. {ex.name} starts at {ex.defaultTarget}° as a placeholder.</p>
                    <button type="button" className="btn" onClick={addBlock} disabled={blocks.length >= 12}>Add to workout</button>
                  </>
                )}
                {planError && <p className="note-bad" role="alert">{planError}</p>}
                {warn.map((w) => <p key={w} className="note-bad" role="status">{w}</p>)}
              </div>

              <aside className="side" aria-label="Your workout">
                <h2>Your workout</h2>
                {blocks.length === 0 ? (
                  <p className="empty-note">No exercises yet. {mode === 'prescribed' ? 'Load a prescription.' : 'Add one, or load a prescription.'}</p>
                ) : (
                  <ol className="blocks">
                    {blocks.map((b, i) => (
                      <li key={i} className="block">
                        <div>
                          <strong>{EXERCISES[b.exercise].name}</strong>
                          <span>{describe(b)}</span>
                        </div>
                        {mode !== 'prescribed' && <button type="button" className="icon-btn" aria-label={`Remove ${EXERCISES[b.exercise].name}`} onClick={() => setBlocks((x) => x.filter((_, j) => j !== i))}>Remove</button>}
                      </li>
                    ))}
                  </ol>
                )}
                <div className="row">
                  <button type="button" className="btn ghost sm" disabled={blocks.length === 0} onClick={() => download('prescription.json', planToJson(blocks), 'application/json')}>Save prescription</button>
                  <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()}>Load prescription</button>
                  <input ref={fileRef} type="file" hidden accept="application/json,.json" onChange={(e) => { void loadPlan(e.target.files?.[0]); e.target.value = '' }} />
                </div>
              </aside>
            </div>
            <div className="actions">
              <button type="button" className="btn ghost" onClick={() => setScreen('profile')}>Back</button>
              <button type="button" className="btn" disabled={blocks.length === 0} onClick={() => setScreen('check')}>Continue</button>
            </div>
          </section>
        )}

        {screen === 'check' && (
          <section className="stepcard" aria-labelledby="h-step">
            <header>
              <h1 id="h-step">Before you start.</h1>
              <p className="lead">Choose how the coach listens, check it is safe to exercise today, and agree. The camera opens only after you start.</p>
            </header>
            <div className="two">
              <div>
                <h2 className="sub">Session</h2>
                <p className="hint" style={{ marginTop: 0 }}><strong>{modeName(mode)}</strong>{band ? ` · age ${AGE_LABEL[band]}` : ''} <button type="button" className="icon-btn" onClick={() => setScreen('profile')}>Change</button></p>
                <Seg label="Language" value={lang} options={LANGS.map((l) => ({ id: l.id, label: l.label, lang: l.id }))} onChange={setLang} />
                <Seg label="Source" value={source} options={[{ id: 'camera', label: 'My camera' }, { id: 'practice', label: 'Practice mode' }]} onChange={setSource} />
                {source === 'camera' && <Seg label="Angle method" value={method} options={[{ id: 'world3d', label: '3D (recommended)' }, { id: 'image2d', label: '2D image' }]} onChange={setMethod} />}
                {source === 'camera' && first && <p className="hint"><strong>{first.name}:</strong> {first.placement} When you start, let the arm hang still by your side for a second so the app can measure the resting position.</p>}
                {source === 'practice' && <p className="hint">Practice mode plays a scripted pose so you can try the whole flow without a camera: one clean rep, one with the wrist out of sight, one that breaks the exercise&rsquo;s rule. It is not a measurement of anyone.</p>}
                {!voiceOk && <p className="hint">This browser has no {LANGS.find((l) => l.id === lang)!.name} voice. Cues will be text only.</p>}
                <div className="field" style={{ marginTop: 22 }}>
                  <label className="flabel" htmlFor="abha">ABHA address (optional)</label>
                  <input id="abha" type="text" placeholder="name@abdm" value={abha} onChange={(e) => setAbha(e.target.value.trim())} autoComplete="off" />
                </div>
                {!abhaOk && <p className="note-bad" role="alert">An ABHA address looks like name@abdm.</p>}
              </div>

              <aside className="side" aria-label="Safety check">
                <h2 lang={lang}>{SAFETY[lang].screenTitle}</h2>
                <ul className="screen" lang={lang}>{SAFETY[lang].screen.map((i) => <li key={i}>{i}</li>)}</ul>
                <label className="check">
                  <input type="checkbox" checked={screened} onChange={(e) => setScreened(e.target.checked)} />
                  <span lang={lang}>{SAFETY[lang].confirm}</span>
                </label>
                <p className="note-bad" role="note" lang={lang}>{SAFETY[lang].emergency}</p>
                <p className="hint">When you press Start, you will be asked to agree before the camera opens.</p>
                {agreed === false && <p className="note-bad" role="status">Declined. The camera was not opened and nothing was recorded.</p>}
                {band === 'teen' && (
                  <label className="check">
                    <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} />
                    <span>A parent or guardian is present and agrees to this session.</span>
                  </label>
                )}
              </aside>
            </div>
            {error && <p className="note-bad" role="alert">{error}</p>}
            <div className="actions">
              <button type="button" className="btn ghost" onClick={() => setScreen('workout')}>Back</button>
              <button type="button" className="btn" disabled={!canStart} onClick={() => { setAgreed(null); consentRef.current?.showModal() }}>Start the workout</button>
            </div>
            {!canStart && <p className="hint">{why}</p>}
            <dialog ref={consentRef} className="modal" aria-labelledby="h-consent" onClose={silence}>
              <h2 id="h-consent">Consent</h2>
              <p lang={lang} className="consent">{consentText}</p>
              {!!abha && abhaOk && (
                <label className="check">
                  <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
                  <span lang={lang}>{shareText}</span>
                </label>
              )}
              <div className="row" style={{ marginTop: 22 }}>
                <button type="button" className="btn ghost sm" onClick={() => speak(lang, consentText)}>Read aloud</button>
                <button type="button" className="btn ghost sm" onClick={() => answer(false)}>I decline</button>
                <button type="button" className="btn sm" onClick={() => answer(true)}>I agree</button>
              </div>
            </dialog>
          </section>
        )}

        {!inSetup && (
          <div className={`run${screen === 'done' ? ' is-done' : ''}`}>
            <h1 className="sr-only">{screen === 'running' ? 'Session in progress' : 'Session complete'}</h1>
            <div className="run-stage dark-zone">
              <video ref={videoRef} playsInline muted className={source === 'camera' ? '' : 'off'} />
              <canvas ref={canvasRef} aria-label="Skeleton overlay of the tracked arm" />
              {status && <p className="stage-status" role="status">{status}</p>}
              {screen === 'running' && (
                <>
                  <div className="stage-top" aria-hidden="true">
                    <span className="pill"><b>{hud.name}</b> · {hud.side} arm · {hud.view}</span>
                    {source === 'practice' && <span className="pill">Scripted pose</span>}
                    <span className="pill">{resting ? `Rest ${hud.rest}s` : hud.phase === 'calibrating' ? `Calibrating ${hud.cal}%` : `Set ${hud.set}/${hud.sets} · Rep ${hud.rep}/${hud.reps}`}</span>
                  </div>
                  <div className="hud-live" aria-hidden="true">
                    <div>
                      <span className={`num${BAD.has(hud.cue) ? ' bad' : hud.cue === 'good' ? ' ok' : ''}`}>{hud.value === null ? '---' : String(hud.value).padStart(3, '0')}<small>°</small></span>
                      <span className="cap">{hud.metric}, target {hud.target}°</span>
                    </div>
                    <p lang={lang} className={`cue${BAD.has(hud.cue) ? ' bad' : ''}`}>{cueText(lang, hud.cue, hud.exId ? EXERCISES[hud.exId] : undefined)}</p>
                  </div>
                </>
              )}
            </div>

            {screen === 'running' && (
              <div className="panel">
                <p className="progress-line">
                  Exercise {hud.block} of {hud.blocks} · Set <strong>{hud.set}</strong> of {hud.sets}
                </p>
                {!resting ? (
                  <>
                    {hud.phase === 'calibrating' && <p className="hint" role="status">Measuring the resting position: arm hanging, sitting upright, hold still. {hud.cal}%</p>}
                    <div className="dots" role="img" aria-label={`Repetition ${hud.rep} of ${hud.reps}`}>
                      {Array.from({ length: hud.reps }, (_, i) => <i key={i} className={i < hud.rep ? 'on' : ''} />)}
                    </div>
                    <p className="reps">Reps <strong>{hud.rep}</strong> / {hud.reps}<span> · {hud.flagged} flagged so far</span></p>
                  </>
                ) : (
                  <div className="rest">
                    <span className="flabel">Rest</span>
                    <span className="big-num">{hud.rest}<small>s</small></span>
                    <p className="reps">Next: {hud.next}</p>
                    <button type="button" className="btn ghost" onClick={() => runnerRef.current?.skipRest(performance.now())}>Start next set now</button>
                  </div>
                )}
                <p lang={lang} className={`cue-line${BAD.has(hud.cue) ? ' bad' : ''}`} role="status">{cueText(lang, hud.cue, hud.exId ? EXERCISES[hud.exId] : undefined)}</p>
                <div className="row">
                  <button type="button" className="btn danger" onClick={() => { stopRef.current = true; runnerRef.current?.stop() }}>{person === 'patient' ? 'Patient has pain: stop' : 'I have pain: stop'}</button>
                  <button type="button" className="btn ghost" onClick={() => endRef.current()}>{hud.stopped ? 'End session' : 'Finish early'}</button>
                </div>
              </div>
            )}

            {screen === 'done' && summary && <Summary rec={summary} onAgain={() => { setSummary(null); setScreen('workout') }} />}
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}

function Summary({ rec, onAgain }: { rec: SessionRecord; onAgain: () => void }) {
  const t = totals(rec.log)
  const dl = () => download(`session-${rec.at.slice(0, 19).replace(/[:T]/g, '-')}.fhir.json`, JSON.stringify(fhirBundle(rec.log, rec.abha, rec.shared, new Date(rec.at), rec.profile && { mode: rec.profile.mode, ageBand: AGE_LABEL[rec.profile.ageBand], method: rec.profile.method }), null, 2), 'application/fhir+json')
  return (
    <div className="panel">
      <h2>Session summary</h2>
      {t.reps === 0 ? (
        <p className="lead small">No repetitions were counted, so nothing was saved.</p>
      ) : (
        <>
          <p className="lead small">
            {t.sets} {t.sets === 1 ? 'set' : 'sets'}, {t.reps} reps, {t.reached} reached the target, {t.flagged} flagged for physiotherapist review.
            {rec.stoppedForPain && ' Stopped for pain.'}
          </p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
            <table>
              <thead><tr><th>Exercise</th><th>Set</th><th>Reps</th><th>Target met</th><th>Avg peak</th><th>Flags</th></tr></thead>
              <tbody>
                {rec.log.map((s, i) => {
                  const planned = rec.plan[s.block]?.reps ?? s.reps.length
                  const avg = s.reps.reduce((a, r) => a + r.peak, 0) / Math.max(1, s.reps.length)
                  const notes = [...new Set(s.reps.flatMap((r) => r.reasons))].join(', ')
                  return (
                    <tr key={i}>
                      <td>{s.exerciseName} ({s.side})</td><td>{s.set}</td><td>{s.reps.length}/{planned}</td>
                      <td>{s.reps.filter((r) => r.reachedTarget).length}/{s.reps.length}</td><td>{avg.toFixed(0)}°</td><td>{notes || 'None'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="hint">Saved to Progress on this device. {rec.shared ? `The record names ${rec.abha}, as agreed.` : 'The record is unnamed.'} A flag is a pattern to review, not a diagnosis.</p>
        </>
      )}
      <div className="row">
        {t.reps > 0 && <button type="button" className="btn" onClick={dl}>Download FHIR record</button>}
        {t.reps > 0 && <a className="btn ghost" href="/progress/">See progress</a>}
        <button type="button" className="btn ghost" onClick={onAgain}>Back to workout</button>
      </div>
    </div>
  )
}

export default function Coach() {
  return <RequireAuth><CoachApp /></RequireAuth>
}
