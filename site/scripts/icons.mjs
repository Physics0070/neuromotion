// One-off: renders the app icon (same mark as the favicon) to PNG. Run: node scripts/icons.mjs
import { chromium } from 'playwright'
import path from 'node:path'

const svg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32"><rect width="32" height="32" fill="#0a0b0f"/><path d="M11 24V9M11 9l11 8" stroke="#f2a33a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`
const browser = await chromium.launch()
for (const s of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: s, height: s } })
  await page.setContent(`<body style="margin:0">${svg(s)}</body>`)
  await page.screenshot({ path: path.join(import.meta.dirname, '..', 'public', `icon-${s}.png`) })
}
await browser.close()
console.log('icons written')
