/* Applies the saved or system theme before the first paint, so there is no flash. It is a file of its own, and not an
   inline script in index.html, because the Content Security Policy allows no inline script. */
try {
  var saved = window.localStorage.getItem('pb.theme')
  var dark = matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.dataset.theme = saved === 'dark' || saved === 'light' ? saved : dark ? 'dark' : 'light'
} catch (error) {
  document.documentElement.dataset.theme = 'light'
}
