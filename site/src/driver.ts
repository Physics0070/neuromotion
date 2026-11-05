// One driver, one clock. Scroll progress is mapped to the joint state the real app would see;
// the 3D scene, the HUD and the page colour all read this single object.
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { BEATS, CUES, type CueKey, type Lang } from './content'

gsap.registerPlugin(ScrollTrigger)

interface Key { t: number; angle: number; lean: number; bend: number; vis: number }
const N = BEATS.length
const at = (i: number) => (i + 0.5) / N
const k = (t: number, angle: number, lean = 0, bend = 0, vis = 1): Key => ({ t, angle, lean, bend, vis })

// Each beat has a pose: what the coach would be looking at at that moment.
const KEYS: Key[] = [
  k(0, 0),
  k(at(0), 0), //            arm hangs
  k(at(1), 38), //           lifting
  k(at(2), 93), //           target reached
  k(at(3), 100, 22, 40), //  trunk leans, elbow bends: flagged
  k(at(4), 70, 0, 0, 0.3), // joints barely visible: SafeCue
  k(at(5), 0), //            settles
  k(1, 0),
]

const ease = (u: number) => u * u * (3 - 2 * u)

function sample(p: number) {
  let i = 0
  while (i < KEYS.length - 2 && p > KEYS[i + 1].t) i++
  const a = KEYS[i], b = KEYS[i + 1]
  const u = ease(Math.min(1, Math.max(0, (p - a.t) / (b.t - a.t))))
  const m = (x: number, y: number) => x + (y - x) * u
  return { angle: m(a.angle, b.angle), lean: m(a.lean, b.lean), bend: m(a.bend, b.bend), vis: m(a.vis, b.vis) }
}

export const S = {
  p: 0, target: 0, angle: 0, lean: 0, bend: 0, vis: 1, idle: 0, intro: 0,
  flag: false, ok: false, cue: 'ready' as CueKey, lang: 'en' as Lang, chapter: 0,
}

// Same decision order as core.py: confidence first, then lean, then elbow, then range.
function cueFor(): CueKey {
  if (S.vis < 0.6) return 'reposition'
  if (S.lean > 15) return 'lean'
  if (S.bend > 30 && S.angle > 45) return 'elbow'
  if (S.angle < 35) return 'ready'
  if (S.angle >= 90) return 'good'
  return S.angle < 60 ? 'raise' : 'higher'
}

const last: Record<string, string> = {}
const hud: Record<string, HTMLElement | null> = {}
function put(id: string, text: string) {
  if (last[id] === text) return
  last[id] = text
  const el = (hud[id] ??= document.getElementById(id))
  if (el) el.textContent = text
}

function writeHud() {
  put('hud-angle', String(Math.round(S.angle)).padStart(3, '0'))
  put('hud-cue', CUES[S.lang][S.cue])
  put('hud-chapter', BEATS[S.chapter])
  put('hud-index', `${String(S.chapter + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')}`)
  const bar = (hud['hud-bar'] ??= document.getElementById('hud-bar'))
  if (bar) bar.style.transform = `scaleX(${S.p.toFixed(4)})`
  const state = S.flag ? 'flag' : S.ok ? 'ok' : 'idle'
  if (last.state !== state) {
    last.state = state
    document.documentElement.dataset.state = state
  }
  const cue = hud['hud-cue']
  if (cue && cue.lang !== S.lang) cue.lang = S.lang
}

function step(dt: number) {
  S.p += (S.target - S.p) * (1 - Math.exp(-dt * 7))
  const s = sample(S.p)
  S.idle += dt
  const breath = Math.sin(S.idle * 1.1) * 1.4 * Math.min(1, s.angle / 20) // the arm never quite stops
  S.angle = Math.max(0, Math.max(s.angle, S.intro) + breath)
  S.lean = s.lean
  S.bend = s.bend
  S.vis = s.vis
  S.flag = S.lean > 15 || (S.bend > 30 && S.angle > 45)
  S.ok = !S.flag && S.vis >= 0.6 && S.angle >= 90
  S.cue = cueFor()
  S.chapter = Math.min(N - 1, Math.floor(S.p * N))
  writeHud()
}

export function setLang(l: Lang) {
  S.lang = l
  writeHud()
}

let render: ((ms: number) => void) | null = null
export const setRender = (f: ((ms: number) => void) | null) => { render = f }

export function start(): () => void {
  const lenis = new Lenis({ lerp: 0.1, anchors: true })
  lenis.on('scroll', ScrollTrigger.update)
  const tick = (time: number, ms: number) => {
    lenis.raf(time * 1000)
    step(Math.min(ms, 64) / 1000)
    render?.(time * 1000)
  }
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)

  const st = ScrollTrigger.create({
    trigger: '#hero', start: 'top top', end: 'bottom bottom',
    onUpdate: (self) => { S.target = self.progress },
  })
  S.target = st.progress

  // First frame: the arm lifts once and settles, so the page opens already counting.
  const intro = S.target < 0.01
    ? gsap.timeline({ delay: 0.5 })
        .to(S, { intro: 38, duration: 1.5, ease: 'power2.inOut' })
        .to(S, { intro: 0, duration: 1.4, ease: 'power2.inOut' }, '+=0.15')
    : null

  return () => {
    intro?.kill()
    gsap.ticker.remove(tick)
    st.kill()
    lenis.destroy()
    render = null
  }
}
