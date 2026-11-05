import { renderToString } from 'react-dom/server'
import Coach from './pages/Coach'
import Home from './pages/Home'
import Progress from './pages/Progress'
import Login from './pages/Login'
import Legal from './pages/Legal'
import Review from './pages/Review'
import Validate from './pages/Validate'

// Build-time only: every page ships its text, headings and landmarks as real HTML before any JavaScript runs.
export const pages = {
  home: () => renderToString(<Home />),
  coach: () => renderToString(<Coach />),
  progress: () => renderToString(<Progress />),
  validate: () => renderToString(<Validate />),
  review: () => renderToString(<Review />),
  legal: () => renderToString(<Legal />),
  login: () => renderToString(<Login />),
}
