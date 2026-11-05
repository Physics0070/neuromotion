// Designed on purpose: what reduced-motion visitors and devices without WebGL see.
// A still frame of the same idea: the arm at the 90 degree target, with the protractor arc.
export default function Fallback() {
  const sh = { x: 130, y: 190 }
  const arc = Array.from({ length: 46 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 180
    return `${i === 0 ? 'M' : 'L'}${sh.x + Math.sin(a) * 74},${sh.y + Math.cos(a) * 74}`
  }).join(' ')
  return (
    <svg className="fallback" viewBox="0 0 480 520" role="img" aria-label="Side view of a body with the arm raised to 90 degrees, a protractor arc marking the angle.">
      <line x1={sh.x} y1="440" x2={sh.x} y2={sh.y} stroke="#2a2f3d" strokeWidth="26" strokeLinecap="round" />
      <circle cx={sh.x} cy="120" r="30" fill="none" stroke="#5a6072" strokeWidth="2" />
      <path d={arc} fill="none" stroke="#f2a33a" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" />
      <line x1={sh.x} y1={sh.y} x2={sh.x + 150} y2={sh.y} stroke="#f2a33a" strokeWidth="14" strokeLinecap="round" />
      <line x1={sh.x + 150} y1={sh.y} x2={sh.x + 262} y2={sh.y} stroke="#f2a33a" strokeWidth="11" strokeLinecap="round" />
      {[sh.x, sh.x + 150, sh.x + 262].map((x) => (
        <circle key={x} cx={x} cy={sh.y} r="11" fill="#f2a33a" />
      ))}
      <text x="200" y="440" fill="#f2a33a" fontFamily="IBM Plex Mono, monospace" fontSize="64">090°</text>
    </svg>
  )
}
