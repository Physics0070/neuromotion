// Fills each built page with its real HTML. With SITE_URL set it also adds canonical links,
// absolute social-image URLs, a sitemap and a robots.txt that points at it.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const { pages } = await import(pathToFileURL(path.join(root, 'dist-ssr', 'entry-server.js')).href)
const site = (process.env.SITE_URL ?? '').replace(/\/+$/, '')

const files = {
  home: ['index.html', '/'],
  coach: ['coach/index.html', '/coach/'],
  progress: ['progress/index.html', '/progress/'],
  validate: ['validate/index.html', '/validate/'],
  review: ['review/index.html', '/review/'],
  legal: ['legal/index.html', '/legal/'],
  login: ['login/index.html', '/login/'],
}
for (const [name, [file, route]] of Object.entries(files)) {
  const target = path.join(root, 'dist', file)
  let html = await readFile(target, 'utf8')
  if (!html.includes('<div id="root"></div>')) throw new Error(`root placeholder not found in ${file}`)
  html = html.replace('<div id="root"></div>', `<div id="root">${pages[name]()}</div>`)
  if (site) {
    html = html
      .replace('</head>', `    <link rel="canonical" href="${site}${route}" />\n    <meta property="og:url" content="${site}${route}" />\n  </head>`)
      .replaceAll('content="/og.png"', `content="${site}/og.png"`)
  }
  await writeFile(target, html)
}

// A new build name makes the service worker drop the previous release's cache.
const sw = path.join(root, 'dist', 'sw.js')
await writeFile(sw, (await readFile(sw, 'utf8')).replace('__BUILD__', Date.now().toString(36)))

if (site) {
  const { contactEmail } = JSON.parse(await readFile(path.join(root, 'src', 'release.json'), 'utf8'))
  if (contactEmail) {
    await mkdir(path.join(root, 'dist', '.well-known'), { recursive: true })
    const expires = new Date(Date.now() + 365 * 864e5).toISOString()
    await writeFile(path.join(root, 'dist', '.well-known', 'security.txt'), `Contact: mailto:${contactEmail}
Expires: ${expires}
Preferred-Languages: en
Canonical: ${site}/.well-known/security.txt
`)
  }
  const urls = Object.values(files).map(([, route]) => `  <url><loc>${site}${route}</loc></url>`).join('\n')
  await writeFile(path.join(root, 'dist', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
  await writeFile(path.join(root, 'dist', 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`)
}
await rm(path.join(root, 'dist-ssr'), { recursive: true, force: true })
console.log(`prerendered ${Object.keys(files).length} pages${site ? ` for ${site}` : ' (set SITE_URL for canonical links and a sitemap)'}`)
