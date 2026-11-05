import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Component, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { BEATS, CUES, LANGS, type Lang } from '../content'
import { setLang, start } from '../driver'
import Fallback from '../Fallback'
import { Footer, Header, Skip } from '../Layout'
import { MockProgress, MockSession, MockSetup } from '../Mocks'

gsap.registerPlugin(ScrollTrigger)
const Scene = lazy(() => import('../Scene'))

function detect() {
  if (typeof window === 'undefined') return { still: false, reduced: false } // build-time prerender
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let gl = false
  try {
    const c = document.createElement('canvas')
    gl = !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    gl = false
  }
  return { still: reduced || !gl, reduced }
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const SHOWS = [
  {
    kicker: '01  Choose', title: 'Build the session in a minute.', url: '/coach/', mock: <MockSetup />,
    body: 'Pick from four upper-limb exercises, then set the sets, reps and rest. Or load the plan your physiotherapist saved.',
    points: ['Six arm exercises, from low raises for early recovery to overhead reach', 'Limits that follow age and mode', 'Prescription files, checked every time they load'],
  },
  {
    kicker: '02  Count', title: 'It counts every repetition, set by set.', url: '/coach/', mock: <MockSession />,
    body: 'The camera runs on your device. A flag means a pattern for the physiotherapist to look at, never a diagnosis.',
    points: ['Trunk lean and bent-elbow checks', 'If it cannot see, it says nothing', 'Spoken cues where the device has a voice'],
  },
  {
    kicker: '03  Review', title: 'Progress stays with you.', url: '/progress/', mock: <MockProgress />,
    body: 'Every session is saved on your device with a trend for each exercise. Download a record to hand to the physiotherapist.',
    points: ['Nothing is uploaded', 'Export or delete any time', 'Unnamed unless you choose to share it'],
  },
]

export default function Home() {
  // Server and first client render agree (not still, no scene). Capabilities are read after mount.
  const [mode, setMode] = useState({ still: false, reduced: false, client: false })
  const [ready, setReady] = useState(false)
  const [lang, setLangState] = useState<Lang>('en')
  const root = useRef<HTMLDivElement>(null)
  const live = mode.client && !mode.still

  useEffect(() => {
    setMode({ ...detect(), client: true })
  }, [])

  useEffect(() => {
    if (!live) return
    const stop = start()
    const on = () => setReady(true)
    window.addEventListener('scene-ready', on)
    return () => {
      window.removeEventListener('scene-ready', on)
      stop()
    }
  }, [live])

  // Scroll animation. Tall screens pan inside their frames as the page moves, frames grow in, text rises into place.
  useLayoutEffect(() => {
    if (!mode.client || mode.reduced) return
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.frame').forEach((frame) => {
        const pan = frame.querySelector<HTMLElement>('.pan')!
        gsap.fromTo(pan, { y: 0 }, {
          y: () => -Math.max(0, pan.offsetHeight - (frame.clientHeight - 38)), ease: 'none',
          scrollTrigger: { trigger: frame, start: 'top 82%', end: 'bottom 22%', scrub: 0.6, invalidateOnRefresh: true },
        })
        gsap.from(frame, {
          scale: 0.9, opacity: 0.15, clipPath: 'inset(7% 6% 7% 6% round 48px)', ease: 'none',
          scrollTrigger: { trigger: frame, start: 'top 100%', end: 'top 58%', scrub: true },
        })
      })
      gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
        gsap.from(el, { y: 40, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } })
      })
      gsap.utils.toArray<HTMLElement>('[data-stagger]').forEach((g) => {
        gsap.from(g.children, { y: 44, opacity: 0, duration: 0.85, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: g, start: 'top 86%', once: true } })
      })
    }, root)
    return () => ctx.revert()
  }, [mode.client, mode.reduced])

  const pick = (l: Lang) => {
    setLangState(l)
    setLang(l)
  }

  return (
    <div ref={root} className={mode.still ? 'app home still' : 'app home'}>
      <Skip to="#story" />
      <Header current="home" />

      <main id="story">
      <section id="hero" className="hero">
        <div className="hero-pin">
          <div className="hero-copy">
            <p className="kicker">A camera coach for stroke recovery at home</p>
            <h1>The arm rises. <em>Someone</em> should be watching.</h1>
            <p className="lede">NeuroMotion counts arm-exercise repetitions with your camera, flags the movements a physiotherapist should look at, and speaks in English, Hindi and Marathi.</p>
            <div className="cta">
              <a className="btn" href="/coach/">Open the coach</a>
              <a className="btn ghost" href="#how">See how it works</a>
            </div>
            {!mode.still && <p className="scroll-cue">Scroll to raise the arm</p>}
          </div>

          <div className="hero-frame dark-zone">
            <div className={ready || mode.still ? 'stage ready' : 'stage'} aria-hidden="true">
              {mode.still ? (
                <Fallback />
              ) : live ? (
                <Boundary fallback={<Fallback />}>
                  <Suspense fallback={null}>
                    <Scene />
                  </Suspense>
                </Boundary>
              ) : null}
            </div>
            {!mode.still && (
              <>
                <div className="hud" aria-hidden="true">
                  <div className="hud-chap">
                    <span id="hud-index">01 / {String(BEATS.length).padStart(2, '0')}</span>
                    <span id="hud-chapter">{BEATS[0]}</span>
                  </div>
                  <div className="hud-angle">
                    <span className="num"><span id="hud-angle">000</span><span className="deg">°</span></span>
                    <span className="cap">shoulder flexion, side view</span>
                  </div>
                  <p id="hud-cue" className="hud-cue" lang="en">{CUES.en.ready}</p>
                  <div className="hud-bar"><i id="hud-bar" /></div>
                </div>
                <div className="langs" role="group" aria-label="Language of the coaching cue">
                  {LANGS.map((l) => (
                    <button key={l.id} type="button" lang={l.id} aria-pressed={lang === l.id} title={l.name} onClick={() => pick(l.id)}>{l.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

        <p className="sr-only">A three dimensional arm in the first screen rises and falls as you scroll, showing what the coach would be looking at: the target reached, a flagged movement, and a moment when it cannot see.</p>

        <section className="band" id="why">
          <div className="band-head reveal">
            <h2>Most stroke recovery happens at home.</h2>
            <p>Families are asked to help with exercises, and nobody checks how well the exercise is done.</p>
          </div>
          <div className="stats-row" data-stagger>
            <div className="big-stat"><strong>&lt;0.6</strong><p>physiotherapists for every 10,000 people in India.</p></div>
            <div className="big-stat"><strong>14</strong><p>Indian hospitals took part in the ATTEND trial (The Lancet, 2017). Training families did not beat usual care. Whether unchecked rep quality is why is still a hypothesis.</p></div>
            <div className="big-stat"><strong>3</strong><p>languages for the cues: English, Hindi and Marathi. The Hindi and Marathi wording is a draft until a native speaker signs it off.</p></div>
          </div>
        </section>

        <section className="band" id="how" aria-labelledby="how-h">
          <div className="band-head reveal">
            <h2 id="how-h">One screen at a time.</h2>
            <p>Choose the exercise, let the camera count, and keep the record.</p>
          </div>
          {SHOWS.map((s) => (
            <div className="show" key={s.kicker}>
              <div className="show-copy reveal">
                <p className="kicker">{s.kicker}</p>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <ul>{s.points.map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
              <div className="frame" aria-hidden="true">
                <div className="bar"><i /><i /><i /><span>{s.url}</span></div>
                <div className="pan">{s.mock}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="band" aria-labelledby="safe-h">
          <div className="band-head reveal">
            <h2 id="safe-h">Built to be careful.</h2>
            <p>A supervised exercise aid, not a diagnostic or treatment device.</p>
          </div>
          <div className="bento" data-stagger>
            <article>
              <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>
              <h3>Safety first</h3>
              <p>A safety check and the 108 and 112 emergency numbers come before every session, and one button stops it for pain.</p>
            </article>
            <article>
              <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>
              <h3>On your device</h3>
              <p>The pose model runs in your browser. No video or image is sent anywhere, and your sessions are saved only on this device.</p>
            </article>
            <article>
              <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-9" /><path d="M14 6h7v7" /></svg>
              <h3>Measured, then trusted</h3>
              <p>A physiotherapist compares the angles with a goniometer before the site goes live, and the result is recorded.</p>
            </article>
          </div>
        </section>

        <section className="band">
          <div className="cta-card reveal">
            <h2>Ready when you are.</h2>
            <p>Sign in with an email code or Google, then pick an exercise.</p>
            <div className="cta">
              <a className="btn" href="/coach/">Open the coach</a>
              <a className="btn ghost" href="/legal/">Privacy and terms</a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
