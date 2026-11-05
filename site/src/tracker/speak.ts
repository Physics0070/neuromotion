import { LANGS, type Lang } from '../content'

// Browser speech synthesis. Voices differ per device, so a missing voice means text only, never a stand-in language.
const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null)

export function voiceFor(lang: Lang): SpeechSynthesisVoice | null {
  const s = synth()
  if (!s) return null
  const tag = LANGS.find((l) => l.id === lang)!.tag.toLowerCase()
  const voices = s.getVoices()
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-')
  return (
    voices.find((v) => norm(v) === tag) ??
    voices.find((v) => norm(v).startsWith(tag.slice(0, 2))) ??
    null
  )
}

export function speak(lang: Lang, text: string): boolean {
  const s = synth()
  const v = voiceFor(lang)
  if (!s || !v) return false
  s.cancel() // latest cue wins
  const u = new SpeechSynthesisUtterance(text)
  u.voice = v
  u.lang = v.lang
  u.rate = 0.95
  s.speak(u)
  return true
}

export const silence = () => synth()?.cancel()
