import { CONSENT, CUES, LANGS, SAFETY, type CueKey, type Lang } from '../content'
import { Footer, Header, Skip } from '../Layout'
import { VALIDATION_MAX_MAE, VALIDATION_MIN_PAIRS } from '../release.ts'
import { release, stillPending } from '../release-data'
import { MODES, AGE_LABEL, limitsFor, type AgeBand } from '../tracker/profile.ts'
import { EXERCISE_LIST } from '../tracker/exercises.ts'
import { MIN_TRUNK, MIN_VIS } from '../tracker/core.ts'
import { CAL_FRAMES } from '../tracker/session.ts'

const BANDS: AgeBand[] = ['teen', 'adult', 'older', 'elder']
const who = (s: { reviewer: string; date: string }) => (s.reviewer && s.date ? `${s.reviewer}, ${s.date}` : 'Pending')
const row = (label: string, status: string) => <tr key={label}><td>{label}</td><td className={status === 'Pending' ? 'bad' : ''}>{status}</td></tr>
const cueKeys = Object.keys(CUES.en) as CueKey[]

export default function Review() {
  const v = release.validation
  return (
    <div className="app page-review">
      <Skip to="#main" />
      <Header current="review" />
      <main id="main" className="page prose">
        <p className="kicker">Clinical review</p>
        <h1 className="ptitle">Everything a reviewer has to sign off, in one place.</h1>
        <p className="lead">This page is generated from the same data the app runs on, so what you read here is what patients get. Print it, sign it, and record the sign-off in <code>src/release.json</code>. Version {release.version}.</p>

        <h2>1. Sign-off status</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Sign-off status, scrolls sideways"><table>
          <thead><tr><th>Item</th><th>Status</th></tr></thead>
          <tbody>
            {row('Physiotherapist review (rules, limits, wording of safety text)', release.clinical.reviewer && release.clinical.date && release.clinical.registration ? `${release.clinical.reviewer}, reg. ${release.clinical.registration}, ${release.clinical.date}` : 'Pending')}
            {row('Hindi wording', who(release.translations.hi))}
            {row('Marathi wording', who(release.translations.mr))}
            {row('Legal review of privacy, terms and consent', who(release.legal))}
            {row(`Goniometer validation (at least ${VALIDATION_MIN_PAIRS} readings, mean error up to ${VALIDATION_MAX_MAE}°)`, v.n > 0 && v.maeDeg !== null && v.date ? `${v.n} readings, mean error ${v.maeDeg}°, ${v.method}, ${v.date}` : 'Pending')}
          </tbody>
        </table></div>
        <p className="hint">{stillPending.length === 0 ? 'Every sign-off is present.' : `Still pending: ${stillPending.join('; ')}.`}</p>

        <h2>2. Exercises and rules</h2>
        <p>A repetition starts when the measured angle passes <em>starts above</em>, and counts only if it peaks at least 15° higher and then falls below <em>ends below</em>. A rep is flagged for review, never judged, if it breaks a check.</p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Exercises and rules, scrolls sideways"><table>
          <thead><tr><th>Exercise</th><th>View</th><th>Measures</th><th>Starts above</th><th>Ends below</th><th>Default target</th><th>Allowed target</th><th>Flag when</th></tr></thead>
          <tbody>
            {EXERCISE_LIST.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td><td>{e.view}</td><td>{e.metricLabel}</td><td>{e.start}°</td><td>{e.rest}°</td><td>{e.defaultTarget}°</td><td>{e.targetRange[0]} to {e.targetRange[1]}°</td>
                <td>trunk leans over {e.checks.maxLean}°{e.checks.minElbow !== undefined ? `; elbow bends below ${e.checks.minElbow}°` : ''}{e.checks.maxShoulder !== undefined ? `; upper arm moves over ${e.checks.maxShoulder}°` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table></div>

        <h2>3. Limits by age and mode</h2>
        <p>Under 12: not supported. 12 to 17 needs a guardian. A loaded prescription may exceed these; the app warns and never edits it.</p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Limits by age and mode, scrolls sideways"><table>
          <thead><tr><th>Mode</th>{BANDS.map((b) => <th key={b}>Age {AGE_LABEL[b]}</th>)}</tr></thead>
          <tbody>
            {MODES.map((m) => (
              <tr key={m.id}><td>{m.name}</td>{BANDS.map((b) => { const l = limitsFor(m.id, b)!; return <td key={b}>{l.sets} sets, {l.reps} reps, rest {l.minRest} s or more</td> })}</tr>
            ))}
          </tbody>
        </table></div>

        <h2>4. How the angle is measured</h2>
        <ul>
          <li>Pose model: MediaPipe Pose Landmarker (lite), on the device. 3D angles from its world landmarks by default, 2D image angles as an option.</li>
          <li>A joint is used only if the model is at least {MIN_VIS * 100}% sure of it. Otherwise the app asks the person to reposition and judges nothing.</li>
          <li>The person must fill at least {MIN_TRUNK * 100}% of the frame height (shoulder to hip) or the app asks them to move closer.</li>
          <li>Before each arm&rsquo;s first set the app measures the resting arm and trunk for about a second ({CAL_FRAMES} frames) and subtracts that offset. It refuses if the arm is more than 30° from hanging or the trunk more than 20° from upright.</li>
          <li>A single frame that jumps more than 50° is ignored. Readings are smoothed. The angle shown is a camera estimate, not a goniometer reading.</li>
        </ul>

        <h2>5. Safety text (English, Hindi, Marathi)</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Safety text, scrolls sideways"><table>
          <tbody>
            {LANGS.map((l) => (
              <tr key={l.id}>
                <th scope="row">{l.name}</th>
                <td lang={l.id}><p>{SAFETY[l.id].emergency}</p><p><strong>{SAFETY[l.id].screenTitle}</strong></p><ul>{SAFETY[l.id].screen.map((i) => <li key={i}>{i}</li>)}</ul><p>{SAFETY[l.id].confirm}</p></td>
              </tr>
            ))}
          </tbody>
        </table></div>

        <h2>6. Spoken and written cues</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Cues, scrolls sideways"><table>
          <thead><tr><th>Cue</th>{LANGS.map((l) => <th key={l.id}>{l.name}</th>)}</tr></thead>
          <tbody>
            {cueKeys.map((k) => <tr key={k}><td>{k}</td>{LANGS.map((l) => <td key={l.id} lang={l.id}>{CUES[l.id][k]}</td>)}</tr>)}
            {EXERCISE_LIST.flatMap((e) => (Object.keys(e.cues) as CueKey[]).map((k) => (
              <tr key={`${e.id}-${k}`}><td>{e.name}: {k}</td>{LANGS.map((l) => <td key={l.id} lang={l.id}>{e.cues[k]![l.id as Lang]}</td>)}</tr>
            )))}
          </tbody>
        </table></div>

        <h2>7. Consent text</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Consent text, scrolls sideways"><table>
          <tbody>
            {LANGS.map((l) => (
              <tr key={l.id}><th scope="row">{l.name}</th><td lang={l.id}><p>{CONSENT[l.id].use}</p><p>{CONSENT[l.id].share.replace('{abha}', 'name@abdm')}</p></td></tr>
            ))}
          </tbody>
        </table></div>

        <h2>8. Signatures</h2>
        <div className="sign">
          {['Physiotherapist (name, registration number)', 'Hindi reviewer', 'Marathi reviewer', 'Legal reviewer'].map((r) => (
            <p key={r}><span>{r}</span><i /></p>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  )
}
