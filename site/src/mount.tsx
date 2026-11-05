import './fonts'
import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

// A crash must never leave a blank page in front of someone mid-exercise. Nothing is logged or sent anywhere.
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="page" id="main">
        <h1 className="ptitle">Something went wrong.</h1>
        <p className="lead">Reload the page. Your saved sessions are safe on this device. If it keeps happening, tell the person who gave you this link.</p>
        <a className="btn" href="/coach/">Reload the coach</a>
      </main>
    )
  }
}

// Offline use: after the first visit the pages, the pose model and the scripts are kept by the service worker.
function registerOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
      const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.startsWith(location.origin))
      reg.active?.postMessage({ cache: urls }) // what this first page already loaded, so a reload works offline
    }).catch(() => {})
  })
}

// The build prerenders each page, so take over the existing markup instead of replacing it:
// the headline that was already painted stays painted.
export function mount(page: ReactNode) {
  const root = document.getElementById('root')!
  const app = <StrictMode><Boundary>{page}</Boundary></StrictMode>
  if (root.hasChildNodes()) hydrateRoot(root, app)
  else createRoot(root).render(app)
  registerOffline()
}
