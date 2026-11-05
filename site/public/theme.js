// Runs before the page paints, so the chosen theme never flashes. A separate file because the CSP forbids inline scripts.
(function () {
  var t = 'dark'
  try {
    var s = localStorage.getItem('cc.theme')
    t = s === 'light' || s === 'dark' ? s : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', t)
})()
