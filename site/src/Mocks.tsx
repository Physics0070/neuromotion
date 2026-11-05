// Static, non-interactive miniatures of the real screens. They use the app's own classes, so they always match the product
// and follow the theme. They are decoration for the scroll frames on the home page, hidden from assistive technology.
import Pic from './Pic'
import { EXERCISE_LIST } from './tracker/exercises.ts'

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="field"><span className="flabel">{label}</span><div className="fake">{value}</div></div>
)

export function MockSetup() {
  return (
    <div className="mock" aria-hidden="true" {...{ inert: true }}>
      <ol className="steps">
        <li data-s="done"><span className="s"><i>✓</i>Who</span></li>
        <li data-s="now"><span className="s"><i>2</i>Workout</span></li>
        <li data-s="todo"><span className="s"><i>3</i>Safety and start</span></li>
      </ol>
      <div className="tiles">
        {EXERCISE_LIST.map((e, i) => (
          <div key={e.id} className="tile" aria-pressed={i === 0}>
            <Pic id={e.id} />
            <strong>{e.name}</strong>
            <span className="chip dim">{e.view}</span>
            <span>{e.blurb}</span>
          </div>
        ))}
      </div>
      <div className="nums">
        <Field label="Sets" value="2" />
        <Field label="Reps per set" value="5" />
        <Field label="Rest (seconds)" value="30" />
        <Field label="Target shoulder flexion (°)" value="90" />
      </div>
      <div className="side">
        <h2>Your workout</h2>
        <div className="block"><div><strong>Shoulder flexion</strong><span>2 sets × 5 reps · rest 30 s · target 90° · right arm</span></div></div>
        <div className="mock-gap" />
        <div className="block"><div><strong>Elbow flexion</strong><span>1 set × 8 reps · rest 30 s · target 120° · right arm</span></div></div>
      </div>
    </div>
  )
}

export function MockSession() {
  return (
    <div className="mock" aria-hidden="true" {...{ inert: true }}>
      <div className="run-stage">
        <svg viewBox="0 0 400 300" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} fill="none" strokeLinecap="round">
          <path d="M150 70 V230" stroke="#2a2f3d" strokeWidth="22" />
          <circle cx="150" cy="40" r="22" stroke="#4a5164" strokeWidth="2" />
          <path d="M150 90 L262 90 L318 62" stroke="#f2a33a" strokeWidth="9" />
          {[[150, 90], [262, 90], [318, 62]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="8" fill="#fff" />)}
        </svg>
        <div className="stage-top">
          <span className="pill"><b>Shoulder flexion</b> · right arm · Side view</span>
          <span className="pill">Set 1/2 · Rep 3/5</span>
        </div>
        <div className="hud-live">
          <div><span className="num ok">094<small>°</small></span><span className="cap">shoulder flexion, target 90°</span></div>
          <p className="cue">Good! Now lower slowly.</p>
        </div>
      </div>
      <div className="mock-gap" />
      <div className="panel">
        <p className="progress-line">Exercise 1 of 2 · Set <strong>1</strong> of 2</p>
        <div className="dots"><i className="on" /><i className="on" /><i className="on" /><i /><i /></div>
        <p className="reps">Reps <strong>3</strong> / 5<span> · 1 flagged so far</span></p>
        <p className="cue-line">Good! Now lower slowly.</p>
      </div>
      <div className="mock-gap" />
      <div className="panel">
        <span className="flabel">Rest</span>
        <span className="big-num">24<small>s</small></span>
        <p className="reps">Next: Set 2 of 2 · Shoulder flexion</p>
      </div>
    </div>
  )
}

export function MockProgress() {
  const pts = [38, 52, 61, 70, 78, 86]
  const x = (i: number) => 24 + (i * 252) / (pts.length - 1)
  const y = (v: number) => 92 - (v / 100) * 76
  return (
    <div className="mock" aria-hidden="true" {...{ inert: true }}>
      <div className="stats" style={{ marginTop: 0 }}>
        <div className="card"><span className="stat">6</span><span className="flabel">sessions</span></div>
        <div className="card"><span className="stat">148</span><span className="flabel">repetitions</span></div>
        <div className="card"><span className="stat">72%</span><span className="flabel">reached target</span></div>
        <div className="card"><span className="stat">9</span><span className="flabel">flagged for review</span></div>
      </div>
      <div className="mock-gap" />
      <figure className="trend">
        <figcaption><strong>Shoulder flexion</strong><span>average peak per session, target 90°</span></figcaption>
        <svg viewBox="0 0 320 110">
          <line className="t-target" x1="8" x2="312" y1={y(90)} y2={y(90)} strokeDasharray="4 5" strokeWidth="1.5" />
          <polyline className="t-line" fill="none" strokeWidth="2.5" points={pts.map((p, i) => `${x(i)},${y(p)}`).join(' ')} />
          {pts.map((p, i) => <circle key={i} className="t-dot" cx={x(i)} cy={y(p)} r="4" />)}
        </svg>
      </figure>
      <div className="mock-gap" />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Exercise</th><th>Set</th><th>Reps</th><th>Target met</th><th>Flags</th></tr></thead>
          <tbody>
            <tr><td>Shoulder flexion (right)</td><td>1</td><td>5</td><td>4/5</td><td>None</td></tr>
            <tr><td>Shoulder flexion (right)</td><td>2</td><td>5</td><td>5/5</td><td>trunk lean</td></tr>
            <tr><td>Elbow flexion (right)</td><td>1</td><td>8</td><td>6/8</td><td>None</td></tr>
          </tbody>
        </table>
      </div>
      <div className="mock-gap" />
      <div className="card"><h2>FHIR record</h2><p>Per-repetition observations, grouped by set. Unnamed unless you choose to share it with your physiotherapist.</p></div>
    </div>
  )
}
